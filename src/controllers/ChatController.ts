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
      }).populate('lawyer_id', 'first_name last_name email avatar')
        .populate('client_id', 'first_name last_name email avatar')
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
      await newChat.populate('lawyer_id', 'first_name last_name email avatar charges');
      await newChat.populate('client_id', 'first_name last_name email avatar');

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
        .populate('senderId', 'first_name last_name email avatar');

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
      const chat = await Chat.findById(chatId);
      if (!chat || (chat.lawyer_id.toString() !== userId && chat.client_id.toString() !== userId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this chat'
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
      await newMessage.populate('senderId', 'first_name last_name email avatar');

      // Update chat's last message
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: newMessage._id,
        updatedAt: new Date()
      });

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
        .populate('lawyer_id', 'first_name last_name email avatar')
        .populate('client_id', 'first_name last_name email avatar')
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
}

export default ChatController;
