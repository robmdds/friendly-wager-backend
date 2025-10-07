const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { authenticate } = require('../middleware/auth');

// Follow/Unfollow
router.post('/follow/:userId', authenticate, socialController.followUser);
router.delete('/follow/:userId', authenticate, socialController.unfollowUser);

// Get followers/following
router.get('/followers/:userId', authenticate, socialController.getFollowers);
router.get('/following/:userId', authenticate, socialController.getFollowing);

// Check if following
router.get('/following/:userId/check', authenticate, socialController.checkFollowing);

// Get activity feed
router.get('/feed', authenticate, socialController.getFeed);

// Leaderboard
router.get('/leaderboard/global', authenticate, socialController.getGlobalLeaderboard);
router.get('/leaderboard/friends', authenticate, socialController.getFriendsLeaderboard);

// Search users
router.get('/users/search', authenticate, socialController.searchUsers);

// Get user profile
router.get('/users/:userId', authenticate, socialController.getUserProfile);

module.exports = router;