import { body, param, query } from 'express-validator';
import { validateRequest } from '../utils/validators.js';

export const validatePaymentInit = [
  body('type')
    .isIn(['ORDER', 'ERRAND', 'DELIVERY_SUBSCRIPTION', 'STORE_SUBSCRIPTION'])
    .withMessage('Invalid payment type'),
  body('orderId')
    .if(body('type').equals('ORDER'))
    .isMongoId()
    .withMessage('Invalid order ID'),
  body('errandId')
    .if(body('type').equals('ERRAND'))
    .isMongoId()
    .withMessage('Invalid errand ID'),
  validateRequest
];

export const validatePaymentVerification = [
  param('reference')
    .notEmpty()
    .withMessage('Payment reference is required'),
  validateRequest
];

export const validateRefund = [
  param('paymentId')
    .isMongoId()
    .withMessage('Invalid payment ID'),
  body('amount')
    .isFloat({ min: 0.1 })
    .withMessage('Refund amount must be greater than 0'),
  body('reason')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Refund reason is required'),
  validateRequest
];

export const validatePaymentHistory = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(['ORDER', 'ERRAND', 'DELIVERY_SUBSCRIPTION', 'STORE_SUBSCRIPTION'])
    .withMessage('Invalid payment type'),
  query('status')
    .optional()
    .isIn(['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
    .withMessage('Invalid payment status'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  validateRequest
];

