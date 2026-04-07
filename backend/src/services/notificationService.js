const Notification = require("../models/Notification");
const ExecutiveStaff = require("../models/ExecutiveStaff");
const Manager = require("../models/Manager");
const User = require("../models/User");

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

  return Notification.create({
    userId,
    type,
    title,
    message,
    priority,
    metadata,
  });
}

async function createForUserIds(userIds, payload) {
  const uniqueIds = [...new Set((userIds || []).filter((id) => Number.isInteger(id) && id > 0))];
  if (!uniqueIds.length) return [];

  return Promise.all(uniqueIds.map((userId) => createNotification({ userId, ...payload })));
}

module.exports = {
  createNotification,
  createForUserIds,
  resolveManagerTeamNotificationUserIds,
};
