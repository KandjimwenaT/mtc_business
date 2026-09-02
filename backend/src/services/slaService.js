const SlaConfig = require("../models/SlaConfig");
const Ticket = require("../models/Ticket");
const TicketActivityLog = require("../models/TicketActivityLog");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Manager = require("../models/Manager");
const GM = require("../models/GM");
const { normalizeDepartmentSegment } = require("./departmentSegment");
const {
  createForUserIds,
  resolveManagerTeamNotificationUserIds,
} = require("./notificationService");

const REQUEST_TYPES = [
  { value: "request_meeting", label: "Request Meeting" },
  { value: "new_product_request", label: "New Product Request" },
  { value: "new_line", label: "New Line" },
  { value: "plan_change", label: "Plan Change" },
  { value: "line_suspension", label: "Line Suspension" },
  { value: "line_activation", label: "Line Activation" },
  { value: "plan_upgrade", label: "Plan Upgrade" },
  { value: "number_change", label: "Number Change" },
  { value: "renewal", label: "Renewal" },
  { value: "termination", label: "Termination" },
  { value: "upgrade", label: "Upgrade" },
  { value: "downgrade", label: "Downgrade" },
  { value: "change_ownership", label: "Change Ownership" },
  { value: "new_connection", label: "New Connection" },
  { value: "other", label: "Other" },
];

const COMPLAINT_TYPES = [
  { value: "billing", label: "Billing" },
  { value: "service", label: "Service" },
  { value: "network", label: "Network" },
  { value: "support", label: "Support" },
  { value: "technical", label: "Technical" },
  { value: "provisioning", label: "Provisioning" },
  { value: "qos", label: "QoS" },
  { value: "other", label: "Other" },
];

const REQUEST_TYPE_VALUES = new Set(REQUEST_TYPES.map((t) => t.value));
const COMPLAINT_TYPE_VALUES = new Set(COMPLAINT_TYPES.map((t) => t.value));

const REQUEST_PRIORITY_MAP = {
  request_meeting: "low",
  new_product_request: "low",
  new_line: "low",
  plan_change: "low",
  line_suspension: "high",
  line_activation: "medium",
  plan_upgrade: "low",
  number_change: "low",
  renewal: "low",
  termination: "high",
  upgrade: "low",
  downgrade: "low",
  change_ownership: "medium",
  new_connection: "low",
  other: "medium",
};

const COMPLAINT_PRIORITY_MAP = {
  billing: "medium",
  service: "medium",
  network: "high",
  support: "medium",
  technical: "high",
  provisioning: "medium",
  qos: "high",
  other: "medium",
};

const PRIORITY_TARGET_HOURS = { critical: 4, high: 8, medium: 24, low: 48 };
const OPEN_STATUSES = new Set(["new", "assigned", "in_progress", "escalated"]);

function canonicalizeDepartment(department) {
  const normalized = normalizeDepartmentSegment(department);
  if (normalized) return normalized;
  const raw = String(department || "").trim();
  return raw || null;
}

function resolvePriority(category, type) {
  if (category === "request") return REQUEST_PRIORITY_MAP[type] || "medium";
  return COMPLAINT_PRIORITY_MAP[type] || "medium";
}

function defaultPolicyForType(category, type) {
  const priority = resolvePriority(category, type);
  const targetHours = PRIORITY_TARGET_HOURS[priority] || 24;
  let warningHours = Math.max(1, Math.round(targetHours * 0.35));
  let atRiskHours = Math.max(1, Math.round(targetHours * 0.15));
  if (atRiskHours >= warningHours) {
    atRiskHours = warningHours > 1 ? warningHours - 1 : 1;
  }
  return {
    slaConfigId: null,
    category,
    ticketType: type,
    targetHours,
    warningHours,
    atRiskHours,
    escalateL1Hours: targetHours,
    escalateL2Hours: targetHours + 24,
    escalateL3Hours: targetHours + 48,
    autoEscalate: true,
    isDefault: true,
  };
}

function allowedTypesForCategory(category) {
  return category === "request" ? REQUEST_TYPE_VALUES : COMPLAINT_TYPE_VALUES;
}

function ticketTypeCatalog() {
  return { request: REQUEST_TYPES, complaint: COMPLAINT_TYPES };
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function sanitizePolicyInput(row, category, type) {
  const defaults = defaultPolicyForType(category, type);
  const targetHours = Math.max(1, parsePositiveInt(row.targetHours, defaults.targetHours));
  let warningHours = Math.max(0, parsePositiveInt(row.warningHours, defaults.warningHours));
  let atRiskHours = Math.max(0, parsePositiveInt(row.atRiskHours, defaults.atRiskHours));
  if (warningHours > targetHours) warningHours = targetHours;
  if (atRiskHours > warningHours) atRiskHours = warningHours;
  let escalateL1Hours = Math.max(1, parsePositiveInt(row.escalateL1Hours, defaults.escalateL1Hours));
  let escalateL2Hours = Math.max(escalateL1Hours, parsePositiveInt(row.escalateL2Hours, defaults.escalateL2Hours));
  let escalateL3Hours = Math.max(escalateL2Hours, parsePositiveInt(row.escalateL3Hours, defaults.escalateL3Hours));
  return {
    targetHours,
    warningHours,
    atRiskHours,
    escalateL1Hours,
    escalateL2Hours,
    escalateL3Hours,
    autoEscalate: row.autoEscalate !== false && row.autoEscalate !== "false" && row.autoEscalate !== 0,
  };
}

function serializeConfig(row, extras = {}) {
  return {
    slaConfigId: row.slaConfigId ?? null,
    department: row.department || extras.department || null,
    category: row.category,
    ticketType: row.ticketType,
    targetHours: row.targetHours,
    warningHours: row.warningHours,
    atRiskHours: row.atRiskHours,
    escalateL1Hours: row.escalateL1Hours,
    escalateL2Hours: row.escalateL2Hours,
    escalateL3Hours: row.escalateL3Hours,
    autoEscalate: row.autoEscalate !== false,
    isDefault: extras.isDefault === true,
    updatedAt: row.updatedAt || null,
  };
}

async function listPoliciesForDepartment(department) {
  const dept = canonicalizeDepartment(department);
  const stored = dept
    ? await SlaConfig.findAll({
        where: { department: dept },
        order: [
          ["category", "ASC"],
          ["ticket_type", "ASC"],
        ],
      })
    : [];
  const byKey = new Map(stored.map((row) => [`${row.category}:${row.ticketType}`, row]));

  const mergeCategory = (category, types) =>
    types.map((item) => {
      const existing = byKey.get(`${category}:${item.value}`);
      if (existing) {
        return { ...serializeConfig(existing, { department: dept, isDefault: false }), typeLabel: item.label };
      }
      return {
        ...serializeConfig(defaultPolicyForType(category, item.value), { department: dept, isDefault: true }),
        typeLabel: item.label,
      };
    });

  return {
    department: dept,
    configs: [...mergeCategory("complaint", COMPLAINT_TYPES), ...mergeCategory("request", REQUEST_TYPES)],
  };
}

async function savePoliciesForDepartment(department, configs, userId) {
  const dept = canonicalizeDepartment(department);
  if (!dept) {
    const err = new Error("Department is required to save SLA configuration");
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(configs) || !configs.length) {
    const err = new Error("At least one SLA rule is required");
    err.statusCode = 400;
    throw err;
  }

  const seen = new Set();
  for (const row of configs) {
    const category = row.category === "request" ? "request" : row.category === "complaint" ? "complaint" : null;
    const type = String(row.ticketType || "").trim();
    if (!category || !type) {
      const err = new Error("Each SLA rule needs a ticket category and type");
      err.statusCode = 400;
      throw err;
    }
    if (!allowedTypesForCategory(category).has(type)) {
      const err = new Error(`Invalid ${category} type: ${type}`);
      err.statusCode = 400;
      throw err;
    }
    const key = `${category}:${type}`;
    if (seen.has(key)) {
      const err = new Error(`Duplicate SLA rule for ${category} / ${type}`);
      err.statusCode = 400;
      throw err;
    }
    seen.add(key);

    const fields = sanitizePolicyInput(row, category, type);
    const existing = await SlaConfig.findOne({
      where: { department: dept, category, ticketType: type },
    });
    if (existing) {
      await existing.update({ ...fields, updatedByUserId: userId || null });
    } else {
      await SlaConfig.create({
        department: dept,
        category,
        ticketType: type,
        ...fields,
        updatedByUserId: userId || null,
      });
    }
  }

  return listPoliciesForDepartment(dept);
}

async function resolvePolicy({ department, category, type }) {
  const dept = canonicalizeDepartment(department);
  const safeCategory = category === "request" ? "request" : "complaint";
  const safeType = String(type || "other").trim();
  if (dept) {
    const match = await SlaConfig.findOne({
      where: { department: dept, category: safeCategory, ticketType: safeType },
    });
    if (match) {
      return serializeConfig(match, { isDefault: false });
    }
  }
  return serializeConfig(defaultPolicyForType(safeCategory, safeType), {
    department: dept,
    isDefault: true,
  });
}

function toTicketSlaFields(policy) {
  const targetHours = Math.max(1, Number(policy.targetHours) || 24);
  return {
    slaConfigId: policy.slaConfigId || null,
    slaTargetHours: targetHours,
    slaWarningHours: Number(policy.warningHours) || 0,
    slaAtRiskHours: Number(policy.atRiskHours) || 0,
    slaEscalateL1Hours: Number(policy.escalateL1Hours) || targetHours,
    slaEscalateL2Hours: Number(policy.escalateL2Hours) || targetHours + 24,
    slaEscalateL3Hours: Number(policy.escalateL3Hours) || targetHours + 48,
    slaAutoEscalate: policy.autoEscalate !== false,
    slaEscalationLevel: 0,
    slaDeadline: new Date(Date.now() + targetHours * 60 * 60 * 1000),
  };
}

function elapsedHoursSince(createdAt, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return (now - created) / 3_600_000;
}

function computeEscalationLevel(ticket, now = Date.now()) {
  if (!OPEN_STATUSES.has(ticket.status)) return Number(ticket.slaEscalationLevel) || 0;
  const elapsed = elapsedHoursSince(ticket.createdAt, now);
  const l3 = Number(ticket.slaEscalateL3Hours);
  const l2 = Number(ticket.slaEscalateL2Hours);
  const l1 = Number(ticket.slaEscalateL1Hours);
  if (Number.isFinite(l3) && elapsed >= l3) return 3;
  if (Number.isFinite(l2) && elapsed >= l2) return 2;
  if (Number.isFinite(l1) && elapsed >= l1) return 1;
  return 0;
}

function computeSlaState(ticket, now = Date.now()) {
  if (!ticket?.slaDeadline || ["resolved", "closed", "rejected"].includes(ticket.status)) {
    return { key: "closed", label: "—", remainingHours: null, elapsedHours: elapsedHoursSince(ticket?.createdAt, now) };
  }
  const deadline = new Date(ticket.slaDeadline).getTime();
  const remainingHours = (deadline - now) / 3_600_000;
  const elapsed = elapsedHoursSince(ticket.createdAt, now);
  const warningHours = ticket.slaWarningHours;
  const atRiskHours = ticket.slaAtRiskHours;
  if (remainingHours <= 0) {
    return { key: "breached", label: "Breached", remainingHours, elapsedHours: elapsed };
  }
  if (atRiskHours != null && Number.isFinite(Number(atRiskHours)) && remainingHours <= Number(atRiskHours)) {
    return { key: "at_risk", label: "At Risk", remainingHours, elapsedHours: elapsed };
  }
  if (warningHours != null && Number.isFinite(Number(warningHours)) && remainingHours <= Number(warningHours)) {
    return { key: "warning", label: "Warning", remainingHours, elapsedHours: elapsed };
  }
  const created = new Date(ticket.createdAt).getTime();
  const total = deadline - created;
  const pctRemaining = total > 0 ? (deadline - now) / total : 0;
  if (pctRemaining <= 0.15) return { key: "at_risk", label: "At Risk", remainingHours, elapsedHours: elapsed };
  if (pctRemaining <= 0.35) return { key: "warning", label: "Warning", remainingHours, elapsedHours: elapsed };
  return { key: "healthy", label: "On Track", remainingHours, elapsedHours: elapsed };
}

async function resolveGmUserIdForTicket(ticket) {
  if (!ticket?.executiveId) return null;
  const executive = await ExecutiveStaff.findByPk(ticket.executiveId);
  if (!executive?.managerId) return null;
  const manager = await Manager.findByPk(executive.managerId);
  if (!manager?.gmId) return null;
  const gm = await GM.findByPk(manager.gmId);
  return gm?.userId || null;
}

async function notifyEscalation(ticket, level) {
  const teamIds = await resolveManagerTeamNotificationUserIds(ticket.executiveId);
  let recipientIds = [];
  let title = `SLA Escalation L${level} - ${ticket.ticketNumber}`;
  let message = `${ticket.ticketNumber} reached SLA escalation level ${level}.`;

  if (level === 1) {
    recipientIds = teamIds;
    message = `${ticket.ticketNumber} has been escalated to the supervisor (L1).`;
  } else if (level === 2) {
    recipientIds = teamIds;
    message = `${ticket.ticketNumber} has been escalated to management (L2).`;
  } else if (level === 3) {
    const gmUserId = await resolveGmUserIdForTicket(ticket);
    recipientIds = gmUserId ? [gmUserId, ...teamIds] : teamIds;
    message = `${ticket.ticketNumber} has been escalated to the GM (L3).`;
  }

  if (!recipientIds.length) return;
  await createForUserIds(recipientIds, {
    type: "sla",
    title,
    message,
    priority: level >= 2 ? "high" : "normal",
    metadata: {
      ticketId: ticket.ticketId,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      kind: "ticket_sla_escalation",
      level,
    },
  });
}

async function applyAutoEscalations(tickets) {
  if (!tickets?.length) return tickets;
  const now = Date.now();

  for (const ticket of tickets) {
    if (!ticket?.slaAutoEscalate) continue;
    if (!OPEN_STATUSES.has(ticket.status)) continue;

    const desired = computeEscalationLevel(ticket, now);
    const current = Number(ticket.slaEscalationLevel) || 0;
    if (desired <= current) continue;

    const previousStatus = ticket.status;
    ticket.slaEscalationLevel = desired;
    if (desired >= 1 && ticket.status !== "escalated") {
      ticket.status = "escalated";
    }
    await ticket.save();

    try {
      await TicketActivityLog.create({
        ticketId: ticket.ticketId,
        actorUserId: ticket.createdByUserId || 1,
        actorName: "SLA Monitor",
        actorRole: "system",
        previousStatus,
        newStatus: ticket.status,
        actionTaken: `Auto-escalated to L${desired}`,
      });
    } catch (logError) {
      console.error("SLA auto-escalation activity log failed:", logError.message);
    }

    await notifyEscalation(ticket, desired);
  }

  return tickets;
}

module.exports = {
  REQUEST_TYPES,
  COMPLAINT_TYPES,
  ticketTypeCatalog,
  canonicalizeDepartment,
  resolvePriority,
  defaultPolicyForType,
  listPoliciesForDepartment,
  savePoliciesForDepartment,
  resolvePolicy,
  toTicketSlaFields,
  computeSlaState,
  computeEscalationLevel,
  applyAutoEscalations,
};
