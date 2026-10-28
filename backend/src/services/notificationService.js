const { Op } = require("sequelize");
const Notification = require("../models/Notification");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Manager = require("../models/Manager");
const User = require("../models/User");
const Corporate = require("../models/Corporate");
const AccountManager = require("../models/AccountManager");
const Account = require("../models/Account");
const Person = require("../models/Person");

async function resolvePortalUserIdByEmail(email, roles) {
  const trimmed = String(email || "").trim();
  if (!trimmed || !roles?.length) return null;
  const user = await User.findOne({
    where: {
      role: { [Op.in]: roles },
      [Op.or]: [{ email: trimmed }, { email: trimmed.toLowerCase() }],
    },
    attributes: ["id"],
  });
  return user?.id || null;
}

/** Portal user for an executive profile, matching by linked user id or email. */
async function resolveExecutivePortalUserId(executiveId) {
  if (!executiveId) return null;
  const executive = await ExecutiveStaff.findByPk(executiveId);
  if (!executive) return null;
  if (executive.userId) return executive.userId;

  const userId = await resolvePortalUserIdByEmail(executive.email, ["executive_staff", "supervisor"]);
  if (!userId) return null;
  try {
    await executive.update({ userId });
  } catch (err) {
    console.error("Failed to backfill executive user id:", err?.message || err);
  }
  return userId;
}

function emailMatch(email) {
  const trimmed = String(email || "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return lower === trimmed ? { email: trimmed } : { [Op.or]: [{ email: trimmed }, { email: lower }] };
}

async function findManagerByEmail(email) {
  const where = emailMatch(email);
  if (!where) return null;
  return Manager.findOne({ where });
}

/**
 * Line-manager profile for an executive.
 * executive_staff.manager_id should be managers.manager_id, but older rows store persons.id.
 * persons.manager_id is also checked when the staff row has no usable link.
 */
async function resolveLineManagerProfile(executive) {
  if (!executive) return null;

  const candidateIds = [];
  if (executive.managerId) candidateIds.push(executive.managerId);

  const execEmailWhere = emailMatch(executive.email);
  if (execEmailWhere) {
    const execPerson = await Person.findOne({
      where: {
        ...execEmailWhere,
        type: { [Op.in]: ["executive_staff", "supervisor", "admin"] },
      },
      attributes: ["id", "managerId"],
    });
    if (execPerson?.managerId && !candidateIds.includes(execPerson.managerId)) {
      candidateIds.push(execPerson.managerId);
    }
  }

  let resolved = null;
  for (const id of candidateIds) {
    const byPk = await Manager.findByPk(id);
    if (byPk) {
      resolved = byPk;
      break;
    }
    const person = await Person.findByPk(id);
    if (person?.email && ["manager", "supervisor", "gm"].includes(person.type)) {
      const byEmail = await findManagerByEmail(person.email);
      if (byEmail) {
        resolved = byEmail;
        break;
      }
    }
  }

  if (
    resolved &&
    executive.managerId &&
    executive.managerId !== resolved.managerId &&
    typeof executive.update === "function"
  ) {
    try {
      await executive.update({ managerId: resolved.managerId });
    } catch (err) {
      console.error("Failed to align executive manager id:", err?.message || err);
    }
  }

  return resolved;
}

async function resolvePortalUserIdForManagerProfile(manager) {
  if (!manager) return null;
  if (manager.userId) return manager.userId;
  const userId = await resolvePortalUserIdByEmail(manager.email, ["manager", "supervisor", "gm"]);
  if (!userId) return null;
  try {
    await manager.update({ userId });
  } catch (err) {
    console.error("Failed to backfill manager user id:", err?.message || err);
  }
  return userId;
}

/**
 * Manager profile id plus the directory person id, both of which may be stored
 * on executive_staff.manager_id.
 */
async function resolveManagerScopeIds(managerRow) {
  if (!managerRow) return [];
  const ids = new Set();
  if (Number.isInteger(managerRow.managerId) && managerRow.managerId > 0) {
    ids.add(managerRow.managerId);
  }
  const emailWhere = emailMatch(managerRow.email);
  if (emailWhere) {
    const managerPerson = await Person.findOne({
      where: {
        ...emailWhere,
        type: { [Op.in]: ["manager", "supervisor"] },
      },
      attributes: ["id"],
    });
    if (managerPerson?.id && Number.isInteger(managerPerson.id)) {
      ids.add(managerPerson.id);
    }
  }
  return [...ids];
}

/** Executive profile ids that report to this manager (profile id or legacy person id). */
async function resolveExecutiveIdsReportingToManager(managerRow) {
  const scopeIds = await resolveManagerScopeIds(managerRow);
  if (!scopeIds.length) return [];
  const execs = await ExecutiveStaff.findAll({
    where: { managerId: { [Op.in]: scopeIds } },
    attributes: ["executiveId"],
  });
  return [...new Set(execs.map((row) => row.executiveId).filter(Boolean))];
}

/**
 * Executive profile ids a manager or supervisor may oversee.
 * Supervisors follow their ExecutiveStaff line manager (teammates are not moved
 * onto the supervisor's own Manager row).
 */
async function resolveOversightExecutiveIds(user) {
  if (!user?.id) return [];

  if (user.role === "supervisor") {
    const exec = await ExecutiveStaff.findOne({ where: { userId: user.id } });
    if (exec) {
      const lineManager = await resolveLineManagerProfile(exec);
      if (lineManager) {
        const ids = await resolveExecutiveIdsReportingToManager(lineManager);
        if (ids.length) return ids;
      }
      if (exec.managerId) {
        const team = await ExecutiveStaff.findAll({
          where: { managerId: exec.managerId },
          attributes: ["executiveId"],
        });
        const ids = team.map((row) => row.executiveId).filter(Boolean);
        if (ids.length) return ids;
      }
      return exec.executiveId ? [exec.executiveId] : [];
    }
  }

  let manager = await Manager.findOne({ where: { userId: user.id } });
  if (!manager && user.email) manager = await findManagerByEmail(user.email);
  if (!manager) return [];
  return resolveExecutiveIdsReportingToManager(manager);
}

/**
 * Portal user IDs that should receive manager-style alerts for this executive's team:
 * the line manager (Manager.userId) plus any supervisors whose ExecutiveStaff row
 * shares the same managerId (same team).
 */
async function resolveManagerTeamNotificationUserIds(executiveId) {
  if (!executiveId) return [];
  const executive = await ExecutiveStaff.findByPk(executiveId);
  if (!executive) return [];

  const ids = [];
  const manager = await resolveLineManagerProfile(executive);
  const managerUserId = await resolvePortalUserIdForManagerProfile(manager);
  if (managerUserId) ids.push(managerUserId);

  if (!managerUserId && executive.managerId) {
    const person = await Person.findByPk(executive.managerId);
    if (person?.email && ["manager", "supervisor", "gm"].includes(person.type)) {
      const fallbackUserId = await resolvePortalUserIdByEmail(person.email, ["manager", "supervisor", "gm"]);
      if (fallbackUserId) ids.push(fallbackUserId);
    }
  }

  const scopeIds = new Set(await resolveManagerScopeIds(manager));
  if (executive.managerId) scopeIds.add(executive.managerId);
  if (!scopeIds.size) return [...new Set(ids)];

  const teamRows = await ExecutiveStaff.findAll({
    where: { managerId: { [Op.in]: [...scopeIds] } },
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

/** Create the notification only for users who do not already have the same type + title. */
async function createForUserIdsIfMissing(userIds, payload, options = {}) {
  const uniqueIds = [...new Set((userIds || []).map(normalizeUserId).filter(Boolean))];
  if (!uniqueIds.length || !payload?.type || !payload?.title) return [];

  const existing = await Notification.findAll({
    where: {
      userId: { [Op.in]: uniqueIds },
      type: payload.type,
      title: payload.title,
    },
    attributes: ["userId"],
  });
  const already = new Set(existing.map((row) => row.userId));
  const pending = uniqueIds.filter((id) => !already.has(id));
  if (!pending.length) return [];
  return createForUserIds(pending, payload, options);
}

/**
 * Copy an executive's task alert to their line manager and team supervisors.
 * Skips anyone in excludeUserIds (usually the person who performed the action).
 */
async function notifyManagerTeam(executiveId, payload, options = {}) {
  const ids = await resolveManagerTeamNotificationUserIds(executiveId);
  const excluded = new Set((options.excludeUserIds || []).map(normalizeUserId).filter(Boolean));
  const targets = ids.filter((id) => !excluded.has(id));
  if (!targets.length) return [];
  if (options.once) return createForUserIdsIfMissing(targets, payload, options);
  return createForUserIds(targets, payload, options);
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
  createForUserIdsIfMissing,
  notifyManagerTeam,
  resolveExecutivePortalUserId,
  resolveManagerTeamNotificationUserIds,
  resolveExecutiveIdsReportingToManager,
  resolveLineManagerProfile,
  resolveOversightExecutiveIds,
  resolveBroadcastRecipientUserIds,
};
