import { Request, Response } from 'express';
import Stripe from 'stripe';
import config from '../config/envConfig';
import secretManagerConfig from '../config/secretManagerConfig';
import { TokenTransaction, UserTokenBalance, ETransactionType, ETransactionStatus } from '../models/token';
import { User } from '../models/user';

// Initialize Stripe with secret manager
let stripe: Stripe;

const initializeStripe = async () => {
  if (!stripe) {
    const secrets = await secretManagerConfig.secretManagerConnection();
    const stripeSecretKey = secrets?.stripeSecretKey;
    
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key not found in secret manager');
    }
    
    stripe = new Stripe(stripeSecretKey);
    console.log('Stripe initialized successfully');
  }
  return stripe;
};

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

// Token packages configuration
const TOKEN_PACKAGES = {
  starter: {
    id: 'starter',
    name: 'Starter Pack',
    tokens: 1000,
    price: 9.99,
    description: '1,000 AI tokens for basic usage'
  },
  professional: {
    id: 'professional',
    name: 'Professional Pack',
    tokens: 5000,
    price: 39.99,
    description: '5,000 AI tokens with 20% bonus (6,000 total)'
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Pack',
    tokens: 15000,
    price: 99.99,
    description: '15,000 AI tokens with 50% bonus (22,500 total)'
  }
};

export default class StripeController {
  /**
   * Create Stripe checkout session for token purchase
   * POST /api/v1/stripe/create-checkout-session
   */
  static async createCheckoutSession(req: AuthenticatedRequest, res: Response) {
    try {
      const stripe = await initializeStripe();
      const secrets = await secretManagerConfig.secretManagerConnection();
      const envConfig = config();
      const userId = req.user?.userId;
      const { packageId, tokens, amount, packageName } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Validate package
      const packageInfo = TOKEN_PACKAGES[packageId as keyof typeof TOKEN_PACKAGES];
      if (!packageInfo) {
        return res.status(400).json({
          success: false,
          message: 'Invalid package selected'
        });
      }

      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Calculate actual tokens (including bonuses)
      let actualTokens = packageInfo.tokens;
      if (packageId === 'professional') {
        actualTokens = Math.floor(packageInfo.tokens * 1.2); // 20% bonus
      } else if (packageId === 'enterprise') {
        actualTokens = Math.floor(packageInfo.tokens * 1.5); // 50% bonus
      }

      // Create pending transaction
      const pendingTransaction = await TokenTransaction.create({
        user_id: userId,
        type: ETransactionType.purchase,
        amount: actualTokens,
        description: `${packageInfo.name} Purchase`,
        category: 'Token Purchase',
        status: ETransactionStatus.pending,
        package_id: packageId,
        package_name: packageInfo.name
      });

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: packageInfo.name,
                description: packageInfo.description,
                images: [], // Add product images if available
              },
              unit_amount: Math.round(packageInfo.price * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${envConfig.frontendUrl}/token?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${envConfig.frontendUrl}/token?cancelled=true`,
        customer_email: user.email,
        metadata: {
          userId: userId,
          packageId: packageId,
          tokens: actualTokens.toString(),
          transactionId: pendingTransaction._id.toString()
        },
        expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      });

      // Update transaction with Stripe session ID
      await TokenTransaction.findByIdAndUpdate(pendingTransaction._id, {
        stripe_session_id: session.id
      });

      return res.status(200).json({
        success: true,
        data: {
          url: session.url,
          sessionId: session.id
        }
      });

    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to create checkout session'
      });
    }
  }

  /**
   * Handle Stripe webhook events
   * POST /api/v1/stripe/webhook
   */
  static async handleWebhook(req: Request, res: Response) {
    try {
      const stripe = await initializeStripe();
      const secrets = await secretManagerConfig.secretManagerConnection();
      const endpointSecret = secrets?.stripeWebhookSecret;

      const sig = req.headers['stripe-signature'] as string;
      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret || '');
      } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      try {
        switch (event.type) {
          case 'checkout.session.completed':
            await StripeController.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
            break;

          case 'payment_intent.succeeded':
            await StripeController.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
            break;

          case 'payment_intent.payment_failed':
            await StripeController.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
            break;

          case 'checkout.session.expired':
            await StripeController.handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
            break;

          default:
            console.log(`Unhandled event type: ${event.type}`);
        }

        return res.status(200).json({ received: true });

      } catch (error: any) {
        console.error('Error handling webhook:', error);
        return res.status(500).json({
          success: false,
          message: 'Webhook handler failed'
        });
      }
    } catch (error: any) {
      console.error('Error initializing webhook handler:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize webhook handler'
      });
    }
  }

  /**
   * Handle successful checkout session
   */
  private static async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    try {
      const { userId, packageId, tokens, transactionId } = session.metadata || {};

      if (!userId || !tokens || !transactionId) {
        console.error('Missing metadata in checkout session:', session.id);
        return;
      }

      // Find the pending transaction
      const transaction = await TokenTransaction.findById(transactionId);
      if (!transaction) {
        console.error('Transaction not found:', transactionId);
        return;
      }

      // Update transaction status
      await TokenTransaction.findByIdAndUpdate(transactionId, {
        status: ETransactionStatus.completed,
        stripe_payment_intent_id: session.payment_intent as string,
        metadata: {
          stripe_session_id: session.id,
          amount_paid: session.amount_total,
          currency: session.currency
        }
      });

      // Add tokens to user balance - DISABLED: Now handled by frontend verification
      // await UserTokenBalance.addTokens(userId, parseInt(tokens), transactionId);

      console.log(`Successfully processed token purchase: ${tokens} tokens for user ${userId}`);

    } catch (error) {
      console.error('Error handling checkout session completed:', error);
    }
  }

  /**
   * Handle successful payment intent
   */
  private static async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    try {
      // Find transaction by payment intent ID
      const transaction = await TokenTransaction.findOne({
        stripe_payment_intent_id: paymentIntent.id
      });

      if (transaction && transaction.status === ETransactionStatus.pending) {
        await TokenTransaction.findByIdAndUpdate(transaction._id, {
          status: ETransactionStatus.completed
        });

        console.log(`Payment confirmed for transaction: ${transaction._id}`);
      }

    } catch (error) {
      console.error('Error handling payment intent succeeded:', error);
    }
  }

  /**
   * Handle failed payment intent
   */
  private static async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    try {
      // Find transaction by payment intent ID
      const transaction = await TokenTransaction.findOne({
        stripe_payment_intent_id: paymentIntent.id
      });

      if (transaction) {
        await TokenTransaction.findByIdAndUpdate(transaction._id, {
          status: ETransactionStatus.failed,
          metadata: {
            ...transaction.metadata,
            failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed'
          }
        });

        console.log(`Payment failed for transaction: ${transaction._id}`);
      }

    } catch (error) {
      console.error('Error handling payment intent failed:', error);
    }
  }

  /**
   * Handle expired checkout session
   */
  private static async handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
    try {
      const { transactionId } = session.metadata || {};

      if (transactionId) {
        await TokenTransaction.findByIdAndUpdate(transactionId, {
          status: ETransactionStatus.cancelled,
          metadata: {
            cancellation_reason: 'Checkout session expired'
          }
        });

        console.log(`Checkout session expired for transaction: ${transactionId}`);
      }

    } catch (error) {
      console.error('Error handling checkout session expired:', error);
    }
  }

  /**
   * Get checkout session details
   * GET /api/v1/stripe/session/:sessionId
   */
  static async getCheckoutSession(req: AuthenticatedRequest, res: Response) {
    try {
      const stripe = await initializeStripe();
      const { sessionId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Verify session belongs to the user
      if (session.metadata?.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          sessionId: session.id,
          status: session.status,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_email,
          metadata: session.metadata
        }
      });

    } catch (error: any) {
      console.error('Error retrieving checkout session:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve session'
      });
    }
  }

  /**
   * Verify payment session and get status with transaction details
   * This method handles ALL database updates when frontend verifies successful payment
   * GET /api/v1/stripe/verify-session/:sessionId
   */
  static async verifyPaymentSession(req: AuthenticatedRequest, res: Response) {
    try {
      const stripe = await initializeStripe();
      const { sessionId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Retrieve session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Verify session belongs to the user
      if (session.metadata?.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Find the transaction in our database
      let transaction = await TokenTransaction.findOne({
        stripe_session_id: sessionId,
        user_id: userId
      });

      // If payment is successful and transaction hasn't been processed yet
      if (session.payment_status === 'paid' && transaction && transaction.status === ETransactionStatus.pending) {
        console.log(`Processing successful payment for session: ${sessionId}`);
        
        // Update transaction status to completed
        transaction = await TokenTransaction.findByIdAndUpdate(
          transaction._id,
          {
            status: ETransactionStatus.completed,
            stripe_payment_intent_id: session.payment_intent as string,
            updated_at: new Date()
          },
          { new: true }
        );

        // Add tokens to user balance
        const tokensToAdd = parseInt(session.metadata?.tokens || '0');
        if (tokensToAdd > 0) {
          await UserTokenBalance.updateOne({ user_id: userId }, { $inc: { current_balance: tokensToAdd } });
          console.log(`Added ${tokensToAdd} tokens to user ${userId}`);
        }
      }

      // Get updated token balance
      const tokenBalance = await UserTokenBalance.findOne({ user_id: userId });

      return res.status(200).json({
        success: true,
        data: {
          sessionId: session.id,
          status: session.status,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_email,
          metadata: session.metadata,
          transaction: transaction ? {
            _id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            status: transaction.status,
            package_name: transaction.package_name,
            description: transaction.description,
            created_at: transaction.created_at
          } : null,
          tokenBalance: tokenBalance ? {
            current_balance: tokenBalance.current_balance,
            total_purchased: tokenBalance.total_purchased,
            total_used: tokenBalance.total_used,
            monthly_usage: tokenBalance.monthly_usage,
            last_monthly_reset: tokenBalance.last_monthly_reset
          } : null
        }
      });

    } catch (error: any) {
      console.error('Error verifying payment session:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify session'
      });
    }
  }
}
