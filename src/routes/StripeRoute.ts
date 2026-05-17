import express from 'express';
import StripeController from '../controllers/StripeController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

/**
 * @route   POST /api/v1/stripe/create-checkout-session
 * @desc    Create Stripe checkout session for token purchase
 * @access  Private
 */
router.post('/create-checkout-session', authenticateToken, StripeController.createCheckoutSession);

/**
 * @route   POST /api/v1/stripe/webhook
 * @desc    Handle Stripe webhook events
 * @access  Public (Stripe webhooks)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), StripeController.handleWebhook);

/**
 * @route   GET /api/v1/stripe/session/:sessionId
 * @desc    Get checkout session details
 * @access  Private
 */
router.get('/session/:sessionId', authenticateToken, StripeController.getCheckoutSession);

/**
 * @route   GET /api/v1/stripe/verify-session/:sessionId
 * @desc    Verify payment session and get status
 * @access  Private
 */
router.get('/verify-session/:sessionId', authenticateToken, StripeController.verifyPaymentSession);

export default router;
