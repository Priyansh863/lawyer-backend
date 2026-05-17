import mongoose from 'mongoose';

enum EPolicyStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

const PolicySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    meta_description: { type: String },
    status: { type: String, enum: Object.values(EPolicyStatus), required: true, default: 'Active' },
    last_updated: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Pre-save middleware to update last_updated
PolicySchema.pre('save', function(next) {
  this.last_updated = new Date();
  next();
});

PolicySchema.pre('findOneAndUpdate', function(next) {
  this.set({ last_updated: new Date() });
  next();
});

const Policy = mongoose.model('Policy', PolicySchema);

export { Policy, PolicySchema, EPolicyStatus };
