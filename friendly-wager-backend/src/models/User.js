const { query, transaction } = require('../config/database');
const bcrypt = require('bcrypt');

class User {
  static async create({ email, username, password, dateOfBirth }) {
    const passwordHash = await bcrypt.hash(password, 10);
    
    return transaction(async (client) => {
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, username, password_hash, date_of_birth)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, username, date_of_birth, created_at`,
        [email.toLowerCase(), username, passwordHash, dateOfBirth]
      );
      
      const user = userResult.rows[0];
      
      // Create wallet with welcome bonus
      await client.query(
        `INSERT INTO wallets (user_id, points_balance)
         VALUES ($1, $2)`,
        [user.id, 1000] // 1000 points welcome bonus
      );
      
      // Record welcome bonus transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, currency, description, status)
         VALUES ($1, 'purchase', 1000, 'points', 'Welcome bonus', 'completed')`,
        [user.id]
      );
      
      return user;
    });
  }
  
  static async findByEmail(email) {
    const result = await query(
      `SELECT u.*, w.points_balance, w.cash_balance, w.escrow_points, w.escrow_cash
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email.toLowerCase()]
    );
    return result.rows[0];
  }
  
  static async findById(id) {
    const result = await query(
      `SELECT u.*, w.points_balance, w.cash_balance, w.escrow_points, w.escrow_cash,
              (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
              (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  }
  
  static async findByUsername(username) {
    const result = await query(
      `SELECT u.*, w.points_balance, w.cash_balance
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.username = $1 AND u.deleted_at IS NULL`,
      [username]
    );
    return result.rows[0];
  }
  
  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
  
  static async update(id, updates) {
    const allowedUpdates = ['username', 'bio', 'handicap', 'profile_image_url', 'phone_number'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });
    
    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    values.push(id);
    const result = await query(
      `UPDATE users 
       SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING id, email, username, bio, handicap, profile_image_url`,
      values
    );
    
    return result.rows[0];
  }
  
  static async updateLastLogin(id) {
    await query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }
  
  static async getStats(userId) {
    const result = await query(
      `SELECT 
        COUNT(DISTINCT bp.bet_id) as total_bets,
        COUNT(DISTINCT CASE WHEN bp.final_position = 1 THEN bp.bet_id END) as wins,
        COUNT(DISTINCT CASE WHEN bp.final_position > 1 THEN bp.bet_id END) as losses,
        COALESCE(SUM(bp.payout_amount), 0) as total_winnings,
        w.lifetime_points_earned,
        w.lifetime_cash_earned
       FROM bet_participants bp
       LEFT JOIN wallets w ON w.user_id = bp.user_id
       WHERE bp.user_id = $1
       GROUP BY w.lifetime_points_earned, w.lifetime_cash_earned`,
      [userId]
    );
    
    const stats = result.rows[0] || {
      total_bets: 0,
      wins: 0,
      losses: 0,
      total_winnings: 0,
      lifetime_points_earned: 0,
      lifetime_cash_earned: 0
    };
    
    stats.win_rate = stats.total_bets > 0 
      ? ((stats.wins / stats.total_bets) * 100).toFixed(1)
      : 0;
    
    return stats;
  }
  
  static async search(searchTerm, limit = 20, offset = 0) {
    const result = await query(
      `SELECT u.id, u.username, u.profile_image_url, u.bio, u.handicap,
              w.lifetime_points_earned,
              (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE (u.username ILIKE $1 OR u.email ILIKE $1)
         AND u.deleted_at IS NULL
       ORDER BY followers_count DESC, u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${searchTerm}%`, limit, offset]
    );
    return result.rows;
  }
  
  static async delete(id) {
    await query(
      'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }
}

module.exports = User;