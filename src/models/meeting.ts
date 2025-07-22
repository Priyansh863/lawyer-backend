import mongoose from 'mongoose';

enum EMeetingStatus {
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
    meeting_link: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(EMeetingStatus),
      default: EMeetingStatus.scheduled,
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
