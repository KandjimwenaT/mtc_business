const xss = require("xss");
const { Op } = require("sequelize");
const Notification = require("../models/Notification");
const Manager = require("../models/Manager");
const {
  createForUserIds,
  createNotification,
  resolveBroadcastRecipientUserIds,
} = require("../services/notificationService");

exports.getMyNotifications = async (req, res) => {
  try {
    const unreadOnly = String(req.query.unreadOnly || "").toLowerCase() === "true";
    const where = {
      userId: req.user.id,
      ...(unreadOnly ? { read: false } : {}),
    };

    const notifications = await Notification.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({ status: "Success", notifications });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.count({
      where: { userId: req.user.id, read: false },
    });

    return res.status(200).json({ status: "Success", unreadCount: count });
  } catch (error) {
    console.error("Get unread count error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByPk(id);

    if (!notification) {
      return res.status(404).json({ status: "Failed", message: "Notification not found" });
    }

    if (notification.userId !== req.user.id) {
      return res.status(403).json({ status: "Failed", message: "Forbidden" });
    }

    notification.read = true;
    await notification.save();

    return res.status(200).json({ status: "Success", notification });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.update(
      { read: true },
      { where: { userId: req.user.id, read: { [Op.ne]: true } } }
    );

    return res.status(200).json({ status: "Success", message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};

exports.broadcast = async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ status: "Failed", message: "Only managers can send broadcasts" });
    }

    const manager = await Manager.findOne({ where: { userId: req.user.id } });
    if (!manager) {
      return res.status(404).json({ status: "Failed", message: "Manager profile not found" });
    }

    const title = xss(String(req.body.title || "").trim());
    const message = xss(String(req.body.message || "").trim());
    const audience = String(req.body.audience || "").toLowerCase();

    if (!title || !message) {
      return res.status(400).json({ status: "Failed", message: "Title and message are required" });
    }
    if (!["customers", "executives"].includes(audience)) {
      return res.status(400).json({ status: "Failed", message: "audience must be customers or executives" });
    }

    let attachmentUrl = null;
    if (req.file) {
      attachmentUrl = `/uploads/broadcasts/${req.file.filename}`;
    }

    const metadata = {
      broadcast: true,
      audience,
      fromManagerId: manager.managerId,
      ...(attachmentUrl ? { attachmentUrl } : {}),
    };

    const userIds = await resolveBroadcastRecipientUserIds(manager, audience);

    if (userIds.length) {
      await createForUserIds(userIds, {
        type: "broadcast",
        title,
        message,
        priority: "normal",
        metadata,
      });
    }

    // Always record a copy for the sender so it appears under Notifications → Announcements.
    await createNotification({
      userId: req.user.id,
      type: "broadcast",
      title,
      message,
      priority: "normal",
      metadata: {
        ...metadata,
        sentByManager: true,
        recipientCount: userIds.length,
      },
    });

    return res.status(200).json({
      status: "Success",
      recipientCount: userIds.length,
      ...(userIds.length
        ? {}
        : { message: "No recipients found for this audience; a copy was saved to your announcements." }),
    });
  } catch (error) {
    console.error("Broadcast notification error:", error);
    return res.status(500).json({ status: "Failed", message: "Internal server error" });
  }
};
