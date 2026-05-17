import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const createContentValidation = [
  body('author').exists().withMessage('Author is required.'),
  body('type').exists().withMessage('Type is required.'),
  body('title').exists().withMessage('Title is required.'),
  body('status').optional(),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Input validation Error', errorData: errors.mapped() });
    }
    next();
  },
];

export const updateContentValidation = [
  body('author').optional(),
  body('type').optional(),
  body('title').optional(),
  body('status').optional(),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Input validation Error', errorData: errors.mapped() });
    }
    next();
  },
];

export const createPaymentValidation = [
  body('txn_id').exists().withMessage('Transaction ID is required.'),
  body('user').exists().withMessage('User is required.'),
  body('role').exists().withMessage('Role is required.'),
  body('type').exists().withMessage('Type is required.'),
  body('amount').exists().isNumeric().withMessage('Amount is required and must be a number.'),
  body('date').optional().isISO8601().withMessage('Date must be a valid ISO8601 date.'),
  body('status').exists().withMessage('Status is required.'),
  body('payment_method').exists().withMessage('Payment method is required.'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Input validation Error', errorData: errors.mapped() });
    }
    next();
  },
];

export const updatePaymentValidation = [
  body('txn_id').optional(),
  body('user').optional(),
  body('role').optional(),
  body('type').optional(),
  body('amount').optional().isNumeric().withMessage('Amount must be a number.'),
  body('date').optional().isISO8601().withMessage('Date must be a valid ISO8601 date.'),
  body('status').optional(),
  body('payment_method').optional(),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Input validation Error', errorData: errors.mapped() });
    }
    next();
  },
];

export const createPolicyValidation = [
  body('title').exists().withMessage('Title is required.'),
  body('slug').exists().withMessage('Slug is required.'),
  body('content').exists().withMessage('Content is required.'),
  body('meta_description').optional(),
  body('status').exists().isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive.'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Input validation Error', errorData: errors.mapped() });
    }
    next();
  },
];

export const updatePolicyValidation = [
  body('title').optional(),
  body('slug').optional(),
  body('content').optional(),
  body('meta_description').optional(),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive.'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Input validation Error', errorData: errors.mapped() });
    }
    next();
  },
];
