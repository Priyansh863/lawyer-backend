import mongoose, { Document, Schema } from "mongoose";

export interface ISecureLinkUpload extends Document {
  link_id: mongoose.Types.ObjectId;
  document_id: mongoose.Types.ObjectId;
  file_url: string;
  file_name: string;
  file_size: number;
  uploaded_at: Date;
}

const SecureLinkUploadSchema = new Schema<ISecureLinkUpload>({
  link_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SecureLink",
    required: true,
    index: true,
  },
  document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserDocument",
    required: true,
  },
  file_url: {
    type: String,
    required: true,
  },
  file_name: {
    type: String,
    required: true,
    trim: true,
  },
  file_size: {
    type: Number,
    default: 0,
  },
  uploaded_at: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

SecureLinkUploadSchema.index({ link_id: 1, uploaded_at: -1 });

const SecureLinkUpload = mongoose.model<ISecureLinkUpload>(
  "SecureLinkUpload",
  SecureLinkUploadSchema
);

export default SecureLinkUpload;
