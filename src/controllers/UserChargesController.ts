import { Request, Response } from "express";
import { User } from "../models/user";
import { UserTokenBalance, TokenTransaction, ETransactionType, ETransactionStatus } from "../models/token";
import { getAuthRole, getAuthUserId } from "../middleware/auth";

export default class UserChargesController {
  /**
   * Update lawyer consultation charges for the authenticated lawyer.
   * @param req.body.charges - General consultation rate (backward compatibility)
   * @param req.body.chat_rate - Chat consultation rate
   * @param req.body.video_rate - Video consultation rate
   */
  static async updateCharges(req: Request, res: Response) {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const { charges, chat_rate, video_rate } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      if (user.account_type !== 'lawyer') {
        return res.status(403).json({
          success: false,
          message: "Only lawyers can set consultation charges"
        });
      }

      const updateData: Record<string, number> = {};

      if (charges !== undefined && charges !== null) {
        if (charges < 0) {
          return res.status(400).json({
            success: false,
            message: "Charges cannot be negative"
          });
        }
        updateData.charges = charges;
      }

      if (chat_rate !== undefined && chat_rate !== null) {
        if (chat_rate < 0) {
          return res.status(400).json({
            success: false,
            message: "Chat rate cannot be negative"
          });
        }
        updateData.chat_rate = chat_rate;
      }

      if (video_rate !== undefined && video_rate !== null) {
        if (video_rate < 0) {
          return res.status(400).json({
            success: false,
            message: "Video rate cannot be negative"
          });
        }
        updateData.video_rate = video_rate;
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password -otp -otp_expires');

      return res.status(200).json({
        success: true,
        message: "Consultation charges updated successfully",
        user: updatedUser
      });

    } catch (error: any) {
      console.error("Error updating charges:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update consultation charges"
      });
    }
  }

  /**
   * Get lawyer charges by user ID
   * @param req.params.userId - User ID
   */
  static async getCharges(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      const user = await User.findById(userId)
        .select('first_name last_name account_type charges chat_rate video_rate pratice_area experience');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      return res.status(200).json({
        success: true,
        user: {
          _id: user._id,
          first_name: user.first_name,
          last_name: user.last_name,
          account_type: user.account_type,
          charges: user.charges || 0,
          chat_rate: user.chat_rate || 0,
          video_rate: user.video_rate || 0,
          pratice_area: user.pratice_area,
          experience: user.experience
        }
      });

    } catch (error: any) {
      console.error("Error getting charges:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get user charges"
      });
    }
  }

  /**
   * Get all lawyers with their charges
   * Used for displaying lawyer rates in chat/video consultation
   */
  static async getAllLawyersWithCharges(req: Request, res: Response) {
    try {
      const lawyers = await User.find(
        { account_type: 'lawyer' },
        'first_name last_name email profile_image pratice_area experience charges chat_rate video_rate'
      ).sort({ first_name: 1 });

      return res.status(200).json({
        success: true,
        lawyers: lawyers.map(lawyer => ({
          _id: lawyer._id,
          account_type: "lawyer" as const,
          first_name: lawyer.first_name,
          last_name: lawyer.last_name,
          email: lawyer.email,
          profile_image: lawyer.profile_image,
          pratice_area: lawyer.pratice_area,
          experience: lawyer.experience,
          charges: lawyer.charges || 0,
          chat_rate: lawyer.chat_rate || 0,
          video_rate: lawyer.video_rate || 0
        }))
      });

    } catch (error: any) {
      console.error("Error getting lawyers with charges:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get lawyers"
      });
    }
  }

  /**
   * Check if the authenticated client has sufficient tokens for consultation
   * @param req.body.lawyerId - Lawyer ID
   * @param req.body.consultationType - 'chat' or 'video'
   */
  static async checkTokenBalance(req: Request, res: Response) {
    try {
      const clientId = getAuthUserId(req);
      if (!clientId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { lawyerId, consultationType } = req.body;

      if (!lawyerId || !consultationType) {
        return res.status(400).json({
          success: false,
          message: "Lawyer ID and consultation type are required"
        });
      }

      const clientTokenBalance = await UserTokenBalance.findOne({ user_id: clientId });
      if (!clientTokenBalance || clientTokenBalance.current_balance <= 0) {
        return res.status(400).json({
          success: false,
          message: "Insufficient token balance. Please purchase tokens to continue.",
          currentBalance: clientTokenBalance?.current_balance || 0
        });
      }

      const lawyer = await User.findById(lawyerId).select('charges chat_rate video_rate first_name last_name');
      if (!lawyer) {
        return res.status(404).json({
          success: false,
          message: "Lawyer not found"
        });
      }

      let requiredTokens = 0;
      if (consultationType === 'chat') {
        requiredTokens = lawyer.chat_rate || lawyer.charges || 0;
      } else if (consultationType === 'video') {
        requiredTokens = lawyer.video_rate || lawyer.charges || 0;
      } else {
        requiredTokens = lawyer.charges || 0;
      }
      if (clientTokenBalance.current_balance < requiredTokens) {
        return res.status(200).json({
          success: false,
          message: `Insufficient tokens. Required: ${requiredTokens}, Available: ${clientTokenBalance.current_balance}`,
          requiredTokens,
          currentBalance: clientTokenBalance.current_balance,
          lawyerCharges: lawyer.charges
        });
      }

      return res.status(200).json({
        success: true,
        message: "Sufficient token balance",
        currentBalance: clientTokenBalance.current_balance,
        requiredTokens,
        lawyerInfo: {
          _id: lawyer._id,
          name: `${lawyer.first_name} ${lawyer.last_name}`,
          charges: lawyer.charges,
          chat_rate: lawyer.chat_rate,
          video_rate: lawyer.video_rate,
          consultationType: consultationType,
          actualRate: requiredTokens
        }
      });

    } catch (error: any) {
      console.error("Error checking token balance:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to check token balance"
      });
    }
  }

  /**
   * Deduct tokens when starting consultation for the authenticated client
   * @param req.body.lawyerId - Lawyer ID
   * @param req.body.consultationType - 'chat' or 'video'
   * @param req.body.sessionId - Chat ID or Meeting ID for reference
   */
  static async deductTokens(req: Request, res: Response) {
    try {
      const clientId = getAuthUserId(req);
      if (!clientId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { lawyerId, consultationType, sessionId } = req.body;

      if (!lawyerId || !consultationType || !sessionId) {
        return res.status(400).json({
          success: false,
          message: "Lawyer ID, consultation type, and session ID are required"
        });
      }

      const lawyer = await User.findById(lawyerId).select('charges chat_rate video_rate first_name last_name');
      if (!lawyer) {
        return res.status(404).json({
          success: false,
          message: "Lawyer not found"
        });
      }

      let tokensToDeduct = 0;
      if (consultationType === 'chat') {
        tokensToDeduct = lawyer.chat_rate || lawyer.charges || 0;
      } else if (consultationType === 'video') {
        tokensToDeduct = lawyer.video_rate || lawyer.charges || 0;
      } else {
        tokensToDeduct = lawyer.charges || 0;
      }
      if (tokensToDeduct <= 0) {
        return res.status(400).json({
          success: false,
          message: "No charges set for this lawyer"
        });
      }

      try {
        const updatedBalance = await (UserTokenBalance as any).useTokens(clientId, tokensToDeduct);

        await TokenTransaction.create({
          user_id: clientId,
          type: ETransactionType.usage,
          amount: -tokensToDeduct,
          description: `${consultationType === 'chat' ? 'Chat' : 'Video'} consultation with ${lawyer.first_name} ${lawyer.last_name}`,
          category: consultationType === 'chat' ? 'Chat Consultation' : 'Video Consultation',
          status: ETransactionStatus.completed,
          reference_id: sessionId,
          metadata: {
            lawyerId: lawyerId,
            lawyerName: `${lawyer.first_name} ${lawyer.last_name}`,
            consultationType: consultationType,
            sessionId: sessionId
          }
        });

        return res.status(200).json({
          success: true,
          message: "Tokens deducted successfully",
          tokensDeducted: tokensToDeduct,
          remainingBalance: updatedBalance.current_balance,
          transactionDetails: {
            lawyerName: `${lawyer.first_name} ${lawyer.last_name}`,
            consultationType: consultationType,
            sessionId: sessionId
          }
        });

      } catch (tokenError: any) {
        return res.status(400).json({
          success: false,
          message: tokenError.message || "Insufficient token balance"
        });
      }

    } catch (error: any) {
      console.error("Error deducting tokens:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to deduct tokens"
      });
    }
  }

  /**
   * Get authenticated client's token balance and transaction history
   */
  static async getClientTokenInfo(req: Request, res: Response) {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { clientId } = req.params;
      const role = (getAuthRole(req) || "").toLowerCase();
      const targetClientId = clientId || authUserId;

      if (targetClientId !== authUserId && role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Forbidden"
        });
      }

      const tokenBalance = await UserTokenBalance.findOne({ user_id: targetClientId });

      const recentTransactions = await TokenTransaction.find({ user_id: targetClientId })
        .sort({ created_at: -1 })
        .limit(10)
        .select('type amount description category status created_at metadata');

      return res.status(200).json({
        success: true,
        tokenBalance: {
          current_balance: tokenBalance?.current_balance || 0,
          total_purchased: tokenBalance?.total_purchased || 0,
          total_used: tokenBalance?.total_used || 0,
          monthly_usage: tokenBalance?.monthly_usage || 0
        },
        recentTransactions: recentTransactions
      });

    } catch (error: any) {
      console.error("Error getting client token info:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get token information"
      });
    }
  }

  /**
   * Get token transaction history for the authenticated user
   */
  static async getTokenTransactionHistory(req: Request, res: Response) {
    try {
      const authUserId = getAuthUserId(req);
      if (!authUserId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { userId } = req.params;
      const role = (getAuthRole(req) || "").toLowerCase();
      const targetUserId = userId || authUserId;

      if (targetUserId !== authUserId && role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Forbidden"
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const transactions = await TokenTransaction.find({ user_id: targetUserId })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      const totalCount = await TokenTransaction.countDocuments({ user_id: targetUserId });
      const totalPages = Math.ceil(totalCount / limit);

      const tokenBalance = await UserTokenBalance.findOne({ user_id: targetUserId });

      return res.status(200).json({
        success: true,
        data: {
          transactions,
          pagination: {
            currentPage: page,
            totalPages,
            totalCount,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          currentBalance: tokenBalance?.current_balance || 0,
          totalPurchased: tokenBalance?.total_purchased || 0,
          totalUsed: tokenBalance?.total_used || 0
        }
      });

    } catch (error: any) {
      console.error("Error fetching token transaction history:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch transaction history"
      });
    }
  }
}
