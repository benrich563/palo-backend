import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import { 
  calculateSalesMetrics, 
  calculateCustomerMetrics, 
  calculateProductMetrics 
} from '../utils/analyticsHelpers.js';
import Store from '../models/Store.js';

export const businessOrderController = {
  // Order Processing
  async processOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { action, notes } = req.body;
      
      const order = await Order.findOne({ 
        _id: orderId, 
        business: req.user.businessId 
      });
      
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      switch (action) {
        case 'confirm':
          order.processingStatus = 'PROCESSING';
          break;
        case 'ready':
          order.processingStatus = 'READY_FOR_PICKUP';
          break;
        case 'complete':
          order.processingStatus = 'COMPLETED';
          break;
        case 'cancel':
          order.processingStatus = 'CANCELLED';
          break;
        default:
          return res.status(400).json({ message: 'Invalid action' });
      }
      
      order.businessNotes = notes;
      await order.save();
      
      // Notify customer through socket.io
      req.app.get('io').emit(`order_${orderId}`, {
        type: 'STATUS_UPDATE',
        status: order.processingStatus
      });
      
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Order History
  async getOrderHistory(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        status, 
        startDate, 
        endDate,
        sortBy = 'createdAt',
        order = 'desc'
      } = req.query;

      const query = { 
        business: req.user._id,  // Changed from businessId to _id
        ...(status && { status }),
        ...(startDate && endDate && {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        })
      };

      const orders = await Order.find(query)
        .sort({ [sortBy]: order })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('rider', 'name phone')
        // Remove the user population since it's not in the schema
        .populate('business', 'name email phone');

      const total = await Order.countDocuments(query);

      res.json({
        orders,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        totalOrders: total
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Payment History
  async getPaymentHistory(req, res) {
    try {
      const { 
        startDate, 
        endDate,
        page = 1,
        limit = 10,
        status 
      } = req.query;

      const query = {
        ...(status && { status }),
        ...(startDate && endDate && {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        })
      };

      const payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate({
          path: 'orderId',
          select: 'status type timestamps total'
        })
        .populate({
          path: 'errandId',
          select: 'status timestamps total'
        })
        .lean();

      const total = await Payment.countDocuments(query);

      res.json({
        payments,
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        totalPayments: total
      });
    } catch (error) {
      console.error('Payment history error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Refund Processing
  async processRefund(req, res) {
    try {
      const { orderId } = req.params;
      const { reason, amount } = req.body;

      const order = await Order.findOne({ 
        _id: orderId, 
        business: req.user.businessId 
      });

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Initialize refund with Paystack
      const refund = await initializeRefund(order.paymentReference, amount);

      order.refundStatus = 'PROCESSING';
      order.refundReason = reason;
      order.refundAmount = amount;
      await order.save();

      res.json({ message: 'Refund initiated', refund });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Business Analytics
  async getAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const businessId = req.user.businessId;

      // Sales Reports
      const salesMetrics = await calculateSalesMetrics(
        businessId, 
        startDate, 
        endDate
      );

      // Customer Insights
      const customerMetrics = await calculateCustomerMetrics(
        businessId, 
        startDate, 
        endDate
      );

      // Product Performance
      const productMetrics = await calculateProductMetrics(
        businessId, 
        startDate, 
        endDate
      );

      res.json({
        salesMetrics,
        customerMetrics,
        productMetrics
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  async getDetailedAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const businessId = req.user.businessId;

      // Check if business has premium access
      const business = await Business.findById(businessId);
      if (!business.isPromoted || business.promotionPlan !== 'PREMIUM') {
        return res.status(403).json({ 
          message: 'Detailed analytics are only available for premium subscribers' 
        });
      }

      // Delivery Metrics
      const deliveryMetrics = await Order.aggregate([
        {
          $match: {
            business: businessId,
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] }
            },
            averageDeliveryTime: { $avg: "$deliveryTime" }
          }
        }
      ]);

      // Peak Hours Analysis
      const peakHours = await Order.aggregate([
        {
          $match: {
            business: businessId,
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
          }
        },
        {
          $group: {
            _id: {
              hour: { $hour: "$createdAt" },
              dayOfWeek: { $dayOfWeek: "$createdAt" }
            },
            count: { $sum: 1 },
            revenue: { $sum: "$total" }
          }
        },
        { $sort: { count: -1 } }
      ]);

      res.json({
        deliveryMetrics,
        peakHours
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
};


