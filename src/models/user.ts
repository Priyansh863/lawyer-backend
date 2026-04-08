import mongoose from 'mongoose';

import { IUserSchema } from '../Interfaces/schemaInterfaces';

enum EAccountType {
  user = 'user',
  Admin = 'admin',
  lawyer = 'lawyer',
  client = 'client',
  ai_reporter = 'ai_reporter',
}

const UserSchema = new mongoose.Schema(
  {
    account_type: {
      type: String,
      enum: Object.values(EAccountType),
      required: true,
    },
    first_name: {
      type: String,
      required: false,
    },
    about: {
      type: String,
      required: false,
    },
    last_name: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      required: true,
    },
    password: {
      type: String,
    },
    profile_image: {
      type: String,
      required: false,
    },
    pratice_area: {
      type: String,
      required: false,
    },
    experience: {
      type: String,
      required: false,
    },
    phone: {
      type: String,
      required: false,
    },
    // Address fields for settings/profile
    address_line1: {
      type: String,
      required: false,
    },
    address_line2: {
      type: String,
      required: false,
    },
    city: {
      type: String,
      required: false,
    },
    state: {
      type: String,
      required: false,
    },
    postal_code: {
      type: String,
      required: false,
    },
    country: {
      type: String,
      required: false,
    },
    is_active: {
      type: Number,
      required: true,
      default: 1,
    },
    is_verified: {
      type: Number,
      required: true,
      default: 0,
    },
    is_profile_completed: {
      type: Number,
      required: true,
      default: 0,
    },
    fcm_token: {
      type: String,
    },
    otp: {
      type: String,
      select: false
    },
    otp_expires: {
      type: Date,
      select: false
    },
    verification_token: {
      type: String,
      select: false
    },
    token_expires: {
      type: Date,
      select: false
    },
    notes: {
      type: String,
      required: false,
      default: ''
    },
    charges: {
      type: Number,
      required: false,
      default: 0,
      min: 0
    },
    chat_rate: {
      type: Number,
      required: false,
      default: 0,
      min: 0
    },
    video_rate: {
      type: Number,
      required: false,
      default: 0,
      min: 0
    },
    pcId: {
      type: String,
      required: false,
      default: null
    },
    pcLicenseStatus: {
      type: String,
      enum: ['ACTIVE', 'RESET', null],
      required: false,
      default: null
    },
    blocked_users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);


// name virtual to return the concatenated first and last name
UserSchema.virtual('name').get(function() {
  return `${this.first_name || ''} ${this.last_name || ''}`.trim();
});

UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', { virtuals: true });

const User = mongoose.model<IUserSchema>('User', UserSchema);

export { User, UserSchema };
