import express from 'express';
import * as PaymentController from '../controllers/PaymentController';
import { createPaymentValidation, updatePaymentValidation } from '../validationSchema/additionalValidations';

const router = express.Router();

router.post('/', createPaymentValidation, PaymentController.createPayment);
router.get('/', PaymentController.getAllPayments);
router.get('/:id', PaymentController.getPaymentById);
router.put('/:id', updatePaymentValidation, PaymentController.updatePayment);
router.delete('/:id', PaymentController.deletePayment);
router.post('/dummy', PaymentController.insertDummyPayments);

export default router;
