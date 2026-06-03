const { badRequest } = require('../utils/errors');
const { recordAudit } = require('../services/auditLog');
const { getAnalyticsSummary, getAnalyticsWindowDays } = require('../services/analyticsAggregate');
const { csvSafe } = require('../utils/csvSafe');

function parseDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function countAnalyticsCsvRows(summary) {
  let count = 7;
  count += summary.peakHours?.length || 0;
  count += summary.reasonBreakdown?.length || 0;
  count += summary.hostRanking?.length || 0;
  return count;
}

async function getSummary(req, res, next) {
  try {
    const summary = await getAnalyticsSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function exportAnalytics(req, res, next) {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    if (!['json', 'csv'].includes(format)) {
      throw badRequest('format must be json or csv');
    }
    const from = parseDateOrNull(req.query.from);
    const to = parseDateOrNull(req.query.to);
    if ((req.query.from && !from) || (req.query.to && !to)) {
      throw badRequest('Invalid from/to date. Use ISO date values.');
    }

    const windowDays = getAnalyticsWindowDays();
    const summary = await getAnalyticsSummary({
      windowDays,
      from: from || undefined,
      to: to || undefined,
    });

    const rowsExported = format === 'csv' ? countAnalyticsCsvRows(summary) : 1;

    await recordAudit(req, {
      action: 'analytics_export',
      resourceType: 'Analytics',
      resourceId: null,
      metadata: {
        format,
        window_days: windowDays,
        rows_exported: rowsExported,
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
        summary: 'Anonymised analytics export',
      },
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics-summary.json"');
      return res.send(JSON.stringify(summary, null, 2));
    }

    const lines = [
      'section,key,value',
      `meta,windowDays,${csvSafe(summary.windowDays)}`,
      `meta,generatedAt,${csvSafe(summary.generatedAt)}`,
      `summary,onSiteCount,${csvSafe(summary.summary.onSiteCount)}`,
      `summary,expectedToday,${csvSafe(summary.summary.expectedToday)}`,
      `summary,todayCheckIns,${csvSafe(summary.summary.todayCheckIns)}`,
      `summary,avgVisitDurationMinutes,${csvSafe(summary.summary.avgVisitDurationMinutes)}`,
      `summary,walkInCount,${csvSafe(summary.summary.walkInCount)}`,
    ];
    summary.peakHours.forEach((row) => {
      lines.push(`peakHours,${csvSafe(row.hour)},${csvSafe(row.count)}`);
    });
    summary.reasonBreakdown.forEach((row) => {
      lines.push(`reason,${csvSafe(row.reason)},${csvSafe(row.count)}`);
    });
    summary.hostRanking.forEach((row) => {
      lines.push(`hostRanking,${csvSafe(row.label)},${csvSafe(row.visitorCount)}`);
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-summary.csv"');
    return res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, exportAnalytics };
