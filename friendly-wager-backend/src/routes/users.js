const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// Get user profile
router.get('/profile', authenticate, userController.getProfile);

// Update user profile
router.patch('/profile', authenticate, userController.updateProfile);

// Get user stats
router.get('/stats', authenticate, userController.getStats);

// Upload profile image
router.post('/profile/image', authenticate, userController.uploadProfileImage);

// Get user achievements
router.get('/achievements', authenticate, userController.getAchievements);

// Delete account
router.delete('/account', authenticate, userController.deleteAccount);

module.exports = router;