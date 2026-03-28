const Notification = require("../models/Notification");

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
};
