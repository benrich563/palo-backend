import express from 'express';
import Order from '../models/Order.js';
import { adminAuth } from '../middleware/auth.js';
import Rider from '../models/Rider.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { calculateDistance } from '../utils/locationUtils.js';
import Errand from '../models/Errand.js';

const router = express.Router();

// Get all orders with pagination and filters
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      type,
      sortBy = 'timestamps.created', 
      order = 'desc' 
    } = req.query;

    // Base query for both order types
    const baseQuery = {};
    
    // Add status filter if provided
    if (status) {
      baseQuery.status = status;
    }

    // Add search filter if provided
    if (search) {
      baseQuery.$or = [
        { '_id': { $regex: search, $options: 'i' } },
        { 'pickupLocation.address': { $regex: search, $options: 'i' } },
        { 'deliveryLocation.address': { $regex: search, $options: 'i' } }
      ];
    }

    // Get delivery orders
    const deliveryOrders = await Order.find(baseQuery)
      .populate('rider')
      .populate({
        path: 'rider',
        populate: {
          path: 'user',
          select: 'name email phone'
        }
      })
      .lean();

    // Get errand orders with the same filters
    const errandQuery = {
      ...baseQuery,
      ...(search && {
        $or: [
          { service: { $regex: search, $options: 'i' } },
          { 'deliveryLocation.address': { $regex: search, $options: 'i' } },
          { orderId: { $regex: search, $options: 'i' } }
        ]
      })
    };

    const errandOrders = await Errand.find(errandQuery)
      .populate('rider')
      .populate({
        path: 'rider',
        populate: {
          path: 'user',
          select: 'name email phone'
        }
      })
      .lean();

    // Combine and mark orders with type
    let combinedOrders = [
      ...deliveryOrders.map(order => ({
        ...order,
        type: 'DELIVERY'
      })),
      ...errandOrders.map(order => ({
        ...order,
        type: 'ERRAND'
      }))
    ];

    // Sort combined orders
    combinedOrders.sort((a, b) => {
      const dateA = new Date(a.timestamps.created);
      const dateB = new Date(b.timestamps.created);
      return order === 'desc' ? dateB - dateA : dateA - dateB;
    });

    // Apply type filter if provided
    if (type) {
      combinedOrders = combinedOrders.filter(order => order.type === type);
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = combinedOrders.slice(startIndex, endIndex);

    // Calculate total for pagination
    const total = combinedOrders.length;

    res.json({
      orders: paginatedOrders,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalOrders: total
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get order details - update to handle both types
router.get('/orders/:id', adminAuth, async (req, res) => {
  try {
    // Try to find delivery order first
    let order = await Order.findById(req.params.id)
      .populate({
        path: 'rider',
        select: 'status location vehicle',
        populate: {
          path: 'user',
          select: 'name email phone'
        }
      });

    // If not found, try to find errand
    if (!order) {
      order = await Errand.findById(req.params.id)
        .populate({
          path: 'rider',
          select: 'status location vehicle',
          populate: {
            path: 'user',
            select: 'name email phone'
          }
        });
    }

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Format rider information if exists
    const formattedOrder = {
      ...order.toObject(),
      type: order.constructor.modelName === 'Order' ? 'DELIVERY' : 'ERRAND',
      rider: order.rider ? {
        _id: order.rider._id,
        name: order.rider.user.name,
        email: order.rider.user.email,
        phone: order.rider.user.phone,
        status: order.rider.status,
        location: order.rider.location,
        vehicle: order.rider.vehicle
      } : null
    };

    res.json(formattedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update order
router.patch('/orders/:id', adminAuth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    ).populate('rider')
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Add this route to handle rider assignment
router.post('/orders/:id/assign-rider', adminAuth, async (req, res) => {
  try {
    const { riderId } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ message: 'Can only assign riders to pending orders' });
    }

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    if (rider.status !== 'ONLINE') {
      return res.status(400).json({ message: 'Rider is not available' });
    }

    order.rider = riderId;
    order.status = 'ASSIGNED';
    order.timestamps.assigned = new Date();
    await order.save();

    // Notify through socket.io
    const io = req.app.get('io');
    io.emit('orderStatusUpdated', { 
      orderId: order._id, 
      status: 'ASSIGNED',
      riderId 
    });

    res.json(order);
  } catch (error) {
       res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get riders with optional status and pickup location filtering
router.get('/riders/nearby', adminAuth, async (req, res) => {
  try {
    const { status, orderId } = req.query;
    
    if (!orderId) {
      return res.status(400).json({ 
        message: 'Order ID is required' 
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ 
        message: 'Order not found' 
      });
    }

    let query = {};
    if (status) {
      query.status = status;
    }

    // First try to find nearby riders (within 50km)
    query.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: order.pickupLocation.coordinates
        },
        $maxDistance: 50000 // 50km in meters
      }
    };

    let riders = await Rider.find(query)
      .populate('user', 'name phone') // Populate name and phone from User model
      .select('status location user')
      .lean();

    // If no nearby riders found, fetch all available riders
    if (riders.length === 0) {
      delete query.location; // Remove location constraint
      riders = await Rider.find(query)
        .populate('user', 'name phone')
        .select('status location user')
        .lean();
    }

    // Calculate distance for all riders and restructure the data
    const ridersWithDistance = riders.map(rider => {
      const distance = rider.location ? 
        calculateDistance(
          rider.location.coordinates,
          order.pickupLocation.coordinates
        ) : 999;

      return {
        _id: rider._id,
        name: rider.user?.name,
        phone: rider.user?.phone,
        status: rider.status,
        location: rider.location,
        distance: Number(distance.toFixed(1)),
        isNearby: distance <= 50,
        availability: getAvailabilityStatus(distance, rider.status)
      };
    });

    // Sort by distance
    ridersWithDistance.sort((a, b) => a.distance - b.distance);

    return res.json({ riders: ridersWithDistance });
  } catch (error) {
    console.error('Error in /riders/nearby:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

function getAvailabilityStatus(distance, riderStatus) {
  if (riderStatus !== 'ONLINE') {
    return 'OFFLINE';
  }
  if (distance > 50) {
    return 'FAR';
  }
  return 'AVAILABLE';
}

// Get rider details with daily revenue
router.get('/riders/:id', adminAuth, async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.id).populate("user", "name email phone");
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Get recent deliveries
    const recentDeliveries = await Order.find({ 
      rider: rider._id,
      status: 'DELIVERED'
    })
    .sort({ 'timestamps.delivered': -1 })
    .limit(10);

    // Calculate daily revenue for the past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyRevenue = await Order.aggregate([
      {
        $match: {
          rider: rider._id,
          status: 'DELIVERED',
          'timestamps.delivered': { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: "$timestamps.delivered" 
            }
          },
          revenue: { $sum: "$feeBreakdown.riderFee" },
          deliveries: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Calculate earnings summaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const earnings = {
      today: await calculateEarnings(rider._id, today),
      thisWeek: await calculateEarnings(rider._id, weekAgo),
      thisMonth: await calculateEarnings(rider._id, monthAgo)
    };

    res.json({
      ...rider.toObject(),
      recentDeliveries,
      dailyRevenue,
      earnings
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get all riders with search and pagination
router.get('/riders', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status } = req.query;
    
    // Build base query for users with rider role
    let query = {
      role: 'rider'
    };

    // Add search filter if provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Find users and populate their rider data
    const users = await User.find(query)
      .populate({
        path: 'rider',
        select: 'status location ratings totalDeliveries verified documents',
        match: status ? { status } : {} // Apply status filter on rider documents
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('name email phone createdAt');

    // Filter out users whose rider documents didn't match the status filter
    const riders = users
      .filter(user => user.rider) // Only include users that have matching rider documents
      .map(user => ({
        _id: user.rider._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.rider.status,
        totalDeliveries: user.rider.totalDeliveries || 0,
        rating: user.rider.ratings?.length ? 
          user.rider.ratings.reduce((acc, curr) => acc + curr.rating, 0) / user.rider.ratings.length 
          : 0,
        verified: user.rider.verified,
        createdAt: user.createdAt
      }));

    // Get total count for pagination
    const total = await User.countDocuments(query);

    res.json({
      riders,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalRiders: total
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get dashboard stats
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const { timeframe = 'week' } = req.query;
    
    // Calculate date range based on timeframe
    const now = new Date();
    const startDate = new Date();
    switch(timeframe) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get basic stats
    const totalOrders = await Order.countDocuments();
    const activeOrders = await Order.countDocuments({ 
      status: { $in: ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } 
    });
    const totalRiders = await Rider.countDocuments();
    const onlineRiders = await Rider.countDocuments({ status: 'ONLINE' });
    
    // Get recent orders with more details
    const recentOrders = await Order.find()
      .sort({ 'timestamps.created': -1 })
      .limit(10)
      .populate('item', 'name')
      .select('_id status timestamps.created item amount');

    // Calculate total earnings
    const totalEarnings = await Order.aggregate([
      { $match: { status: 'DELIVERED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Calculate trends
    const ordersTrend = await Order.aggregate([
      {
        $match: {
          'timestamps.created': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { 
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: "$timestamps.created" 
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const earningsTrend = await Order.aggregate([
      {
        $match: {
          'timestamps.created': { $gte: startDate },
          status: 'DELIVERED'
        }
      },
      {
        $group: {
          _id: { 
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: "$timestamps.created" 
            }
          },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate growth percentages
    const previousStartDate = new Date(startDate);
    switch(timeframe) {
      case 'week':
        previousStartDate.setDate(previousStartDate.getDate() - 7);
        break;
      case 'month':
        previousStartDate.setMonth(previousStartDate.getMonth() - 1);
        break;
      case 'year':
        previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
        break;
    }

    const [currentPeriodOrders, previousPeriodOrders] = await Promise.all([
      Order.countDocuments({ 'timestamps.created': { $gte: startDate } }),
      Order.countDocuments({ 
        'timestamps.created': { 
          $gte: previousStartDate,
          $lt: startDate 
        } 
      })
    ]);

    const [currentPeriodEarnings, previousPeriodEarnings] = await Promise.all([
      Order.aggregate([
        { 
          $match: { 
            'timestamps.created': { $gte: startDate },
            status: 'DELIVERED'
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Order.aggregate([
        { 
          $match: { 
            'timestamps.created': { 
              $gte: previousStartDate,
              $lt: startDate 
            },
            status: 'DELIVERED'
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const orderGrowth = previousPeriodOrders === 0 ? 100 : 
      ((currentPeriodOrders - previousPeriodOrders) / previousPeriodOrders) * 100;

    const previousEarnings = previousPeriodEarnings[0]?.total || 0;
    const currentEarnings = currentPeriodEarnings[0]?.total || 0;
    const earningsGrowth = previousEarnings === 0 ? 100 :
      ((currentEarnings - previousEarnings) / previousEarnings) * 100;

    res.json({
      totalOrders,
      activeOrders,
      totalRiders,
      onlineRiders,
      recentOrders,
      totalEarnings: totalEarnings[0]?.total || 0,
      ordersTrend,
      earningsTrend,
      orderGrowth,
      earningsGrowth
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all payments with pagination, date filtering, and search
router.get('/payments', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      start, 
      end,
      status,
      search
    } = req.query;

    let query = {};
    
    // Date filtering
    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = new Date(start);
      if (end) query.createdAt.$lte = new Date(end);
    }

    // Status filtering
    if (status) {
      query.status = status.toUpperCase();
    }

    // Search functionality
    if (search) {
      query.$or = [
        { reference: { $regex: search, $options: 'i' } },
        { orderId: { $regex: search, $options: 'i' } },
      ];
    }

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('orderId', 'orderNumber customer');

    const total = await Payment.countDocuments(query);
    
    const totalAmount = await Payment.aggregate([
      { $match: { status: 'SUCCESSFUL', ...query } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get payment statistics
    const stats = await Payment.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      payments,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalAmount: totalAmount[0]?.total || 0,
      stats: stats.reduce((acc, curr) => {
        acc[curr._id.toLowerCase()] = {
          count: curr.count,
          amount: curr.amount
        };
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Admin payments error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch payments',
      error: error.message 
    });
  }
});

// Export payments
router.get('/payments/export', adminAuth, async (req, res) => {
  try {
    const { start, end, status } = req.query;
    let query = {};
    
    if (start || end) {
      query.createdAt = {};
      if (start) query.createdAt.$gte = new Date(start);
      if (end) query.createdAt.$lte = new Date(end);
    }

    if (status) {
      query.status = status.toUpperCase();
    }

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .populate('orderId', 'orderNumber customer');

    // Create CSV content
    const headers = ['ID,Reference,Amount,Status,Method,OrderID,Customer,Date\n'];
    const rows = payments.map(payment => [
      payment._id,
      payment.reference,
      payment.amount,
      payment.status,
      payment.method,
      payment.orderId?.orderNumber || 'N/A',
      payment.orderId?.customer?.name || 'N/A',
      payment.createdAt
    ].join(','));

    const csvContent = headers.concat(rows.join('\n'));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=payments.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Export payments error:', error);
    res.status(500).json({ 
      message: 'Failed to export payments',
      error: error.message 
    });
  }
});

// Get payment details
router.get('/payments/:id', adminAuth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('orderId');
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get payment statistics
router.get('/payments/stats', adminAuth, async (req, res) => {
  try {
    const stats = await Payment.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);
    res.json(stats);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get admin profile
router.get('/profile', adminAuth, async (req, res) => {
  try {
    const admin = await User.findById(req.user._id).select('-password');
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update admin profile
router.patch('/profile', adminAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const admin = await User.findById(req.user._id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if email is already taken
    if (email !== admin.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Check if phone is already taken
    if (phone !== admin.phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
    }

    admin.name = name || admin.name;
    admin.email = email || admin.email;
    admin.phone = phone || admin.phone;

    await admin.save();

    res.json({
      name: admin.name,
      email: admin.email,
      phone: admin.phone
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Change admin password
router.post('/profile/password', adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await User.findById(req.user._id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add this route to the existing adminRoutes.js
router.get('/revenue', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { status: 'DELIVERED' };

    if (startDate || endDate) {
      query['timestamps.delivered'] = {};
      if (startDate) query['timestamps.delivered'].$gte = new Date(startDate);
      if (endDate) query['timestamps.delivered'].$lte = new Date(endDate);
    }

    // Calculate daily revenue
    const orderRevenue = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: "$timestamps.delivered" 
            }
          },
          totalRevenue: { $sum: "$amount" },
          platformFee: { $sum: "$feeBreakdown.platformFee" },
          riderFee: { $sum: "$feeBreakdown.riderFee" },
          deliveryFee: { $sum: "$feeBreakdown.deliveryFee" },
          ordersCount: { $sum: 1 }
        }
      }
    ]);

    // Calculate errand revenue
    const errandRevenue = await Errand.aggregate([
      { 
        $match: {
          status: 'DELIVERED',
          'timestamps.delivered': query['timestamps.delivered']
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: "%Y-%m-%d", 
              date: "$timestamps.delivered" 
            }
          },
          totalRevenue: { $sum: "$pricing.total" },
          platformFee: { $sum: "$pricing.serviceFee" },
          riderFee: { $sum: "$pricing.deliveryFee" },
          ordersCount: { $sum: 1 }
        }
      }
    ]);

    // Combine revenues
    const dailyRevenue = orderRevenue.map(day => {
      const errandDay = errandRevenue.find(e => e._id === day._id) || {
        totalRevenue: 0,
        platformFee: 0,
        riderFee: 0,
        ordersCount: 0
      };
      
      return {
        _id: day._id,
        totalRevenue: day.totalRevenue + errandDay.totalRevenue,
        platformFee: day.platformFee + errandDay.platformFee,
        riderFee: day.riderFee + errandDay.riderFee,
        ordersCount: day.ordersCount + errandDay.ordersCount
      };
    });

    // Calculate payment methods breakdown
    const paymentMethods = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Calculate summary statistics
    const summary = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalPlatformFee: { $sum: "$feeBreakdown.platformFee" },
          totalRiderFee: { $sum: "$feeBreakdown.riderFee" },
          totalDeliveryFee: { $sum: "$feeBreakdown.deliveryFee" },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: "$amount" }
        }
      }
    ]);

    res.json({
      dailyRevenue,
      paymentMethods,
      summary: summary[0] || {
        totalRevenue: 0,
        totalPlatformFee: 0,
        totalRiderFee: 0,
        totalDeliveryFee: 0,
        totalOrders: 0,
        averageOrderValue: 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/analytics', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;
    const query = {};
    
    if (startDate || endDate) {
      query['timestamps.created'] = {};
      if (startDate) query['timestamps.created'].$gte = new Date(startDate);
      if (endDate) query['timestamps.created'].$lte = new Date(endDate);
    }

    // If format is 'csv', return exported data
    if (format === 'csv') {
      const analyticsData = await Order.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamps.created" } },
              status: "$status"
            },
            count: { $sum: 1 },
            revenue: { $sum: "$amount" }
          }
        },
        { $sort: { "_id.date": 1 } }
      ]);

      // Create CSV content
      const headers = ['Date,Status,Orders,Revenue\n'];
      const rows = analyticsData.map(data => [
        data._id.date,
        data._id.status,
        data.count,
        data.revenue
      ].join(','));

      const csvContent = headers.concat(rows.join('\n'));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      return res.send(csvContent);
    }

    // Existing analytics logic for JSON response
    const orderStatusDistribution = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Hourly order distribution
    const hourlyOrders = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $hour: "$timestamps.created" },
          count: { $sum: 1 },
          revenue: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Weekly trends
    const weeklyTrends = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            week: { $week: "$timestamps.created" },
            year: { $year: "$timestamps.created" }
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$amount" },
          averageDeliveryTime: {
            $avg: {
              $subtract: ["$timestamps.delivered", "$timestamps.created"]
            }
          }
        }
      },
      { $sort: { "_id.year": 1, "_id.week": 1 } }
    ]);

    // Rider performance
    const riderPerformance = await Order.aggregate([
      { $match: { ...query, status: "DELIVERED" } },
      {
        $group: {
          _id: "$rider",
          deliveries: { $sum: 1 },
          totalEarnings: { $sum: "$deliveryFee" },
          averageRating: { $avg: "$rating" }
        }
      },
      {
        $lookup: {
          from: "riders",
          localField: "_id",
          foreignField: "_id",
          as: "riderInfo"
        }
      },
      {
        $project: {
          deliveries: 1,
          totalEarnings: 1,
          averageRating: 1,
          riderName: { $arrayElemAt: ["$riderInfo.name", 0] }
        }
      },
      { $sort: { deliveries: -1 } },
      { $limit: 10 }
    ]);

    // Customer analytics
    const customerAnalytics = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$customer",
          orderCount: { $sum: 1 },
          totalSpent: { $sum: "$amount" },
          averageOrderValue: { $avg: "$amount" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "customerInfo"
        }
      },
      {
        $project: {
          orderCount: 1,
          totalSpent: 1,
          averageOrderValue: 1,
          customerName: { $arrayElemAt: ["$customerInfo.name", 0] }
        }
      },
      { $sort: { orderCount: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      orderStatusDistribution,
      hourlyOrders,
      weeklyTrends,
      riderPerformance,
      customerAnalytics
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get detailed analytics
router.get('/analytics/detailed', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};
    
    if (startDate || endDate) {
      query['timestamps.created'] = {};
      if (startDate) query['timestamps.created'].$gte = new Date(startDate);
      if (endDate) query['timestamps.created'].$lte = new Date(endDate);
    }

    // Delivery performance metrics
    const deliveryMetrics = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          averageDeliveryTime: {
            $avg: {
              $subtract: [
                '$timestamps.delivered',
                '$timestamps.created'
              ]
            }
          },
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0]
            }
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Peak hours analysis
    const peakHours = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            hour: { $hour: '$timestamps.created' },
            dayOfWeek: { $dayOfWeek: '$timestamps.created' }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$amount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Rider performance metrics
    const riderMetrics = await Order.aggregate([
      { $match: { ...query, status: 'DELIVERED' } },
      {
        $group: {
          _id: '$rider',
          deliveries: { $sum: 1 },
          totalEarnings: { $sum: '$feeBreakdown.riderFee' },
          averageRating: { $avg: '$rating' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'riderInfo'
        }
      }
    ]);

    // Location heat map data
    const locationHeatMap = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            pickup: '$pickupLocation',
            delivery: '$deliveryLocation'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Customer retention metrics
    const customerRetention = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$customer',
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$amount' },
          firstOrder: { $min: '$timestamps.created' },
          lastOrder: { $max: '$timestamps.created' }
        }
      }
    ]);

    res.json({
      deliveryMetrics: deliveryMetrics[0] || {},
      peakHours,
      riderMetrics,
      locationHeatMap,
      customerRetention
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get revenue forecasting
router.get('/analytics/forecast', adminAuth, async (req, res) => {
  try {
    // Get historical daily revenue data
    const dailyRevenue = await Order.aggregate([
      {
        $match: {
          status: 'DELIVERED',
          'timestamps.delivered': {
            $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamps.delivered' }
          },
          revenue: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Simple moving average calculation
    const movingAverage = calculateMovingAverage(dailyRevenue, 7); // 7-day moving average

    res.json({
      historicalData: dailyRevenue,
      forecast: movingAverage
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function calculateMovingAverage(data, window) {
  const result = [];
  for (let i = window - 1; i < data.length; i++) {
    const sum = data.slice(i - window + 1, i + 1)
      .reduce((acc, curr) => acc + curr.revenue, 0);
    result.push({
      date: data[i]._id,
      average: sum / window
    });
  }
  return result;
}

async function calculateEarnings(riderId, fromDate) {
  const earnings = await Order.aggregate([
    {
      $match: {
        rider: riderId,
        status: 'DELIVERED',
        'timestamps.delivered': { $gte: fromDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$feeBreakdown.riderFee' },
        deliveries: { $sum: 1 }
      }
    }
  ]);

  return earnings[0] || { total: 0, deliveries: 0 };
}

// Export analytics
router.get('/analytics/export', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};
    
    if (startDate || endDate) {
      query['timestamps.created'] = {};
      if (startDate) query['timestamps.created'].$gte = new Date(startDate);
      if (endDate) query['timestamps.created'].$lte = new Date(endDate);
    }

    // Get orders analytics data
    const orderAnalytics = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamps.created" } },
            type: { $literal: "Order" }
          },
          count: { $sum: 1 },
          revenue: { $sum: "$amount" },
          platformFees: { $sum: "$feeBreakdown.platformFee" },
          riderFees: { $sum: "$feeBreakdown.riderFee" },
          deliveryFees: { $sum: "$feeBreakdown.deliveryFee" }
        }
      }
    ]);

    // Get errands analytics data
    const errandAnalytics = await Errand.aggregate([
      { 
        $match: {
          'timestamps.created': query['timestamps.created']
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamps.created" } },
            type: { $literal: "Errand" }
          },
          count: { $sum: 1 },
          revenue: { $sum: "$pricing.total" },
          platformFees: { $sum: "$pricing.serviceFee" },
          riderFees: { $sum: "$pricing.deliveryFee" },
          deliveryFees: { $sum: "$pricing.deliveryFee" }
        }
      }
    ]);

    // Combine and sort analytics data
    const combinedAnalytics = [...orderAnalytics, ...errandAnalytics]
      .sort((a, b) => a._id.date.localeCompare(b._id.date));

    // Create CSV content
    const headers = ['Date,Type,Count,Revenue,Platform Fees,Rider Fees,Delivery Fees\n'];
    const rows = combinedAnalytics.map(data => [
      data._id.date,
      data._id.type,
      data.count,
      data.revenue.toFixed(2),
      data.platformFees.toFixed(2),
      data.riderFees.toFixed(2),
      data.deliveryFees.toFixed(2)
    ].join(','));

    const csvContent = headers.concat(rows.join('\n'));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({ 
      message: 'Failed to export analytics',
      error: error.message 
    });
  }
});

export default router;













