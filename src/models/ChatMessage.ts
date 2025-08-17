import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessage extends Document {
  chat_id: mongoose.Types.ObjectId;
  sender_id: mongoose.Types.ObjectId;
  message: string;
  message_type: 'text' | 'image' | 'file';
  is_read: boolean;
  read_at?: Date;
  created_at: Date;
}

const ChatMessageSchema: Schema = new Schema<IChatMessage>({
  chat_id: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  message_type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  is_read: { type: Boolean, default: false },
  read_at: { type: Date },
  created_at: { type: Date, default: Date.now },
});

const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
export default ChatMessage;
