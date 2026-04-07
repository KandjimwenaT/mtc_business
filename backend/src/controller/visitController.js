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

const hasExecutiveScope = (role) => ["executive_staff", "supervisor"].includes(role);

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
  const accountManager = await AccountManager.findOne({ where: { email: userEmail } });
  if (!accountManager) return [];
  return Account.findAll({
    where: { corporateId: accountManager.corporateId },
    order: [["created_at", "DESC"]],
  });
}

async function resolveCustomerUserIdByCorporateId(corporateId) {
  if (!corporateId) return null;
  const accountManager = await AccountManager.findOne({ where: { corporateId } });
  if (!accountManager) return null;

  const customerUser = await User.findOne({
    where: { role: "customer", email: accountManager.email },
  });
  return customerUser ? customerUser.id : null;
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
      const customerUserId = await resolveCustomerUserIdByCorporateId(corpId);
      customerByCorporateId.set(corpId, customerUserId);
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
    const customerUserId = customerByCorporateId.get(corporateId) || null;
    const executiveUserId = executiveToUserId.get(visit.executiveId) || null;
    const managerTeamIds = await resolveManagerTeamNotificationUserIds(visit.executiveId);
    const targets = [customerUserId, executiveUserId, ...managerTeamIds].filter(Boolean);
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

    const customerUserId = await resolveCustomerUserIdByCorporateId(account.corporateId);
    const managerTeamIds = await resolveManagerTeamNotificationUserIds(visit.executiveId);
    await createForUserIds([customerUserId, ...managerTeamIds], {
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

    if (!["manager", "supervisor", "admin"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    const visits = await Visit.findAll({
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

    if (["completed", "cancelled", "declined"].includes(visit.status)) {
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

    if (!["manager", "supervisor", "admin"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let whereClause = { execRescheduleStatus: "pending_approval" };

    // Scope to manager team or supervisor team+own (admin sees all)
    if (user.role === "manager" || user.role === "supervisor") {
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

    const controlCard = await ControlCard.create({
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
    });

    // Mark visit as completed
    await visit.update({ status: "completed" });
    await visit.reload();

    return res.status(201).json({ status: "Success", controlCard, visit });
  } catch (error) {
    console.error("Submit control card error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Get control card for a visit
exports.getControlCard = async (req, res) => {
  try {
    const { visitId } = req.params;

    const controlCard = await ControlCard.findOne({ where: { visitId } });
    if (!controlCard) {
      return res.status(404).json({ status: "Failed", message: "No control card found for this visit" });
    }

    return res.status(200).json({ status: "Success", controlCard });
  } catch (error) {
    console.error("Get control card error:", error);
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

    return res.status(200).json({ status: "Success", controlCard });
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

    if (visit.status !== "completed") {
      return res.status(400).json({ status: "Failed", message: "Can only rate completed visits" });
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

    if (!["manager", "supervisor", "admin"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let whereClause = {};

    if (user.role === "supervisor") {
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

    await sendVisitReminderAndOverdueAlerts(visits);

    return res.status(200).json({ status: "Success", visits });
  } catch (error) {
    console.error("Get manager visits error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Manager gets control cards for their executives
exports.getManagerControlCards = async (req, res) => {
  try {
    const user = req.user;

    if (!["manager", "supervisor", "admin"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Unauthorized" });
    }

    let whereClause = {};

    if (user.role === "supervisor") {
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
