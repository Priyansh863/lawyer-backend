import mongoose from 'mongoose';

enum EUserRole {
  Lawyer = 'Lawyer',
  Client = 'Client',
}

enum EPaymentType {
  Purchase = 'Purchase',
  Subscription = 'Subscription',
}

enum EPaymentStatus {
  Success = 'Success',
  Failed = 'Failed',
  Pending = 'Pending',
}

enum EPaymentMethod {
  Razorpay = 'Razorpay',
  Stripe = 'Stripe',
  Paypal = 'Paypal',
}

const PaymentSchema = new mongoose.Schema(
  {
    txn_id: { type: String, required: true },
    user: { type: String, required: true },
    role: { type: String, enum: Object.values(EUserRole), required: true },
    type: { type: String, enum: Object.values(EPaymentType), required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: Object.values(EPaymentStatus), required: true },
    payment_method: { type: String, enum: Object.values(EPaymentMethod), required: true },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

const Payment = mongoose.model('Payment', PaymentSchema);

export { Payment, PaymentSchema };
