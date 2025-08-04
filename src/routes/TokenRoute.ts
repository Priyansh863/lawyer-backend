import express from 'express';
import TokenController from '../controllers/TokenController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

/**
 * @route   GET /api/v1/user/tokens
 * @desc    Get user's current token balance
 * @access  Private
 */
router.get('/tokens', authenticateToken, TokenController.getCurrentTokens);

/**
 * @route   GET /api/v1/user/token-transactions
 * @desc    Get user's token transaction history
 * @access  Private
 */
router.get('/token-transactions', authenticateToken, TokenController.getTokenTransactions);

/**
 * @route   POST /api/v1/user/use-tokens
 * @desc    Use tokens for AI operations
 * @access  Private
 */
router.post('/use-tokens', authenticateToken, TokenController.useTokens);

/**
 * @route   POST /api/v1/user/add-tokens
 * @desc    Add tokens to user account (internal use)
 * @access  Private
 */
router.post('/add-tokens', authenticateToken, TokenController.addTokens);

/**
 * @route   GET /api/v1/user/token-stats
 * @desc    Get token usage statistics
 * @access  Private
 */
router.get('/token-stats', authenticateToken, TokenController.getTokenStats);

/**
 * @route   GET /api/v1/token/overview
 * @desc    Get token overview (balance, total purchased, transactions)
 * @access  Private
 */
router.get('/overview', authenticateToken, TokenController.getTokenOverview);

export default router;
