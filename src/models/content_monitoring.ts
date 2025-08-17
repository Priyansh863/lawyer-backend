import mongoose from 'mongoose';

enum EContentType {
  Blog = 'Blog',
  QA = 'Q&A',
  AIPost = 'AI Post',
}

enum EContentStatus {
  Published = 'Published',
  Flagged = 'Flagged',
  Pending = 'Pending',
}

const ContentMonitoringSchema = new mongoose.Schema(
  {
    author: {
      type: String, // or mongoose.Schema.Types.ObjectId if referencing User
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(EContentType),
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    created_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: Object.values(EContentStatus),
      required: true,
      default: EContentStatus.Pending,
    },
    // Add more fields as needed (e.g., actions, content reference, etc.)
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

const ContentMonitoring = mongoose.model('ContentMonitoring', ContentMonitoringSchema);

export { ContentMonitoring, ContentMonitoringSchema };
