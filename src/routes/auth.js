const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { rateLimitAuth } = require('../middleware/rateLimit');
const { authenticate } = require('../middleware/auth');

// Register new user
router.post('/register', rateLimitAuth, validateRegistration, authController.register);

// Login
router.post('/login', rateLimitAuth, validateLogin, authController.login);

// Logout
router.post('/logout', authenticate, authController.logout);

// Get current user
router.get('/me', authenticate, authController.getCurrentUser);

// Refresh session
router.post('/refresh', authenticate, authController.refresh);

// Request password reset
router.post('/forgot-password', rateLimitAuth, authController.forgotPassword);

// Reset password
router.post('/reset-password', rateLimitAuth, authController.resetPassword);

module.exports = router;