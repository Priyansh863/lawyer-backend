import mongoose, { Document, Schema } from 'mongoose';

export interface IChat extends Document {
  lawyer_id: mongoose.Types.ObjectId;
  client_id: mongoose.Types.ObjectId;
  lastMessage?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema: Schema = new Schema({
  lawyer_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  client_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastMessage: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
ChatSchema.index({ lawyer_id: 1, client_id: 1 }, { unique: true });
ChatSchema.index({ lawyer_id: 1 });
ChatSchema.index({ client_id: 1 });
ChatSchema.index({ updatedAt: -1 });

// Update the updated_at field before saving
ChatSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Chat = mongoose.model<IChat>('Chat', ChatSchema);
export default Chat;
