import mongoose, { Document, Schema } from "mongoose";

export type DocumentPermissionAuditAction = "GRANT" | "REVOKE" | "PRIVACY_UPDATE";

export interface IDocumentPermissionAuditLog extends Document {
  document_id: mongoose.Types.ObjectId;
  actor_id: mongoose.Types.ObjectId;
  action: DocumentPermissionAuditAction;
  target_user_id?: mongoose.Types.ObjectId | null;
  old_value?: any;
  new_value?: any;
  created_at: Date;
}

const DocumentPermissionAuditLogSchema = new Schema<IDocumentPermissionAuditLog>(
  {
    document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserDocument",
      required: true,
      index: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["GRANT", "REVOKE", "PRIVACY_UPDATE"],
      required: true,
      index: true,
    },
    target_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    old_value: {
      type: Schema.Types.Mixed,
      default: null,
    },
    new_value: {
      type: Schema.Types.Mixed,
      default: null,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

DocumentPermissionAuditLogSchema.index({ document_id: 1, created_at: -1 });

const DocumentPermissionAuditLog = mongoose.model<IDocumentPermissionAuditLog>(
  "DocumentPermissionAuditLog",
  DocumentPermissionAuditLogSchema
);

export default DocumentPermissionAuditLog;
