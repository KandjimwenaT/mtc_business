const express = require("express");
const router = express.Router();
const accountRequestController = require("../controller/accountRequestController");

// Customer routes
router.post("/", accountRequestController.createRequest);
router.get("/my", accountRequestController.getMyRequests);

// Executive staff routes
router.get("/assigned", accountRequestController.getAssignedRequests);

// Update request status (executive staff / manager / admin)
router.put("/:requestId", accountRequestController.updateRequestStatus);

module.exports = router;
