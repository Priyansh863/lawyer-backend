import mongoose, { Document, Schema } from 'mongoose';

export interface IChat extends Document {
  lawyer_id: mongoose.Types.ObjectId;
  client_id: mongoose.Types.ObjectId;
  lastMessage?: mongoose.Types.ObjectId;
  consultation_status: 'pending' | 'active' | 'ended' | 'auto_ended';
  consultation_started_by: mongoose.Types.ObjectId[];
  consultation_ended_by: mongoose.Types.ObjectId[];
  consultation_started_at?: Date | null;
  consultation_ended_at?: Date | null;
  consultation_last_activity_at?: Date | null;
  consultation_billable_seconds: number;
  consultation_token_usage: number;
  consultation_tokens_deducted: boolean;
  consultation_end_notified: boolean;
  consultation_end_reason?: 'manual' | 'inactivity' | null;
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
  },
  consultation_status: {
    type: String,
    enum: ['pending', 'active', 'ended', 'auto_ended'],
    default: 'pending',
    index: true
  },
  consultation_started_by: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  consultation_ended_by: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  consultation_started_at: {
    type: Date,
    default: null
  },
  consultation_ended_at: {
    type: Date,
    default: null
  },
  consultation_last_activity_at: {
    type: Date,
    default: null
  },
  consultation_billable_seconds: {
    type: Number,
    default: 0
  },
  consultation_token_usage: {
    type: Number,
    default: 0
  },
  consultation_tokens_deducted: {
    type: Boolean,
    default: false
  },
  consultation_end_notified: {
    type: Boolean,
    default: false
  },
  consultation_end_reason: {
    type: String,
    enum: ['manual', 'inactivity', null],
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
ChatSchema.index({ consultation_status: 1, consultation_last_activity_at: 1 });

// Update the updated_at field before saving
ChatSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Chat = mongoose.model<IChat>('Chat', ChatSchema);
export default Chat;
