const express = require("express");
const router = express.Router();
const leadController = require("../controller/leadController");
const auth = require("../middleware/auth");

router.post("/", auth, leadController.createLead);
router.get("/", auth, leadController.getMyLeads);
router.get("/team", auth, leadController.getTeamLeads);

module.exports = router;
