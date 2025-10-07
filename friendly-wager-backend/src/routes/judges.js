const express = require('express');
const { authenticate } = require('../middleware/auth');
const judgeRouter = express.Router();

// Get available judges
judgeRouter.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.profile_image_url, u.judge_rating, u.total_disputes_judged
       FROM users u
       WHERE u.is_judge = true AND u.deleted_at IS NULL
       ORDER BY u.judge_rating DESC, u.total_disputes_judged DESC
       LIMIT 20`
    );
    
    res.json({ judges: result.rows });
  } catch (error) {
    logger.error('Get judges error:', error);
    res.status(500).json({ error: 'Failed to get judges' });
  }
});

// Create dispute
judgeRouter.post('/disputes', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { betId, reportedAgainst, disputeType, description, evidenceUrls } = req.body;
    
    const result = await query(
      `INSERT INTO disputes (bet_id, reported_by, reported_against, dispute_type, description, evidence_urls)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [betId, userId, reportedAgainst, disputeType, description, evidenceUrls]
    );
    
    logger.info(`Dispute created for bet ${betId} by user ${userId}`);
    
    res.status(201).json({
      message: 'Dispute created successfully',
      dispute: result.rows[0]
    });
  } catch (error) {
    logger.error('Create dispute error:', error);
    res.status(500).json({ error: 'Failed to create dispute' });
  }
});

// Get disputes
judgeRouter.get('/disputes', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { status } = req.query;
    
    let queryText = `
      SELECT d.*, 
             b.name as bet_name,
             u1.username as reported_by_username,
             u2.username as reported_against_username,
             u3.username as judge_username
      FROM disputes d
      JOIN bets b ON d.bet_id = b.id
      JOIN users u1 ON d.reported_by = u1.id
      LEFT JOIN users u2 ON d.reported_against = u2.id
      LEFT JOIN users u3 ON d.assigned_judge_id = u3.id
      WHERE (d.reported_by = $1 OR d.reported_against = $1 OR d.assigned_judge_id = $1)
    `;
    
    const params = [userId];
    
    if (status) {
      queryText += ' AND d.status = $2';
      params.push(status);
    }
    
    queryText += ' ORDER BY d.created_at DESC';
    
    const result = await query(queryText, params);
    
    res.json({ disputes: result.rows });
  } catch (error) {
    logger.error('Get disputes error:', error);
    res.status(500).json({ error: 'Failed to get disputes' });
  }
});

// Accept dispute (judge only)
judgeRouter.post('/disputes/:disputeId/accept', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { disputeId } = req.params;
    
    // Verify user is a judge
    const user = await query(
      'SELECT is_judge FROM users WHERE id = $1',
      [userId]
    );
    
    if (!user.rows[0]?.is_judge) {
      return res.status(403).json({ error: 'Only judges can accept disputes' });
    }
    
    // Assign judge to dispute
    const result = await query(
      `UPDATE disputes 
       SET assigned_judge_id = $1, status = 'assigned'
       WHERE id = $2 AND status = 'open'
       RETURNING *`,
      [userId, disputeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Dispute not available' });
    }
    
    logger.info(`Judge ${userId} accepted dispute ${disputeId}`);
    
    res.json({
      message: 'Dispute accepted',
      dispute: result.rows[0]
    });
  } catch (error) {
    logger.error('Accept dispute error:', error);
    res.status(500).json({ error: 'Failed to accept dispute' });
  }
});

// Resolve dispute (judge only)
judgeRouter.post('/disputes/:disputeId/resolve', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { disputeId } = req.params;
    const { decision, resolution } = req.body;
    
    // Verify judge is assigned to this dispute
    const dispute = await query(
      'SELECT * FROM disputes WHERE id = $1 AND assigned_judge_id = $2',
      [disputeId, userId]
    );
    
    if (dispute.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized to resolve this dispute' });
    }
    
    // Calculate judge fee (3% of bet pot)
    const bet = await query(
      'SELECT total_pot FROM bets WHERE id = $1',
      [dispute.rows[0].bet_id]
    );
    
    const judgeFee = Math.floor(bet.rows[0].total_pot * 0.03);
    
    await query('BEGIN');
    
    // Update dispute
    await query(
      `UPDATE disputes 
       SET status = 'resolved', judge_decision = $1, resolution = $2, 
           judge_fee = $3, resolved_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [decision, resolution, judgeFee, disputeId]
    );
    
    // Pay judge
    await query(
      `UPDATE wallets 
       SET points_balance = points_balance + $1
       WHERE user_id = $2`,
      [judgeFee, userId]
    );
    
    // Record transaction
    await query(
      `INSERT INTO transactions (user_id, type, amount, currency, description, reference_id)
       VALUES ($1, 'judge_fee', $2, 'points', 'Judge fee for dispute resolution', $3)`,
      [userId, judgeFee, disputeId]
    );
    
    // Update judge stats
    await query(
      `UPDATE users 
       SET total_disputes_judged = total_disputes_judged + 1
       WHERE id = $1`,
      [userId]
    );
    
    await query('COMMIT');
    
    logger.info(`Judge ${userId} resolved dispute ${disputeId}`);
    
    res.json({
      message: 'Dispute resolved successfully',
      judgeFee
    });
  } catch (error) {
    await query('ROLLBACK');
    logger.error('Resolve dispute error:', error);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

module.exports = judgeRouter;