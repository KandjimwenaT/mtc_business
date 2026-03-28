const { Op } = require("sequelize");
const Notification = require("../models/Notification");

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
