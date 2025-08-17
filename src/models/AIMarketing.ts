import mongoose, { Document, Schema } from 'mongoose';

export interface IAIMarketing extends Document {
  user_id: mongoose.Types.ObjectId;
  prompt: string;
  generated_content: string;
  content_type: 'post' | 'article' | 'social_media';
  platforms: string[]; // ['linkedin', 'twitter', 'facebook', 'instagram', 'youtube']
  images: {
    url: string;
    alt_text?: string;
    position?: number;
  }[];
  status: 'draft' | 'published' | 'scheduled';
  scheduled_at?: Date;
  published_at?: Date;
  engagement_metrics?: {
    likes: number;
    shares: number;
    comments: number;
    views: number;
  };
  tags: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const AIMarketingSchema: Schema = new Schema<IAIMarketing>({
  user_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  prompt: { 
    type: String, 
    required: true,
    maxlength: 2000
  },
  generated_content: { 
    type: String, 
    required: true,
    maxlength: 10000
  },
  content_type: { 
    type: String, 
    enum: ['post', 'article', 'social_media'], 
    default: 'post' 
  },
  platforms: [{
    type: String,
    enum: ['linkedin', 'twitter', 'facebook', 'instagram', 'youtube']
  }],
  images: [{
    url: { type: String, required: true },
    alt_text: { type: String },
    position: { type: Number, default: 0 }
  }],
  status: { 
    type: String, 
    enum: ['draft', 'published', 'scheduled'], 
    default: 'draft' 
  },
  scheduled_at: { type: Date },
  published_at: { type: Date },
  engagement_metrics: {
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    views: { type: Number, default: 0 }
  },
  tags: [{ type: String }],
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Update the updated_at field before saving
AIMarketingSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Index for better query performance
AIMarketingSchema.index({ user_id: 1, created_at: -1 });
AIMarketingSchema.index({ user_id: 1, status: 1 });
AIMarketingSchema.index({ platforms: 1 });

const AIMarketing = mongoose.model<IAIMarketing>('AIMarketing', AIMarketingSchema);
export default AIMarketing;
