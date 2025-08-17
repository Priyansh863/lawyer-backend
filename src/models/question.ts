import mongoose, { Document, Schema } from "mongoose";

export interface IQuestion extends Document {
  question: string;
  clientName?: string;
  isAnonymous: boolean;
  category: string;
  tags?: string[];
  answer?: string; // nullable by default
  status: "pending" | "answered";
  clientId: mongoose.Types.ObjectId;
  answeredBy?: mongoose.Types.ObjectId;
  answeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      minlength: [10, "Question must be at least 10 characters"]
    },
    clientName: {
      type: String,
    },
    isAnonymous: {
      type: Boolean,
      default: true
    },
    category: {
      type: String,
      required: [true, "Category is required"]
    },
    tags: {
      type: [String]
    },
    answer: {
      type: String,
      default: null // nullable by default
    },
    status: {
      type: String,
      enum: ["pending", "answered"],
      default: "pending"
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Client ID is required"]
    },
    answeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    answeredAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const Question = mongoose.model<IQuestion>("Question", QuestionSchema);

export default Question;
