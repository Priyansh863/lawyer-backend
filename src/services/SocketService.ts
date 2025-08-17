import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import config from '../config/envConfig';
import ChatService from './ChatService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

class SocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

        console.log("token", token);
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const envConfig = config();
        console.log("envConfig", envConfig);
        
        const decoded = jwt.verify(token, envConfig.jwtSecretKey) as any;
        console.log("decoded", decoded);
        
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        
        next();
      } catch (error) {
        console.log("error", error);
        
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);
      
      // Store user connection
      if (socket.userId) {
        this.connectedUsers.set(socket.userId, socket.id);
        
        // Join user to their personal room
        socket.join(`user_${socket.userId}`);
      }

      // Handle joining chat rooms
      socket.on('join_chat', async (chatId: string) => {
        try {
          // Verify user is part of this chat
          const chat = await ChatService.getChatById(chatId);
          if (chat && socket.userId && this.isUserInChat(socket.userId, chat)) {
            socket.join(`chat_${chatId}`);
            console.log(`User ${socket.userId} joined chat ${chatId}`);
          }
        } catch (error) {
          socket.emit('error', { message: 'Failed to join chat' });
        }
      });

      // Handle leaving chat rooms
      socket.on('leave_chat', (chatId: string) => {
        socket.leave(`chat_${chatId}`);
        console.log(`User ${socket.userId} left chat ${chatId}`);
      });

      // Handle sending messages
      socket.on('send_message', async (data: {
        chatId: string;
        message: string;
        messageType?: 'text' | 'image' | 'file';
      }) => {
        try {
          if (!socket.userId) return;

          const { chatId, message, messageType = 'text' } = data;
          
          // Verify user is part of this chat
          const chat = await ChatService.getChatById(chatId);
          if (!chat || !this.isUserInChat(socket.userId, chat)) {
            socket.emit('error', { message: 'Unauthorized to send message to this chat' });
            return;
          }

          // Save message to database
          const savedMessage = await ChatService.sendMessage({
            chatId,
            senderId: socket.userId,
            message,
            messageType
          });

          // Emit message to all users in the chat room
          this.io.to(`chat_${chatId}`).emit('new_message', {
            messageId: savedMessage._id,
            chatId,
            senderId: socket.userId,
            message,
            messageType,
            createdAt: savedMessage.created_at,
            isRead: false
          });

          // Update chat's last message
          await ChatService.updateChatLastMessage(chatId, message);

        } catch (error) {
          console.error('Error sending message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle message read status
      socket.on('mark_message_read', async (data: {
        messageId: string;
        chatId: string;
      }) => {
        try {
          if (!socket.userId) return;

          await ChatService.markMessageAsRead(data.messageId, socket.userId);
          
          // Notify sender that message was read
          this.io.to(`chat_${data.chatId}`).emit('message_read', {
            messageId: data.messageId,
            readBy: socket.userId,
            readAt: new Date()
          });

        } catch (error) {
          console.error('Error marking message as read:', error);
        }
      });

      // Handle typing indicators
      socket.on('typing_start', (data: { chatId: string }) => {
        socket.to(`chat_${data.chatId}`).emit('user_typing', {
          userId: socket.userId,
          chatId: data.chatId
        });
      });

      socket.on('typing_stop', (data: { chatId: string }) => {
        socket.to(`chat_${data.chatId}`).emit('user_stopped_typing', {
          userId: socket.userId,
          chatId: data.chatId
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
        }
      });
    });
  }

  private isUserInChat(userId: string, chat: any): boolean {
    return chat.participants.some((participant: any) => 
      participant.toString() === userId
    );
  }

  // Method to send notification to specific user
  public sendNotificationToUser(userId: string, notification: any) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
    }
  }

  // Method to send message to specific chat
  public sendMessageToChat(chatId: string, message: any) {
    this.io.to(`chat_${chatId}`).emit('new_message', message);
  }

  // Get online users count
  public getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Check if user is online
  public isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}

export default SocketService;
