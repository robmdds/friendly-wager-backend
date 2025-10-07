const User = require('../models/User');
const { query } = require('../config/database');
const logger = require('../utils/logger');

exports.getProfile = async (req, res) => {
  try {
    const userId = req.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      dateOfBirth: user.date_of_birth,
      phoneNumber: user.phone_number,
      profileImageUrl: user.profile_image_url,
      bio: user.bio,
      handicap: user.handicap,
      isVerified: user.is_verified,
      isJudge: user.is_judge,
      judgeRating: user.judge_rating,
      followersCount: user.followers_count || 0,
      followingCount: user.following_count || 0,
      walletBalance: user.points_balance || 0,
      createdAt: user.created_at
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const updates = req.body;
    
    const updatedUser = await User.update(userId, updates);
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    logger.info(`User ${userId} updated profile`);
    
    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ 
      error: 'Failed to update profile',
      message: error.message
    });
  }
};

exports.getStats = async (req, res) => {
  try {
    const userId = req.userId;
    
    const stats = await User.getStats(userId);
    
    res.json(stats);
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
};

exports.uploadProfileImage = async (req, res) => {
  try {
    // TODO: Implement actual image upload to S3 or similar
    // For now, just accept a URL
    const userId = req.userId;
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }
    
    await User.update(userId, { profile_image_url: imageUrl });
    
    res.json({ 
      message: 'Profile image updated',
      imageUrl 
    });
  } catch (error) {
    logger.error('Upload profile image error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

exports.getAchievements = async (req, res) => {
  try {
    const userId = req.userId;
    
    const result = await query(
      `SELECT a.*, ua.earned_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
       ORDER BY ua.earned_at DESC NULLS LAST, a.rarity DESC`,
      [userId]
    );
    
    const earned = result.rows.filter(a => a.earned_at);
    const available = result.rows.filter(a => !a.earned_at);
    
    res.json({
      earned,
      available,
      totalEarned: earned.length,
      totalAvailable: result.rows.length
    });
  } catch (error) {
    logger.error('Get achievements error:', error);
    res.status(500).json({ error: 'Failed to get achievements' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.userId;
    const { password } = req.body;
    
    // Verify password before deletion
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isValid = await User.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    await User.delete(userId);
    
    // Destroy session
    req.session.destroy();
    
    logger.info(`User ${userId} deleted account`);
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};