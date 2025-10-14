const { query } = require('../config/database');
const User = require('../models/User');
const logger = require('../utils/logger');

exports.followUser = async (req, res) => {
  try {
    const followerId = req.userId;
    const { userId: followingId } = req.params;
    
    if (followerId === followingId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    // Check if user exists
    const userExists = await User.findById(followingId);
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Insert follow relationship
    await query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_id, following_id) DO NOTHING`,
      [followerId, followingId]
    );
    
    logger.info(`User ${followerId} followed ${followingId}`);
    
    res.json({ message: 'Successfully followed user' });
  } catch (error) {
    logger.error('Follow user error:', error);
    res.status(500).json({ error: 'Failed to follow user' });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const followerId = req.userId;
    const { userId: followingId } = req.params;
    
    await query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    
    logger.info(`User ${followerId} unfollowed ${followingId}`);
    
    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    logger.error('Unfollow user error:', error);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
};

exports.getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT u.id, u.username, u.profile_image_url, u.bio,
              w.lifetime_points_earned,
              (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
       FROM follows f
       JOIN users u ON f.follower_id = u.id
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE f.following_id = $1 AND u.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({ followers: result.rows });
  } catch (error) {
    logger.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to get followers' });
  }
};

exports.getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT u.id, u.username, u.profile_image_url, u.bio,
              w.lifetime_points_earned,
              (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
       FROM follows f
       JOIN users u ON f.following_id = u.id
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE f.follower_id = $1 AND u.deleted_at IS NULL
       ORDER BY f.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({ following: result.rows });
  } catch (error) {
    logger.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to get following' });
  }
};

exports.checkFollowing = async (req, res) => {
  try {
    const followerId = req.userId;
    const { userId: followingId } = req.params;
    
    const result = await query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    
    res.json({ isFollowing: result.rows.length > 0 });
  } catch (error) {
    logger.error('Check following error:', error);
    res.status(500).json({ error: 'Failed to check following status' });
  }
};

exports.getFeed = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 20, offset = 0 } = req.query;
    
    // Get activities from users you follow
    const result = await query(
      `SELECT 
        'bet_created' as type,
        b.id as reference_id,
        b.creator_id as user_id,
        u.username,
        u.profile_image_url,
        b.name as bet_name,
        b.stake_amount,
        b.created_at as timestamp
       FROM bets b
       JOIN users u ON b.creator_id = u.id
       WHERE b.creator_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
         OR b.is_public = true
       
       UNION ALL
       
       SELECT 
        'bet_completed' as type,
        b.id as reference_id,
        bp.user_id,
        u.username,
        u.profile_image_url,
        b.name as bet_name,
        bp.payout_amount as stake_amount,
        b.end_time as timestamp
       FROM bet_participants bp
       JOIN bets b ON bp.bet_id = b.id
       JOIN users u ON bp.user_id = u.id
       WHERE bp.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
         AND b.status = 'completed'
         AND bp.payout_amount > 0
       
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    res.json({ feed: result.rows });
  } catch (error) {
    logger.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
};

exports.getGlobalLeaderboard = async (req, res) => {
  try {
    const { timePeriod = 'alltime', limit = 100 } = req.query;
    
    let timeFilter = '';
    if (timePeriod === 'week') {
      timeFilter = "AND b.end_time >= NOW() - INTERVAL '7 days'";
    } else if (timePeriod === 'month') {
      timeFilter = "AND b.end_time >= NOW() - INTERVAL '30 days'";
    }
    
    const result = await query(
      `SELECT 
        u.id,
        u.username,
        u.profile_image_url,
        w.lifetime_points_earned as points,
        COUNT(DISTINCT CASE WHEN bp.final_position = 1 THEN bp.bet_id END) as wins,
        COUNT(DISTINCT bp.bet_id) as total_bets,
        CASE 
          WHEN COUNT(DISTINCT bp.bet_id) > 0 
          THEN ROUND((COUNT(DISTINCT CASE WHEN bp.final_position = 1 THEN bp.bet_id END)::DECIMAL / COUNT(DISTINCT bp.bet_id) * 100), 1)
          ELSE 0
        END as win_rate,
        ROW_NUMBER() OVER (ORDER BY w.lifetime_points_earned DESC) as rank
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       LEFT JOIN bet_participants bp ON u.id = bp.user_id
       LEFT JOIN bets b ON bp.bet_id = b.id AND b.status = 'completed' ${timeFilter}
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, u.username, u.profile_image_url, w.lifetime_points_earned
       ORDER BY w.lifetime_points_earned DESC
       LIMIT $1`,
      [limit]
    );
    
    res.json({ leaderboard: result.rows });
  } catch (error) {
    logger.error('Get global leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
};

exports.getFriendsLeaderboard = async (req, res) => {
  try {
    const userId = req.userId;
    const { timePeriod = 'alltime' } = req.query;
    
    let timeFilter = '';
    if (timePeriod === 'week') {
      timeFilter = "AND b.end_time >= NOW() - INTERVAL '7 days'";
    } else if (timePeriod === 'month') {
      timeFilter = "AND b.end_time >= NOW() - INTERVAL '30 days'";
    }
    
    const result = await query(
      `SELECT 
        u.id,
        u.username,
        u.profile_image_url,
        w.lifetime_points_earned as points,
        COUNT(DISTINCT CASE WHEN bp.final_position = 1 THEN bp.bet_id END) as wins,
        COUNT(DISTINCT bp.bet_id) as total_bets,
        CASE 
          WHEN COUNT(DISTINCT bp.bet_id) > 0 
          THEN ROUND((COUNT(DISTINCT CASE WHEN bp.final_position = 1 THEN bp.bet_id END)::DECIMAL / COUNT(DISTINCT bp.bet_id) * 100), 1)
          ELSE 0
        END as win_rate,
        ROW_NUMBER() OVER (ORDER BY w.lifetime_points_earned DESC) as rank
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       LEFT JOIN bet_participants bp ON u.id = bp.user_id
       LEFT JOIN bets b ON bp.bet_id = b.id AND b.status = 'completed' ${timeFilter}
       WHERE u.id IN (
         SELECT following_id FROM follows WHERE follower_id = $1
         UNION
         SELECT $1
       )
       AND u.deleted_at IS NULL
       GROUP BY u.id, u.username, u.profile_image_url, w.lifetime_points_earned
       ORDER BY w.lifetime_points_earned DESC`,
      [userId]
    );
    
    res.json({ leaderboard: result.rows });
  } catch (error) {
    logger.error('Get friends leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const { q: searchTerm, limit = 20 } = req.query;
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }
    
    const users = await User.search(searchTerm, limit);
    
    res.json({ users });
  } catch (error) {
    logger.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const stats = await User.getStats(userId);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        profileImageUrl: user.profile_image_url,
        bio: user.bio,
        handicap: user.handicap,
        isJudge: user.is_judge,
        judgeRating: user.judge_rating,
        followersCount: user.followers_count || 0,
        followingCount: user.following_count || 0,
        createdAt: user.created_at
      },
      stats
    });
  } catch (error) {
    logger.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserId = req.userId;
    const { limit = 50, offset = 0 } = req.query;

    const limitInt = parseInt(limit);
    const offsetInt = parseInt(offset);

    // Get all users except the current user with their stats
    const result = await query(
      `SELECT 
        u.id,
        u.username,
        u.profile_image_url,
        w.lifetime_points_earned,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
        (SELECT COUNT(*) FROM bet_participants WHERE user_id = u.id) as total_bets,
        (SELECT COUNT(*) FROM bet_participants WHERE user_id = u.id AND payout_amount > 0) as wins
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.id != $1 AND u.deleted_at IS NULL
       ORDER BY w.lifetime_points_earned DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [currentUserId, limitInt, offsetInt]
    );

    // Calculate win rate for each user
    const usersWithStats = result.rows.map(user => {
      const totalBets = parseInt(user.total_bets) || 0;
      const wins = parseInt(user.wins) || 0;
      const winRate = totalBets > 0 ? Math.round((wins / totalBets) * 100) : 0;

      return {
        id: user.id,
        username: user.username,
        profile_image_url: user.profile_image_url,
        followers_count: parseInt(user.followers_count) || 0,
        following_count: parseInt(user.following_count) || 0,
        lifetime_points_earned: parseInt(user.lifetime_points_earned) || 0,
        total_winnings: parseInt(user.lifetime_points_earned) || 0,
        total_bets: totalBets,
        win_rate: winRate,
      };
    });

    res.json({
      users: usersWithStats,
      total: usersWithStats.length,
      limit: limitInt,
      offset: offsetInt,
    });
  } catch (error) {
    logger.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};