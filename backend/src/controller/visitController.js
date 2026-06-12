const { Op } = require("sequelize");
const Visit = require("../models/Visit");
const Account = require("../models/Account");
const AccountManager = require("../models/AccountManager");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Manager = require("../models/Manager");
const ControlCard = require("../models/ControlCard");
const Corporate = require("../models/Corporate");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { createForUserIds, resolveManagerTeamNotificationUserIds } = require("../services/notificationService");
const emailService = require("../services/emailService");
const {
  getAccountsForCustomerUser,
  getAccountManagerIdsForCorporate,
} = require("../services/contactPersonService");
const { sequelize } = require("../config/database");
const {
  createVisitActionItemTicket,
  sendTicketCreationNotifications,
} = require("./ticketController");
const { resolveAttendeeRecipients } = require("../services/visitRecipientService");
const { syncVisitCalendarInvites } = require("../services/visitCalendarInviteService");
const {
  resolveGmProfile,
  buildGmVisitWhereClause,
  resolveGmExecutiveIds,
} = require("../services/gmScope");

const VISIT_ACTION_REQUEST_TYPES = new Set([
  "request_meeting", "new_product_request", "new_line", "plan_change", "line_suspension", "line_activation",
  "plan_upgrade", "number_change", "renewal", "termination",
  "upgrade", "downgrade", "change_ownership", "new_connection", "other",
]);
const VISIT_ACTION_COMPLAINT_TYPES = new Set([
  "billing", "service", "network", "support", "technical", "provisioning", "qos", "other",
]);

/** Build ticket payload from an AVR action-item row; returns null if the row should not create a ticket. */
function ticketDetailsFromVisitActionItem(actionItem, visit) {
  const item = String(actionItem.item || actionItem.action || "").trim();
  if (!item) return null;

  const qty = String(actionItem.quantity ?? "").trim();
  const due = String(actionItem.dueDate || "").trim();
  const owner = String(actionItem.owner || "").trim();
  const notes = String(actionItem.notes || "").trim();
  const category = actionItem.category === "complaint" ? "complaint" : "request";

  let type = String(actionItem.requestType || "").trim();
  if (!type) {
    type = category === "complaint" ? "other" : "new_product_request";
  }
  if (category === "request" && !VISIT_ACTION_REQUEST_TYPES.has(type)) type = "other";
  if (category === "complaint" && !VISIT_ACTION_COMPLAINT_TYPES.has(type)) type = "other";

  const title = [item, qty ? `Qty ${qty}` : null].filter(Boolean).join(" · ").slice(0, 200);
  const description = [
    `Request / issue: ${item}`,
    qty && `Quantity: ${qty}`,
    due && `Target due date: ${due}`,
    owner && `Internal owner / follow-up: ${owner}`,
    notes && `Notes: ${notes}`,
    "",
    `Raised from Account Visit Report — visit ${visit.visitNumber} (${visit.visitDate}).`,
  ]
    .filter(Boolean)
    .join("\n");

  const sourceContextNote = `AVR action item · Visit ${visit.visitNumber}`;
  return { category, type, title, description, sourceContextNote };
}

const hasExecutiveScope = (role) => ["executive_staff", "supervisor"].includes(role);

async function pushVisitCalendarSync(visit, options = {}) {
  try {
    await syncVisitCalendarInvites(visit, options);
  } catch (err) {
    console.error(`Visit calendar sync failed (${visit?.visitNumber}):`, err?.message || err);
  }
}

// Generate next visit number: VIS-00001
async function generateVisitNumber() {
  const last = await Visit.findOne({ order: [["visit_id", "DESC"]] });
  let nextNum = 1;
  if (last && last.visitNumber) {
    const num = parseInt(last.visitNumber.split("-")[1], 10);
    if (!isNaN(num)) nextNum = num + 1;
  }
  return `VIS-${String(nextNum).padStart(5, "0")}`;
}

async function getCustomerCorporateAccounts(userEmail) {
  // Spans every corporate the customer is linked to (legacy primary
  // AccountManager.corporateId + corporate_contact_persons junction table).
  return getAccountsForCustomerUser(userEmail);
}

async function resolveCustomerUserIdsByCorporateId(corporateId) {
  // Returns the user-ids of every contact person (with portal access)
  // currently linked to this corporate (legacy + junction).
  if (!corporateId) return [];
  const amIds = await getAccountManagerIdsForCorporate(corporateId);
  if (amIds.length === 0) return [];

  const accountManagers = await AccountManager.findAll({
    where: { accountManagerId: amIds },
  });
  const emails = accountManagers.map((am) => am.email).filter(Boolean);
  if (emails.length === 0) return [];

  const customerUsers = await User.findAll({
    where: { role: "customer", email: { [Op.in]: emails } },
    attributes: ["id"],
  });
  return customerUsers.map((u) => u.id);
}

function combineVisitDateTime(visitDate, startTime) {
  if (!visitDate || !startTime) return null;
  const dt = new Date(`${visitDate}T${startTime}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function createNotificationIfMissing(userId, payload) {
  if (!userId) return;
  const exists = await Notification.findOne({
    where: {
      userId,
      type: payload.type,
      title: payload.title,
    },
  });
  if (!exists) {
    await createForUserIds([userId], payload);
  }
}

async function sendVisitReminderAndOverdueAlerts(visits) {
  if (!visits || !visits.length) return;

  const now = new Date();
  const accountIds = [...new Set(visits.map((v) => v.accountId).filter(Boolean))];
  const executiveIds = [...new Set(visits.map((v) => v.executiveId).filter(Boolean))];

  const accounts = await Account.findAll({
    where: { accountId: { [Op.in]: accountIds } },
    attributes: ["accountId", "corporateId"],
  });
  const accountToCorporateId = new Map(accounts.map((a) => [a.accountId, a.corporateId]));

  const execRows = await ExecutiveStaff.findAll({
    where: { executiveId: { [Op.in]: executiveIds } },
    attributes: ["executiveId", "userId"],
  });
  const executiveToUserId = new Map(execRows.map((e) => [e.executiveId, e.userId]));

  const corporateIds = [...new Set(accounts.map((a) => a.corporateId).filter(Boolean))];
  const customerByCorporateId = new Map();
  await Promise.all(
    corporateIds.map(async (corpId) => {
      const customerUserIds = await resolveCustomerUserIdsByCorporateId(corpId);
      customerByCorporateId.set(corpId, customerUserIds);
    })
  );

  for (const visit of visits) {
    const visitStart = combineVisitDateTime(visit.visitDate, visit.startTime);
    if (!visitStart) continue;

    const msToStart = visitStart.getTime() - now.getTime();
    const hoursToStart = msToStart / (1000 * 60 * 60);
    const isActiveVisit = ["pending", "approved", "confirmed", "rescheduled"].includes(visit.status);
    const isReminderWindow = isActiveVisit && hoursToStart > 0 && hoursToStart <= 24;
    const isOverdue = isActiveVisit && msToStart < 0;
    if (!isReminderWindow && !isOverdue) continue;

    const corporateId = accountToCorporateId.get(visit.accountId);
    const customerUserIds = customerByCorporateId.get(corporateId) || [];
    const executiveUserId = executiveToUserId.get(visit.executiveId) || null;
    const managerTeamIds = await resolveManagerTeamNotificationUserIds(visit.executiveId);
    const targets = [...customerUserIds, executiveUserId, ...managerTeamIds].filter(Boolean);
    if (!targets.length) continue;

    if (isReminderWindow) {
      const payload = {
        type: "visit",
        title: `Visit Reminder - ${visit.visitNumber}`,
        message: `${visit.accountName}: upcoming visit on ${visit.visitDate} at ${visit.startTime}.`,
        priority: "normal",
        metadata: { visitId: visit.visitId, visitNumber: visit.visitNumber, kind: "reminder_24h" },
      };
      await Promise.all(targets.map((userId) => createNotificationIfMissing(userId, payload)));
    }

    if (isOverdue) {
      const payload = {
        type: "visit",
        title: `Visit Overdue - ${visit.visitNumber}`,
        message: `${visit.accountName}: scheduled visit at ${visit.startTime} on ${visit.visitDate} was not started and is overdue.`,
        priority: "high",
        metadata: { visitId: visit.visitId, visitNumber: visit.visitNumber, kind: "overdue" },
      };
      await Promise.all(targets.map((userId) => createNotificationIfMissing(userId, payload)));
    }
  }
}

// Executive creates a visit / meeting
exports.createVisit = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only executive or supervisor users can schedule visits" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const { accountId, corporateId, meetingType, purpose, agenda, visitDate, startTime, endTime, location, onlineLink, attendees } = req.body;

    if ((!corporateId && !accountId) || !meetingType || !purpose || !visitDate || !startTime || !endTime) {
      return res.status(400).json({ status: "Failed", message: "corporateId (or accountId), meetingType, purpose, visitDate, startTime and endTime are required" });
    }

    if (!["online", "in_person"].includes(meetingType)) {
      return res.status(400).json({ status: "Failed", message: "meetingType must be 'online' or 'in_person'" });
    }

    // Corporate-first scheduling:
    // resolve a corporate assigned to this executive, then pick one account under it
    // to maintain backward compatibility with existing visit/control-card schemas.
    let selectedCorporate = null;
    let account = null;

    if (corporateId) {
      selectedCorporate = await Corporate.findOne({
        where: { corporateId: Number(corporateId), executiveId: exec.executiveId },
      });
      if (!selectedCorporate) {
        return res.status(404).json({ status: "Failed", message: "Corporate not found or not assigned to you" });
      }

      account = await Account.findOne({
        where: { corporateId: selectedCorporate.corporateId },
        order: [["created_at", "ASC"]],
      });
      if (!account) {
        return res.status(404).json({ status: "Failed", message: "No accounts found under this corporate" });
      }
    } else {
      account = await Account.findOne({ where: { accountId, executiveId: exec.executiveId } });
      if (!account) {
        return res.status(404).json({ status: "Failed", message: "Account not found or not assigned to you" });
      }
      if (account.corporateId) {
        selectedCorporate = await Corporate.findByPk(account.corporateId);
      }
    }

    const visitNumber = await generateVisitNumber();

    const visit = await Visit.create({
      visitNumber,
      accountId: account.accountId,
      executiveId: exec.executiveId,
      executiveName: `${exec.firstName} ${exec.lastName}`,
      executiveEmail: exec.email,
      accountName: selectedCorporate?.corporateName || account.accountName,
      meetingType,
      purpose,
      agenda: agenda || null,
      visitDate,
      startTime,
      endTime,
      location: location || null,
      onlineLink: onlineLink || null,
      attendees: attendees || [],
      status: "pending",
    });

    const customerUserIds = await resolveCustomerUserIdsByCorporateId(account.corporateId);
    const managerTeamIds = await resolveManagerTeamNotificationUserIds(visit.executiveId);

    const attendeeRecipients = await resolveAttendeeRecipients(exec, visit.attendees);
    const attendeeUserIdSet = new Set(
      attendeeRecipients.map((r) => r.userId).filter(Boolean)
    );

    // General "Visit Scheduled" notification: customer contacts + manager team
    // (excluding anyone who is being notified separately as a selected attendee
    // so they don't receive two notifications for the same visit).
    const generalRecipientIds = [...customerUserIds, ...managerTeamIds].filter(
      (id) => !attendeeUserIdSet.has(id)
    );
    await createForUserIds(generalRecipientIds, {
      type: "visit",
      title: `Visit Scheduled - ${visit.visitNumber}`,
      message: `${visit.accountName}: ${visit.purpose} on ${visit.visitDate} at ${visit.startTime}.`,
      priority: "normal",
      metadata: {
        visitId: visit.visitId,
        visitNumber: visit.visitNumber,
        accountId: visit.accountId,
      },
    });

    // Attendee-specific "You've been invited" notification + email.
    if (attendeeRecipients.length > 0) {
      const organizerName = `${exec.firstName || ""} ${exec.lastName || ""}`.trim() || "A teammate";

      await createForUserIds(
        attendeeRecipients.map((r) => r.userId).filter(Boolean),
        {
          type: "visit",
          title: `Meeting Invitation - ${visit.visitNumber}`,
          message: `${organizerName} added you as an attendee for ${visit.accountName} on ${visit.visitDate} at ${visit.startTime}.`,
          priority: "normal",
          metadata: {
            visitId: visit.visitId,
            visitNumber: visit.visitNumber,
            accountId: visit.accountId,
            kind: "attendee_invitation",
          },
        },
      );

      // Best-effort emails: failures are logged but never break visit creation.
      await Promise.all(
        attendeeRecipients
          .filter((r) => r.email)
          .map((r) =>
            emailService
              .sendVisitInvitationEmail(r.email, r.fullName, visit, organizerName)
              .catch((err) => {
                console.error(
                  `Failed to send visit invitation email to ${r.email} for ${visit.visitNumber}:`,
                  err?.message || err,
                );
              }),
          ),
      );
    }

    return res.status(201).json({ status: "Success", visit });
  } catch (error) {
    console.error("Create visit error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive: get visits for their assigned accounts
exports.getMyVisits = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for executive and supervisor users" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const visits = await Visit.findAll({
      where: { executiveId: exec.executiveId },
      order: [["visit_date", "ASC"], ["start_time", "ASC"]],
    });

    await sendVisitReminderAndOverdueAlerts(visits);

    return res.status(200).json({ status: "Success", visits });
  } catch (error) {
    console.error("Get my visits error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Customer: get visits for their account
exports.getCustomerVisits = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "This endpoint is for customers only" });
    }

    const accounts = await getCustomerCorporateAccounts(user.email);
    if (!accounts.length) {
      return res.status(404).json({ status: "Failed", message: "No accounts linked to your corporate profile" });
    }
    const accountIds = accounts.map((a) => a.accountId);

    const visits = await Visit.findAll({
      where: { accountId: { [Op.in]: accountIds } },
      order: [["visit_date", "ASC"], ["start_time", "ASC"]],
    });

    await sendVisitReminderAndOverdueAlerts(visits);

    return res.status(200).json({ status: "Success", visits });
  } catch (error) {
    console.error("Get customer visits error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// All visits (manager / admin)
exports.getAllVisits = async (req, res) => {
  try {
    const user = req.user;

    if (!["manager", "supervisor", "admin", "gm"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let whereClause = {};
    if (user.role === "gm") {
      const gmProfile = await resolveGmProfile(user);
      whereClause = await buildGmVisitWhereClause(gmProfile);
    }

    const visits = await Visit.findAll({
      where: whereClause,
      order: [["visit_date", "DESC"], ["start_time", "ASC"]],
    });

    return res.status(200).json({ status: "Success", visits });
  } catch (error) {
    console.error("Get all visits error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Customer responds: approve / decline / reschedule
exports.respondToVisit = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can respond to visits" });
    }

    const { visitId } = req.params;
    const { action, customerResponse, rescheduleDate, rescheduleStartTime, rescheduleEndTime, rescheduleReason } = req.body;

    if (!action || !["approve", "decline", "reschedule"].includes(action)) {
      return res.status(400).json({ status: "Failed", message: "action must be 'approve', 'decline', or 'reschedule'" });
    }

    const accounts = await getCustomerCorporateAccounts(user.email);
    if (!accounts.length) {
      return res.status(404).json({ status: "Failed", message: "No accounts linked to your corporate profile" });
    }
    const accountIds = accounts.map((a) => a.accountId);

    const visit = await Visit.findOne({ where: { visitId, accountId: { [Op.in]: accountIds } } });
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found" });
    }

    if (!["pending", "rescheduled"].includes(visit.status)) {
      return res.status(400).json({ status: "Failed", message: "This visit is no longer pending response" });
    }

    const updates = {
      customerRespondedAt: new Date(),
      customerResponse: customerResponse || null,
    };

    if (action === "approve") {
      updates.status = "approved";
    } else if (action === "decline") {
      updates.status = "declined";
      if (!customerResponse) {
        return res.status(400).json({ status: "Failed", message: "Please provide a reason for declining" });
      }
    } else if (action === "reschedule") {
      if (!rescheduleDate || !rescheduleStartTime || !rescheduleEndTime) {
        return res.status(400).json({ status: "Failed", message: "rescheduleDate, rescheduleStartTime and rescheduleEndTime are required" });
      }
      updates.status = "rescheduled";
      updates.rescheduleDate = rescheduleDate;
      updates.rescheduleStartTime = rescheduleStartTime;
      updates.rescheduleEndTime = rescheduleEndTime;
      updates.rescheduleReason = rescheduleReason || null;
    }

    await visit.update(updates);
    await visit.reload();

    if (action === "approve") {
      const execRow = await ExecutiveStaff.findByPk(visit.executiveId, { attributes: ["userId"] });
      if (execRow?.userId) {
        await createForUserIds([execRow.userId], {
          type: "visit",
          title: `Visit Approved - ${visit.visitNumber}`,
          message: `${visit.accountName} approved your visit on ${visit.visitDate} at ${visit.startTime}. Calendar invites are being sent.`,
          priority: "normal",
          metadata: { visitId: visit.visitId, visitNumber: visit.visitNumber },
        });
      }
      await pushVisitCalendarSync(visit);
    } else if (action === "decline") {
      await pushVisitCalendarSync(visit, { cancel: true });
    }

    return res.status(200).json({ status: "Success", visit });
  } catch (error) {
    console.error("Respond to visit error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive requests reschedule (requires manager approval)
exports.requestReschedule = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only executive or supervisor users can request reschedules" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const { visitId } = req.params;
    const { reason, motivation, newDate, newTime } = req.body;

    if (!reason || !motivation || !newDate || !newTime) {
      return res.status(400).json({ status: "Failed", message: "reason, motivation, newDate and newTime are required" });
    }

    const visit = await Visit.findOne({ where: { visitId, executiveId: exec.executiveId } });
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found or not assigned to you" });
    }

    if (["completed", "follow_up_pending", "cancelled", "declined"].includes(visit.status)) {
      return res.status(400).json({ status: "Failed", message: "Cannot reschedule a visit that is " + visit.status });
    }

    await visit.update({
      execRescheduleReason: reason,
      execRescheduleMotivation: motivation,
      execRescheduleNewDate: newDate,
      execRescheduleNewTime: newTime,
      execRescheduleStatus: "pending_approval",
    });
    await visit.reload();

    const managerTeamIds = await resolveManagerTeamNotificationUserIds(visit.executiveId);
    await createForUserIds(managerTeamIds, {
      type: "visit",
      title: `Reschedule Request - ${visit.visitNumber}`,
      message: `${visit.executiveName} requested to reschedule ${visit.accountName} visit to ${visit.execRescheduleNewDate} ${visit.execRescheduleNewTime || ""}.`,
      priority: "high",
      metadata: {
        visitId: visit.visitId,
        visitNumber: visit.visitNumber,
        kind: "reschedule_request",
      },
    });

    return res.status(200).json({ status: "Success", visit });
  } catch (error) {
    console.error("Request reschedule error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Manager approves or rejects an executive reschedule request
exports.approveReschedule = async (req, res) => {
  try {
    const user = req.user;

    if (!["manager", "supervisor", "admin"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only managers can approve reschedule requests" });
    }

    const { visitId } = req.params;
    const { decision } = req.body; // "approved" or "rejected"

    if (!decision || !["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ status: "Failed", message: "decision must be 'approved' or 'rejected'" });
    }

    const visit = await Visit.findByPk(visitId);
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found" });
    }

    if (visit.execRescheduleStatus !== "pending_approval") {
      return res.status(400).json({ status: "Failed", message: "No pending reschedule request for this visit" });
    }

    // Get manager name
    const manager = await Manager.findOne({ where: { userId: user.id } });
    const managerName = manager ? `${manager.firstName} ${manager.lastName}` : user.email;

    if (decision === "approved") {
      await visit.update({
        visitDate: visit.execRescheduleNewDate,
        startTime: visit.execRescheduleNewTime,
        execRescheduleStatus: "approved",
        managerApprovedBy: managerName,
        managerApprovedAt: new Date(),
        status: "confirmed",
      });
      await visit.reload();
      await pushVisitCalendarSync(visit);
    } else {
      await visit.update({
        execRescheduleStatus: "rejected",
        managerApprovedBy: managerName,
        managerApprovedAt: new Date(),
      });
    }

    await visit.reload();
    return res.status(200).json({ status: "Success", visit });
  } catch (error) {
    console.error("Approve reschedule error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Get reschedule requests pending manager approval (scoped to manager's executives)
exports.getPendingReschedules = async (req, res) => {
  try {
    const user = req.user;

    if (!["manager", "supervisor", "admin", "gm"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let whereClause = { execRescheduleStatus: "pending_approval" };

    if (user.role === "gm") {
      const gmProfile = await resolveGmProfile(user);
      const gmVisitWhere = await buildGmVisitWhereClause(gmProfile);
      whereClause = { ...whereClause, ...gmVisitWhere };
    } else if (user.role === "manager" || user.role === "supervisor") {
      if (user.role === "supervisor") {
        const execIds = await getSupervisorManagedExecutiveIds(user);
        whereClause.executiveId =
          execIds.length === 0 ? { [Op.in]: [-1] } : { [Op.in]: execIds };
      } else {
        const execIds = await getManagerExecIds(user.id);
        if (execIds === null) {
          return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
        }
        whereClause.executiveId =
          execIds.length === 0 ? { [Op.in]: [-1] } : { [Op.in]: execIds };
      }
    }

    const visits = await Visit.findAll({
      where: whereClause,
      order: [["updated_at", "DESC"]],
    });

    return res.status(200).json({ status: "Success", visits });
  } catch (error) {
    console.error("Get pending reschedules error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive accepts reschedule / cancels visit
exports.updateVisit = async (req, res) => {
  try {
    const user = req.user;
    const { visitId } = req.params;
    const { action, status } = req.body;

    const visit = await Visit.findByPk(visitId);
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found" });
    }

    // Executive accepting a customer's reschedule proposal
    if (hasExecutiveScope(user.role) && action === "accept_reschedule") {
      const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
      if (!exec || exec.executiveId !== visit.executiveId) {
        return res.status(403).json({ status: "Failed", message: "You are not assigned to this visit" });
      }
      if (visit.status !== "rescheduled") {
        return res.status(400).json({ status: "Failed", message: "Visit is not in rescheduled state" });
      }
      await visit.update({
        visitDate: visit.rescheduleDate,
        startTime: visit.rescheduleStartTime,
        endTime: visit.rescheduleEndTime,
        status: "confirmed",
        rescheduleDate: null,
        rescheduleStartTime: null,
        rescheduleEndTime: null,
      });
      await visit.reload();
      await pushVisitCalendarSync(visit);
      return res.status(200).json({ status: "Success", visit });
    }

    // Mark visit as completed or cancelled
    if (["executive_staff", "manager", "supervisor", "admin"].includes(user.role) && status) {
      const allowed = ["confirmed", "completed", "cancelled"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ status: "Failed", message: `status must be one of: ${allowed.join(", ")}` });
      }
      await visit.update({ status });
      await visit.reload();
      if (status === "confirmed") {
        await pushVisitCalendarSync(visit);
      } else if (status === "cancelled") {
        await pushVisitCalendarSync(visit, { cancel: true });
      }
      return res.status(200).json({ status: "Success", visit });
    }

    return res.status(400).json({ status: "Failed", message: "No valid action or status provided" });
  } catch (error) {
    console.error("Update visit error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive submits control card
exports.submitControlCard = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only executive or supervisor users can submit control cards" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const { visitId } = req.params;
    const { controlCardData } = req.body;

    if (!controlCardData) {
      return res.status(400).json({ status: "Failed", message: "controlCardData is required" });
    }

    const visit = await Visit.findOne({ where: { visitId, executiveId: exec.executiveId } });
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found or not assigned to you" });
    }

    if (visit.status === "cancelled" || visit.status === "declined") {
      return res.status(400).json({ status: "Failed", message: "Cannot submit control card for a " + visit.status + " visit" });
    }

    // Check if a control card already exists for this visit
    const existing = await ControlCard.findOne({ where: { visitId } });
    if (existing) {
      return res.status(400).json({ status: "Failed", message: "A control card has already been submitted for this visit" });
    }

    const accountRow = await Account.findByPk(visit.accountId);
    if (!accountRow) {
      return res.status(404).json({ status: "Failed", message: "Account not found for this visit" });
    }

    const createdTickets = [];

    await sequelize.transaction(async (transaction) => {
      const controlCard = await ControlCard.create(
        {
          visitId: visit.visitId,
          executiveId: exec.executiveId,
          accountId: visit.accountId,
          accountName: visit.accountName,
          visitDate: visit.visitDate,
          csrManager: controlCardData.csrManager || null,
          customerParticipants: controlCardData.customerParticipants || null,
          visitObjective: controlCardData.visitObjective || null,
          slaCompliance: controlCardData.slaCompliance || null,
          openTickets: controlCardData.openTickets || null,
          criticalIncidents: controlCardData.criticalIncidents || null,
          risksOperational: controlCardData.risksOperational || null,
          risksCommercial: controlCardData.risksCommercial || null,
          risksCompetitive: controlCardData.risksCompetitive || null,
          opportunitiesUpsell: controlCardData.opportunitiesUpsell || null,
          opportunitiesProcess: controlCardData.opportunitiesProcess || null,
          actionItems: controlCardData.actionItems || [],
          geoLatitude: controlCardData.geoLatitude || null,
          geoLongitude: controlCardData.geoLongitude || null,
        },
        { transaction }
      );

      await visit.update({ status: "follow_up_pending" }, { transaction });

      for (const raw of controlCardData.actionItems || []) {
        const details = ticketDetailsFromVisitActionItem(raw, visit);
        if (!details) continue;
        const ticket = await createVisitActionItemTicket(user, accountRow, details, {
          transaction,
          skipNotifications: true,
        });
        createdTickets.push(ticket);
      }
    });

    await visit.reload();

    for (const tkt of createdTickets) {
      await sendTicketCreationNotifications(tkt, user, false);
    }

    const controlCard = await ControlCard.findOne({ where: { visitId } });

    return res.status(201).json({
      status: "Success",
      controlCard,
      visit,
      ticketsCreated: createdTickets.length,
      ticketNumbers: createdTickets.map((t) => t.ticketNumber),
    });
  } catch (error) {
    console.error("Submit control card error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

/**
 * Who may load a visit control card via GET /visits/:visitId/control-card.
 */
async function userMayAccessVisitControlCard(user, visit) {
  if (!visit) return false;

  if (user.role === "customer") {
    const accounts = await getCustomerCorporateAccounts(user.email);
    const accountIds = accounts.map((a) => a.accountId);
    return accountIds.includes(visit.accountId);
  }

  if (hasExecutiveScope(user.role)) {
    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    return !!(exec && visit.executiveId === exec.executiveId);
  }

  if (user.role === "admin") return true;

  if (user.role === "supervisor") {
    const execIds = await getSupervisorManagedExecutiveIds(user);
    return execIds.includes(visit.executiveId);
  }

  if (user.role === "manager") {
    const execIds = await getManagerExecIds(user.id);
    if (execIds === null) return false;
    return execIds.includes(visit.executiveId);
  }

  if (user.role === "gm") {
    const gmProfile = await resolveGmProfile(user);
    if (!gmProfile) return false;
    const execIds = await resolveGmExecutiveIds(gmProfile);
    return execIds.includes(visit.executiveId);
  }

  return false;
}

// Get control card for a visit
exports.getControlCard = async (req, res) => {
  try {
    const user = req.user;
    const { visitId } = req.params;

    const visit = await Visit.findByPk(visitId);
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found" });
    }

    const allowed = await userMayAccessVisitControlCard(user, visit);
    if (!allowed) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    const controlCard = await ControlCard.findOne({ where: { visitId } });
    if (!controlCard) {
      return res.status(404).json({ status: "Failed", message: "No control card found for this visit" });
    }

    const plain = controlCard.get({ plain: true });
    if (user.role === "customer") {
      delete plain.geoLatitude;
      delete plain.geoLongitude;
      delete plain.customerFeedback;
    }

    return res.status(200).json({ status: "Success", controlCard: plain });
  } catch (error) {
    console.error("Get control card error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive records meeting start (GPS when opening “Start visit”) — first capture is kept
exports.recordMeetingStart = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only executive or supervisor users can record meeting start" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const { visitId } = req.params;
    const lat = Number(req.body?.latitude ?? req.body?.lat);
    const lng = Number(req.body?.longitude ?? req.body?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ status: "Failed", message: "latitude and longitude must be valid numbers" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ status: "Failed", message: "coordinates are out of valid range" });
    }

    const visit = await Visit.findOne({ where: { visitId, executiveId: exec.executiveId } });
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found or not assigned to you" });
    }

    if (!["approved", "confirmed"].includes(visit.status)) {
      return res.status(400).json({
        status: "Failed",
        message: "Meeting start can only be recorded for approved or confirmed visits",
      });
    }

    if (visit.meetingStartedAt) {
      await visit.reload();
      return res.status(200).json({ status: "Success", visit, alreadyRecorded: true });
    }

    await visit.update({
      meetingStartedAt: new Date(),
      startGeoLatitude: lat,
      startGeoLongitude: lng,
    });
    await visit.reload();

    return res.status(200).json({ status: "Success", visit, alreadyRecorded: false });
  } catch (error) {
    console.error("Record meeting start error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive updates control card (post-completion fields: customerFeedback, accountHealth)
exports.updateControlCard = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only executive or supervisor users can update control cards" });
    }

    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!exec) {
      return res.status(404).json({ status: "Failed", message: "Executive profile not found" });
    }

    const { visitId } = req.params;
    const { customerFeedback, accountHealth } = req.body;

    const controlCard = await ControlCard.findOne({ where: { visitId, executiveId: exec.executiveId } });
    if (!controlCard) {
      return res.status(404).json({ status: "Failed", message: "Control card not found or not assigned to you" });
    }

    const updates = {};
    if (customerFeedback !== undefined) updates.customerFeedback = customerFeedback;
    if (accountHealth !== undefined) {
      if (!["green", "amber", "red"].includes(accountHealth)) {
        return res.status(400).json({ status: "Failed", message: "accountHealth must be green, amber, or red" });
      }
      updates.accountHealth = accountHealth;
    }

    await controlCard.update(updates);
    await controlCard.reload();

    const visitRow = await Visit.findByPk(visitId);
    if (visitRow && visitRow.status === "follow_up_pending") {
      const hasFeedback =
        controlCard.customerFeedback && String(controlCard.customerFeedback).trim().length > 0;
      const hasHealth =
        controlCard.accountHealth && ["green", "amber", "red"].includes(controlCard.accountHealth);
      if (hasFeedback && hasHealth) {
        await visitRow.update({ status: "completed" });
      }
    }
    if (visitRow) await visitRow.reload();

    return res.status(200).json({ status: "Success", controlCard, visit: visitRow });
  } catch (error) {
    console.error("Update control card error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Customer submits rating for a completed visit
exports.submitRating = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can submit ratings" });
    }

    const { visitId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ status: "Failed", message: "rating must be between 1 and 5" });
    }

    const accounts = await getCustomerCorporateAccounts(user.email);
    if (!accounts.length) {
      return res.status(404).json({ status: "Failed", message: "No accounts linked to your corporate profile" });
    }
    const accountIds = accounts.map((a) => a.accountId);

    const visit = await Visit.findOne({ where: { visitId, accountId: { [Op.in]: accountIds } } });
    if (!visit) {
      return res.status(404).json({ status: "Failed", message: "Visit not found" });
    }

    if (!["completed", "follow_up_pending"].includes(visit.status)) {
      return res.status(400).json({
        status: "Failed",
        message: "You can rate this visit after your meeting report has been submitted",
      });
    }

    // Verify control card exists
    const controlCard = await ControlCard.findOne({ where: { visitId } });
    if (!controlCard) {
      return res.status(400).json({ status: "Failed", message: "Control card has not been submitted yet" });
    }

    if (visit.customerRating) {
      return res.status(400).json({ status: "Failed", message: "You have already rated this visit" });
    }

    await visit.update({
      customerRating: rating,
      customerRatingComment: comment || null,
      customerRatedAt: new Date(),
    });
    await visit.reload();

    return res.status(200).json({ status: "Success", visit });
  } catch (error) {
    console.error("Submit rating error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Helper: get executive IDs under a manager
async function getManagerExecIds(userId) {
  const manager = await Manager.findOne({ where: { userId } });
  if (!manager) return null;
  const execs = await ExecutiveStaff.findAll({
    where: { managerId: manager.managerId },
    attributes: ["executiveId"],
  });
  return execs.map((e) => e.executiveId);
}

/**
 * Executive IDs a supervisor may see in manager-style views.
 * Promoted supervisors get their own Manager row (new manager_id), but teammates still have
 * ExecutiveStaff.managerId pointing at the line manager. Resolving by Manager.userId therefore
 * returns an empty team — use the supervisor's ExecutiveStaff.managerId instead (same as peers).
 */
async function getSupervisorManagedExecutiveIds(user) {
  const exec = await ExecutiveStaff.findOne({
    where: { userId: user.id },
    attributes: ["executiveId", "managerId"],
  });
  if (!exec) {
    const fallback = await getManagerExecIds(user.id);
    return fallback === null ? [] : fallback;
  }
  if (!exec.managerId) {
    return exec.executiveId ? [exec.executiveId] : [];
  }
  const team = await ExecutiveStaff.findAll({
    where: { managerId: exec.managerId },
    attributes: ["executiveId"],
  });
  const ids = team.map((t) => t.executiveId).filter(Boolean);
  if (ids.length) return ids;
  return exec.executiveId ? [exec.executiveId] : [];
}

// Manager gets visits for their executives
exports.getManagerVisits = async (req, res) => {
  try {
    const user = req.user;

    if (!["manager", "supervisor", "admin", "gm"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let whereClause = {};

    if (user.role === "gm") {
      const gmProfile = await resolveGmProfile(user);
      whereClause = await buildGmVisitWhereClause(gmProfile);
    } else if (user.role === "supervisor") {
      const execIds = await getSupervisorManagedExecutiveIds(user);
      whereClause.executiveId =
        execIds.length === 0 ? { [Op.in]: [-1] } : { [Op.in]: execIds };
    } else if (user.role === "manager") {
      const execIds = await getManagerExecIds(user.id);
      if (execIds === null) {
        return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
      }
      whereClause.executiveId =
        execIds.length === 0 ? { [Op.in]: [-1] } : { [Op.in]: execIds };
    }

    const visits = await Visit.findAll({
      where: whereClause,
      order: [["visit_date", "DESC"], ["start_time", "ASC"]],
    });

    if (user.role !== "gm") {
      await sendVisitReminderAndOverdueAlerts(visits);
    }

    return res.status(200).json({ status: "Success", visits });
  } catch (error) {
    console.error("Get manager visits error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

/**
 * GET /visits/department-team
 *
 * Returns the executives + line manager that share the requesting user's
 * department, suitable for populating an "Attendees" picker when scheduling
 * a visit. The current user is excluded from the result.
 *
 * Department is resolved via the line manager (Manager.department):
 *   - executive_staff / supervisor → ExecutiveStaff.managerId → Manager
 *   - manager → Manager (own row)
 */
exports.getDepartmentTeam = async (req, res) => {
  try {
    const user = req.user;
    if (!["executive_staff", "supervisor", "manager", "admin"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let manager = null;

    if (user.role === "manager") {
      manager = await Manager.findOne({ where: { userId: user.id } });
    } else {
      const exec = await ExecutiveStaff.findOne({
        where: { userId: user.id },
        attributes: ["executiveId", "managerId"],
      });
      if (exec?.managerId) {
        manager = await Manager.findByPk(exec.managerId);
      }
    }

    if (!manager) {
      return res.status(200).json({
        status: "Success",
        department: null,
        members: [],
      });
    }

    const peerExecs = await ExecutiveStaff.findAll({
      where: { managerId: manager.managerId },
      order: [["first_name", "ASC"], ["last_name", "ASC"]],
    });

    const execUserIds = peerExecs.map((e) => e.userId).filter(Boolean);
    const userRows = execUserIds.length
      ? await User.findAll({ where: { id: { [Op.in]: execUserIds } }, attributes: ["id", "role"] })
      : [];
    const roleByUserId = new Map(userRows.map((u) => [u.id, u.role]));

    const members = [];

    if (manager.userId !== user.id) {
      members.push({
        id: `manager_${manager.managerId}`,
        firstName: manager.firstName,
        lastName: manager.lastName,
        fullName: `${manager.firstName || ""} ${manager.lastName || ""}`.trim(),
        email: manager.email,
        role: "manager",
      });
    }

    for (const exec of peerExecs) {
      if (exec.userId && exec.userId === user.id) continue;
      const resolvedRole = (exec.userId && roleByUserId.get(exec.userId)) || "executive_staff";
      members.push({
        id: `exec_${exec.executiveId}`,
        firstName: exec.firstName,
        lastName: exec.lastName,
        fullName: `${exec.firstName || ""} ${exec.lastName || ""}`.trim(),
        email: exec.email,
        role: resolvedRole,
      });
    }

    return res.status(200).json({
      status: "Success",
      department: manager.department || null,
      members,
    });
  } catch (error) {
    console.error("Get department team error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Manager gets control cards for their executives
exports.getManagerControlCards = async (req, res) => {
  try {
    const user = req.user;

    if (!["manager", "supervisor", "admin", "gm"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let whereClause = {};

    if (user.role === "gm") {
      const gmProfile = await resolveGmProfile(user);
      whereClause = await buildGmVisitWhereClause(gmProfile);
    } else if (user.role === "supervisor") {
      const execIds = await getSupervisorManagedExecutiveIds(user);
      whereClause.executiveId =
        execIds.length === 0 ? { [Op.in]: [-1] } : { [Op.in]: execIds };
    } else if (user.role === "manager") {
      const execIds = await getManagerExecIds(user.id);
      if (execIds === null) {
        return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
      }
      whereClause.executiveId =
        execIds.length === 0 ? { [Op.in]: [-1] } : { [Op.in]: execIds };
    }

    const controlCards = await ControlCard.findAll({
      where: whereClause,
      order: [["visit_date", "DESC"]],
    });

    return res.status(200).json({ status: "Success", controlCards });
  } catch (error) {
    console.error("Get manager control cards error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
