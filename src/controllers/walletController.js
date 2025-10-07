const { query, transaction } = require('../config/database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../utils/logger');

exports.getBalance = async (req, res) => {
  try {
    const userId = req.userId;
    
    const result = await query(
      `SELECT points_balance, cash_balance, escrow_points, escrow_cash,
              lifetime_points_earned, lifetime_cash_earned
       FROM wallets
       WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get balance error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 50, offset = 0, type } = req.query;
    
    let queryText = `
      SELECT * FROM transactions
      WHERE user_id = $1
    `;
    
    const params = [userId];
    
    if (type) {
      queryText += ' AND type = $2';
      params.push(type);
    }
    
    queryText += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(queryText, params);
    
    res.json({
      transactions: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rowCount
      }
    });
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
};

exports.purchasePoints = async (req, res) => {
  try {
    const userId = req.userId;
    const { packageId, paymentMethodId } = req.body;
    
    // Define point packages
    const packages = {
      'small': { points: 500, price: 4.99 },
      'medium': { points: 1000, price: 8.99 },
      'large': { points: 5000, price: 39.99 }
    };
    
    const selectedPackage = packages[packageId];
    
    if (!selectedPackage) {
      return res.status(400).json({ error: 'Invalid package' });
    }
    
    // Create Stripe payment intent
    let paymentIntent;
    
    if (process.env.NODE_ENV === 'production' && paymentMethodId) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(selectedPackage.price * 100), // cents
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        metadata: {
          userId,
          packageId,
          points: selectedPackage.points
        }
      });
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment failed' });
      }
    }
    
    // Add points to wallet
    await transaction(async (client) => {
      await client.query(
        `UPDATE wallets
         SET points_balance = points_balance + $1
         WHERE user_id = $2`,
        [selectedPackage.points, userId]
      );
      
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, currency, description, status, stripe_payment_intent_id, metadata)
         VALUES ($1, 'purchase', $2, 'points', $3, 'completed', $4, $5)`,
        [
          userId,
          selectedPackage.points,
          `Points purchase: ${packageId} package`,
          paymentIntent?.id || null,
          JSON.stringify({ packageId, price: selectedPackage.price })
        ]
      );
    });
    
    logger.info(`User ${userId} purchased ${selectedPackage.points} points`);
    
    // Get updated balance
    const balanceResult = await query(
      'SELECT points_balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      message: 'Points purchased successfully',
      points: selectedPackage.points,
      newBalance: balanceResult.rows[0].points_balance
    });
  } catch (error) {
    logger.error('Purchase points error:', error);
    res.status(500).json({ 
      error: 'Failed to purchase points',
      message: error.message 
    });
  }
};

exports.withdrawCash = async (req, res) => {
  try {
    const userId = req.userId;
    const { amount } = req.body;
    
    if (amount < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal is $10' });
    }
    
    // Check balance
    const balanceResult = await query(
      'SELECT cash_balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    
    if (balanceResult.rows.length === 0 || balanceResult.rows[0].cash_balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // TODO: Implement actual withdrawal via Stripe Connect or similar
    // For now, just create a pending transaction
    
    await transaction(async (client) => {
      await client.query(
        `UPDATE wallets SET cash_balance = cash_balance - $1 WHERE user_id = $2`,
        [amount, userId]
      );
      
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, currency, description, status)
         VALUES ($1, 'withdrawal', $2, 'usd', 'Cash withdrawal', 'pending')`,
        [userId, -amount]
      );
    });
    
    logger.info(`User ${userId} requested withdrawal of ${amount}`);
    
    res.json({ 
      message: 'Withdrawal request submitted',
      status: 'pending',
      amount 
    });
  } catch (error) {
    logger.error('Withdraw cash error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const userId = req.userId;
    
    const result = await query(
      `SELECT 
        w.points_balance,
        w.cash_balance,
        w.lifetime_points_earned,
        w.lifetime_cash_earned,
        (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND type = 'bet_won') as total_wins,
        (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND type = 'bet_lost') as total_losses,
        (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND type = 'purchase') as total_purchases,
        (SELECT SUM(amount) FROM transactions WHERE user_id = $1 AND type = 'purchase' AND currency = 'points') as total_points_purchased
       FROM wallets w
       WHERE w.user_id = $1`,
      [userId]
    );
    
    res.json(result.rows[0] || {});
  } catch (error) {
    logger.error('Get wallet stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
};