const AuditLog = require("../models/AuditLog");
const { resolveRequesterDepartment } = require("./corporateSegmentScope");
const { normalizeDepartmentSegment } = require("./departmentSegment");

const VIEW_ROLES = new Set(["admin", "manager", "supervisor"]);

function actorDisplayName(user) {
  if (!user) return "Unknown";
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || user.email || "Unknown";
}

function clientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || null;
}

function requestPath(req) {
  return String(req?.originalUrl || req?.url || "")
    .split("?")[0]
    .replace(/\/+$/, "") || "/";
}

function pickEntityId(...candidates) {
  for (const value of candidates) {
    if (value == null || value === "") continue;
    return String(value);
  }
  return null;
}

function describeMutation(req, body) {
  const method = String(req.method || "").toUpperCase();
  const path = requestPath(req);
  const payload = req.body && typeof req.body === "object" ? req.body : {};
  const params = req.params || {};
  const result = body && typeof body === "object" ? body : {};

  const personName = [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim();
  const corporateName = payload.corporateName || result.corporate?.corporateName;
  const accountName = payload.accountName || result.account?.accountName;
  const leadCompany = payload.companyName || result.lead?.companyName;
  const ticketNumber = result.ticket?.ticketNumber || payload.ticketNumber;
  const visitNumber = result.visit?.visitNumber || payload.visitNumber;

  if (method === "POST" && /\/api\/admin\/persons$/.test(path)) {
    return {
      actionType: "User",
      entityType: "person",
      entityId: pickEntityId(result.person?.id, result.person?.accountManagerId),
      message: `Created ${payload.type || "user"}${personName ? ` ${personName}` : ""}${payload.email ? ` (${payload.email})` : ""}`,
      department: payload.department || null,
    };
  }
  if (method === "DELETE" && /\/api\/admin\/persons\/\d+$/.test(path)) {
    return {
      actionType: "User",
      entityType: "person",
      entityId: pickEntityId(params.personId),
      message: `Deleted directory user #${params.personId}`,
    };
  }
  if (method === "POST" && /\/api\/admin\/portal-access$/.test(path)) {
    return {
      actionType: "Portal Access",
      entityType: "user",
      entityId: pickEntityId(result.user?.id, payload.personId),
      message: `Granted portal access${result.user?.email ? ` to ${result.user.email}` : ""}`,
    };
  }
  if (method === "DELETE" && /\/api\/admin\/portal-users\/\d+$/.test(path)) {
    return {
      actionType: "Portal Access",
      entityType: "user",
      entityId: pickEntityId(params.userId),
      message: `Revoked portal access for user #${params.userId}`,
    };
  }
  if (method === "PUT" && /promote-supervisor$/.test(path)) {
    return {
      actionType: "Role",
      entityType: "person",
      entityId: pickEntityId(params.executivePersonId),
      message: `Promoted executive #${params.executivePersonId} to supervisor`,
    };
  }
  if (method === "PUT" && /demote-executive$/.test(path)) {
    return {
      actionType: "Role",
      entityType: "person",
      entityId: pickEntityId(params.supervisorPersonId),
      message: `Demoted supervisor #${params.supervisorPersonId} to executive`,
    };
  }
  if (method === "POST" && /complete-onboarding$/.test(path)) {
    return {
      actionType: "User",
      entityType: "executive",
      entityId: pickEntityId(params.executiveId),
      message: `Completed onboarding for imported executive #${params.executiveId}`,
    };
  }
  if (method === "POST" && /\/api\/admin\/imports\/key-accounts$/.test(path)) {
    return {
      actionType: "Import",
      entityType: "import",
      entityId: pickEntityId(result.jobId),
      message: "Started Key Accounts Excel import",
      department: "Key Accounts",
    };
  }
  if (method === "POST" && /\/api\/admin\/imports\/ebu$/.test(path)) {
    return {
      actionType: "Import",
      entityType: "import",
      entityId: pickEntityId(result.jobId),
      message: "Started EBU Excel import",
      department: "EBU",
    };
  }
  if (method === "POST" && /\/api\/admin\/corporates$/.test(path)) {
    return {
      actionType: "Corporate",
      entityType: "corporate",
      entityId: pickEntityId(result.corporate?.corporateId),
      message: `Created corporate${corporateName ? ` ${corporateName}` : ""}`,
    };
  }
  if (method === "PUT" && /\/api\/admin\/corporates\/\d+\/approve$/.test(path)) {
    return {
      actionType: "Corporate",
      entityType: "corporate",
      entityId: pickEntityId(params.corporateId),
      message: `Approved corporate #${params.corporateId}`,
    };
  }
  if (method === "PUT" && /reassign-executive$/.test(path)) {
    return {
      actionType: "Corporate",
      entityType: "corporate",
      entityId: pickEntityId(params.corporateId),
      message: `Reassigned executive for corporate #${params.corporateId}`,
    };
  }
  if (method === "POST" && /\/api\/admin\/corporates\/\d+\/submit-approval$/.test(path)) {
    return {
      actionType: "Corporate",
      entityType: "corporate",
      entityId: pickEntityId(params.corporateId),
      message: `Submitted corporate #${params.corporateId} for approval`,
    };
  }
  if (method === "POST" && /\/contact-persons\/new$/.test(path)) {
    return {
      actionType: "Corporate",
      entityType: "contact_person",
      entityId: pickEntityId(params.corporateId),
      message: `Created contact person for corporate #${params.corporateId}`,
    };
  }
  if (method === "POST" && /\/contact-persons$/.test(path)) {
    return {
      actionType: "Corporate",
      entityType: "contact_person",
      entityId: pickEntityId(params.corporateId, payload.accountManagerId),
      message: `Assigned contact person to corporate #${params.corporateId}`,
    };
  }
  if (method === "DELETE" && /\/contact-persons\/\d+$/.test(path)) {
    return {
      actionType: "Corporate",
      entityType: "contact_person",
      entityId: pickEntityId(params.accountManagerId),
      message: `Removed contact person #${params.accountManagerId} from corporate #${params.corporateId}`,
    };
  }
  if (method === "POST" && /\/api\/admin\/accounts$/.test(path)) {
    return {
      actionType: "Account",
      entityType: "account",
      entityId: pickEntityId(result.account?.accountId),
      message: `Created account${accountName ? ` ${accountName}` : ""}`,
    };
  }
  if (method === "PUT" && /\/api\/admin\/accounts\/\d+\/approve$/.test(path)) {
    return {
      actionType: "Account",
      entityType: "account",
      entityId: pickEntityId(params.accountId),
      message: `Approved account #${params.accountId}`,
    };
  }
  if (method === "POST" && /\/contracts$/.test(path)) {
    return {
      actionType: "Contract",
      entityType: "contract",
      entityId: pickEntityId(result.contract?.contractId, params.accountId),
      message: `Created contract for account #${params.accountId}`,
    };
  }
  if (method === "POST" && /\/services$/.test(path)) {
    return {
      actionType: "Service",
      entityType: "service",
      entityId: pickEntityId(result.service?.serviceId, params.accountId),
      message: `Added service to account #${params.accountId}`,
    };
  }
  if (method === "PUT" && /\/services\/\d+$/.test(path)) {
    return {
      actionType: "Service",
      entityType: "service",
      entityId: pickEntityId(params.serviceId),
      message: `Updated service #${params.serviceId} on account #${params.accountId}`,
    };
  }
  if (method === "DELETE" && /\/services\/\d+$/.test(path)) {
    return {
      actionType: "Service",
      entityType: "service",
      entityId: pickEntityId(params.serviceId),
      message: `Deleted service #${params.serviceId} from account #${params.accountId}`,
    };
  }
  if (method === "POST" && /\/invoices$/.test(path)) {
    return {
      actionType: "Invoice",
      entityType: "invoice",
      entityId: pickEntityId(result.invoice?.invoiceId, params.accountId),
      message: `Created invoice for account #${params.accountId}`,
    };
  }
  if (method === "POST" && /\/api\/leads$/.test(path)) {
    return {
      actionType: "Lead",
      entityType: "lead",
      entityId: pickEntityId(result.lead?.leadId),
      message: `Created lead${leadCompany ? ` for ${leadCompany}` : ""}`,
      department: "EBU",
    };
  }
  if (method === "POST" && /\/api\/tickets$/.test(path)) {
    return {
      actionType: "Ticket",
      entityType: "ticket",
      entityId: pickEntityId(result.ticket?.ticketId, result.ticket?.ticketNumber),
      message: `Created ticket${ticketNumber ? ` ${ticketNumber}` : ""}${payload.title ? `: ${payload.title}` : ""}`,
    };
  }
  if (method === "PUT" && /\/api\/tickets\/\d+$/.test(path)) {
    return {
      actionType: "Ticket",
      entityType: "ticket",
      entityId: pickEntityId(params.ticketId),
      message: `Updated ticket #${params.ticketId}${payload.status ? ` to ${payload.status}` : ""}`,
    };
  }
  if (method === "POST" && /\/internal-notes$/.test(path)) {
    return {
      actionType: "Ticket",
      entityType: "ticket",
      entityId: pickEntityId(params.ticketId),
      message: `Added internal note to ticket #${params.ticketId}`,
    };
  }
  if (method === "POST" && /\/api\/visits$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "visit",
      entityId: pickEntityId(result.visit?.visitId, visitNumber),
      message: `Scheduled visit${visitNumber ? ` ${visitNumber}` : ""}`,
    };
  }
  if (method === "PUT" && /\/respond$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "visit",
      entityId: pickEntityId(params.visitId),
      message: `Responded to visit #${params.visitId}${payload.status ? ` (${payload.status})` : ""}`,
    };
  }
  if (method === "PUT" && /request-reschedule$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "visit",
      entityId: pickEntityId(params.visitId),
      message: `Requested reschedule for visit #${params.visitId}`,
    };
  }
  if (method === "PUT" && /approve-reschedule$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "visit",
      entityId: pickEntityId(params.visitId),
      message: `Processed reschedule for visit #${params.visitId}`,
    };
  }
  if (method === "PATCH" && /meeting-start$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "visit",
      entityId: pickEntityId(params.visitId),
      message: `Recorded meeting start for visit #${params.visitId}`,
    };
  }
  if ((method === "PUT" || method === "PATCH") && /control-card$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "control_card",
      entityId: pickEntityId(params.visitId),
      message: `${method === "PUT" ? "Submitted" : "Updated"} control card for visit #${params.visitId}`,
    };
  }
  if (method === "PUT" && /\/rating$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "visit",
      entityId: pickEntityId(params.visitId),
      message: `Submitted rating for visit #${params.visitId}`,
    };
  }
  if (method === "PUT" && /\/api\/visits\/\d+$/.test(path)) {
    return {
      actionType: "Visit",
      entityType: "visit",
      entityId: pickEntityId(params.visitId),
      message: `Updated visit #${params.visitId}${payload.status ? ` to ${payload.status}` : ""}`,
    };
  }
  if (method === "POST" && /\/api\/complaints$/.test(path)) {
    return {
      actionType: "Complaint",
      entityType: "complaint",
      entityId: pickEntityId(result.complaint?.complaintId),
      message: `Submitted complaint${payload.title ? `: ${payload.title}` : ""}`,
    };
  }
  if (method === "PUT" && /\/api\/complaints\/\d+$/.test(path)) {
    return {
      actionType: "Complaint",
      entityType: "complaint",
      entityId: pickEntityId(params.complaintId),
      message: `Updated complaint #${params.complaintId}${payload.status ? ` to ${payload.status}` : ""}`,
    };
  }
  if (method === "POST" && /\/api\/account-requests$/.test(path)) {
    return {
      actionType: "Account Request",
      entityType: "account_request",
      entityId: pickEntityId(result.request?.requestId, result.accountRequest?.requestId),
      message: `Submitted account request${payload.title ? `: ${payload.title}` : ""}`,
    };
  }
  if (method === "PUT" && /\/api\/account-requests\/\d+$/.test(path)) {
    return {
      actionType: "Account Request",
      entityType: "account_request",
      entityId: pickEntityId(params.requestId),
      message: `Updated account request #${params.requestId}${payload.status ? ` to ${payload.status}` : ""}`,
    };
  }
  if (method === "POST" && /\/api\/notifications\/broadcast$/.test(path)) {
    return {
      actionType: "Notification",
      entityType: "notification",
      entityId: null,
      message: `Broadcast notification${payload.title ? `: ${payload.title}` : ""}`,
    };
  }
  if ((method === "PUT" || method === "POST") && /\/api\/sla-configs/.test(path)) {
    return {
      actionType: "SLA",
      entityType: "sla_config",
      entityId: pickEntityId(result.department),
      message: `Updated SLA configuration${result.department ? ` for ${result.department}` : ""}`,
    };
  }

  return {
    actionType: "System",
    entityType: null,
    entityId: null,
    message: result.message || `${method} ${path}`,
  };
}

function shouldSkipRequest(req) {
  const method = String(req.method || "").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;

  const path = requestPath(req);
  if (/\/api\/audit-logs/.test(path)) return true;
  if (/\/api\/auth\/(refresh-token|otp|microsoft)/.test(path)) return true;
  if (method === "PATCH" && /\/api\/notifications(\/read-all|\/\d+\/read)$/.test(path)) return true;
  return false;
}

async function recordAudit(entry = {}) {
  try {
    let department = entry.department ?? null;
    if (department == null && entry.user) {
      department = await resolveRequesterDepartment(entry.user);
    }
    department = normalizeDepartmentSegment(department) || department || null;

    const user = entry.user || null;
    await AuditLog.create({
      actorUserId: entry.actorUserId ?? user?.id ?? null,
      actorName: entry.actorName || actorDisplayName(user),
      actorEmail: entry.actorEmail ?? user?.email ?? null,
      actorRole: entry.actorRole ?? user?.role ?? null,
      department,
      actionType: entry.actionType || "System",
      entityType: entry.entityType || null,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      message: entry.message || "Activity recorded",
      ipAddress: entry.ipAddress || null,
      metadata: entry.metadata || null,
    });
  } catch (error) {
    console.error("[audit] Failed to record audit log:", error.message);
  }
}

async function recordFromRequest(req, body) {
  if (!req?.user || shouldSkipRequest(req)) return;
  const described = describeMutation(req, body);
  await recordAudit({
    user: req.user,
    department: described.department,
    actionType: described.actionType,
    entityType: described.entityType,
    entityId: described.entityId,
    message: described.message,
    ipAddress: clientIp(req),
    metadata: {
      method: req.method,
      path: requestPath(req),
    },
  });
}

module.exports = {
  VIEW_ROLES,
  actorDisplayName,
  clientIp,
  recordAudit,
  recordFromRequest,
  shouldSkipRequest,
};
