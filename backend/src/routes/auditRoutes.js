const express = require("express");
const router = express.Router();
const auditController = require("../controller/auditController");

router.get("/", auditController.listAuditLogs);

module.exports = router;
