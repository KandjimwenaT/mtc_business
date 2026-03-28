const express = require("express");
const router = express.Router();
const adminController = require("../controller/adminController");

// All routes are protected by auth + superAdminAuth middleware (applied in server.js)

// Person management (database records)
router.post("/persons", adminController.createPerson);
router.get("/persons", adminController.getPersonsByType);

// Hierarchy dropdowns
router.get("/gms", adminController.getGMs);
router.get("/managers", adminController.getManagers);
router.get("/executives", adminController.getExecutives);
router.put("/executives/:executivePersonId/promote-supervisor", adminController.promoteExecutiveToSupervisor);

// Portal access management
router.post("/portal-access", adminController.createPortalAccess);
router.delete("/portal-users/:userId", adminController.revokePortalAccess);
router.get("/portal-users", adminController.getPortalUsers);

// Customer account management
router.post("/corporates", adminController.createCorporate);
router.get("/corporates", adminController.getCorporates);
router.get("/corporates/no-contact-persons", adminController.getCorporatesWithoutContactPersons);
router.post("/corporates/:corporateId/submit-approval", adminController.submitCorporateApproval);
router.put("/corporates/:corporateId/approve", adminController.approveCorporate);
router.put("/corporates/:corporateId/reassign-executive", adminController.reassignCorporateExecutive);
router.post("/accounts", adminController.createAccount);
router.get("/accounts", adminController.getAccounts);
router.put("/accounts/:accountId/approve", adminController.approveAccount);
router.post("/accounts/:accountId/contracts", adminController.createContract);
router.get("/accounts/:accountId/contracts", adminController.getAccountContracts);
router.post("/accounts/:accountId/services", adminController.createService);
router.get("/accounts/:accountId/services", adminController.getAccountServices);
router.put("/accounts/:accountId/services/:serviceId", adminController.updateServiceStatus);
router.delete("/accounts/:accountId/services/:serviceId", adminController.deleteService);

module.exports = router;
