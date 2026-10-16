const { Op } = require("sequelize");
const Notification = require("../models/Notification");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Manager = require("../models/Manager");
const User = require("../models/User");
const Corporate = require("../models/Corporate");
const AccountManager = require("../models/AccountManager");
const Account = require("../models/Account");
const Person = require("../models/Person");

/**
 * Portal user IDs that should receive manager-style alerts for this executive's team:
 * the line manager (Manager.userId) plus any supervisors whose ExecutiveStaff row
 * shares the same managerId (same team).
 */
async function resolveManagerTeamNotificationUserIds(executiveId) {
  if (!executiveId) return [];
  const executive = await ExecutiveStaff.findByPk(executiveId);
  if (!executive || !executive.managerId) return [];

  const ids = [];
  const manager = await Manager.findByPk(executive.managerId);
  if (manager?.userId) ids.push(manager.userId);

  const teamRows = await ExecutiveStaff.findAll({
    where: { managerId: executive.managerId },
    attributes: ["email"],
  });
  const emails = [...new Set(teamRows.map((r) => r.email).filter(Boolean))];
  if (!emails.length) return [...new Set(ids)];

  const supervisorUsers = await User.findAll({
    where: { role: "supervisor", email: emails },
    attributes: ["id"],
  });
  for (const u of supervisorUsers) {
    if (u.id && !ids.includes(u.id)) ids.push(u.id);
  }
  return [...new Set(ids)];
}

async function createNotification({
  userId,
  type,
  title,
  message,
  priority = "normal",
  metadata = null,
}) {
  if (!userId || !type || !title || !message) {
    return null;
  }

  const notification = await Notification.create({
    userId,
    type,
    title,
    message,
    priority,
    metadata,
  });

  try {
    const { emitNotificationCreated } = require("./realtimeService");
    emitNotificationCreated(notification);
  } catch (err) {
    console.error("Realtime notification emit failed:", err?.message || err);
  }

  return notification;
}

function normalizeUserId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0 || n !== Math.floor(n)) return null;
  return n;
}

async function sendNotificationEmails(userIds, payload, excludeUserIds = []) {
  const excluded = new Set((excludeUserIds || []).map(normalizeUserId).filter(Boolean));
  const ids = [...new Set((userIds || []).map(normalizeUserId).filter((id) => id && !excluded.has(id)))];
  if (!ids.length || !payload?.title || !payload?.message) return;

  let emailService;
  try {
    emailService = require("./emailService");
  } catch (err) {
    console.error("Email service unavailable for notifications:", err?.message || err);
    return;
  }

  const users = await User.findAll({
    where: { id: ids },
    attributes: ["id", "email", "firstName", "lastName", "role"],
  });

  await Promise.all(
    users.map(async (user) => {
      if (!user?.email) return;
      const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
      try {
        await emailService.sendPortalNotificationEmail(user.email, name, {
          title: payload.title,
          message: payload.message,
          type: payload.type,
          role: user.role,
        });
      } catch (err) {
        console.error(`Failed to email notification to ${user.email}:`, err?.message || err);
      }
    })
  );
}

async function createForUserIds(userIds, payload, options = {}) {
  const uniqueIds = [...new Set((userIds || []).map(normalizeUserId).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const rows = await Promise.all(uniqueIds.map((userId) => createNotification({ userId, ...payload })));

  if (!options.skipEmail) {
    try {
      await sendNotificationEmails(uniqueIds, payload, options.excludeUserIds);
    } catch (err) {
      console.error("Notification email fan-out failed:", err?.message || err);
    }
  }

  return rows;
}

/**
 * IDs that may appear on corporates.accounts.manager_id for "this manager" (see adminController compatibility notes).
 */
async function resolveCorporateManagerScopeIds(managerRow) {
  if (!managerRow?.managerId) return [];
  const managerPerson = await Person.findOne({
    where: { email: managerRow.email, type: { [Op.in]: ["manager", "supervisor"] } },
    attributes: ["id"],
  });
  const ids = new Set();
  if (Number.isInteger(managerRow.managerId) && managerRow.managerId > 0) {
    ids.add(managerRow.managerId);
  }
  if (managerPerson?.id && Number.isInteger(managerPerson.id)) {
    ids.add(managerPerson.id);
  }
  return [...ids];
}

/**
 * Portal user IDs for manager broadcast: customers (corporates under this manager) or executives on the team.
 * @param managerRow - Manager Sequelize model instance (needs managerId, email)
 * @param {"customers"|"executives"} audience
 */
async function resolveBroadcastRecipientUserIds(managerRow, audience) {
  if (!managerRow?.managerId || !audience) return [];

  if (audience === "customers") {
    const scopeIds = await resolveCorporateManagerScopeIds(managerRow);
    if (!scopeIds.length) return [];

    const corporateIds = new Set();

    const corporates = await Corporate.findAll({
      where: { managerId: { [Op.in]: scopeIds } },
      attributes: ["corporateId"],
    });
    for (const c of corporates) {
      if (c.corporateId) corporateIds.add(c.corporateId);
    }

    const accounts = await Account.findAll({
      where: { managerId: { [Op.in]: scopeIds } },
      attributes: ["corporateId"],
    });
    for (const a of accounts) {
      if (a.corporateId != null && a.corporateId > 0) corporateIds.add(a.corporateId);
    }

    const ids = new Set();
    for (const corporateId of corporateIds) {
      const contacts = await AccountManager.findAll({ where: { corporateId } });
      for (const am of contacts) {
        if (!am.email) continue;
        const u = await User.findOne({
          where: { role: "customer", email: am.email },
          attributes: ["id"],
        });
        const uid = u?.id != null ? normalizeUserId(u.id) : null;
        if (uid) ids.add(uid);
      }
    }
    return [...ids];
  }

  if (audience === "executives") {
    const execs = await ExecutiveStaff.findAll({
      where: { managerId: managerRow.managerId },
      attributes: ["userId"],
    });
    const ids = new Set();
    for (const e of execs) {
      const uid = e.userId != null ? normalizeUserId(e.userId) : null;
      if (uid) ids.add(uid);
    }
    return [...ids];
  }

  return [];
}

module.exports = {
  createNotification,
  createForUserIds,
  resolveManagerTeamNotificationUserIds,
  resolveBroadcastRecipientUserIds,
};
