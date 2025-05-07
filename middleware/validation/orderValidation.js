import { body } from 'express-validator';

export const validateOrderCreation = [
  // ... existing validations ...
  
  body('type')
    .optional()
    .isIn(['DELIVERY', 'ERRAND', 'SHOPPING'])
    .withMessage('Invalid order type'),

  body('item')
    .isObject()
    .withMessage('Item details are required'),

  body('pickupLocation')
    .isObject()
    .withMessage('Pickup location is required'),

  body('deliveryLocation')
    .isObject()
    .withMessage('Delivery location is required'),

  // ... other validations ...
];