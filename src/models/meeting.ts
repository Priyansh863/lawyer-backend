import mongoose from 'mongoose';

enum EMeetingStatus {
  pending = 'pending',
  approved = 'approved',
  rejected = 'rejected',
  scheduled = 'scheduled',
  active = 'active',
  completed = 'completed',
  cancelled = 'cancelled',
}

const MeetingSchema = new mongoose.Schema(
  {
    lawyer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    meeting_title: {
      type: String,
      required: false,
    },
    meeting_description: {
      type: String,
      required: false,
    },
    requested_date: {
      type: Date,
      required: false,
    },
    requested_time: {
      type: String,
      required: false,
    },
    meeting_link: {
      type: String,
      required: false, // Only required after approval
    },
    status: {
      type: String,
      enum: Object.values(EMeetingStatus),
      default: EMeetingStatus.pending,
    },
    approval_date: {
      type: Date,
      required: false,
    },
    rejection_reason: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
MeetingSchema.index({ lawyer_id: 1 });
MeetingSchema.index({ client_id: 1 });
MeetingSchema.index({ status: 1 });

const Meeting = mongoose.model('Meeting', MeetingSchema);

export default Meeting;
export { EMeetingStatus };
