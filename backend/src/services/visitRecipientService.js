const { Op } = require("sequelize");
const Account = require("../models/Account");
const AccountManager = require("../models/AccountManager");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Manager = require("../models/Manager");
const User = require("../models/User");
const { getAccountManagerIdsForCorporate } = require("./contactPersonService");

const normalize = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Teammates selected on the visit form (manager + peers under same line manager).
 */
async function resolveAttendeeRecipients(organizerExec, attendeeNames) {
  if (!organizerExec?.managerId || !Array.isArray(attendeeNames) || attendeeNames.length === 0) {
    return [];
  }

  const requested = new Set(attendeeNames.map(normalize).filter(Boolean));
  if (requested.size === 0) return [];

  const recipients = new Map();

  const manager = await Manager.findByPk(organizerExec.managerId);
  if (manager) {
    const managerName = `${manager.firstName || ""} ${manager.lastName || ""}`.trim();
    if (managerName && requested.has(normalize(managerName))) {
      recipients.set(`manager_${manager.managerId}`, {
        userId: manager.userId || null,
        email: manager.email || null,
        fullName: managerName,
        role: "attendee",
      });
    }
  }

  const peers = await ExecutiveStaff.findAll({
    where: { managerId: organizerExec.managerId },
    attributes: ["executiveId", "firstName", "lastName", "email"],
  });

  for (const peer of peers) {
    if (peer.executiveId === organizerExec.executiveId) continue;
    const peerName = `${peer.firstName || ""} ${peer.lastName || ""}`.trim();
    if (peerName && requested.has(normalize(peerName))) {
      recipients.set(`exec_${peer.executiveId}`, {
        userId: peer.userId || null,
        email: peer.email || null,
        fullName: peerName,
        role: "attendee",
      });
    }
  }

  return Array.from(recipients.values());
}

/**
 * Executive + corporate account managers (customers) + named attendees — deduped by email.
 */
async function resolveVisitCalendarRecipients(visit) {
  const byEmail = new Map();

  const add = (email, fullName, role) => {
    const e = String(email || "").trim().toLowerCase();
    if (!e || !e.includes("@")) return;
    if (!byEmail.has(e)) {
      byEmail.set(e, { email: e, fullName: fullName || e, role });
    }
  };

  add(visit.executiveEmail, visit.executiveName, "executive");

  const account = await Account.findByPk(visit.accountId, {
    attributes: ["accountId", "corporateId"],
  });
  if (account?.corporateId) {
    const amIds = await getAccountManagerIdsForCorporate(account.corporateId);
    if (amIds.length) {
      const managers = await AccountManager.findAll({
        where: { accountManagerId: { [Op.in]: amIds } },
        attributes: ["email", "firstName", "lastName"],
      });
      for (const am of managers) {
        const name = `${am.firstName || ""} ${am.lastName || ""}`.trim() || am.email;
        add(am.email, name, "customer");
      }
    }
  }

  const exec = await ExecutiveStaff.findByPk(visit.executiveId);
  if (exec) {
    const attendeeRows = await resolveAttendeeRecipients(exec, visit.attendees || []);
    for (const row of attendeeRows) {
      add(row.email, row.fullName, row.role);
    }
  }

  return Array.from(byEmail.values());
}

module.exports = {
  resolveAttendeeRecipients,
  resolveVisitCalendarRecipients,
};
