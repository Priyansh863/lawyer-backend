import mongoose, { Schema, Document } from "mongoose";

export interface ICase extends Document {
  case_number: string;
  status: "Pending" | "Approved" | "Rejected";
  title: string;
  description: string;
  summary: string;
  key_points: string[];
  important_dates: { event: string; date: Date }[];
  client_id: mongoose.Types.ObjectId;
  lawyer_id: mongoose.Types.ObjectId;
  files: string[];
  created_at: Date;
  updated_at: Date;
}

const CaseSchema: Schema = new Schema(
  {
    case_number: { type: String, required: true, unique: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    summary: { type: String, required: true },
    key_points: { type: [String], required: true },
    client_id: { type: mongoose.Types.ObjectId, ref: "Client", required: true },
    lawyer_id: { type: mongoose.Types.ObjectId, ref: "Lawyer", required: true },
    files: { type: [String], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<ICase>("Case", CaseSchema);
