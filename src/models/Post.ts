import mongoose, { Schema, Document } from 'mongoose';

export interface ISpatialInfo {
  planet?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  timestamp?: Date;
  floor?: number;
}

export interface ICitation {
  type: 'spatial' | 'user' | 'url';
  content: string;
  spatialInfo?: ISpatialInfo;
  userId?: mongoose.Types.ObjectId;
  url?: string;
}

export interface IPost extends Document {
  title: string;
  content: string;
  author: mongoose.Types.ObjectId;
  slug: string;
  spatialInfo?: ISpatialInfo;
  citations: ICitation[];
  hashtag?: string;
  hashtags?: string[];
  usefulLinks?: {
    title: string;
    url: string;
    description?: string;
  }[];
  customUrl?: string;
  shortUrl?: string;
  qrCodeUrl?: string;
  status: 'draft' | 'published';
  isAiGenerated?: boolean;
  aiPrompt?: string;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  generateCustomUrl(): string;
  generateShortUrl(): string;
  generateQrCodeUrl(): string;
}

export interface IPostModel extends mongoose.Model<IPost> {
  parseLocationUrl(url: string): ISpatialInfo | null;
}

const SpatialInfoSchema: Schema = new Schema({
  planet: {
    type: String,
    default: 'Earth',
    maxlength: 50
  },
  latitude: {
    type: Number,
    min: -90,
    max: 90,
  },
  longitude: {
    type: Number,
    min: -180,
    max: 180,
  },
  altitude: {
    type: Number,
    min: -500,
    max: 9000,
  },
  timestamp: {
    type: Date,
  },
  floor: {
    type: Number,
  }
}, { _id: false });

const CitationSchema: Schema = new Schema({
  type: {
    type: String,
    enum: ['spatial', 'user', 'url'],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 500
  },
  spatialInfo: SpatialInfoSchema,
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  url: {
    type: String,
  }
}, { _id: false });

const PostSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000,
    trim: true
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  slug: {
    type: String,
    required: false,
    unique: false,
    lowercase: true,
    trim: true,
  },
  spatialInfo: SpatialInfoSchema,
  citations: [CitationSchema],
  hashtag: {
    type: String,
    maxlength: 100,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        // Support Korean characters (가-힣), English letters, numbers, and underscores
        return /^#[a-zA-Z0-9_가-힣]+$/.test(v);
      },
      message: 'Hashtag must start with # and contain only letters, Korean characters, numbers, and underscores'
    }
  },
  hashtags: [{
    type: String,
    maxlength: 100,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        // Support Korean characters (가-힣), English letters, numbers, and underscores
        return /^#[a-zA-Z0-9_가-힣]+$/.test(v);
      },
      message: 'Hashtag must start with # and contain only letters, Korean characters, numbers, and underscores'
    }
  }],
  usefulLinks: [{
    title: {
      type: String,
      required: true,
      maxlength: 200
    },
    url: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    description: {
      type: String,
      maxlength: 500
    }
  }],
  customUrl: {
    type: String,
    maxlength: 1000
  },
  shortUrl: {
    type: String,
    maxlength: 500
  },
  qrCodeUrl: {
    type: String,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  },
  isAiGenerated: {
    type: Boolean,
    default: false
  },
  aiPrompt: {
    type: String,
    maxlength: 1000
  },
  image: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ slug: 1 });
PostSchema.index({ status: 1, createdAt: -1 });
PostSchema.index({ 'spatialInfo.latitude': 1, 'spatialInfo.longitude': 1 });

// Pre-save middleware to generate URLs
PostSchema.pre('save', function(next) {
  // Always regenerate URLs to ensure they use current slug format
  this.customUrl = this.generateCustomUrl();
  this.shortUrl = this.generateShortUrl();
  next();
});

// Instance methods
PostSchema.methods.generateCustomUrl = function(): string {
  // Use frontend URL for custom URLs
  const frontendUrl = process.env.FRONTEND_URL || process.env.frontendUrl || 'https://lawgg.net';
  
  // Base URL with post title (slug)
  let url = `${frontendUrl}/${this.slug}`;
  
  // Add spatial parameters if available
  if (this.spatialInfo && this.spatialInfo.latitude && this.spatialInfo.longitude) {
    const params = new URLSearchParams();
    
    if (this.spatialInfo.planet) params.append('planet', this.spatialInfo.planet);
    params.append('lat', this.spatialInfo.latitude.toString());
    params.append('lng', this.spatialInfo.longitude.toString());
    
    if (this.spatialInfo.altitude !== null && this.spatialInfo.altitude !== undefined) {
      params.append('altitude', this.spatialInfo.altitude.toString());
    }
    
    if (this.spatialInfo.timestamp) {
      params.append('timestamp', this.spatialInfo.timestamp.toISOString().slice(0, 16));
    }
    
    if (this.spatialInfo.floor !== null && this.spatialInfo.floor !== undefined) {
      params.append('floor', this.spatialInfo.floor.toString());
    }
    
    url += `?${params.toString()}`;
  }
  
  return url;
};

PostSchema.methods.generateShortUrl = function(): string {
  const frontendUrl = process.env.FRONTEND_URL || process.env.frontendUrl || 'https://lawgg.net';
  let url = `${frontendUrl}/l/${this.slug}`;
  
  if (this.spatialInfo && this.spatialInfo.latitude && this.spatialInfo.longitude) {
    const parts = [
      this.spatialInfo.planet || 'Earth',
      this.spatialInfo.latitude.toString(),
      this.spatialInfo.longitude.toString(),
      this.spatialInfo.altitude?.toString() || '',
      this.spatialInfo.timestamp ? this.spatialInfo.timestamp.toISOString().slice(0, 16) : '',
      this.spatialInfo.floor?.toString() || ''
    ];
    
    url += `?${parts.join(',')}`;
  }
  
  return url;
};

PostSchema.methods.generateQrCodeUrl = function(): string {
  // Always generate fresh URL using current slug instead of stored URLs
  return this.generateCustomUrl();
};

// Static methods
PostSchema.statics.parseLocationUrl = function(url: string): ISpatialInfo | null {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    // Check if it's a short URL format
    if (urlObj.pathname.startsWith('/l/')) {
      const queryString = urlObj.search.slice(1);
      if (queryString) {
        const parts = queryString.split(',');
        if (parts.length >= 3) {
          return {
            planet: parts[0] || undefined,
            latitude: parts[1] ? parseFloat(parts[1]) : undefined,
            longitude: parts[2] ? parseFloat(parts[2]) : undefined,
            altitude: parts[3] ? parseFloat(parts[3]) : undefined,
            timestamp: parts[4] ? new Date(parts[4]) : undefined,
            floor: parts[5] ? parseInt(parts[5]) : undefined
          };
        }
      }
    } else {
      // Standard URL format
      const spatialInfo: ISpatialInfo = {};
      
      if (params.has('planet')) spatialInfo.planet = params.get('planet')!;
      if (params.has('lat')) spatialInfo.latitude = parseFloat(params.get('lat')!);
      if (params.has('lng')) spatialInfo.longitude = parseFloat(params.get('lng')!);
      if (params.has('altitude')) spatialInfo.altitude = parseFloat(params.get('altitude')!);
      if (params.has('timestamp')) spatialInfo.timestamp = new Date(params.get('timestamp')!);
      if (params.has('floor')) spatialInfo.floor = parseInt(params.get('floor')!);
      
      if (spatialInfo.latitude && spatialInfo.longitude) {
        return spatialInfo;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

const Post = mongoose.model<IPost, IPostModel>('Post', PostSchema);

export default Post;
