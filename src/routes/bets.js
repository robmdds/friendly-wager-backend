const express = require('express');
const router = express.Router();
const betController = require('../controllers/betController');
const { authenticate } = require('../middleware/auth');
const { validateBetCreation, validateScoreSubmission } = require('../middleware/validation');

// Create new bet
router.post('/', authenticate, validateBetCreation, betController.createBet);

// Get bet by ID
router.get('/:betId', authenticate, betController.getBetById);

// Get bet by code
router.get('/code/:betCode', authenticate, betController.getBetByCode);

// Join bet
router.post('/:betId/join', authenticate, betController.joinBet);

// Leave bet (before it starts)
router.post('/:betId/leave', authenticate, betController.leaveBet);

// Update ready status
router.patch('/:betId/ready', authenticate, betController.updateReadyStatus);

// Start bet (creator only)
router.post('/:betId/start', authenticate, betController.startBet);

// Submit score for a hole
router.post('/:betId/scores', authenticate, validateScoreSubmission, betController.submitScore);

// Get all scores for a bet
router.get('/:betId/scores', authenticate, betController.getScores);

// Get participants
router.get('/:betId/participants', authenticate, betController.getParticipants);

// Complete bet and distribute payouts
router.post('/:betId/complete', authenticate, betController.completeBet);

// Get public bets
router.get('/public/list', authenticate, betController.getPublicBets);

// Get user's bets
router.get('/user/my-bets', authenticate, betController.getMyBets);

// Cancel bet
router.delete('/:betId', authenticate, betController.cancelBet);

module.exports = router;