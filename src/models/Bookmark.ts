import mongoose, { Document, Schema } from 'mongoose';

export interface IBookmark extends Document {
  userId: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
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
    ref: 'Post',
    required: true
  }
}, {
  timestamps: true
});

// Create compound index to ensure one bookmark per user per post
BookmarkSchema.index({ userId: 1, postId: 1 }, { unique: true });

export default mongoose.model<IBookmark>('Bookmark', BookmarkSchema);
