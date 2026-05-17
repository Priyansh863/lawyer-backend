import mongoose, { Document, Schema } from 'mongoose';
import { applyEncryption } from '../utils/mongooseEncryption';

export interface IMessage extends Document {
  chatId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  messageType: 'text' | 'image' | 'file';
  isRead: boolean;
  readBy: mongoose.Types.ObjectId[];
  tokenCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema<IMessage>({
  chatId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Chat', 
    required: true 
  },
  senderId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  messageType: { 
    type: String, 
    enum: ['text', 'image', 'file'], 
    default: 'text' 
  },
  isRead: { 
    type: Boolean, 
    default: false 
  },
  readBy: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  tokenCount: { 
    type: Number, 
    default: 0 
  },
}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

// Index for efficient queries
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });

applyEncryption(MessageSchema, ["content"]);

const Message = mongoose.model<IMessage>('Message', MessageSchema);
export default Message;
