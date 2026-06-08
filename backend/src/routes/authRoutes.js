const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controller/authController');

// Public routes (with stricter rate limiting)
router.post('/register', authLimiter, authController.userRegistration);
router.post('/email', authLimiter, authController.userRegistration); // legacy alias
router.post('/login', authLimiter, authController.userLogin);
router.post('/refresh-token', authController.refreshToken);
router.post('/otp/generate', authLimiter, authController.otpGeneration);
router.post('/otp/validate', authLimiter, authController.validateOTP);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/verify-reset-otp', authLimiter, authController.verifyResetOTP);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Protected routes
const auth = require('../middleware/auth');
const microsoftGraphController = require('../controller/microsoftGraphController');
router.post('/logout', auth, authController.userLogout);
router.get('/me', auth, authController.getProfile);
router.get('/my-accounts', auth, authController.getMyAccounts);
router.get('/my-spending-summary', auth, authController.getMyMonthlySpendingSummary);
router.get('/my-spending-trend', auth, authController.getMyMonthlySpendingTrend);
router.get('/my-expiring-contracts', auth, authController.getMyExpiringContracts);
router.get('/my-account', auth, authController.getMyAccount);

// Executive-scoped corporate contact persons (ownership-checked in controller)
router.get('/my-corporates', auth, authController.getMyCorporates);
router.get('/my-account-managers', auth, authController.getMyAccountManagers);
router.get(
  '/my-corporates/:corporateId/contact-persons',
  auth,
  authController.getMyCorporateContactPersons
);
router.post(
  '/my-corporates/:corporateId/contact-persons',
  auth,
  authController.assignContactPersonToMyCorporate
);
router.post(
  '/my-corporates/:corporateId/contact-persons/new',
  auth,
  authController.createContactPersonForMyCorporate
);
router.delete(
  '/my-corporates/:corporateId/contact-persons/:accountManagerId',
  auth,
  authController.removeContactPersonFromMyCorporate
);

router.put('/profile', auth, authController.updateProfile);
router.put('/change-password', auth, authController.changePassword);

// Microsoft Teams / Outlook calendar (OAuth)
router.get('/microsoft/status', auth, microsoftGraphController.getMicrosoftCalendarStatus);
router.get('/microsoft/connect', auth, microsoftGraphController.connectMicrosoftCalendar);
router.get('/microsoft/callback', microsoftGraphController.microsoftCalendarCallback);
router.delete('/microsoft/disconnect', auth, microsoftGraphController.disconnectMicrosoftCalendar);

module.exports = router;
