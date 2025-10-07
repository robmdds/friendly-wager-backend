const User = require('../models/User');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Calculate age helper
function calculateAge(dateOfBirth) {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Generate JWT token
function generateToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

exports.register = async (req, res) => {
  try {
    const { email, password, username, dateOfBirth } = req.body;
    
    // Verify age requirement
    const age = calculateAge(dateOfBirth);
    if (age < 18) {
      return res.status(400).json({
        error: 'You must be 18 or older to register'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'Email already registered'
      });
    }
    
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return res.status(409).json({
        error: 'Username already taken'
      });
    }
    
    // Create user
    const user = await User.create({
      email,
      password,
      username,
      dateOfBirth
    });
    
    // Generate token
    const token = generateToken(user.id);
    
    // Set session
    req.session.userId = user.id;
    req.session.token = token;
    
    logger.info(`New user registered: ${user.id}`);
    
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        dateOfBirth: user.date_of_birth,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }
    
    // Verify password
    const isValid = await User.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }
    
    // Update last login
    await User.updateLastLogin(user.id);
    
    // Generate token
    const token = generateToken(user.id);
    
    // Set session
    req.session.userId = user.id;
    req.session.token = token;
    
    logger.info(`User logged in: ${user.id}`);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        dateOfBirth: user.date_of_birth,
        isVerified: user.is_verified,
        walletBalance: user.points_balance || 0,
        profileImageUrl: user.profile_image_url,
        bio: user.bio,
        handicap: user.handicap
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
};

exports.logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        logger.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ message: 'Logout successful' });
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      dateOfBirth: user.date_of_birth,
      isVerified: user.is_verified,
      walletBalance: user.points_balance || 0,
      cashBalance: user.cash_balance || 0,
      profileImageUrl: user.profile_image_url,
      bio: user.bio,
      handicap: user.handicap,
      followersCount: user.followers_count || 0,
      followingCount: user.following_count || 0,
      isJudge: user.is_judge,
      judgeRating: user.judge_rating
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
};

exports.refresh = async (req, res) => {
  try {
    const token = generateToken(req.userId);
    req.session.token = token;
    
    res.json({ token });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return res.json({ 
        message: 'If that email exists, a password reset link has been sent' 
      });
    }
    
    // TODO: Generate reset token and send email
    // For now, just log
    logger.info(`Password reset requested for user: ${user.id}`);
    
    res.json({ 
      message: 'If that email exists, a password reset link has been sent' 
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    // TODO: Implement password reset logic
    res.status(501).json({ error: 'Password reset not yet implemented' });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};