import mongoose, { Schema, Document } from 'mongoose';

export enum ETransactionType {
  purchase = 'purchase',
  usage = 'usage',
  refund = 'refund',
  bonus = 'bonus'
}

export enum ETransactionStatus {
  pending = 'pending',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled'
}

export enum EUsageCategory {
  document_processing = 'Document Processing',
  ai_chat = 'AI Chat',
  ai_generation = 'AI Generation',
  content_creation = 'Content Creation',
  voice_summary = 'Voice Summary',
  other = 'Other'
}

// Token Transaction Schema
export interface ITokenTransaction extends Document {
  user_id: mongoose.Types.ObjectId;
  type: ETransactionType;
  amount: number; // positive for purchases/bonuses, negative for usage
  description: string;
  category: string;
  status: ETransactionStatus;
  stripe_payment_intent_id?: string;
  stripe_session_id?: string;
  package_id?: string;
  package_name?: string;
  reference_id?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

const TokenTransactionSchema = new Schema<ITokenTransaction>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(ETransactionType),
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(ETransactionStatus),
      required: true,
      default: ETransactionStatus.pending,
      index: true
    },
    stripe_payment_intent_id: {
      type: String,
      sparse: true,
      index: true
    },
    stripe_session_id: {
      type: String,
      sparse: true,
      index: true
    },
    package_id: {
      type: String,
      sparse: true
    },
    package_name: {
      type: String,
      sparse: true
    },
    reference_id: {
      type: String,
      sparse: true,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

// Compound indexes for better query performance
TokenTransactionSchema.index({ user_id: 1, created_at: -1 });
TokenTransactionSchema.index({ user_id: 1, type: 1, created_at: -1 });
TokenTransactionSchema.index({ stripe_payment_intent_id: 1 }, { sparse: true });

// User Token Balance Schema (for caching current balance)
export interface IUserTokenBalance extends Document {
  user_id: mongoose.Types.ObjectId;
  current_balance: number;
  total_purchased: number;
  total_used: number;
  monthly_usage: number;
  last_monthly_reset: Date;
  created_at: Date;
  updated_at: Date;
}

const UserTokenBalanceSchema = new Schema<IUserTokenBalance>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    current_balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    total_purchased: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    total_used: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    monthly_usage: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    last_monthly_reset: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

// Static methods for token operations
UserTokenBalanceSchema.statics.addTokens = async function(userId: string, amount: number, transactionId?: string) {
  return await this.findOneAndUpdate(
    { user_id: userId },
    { 
      $inc: { 
        current_balance: amount,
        total_purchased: amount > 0 ? amount : 0
      }
    },
    { 
      upsert: true, 
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

UserTokenBalanceSchema.statics.useTokens = async function(userId: string, amount: number) {
  const result = await this.findOneAndUpdate(
    { 
      user_id: userId,
      current_balance: { $gte: amount }
    },
    { 
      $inc: { 
        current_balance: -amount,
        total_used: amount,
        monthly_usage: amount
      }
    },
    { new: true }
  );
  
  if (!result) {
    throw new Error('Insufficient token balance');
  }
  
  return result;
};

UserTokenBalanceSchema.statics.resetMonthlyUsage = async function(userId: string) {
  return await this.findOneAndUpdate(
    { user_id: userId },
    { 
      monthly_usage: 0,
      last_monthly_reset: new Date()
    },
    { new: true }
  );
};

const TokenTransaction = mongoose.model<ITokenTransaction>('TokenTransaction', TokenTransactionSchema);
const UserTokenBalance = mongoose.model<IUserTokenBalance>('UserTokenBalance', UserTokenBalanceSchema);

export { TokenTransaction, UserTokenBalance };
