import PaymentService from '../services/PaymentService.js';
import { generateReference } from '../utils/helpers.js';
import AppError from '../utils/AppError.js';
import Order from '../models/Order.js';
import Errand from '../models/Errand.js';
import Payment from '../models/Payment.js';
import crypto from 'crypto';

class PaymentController {
  static getCallbackUrl(type, reference) {
    switch(type) {
      case 'STORE_REGISTRATION':
      case 'STORE_PROMOTION':
      case 'STORE_SUBSCRIPTION':
        return `${process.env.FRONTEND_URL}/business/store/verify/${reference}?type=${type.toLowerCase()}`;
      default:
        return `${process.env.FRONTEND_URL}/payment/verify/${reference}`;
    }
  }

  static async initializePayment(req, res, next) {
    try {
      const { type, orderId, errandId } = req.body;
      
      let record;
      let amount;
      let metadata = {};
      let user;
      
      if (type === 'ORDER') {
        record = await Order.findById(orderId)
          .populate('user', 'email name phone'); // Populate user details
        
        if (!record) throw new AppError('Order not found', 404);
        
        user = record.user;
        
        // Handle different order types
        switch (record.type) { // Changed from record.orderType to record.type
          case 'DELIVERY':
            amount = record.feeBreakdown.total;
            break;
          case 'SHOPPING':
            amount = record.feeBreakdown.total + record.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            break;
          default:
            throw new AppError('Invalid order type', 400);
        }
        
        metadata = {
          orderId,
          orderType: record.type, // Changed from orderType to type
          customerEmail: user.email,
          customerName: user.name,
          phoneNumber: user.phone
        };
      } else if (type === 'ERRAND') {
        record = await Errand.findById(errandId)
          .populate('user', 'email name phone'); // Populate user details
        
        if (!record) throw new AppError('Errand not found', 404);
        
        user = record.user;
        amount = record.pricing.total;
        
        metadata = {
          errandId,
          customerEmail: user.email,
          customerName: user.name,
          phoneNumber: user.phone
        };
      } else {
        throw new AppError('Invalid payment type', 400);
      }

      // Verify payment status
      if (record.paymentStatus === 'PAID') {
        throw new AppError('Payment has already been made', 400);
      }

      if (!user || !user.email) {
        throw new AppError('User information not found', 400);
      }

      const reference = generateReference();
      
      // Create payment record
      const payment = await Payment.create({
        type,
        user: user._id, // Add user reference
        orderId: type === 'ORDER' ? orderId : undefined,
        errandId: type === 'ERRAND' ? errandId : undefined,
        amount,
        transactionReference: reference,
        metadata,
        status: 'PENDING',
        orderType: type === 'ORDER' ? record.type : undefined
      });

      // Initialize payment with Paystack
      const paystackResponse = await PaymentService.initializePayment({
        email: user.email,
        amount: amount, // Convert to kobo for Paystack
        reference,
        metadata: {
          paymentId: payment._id,
          type,
          orderId,
          errandId,
          orderType: metadata.type
        },
        callbackUrl: PaymentController.getCallbackUrl(type, reference)
      });

      return res.status(200).json(paystackResponse);
    } catch (error) {
      next(error);
    }
  }

  static async verifyPayment(req, res, next) {
    try {
      const { reference } = req.params;

      // Verify payment with Paystack
      const verificationResponse = await PaymentService.verifyPayment(reference);

      if (!verificationResponse.status || verificationResponse.data.status !== 'success') {
        throw new AppError('Payment verification failed', 400);
      }

      // Find and update payment record
      const payment = await Payment.findOne({ transactionReference: reference });
      if (!payment) {
        throw new AppError('Payment record not found', 404);
      }

      // Update payment details
      payment.status = 'SUCCESS';
      payment.channel = verificationResponse.data.channel;
      payment.cardType = verificationResponse.data.card_type;
      payment.last4 = verificationResponse.data.last4;
      payment.bank = verificationResponse.data.bank;
      payment.countryCode = verificationResponse.data.country_code;
      payment.brand = verificationResponse.data.brand;
      payment.authorization = verificationResponse.data.authorization;
      payment.paidAt = new Date();

      await payment.save();

      // Update order or errand payment status
      if (payment.type === 'ORDER') {
        await Order.findByIdAndUpdate(payment.orderId, {
          paymentStatus: 'PAID',
          paymentDetails: {
            reference,
            amount: payment.amount,
            channel: payment.channel,
            paidAt: payment.paidAt
          }
        });
      } else if (payment.type === 'ERRAND') {
        await Errand.findByIdAndUpdate(payment.errandId, {
          paymentStatus: 'PAID',
          paymentDetails: {
            reference,
            amount: payment.amount,
            channel: payment.channel,
            paidAt: payment.paidAt
          }
        });
      }

      return res.status(200).json({
        status: 'success',
        message: 'Payment verified successfully',
        data: payment
      });
    } catch (error) {
      next(error);
    }
  }

  static async handlePaymentSuccess(payment) {
    switch (payment.type) {
      case 'ORDER':
        // Update order status
        await OrderService.updateOrderStatus(payment.orderId, 'PAID');
        break;
      case 'ERRAND':
        // Update errand status
        await ErrandService.updateErrandStatus(payment.errandId, 'PAID');
        break;
      case 'STORE_SUBSCRIPTION':
      case 'DELIVERY_SUBSCRIPTION':
        // Activate subscription
        await SubscriptionService.activateSubscription(payment.subscriptionId);
        break;
      default:
        throw new AppError('Invalid payment type', 400);
    }
  }

  static async initiateRefund(req, res, next) {
    try {
      const { paymentId } = req.params;
      const { amount, reason } = req.body;

      const refund = await PaymentService.processRefund(paymentId, amount, reason);

      res.status(200).json({
        status: 'success',
        data: refund
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPaymentHistory(req, res, next) {
    try {
      const { page, limit, type, status, startDate, endDate } = req.query;

      const query = {};

      // Build query based on filters
      if (type) query.type = type;
      if (status) query.status = status;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Add user-specific filters based on role
      if (req.user.role === 'USER') {
        query['metadata.userId'] = req.user._id;
      } else if (req.user.role === 'BUSINESS') {
        query['metadata.businessId'] = req.user.businessId;
      }

      const payments = await PaymentService.getPaymentHistory(query, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      res.status(200).json({
        status: 'success',
        data: payments
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPaymentStats(req, res, next) {
    try {
      const stats = await PaymentService.getPaymentStats(req.query);
      
      res.status(200).json({
        status: 'success',
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  static async handlePaystackWebhook(req, res) {
    try {
      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== req.headers['x-paystack-signature']) {
        throw new AppError('Invalid signature', 400);
      }

      const event = req.body;

      if (event.event === 'charge.success') {
        const { reference } = event.data;
        
        // Find and update payment record
        const payment = await Payment.findOne({ transactionReference: reference });
        if (!payment) throw new AppError('Payment not found', 404);

        // Update payment status
        payment.status = 'SUCCESS';
        payment.paidAt = new Date();
        payment.paymentDetails = {
          channel: event.data.channel,
          cardType: event.data.card_type,
          last4: event.data.last4,
          bank: event.data.bank,
          countryCode: event.data.country_code,
          brand: event.data.brand,
          authorization: event.data.authorization
        };
        await payment.save();

        // Update order/errand status
        await PaymentService.handlePaymentSuccess(payment);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook Error:', error);
      res.sendStatus(500);
    }
  }
}

export default PaymentController;







