import mongoose, { Schema, Document } from "mongoose";



// Korean Legal Case Status Types based on court outcomes
export enum CaseStatus {
  // Judgment Outcomes (판결 종국)
  FULL_WIN = 'full_win',           // 전부 승소 - Full Win
  FULL_LOSS = 'full_loss',         // 전부 패소 - Full Loss  
  PARTIAL_WIN = 'partial_win',     // 부분 승소 - Partial Win
  PARTIAL_LOSS = 'partial_loss',   // 부분 패소 - Partial Loss
  DISMISSAL = 'dismissal',         // 기각 - Dismissal
  REJECTION = 'rejection',         // 각하 - Rejection
  // Non-Judgment Outcomes (판결 외 종국)
  WITHDRAWAL = 'withdrawal',       // 취하 - Withdrawal
  MEDIATION = 'mediation',         // 조정 - Mediation
  SETTLEMENT = 'settlement',       // 화해 - Settlement
  TRIAL_CANCELLATION = 'trial_cancellation', // 공판취소 - Trial Cancellation
  SUSPENSION = 'suspension',       // 중지 - Suspension
  CLOSURE = 'closure',             // 종결 - Closure
  // Active case statuses
  IN_PROGRESS = 'in_progress',     // 진행 중 - Case in progress
  PENDING = 'pending'              // 대기 중 - Pending start
}

export interface ICase extends Document {
  case_number: string;
  status: string;
  case_type: string;
  court_type: string;
  title: string;
  description: string;
  summary: string;
  key_points: string[];
  important_dates: { event: string; date: Date }[];
  client_id: mongoose.Types.ObjectId;
  lawyer_id: mongoose.Types.ObjectId;
  documents: mongoose.Types.ObjectId[]; // References to associated documents
  status_history: {
    status: string;
    changed_at: Date;
    changed_by: mongoose.Types.ObjectId;
    notes?: string;
  }[];
  created_at: Date;
  updated_at: Date;
}

const CaseSchema: Schema = new Schema(
  {
    case_number: { 
      type: String, 
      required: true, 
      unique: true,
      index: true
    },
    status: { 
      type: String, 
      required: true,
      default: CaseStatus.PENDING,
      index: true
    },
    case_type: {
      type: String,
      required: true,
      index: true
    },
    court_type: {
      type: String,
      required: true,
      index: true
    },
    title: { 
      type: String, 
      required: true,
      trim: true
    },
    description: { 
      type: String, 
      required: true,
      trim: true
    },
    summary: { 
      type: String, 
      required: true,
      trim: true
    },
    key_points: { 
      type: [String], 
      required: true,
      default: []
    },
    important_dates: [{
      event: { 
        type: String, 
        required: true,
        trim: true
      },
      date: { 
        type: Date, 
        required: true 
      }
    }],
    client_id: { 
      type: mongoose.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true
    },
    lawyer_id: { 
      type: mongoose.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true
    },
    documents: [{
      type: mongoose.Types.ObjectId,
      ref: "UserDocument"
    }],
    status_history: [{
      status: {
        type: String,
        required: true
      },
      changed_at: {
        type: Date,
        default: Date.now
      },
      changed_by: {
        type: mongoose.Types.ObjectId,
        ref: "User",
        required: true
      },
      notes: {
        type: String,
        trim: true
      }
    }]
  },
  { 
    timestamps: { 
      createdAt: "created_at", 
      updatedAt: "updated_at" 
    },
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
CaseSchema.index({ client_id: 1, status: 1 });
CaseSchema.index({ lawyer_id: 1, status: 1 });
CaseSchema.index({ case_type: 1, court_type: 1 });
CaseSchema.index({ 'status_history.changed_at': -1 });

// Virtual for getting all documents associated with this case
CaseSchema.virtual('case_documents', {
  ref: 'UserDocument',
  localField: 'documents',
  foreignField: '_id'
});

// Middleware to track status changes
CaseSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status_history) {
    this.status_history.push({
      status: "pending",
      changed_at: new Date(),
      changed_by: this.lawyer_id,
      notes: 'Status updated'
    });
  }
  next();
});

export default mongoose.model<ICase>("Case", CaseSchema);
