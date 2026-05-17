import mongoose, { Document, Schema } from "mongoose";

export interface IAnswer {
  _id?: mongoose.Types.ObjectId;
  lawyer_name: string;
  lawyer_id: mongoose.Types.ObjectId;
  answer: string;
  images?: string[];
  location?: string;
  createdAt?: Date;
}

export interface IQuestion extends Document {
  question: string;
  clientName?: string;
  isAnonymous: boolean;
  category: string;
  tags?: string[];
  images?: string[];
  answer?: IAnswer[]; // Array of answers
  status: "pending" | "answered";
  clientId: mongoose.Types.ObjectId;
  answeredBy?: mongoose.Types.ObjectId;
  answeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnswerSchema = new Schema<IAnswer>({
  lawyer_name: {
    type: String,
    required: [true, "Lawyer name is required"]
  },
  lawyer_id: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  answer: {
    type: String,
    required: [true, "Answer is required"],
    maxlength: [5000, "Answer cannot exceed 5000 characters"]
  },
  images: {
    type: [String],
    default: []
  },
  location: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const QuestionSchema = new Schema<IQuestion>(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      minlength: [10, "Question must be at least 10 characters"],
      maxlength: [5000, "Question cannot exceed 5000 characters"]
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
    images: {
      type: [String],
      default: []
    },
    answer: {
      type: [AnswerSchema],
      default: []
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
