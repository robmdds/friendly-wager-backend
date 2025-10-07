const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate, requireKYC } = require('../middleware/auth');

// Get wallet balance
router.get('/balance', authenticate, walletController.getBalance);

// Get transaction history
router.get('/transactions', authenticate, walletController.getTransactions);

// Purchase points
router.post('/purchase/points', authenticate, walletController.purchasePoints);

// Withdraw cash (requires KYC)
router.post('/withdraw', authenticate, requireKYC, walletController.withdrawCash);

// Get wallet stats
router.get('/stats', authenticate, walletController.getStats);

module.exports = router;