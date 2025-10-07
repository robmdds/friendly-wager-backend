const { query, transaction } = require('../config/database');

class Bet {
  static generateBetCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
  
  static async create(creatorId, betData) {
    const {
      name,
      description,
      betType,
      stakeAmount,
      stakeCurrency = 'points',
      maxPlayers,
      location,
      courseName,
      latitude,
      longitude,
      scheduledStartTime,
      isPublic = false,
      allowOutsideBackers = false,
      settings = {}
    } = betData;
    
    // Generate unique bet code
    let betCode = this.generateBetCode();
    let codeExists = true;
    
    while (codeExists) {
      const check = await query('SELECT id FROM bets WHERE bet_code = $1', [betCode]);
      if (check.rows.length === 0) {
        codeExists = false;
      } else {
        betCode = this.generateBetCode();
      }
    }
    
    return transaction(async (client) => {
      // Create bet
      const betResult = await client.query(
        `INSERT INTO bets (
          creator_id, bet_code, name, description, bet_type, stake_amount, 
          stake_currency, total_pot, max_players, location, course_name,
          latitude, longitude, scheduled_start_time, is_public, 
          allow_outside_backers, settings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          creatorId, betCode, name, description, betType, stakeAmount,
          stakeCurrency, stakeAmount, maxPlayers, location, courseName,
          latitude, longitude, scheduledStartTime, isPublic,
          allowOutsideBackers, JSON.stringify(settings)
        ]
      );
      
      const bet = betResult.rows[0];
      
      // Add creator as first participant
      await client.query(
        `INSERT INTO bet_participants (bet_id, user_id, is_creator, is_ready)
         VALUES ($1, $2, true, false)`,
        [bet.id, creatorId]
      );
      
      // Deduct stake from creator's wallet (put in escrow)
      if (stakeCurrency === 'points') {
        await client.query(
          `UPDATE wallets 
           SET points_balance = points_balance - $1, escrow_points = escrow_points + $1
           WHERE user_id = $2 AND points_balance >= $1`,
          [stakeAmount, creatorId]
        );
      } else {
        await client.query(
          `UPDATE wallets 
           SET cash_balance = cash_balance - $1, escrow_cash = escrow_cash + $1
           WHERE user_id = $2 AND cash_balance >= $1`,
          [stakeAmount, creatorId]
        );
      }
      
      // Record transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, currency, description, reference_id)
         VALUES ($1, 'bet_placed', $2, $3, $4, $5)`,
        [creatorId, -stakeAmount, stakeCurrency, `Bet stake: ${name}`, bet.id]
      );
      
      return bet;
    });
  }
  
  static async findById(betId) {
    const result = await query(
      `SELECT b.*, 
              u.username as creator_username,
              (SELECT COUNT(*) FROM bet_participants WHERE bet_id = b.id) as participant_count
       FROM bets b
       JOIN users u ON b.creator_id = u.id
       WHERE b.id = $1`,
      [betId]
    );
    return result.rows[0];
  }
  
  static async findByCode(betCode) {
    const result = await query(
      `SELECT b.*, 
              u.username as creator_username,
              (SELECT COUNT(*) FROM bet_participants WHERE bet_id = b.id) as participant_count
       FROM bets b
       JOIN users u ON b.creator_id = u.id
       WHERE b.bet_code = $1`,
      [betCode]
    );
    return result.rows[0];
  }
  
  static async getParticipants(betId) {
    const result = await query(
      `SELECT bp.*, u.username, u.profile_image_url, u.handicap
       FROM bet_participants bp
       JOIN users u ON bp.user_id = u.id
       WHERE bp.bet_id = $1
       ORDER BY bp.joined_at ASC`,
      [betId]
    );
    return result.rows;
  }
  
  static async joinBet(betId, userId, stakeAmount, stakeCurrency) {
    return transaction(async (client) => {
      // Check if bet is still open
      const betCheck = await client.query(
        'SELECT * FROM bets WHERE id = $1 AND status = $2',
        [betId, 'open']
      );
      
      if (betCheck.rows.length === 0) {
        throw new Error('Bet is not open for joining');
      }
      
      const bet = betCheck.rows[0];
      
      // Check if already a participant
      const participantCheck = await client.query(
        'SELECT * FROM bet_participants WHERE bet_id = $1 AND user_id = $2',
        [betId, userId]
      );
      
      if (participantCheck.rows.length > 0) {
        throw new Error('Already joined this bet');
      }
      
      // Check if bet is full
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM bet_participants WHERE bet_id = $1',
        [betId]
      );
      
      if (parseInt(countResult.rows[0].count) >= bet.max_players) {
        throw new Error('Bet is full');
      }
      
      // Add participant
      await client.query(
        `INSERT INTO bet_participants (bet_id, user_id, is_creator, is_ready)
         VALUES ($1, $2, false, false)`,
        [betId, userId]
      );
      
      // Deduct stake from wallet
      if (stakeCurrency === 'points') {
        const walletResult = await client.query(
          `UPDATE wallets 
           SET points_balance = points_balance - $1, escrow_points = escrow_points + $1
           WHERE user_id = $2 AND points_balance >= $1
           RETURNING points_balance`,
          [stakeAmount, userId]
        );
        
        if (walletResult.rows.length === 0) {
          throw new Error('Insufficient balance');
        }
      }
      
      // Update bet total pot and player count
      await client.query(
        `UPDATE bets 
         SET total_pot = total_pot + $1, current_players = current_players + 1
         WHERE id = $2`,
        [stakeAmount, betId]
      );
      
      // Record transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, currency, description, reference_id)
         VALUES ($1, 'bet_placed', $2, $3, $4, $5)`,
        [userId, -stakeAmount, stakeCurrency, `Joined bet: ${bet.name}`, betId]
      );
      
      return true;
    });
  }
  
  static async updateParticipantReady(betId, userId, isReady) {
    const result = await query(
      `UPDATE bet_participants 
       SET is_ready = $3
       WHERE bet_id = $1 AND user_id = $2
       RETURNING *`,
      [betId, userId, isReady]
    );
    return result.rows[0];
  }
  
  static async startBet(betId) {
    const result = await query(
      `UPDATE bets 
       SET status = 'in_progress', actual_start_time = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'open'
       RETURNING *`,
      [betId]
    );
    return result.rows[0];
  }
  
  static async submitScore(betId, participantId, holeNumber, score, par) {
    const result = await query(
      `INSERT INTO bet_scores (bet_id, participant_id, hole_number, par, score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (bet_id, participant_id, hole_number) 
       DO UPDATE SET score = $5
       RETURNING *`,
      [betId, participantId, holeNumber, par, score]
    );
    return result.rows[0];
  }
  
  static async getScores(betId) {
    const result = await query(
      `SELECT bs.*, u.username
       FROM bet_scores bs
       JOIN bet_participants bp ON bs.participant_id = bp.id
       JOIN users u ON bp.user_id = u.id
       WHERE bs.bet_id = $1
       ORDER BY bs.hole_number, u.username`,
      [betId]
    );
    return result.rows;
  }
  
  static async completeBet(betId, results) {
    return transaction(async (client) => {
      // Update bet status
      await client.query(
        `UPDATE bets 
         SET status = 'completed', end_time = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [betId]
      );
      
      // Update participant results and distribute payouts
      for (const result of results) {
        const { participantId, finalScore, finalPosition, payoutAmount } = result;
        
        await client.query(
          `UPDATE bet_participants 
           SET final_score = $2, final_position = $3, payout_amount = $4, payout_received = true
           WHERE id = $1`,
          [participantId, finalScore, finalPosition, payoutAmount]
        );
        
        if (payoutAmount > 0) {
          // Get user_id from participant
          const pResult = await client.query(
            'SELECT user_id FROM bet_participants WHERE id = $1',
            [participantId]
          );
          const userId = pResult.rows[0].user_id;
          
          // Credit wallet
          await client.query(
            `UPDATE wallets 
             SET points_balance = points_balance + $1, 
                 escrow_points = escrow_points - $2,
                 lifetime_points_earned = lifetime_points_earned + $1
             WHERE user_id = $3`,
            [payoutAmount, payoutAmount, userId]
          );
          
          // Record transaction
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, currency, description, reference_id, status)
             VALUES ($1, 'bet_won', $2, 'points', 'Bet winnings', $3, 'completed')`,
            [userId, payoutAmount, betId]
          );
        }
      }
      
      return true;
    });
  }
  
  static async getPublicBets(limit = 20, offset = 0) {
    const result = await query(
      `SELECT b.*, u.username as creator_username,
              (SELECT COUNT(*) FROM bet_participants WHERE bet_id = b.id) as participant_count
       FROM bets b
       JOIN users u ON b.creator_id = u.id
       WHERE b.is_public = true AND b.status = 'open'
       ORDER BY b.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }
  
  static async getUserBets(userId, status = null) {
    let queryText = `
      SELECT b.*, u.username as creator_username,
             bp.is_creator, bp.is_ready, bp.final_score, bp.final_position, bp.payout_amount,
             (SELECT COUNT(*) FROM bet_participants WHERE bet_id = b.id) as participant_count
      FROM bets b
      JOIN users u ON b.creator_id = u.id
      JOIN bet_participants bp ON b.id = bp.bet_id
      WHERE bp.user_id = $1
    `;
    
    const params = [userId];
    
    if (status) {
      queryText += ' AND b.status = $2';
      params.push(status);
    }
    
    queryText += ' ORDER BY b.created_at DESC';
    
    const result = await query(queryText, params);
    return result.rows;
  }
}

module.exports = Bet;