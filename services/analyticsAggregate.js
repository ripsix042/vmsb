const Visit = require('../models/Visit');
const { VISIT_STATUS } = require('../config/constants');

const EXPIRABLE_STATUSES = [
  VISIT_STATUS.SCHEDULED,
  VISIT_STATUS.PENDING_APPROVAL,
  VISIT_STATUS.APPROVED,
  'expected',
  'pending',
  'confirmed',
];

function getAnalyticsWindowDays() {
  const raw = Number(process.env.ANALYTICS_RETENTION_DAYS || 365);
  return Math.max(30, Math.min(1095, Number.isFinite(raw) ? raw : 365));
}

function buildWindowSince(windowDays) {
  return new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
}

function buildWindowFilter(since) {
  return {
    $or: [
      { checkInTime: { $gte: since } },
      { checkInTime: null, scheduledStart: { $gte: since } },
      { checkInTime: null, scheduledStart: null, createdAt: { $gte: since } },
    ],
  };
}

function isNoShowVisit(visit) {
  if (!EXPIRABLE_STATUSES.includes(visit.status)) return false;
  if (visit.checkInTime) return false;
  const scheduled = visit.scheduledEnd || visit.scheduledStart || visit.createdAt;
  if (!scheduled) return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return new Date(scheduled).getTime() < todayStart.getTime();
}

function aggregateVisits(visits, windowDays) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const filtered = visits.filter((v) => !isNoShowVisit(v));

  const onSiteCount = filtered.filter((v) => v.status === VISIT_STATUS.ON_SITE).length;
  const todayCheckIns = filtered.filter(
    (v) => v.checkInTime && new Date(v.checkInTime) >= todayStart
  ).length;
  const expectedToday = filtered.filter((v) => {
    if (v.status !== VISIT_STATUS.SCHEDULED && !EXPIRABLE_STATUSES.includes(v.status)) return false;
    if (v.status === VISIT_STATUS.ON_SITE || v.status === VISIT_STATUS.CHECKED_OUT) return false;
    const scheduled = v.scheduledStart || v.createdAt;
    if (!scheduled) return false;
    const d = new Date(scheduled);
    return d >= todayStart && d <= todayEnd;
  }).length;

  const hourCounts = {};
  filtered.forEach((v) => {
    if (!v.checkInTime) return;
    const hour = new Date(v.checkInTime).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const peakHours = [];
  for (let h = 8; h <= 18; h++) {
    const hour12 = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? 'PM' : 'AM';
    peakHours.push({ hour: `${hour12}${ampm}`, count: hourCounts[h] || 0 });
  }

  const hostCounts = {};
  filtered.forEach((v) => {
    const key = v.hostId ? v.hostId.toString() : 'unknown';
    hostCounts[key] = (hostCounts[key] || 0) + 1;
  });
  const hostRanking = Object.values(hostCounts)
    .sort((a, b) => b - a)
    .slice(0, 5)
    .map((visitorCount, index) => ({
      rank: index + 1,
      label: `Host ${index + 1}`,
      visitorCount,
    }));

  const reasonCounts = {};
  filtered.forEach((v) => {
    const reason = v.reason || 'other';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  });
  const reasonBreakdown = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const completedVisits = filtered.filter((v) => v.checkInTime && v.checkOutTime);
  let avgVisitDurationMinutes = 0;
  if (completedVisits.length > 0) {
    const totalMinutes = completedVisits.reduce((sum, v) => {
      const mins = (new Date(v.checkOutTime).getTime() - new Date(v.checkInTime).getTime()) / 60000;
      return sum + mins;
    }, 0);
    avgVisitDurationMinutes = Math.round(totalMinutes / completedVisits.length);
  }

  const walkInCount = filtered.filter((v) => v.checkInTime).length;

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    peakHours,
    reasonBreakdown,
    hostRanking,
    summary: {
      onSiteCount,
      expectedToday,
      todayCheckIns,
      avgVisitDurationMinutes,
      walkInCount,
    },
  };
}

async function loadVisitsInWindow({ windowDays, from, to } = {}) {
  const retentionDays = windowDays || getAnalyticsWindowDays();
  const since = from || buildWindowSince(retentionDays);
  const filter = buildWindowFilter(since);
  if (to) {
    filter.$and = [
      {
        $or: [
          { checkInTime: { $lte: to } },
          { checkInTime: null, scheduledStart: { $lte: to } },
          { checkInTime: null, scheduledStart: null, createdAt: { $lte: to } },
        ],
      },
    ];
  }
  return Visit.find(filter)
    .select('hostId reason status scheduledStart scheduledEnd checkInTime checkOutTime createdAt visitType')
    .lean();
}

async function getAnalyticsSummary(options = {}) {
  const windowDays = options.windowDays || getAnalyticsWindowDays();
  const visits = await loadVisitsInWindow(options);
  return aggregateVisits(visits, windowDays);
}

module.exports = {
  getAnalyticsWindowDays,
  getAnalyticsSummary,
  aggregateVisits,
};
