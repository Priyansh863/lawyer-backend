import mongoose, { Schema, Document } from "mongoose";

export interface IUserActivity extends Document {
  activity_name: string;
  description: string;
  user_id: mongoose.Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const UserActivitySchema: Schema = new Schema(
  {
    activity_name: { type: String, required: true },
    description: { type: String, required: true },
    user_id: { type: mongoose.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export default mongoose.model<IUserActivity>("UserActivity", UserActivitySchema);
