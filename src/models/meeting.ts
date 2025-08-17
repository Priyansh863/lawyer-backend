import mongoose, { Document, Schema } from 'mongoose';

export enum EMeetingStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export enum EMeetingType {
  VIDEO = 'video',
  AUDIO = 'audio',
  IN_PERSON = 'in_person'
}

export interface IMeeting extends Document {
  lawyer_id: mongoose.Types.ObjectId;
  client_id: mongoose.Types.ObjectId;
  meeting_title: string;
  meeting_description?: string;
  meeting_type: EMeetingType;
  start_time: Date;
  end_time: Date;
  duration_minutes: number;
  timezone: string;
  meeting_link?: string;
  location?: string;
  status: EMeetingStatus;
  initiated_by: 'lawyer' | 'client';
  approved_by?: mongoose.Types.ObjectId;
  approved_at?: Date;
  rejection_reason?: string;
  cancellation_reason?: string;
  notes?: string;
  reminder_sent: boolean;
  reminder_sent_at?: Date;
  case_id?: mongoose.Types.ObjectId;
  agenda_items?: string[];
  created_by: mongoose.Types.ObjectId;
  updated_by: mongoose.Types.ObjectId;
  created_at: Date;
  updated_at: Date;
  is_upcoming: boolean;
  is_in_progress: boolean;
}

const MeetingSchema: Schema = new Schema(
  {
    lawyer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    client_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    meeting_title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    meeting_description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    meeting_type: {
      type: String,
      enum: Object.values(EMeetingType),
      required: true,
      default: EMeetingType.VIDEO
    },
    start_time: {
      type: Date,
      required: true,
      validate: {
        validator: function(value: Date) {
          return value > new Date();
        },
        message: 'Start time must be in the future'
      }
    },
    end_time: {
      type: Date,
      required: true,
      validate: {
        validator: function(this: IMeeting, value: Date) {
          return value > this.start_time;
        },
        message: 'End time must be after start time'
      }
    },
    duration_minutes: {
      type: Number,
      required: true,
      min: 5,
      max: 480 // 8 hours max
    },
    timezone: {
      type: String,
      required: true,
      default: 'UTC'
    },
    meeting_link: {
      type: String,
      trim: true
    },
    location: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: Object.values(EMeetingStatus),
      required: true,
      default: EMeetingStatus.PENDING_APPROVAL,
      index: true
    },
    initiated_by: {
      type: String,
      enum: ['lawyer', 'client'],
      required: true
    },
    approved_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approved_at: {
      type: Date
    },
    rejection_reason: {
      type: String,
      trim: true,
      maxlength: 500
    },
    cancellation_reason: {
      type: String,
      trim: true,
      maxlength: 500
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    reminder_sent: {
      type: Boolean,
      default: false
    },
    reminder_sent_at: {
      type: Date
    },
    case_id: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      index: true
    },
    agenda_items: [{
      type: String,
      trim: true,
      maxlength: 200
    }],
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
MeetingSchema.index({ lawyer_id: 1, status: 1 });
MeetingSchema.index({ client_id: 1, status: 1 });
MeetingSchema.index({ start_time: 1 });
MeetingSchema.index({ end_time: 1 });
MeetingSchema.index({ created_at: -1 });

// Virtual for checking if meeting is upcoming
MeetingSchema.virtual('is_upcoming').get(function(this: IMeeting) {
  return this.status === EMeetingStatus.APPROVED && this.start_time > new Date();
});

// Virtual for checking if meeting is in progress
MeetingSchema.virtual('is_in_progress').get(function(this: IMeeting) {
  const now = new Date();
  return this.status === EMeetingStatus.APPROVED && 
         this.start_time <= now && 
         this.end_time >= now;
});

// Pre-save hook to update status and handle workflow
MeetingSchema.pre<IMeeting>('save', function(next) {
  const now = new Date();
  
  // Auto-update status based on time for approved meetings
  if (this.status === EMeetingStatus.APPROVED) {
    if (this.start_time <= now && this.end_time >= now) {
      this.status = EMeetingStatus.ACTIVE;
    } else if (this.end_time < now) {
      this.status = EMeetingStatus.COMPLETED;
    }
  }
  
  // Mark expired meetings
  if ([EMeetingStatus.PENDING_APPROVAL, EMeetingStatus.SCHEDULED].includes(this.status) && 
      this.end_time < now) {
    this.status = EMeetingStatus.EXPIRED;
  }
  
  // Auto-approve meetings created by lawyers
  if (this.initiated_by === 'lawyer' && this.status === EMeetingStatus.PENDING_APPROVAL) {
    this.status = EMeetingStatus.APPROVED;
    this.approved_by = this.created_by;
    this.approved_at = now;
  }
  
  // Calculate duration if not set
  if (!this.duration_minutes && this.start_time && this.end_time) {
    this.duration_minutes = Math.round((this.end_time.getTime() - this.start_time.getTime()) / (1000 * 60));
  }
  
  // Set updated_by to the same as created_by if not set
  if (!this.updated_by) {
    this.updated_by = this.created_by;
  }
  
  next();
});

// Add method to approve meeting
MeetingSchema.methods.approve = function(approvedBy: mongoose.Types.ObjectId, notes?: string) {
  this.status = EMeetingStatus.APPROVED;
  this.approved_by = approvedBy;
  this.approved_at = new Date();
  this.updated_by = approvedBy;
  if (notes) this.notes = notes;
  return this.save();
};

// Add method to reject meeting
MeetingSchema.methods.reject = function(rejectedBy: mongoose.Types.ObjectId, reason: string) {
  this.status = EMeetingStatus.REJECTED;
  this.rejection_reason = reason;
  this.updated_by = rejectedBy;
  return this.save();
};

// Add method to cancel meeting
MeetingSchema.methods.cancel = function(cancelledBy: mongoose.Types.ObjectId, reason?: string) {
  this.status = EMeetingStatus.CANCELLED;
  this.cancellation_reason = reason;
  this.updated_by = cancelledBy;
  return this.save();
};

const Meeting = mongoose.model<IMeeting>('Meeting', MeetingSchema);

export default Meeting;
