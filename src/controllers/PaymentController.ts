import { Request, Response } from 'express';
import * as PaymentService from '../services/PaymentService';

export const createPayment = async (req: Request, res: Response) => {
  try {
    const payment = await PaymentService.createPayment(req.body);
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create payment', details: error });
  }
};

export const getAllPayments = async (req: Request, res: Response) => {
  try {
    const { status, user, txn_id } = req.query;
    const filters: any = {};
    if (status) filters.status = status;
    if (user) filters.user = { $regex: user, $options: 'i' };
    if (txn_id) filters.txn_id = { $regex: txn_id, $options: 'i' };

    const payments = await PaymentService.getAllPayments(filters);
    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments', details: error });
  }
};

export const getPaymentById = async (req: Request, res: Response) => {
  try {
    const payment = await PaymentService.getPaymentById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment', details: error });
  }
};

export const updatePayment = async (req: Request, res: Response) => {
  try {
    const payment = await PaymentService.updatePayment(req.params.id, req.body);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment', details: error });
  }
};

export const deletePayment = async (req: Request, res: Response) => {
  try {
    const payment = await PaymentService.deletePayment(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.status(200).json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete payment', details: error });
  }
};

export const insertDummyPayments = async (_req: Request, res: Response) => {
  try {
    const result = await PaymentService.insertDummyPayments();
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to insert dummy data', details: error });
  }
};
