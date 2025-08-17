import { Request, Response } from 'express';
import Chat from '../models/Chat';
import Message from '../models/Message';
import { User } from '../models/user';
import mongoose from 'mongoose';

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

      // Check if chat already exists between these users
      let existingChat = await Chat.findOne({
        participants: { $all: [userId, participantId] }
      }).populate('participants', 'first_name last_name email avatar')
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
            participants: existingChat.participants,
            participantDetails: existingChat.participants,
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
        participants: [userId, participantId]
      });

      await newChat.save();
      await newChat.populate('participants', 'first_name last_name email avatar');

      res.status(201).json({
        success: true,
        message: 'Chat created successfully',
        data: {
          _id: newChat._id,
          participants: newChat.participants,
          participantDetails: newChat.participants,
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
      if (!chat || !chat.participants.includes(new mongoose.Types.ObjectId(userId))) {
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
      if (!chat || !chat.participants.includes(new mongoose.Types.ObjectId(userId))) {
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

      // Get all chats where user is a participant
      const chats = await Chat.find({
        participants: { $in: [userId] }
      })
        .populate('participants', 'first_name last_name email avatar')
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
            participants: chat.participants,
            participantDetails: chat.participants,
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
      if (!chat || !chat.participants.includes(new mongoose.Types.ObjectId(userId))) {
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

  // Get user's chats (latest chats)
  static async getUserChats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const chats = await Chat.find({
        participants: { $in: [userId] }
      })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('participants', 'first_name last_name email avatar')
        .populate('lastMessage');

      const totalChats = await Chat.countDocuments({
        participants: { $in: [userId] }
      });

      res.status(200).json({
        success: true,
        message: 'User chats retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error in getUserChats:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user chats'
      });
    }
  }

  // Get chat by ID
  static async getChatById(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const chat = await ChatService.getChatById(chatId);

      if (!chat) {
        res.status(404).json({
          success: false,
          message: 'Chat not found'
        });
        return;
      }

      // Check if user is participant in the chat
      const isParticipant = chat.participants.some(
        (participant: any) => participant._id.toString() === userId
      );

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to access this chat'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Chat retrieved successfully',
        data: chat
      });
    } catch (error: any) {
      console.error('Error in getChatById:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get chat'
      });
    }
  }

  // Get messages for a chat
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
      const chat = await ChatService.getChatById(chatId);
      if (!chat) {
        res.status(404).json({
          success: false,
          message: 'Chat not found'
        });
        return;
      }

      const isParticipant = chat.participants.some(
        (participant: any) => participant._id.toString() === userId
      );

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to access this chat'
        });
        return;
      }

      const result = await ChatService.getChatMessages(chatId, page, limit);

      res.status(200).json({
        success: true,
        message: 'Chat messages retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error in getChatMessages:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get chat messages'
      });
    }
  }

  // Send a message (REST API alternative to Socket.IO)
  static async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

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

      // Verify user is participant in the chat
      const chat = await ChatService.getChatById(chatId);
      if (!chat) {
        res.status(404).json({
          success: false,
          message: 'Chat not found'
        });
        return;
      }

      const isParticipant = chat.participants.some(
        (participant: any) => participant._id.toString() === userId
      );

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to send message to this chat'
        });
        return;
      }

      const savedMessage = await ChatService.sendMessage({
        chatId,
        senderId: userId,
        message,
        messageType
      });

      // Update chat's last message
      await ChatService.updateChatLastMessage(chatId, message);

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: savedMessage
      });
    } catch (error: any) {
      console.error('Error in sendMessage:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send message'
      });
    }
  }

  // Mark messages as read
  static async markMessagesAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const chat = await ChatService.getChatById(chatId);
      if (!chat) {
        res.status(404).json({
          success: false,
          message: 'Chat not found'
        });
        return;
      }

      const isParticipant = chat.participants.some(
        (participant: any) => participant._id.toString() === userId
      );

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to access this chat'
        });
        return;
      }

      await ChatService.markChatMessagesAsRead(chatId, userId);

      res.status(200).json({
        success: true,
        message: 'Messages marked as read successfully'
      });
    } catch (error: any) {
      console.error('Error in markMessagesAsRead:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to mark messages as read'
      });
    }
  }

  // Get unread messages count
  static async getUnreadMessagesCount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const unreadCount = await ChatService.getUnreadMessagesCount(userId);

      res.status(200).json({
        success: true,
        message: 'Unread messages count retrieved successfully',
        data: { unreadCount }
      });
    } catch (error: any) {
      console.error('Error in getUnreadMessagesCount:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get unread messages count'
      });
    }
  }

  // Search messages in a chat
  static async searchMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const { q: searchQuery } = req.query;
      const userId = req.user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!searchQuery || typeof searchQuery !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
        return;
      }

      // Verify user is participant in the chat
      const chat = await ChatService.getChatById(chatId);
      if (!chat) {
        res.status(404).json({
          success: false,
          message: 'Chat not found'
        });
        return;
      }

      const isParticipant = chat.participants.some(
        (participant: any) => participant._id.toString() === userId
      );

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: 'Unauthorized to search in this chat'
        });
        return;
      }

      const result = await ChatService.searchMessages(chatId, searchQuery, page, limit);

      res.status(200).json({
        success: true,
        message: 'Messages search completed successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error in searchMessages:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to search messages'
      });
    }
  }

  // Delete a chat
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

      await ChatService.deleteChat(chatId, userId);

      res.status(200).json({
        success: true,
        message: 'Chat deleted successfully'
      });
    } catch (error: any) {
      console.error('Error in deleteChat:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete chat'
      });
    }
  }
}

export default ChatController;
