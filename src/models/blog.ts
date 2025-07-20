import mongoose, { Schema, Document } from "mongoose";

interface IBlog extends Document {
    title: string;
    content: string;
    author: mongoose.Schema.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    image?: string;
    excerpt?: string;
    category: string;
    status: 'draft' | 'published';
}

const BlogSchema: Schema = new Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    image: { type: String },
    excerpt: { type: String },
    category: {
        type: String,
        enum: ["legal-advice", "case-studies", "law-updates", "firm-news"], // ✅ Define valid categories
        required: true,
      },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', required: true },
});

const Blog = mongoose.model<IBlog>("Blog", BlogSchema);

export default Blog;
