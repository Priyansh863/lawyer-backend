import mongoose from 'mongoose';

enum EPolicyStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

const PolicySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    last_updated: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: Object.values(EPolicyStatus), required: true },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

const Policy = mongoose.model('Policy', PolicySchema);

export { Policy, PolicySchema };
