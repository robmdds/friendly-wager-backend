const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Get store items
router.get('/items', authenticate, async (req, res) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query;
    
    let queryText = 'SELECT * FROM store_items WHERE is_active = true';
    const params = [];
    
    if (category) {
      queryText += ' AND category = $1';
      params.push(category);
    }
    
    queryText += ` ORDER BY points_cost ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await query(queryText, params);
    
    res.json({ items: result.rows });
  } catch (error) {
    logger.error('Get store items error:', error);
    res.status(500).json({ error: 'Failed to get store items' });
  }
});

// Purchase item
router.post('/purchase', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { itemId, quantity = 1, shippingAddress } = req.body;
    
    // Get item details
    const itemResult = await query(
      'SELECT * FROM store_items WHERE id = $1 AND is_active = true',
      [itemId]
    );
    
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const item = itemResult.rows[0];
    const totalCost = item.points_cost * quantity;
    
    // Check balance and purchase
    await query('BEGIN');
    
    const walletResult = await query(
      `UPDATE wallets 
       SET points_balance = points_balance - $1
       WHERE user_id = $2 AND points_balance >= $1
       RETURNING points_balance`,
      [totalCost, userId]
    );
    
    if (walletResult.rows.length === 0) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient points' });
    }
    
    // Create order
    const orderResult = await query(
      `INSERT INTO store_orders (user_id, item_id, quantity, points_spent, shipping_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, itemId, quantity, totalCost, JSON.stringify(shippingAddress)]
    );
    
    // Record transaction
    await query(
      `INSERT INTO transactions (user_id, type, amount, currency, description, reference_id)
       VALUES ($1, 'redeem', $2, 'points', $3, $4)`,
      [userId, -totalCost, `Redeemed: ${item.name}`, orderResult.rows[0].id]
    );
    
    await query('COMMIT');
    
    logger.info(`User ${userId} purchased item ${itemId}`);
    
    res.json({
      message: 'Purchase successful',
      order: orderResult.rows[0],
      newBalance: walletResult.rows[0].points_balance
    });
  } catch (error) {
    await query('ROLLBACK');
    logger.error('Purchase item error:', error);
    res.status(500).json({ error: 'Failed to purchase item' });
  }
});

// Get user orders
router.get('/orders', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    
    const result = await query(
      `SELECT o.*, i.name as item_name, i.image_url
       FROM store_orders o
       JOIN store_items i ON o.item_id = i.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    
    res.json({ orders: result.rows });
  } catch (error) {
    logger.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

module.exports = router;