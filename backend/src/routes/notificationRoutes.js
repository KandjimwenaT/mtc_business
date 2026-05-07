const express = require("express");
const multer = require("multer");
const router = express.Router();
const notificationController = require("../controller/notificationController");
const broadcastUpload = require("../middleware/broadcastUpload");

const handleBroadcastUpload = (req, res, next) => {
  broadcastUpload.single("attachment")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          status: "Failed",
          message: err.code === "LIMIT_FILE_SIZE" ? "Attachment must be 5MB or smaller" : err.message,
        });
      }
      return res.status(400).json({ status: "Failed", message: err.message || "Upload failed" });
    }
    next();
  });
};

router.get("/", notificationController.getMyNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllRead);
router.post("/broadcast", handleBroadcastUpload, notificationController.broadcast);
router.patch("/:id/read", notificationController.markNotificationRead);

module.exports = router;
