const express = require("express");
const router = express.Router();
const complaintController = require("../controller/complaintController");

// Customer routes
router.post("/", complaintController.createComplaint);
router.get("/my", complaintController.getMyComplaints);

// Executive staff routes
router.get("/assigned", complaintController.getAssignedComplaints);

// Update complaint status (executive staff / manager / admin)
router.put("/:complaintId", complaintController.updateComplaintStatus);

module.exports = router;
