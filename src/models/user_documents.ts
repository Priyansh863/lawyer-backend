import mongoose, { Schema, Document } from "mongoose";

// Document privacy levels
export enum DocumentPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private', // Visible to selected users only
  FULLY_PRIVATE = 'fully_private' // Only uploader can view
}

// Document types
export enum DocumentType {
  CASE_RELATED = 'case_related',
  GENERAL = 'general'
}

// Document processing status
export enum DocumentStatus {
  PENDING = 'Pending',
  COMPLETED = 'Completed',
  FAILED = 'Failed'
}

// Document storage type
export enum StorageType {
  APP = 'app',
  CLOUD = 'cloud',
  APP_CLOUD = 'app_cloud'
}

export interface IUserDocument extends Document {
  document_name: string;
  uploaded_by: mongoose.Types.ObjectId;
  upload_date: Date;
  summary: string;
  status: DocumentStatus;
  link?: string;
  file_base64?: string;
  privacy: DocumentPrivacy;
  document_type: DocumentType;
  case_id?: mongoose.Types.ObjectId; // Reference to associated case
  file_size?: number;
  file_type?: string;
  shared_with: mongoose.Types.ObjectId[]; // Array of user IDs this document is shared with
  is_secure_link?: boolean; // Documents uploaded via secure link
  storage_type: StorageType;
  created_at: Date;
  updated_at: Date;
  is_shared: boolean; // Virtual field
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
    // Optional legacy URL for files stored in S3 or other storage
    link: { type: String, required: false },
    // Optional base64-encoded file content stored in DB
    file_base64: { type: String },
    privacy: {
      type: String,
      enum: Object.values(DocumentPrivacy),
      required: true,
      default: DocumentPrivacy.PRIVATE,
      index: true
    },
    document_type: {
      type: String,
      enum: Object.values(DocumentType),
      required: true,
      default: DocumentType.GENERAL
    },
    case_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      required: function () {
        return this.document_type === DocumentType.CASE_RELATED;
      }
    },
    file_size: { type: Number },
    file_type: { type: String },
    shared_with: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],
    is_secure_link: {
      type: Boolean,
      default: false
    },
    storage_type: {
      type: String,
      enum: Object.values(StorageType),
      default: StorageType.CLOUD
    }
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
UserDocumentSchema.virtual('is_shared').get(function () {
  return this.shared_with && this.shared_with.length > 0;
});

// Static method to get documents accessible by a user (own + shared + public)
UserDocumentSchema.statics.getAccessibleDocuments = function (userId: string, userRole: string) {
  const query: any = {
    $or: [
      // User's own documents (all privacy levels)
      { uploaded_by: userId },
      // Public documents (visible to everyone)
      { privacy: 'public' },
      // Documents shared with this user (private with shared access)
      { shared_with: userId, privacy: 'private' }
    ]
  };

  return this.find(query)
    .populate('uploaded_by', 'first_name last_name email account_type')
    .populate('shared_with', 'first_name last_name email account_type')
    .sort({ created_at: -1 });
};

// Static method to share document with lawyers
UserDocumentSchema.statics.shareWithLawyers = function (documentId: string, userIds: string[]) {
  return this.findByIdAndUpdate(
    documentId,
    { $addToSet: { shared_with: { $each: userIds } } },
    { new: true }
  ).populate('shared_with', 'name email');
};

// Static method to unshare document
UserDocumentSchema.statics.unshareDocument = function (documentId: string, lawyerId: string) {
  return this.findByIdAndUpdate(
    documentId,
    { $pull: { shared_with: lawyerId } },
    { new: true }
  );
};

export default mongoose.model<IUserDocument>("UserDocument", UserDocumentSchema);
