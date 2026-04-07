const Ticket = require("../models/Ticket");
const Account = require("../models/Account");
const Corporate = require("../models/Corporate");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const AccountManager = require("../models/AccountManager");
const Person = require("../models/Person");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { Op } = require("sequelize");
const { createForUserIds, resolveManagerTeamNotificationUserIds } = require("../services/notificationService");

const hasExecutiveScope = (role) => ["executive_staff", "supervisor"].includes(role);

// Generate next ticket number:  REQ-00001 / CMP-00001
async function generateTicketNumber(category) {
  const prefix = category === "request" ? "REQ" : "CMP";
  const last = await Ticket.findOne({
    where: { category },
    order: [["ticket_id", "DESC"]],
  });

  let nextNum = 1;
  if (last && last.ticketNumber) {
    const num = parseInt(last.ticketNumber.split("-")[1], 10);
    if (!isNaN(num)) nextNum = num + 1;
  }

  return `${prefix}-${String(nextNum).padStart(5, "0")}`;
}

async function getCustomerCorporateAccounts(userEmail) {
  const accountManager = await AccountManager.findOne({ where: { email: userEmail } });
  if (!accountManager) return [];
  return Account.findAll({
    where: { corporateId: accountManager.corporateId },
    order: [["created_at", "DESC"]],
  });
}

function resolvePriorityFromCategoryAndType(category, type) {
  const requestPriorityMap = {
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

  const complaintPriorityMap = {
    billing: "medium",
    service: "medium",
    network: "high",
    support: "medium",
    technical: "high",
    provisioning: "medium",
    qos: "high",
    other: "medium",
  };

  if (category === "request") {
    return requestPriorityMap[type] || "medium";
  }
  return complaintPriorityMap[type] || "medium";
}

async function resolveAssignedAdminForExecutive(executiveProfileId) {
  if (!executiveProfileId) return null;

  const execProfile = await ExecutiveStaff.findByPk(executiveProfileId);
  if (!execProfile) return null;

  const executivePerson = await Person.findOne({
    where: { email: execProfile.email, type: { [Op.in]: ["executive_staff", "supervisor"] } },
  });
  if (!executivePerson) return null;

  const admins = await Person.findAll({
    where: { type: "admin", managerId: executivePerson.managerId || null },
    order: [["created_at", "DESC"]],
  });

  for (const admin of admins) {
    try {
      const linkedExecutiveIds = admin.region ? JSON.parse(admin.region) : [];
      if (Array.isArray(linkedExecutiveIds) && linkedExecutiveIds.includes(executivePerson.id)) {
        return admin;
      }
    } catch {
      // Ignore malformed legacy region payload and continue searching.
    }
  }

  return null;
}

async function toTicketWithAccountContext(ticketInstance) {
  const account = await Account.findByPk(ticketInstance.accountId);
  let corporate = null;
  if (account?.corporateId) {
    corporate = await Corporate.findByPk(account.corporateId);
  }
  return {
    ...ticketInstance.toJSON(),
    accountName: account ? account.accountName : null,
    accountNumber: account ? account.accountNumber : null,
    corporateId: corporate ? corporate.corporateId : null,
    corporateName: corporate ? corporate.corporateName : null,
  };
}

async function resolveCustomerUserIdByAccountId(accountId) {
  const account = await Account.findByPk(accountId);
  if (!account?.corporateId) return null;

  const accountManager = await AccountManager.findOne({ where: { corporateId: account.corporateId } });
  if (!accountManager) return null;

  const customerUser = await User.findOne({
    where: { role: "customer", email: accountManager.email },
  });
  return customerUser ? customerUser.id : null;
}

async function resolveExecutiveUserIdByExecutiveProfileId(executiveProfileId) {
  if (!executiveProfileId) return null;
  const executive = await ExecutiveStaff.findByPk(executiveProfileId);
  if (!executive) return null;
  if (executive.userId) return executive.userId;
  const user = await User.findOne({
    where: { role: { [Op.in]: ["executive_staff", "supervisor"] }, email: executive.email },
  });
  return user ? user.id : null;
}

async function createNotificationIfMissing(userId, payload) {
  if (!userId) return;
  const existing = await Notification.findOne({
    where: {
      userId,
      type: payload.type,
      title: payload.title,
    },
  });
  if (!existing) {
    await createForUserIds([userId], payload);
  }
}

async function sendTicketBreachNotificationsToManagers(tickets) {
  if (!tickets?.length) return;
  const now = new Date();

  for (const ticket of tickets) {
    if (!ticket.slaDeadline) continue;
    if (["resolved", "closed", "rejected"].includes(ticket.status)) continue;

    const isBreached = new Date(ticket.slaDeadline) < now;
    if (!isBreached) continue;

    const managerTeamIds = await resolveManagerTeamNotificationUserIds(ticket.executiveId);
    if (!managerTeamIds.length) continue;

    const slaPayload = {
      type: "sla",
      title: `SLA Breached - ${ticket.ticketNumber}`,
      message: `${ticket.ticketNumber} has breached SLA and requires immediate action.`,
      priority: "high",
      metadata: {
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        kind: "ticket_sla_breached",
      },
    };
    await Promise.all(managerTeamIds.map((uid) => createNotificationIfMissing(uid, slaPayload)));
  }
}

async function resolveExecutiveNameByExecutiveProfileId(executiveProfileId) {
  if (!executiveProfileId) return null;
  const executive = await ExecutiveStaff.findByPk(executiveProfileId);
  if (!executive) return null;
  return `${executive.firstName} ${executive.lastName}`;
}

// Customer creates a ticket
exports.createTicket = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can create tickets" });
    }

    const accounts = await getCustomerCorporateAccounts(user.email);
    if (!accounts.length) {
      return res.status(404).json({ status: "Failed", message: "No accounts linked to your corporate profile" });
    }

    const { accountId } = req.body;
    const selectedAccount =
      accountId
        ? accounts.find((a) => a.accountId === Number(accountId))
        : accounts[0];
    if (!selectedAccount) {
      return res.status(400).json({ status: "Failed", message: "Selected account is not part of your linked corporate" });
    }

    const { category, type, title, description } = req.body;

    if (!category || !type || !String(description || "").trim()) {
      return res.status(400).json({ status: "Failed", message: "Category, type and description are required" });
    }

    const allowedCategories = ["request", "complaint"];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ status: "Failed", message: "Category must be 'request' or 'complaint'" });
    }

    const requestTypes = [
      "new_line", "plan_change", "line_suspension", "line_activation",
      "plan_upgrade", "number_change", "renewal", "termination",
      "upgrade", "downgrade", "change_ownership", "new_connection", "other",
    ];
    const complaintTypes = [
      "billing", "service", "network", "support", "technical",
      "provisioning", "qos", "other",
    ];
    const allowedTypes = category === "request" ? requestTypes : complaintTypes;

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        status: "Failed",
        message: `Invalid type for ${category}. Allowed: ${allowedTypes.join(", ")}`,
      });
    }

    const normalizedDescription = String(description || "").trim();
    const normalizedTitle = String(title || "").trim() || normalizedDescription.slice(0, 80) || type;

    // Look up assigned executive + assigned admin for handling.
    let assignedTo = null;
    if (selectedAccount.executiveId) {
      const exec = await ExecutiveStaff.findByPk(selectedAccount.executiveId);
      if (exec) {
        assignedTo = `${exec.firstName} ${exec.lastName}`;
      }

      const assignedAdmin = await resolveAssignedAdminForExecutive(selectedAccount.executiveId);
      if (assignedAdmin) {
        assignedTo = `Admin: ${assignedAdmin.firstName} ${assignedAdmin.lastName}`;
      }
    }

    const ticketNumber = await generateTicketNumber(category);

    // SLA hours based on priority
    const slaHours = { critical: 4, high: 8, medium: 24, low: 48 };
    const effectivePriority = resolvePriorityFromCategoryAndType(category, type);
    const slaDeadline = new Date(Date.now() + (slaHours[effectivePriority] || 24) * 60 * 60 * 1000);

    const ticket = await Ticket.create({
      ticketNumber,
      category,
      accountId: selectedAccount.accountId,
      executiveId: selectedAccount.executiveId || null,
      type,
      priority: effectivePriority,
      title: normalizedTitle,
      description: normalizedDescription || null,
      status: selectedAccount.executiveId ? "assigned" : "new",
      submittedBy: `${selectedAccount.contactFirstName} ${selectedAccount.contactLastName}`,
      assignedTo,
      slaDeadline,
    });

    const recipientUserIds = [];
    const executiveUserId = await resolveExecutiveUserIdByExecutiveProfileId(ticket.executiveId);
    const managerTeamIds = await resolveManagerTeamNotificationUserIds(ticket.executiveId);
    if (executiveUserId) recipientUserIds.push(executiveUserId);
    recipientUserIds.push(...managerTeamIds);

    const assignedAdmin = await resolveAssignedAdminForExecutive(ticket.executiveId);
    if (assignedAdmin?.email) {
      const adminUser = await User.findOne({ where: { role: "admin", email: assignedAdmin.email } });
      if (adminUser) recipientUserIds.push(adminUser.id);
    }

    const customerUserId = await resolveCustomerUserIdByAccountId(ticket.accountId);
    if (customerUserId) recipientUserIds.push(customerUserId);

    await createForUserIds(recipientUserIds, {
      type: "ticket",
      title: `Ticket Created - ${ticket.ticketNumber}`,
      message: `${ticket.title} has been created with status ${ticket.status.replace(/_/g, " ")}.`,
      priority: ticket.priority === "critical" || ticket.priority === "high" ? ticket.priority : "normal",
      metadata: {
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        status: ticket.status,
      },
    });

    return res.status(201).json({
      status: "Success",
      message: "Ticket created successfully",
      ticket: ticket.toJSON(),
    });
  } catch (error) {
    console.error("Create ticket error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Customer fetches their own tickets
exports.getMyTickets = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "customer") {
      return res.status(403).json({ status: "Failed", message: "Only customers can access this endpoint" });
    }

    const accounts = await getCustomerCorporateAccounts(user.email);
    if (!accounts.length) {
      return res.status(404).json({ status: "Failed", message: "No accounts linked to your corporate profile" });
    }
    const accountIds = accounts.map((a) => a.accountId);

    const tickets = await Ticket.findAll({
      where: { accountId: { [Op.in]: accountIds } },
      order: [["created_at", "DESC"]],
    });
    const ticketsForCustomer = await Promise.all(
      tickets.map(async (ticket) => {
        const executiveName = await resolveExecutiveNameByExecutiveProfileId(ticket.executiveId);
        return {
          ...ticket.toJSON(),
          assignedTo: executiveName || ticket.assignedTo || null,
        };
      })
    );

    return res.status(200).json({ status: "Success", tickets: ticketsForCustomer });
  } catch (error) {
    console.error("Get my tickets error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Executive staff fetches tickets for their accounts (read-only visibility)
exports.getAssignedTickets = async (req, res) => {
  try {
    const user = req.user;

    if (!hasExecutiveScope(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only executive or supervisor users can access this endpoint" });
    }

    const executive = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!executive) {
      return res.status(404).json({ status: "Failed", message: "Executive staff profile not found" });
    }

    const tickets = await Ticket.findAll({
      where: { executiveId: executive.executiveId },
      order: [["created_at", "DESC"]],
    });

    await sendTicketBreachNotificationsToManagers(tickets);

    const result = await Promise.all(tickets.map((t) => toTicketWithAccountContext(t)));

    return res.status(200).json({ status: "Success", tickets: result });
  } catch (error) {
    console.error("Get assigned tickets error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// All tickets (manager/gm/supervisor: all; admin: only tickets under their linked executives)
exports.getAllTickets = async (req, res) => {
  try {
    const user = req.user;

    if (!["admin", "manager", "supervisor", "gm", "executive_staff", "customer"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Insufficient permissions" });
    }

    let tickets = await Ticket.findAll({ order: [["created_at", "DESC"]] });

    if (user.role === "admin") {
      const adminPerson = await Person.findOne({
        where: { email: user.email, type: "admin" },
      });
      if (!adminPerson) {
        return res.status(404).json({ status: "Failed", message: "Admin profile not found" });
      }

      let linkedExecutivePersonIds = [];
      try {
        linkedExecutivePersonIds = adminPerson.region ? JSON.parse(adminPerson.region) : [];
      } catch {
        linkedExecutivePersonIds = [];
      }
      if (!Array.isArray(linkedExecutivePersonIds) || linkedExecutivePersonIds.length === 0) {
        return res.status(200).json({ status: "Success", tickets: [] });
      }

      const linkedExecutivePersons = await Person.findAll({
        where: { id: linkedExecutivePersonIds, type: "executive_staff" },
      });
      const linkedExecutiveEmails = linkedExecutivePersons.map((p) => p.email);
      if (!linkedExecutiveEmails.length) {
        return res.status(200).json({ status: "Success", tickets: [] });
      }

      const linkedExecutiveProfiles = await ExecutiveStaff.findAll({
        where: { email: linkedExecutiveEmails },
        attributes: ["executiveId"],
      });
      const linkedExecutiveProfileIds = linkedExecutiveProfiles.map((e) => e.executiveId);
      tickets = tickets.filter((t) => linkedExecutiveProfileIds.includes(t.executiveId));
    }

    if (["manager", "supervisor"].includes(user.role)) {
      await sendTicketBreachNotificationsToManagers(tickets);
    }

    const result = await Promise.all(tickets.map((t) => toTicketWithAccountContext(t)));

    return res.status(200).json({ status: "Success", tickets: result });
  } catch (error) {
    console.error("Get all tickets error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Get single ticket details with role-based ownership checks
exports.getTicketById = async (req, res) => {
  try {
    const user = req.user;
    const { ticketId } = req.params;

    if (!["admin", "manager", "supervisor", "gm", "executive_staff", "customer"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Insufficient permissions" });
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ status: "Failed", message: "Ticket not found" });
    }

    if (user.role === "admin") {
      const assignedAdmin = await resolveAssignedAdminForExecutive(ticket.executiveId);
      if (!assignedAdmin || assignedAdmin.email !== user.email) {
        return res.status(403).json({ status: "Failed", message: "You are not assigned to this ticket" });
      }
    }

    if (hasExecutiveScope(user.role)) {
      const executive = await ExecutiveStaff.findOne({ where: { userId: user.id } });
      if (!executive || executive.executiveId !== ticket.executiveId) {
        return res.status(403).json({ status: "Failed", message: "You are not assigned to this ticket" });
      }
    }

    if (user.role === "customer") {
      const accounts = await getCustomerCorporateAccounts(user.email);
      const accountIds = accounts.map((account) => account.accountId);
      if (!accountIds.includes(ticket.accountId)) {
        return res.status(403).json({ status: "Failed", message: "You do not have access to this ticket" });
      }
    }

    const detailed = await toTicketWithAccountContext(ticket);
    return res.status(200).json({ status: "Success", ticket: detailed });
  } catch (error) {
    console.error("Get ticket by id error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Update ticket status / resolution (handled by assigned admin)
exports.updateTicket = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ status: "Failed", message: "Only assigned admins can update tickets" });
    }

    const { ticketId } = req.params;
    const { status, resolution, notes } = req.body;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ status: "Failed", message: "Ticket not found" });
    }

    const assignedAdmin = await resolveAssignedAdminForExecutive(ticket.executiveId);
    if (!assignedAdmin) {
      return res.status(400).json({ status: "Failed", message: "No admin is linked to this ticket's executive" });
    }
    if (assignedAdmin.email !== user.email) {
      return res.status(403).json({ status: "Failed", message: "You are not assigned to handle this ticket" });
    }

    const allowedStatuses = ["new", "assigned", "in_progress", "escalated", "resolved", "closed", "rejected"];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ status: "Failed", message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
    }

    if (status) ticket.status = status;
    if (resolution) ticket.resolution = resolution;
    if (notes) ticket.notes = notes;
    if (status === "resolved") ticket.resolvedAt = new Date();
    if (status === "closed") ticket.closedAt = new Date();

    await ticket.save();

    const customerUserId = await resolveCustomerUserIdByAccountId(ticket.accountId);
    const executiveUserId = await resolveExecutiveUserIdByExecutiveProfileId(ticket.executiveId);
    const managerTeamIds = await resolveManagerTeamNotificationUserIds(ticket.executiveId);
    await createForUserIds([customerUserId, executiveUserId, ...managerTeamIds], {
      type: "ticket",
      title: `Ticket Updated - ${ticket.ticketNumber}`,
      message: `${ticket.title} status is now ${ticket.status.replace(/_/g, " ")}.`,
      priority: status === "escalated" ? "high" : "normal",
      metadata: {
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
      },
    });

    return res.status(200).json({
      status: "Success",
      message: "Ticket updated successfully",
      ticket: ticket.toJSON(),
    });
  } catch (error) {
    console.error("Update ticket error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
