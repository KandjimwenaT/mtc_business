const express = require("express");
const router = express.Router();
const ticketController = require("../controller/ticketController");
const ticketUpload = require("../middleware/ticketUpload");

const handleTicketUpload = (req, res, next) => {
  ticketUpload.single("attachment")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        status: "Failed",
        message: err.message || "Invalid attachment upload",
      });
    }
    next();
  });
};

// Customer routes
router.post("/", handleTicketUpload, ticketController.createTicket);
router.get("/my", ticketController.getMyTickets);

// Executive staff routes
router.get("/assigned", ticketController.getAssignedTickets);

// Manager / admin
router.get("/all", ticketController.getAllTickets);
router.get("/:ticketId", ticketController.getTicketById);
router.post("/:ticketId/internal-notes", ticketController.addInternalNote);

// Update ticket (executive staff / manager / admin)
router.put("/:ticketId", ticketController.updateTicket);

module.exports = router;
