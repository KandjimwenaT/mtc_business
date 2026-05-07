const Ticket = require("../models/Ticket");
const Account = require("../models/Account");
const Corporate = require("../models/Corporate");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const AccountManager = require("../models/AccountManager");
const Person = require("../models/Person");
const User = require("../models/User");
const Notification = require("../models/Notification");
const TicketInternalNote = require("../models/TicketInternalNote");
const TicketActivityLog = require("../models/TicketActivityLog");
const emailService = require("../services/emailService");
const { Op } = require("sequelize");
const { createForUserIds, resolveManagerTeamNotificationUserIds } = require("../services/notificationService");
const {
  getAccountsForCustomerUser,
  getAccountManagerIdsForCorporate,
} = require("../services/contactPersonService");

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
  // Spans every corporate the customer is linked to (legacy primary
  // AccountManager.corporateId + corporate_contact_persons junction table).
  return getAccountsForCustomerUser(userEmail);
}

async function getStaffAssignableAccounts(user) {
  if (user.role === "admin") {
    return Account.findAll({ order: [["created_at", "DESC"]] });
  }
  if (["executive_staff", "supervisor"].includes(user.role)) {
    const executive = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (!executive) return [];
    return Account.findAll({
      where: { executiveId: executive.executiveId },
      order: [["created_at", "DESC"]],
    });
  }
  return [];
}

function resolvePriorityFromCategoryAndType(category, type) {
  const requestPriorityMap = {
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

async function resolveDepartmentByManagerPersonId(managerPersonId) {
  if (!managerPersonId) return null;
  const managerPerson = await Person.findByPk(managerPersonId);
  return managerPerson?.department || null;
}

async function resolveDepartmentForAdminPerson(adminPerson) {
  if (!adminPerson) return null;
  if (adminPerson.department) return adminPerson.department;
  return resolveDepartmentByManagerPersonId(adminPerson.managerId);
}

async function resolveTicketDepartmentByTicket(ticket) {
  if (!ticket?.accountId) return null;
  const account = await Account.findByPk(ticket.accountId);
  if (!account) return null;
  const deptFromManager = await resolveDepartmentByManagerPersonId(account.managerId);
  if (deptFromManager) return deptFromManager;

  if (!ticket.executiveId) return null;
  const executiveProfile = await ExecutiveStaff.findByPk(ticket.executiveId);
  if (!executiveProfile) return null;
  const executivePerson = await Person.findOne({
    where: { email: executiveProfile.email, type: { [Op.in]: ["executive_staff", "supervisor"] } },
  });
  return resolveDepartmentByManagerPersonId(executivePerson?.managerId);
}

async function resolveAdminPersonsForTicket(ticket) {
  const department = await resolveTicketDepartmentByTicket(ticket);
  if (!department) return [];
  return Person.findAll({
    where: { type: "admin", department },
    order: [["created_at", "DESC"]],
  });
}

async function resolveAdminPersonForTicketAndEmail(ticket, email) {
  const admins = await resolveAdminPersonsForTicket(ticket);
  return admins.find((admin) => admin.email === email) || null;
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

async function buildTicketDetailPayload(ticketInstance) {
  const detailed = await toTicketWithAccountContext(ticketInstance);
  const internalNotes = await TicketInternalNote.findAll({
    where: { ticketId: ticketInstance.ticketId },
    order: [["created_at", "ASC"]],
  });
  const activityLog = await TicketActivityLog.findAll({
    where: { ticketId: ticketInstance.ticketId },
    order: [["created_at", "ASC"]],
  });
  return {
    ...detailed,
    internalNotes: internalNotes.map((note) => note.toJSON()),
    activityLog: activityLog.map((entry) => entry.toJSON()),
  };
}

async function resolveCustomerUserIdsByAccountId(accountId) {
  // Returns the user-ids of every contact person (with portal access) that
  // is linked to the account's corporate. A corporate can now have multiple
  // contact persons via the corporate_contact_persons junction table.
  const account = await Account.findByPk(accountId);
  if (!account?.corporateId) return [];

  const amIds = await getAccountManagerIdsForCorporate(account.corporateId);
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

async function resolveActorLabel(user) {
  if (!user) return "System";
  const dbUser = await User.findByPk(user.id);
  if (dbUser) {
    return `${dbUser.firstName} ${dbUser.lastName}`.trim();
  }
  return user.email || "System";
}

async function resolveTicketRecipientUsers(ticket) {
  const recipients = [];
  const executiveUserId = await resolveExecutiveUserIdByExecutiveProfileId(ticket.executiveId);
  if (executiveUserId) {
    const executiveUser = await User.findByPk(executiveUserId);
    if (executiveUser) recipients.push(executiveUser);
  }

  const managerTeamIds = await resolveManagerTeamNotificationUserIds(ticket.executiveId);
  if (managerTeamIds.length) {
    const teamUsers = await User.findAll({ where: { id: managerTeamIds } });
    recipients.push(...teamUsers);
  }

  const assignedAdmins = await resolveAdminPersonsForTicket(ticket);
  for (const admin of assignedAdmins) {
    if (!admin?.email) continue;
    const adminUser = await User.findOne({ where: { role: "admin", email: admin.email } });
    if (adminUser) recipients.push(adminUser);
  }

  const unique = new Map();
  for (const user of recipients) {
    if (user?.id) unique.set(user.id, user);
  }
  return Array.from(unique.values());
}

async function sendTicketCreationNotifications(ticket, user, isCustomerCreator) {
  const actorName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "System";
  const customerUserIds = await resolveCustomerUserIdsByAccountId(ticket.accountId);
  const executiveUserId = await resolveExecutiveUserIdByExecutiveProfileId(ticket.executiveId);
  const managerTeamIds = await resolveManagerTeamNotificationUserIds(ticket.executiveId);
  const recipientUserIds = [];
  if (executiveUserId) recipientUserIds.push(executiveUserId);
  recipientUserIds.push(...managerTeamIds);

  const assignedAdmins = await resolveAdminPersonsForTicket(ticket);
  for (const admin of assignedAdmins) {
    if (!admin?.email) continue;
    const adminUser = await User.findOne({ where: { role: "admin", email: admin.email } });
    if (adminUser) recipientUserIds.push(adminUser.id);
  }

  recipientUserIds.push(...customerUserIds);
  const customerUserIdSet = new Set(customerUserIds);
  const uniqueRecipientIds = Array.from(new Set(recipientUserIds.filter(Boolean)));
  const nonCustomerRecipientIds = uniqueRecipientIds.filter((id) => !customerUserIdSet.has(id));

  await createForUserIds(nonCustomerRecipientIds, {
    type: "ticket",
    title: `Ticket Created - ${ticket.ticketNumber}`,
    message: `${ticket.title} has been created with status ${ticket.status.replace(/_/g, " ")}.`,
    priority: ticket.priority === "critical" || ticket.priority === "high" ? ticket.priority : "normal",
    metadata: {
      ticketId: ticket.ticketId,
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      status: ticket.status,
      sourceChannel: ticket.sourceChannel,
      createdBy: ticket.createdByName,
    },
  });
  if (customerUserIds.length > 0) {
    const customerMessage = isCustomerCreator
      ? `${ticket.title} has been created with status ${ticket.status.replace(/_/g, " ")}.`
      : `Ticket created by ${actorName} on your behalf via ${ticket.sourceChannel}.`;
    await createForUserIds(customerUserIds, {
      type: "ticket",
      title: `Ticket Created - ${ticket.ticketNumber}`,
      message: customerMessage,
      priority: ticket.priority === "critical" || ticket.priority === "high" ? ticket.priority : "normal",
      metadata: {
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        status: ticket.status,
        sourceChannel: ticket.sourceChannel,
        createdBy: ticket.createdByName,
      },
    });
  }
}

exports.sendTicketCreationNotifications = sendTicketCreationNotifications;

/**
 * Create a staff-originated ticket (same routing as POST /tickets for executives).
 * Used when an AVR control card action item is converted into a real ticket.
 * sourceChannel is stored as "email" (valid ENUM) with sourceContextNote carrying visit provenance.
 */
exports.createVisitActionItemTicket = async (user, selectedAccount, details, options = {}) => {
  const { transaction, skipNotifications = false } = options;
  const { category, type, title, description, sourceContextNote } = details;

  const requestTypes = [
    "request_meeting", "new_product_request", "new_line", "plan_change", "line_suspension", "line_activation",
    "plan_upgrade", "number_change", "renewal", "termination",
    "upgrade", "downgrade", "change_ownership", "new_connection", "other",
  ];
  const complaintTypes = [
    "billing", "service", "network", "support", "technical",
    "provisioning", "qos", "other",
  ];
  const allowedTypes = category === "request" ? requestTypes : complaintTypes;

  if (!category || !type || !String(description || "").trim()) {
    const err = new Error("Category, type and description are required");
    err.statusCode = 400;
    throw err;
  }
  if (!["request", "complaint"].includes(category)) {
    const err = new Error("Category must be 'request' or 'complaint'");
    err.statusCode = 400;
    throw err;
  }
  if (!allowedTypes.includes(type)) {
    const err = new Error(`Invalid type for ${category}. Allowed: ${allowedTypes.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }

  const normalizedDescription = String(description || "").trim();
  const normalizedTitle = String(title || "").trim() || normalizedDescription.slice(0, 80) || type;
  const normalizedSourceContextNote = String(sourceContextNote || "").trim() || null;

  let assignedTo = null;
  if (selectedAccount.executiveId) {
    const exec = await ExecutiveStaff.findByPk(selectedAccount.executiveId);
    if (exec) {
      assignedTo = `${exec.firstName} ${exec.lastName}`;
    }
    const managerDepartment = await resolveDepartmentByManagerPersonId(selectedAccount.managerId);
    if (managerDepartment) {
      assignedTo = `Admin Team (${managerDepartment})`;
    }
  }

  const ticketNumber = await generateTicketNumber(category);
  const slaHours = { critical: 4, high: 8, medium: 24, low: 48 };
  const effectivePriority = resolvePriorityFromCategoryAndType(category, type);
  const slaDeadline = new Date(Date.now() + (slaHours[effectivePriority] || 24) * 60 * 60 * 1000);
  const actorName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "System";
  const accountContactName = `${selectedAccount.contactFirstName || ""} ${selectedAccount.contactLastName || ""}`.trim();
  const submittedByLabel = accountContactName || actorName || "Customer";
  const customerUserIds = await resolveCustomerUserIdsByAccountId(selectedAccount.accountId);
  const primaryCustomerUserId = customerUserIds[0] || null;

  const createOpts = transaction ? { transaction } : {};
  const ticket = await Ticket.create(
    {
      ticketNumber,
      category,
      accountId: selectedAccount.accountId,
      executiveId: selectedAccount.executiveId || null,
      type,
      priority: effectivePriority,
      title: normalizedTitle,
      description: normalizedDescription || null,
      status: selectedAccount.executiveId ? "assigned" : "new",
      submittedBy: submittedByLabel,
      createdByUserId: user.id,
      createdByRole: user.role,
      createdByName: actorName,
      createdForAccountId: selectedAccount.accountId,
      createdForCustomerUserId: primaryCustomerUserId,
      sourceChannel: "email",
      sourceContextNote: normalizedSourceContextNote,
      attachmentUrl: null,
      assignedTo,
      slaDeadline,
    },
    createOpts
  );

  if (!skipNotifications) {
    await sendTicketCreationNotifications(ticket, user, false);
  }
  return ticket;
};

// Customer/admin/executive creates a ticket
exports.createTicket = async (req, res) => {
  try {
    const user = req.user;

    const creatorRole = user.role;
    const isCustomerCreator = creatorRole === "customer";
    const isStaffCreator = ["admin", "executive_staff", "supervisor"].includes(creatorRole);
    if (!isCustomerCreator && !isStaffCreator) {
      return res.status(403).json({ status: "Failed", message: "Insufficient permissions to create tickets" });
    }

    const accounts = isCustomerCreator
      ? await getCustomerCorporateAccounts(user.email)
      : await getStaffAssignableAccounts(user);
    if (!accounts.length) {
      return res.status(404).json({
        status: "Failed",
        message: isCustomerCreator
          ? "No accounts linked to your corporate profile"
          : "No customer accounts are assigned to your scope",
      });
    }

    const accountIdRaw = req.body?.accountId || req.body?.createdForAccountId;
    const accountId = accountIdRaw ? Number(accountIdRaw) : null;
    if (isStaffCreator && !Number.isInteger(accountId)) {
      return res.status(400).json({ status: "Failed", message: "Customer account is required for staff-created tickets" });
    }

    const selectedAccount =
      accountId
        ? accounts.find((a) => a.accountId === accountId)
        : accounts[0];
    if (!selectedAccount) {
      return res.status(400).json({
        status: "Failed",
        message: isCustomerCreator
          ? "Selected account is not part of your linked corporate"
          : "Selected account is not in your allowed scope",
      });
    }

    const { category, type, title, description, sourceChannel: sourceChannelRaw, sourceContextNote } = req.body;

    if (!category || !type || !String(description || "").trim()) {
      return res.status(400).json({ status: "Failed", message: "Category, type and description are required" });
    }

    const allowedCategories = ["request", "complaint"];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ status: "Failed", message: "Category must be 'request' or 'complaint'" });
    }

    const requestTypes = [
      "request_meeting", "new_product_request", "new_line", "plan_change", "line_suspension", "line_activation",
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
    const sourceChannel = String(sourceChannelRaw || "").trim().toLowerCase();
    if (isStaffCreator && !["email", "phone"].includes(sourceChannel)) {
      return res.status(400).json({ status: "Failed", message: "Source channel must be 'email' or 'phone'" });
    }
    if (isCustomerCreator && sourceChannel && sourceChannel !== "portal") {
      return res.status(400).json({ status: "Failed", message: "Customers can only create portal-origin tickets" });
    }
    const effectiveSource = isStaffCreator ? sourceChannel : "portal";
    const normalizedSourceContextNote = String(sourceContextNote || "").trim() || null;

    // Look up assigned executive + assigned admin for handling.
    let assignedTo = null;
    if (selectedAccount.executiveId) {
      const exec = await ExecutiveStaff.findByPk(selectedAccount.executiveId);
      if (exec) {
        assignedTo = `${exec.firstName} ${exec.lastName}`;
      }

      const managerDepartment = await resolveDepartmentByManagerPersonId(selectedAccount.managerId);
      if (managerDepartment) {
        assignedTo = `Admin Team (${managerDepartment})`;
      }
    }

    const ticketNumber = await generateTicketNumber(category);

    // SLA hours based on priority
    const slaHours = { critical: 4, high: 8, medium: 24, low: 48 };
    const effectivePriority = resolvePriorityFromCategoryAndType(category, type);
    const slaDeadline = new Date(Date.now() + (slaHours[effectivePriority] || 24) * 60 * 60 * 1000);
    const actorName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "System";
    const accountContactName = `${selectedAccount.contactFirstName || ""} ${selectedAccount.contactLastName || ""}`.trim();
    const submittedByLabel = isCustomerCreator
      ? (actorName || accountContactName || "Customer")
      : (accountContactName || actorName || "Customer");
    const customerUserIds = await resolveCustomerUserIdsByAccountId(selectedAccount.accountId);
    // If the actor is themselves a customer (contact person creating their own
    // ticket), record them as the canonical "created for" user. Otherwise
    // fall back to the first contact person linked to the corporate.
    const primaryCustomerUserId = user.role === "customer" && customerUserIds.includes(user.id)
      ? user.id
      : (customerUserIds[0] || null);
    const attachmentUrl = req.file ? `/uploads/tickets/${req.file.filename}` : null;

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
      submittedBy: submittedByLabel,
      createdByUserId: user.id,
      createdByRole: creatorRole,
      createdByName: actorName,
      createdForAccountId: selectedAccount.accountId,
      createdForCustomerUserId: primaryCustomerUserId,
      sourceChannel: effectiveSource,
      sourceContextNote: normalizedSourceContextNote,
      attachmentUrl,
      assignedTo,
      slaDeadline,
    });

    await sendTicketCreationNotifications(ticket, user, isCustomerCreator);

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

      const adminDepartment = await resolveDepartmentForAdminPerson(adminPerson);
      if (!adminDepartment) {
        return res.status(200).json({ status: "Success", tickets: [] });
      }
      const resolved = await Promise.all(
        tickets.map(async (ticket) => ({
          ticket,
          department: await resolveTicketDepartmentByTicket(ticket),
        }))
      );
      tickets = resolved
        .filter((entry) => entry.department && entry.department === adminDepartment)
        .map((entry) => entry.ticket);
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
      const assignedAdmin = await resolveAdminPersonForTicketAndEmail(ticket, user.email);
      if (!assignedAdmin) {
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

    const payload = await buildTicketDetailPayload(ticket);
    return res.status(200).json({
      status: "Success",
      ticket: payload,
    });
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
    const { status, resolution, notes, actionTaken } = req.body;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ status: "Failed", message: "Ticket not found" });
    }

    const assignedAdmin = await resolveAdminPersonForTicketAndEmail(ticket, user.email);
    if (!assignedAdmin) {
      return res.status(403).json({ status: "Failed", message: "You are not assigned to handle this ticket" });
    }

    const allowedStatuses = ["new", "assigned", "in_progress", "escalated", "resolved", "closed", "rejected"];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ status: "Failed", message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
    }

    const prevStatus = ticket.status;
    const prevResolution = ticket.resolution ?? "";
    const prevNotes = ticket.notes ?? "";

    if (status) ticket.status = status;
    if (resolution !== undefined) ticket.resolution = resolution;
    if (notes !== undefined) ticket.notes = notes;
    if (status === "resolved") ticket.resolvedAt = new Date();
    if (status === "closed") ticket.closedAt = new Date();

    const statusChanged = status !== undefined && status !== prevStatus;
    const resolutionChanged = resolution !== undefined && String(resolution ?? "") !== String(prevResolution);
    const notesChanged = notes !== undefined && String(notes ?? "") !== String(prevNotes);
    const actionTakenTrimmed = actionTaken != null ? String(actionTaken).trim() : "";

    await ticket.save();

    if (statusChanged || resolutionChanged || notesChanged || actionTakenTrimmed) {
      const actorLabel = await resolveActorLabel(user);
      await TicketActivityLog.create({
        ticketId: ticket.ticketId,
        actorUserId: user.id,
        actorName: actorLabel,
        actorRole: user.role,
        previousStatus: statusChanged ? prevStatus : null,
        newStatus: statusChanged ? ticket.status : null,
        actionTaken: actionTakenTrimmed || null,
        resolutionPreview: resolutionChanged ? String(resolution ?? "").slice(0, 800) : null,
        notesPreview: notesChanged ? String(notes ?? "").slice(0, 800) : null,
      });
    }

    const customerUserIds = await resolveCustomerUserIdsByAccountId(ticket.accountId);
    const executiveUserId = await resolveExecutiveUserIdByExecutiveProfileId(ticket.executiveId);
    const managerTeamIds = await resolveManagerTeamNotificationUserIds(ticket.executiveId);
    await createForUserIds([...customerUserIds, executiveUserId, ...managerTeamIds], {
      type: "ticket",
      title: `Ticket Updated - ${ticket.ticketNumber}`,
      message: `${ticket.title} status is now ${ticket.status.replace(/_/g, " ")}.`,
      priority: ticket.status === "escalated" ? "high" : "normal",
      metadata: {
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
      },
    });

    const payload = await buildTicketDetailPayload(ticket);

    return res.status(200).json({
      status: "Success",
      message: "Ticket updated successfully",
      ticket: payload,
    });
  } catch (error) {
    console.error("Update ticket error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

// Add internal note (manager/supervisor/admin)
exports.addInternalNote = async (req, res) => {
  try {
    const user = req.user;
    if (!["manager", "supervisor", "admin"].includes(user.role)) {
      return res.status(403).json({ status: "Failed", message: "Only manager, supervisor, or admin can add internal notes" });
    }

    const { ticketId } = req.params;
    const noteText = String(req.body?.note || "").trim();
    if (!noteText) {
      return res.status(400).json({ status: "Failed", message: "Internal note is required" });
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ status: "Failed", message: "Ticket not found" });
    }

    const actorLabel = await resolveActorLabel(user);
    const note = await TicketInternalNote.create({
      ticketId: ticket.ticketId,
      authorUserId: user.id,
      authorName: actorLabel,
      authorRole: user.role,
      note: noteText,
    });

    const recipientUsers = await resolveTicketRecipientUsers(ticket);
    const notifyUserIds = recipientUsers
      .map((u) => u.id)
      .filter((id) => Number.isInteger(id) && id > 0 && id !== user.id);

    await createForUserIds(notifyUserIds, {
      type: "ticket",
      title: `Internal Note - ${ticket.ticketNumber}`,
      message: `${actorLabel} added an internal note on ${ticket.ticketNumber}.`,
      priority: "normal",
      metadata: {
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        kind: "ticket_internal_note",
        authorRole: user.role,
      },
    });

    await Promise.all(
      recipientUsers
        .filter((u) => u.id !== user.id && u.email)
        .map(async (recipient) => {
          try {
            await emailService.sendTicketInternalNoteEmail(
              recipient.email,
              `${recipient.firstName} ${recipient.lastName}`.trim(),
              ticket.ticketNumber,
              actorLabel,
              user.role,
              noteText,
            );
          } catch (emailErr) {
            console.error("Failed to send ticket internal note email:", emailErr);
          }
        })
    );

    return res.status(201).json({
      status: "Success",
      message: "Internal note added",
      note: note.toJSON(),
    });
  } catch (error) {
    console.error("Add internal note error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
