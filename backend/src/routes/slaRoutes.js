const express = require("express");
const router = express.Router();
const slaController = require("../controller/slaController");

router.get("/", slaController.listSlaConfigs);
router.put("/", slaController.saveSlaConfigs);

module.exports = router;
