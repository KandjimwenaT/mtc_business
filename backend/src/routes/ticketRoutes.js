const express = require("express");
const router = express.Router();
const ticketController = require("../controller/ticketController");

// Customer routes
router.post("/", ticketController.createTicket);
router.get("/my", ticketController.getMyTickets);

// Executive staff routes
router.get("/assigned", ticketController.getAssignedTickets);

// Manager / admin
router.get("/all", ticketController.getAllTickets);
router.get("/:ticketId", ticketController.getTicketById);

// Update ticket (executive staff / manager / admin)
router.put("/:ticketId", ticketController.updateTicket);

module.exports = router;
