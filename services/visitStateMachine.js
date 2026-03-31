const { VISIT_STATUS, ROLES } = require('../config/constants');
const { conflict, forbidden, badRequest } = require('../utils/errors');

const TERMINAL = new Set([VISIT_STATUS.CHECKED_OUT, VISIT_STATUS.DECLINED, VISIT_STATUS.EXPIRED]);

const ALLOWED_TRANSITIONS = {
  [VISIT_STATUS.SCHEDULED]: new Set([VISIT_STATUS.APPROVED, VISIT_STATUS.DECLINED, VISIT_STATUS.EXPIRED, VISIT_STATUS.ON_SITE]),
  [VISIT_STATUS.PENDING_APPROVAL]: new Set([VISIT_STATUS.APPROVED, VISIT_STATUS.DECLINED, VISIT_STATUS.EXPIRED]),
  [VISIT_STATUS.APPROVED]: new Set([VISIT_STATUS.ON_SITE, VISIT_STATUS.DECLINED, VISIT_STATUS.EXPIRED]),
  [VISIT_STATUS.ON_SITE]: new Set([VISIT_STATUS.CHECKED_OUT]),
  [VISIT_STATUS.CHECKED_OUT]: new Set(),
  [VISIT_STATUS.DECLINED]: new Set(),
  [VISIT_STATUS.EXPIRED]: new Set(),
};

function assertVisitTransition({ currentStatus, nextStatus, actorRole, overrideReason }) {
  if (!nextStatus || nextStatus === currentStatus) return;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || new Set();
  if (allowed.has(nextStatus)) {
    if (nextStatus === VISIT_STATUS.ON_SITE && actorRole === ROLES.KIOSK_OPERATOR) return;
    if (nextStatus === VISIT_STATUS.ON_SITE && actorRole !== ROLES.KIOSK_OPERATOR && actorRole !== ROLES.ADMIN && actorRole !== ROLES.EMPLOYEE) {
      throw forbidden('Only authorized staff can check visitors in');
    }
    return;
  }

  if (actorRole === ROLES.ADMIN && !TERMINAL.has(currentStatus) && overrideReason) {
    return;
  }

  if (actorRole === ROLES.ADMIN && !TERMINAL.has(currentStatus) && !overrideReason) {
    throw badRequest('transition_reason is required for exceptional status change');
  }

  throw conflict(`Invalid status transition: ${currentStatus} -> ${nextStatus}`);
}

module.exports = { assertVisitTransition };
