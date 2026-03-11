import mongoose, { Document, Schema } from 'mongoose';

export interface IBookmark extends Document {
  userId: mongoose.Types.ObjectId;
  postId?: mongoose.Types.ObjectId;
  questionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BookmarkSchema: Schema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }
}, {
  timestamps: true
});

// Create compound indexes to ensure one bookmark per user per content
// Using partialFilterExpression instead of sparse to properly handle null/missing values in compound indexes
BookmarkSchema.index(
  { userId: 1, postId: 1 },
  {
    unique: true,
    partialFilterExpression: { postId: { $type: "objectId" } }
  }
);

BookmarkSchema.index(
  { userId: 1, questionId: 1 },
  {
    unique: true,
    partialFilterExpression: { questionId: { $type: "objectId" } }
  }
);

export default mongoose.model<IBookmark>('Bookmark', BookmarkSchema);
