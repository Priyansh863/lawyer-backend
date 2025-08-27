import mongoose from 'mongoose';

interface INotification extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: 'case_created' | 'case_status_changed' | 'document_uploaded' | 'chat_started' | 'video_consultation_started' | 'qa_question_posted' | 'qa_answer_posted' | 'general';
  relatedId?: mongoose.Types.ObjectId;
  relatedType?: 'case' | 'document' | 'chat' | 'meeting' | 'qa_question' | 'qa_answer';
  redirectUrl?: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  metadata: any;
  createdBy?: mongoose.Types.ObjectId;
  markAsRead(): Promise<INotification>;
}

interface INotificationModel extends mongoose.Model<INotification> {
  getUnreadCount(userId: mongoose.Types.ObjectId): Promise<number>;
  markAllAsRead(userId: mongoose.Types.ObjectId): Promise<any>;
}

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  type: {
    type: String,
    required: true,
    enum: [
      'case_created',
      'case_status_changed',
      'document_uploaded',
      'chat_started',
      'video_consultation_started',
      'qa_question_posted',
      'qa_answer_posted',
      'general'
    ]
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  relatedType: {
    type: String,
    enum: ['case', 'document', 'chat', 'meeting', 'qa_question', 'qa_answer'],
    required: false
  },
  redirectUrl: {
    type: String,
    required: false
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
});

// Indexes for better query performance
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  return this.save();
};

// Static method to get unread count for user
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

// Static method to mark all as read for user
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany({ userId, isRead: false }, { isRead: true });
};

export default mongoose.model<INotification, INotificationModel>('Notification', notificationSchema);
