import mongoose, { Schema, Document } from "mongoose";

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
    slug: string;
    spatialInfo?: ISpatialInfo;
    citations: ICitation[];
    hashtag?: string;
    customUrl?: string;
    shortUrl?: string;
    qrCodeUrl?: string;
    
    // Instance methods
    generateCustomUrl(): string;
    generateShortUrl(): string;
    generateQrCodeUrl(): string;
}

export interface IBlogModel extends mongoose.Model<IBlog> {
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
    validate: {
      validator: function(v: number) {
        if (v === null || v === undefined) return true;
        // Validate 5-7 decimal places
        const decimalPlaces = (v.toString().split('.')[1] || '').length;
        return decimalPlaces >= 5 && decimalPlaces <= 7;
      },
      message: 'Latitude must have 5-7 decimal places'
    }
  },
  longitude: {
    type: Number,
    min: -180,
    max: 180,
    validate: {
      validator: function(v: number) {
        if (v === null || v === undefined) return true;
        // Validate 5-7 decimal places
        const decimalPlaces = (v.toString().split('.')[1] || '').length;
        return decimalPlaces >= 5 && decimalPlaces <= 7;
      },
      message: 'Longitude must have 5-7 decimal places'
    }
  },
  altitude: {
    type: Number,
    min: -500,
    max: 9000,
    validate: {
      validator: function(v: number) {
        if (v === null || v === undefined) return true;
        return Number.isFinite(v) && v >= -500 && v <= 9000;
      },
      message: 'Altitude must be a valid number between -500 and 9000 meters'
    }
  },
  timestamp: {
    type: Date,
    validate: {
      validator: function(v: Date) {
        if (v === null || v === undefined) return true;
        return v instanceof Date && !isNaN(v.getTime());
      },
      message: 'Timestamp must be a valid ISO 8601 date'
    }
  },
  floor: {
    type: Number,
    validate: {
      validator: function(v: number) {
        if (v === null || v === undefined) return true;
        return Number.isInteger(v);
      },
      message: 'Floor must be an integer (use negative numbers for basement floors)'
    }
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
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  url: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid URL format'
    }
  }
}, { _id: false });

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
        enum: ["legal-advice", "case-studies", "law-updates", "firm-news"],
        required: true,
    },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', required: true },
    slug: {
      type: String,
      required: false,
      unique: true,
      validate: {
        validator: function(v: string) {
          return /^[a-z0-9-]+$/.test(v);
        },
        message: 'Slug can only contain lowercase letters, numbers, and hyphens'
      }
    },
    spatialInfo: SpatialInfoSchema,
    citations: [CitationSchema],
    hashtag: {
      type: String,
      maxlength: 50,
      validate: {
        validator: function(v: string) {
          if (!v) return true;
          return /^#[a-zA-Z0-9_]+$/.test(v);
        },
        message: 'Hashtag must start with # and contain only letters, numbers, and underscores'
      }
    },
    customUrl: { type: String },
    shortUrl: { type: String },
    qrCodeUrl: { type: String }
});

// Instance methods
BlogSchema.methods.generateCustomUrl = function(): string {
  const baseUrl = process.env.FRONTEND_URL || 'https://lawgg.net';
  const spatial = this.spatialInfo;
  
  if (!spatial || (!spatial.latitude && !spatial.longitude)) {
    return `${baseUrl}/blog/${this.slug}`;
  }
  
  const params = new URLSearchParams();
  if (spatial.planet) params.append('planet', spatial.planet);
  if (spatial.latitude) params.append('lat', spatial.latitude.toString());
  if (spatial.longitude) params.append('lng', spatial.longitude.toString());
  if (spatial.altitude) params.append('altitude', spatial.altitude.toString());
  if (spatial.timestamp) params.append('timestamp', spatial.timestamp.toISOString().slice(0, 16));
  if (spatial.floor) params.append('floor', spatial.floor.toString());
  
  return `${baseUrl}/blog/${this.slug}?${params.toString()}`;
};

BlogSchema.methods.generateShortUrl = function(): string {
  const baseUrl = process.env.FRONTEND_URL || 'https://lawgg.net';
  const spatial = this.spatialInfo;
  
  if (!spatial || (!spatial.latitude && !spatial.longitude)) {
    return `${baseUrl}/l/blog/${this.slug}`;
  }
  
  const parts = [
    spatial.planet || '',
    spatial.latitude || '',
    spatial.longitude || '',
    spatial.altitude || '',
    spatial.timestamp ? spatial.timestamp.toISOString().slice(0, 16) : '',
    spatial.floor || ''
  ];
  
  return `${baseUrl}/l/blog/${this.slug}?${parts.join(',')}`;
};

BlogSchema.methods.generateQrCodeUrl = function(): string {
  return this.generateCustomUrl();
};

// Static methods
BlogSchema.statics.parseLocationUrl = function(url: string): ISpatialInfo | null {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    // Check if it's a short URL format
    if (urlObj.pathname.startsWith('/l/')) {
      const queryString = urlObj.search.slice(1);
      if (queryString && !queryString.includes('=')) {
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
    }
    
    // Parse full URL format
    const spatialInfo: ISpatialInfo = {};
    if (params.get('planet')) spatialInfo.planet = params.get('planet')!;
    if (params.get('lat')) spatialInfo.latitude = parseFloat(params.get('lat')!);
    if (params.get('lng')) spatialInfo.longitude = parseFloat(params.get('lng')!);
    if (params.get('altitude')) spatialInfo.altitude = parseFloat(params.get('altitude')!);
    if (params.get('timestamp')) spatialInfo.timestamp = new Date(params.get('timestamp')!);
    if (params.get('floor')) spatialInfo.floor = parseInt(params.get('floor')!);
    
    return Object.keys(spatialInfo).length > 0 ? spatialInfo : null;
  } catch (error) {
    return null;
  }
};

const Blog = mongoose.model<IBlog, IBlogModel>("Blog", BlogSchema);

export default Blog;
