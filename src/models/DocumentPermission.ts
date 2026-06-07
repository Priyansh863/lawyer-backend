import mongoose, { Document, Schema } from "mongoose";

export interface IDocumentPermission extends Document {
  document_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  granted_by: mongoose.Types.ObjectId;
  granted_at: Date;
  revoked_at?: Date | null;
  revoked_by?: mongoose.Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
}

const DocumentPermissionSchema = new Schema<IDocumentPermission>(
  {
    document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserDocument",
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    granted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    granted_at: {
      type: Date,
      default: Date.now,
      required: true,
    },
    revoked_at: {
      type: Date,
      default: null,
    },
    revoked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

DocumentPermissionSchema.index({ document_id: 1, user_id: 1, revoked_at: 1 });
DocumentPermissionSchema.index(
  { document_id: 1, user_id: 1 },
  {
    unique: true,
    partialFilterExpression: { revoked_at: null },
  }
);

const DocumentPermission = mongoose.model<IDocumentPermission>("DocumentPermission", DocumentPermissionSchema);
export default DocumentPermission;
