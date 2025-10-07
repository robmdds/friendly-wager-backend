const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

exports.authenticate = async (req, res, next) => {
  try {
    // Check for token in header or session
    const authHeader = req.headers.authorization;
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.session && req.session.token) {
      token = req.session.token;
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user ID to request
    req.userId = decoded.userId;
    req.token = token;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    logger.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.session && req.session.token) {
      token = req.session.token;
    }
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      req.token = token;
    }
    
    next();
  } catch (error) {
    // Don't fail, just proceed without auth
    next();
  }
};

exports.requireVerified = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.is_verified) {
      return res.status(403).json({ 
        error: 'Email verification required',
        verified: false
      });
    }
    
    next();
  } catch (error) {
    logger.error('Verification check error:', error);
    res.status(500).json({ error: 'Verification check failed' });
  }
};

exports.requireKYC = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.kyc_verified) {
      return res.status(403).json({ 
        error: 'KYC verification required for cash transactions',
        kycVerified: false
      });
    }
    
    next();
  } catch (error) {
    logger.error('KYC check error:', error);
    res.status(500).json({ error: 'KYC check failed' });
  }
};