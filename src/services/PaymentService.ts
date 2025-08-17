import { Payment } from "../models/payment";

export const createPayment = async (data: any) => {
  return await Payment.create(data);
};

export const getAllPayments = async (filters: any = {}) => {
  return await Payment.find(filters);
};

export const getPaymentById = async (id: string) => {
  return await Payment.findById(id);
};

export const updatePayment = async (id: string, data: any) => {
  return await Payment.findByIdAndUpdate(id, data, { new: true });
};

export const deletePayment = async (id: string) => {
  return await Payment.findByIdAndDelete(id);
};

export const insertDummyPayments = async () => {
  const dummyData = [
    {
      txn_id: 'L001',
      user: 'Mathilda Bell',
      role: 'Lawyer',
      type: 'Purchase',
      amount: 500,
      date: new Date('2022-12-10T09:32:00'),
      status: 'Success',
      payment_method: 'Razorpay',
    },
    {
      txn_id: 'L001',
      user: 'Mathilda Bell',
      role: 'Lawyer',
      type: 'Subscription',
      amount: 500,
      date: new Date('2022-12-10T09:32:00'),
      status: 'Success',
      payment_method: 'Razorpay',
    },
    {
      txn_id: 'L001',
      user: 'Mathilda Bell',
      role: 'Client',
      type: 'Subscription',
      amount: 500,
      date: new Date('2022-12-10T09:32:00'),
      status: 'Success',
      payment_method: 'Razorpay',
    },
    {
      txn_id: 'L001',
      user: 'Mathilda Bell',
      role: 'Client',
      type: 'Purchase',
      amount: 500,
      date: new Date('2022-12-10T09:32:00'),
      status: 'Success',
      payment_method: 'Razorpay',
    },
  ];
  return await Payment.insertMany(dummyData);
};
