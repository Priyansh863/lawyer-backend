import { Request, Response } from 'express';
import { TokenTransaction, UserTokenBalance, ETransactionType, ETransactionStatus, EUsageCategory } from '../models/token';
import { User } from '../models/user';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export default class TokenController {
  /**
   * Get user's current token balance
   * GET /api/v1/user/tokens
   */
  static async getCurrentTokens(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Get or create user token balance
      let tokenBalance = await UserTokenBalance.findOne({ user_id: userId });
      
      if (!tokenBalance) {
        tokenBalance = await UserTokenBalance.create({
          user_id: userId,
          current_balance: 0,
          total_purchased: 0,
          total_used: 0,
          monthly_usage: 0,
          last_monthly_reset: new Date()
        });
      }

      // Check if monthly reset is needed (reset on 1st of each month)
      const now = new Date();
      const lastReset = new Date(tokenBalance.last_monthly_reset);
      const shouldReset = now.getMonth() !== lastReset.getMonth() || 
                         now.getFullYear() !== lastReset.getFullYear();

      if (shouldReset) {
        // tokenBalance = await UserTokenBalance.resetMonthlyUsage(userId);
      }

      return res.status(200).json({
        success: true,
        data: {
          tokens: tokenBalance.current_balance,
          monthlyUsage: tokenBalance.monthly_usage,
          totalPurchased: tokenBalance.total_purchased,
          totalUsed: tokenBalance.total_used,
          lastMonthlyReset: tokenBalance.last_monthly_reset
        }
      });

    } catch (error: any) {
      console.error('Error in getCurrentTokens:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get token balance'
      });
    }
  }

  /**
   * Get user's token transaction history
   * GET /api/v1/user/token-transactions
   */
  static async getTokenTransactions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = req.query.type as string; // 'purchase' | 'usage' | undefined

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const skip = (page - 1) * limit;
      let query: any = { user_id: userId };

      if (type && ['purchase', 'usage'].includes(type)) {
        query.type = type;
      }

      const [transactions, totalCount] = await Promise.all([
        TokenTransaction.find(query)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        TokenTransaction.countDocuments(query)
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return res.status(200).json({
        success: true,
        data: {
          transactions: transactions.map(transaction => ({
            id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            description: transaction.description,
            category: transaction.category,
            status: transaction.status,
            date: transaction.created_at,
            reference: transaction.stripe_payment_intent_id || transaction.reference_id
          })),
          pagination: {
            currentPage: page,
            totalPages,
            totalTransactions: totalCount,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error: any) {
      console.error('Error in getTokenTransactions:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get transaction history'
      });
    }
  }

  /**
   * Use tokens for AI operations
   * POST /api/v1/user/use-tokens
   */
  static async useTokens(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      const { amount, description, category = EUsageCategory.other } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid token amount'
        });
      }

      if (!description) {
        return res.status(400).json({
          success: false,
          message: 'Description is required'
        });
      }

      // Check if user has sufficient balance and deduct tokens
      // const tokenBalance = await UserTokenBalance.useTokens(userId, amount);

      // Create transaction record
      const transaction = await TokenTransaction.create({
        user_id: userId,
        type: ETransactionType.usage,
        amount: -amount,
        description,
        category,
        status: ETransactionStatus.completed
      });

      return res.status(200).json({
        success: true,
        message: 'Tokens used successfully',
        data: {
          tokensUsed: amount,
          remainingBalance:0,
          transactionId: transaction._id
        }
      });

    } catch (error: any) {
      console.error('Error in useTokens:', error);
      
      if (error.message === 'Insufficient token balance') {
        return res.status(400).json({
          success: false,
          message: 'Insufficient token balance'
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to use tokens'
      });
    }
  }

  /**
   * Add tokens to user account (internal use, after successful payment)
   * POST /api/v1/user/add-tokens
   */
  static async addTokens(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId, amount, description, packageId, packageName, stripePaymentIntentId } = req.body;

      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parameters'
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

      // Add tokens to user balance
      // const tokenBalance = await UserTokenBalance.addTokens(userId, amount);

      // Create transaction record
      const transaction = await TokenTransaction.create({
        user_id: userId,
        type: ETransactionType.purchase,
        amount: amount,
        description: description || `Token purchase - ${packageName || 'Package'}`,
        category: 'Token Purchase',
        status: ETransactionStatus.completed,
        stripe_payment_intent_id: stripePaymentIntentId,
        package_id: packageId,
        package_name: packageName
      });

      return res.status(200).json({
        success: true,
        message: 'Tokens added successfully',
        data: {
          tokensAdded: amount,
          newBalance:   0,
          transactionId: transaction._id
        }
      });

    } catch (error: any) {
      console.error('Error in addTokens:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to add tokens'
      });
    }
  }

  /**
   * Get token usage statistics
   * GET /api/v1/user/token-stats
   */
  static async getTokenStats(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const tokenBalance = await UserTokenBalance.findOne({ user_id: userId });
      
      if (!tokenBalance) {
        return res.status(200).json({
          success: true,
          data: {
            currentBalance: 0,
            monthlyUsage: 0,
            totalPurchased: 0,
            totalUsed: 0,
            usageByCategory: []
          }
        });
      }

      // Get usage breakdown by category for current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const usageByCategory = await TokenTransaction.aggregate([
        {
          $match: {
            user_id: tokenBalance.user_id,
            type: ETransactionType.usage,
            created_at: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: '$category',
            totalUsed: { $sum: { $abs: '$amount' } },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { totalUsed: -1 }
        }
      ]);

      return res.status(200).json({
        success: true,
        data: {
          currentBalance: tokenBalance.current_balance,
          monthlyUsage: tokenBalance.monthly_usage,
          totalPurchased: tokenBalance.total_purchased,
          totalUsed: tokenBalance.total_used,
          usageByCategory: usageByCategory.map(item => ({
            category: item._id,
            tokensUsed: item.totalUsed,
            transactionCount: item.count
          }))
        }
      });

    } catch (error: any) {
      console.error('Error in getTokenStats:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get token statistics'
      });
    }
  }

  /**
   * Get token overview for a user (balance, total purchased, recent transactions)
   * GET /api/v1/token/overview
   */
  static async getTokenOverview(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Get user token balance
      let balance = await UserTokenBalance.findOne({ user_id: userId });
      
      if (!balance) {
        // Create initial balance record
        balance = await UserTokenBalance.create({
          user_id: userId,
          current_balance: 0,
          total_purchased: 0,
          total_used: 0,
          monthly_usage: 0,
          last_monthly_reset: new Date()
        });
      }

      // Get recent transactions (last 50)
      const transactions = await TokenTransaction.find({ user_id: userId })
        .sort({ created_at: -1 })
        .limit(50)
        .lean();

      // Transform transactions for frontend
      const transformedTransactions = transactions.map(transaction => ({
        _id: transaction._id,
        type: transaction.type,
        tokens: Math.abs(transaction.amount),
        amount: transaction.type === 'purchase' ? (transaction.metadata?.price || 0) : undefined,
        description: transaction.description,
        status: transaction.status,
        createdAt: transaction.created_at
      }));

      res.json({
        success: true,
        currentBalance: balance.current_balance,
        totalPurchased: balance.total_purchased,
        monthlyUsage: balance.monthly_usage,
        transactions: transformedTransactions
      });
    } catch (error: any) {
      console.error('Error fetching token overview:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch token overview'
      });
    }
  }
}
