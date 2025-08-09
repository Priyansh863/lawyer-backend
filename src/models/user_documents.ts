import mongoose, { Schema, Document } from "mongoose";

// Document privacy levels
export enum DocumentPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private'
}

// Document processing status
export enum DocumentStatus {
  PENDING = 'Pending',
  COMPLETED = 'Completed', 
  FAILED = 'Failed'
}

export interface IUserDocument extends Document {
  document_name: string;
  uploaded_by: mongoose.Types.ObjectId;
  upload_date: Date;
  summary: string;
  status: DocumentStatus;
  link: string;
  privacy: DocumentPrivacy;
  file_size?: number;
  file_type?: string;
  shared_with: mongoose.Types.ObjectId[]; // Array of lawyer IDs this document is shared with
  created_at: Date;
  updated_at: Date;
}

const UserDocumentSchema: Schema = new Schema(
  {
    document_name: { type: String, required: true },
    summary: { type: String, required: false },
    status: { 
      type: String, 
      enum: Object.values(DocumentStatus), 
      required: true,
      default: DocumentStatus.PENDING
    },
    uploaded_by: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true
    },
    link: { type: String, required: true },
    privacy: {
      type: String,
      enum: Object.values(DocumentPrivacy),
      required: true,
      default: DocumentPrivacy.PUBLIC,
      index: true
    },
    file_size: { type: Number },
    file_type: { type: String },
    shared_with: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for efficient queries
UserDocumentSchema.index({ uploaded_by: 1, privacy: 1 });
UserDocumentSchema.index({ shared_with: 1 });
UserDocumentSchema.index({ created_at: -1 });

// Virtual for checking if document is shared
UserDocumentSchema.virtual('is_shared').get(function() {
  return this.shared_with && this.shared_with.length > 0;
});

// Static method to get documents accessible by a user (own + shared)
UserDocumentSchema.statics.getAccessibleDocuments = function(userId: string, userRole: string) {
  const query: any = {
    $or: [
      // User's own documents
      { uploaded_by: userId },
      // Documents shared with this user (if lawyer)
      ...(userRole === 'lawyer' ? [{ shared_with: userId }] : [])
    ]
  };
  
  return this.find(query)
    .populate('uploaded_by', 'name email role')
    .populate('shared_with', 'name email')
    .sort({ created_at: -1 });
};

// Static method to share document with lawyers
UserDocumentSchema.statics.shareWithLawyers = function(documentId: string, lawyerIds: string[]) {
  return this.findByIdAndUpdate(
    documentId,
    { $addToSet: { shared_with: { $each: lawyerIds } } },
    { new: true }
  ).populate('shared_with', 'name email');
};

// Static method to unshare document
UserDocumentSchema.statics.unshareDocument = function(documentId: string, lawyerId: string) {
  return this.findByIdAndUpdate(
    documentId,
    { $pull: { shared_with: lawyerId } },
    { new: true }
  );
};

export default mongoose.model<IUserDocument>("UserDocument", UserDocumentSchema);
