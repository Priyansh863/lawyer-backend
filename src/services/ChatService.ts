import mongoose from 'mongoose';
import Chat, { IChat } from '../models/Chat';
import ChatMessage, { IChatMessage } from '../models/ChatMessage';
import Message from '../models/Message';

interface SendMessageData {
  chatId: string;
  senderId: string;
  message: string;
  messageType?: 'text' | 'image' | 'file';
}

interface CreateChatData {
  userId: string;
  lawyerId: string;
}

class ChatService {
  // Create a new chat between user and lawyer
  static async createChat(data: CreateChatData): Promise<IChat> {
    try {
      // Check if chat already exists between these users
      const existingChat = await Chat.findOne({
        $or: [
          { user_id: data.userId, lawyer_id: data.lawyerId },
          { user_id: data.lawyerId, lawyer_id: data.userId }
        ],
        is_active: true
      });

      if (existingChat) {
        return existingChat;
      }

      // Create new chat
      const chat = new Chat({
        user_id: data.userId,
        lawyer_id: data.lawyerId,
        participants: [data.userId, data.lawyerId],
        is_active: true
      });

      return await chat.save();
    } catch (error) {
      console.error('Error creating chat:', error);
      throw new Error('Failed to create chat');
    }
  }

  // Get chat by ID with populated participants
  static async getChatById(chatId: string): Promise<IChat | null> {
    try {
      return await Chat.findById(chatId)
        .populate('participants', 'name email role')
        .populate('user_id', 'name email')
        .populate('lawyer_id', 'name email');
    } catch (error) {
      console.error('Error getting chat by ID:', error);
      throw new Error('Failed to get chat');
    }
  }

  // Get all chats for a user (latest chats)
  static async getUserChats(userId: string, page: number = 1, limit: number = 20): Promise<{
    chats: IChat[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const chats = await Chat.find({
        participants: userId,
        is_active: true
      })
        .populate('participants', 'name email role')
        .populate('user_id', 'name email')
        .populate('lawyer_id', 'name email')
        .sort({ last_message_at: -1, updated_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Chat.countDocuments({
        participants: userId,
        is_active: true
      });

      return {
        chats,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting user chats:', error);
      throw new Error('Failed to get user chats');
    }
  }

  // Send a message
  static async sendMessage(data: SendMessageData): Promise<IChatMessage> {
    try {
      const message = new ChatMessage({
        chat_id: data.chatId,
        sender_id: data.senderId,
        message: data.message,
        message_type: data.messageType || 'text'
      });

      const savedMessage = await message.save();
      
      // Populate sender information
      await savedMessage.populate('sender_id', 'name email role');

      return savedMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      throw new Error('Failed to send message');
    }
  }

  // Get messages for a chat
  static async getChatMessages(
    chatId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<{
    messages: IChatMessage[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const messages = await ChatMessage.find({ chat_id: chatId })
        .populate('sender_id', 'name email role')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ChatMessage.countDocuments({ chat_id: chatId });

      return {
        messages: messages.reverse(), // Reverse to show oldest first
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting chat messages:', error);
      throw new Error('Failed to get chat messages');
    }
  }

  // Update chat's last message
  static async updateChatLastMessage(chatId: string, lastMessage: string): Promise<void> {
    try {
      await Chat.findByIdAndUpdate(chatId, {
        last_message: lastMessage,
        last_message_at: new Date(),
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Error updating chat last message:', error);
      throw new Error('Failed to update chat last message');
    }
  }

  // Mark message as read
  static async markMessageAsRead(messageId: string, userId: string): Promise<void> {
    try {
      const message = await ChatMessage.findById(messageId);
      
      if (message && message.sender_id.toString() !== userId) {
        message.is_read = true;
        message.read_at = new Date();
        await message.save();
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
      throw new Error('Failed to mark message as read');
    }
  }

  // Get unread messages count for a user
  static async getUnreadMessagesCount(userId: string): Promise<number> {
    try {
      // Get all chats where user is a participant
      const userChats = await Chat.find({
        participants: userId,
        is_active: true
      }).select('_id');

      const chatIds = userChats.map(chat => chat._id);

      // Count unread messages in these chats (excluding messages sent by the user)
      const unreadCount = await ChatMessage.countDocuments({
        chat_id: { $in: chatIds },
        sender_id: { $ne: userId },
        is_read: false
      });

      return unreadCount;
    } catch (error) {
      console.error('Error getting unread messages count:', error);
      throw new Error('Failed to get unread messages count');
    }
  }

  // Mark all messages in a chat as read by a user
  static async markChatMessagesAsRead(chatId: string, userId: string): Promise<void> {
    try {
      await ChatMessage.updateMany(
        {
          chat_id: chatId,
          sender_id: { $ne: userId },
          is_read: false
        },
        {
          is_read: true,
          read_at: new Date()
        }
      );
    } catch (error) {
      console.error('Error marking chat messages as read:', error);
      throw new Error('Failed to mark chat messages as read');
    }
  }

  // Delete a chat (soft delete)
  static async deleteChat(chatId: string, userId: string): Promise<void> {
    try {
      const chat = await Chat.findById(chatId);
      
      if (!chat) {
        throw new Error('Chat not found');
      }

      // Check if user is participant
      if (chat.lawyer_id.toString() !== userId && chat.client_id.toString() !== userId) {
        throw new Error('Unauthorized to delete this chat');
      }

      // Delete the chat and all its messages
      await ChatMessage.deleteMany({ chat_id: chat._id });
      await Chat.findByIdAndDelete(chat._id);
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw new Error('Failed to delete chat');
    }
  }

  // Search messages in a chat
  static async searchMessages(
    chatId: string, 
    searchQuery: string, 
    page: number = 1, 
    limit: number = 20
  ): Promise<{
    messages: IChatMessage[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const messages = await ChatMessage.find({
        chat_id: chatId,
        message: { $regex: searchQuery, $options: 'i' }
      })
        .populate('sender_id', 'name email role')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ChatMessage.countDocuments({
        chat_id: chatId,
        message: { $regex: searchQuery, $options: 'i' }
      });

      return {
        messages,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error searching messages:', error);
      throw new Error('Failed to search messages');
    }
  }
}

export default ChatService;
