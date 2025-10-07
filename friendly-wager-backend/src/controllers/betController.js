const Bet = require('../models/Bet');
const User = require('../models/User');
const logger = require('../utils/logger');
const { query } = require('../config/database');

exports.createBet = async (req, res) => {
  try {
    const creatorId = req.userId;
    const betData = req.body;
    
    // Verify user has sufficient balance
    const user = await User.findById(creatorId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const stakeCurrency = betData.stakeCurrency || 'points';
    const balance = stakeCurrency === 'points' ? user.points_balance : user.cash_balance;
    
    if (balance < betData.stakeAmount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        required: betData.stakeAmount,
        available: balance
      });
    }
    
    const bet = await Bet.create(creatorId, betData);
    
    logger.info(`Bet created: ${bet.id} by user ${creatorId}`);
    
    res.status(201).json({
      message: 'Bet created successfully',
      bet: {
        id: bet.id,
        betCode: bet.bet_code,
        name: bet.name,
        betType: bet.bet_type,
        stakeAmount: bet.stake_amount,
        stakeCurrency: bet.stake_currency,
        maxPlayers: bet.max_players,
        status: bet.status,
        createdAt: bet.created_at
      }
    });
  } catch (error) {
    logger.error('Create bet error:', error);
    res.status(500).json({ 
      error: 'Failed to create bet',
      message: error.message 
    });
  }
};

exports.getBetById = async (req, res) => {
  try {
    const { betId } = req.params;
    
    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    
    const participants = await Bet.getParticipants(betId);
    
    res.json({
      bet: {
        ...bet,
        settings: typeof bet.settings === 'string' ? JSON.parse(bet.settings) : bet.settings
      },
      participants
    });
  } catch (error) {
    logger.error('Get bet error:', error);
    res.status(500).json({ error: 'Failed to get bet' });
  }
};

exports.getBetByCode = async (req, res) => {
  try {
    const { betCode } = req.params;
    
    const bet = await Bet.findByCode(betCode.toUpperCase());
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    
    const participants = await Bet.getParticipants(bet.id);
    
    res.json({
      bet: {
        ...bet,
        settings: typeof bet.settings === 'string' ? JSON.parse(bet.settings) : bet.settings
      },
      participants
    });
  } catch (error) {
    logger.error('Get bet by code error:', error);
    res.status(500).json({ error: 'Failed to get bet' });
  }
};

exports.joinBet = async (req, res) => {
  try {
    const { betId } = req.params;
    const userId = req.userId;
    
    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    
    await Bet.joinBet(betId, userId, bet.stake_amount, bet.stake_currency);
    
    logger.info(`User ${userId} joined bet ${betId}`);
    
    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.to(`bet:${betId}`).emit('participant_joined', { betId, userId });
    }
    
    res.json({ message: 'Successfully joined bet' });
  } catch (error) {
    logger.error('Join bet error:', error);
    res.status(400).json({ 
      error: 'Failed to join bet',
      message: error.message 
    });
  }
};

exports.leaveBet = async (req, res) => {
  try {
    const { betId } = req.params;
    const userId = req.userId;
    
    // Only allow leaving if bet hasn't started
    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    
    if (bet.status !== 'open') {
      return res.status(400).json({ error: 'Cannot leave a bet that has started' });
    }
    
    // Cannot leave if you're the creator and there are other players
    const participants = await Bet.getParticipants(betId);
    const isCreator = participants.find(p => p.user_id === userId)?.is_creator;
    
    if (isCreator && participants.length > 1) {
      return res.status(400).json({ 
        error: 'Creator cannot leave while other players are in the bet' 
      });
    }
    
    // Refund stake and remove participant
    await query('BEGIN');
    
    await query(
      'DELETE FROM bet_participants WHERE bet_id = $1 AND user_id = $2',
      [betId, userId]
    );
    
    if (bet.stake_currency === 'points') {
      await query(
        `UPDATE wallets 
         SET points_balance = points_balance + $1, escrow_points = escrow_points - $1
         WHERE user_id = $2`,
        [bet.stake_amount, userId]
      );
    }
    
    await query(
      `UPDATE bets 
       SET total_pot = total_pot - $1, current_players = current_players - 1
       WHERE id = $2`,
      [bet.stake_amount, betId]
    );
    
    await query('COMMIT');
    
    logger.info(`User ${userId} left bet ${betId}`);
    
    res.json({ message: 'Successfully left bet' });
  } catch (error) {
    await query('ROLLBACK');
    logger.error('Leave bet error:', error);
    res.status(500).json({ error: 'Failed to leave bet' });
  }
};

exports.updateReadyStatus = async (req, res) => {
  try {
    const { betId } = req.params;
    const { isReady } = req.body;
    const userId = req.userId;
    
    await Bet.updateParticipantReady(betId, userId, isReady);
    
    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.to(`bet:${betId}`).emit('ready_status_changed', { betId, userId, isReady });
    }
    
    res.json({ message: 'Ready status updated' });
  } catch (error) {
    logger.error('Update ready status error:', error);
    res.status(500).json({ error: 'Failed to update ready status' });
  }
};

exports.startBet = async (req, res) => {
  try {
    const { betId } = req.params;
    const userId = req.userId;
    
    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    
    // Verify user is creator
    if (bet.creator_id !== userId) {
      return res.status(403).json({ error: 'Only the creator can start the bet' });
    }
    
    // Check all players are ready
    const participants = await Bet.getParticipants(betId);
    const allReady = participants.every(p => p.is_ready);
    
    if (!allReady) {
      return res.status(400).json({ error: 'All players must be ready' });
    }
    
    const updatedBet = await Bet.startBet(betId);
    
    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.to(`bet:${betId}`).emit('bet_started', { betId });
    }
    
    logger.info(`Bet ${betId} started`);
    
    res.json({ 
      message: 'Bet started',
      bet: updatedBet
    });
  } catch (error) {
    logger.error('Start bet error:', error);
    res.status(500).json({ error: 'Failed to start bet' });
  }
};

exports.submitScore = async (req, res) => {
  try {
    const { betId } = req.params;
    const { holeNumber, score, par } = req.body;
    const userId = req.userId;
    
    // Get participant ID
    const participantResult = await query(
      'SELECT id FROM bet_participants WHERE bet_id = $1 AND user_id = $2',
      [betId, userId]
    );
    
    if (participantResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant in this bet' });
    }
    
    const participantId = participantResult.rows[0].id;
    
    const scoreRecord = await Bet.submitScore(betId, participantId, holeNumber, score, par);
    
    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.to(`bet:${betId}`).emit('score_submitted', { 
        betId, 
        userId, 
        holeNumber, 
        score 
      });
    }
    
    res.json({ 
      message: 'Score submitted',
      score: scoreRecord
    });
  } catch (error) {
    logger.error('Submit score error:', error);
    res.status(500).json({ error: 'Failed to submit score' });
  }
};

exports.getScores = async (req, res) => {
  try {
    const { betId } = req.params;
    
    const scores = await Bet.getScores(betId);
    
    res.json({ scores });
  } catch (error) {
    logger.error('Get scores error:', error);
    res.status(500).json({ error: 'Failed to get scores' });
  }
};

exports.getParticipants = async (req, res) => {
  try {
    const { betId } = req.params;
    
    const participants = await Bet.getParticipants(betId);
    
    res.json({ participants });
  } catch (error) {
    logger.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
};

exports.completeBet = async (req, res) => {
  try {
    const { betId } = req.params;
    const { results } = req.body;
    const userId = req.userId;
    
    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    
    // Verify user is creator
    if (bet.creator_id !== userId) {
      return res.status(403).json({ error: 'Only the creator can complete the bet' });
    }
    
    await Bet.completeBet(betId, results);
    
    // Emit websocket event
    const io = req.app.get('io');
    if (io) {
      io.to(`bet:${betId}`).emit('bet_completed', { betId, results });
    }
    
    logger.info(`Bet ${betId} completed`);
    
    res.json({ message: 'Bet completed and payouts distributed' });
  } catch (error) {
    logger.error('Complete bet error:', error);
    res.status(500).json({ error: 'Failed to complete bet' });
  }
};

exports.getPublicBets = async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const bets = await Bet.getPublicBets(parseInt(limit), parseInt(offset));
    
    res.json({ bets });
  } catch (error) {
    logger.error('Get public bets error:', error);
    res.status(500).json({ error: 'Failed to get public bets' });
  }
};

exports.getMyBets = async (req, res) => {
  try {
    const userId = req.userId;
    const { status } = req.query;
    
    const bets = await Bet.getUserBets(userId, status);
    
    res.json({ bets });
  } catch (error) {
    logger.error('Get my bets error:', error);
    res.status(500).json({ error: 'Failed to get bets' });
  }
};

exports.cancelBet = async (req, res) => {
  try {
    const { betId } = req.params;
    const userId = req.userId;
    
    const bet = await Bet.findById(betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    
    // Verify user is creator
    if (bet.creator_id !== userId) {
      return res.status(403).json({ error: 'Only the creator can cancel the bet' });
    }
    
    if (bet.status !== 'open') {
      return res.status(400).json({ error: 'Can only cancel open bets' });
    }
    
    // Refund all participants
    await query('BEGIN');
    
    const participants = await Bet.getParticipants(betId);
    
    for (const participant of participants) {
      if (bet.stake_currency === 'points') {
        await query(
          `UPDATE wallets 
           SET points_balance = points_balance + $1, escrow_points = escrow_points - $1
           WHERE user_id = $2`,
          [bet.stake_amount, participant.user_id]
        );
      }
      
      await query(
        `INSERT INTO transactions (user_id, type, amount, currency, description, reference_id, status)
         VALUES ($1, 'bet_cancelled', $2, $3, 'Bet cancelled - stake refunded', $4, 'completed')`,
        [participant.user_id, bet.stake_amount, bet.stake_currency, betId]
      );
    }
    
    await query(
      `UPDATE bets SET status = 'cancelled' WHERE id = $1`,
      [betId]
    );
    
    await query('COMMIT');
    
    logger.info(`Bet ${betId} cancelled by creator ${userId}`);
    
    res.json({ message: 'Bet cancelled and stakes refunded' });
  } catch (error) {
    await query('ROLLBACK');
    logger.error('Cancel bet error:', error);
    res.status(500).json({ error: 'Failed to cancel bet' });
  }
};