const express = require("express");
const router = express.Router();
const notificationController = require("../controller/notificationController");

router.get("/", notificationController.getMyNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllRead);
router.patch("/:id/read", notificationController.markNotificationRead);

module.exports = router;
