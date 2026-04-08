import { Request, Response } from 'express';
import Chat from '../models/Chat';
import Message from '../models/Message';
import { User } from '../models/user';
import { UserTokenBalance, TokenTransaction, ETransactionType, ETransactionStatus } from '../models/token';
import mongoose from 'mongoose';
import { NotificationService } from '../services/notificationService';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

class ChatController {
  private static readonly INACTIVITY_MS = 5 * 60 * 1000;

  private static isParticipant(chat: any, userId: string): boolean {
    return chat.lawyer_id.toString() === userId || chat.client_id.toString() === userId;
  }

  private static async getChatForParticipant(chatId: string, userId: string) {
    const chat = await Chat.findById(chatId);
    if (!chat || !ChatController.isParticipant(chat, userId)) {
      return null;
    }
    return chat;
  }

  private static buildConsultationStatus(chat: any, userId: string) {
    const startedBy = (chat.consultation_started_by || []).map((id: any) => id.toString());
    const endedBy = (chat.consultation_ended_by || []).map((id: any) => id.toString());
    const lastActivityAt = chat.consultation_last_activity_at ? new Date(chat.consultation_last_activity_at) : null;
    const autoEndAt =
      chat.consultation_status === "active" && lastActivityAt
        ? new Date(lastActivityAt.getTime() + ChatController.INACTIVITY_MS)
        : null;

    return {
      chat_id: chat._id,
      status: chat.consultation_status || "pending",
      started_by_me: startedBy.includes(userId),
      started_by_other: startedBy.some((id: string) => id !== userId),
      ended_by_me: endedBy.includes(userId),
      ended_by_other: endedBy.some((id: string) => id !== userId),
      started_at: chat.consultation_started_at || null,
      ended_at: chat.consultation_ended_at || null,
      auto_end_at: autoEndAt,
    };
  }

  private static computeInactiveBillableSeconds(startedAt: Date, endedAt: Date): number {
    const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
    return Math.max(0, durationSeconds - 300);
  }

  private static async autoEndIfInactive(chat: any): Promise<any> {
    if (chat.consultation_status !== "active" || !chat.consultation_last_activity_at || !chat.consultation_started_at) {
      return chat;
    }

    const now = Date.now();
    const lastActivityMs = new Date(chat.consultation_last_activity_at).getTime();
    if (now < lastActivityMs + ChatController.INACTIVITY_MS) {
      return chat;
    }

    const endedAt = new Date(lastActivityMs + ChatController.INACTIVITY_MS);
    const billableSeconds = ChatController.computeInactiveBillableSeconds(
      new Date(chat.consultation_started_at),
      endedAt
    );

    await Chat.findOneAndUpdate(
      { _id: chat._id, consultation_status: "active" },
      {
        $set: {
          consultation_status: "auto_ended",
          consultation_ended_at: endedAt,
          consultation_end_reason: "inactivity",
          consultation_billable_seconds: billableSeconds,
        },
      },
      { new: true }
    );

    return await Chat.findById(chat._id);
  }
  // Create or get existing chat
  static async createChat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { participantId } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!participantId) {
        res.status(400).json({
          success: false,
          message: 'Participant ID is required'
        });
        return;
      }

      // Check if both users exist
      const [currentUser, participant] = await Promise.all([
        User.findById(userId),
        User.findById(participantId)
      ]);

      if (!currentUser || !participant) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Determine who is lawyer and who is client
      let lawyerId: string, clientId: string;
      if (currentUser.account_type === 'lawyer') {
        lawyerId = userId;
        clientId = participantId;
      } else {
        lawyerId = participantId;
        clientId = userId;
      }

      // If client is initiating chat, check token balance and lawyer charges
      if (currentUser.account_type === 'client') {
        const lawyer = await User.findById(lawyerId).select('charges first_name last_name');
        if (!lawyer) {
          res.status(404).json({
            success: false,
            message: 'Lawyer not found'
          });
          return;
        }

        const requiredTokens = lawyer.charges || 0;
        if (requiredTokens > 0) {
          // Check client's token balance
          const clientTokenBalance = await UserTokenBalance.findOne({ user_id: clientId });
          if (!clientTokenBalance || clientTokenBalance.current_balance < requiredTokens) {
            res.status(200).json({
              success: false,
              message: `Insufficient tokens. Required: ${requiredTokens}, Available: ${clientTokenBalance?.current_balance || 0}`,
              requiredTokens,
              currentBalance: clientTokenBalance?.current_balance || 0,
              lawyerCharges: lawyer.charges,
              lawyerName: `${lawyer.first_name} ${lawyer.last_name}`
            });
            return;
          }
        }
      }

      // Check if chat already exists between these users
      let existingChat = await Chat.findOne({
        $or: [
          { lawyer_id: lawyerId, client_id: clientId },
          { lawyer_id: clientId, client_id: lawyerId }
        ]
      }).populate('lawyer_id', 'first_name last_name email profile_image')
        .populate('client_id', 'first_name last_name email profile_image')
        .populate('lastMessage');

      if (existingChat) {
        // Get unread count for this user
        const unreadCount = await Message.countDocuments({
          chatId: existingChat._id,
          senderId: { $ne: userId },
          readBy: { $ne: userId }
        });

        res.status(200).json({
          success: true,
          message: 'Chat retrieved successfully',
          data: {
            _id: existingChat._id,
            lawyer_id: existingChat.lawyer_id,
            client_id: existingChat.client_id,
            lastMessage: existingChat.lastMessage,
            unreadCount,
            createdAt: existingChat.createdAt,
            updatedAt: existingChat.updatedAt
          }
        });
        return;
      }

      // Create new chat
      const newChat = new Chat({
        lawyer_id: lawyerId,
        client_id: clientId
      });

      await newChat.save();
      await newChat.populate('lawyer_id', 'first_name last_name email profile_image charges');
      await newChat.populate('client_id', 'first_name last_name email profile_image');

      // If client initiated and lawyer has charges, deduct tokens
      if (currentUser.account_type === 'client') {
        const lawyer = await User.findById(lawyerId).select('charges first_name last_name');
        const tokensToDeduct = lawyer?.charges || 0;
        
        if (tokensToDeduct > 0) {
          try {
            // Deduct tokens from client's balance
            const updatedBalance = await (UserTokenBalance as any).useTokens(clientId, tokensToDeduct);
            
            // Create transaction record
            await TokenTransaction.create({
              user_id: clientId,
              type: ETransactionType.usage,
              amount: -tokensToDeduct,
              description: `Chat consultation started with ${lawyer.first_name} ${lawyer.last_name}`,
              category: 'Chat Consultation',
              status: ETransactionStatus.completed,
              reference_id: newChat._id.toString(),
              metadata: {
                lawyerId: lawyerId,
                lawyerName: `${lawyer.first_name} ${lawyer.last_name}`,
                consultationType: 'chat',
                sessionId: newChat._id.toString()
              }
            });

            // Send notification for new chat
            try {
              await NotificationService.notifyChatStarted(newChat, userId);
            } catch (notificationError) {
              console.error('Failed to send chat notification:', notificationError);
            }

            res.status(201).json({
              success: true,
              message: 'Chat created successfully. Tokens deducted.',
              data: {
                _id: newChat._id,
                lawyer_id: newChat.lawyer_id,
                client_id: newChat.client_id,
                lastMessage: null,
                unreadCount: 0,
                createdAt: newChat.createdAt,
                updatedAt: newChat.updatedAt,
                tokenInfo: {
                  tokensDeducted: tokensToDeduct,
                  remainingBalance: updatedBalance.current_balance,
                  lawyerCharges: lawyer.charges
                }
              }
            });
            return;
          } catch (tokenError: any) {
            // If token deduction fails, delete the created chat
            await Chat.findByIdAndDelete(newChat._id);
            res.status(400).json({
              success: false,
              message: tokenError.message || 'Failed to deduct tokens'
            });
            return;
          }
        }
      }

      // Send notification for new chat (no tokens case)
      try {
        await NotificationService.notifyChatStarted(newChat, userId);
      } catch (notificationError) {
        console.error('Failed to send chat notification:', notificationError);
      }

      res.status(201).json({
        success: true,
        message: 'Chat created successfully',
        data: {
          _id: newChat._id,
          lawyer_id: newChat.lawyer_id,
          client_id: newChat.client_id,
          lastMessage: null,
          unreadCount: 0,
          createdAt: newChat.createdAt,
          updatedAt: newChat.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error creating chat:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get chat messages with pagination
  static async getChatMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Verify user is participant in the chat
      const chat = await Chat.findById(chatId);
      if (!chat || (chat.lawyer_id.toString() !== userId && chat.client_id.toString() !== userId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this chat'
        });
        return;
      }

      // Get messages with pagination (oldest first)
      const messages = await Message.find({ chatId })
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('senderId', 'first_name last_name email profile_image');

      // Mark messages as read by this user
      await Message.updateMany(
        {
          chatId,
          senderId: { $ne: userId },
          readBy: { $ne: userId }
        },
        {
          $addToSet: { readBy: userId },
          $set: { isRead: true }
        }
      );

      res.status(200).json({
        success: true,
        data: {
          messages: messages.map(msg => ({
            _id: msg._id,
            chatId: msg.chatId,
            senderId: msg.senderId,
            content: msg.content,
            messageType: msg.messageType,
            isRead: msg.isRead,
            createdAt: msg.createdAt,
            tokenCount: msg.tokenCount
          }))
        }
      });

    } catch (error: any) {
      console.error('Error getting chat messages:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Send message
  static async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const { message, messageType = 'text' } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!message || !message.trim()) {
        res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
        return;
      }

      // Verify user is participant in the chat
      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this chat'
        });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found" });
        return;
      }

      if (chat.consultation_status !== "active") {
        res.status(409).json({
          success: false,
          message: "Consultation is not active. Start consultation before sending messages.",
          data: ChatController.buildConsultationStatus(chat, userId),
        });
        return;
      }

      // Create new message
      const newMessage = new Message({
        chatId,
        senderId: userId,
        content: message.trim(),
        messageType,
        isRead: false,
        readBy: [userId], // Sender has read their own message
        tokenCount: 0 // Can be updated based on AI processing
      });

      await newMessage.save();
      await newMessage.populate('senderId', 'first_name last_name email profile_image');

      // Update chat's last message
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: newMessage._id,
        updatedAt: new Date(),
        consultation_last_activity_at: new Date(),
      });

      // Send notification to the other participant (not the sender)
      try {
        const otherParticipantId = chat.lawyer_id.toString() === userId ? chat.client_id.toString() : chat.lawyer_id.toString();
        await NotificationService.notifyNewMessage(newMessage, otherParticipantId, userId);
      } catch (notificationError) {
        console.error('Failed to send message notification:', notificationError);
        // Don't fail the message sending if notification fails
      }

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          _id: newMessage._id,
          chatId: newMessage.chatId,
          senderId: newMessage.senderId,
          content: newMessage.content,
          messageType: newMessage.messageType,
          isRead: newMessage.isRead,
          createdAt: newMessage.createdAt,
          tokenCount: newMessage.tokenCount
        }
      });

    } catch (error: any) {
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get all user's chats
  static async getUserChats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Get all chats where user is either lawyer or client
      const chats = await Chat.find({
        $or: [
          { lawyer_id: userId },
          { client_id: userId }
        ]
      })
        .populate('lawyer_id', 'first_name last_name email profile_image')
        .populate('client_id', 'first_name last_name email profile_image')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

      // Get unread counts for each chat
      const chatsWithUnreadCounts = await Promise.all(
        chats.map(async (chat) => {
          const unreadCount = await Message.countDocuments({
            chatId: chat._id,
            senderId: { $ne: userId },
            readBy: { $ne: userId }
          });

          return {
            _id: chat._id,
            lawyer_id: chat.lawyer_id,
            client_id: chat.client_id,
            lastMessage: chat.lastMessage,
            unreadCount,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
          };
        })
      );

      res.status(200).json({
        success: true,
        data: {
          chats: chatsWithUnreadCounts
        }
      });

    } catch (error: any) {
      console.error('Error getting user chats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete chat
  static async deleteChat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Verify user is participant in the chat
      const chat = await Chat.findById(chatId);
      if (!chat || (chat.lawyer_id.toString() !== userId && chat.client_id.toString() !== userId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this chat'
        });
        return;
      }

      // Delete all messages in the chat
      await Message.deleteMany({ chatId });

      // Delete the chat
      await Chat.findByIdAndDelete(chatId);

      res.status(200).json({
        success: true,
        message: 'Chat deleted successfully'
      });

    } catch (error: any) {
      console.error('Error deleting chat:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  static async getConsultationStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      res.status(200).json({
        success: true,
        data: ChatController.buildConsultationStatus(chat, userId),
      });
    } catch (error: any) {
      console.error("Error getting consultation status:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  static async startConsultation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found" });
        return;
      }

      if (chat.consultation_status === "ended" || chat.consultation_status === "auto_ended") {
        res.status(409).json({ success: false, message: "Consultation already ended", data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }

      const me = new mongoose.Types.ObjectId(userId);
      await Chat.findByIdAndUpdate(chat._id, {
        $addToSet: { consultation_started_by: me },
      });

      let updated = await Chat.findById(chat._id);
      const distinctStarters = new Set(
        (updated?.consultation_started_by || []).map((id: any) => id.toString())
      );
      if (updated && distinctStarters.size >= 2) {
        updated = await Chat.findByIdAndUpdate(
          chat._id,
          {
            $set: {
              consultation_status: "active",
              consultation_started_at: updated.consultation_started_at || new Date(),
              consultation_last_activity_at: new Date(),
            },
          },
          { new: true }
        );
      } else if (updated && updated.consultation_status !== "active") {
        updated = await Chat.findByIdAndUpdate(
          chat._id,
          { $set: { consultation_status: "pending" } },
          { new: true }
        );
      }

      res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(updated, userId) });
    } catch (error: any) {
      console.error("Error starting consultation:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  static async endConsultation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const { reason = "manual" } = req.body || {};
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found" });
        return;
      }

      if (chat.consultation_status === "ended" || chat.consultation_status === "auto_ended") {
        res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }

      if (reason === "inactivity") {
        const base = chat.consultation_last_activity_at ? new Date(chat.consultation_last_activity_at) : new Date();
        const endedAt = new Date(base.getTime() + ChatController.INACTIVITY_MS);
        const billableSeconds = chat.consultation_started_at
          ? ChatController.computeInactiveBillableSeconds(new Date(chat.consultation_started_at), endedAt)
          : 0;

        const updated = await Chat.findOneAndUpdate(
          { _id: chat._id, consultation_status: { $in: ["active", "pending"] } },
          {
            $set: {
              consultation_status: "auto_ended",
              consultation_ended_at: endedAt,
              consultation_end_reason: "inactivity",
              consultation_billable_seconds: billableSeconds,
            },
          },
          { new: true }
        );

        res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(updated, userId) });
        return;
      }

      const me = new mongoose.Types.ObjectId(userId);
      const alreadyOtherEnded = (chat.consultation_ended_by || []).some((id: any) => id.toString() !== userId);
      const endedAt = new Date();
      const billableSeconds = chat.consultation_started_at
        ? Math.max(0, Math.floor((endedAt.getTime() - new Date(chat.consultation_started_at).getTime()) / 1000))
        : 0;

      await Chat.findByIdAndUpdate(chat._id, {
        $addToSet: { consultation_ended_by: me },
        ...(alreadyOtherEnded
          ? {
              $set: {
                consultation_status: "ended",
                consultation_ended_at: endedAt,
                consultation_end_reason: "manual",
                consultation_billable_seconds: billableSeconds,
              },
            }
          : {}),
      });

      const updated = await Chat.findById(chat._id);
      res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(updated, userId) });
    } catch (error: any) {
      console.error("Error ending consultation:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export default ChatController;
