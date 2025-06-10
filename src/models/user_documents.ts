import mongoose, { Schema, Document } from "mongoose";

export interface IUserDocument extends Document {
  document_name: string;
  uploaded_by: mongoose.Types.ObjectId;
  upload_date: Date;
  summary: string;
  status: "Pending" | "Approved" | "Rejected";
}

const UserDocumentSchema: Schema = new Schema(
  {
    document_name: { type: String, required: true },
    summary: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], required: true },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    link: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IUserDocument>("UserDocument", UserDocumentSchema);
