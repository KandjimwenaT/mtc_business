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
router.post('/logout', auth, authController.userLogout);
router.get('/me', auth, authController.getProfile);
router.get('/my-accounts', auth, authController.getMyAccounts);
router.get('/my-account', auth, authController.getMyAccount);
router.put('/profile', auth, authController.updateProfile);
router.put('/change-password', auth, authController.changePassword);

module.exports = router;
