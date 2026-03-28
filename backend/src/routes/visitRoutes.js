const express = require("express");
const router = express.Router();
const visitController = require("../controller/visitController");

// Executive creates a visit
router.post("/", visitController.createVisit);

// Executive gets their visits
router.get("/my", visitController.getMyVisits);

// Customer gets their visits
router.get("/customer", visitController.getCustomerVisits);

// Manager / admin get all visits
router.get("/all", visitController.getAllVisits);

// Manager gets visits scoped to their executives
router.get("/manager/visits", visitController.getManagerVisits);

// Manager gets control cards scoped to their executives
router.get("/manager/control-cards", visitController.getManagerControlCards);

// Manager gets pending reschedule requests
router.get("/reschedules/pending", visitController.getPendingReschedules);

// Customer responds (approve / decline / reschedule)
router.put("/:visitId/respond", visitController.respondToVisit);

// Executive requests reschedule (needs manager approval)
router.put("/:visitId/request-reschedule", visitController.requestReschedule);

// Manager approves/rejects reschedule
router.put("/:visitId/approve-reschedule", visitController.approveReschedule);

// Executive submits control card
router.put("/:visitId/control-card", visitController.submitControlCard);

// Get control card for a visit
router.get("/:visitId/control-card", visitController.getControlCard);

// Executive updates control card (post-completion fields)
router.patch("/:visitId/control-card", visitController.updateControlCard);

// Customer submits rating
router.put("/:visitId/rating", visitController.submitRating);

// Executive / manager updates visit (accept reschedule, complete, cancel)
router.put("/:visitId", visitController.updateVisit);

module.exports = router;
