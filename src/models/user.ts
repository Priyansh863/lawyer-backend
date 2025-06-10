import mongoose from 'mongoose';

import { IUserSchema } from '../Interfaces/schemaInterfaces';

enum EAccountType {
  user = 'user',
  Admin = 'admin',
  lawyer = 'lawyer',
  client = 'client',
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
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);



UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', { virtuals: true });

const User = mongoose.model<IUserSchema>('user', UserSchema);

export { User, UserSchema };
