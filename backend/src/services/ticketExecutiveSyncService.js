const { Op } = require("sequelize");
const Account = require("../models/Account");
const Ticket = require("../models/Ticket");
const TicketActivityLog = require("../models/TicketActivityLog");
const ExecutiveStaff = require("../models/ExecutiveStaff");

const OPEN_TICKET_STATUSES = ["new", "assigned", "in_progress", "escalated"];

function normalizeExecutiveProfileId(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveExecutiveDisplayName(executiveProfileId) {
  const id = normalizeExecutiveProfileId(executiveProfileId);
  if (!id) return null;
  const executive = await ExecutiveStaff.findByPk(id);
  if (!executive) return null;
  return `${executive.firstName || ""} ${executive.lastName || ""}`.trim() || null;
}

async function syncOpenTicketWithAccountExecutive(ticketInstance, options = {}) {
  const ticket = ticketInstance?.ticketId ? ticketInstance : await Ticket.findByPk(ticketInstance);
  if (!ticket || !OPEN_TICKET_STATUSES.includes(ticket.status)) {
    return ticket;
  }

  const account = await Account.findByPk(ticket.accountId, {
    attributes: ["accountId", "executiveId", "corporateId"],
  });
  const accountExecutiveId = normalizeExecutiveProfileId(account?.executiveId);
  const ticketExecutiveId = normalizeExecutiveProfileId(ticket.executiveId);

  if (!accountExecutiveId || accountExecutiveId === ticketExecutiveId) {
    return ticket;
  }

  const assignedTo =
    (await resolveExecutiveDisplayName(accountExecutiveId)) || ticket.assignedTo || null;

  await ticket.update({
    executiveId: accountExecutiveId,
    assignedTo,
    status: ticket.status === "new" ? "assigned" : ticket.status,
  });

  if (options.logActivity && options.actorUser) {
    const previousExecutiveName =
      options.previousExecutiveName ||
      (await resolveExecutiveDisplayName(ticketExecutiveId)) ||
      "previous executive";
    const newExecutiveName =
      assignedTo || (await resolveExecutiveDisplayName(accountExecutiveId)) || "new executive";
    const actionTaken = options.actionTaken
      || `Reassigned from ${previousExecutiveName} to ${newExecutiveName} (corporate executive changed)`;

    await TicketActivityLog.create({
      ticketId: ticket.ticketId,
      actorUserId: options.actorUser.id,
      actorName: options.actorName || options.actorUser.email || "System",
      actorRole: options.actorRole || options.actorUser.role || "system",
      actionTaken,
    });
  }

  return ticket;
}

async function reassignOpenTicketsForCorporate({
  corporateId,
  newExecutiveProfileId,
  newExecutiveDisplayName,
  previousExecutiveName,
  actorUser,
  actorName,
  actorRole,
}) {
  const normalizedCorporateId = Number(corporateId);
  const normalizedExecutiveId = normalizeExecutiveProfileId(newExecutiveProfileId);
  if (!Number.isInteger(normalizedCorporateId) || !normalizedExecutiveId) {
    return { reassignedCount: 0, ticketNumbers: [] };
  }

  const accounts = await Account.findAll({
    where: { corporateId: normalizedCorporateId },
    attributes: ["accountId"],
  });
  const accountIds = accounts.map((account) => account.accountId);
  if (!accountIds.length) {
    return { reassignedCount: 0, ticketNumbers: [] };
  }

  const openTickets = await Ticket.findAll({
    where: {
      accountId: { [Op.in]: accountIds },
      status: { [Op.in]: OPEN_TICKET_STATUSES },
    },
  });

  const ticketsToReassign = openTickets.filter(
    (ticket) => normalizeExecutiveProfileId(ticket.executiveId) !== normalizedExecutiveId
  );
  if (!ticketsToReassign.length) {
    return { reassignedCount: 0, ticketNumbers: [] };
  }

  const displayName = String(newExecutiveDisplayName || "").trim()
    || (await resolveExecutiveDisplayName(normalizedExecutiveId))
    || "new executive";
  const reassignMessage = previousExecutiveName
    ? `Reassigned from ${previousExecutiveName} to ${displayName} (corporate executive changed)`
    : `Assigned to ${displayName} (corporate executive changed)`;

  for (const ticket of ticketsToReassign) {
    await ticket.update({
      executiveId: normalizedExecutiveId,
      assignedTo: displayName,
      status: ticket.status === "new" ? "assigned" : ticket.status,
    });

    if (actorUser?.id) {
      await TicketActivityLog.create({
        ticketId: ticket.ticketId,
        actorUserId: actorUser.id,
        actorName: actorName || actorUser.email || "System",
        actorRole: actorRole || actorUser.role || "system",
        actionTaken: reassignMessage,
      });
    }
  }

  return {
    reassignedCount: ticketsToReassign.length,
    ticketNumbers: ticketsToReassign.map((ticket) => ticket.ticketNumber),
  };
}

async function syncOpenTicketsForCorporateAccounts(corporateId, options = {}) {
  const normalizedCorporateId = Number(corporateId);
  if (!Number.isInteger(normalizedCorporateId)) {
    return { syncedCount: 0, ticketNumbers: [] };
  }

  const accounts = await Account.findAll({
    where: { corporateId: normalizedCorporateId },
    attributes: ["accountId", "executiveId"],
  });
  const accountIds = accounts.map((account) => account.accountId);
  if (!accountIds.length) {
    return { syncedCount: 0, ticketNumbers: [] };
  }

  const openTickets = await Ticket.findAll({
    where: {
      accountId: { [Op.in]: accountIds },
      status: { [Op.in]: OPEN_TICKET_STATUSES },
    },
  });

  const syncedTicketNumbers = [];
  for (const ticket of openTickets) {
    const beforeId = normalizeExecutiveProfileId(ticket.executiveId);
    const synced = await syncOpenTicketWithAccountExecutive(ticket, options);
    const afterId = normalizeExecutiveProfileId(synced.executiveId);
    if (beforeId !== afterId) {
      syncedTicketNumbers.push(synced.ticketNumber);
    }
  }

  return {
    syncedCount: syncedTicketNumbers.length,
    ticketNumbers: syncedTicketNumbers,
  };
}

module.exports = {
  OPEN_TICKET_STATUSES,
  normalizeExecutiveProfileId,
  resolveExecutiveDisplayName,
  syncOpenTicketWithAccountExecutive,
  reassignOpenTicketsForCorporate,
  syncOpenTicketsForCorporateAccounts,
};
