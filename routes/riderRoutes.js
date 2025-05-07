import express from 'express';
import Order from '../models/Order.js';
import Rider from '../models/Rider.js';
import { riderAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import Errand from '../models/Errand.js';
import incentiveService from '../services/incentiveService.js';

const router = express.Router();

// Add profile endpoint
router.get('/profile', riderAuth, async (req, res) => {
  try {
    const rider = await Rider.findById(req.user._id)
      .select('-documents.idCard.url -documents.license.url -documents.insurance.url')
      .populate('user', 'name email phone');
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }
    
    res.json({
      name: rider.user.name,
      email: rider.user.email,
      phone: rider.user.phone,
      ...rider.toObject()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update profile endpoint
router.patch('/profile', riderAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    // Find the rider and associated user
    const rider = await Rider.findById({user: req.user._id});
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Update user information
    const user = await User.findById(rider.user);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is already taken by another user
    if (email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Check if phone is already taken by another user
    if (phone !== user.phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
    }

    // Update user information
    user.name = name;
    user.email = email;
    user.phone = phone;
    await user.save();

    res.json({
      name: user.name,
      email: user.email,
      phone: user.phone
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Change password endpoint
router.post('/profile/password', riderAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Find the user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update status and location endpoint
router.post('/status', riderAuth, async (req, res) => {
  try {
    const { status, location } = req.body;
    
    if (!['ONLINE', 'OFFLINE', 'BUSY'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    if (!location || !location.coordinates || !Array.isArray(location.coordinates)) {
      return res.status(400).json({ message: 'Invalid location format' });
    }

    const rider = await Rider.findOne({user: req.user._id});
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    rider.status = status;
    rider.location = {
      type: 'Point',
      coordinates: location.coordinates // Expecting [longitude, latitude]
    };
    await rider.save();

    // Notify through socket.io about rider status and location change
    const io = req.app.get('io');
    io.emit('riderStatusUpdated', {
      riderId: rider._id,
      status: rider.status,
      location: rider.location
    });

    res.json({ 
      status: rider.status,
      location: rider.location
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add dashboard endpoint
router.get('/dashboard', riderAuth, async (req, res) => {
  try {
    // First, get the rider document
    const rider = await Rider.findOne({ user: req.user._id });
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Get rider's current orders using rider._id instead of req.user._id
    const currentOrders = await Order.find({
      rider: rider._id,
      status: { $in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] }
    }).sort({ 'timestamps.created': -1 });

    // Get rider's completed orders for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const completedToday = await Order.find({
      rider: rider._id,
      status: 'DELIVERED',
      'timestamps.delivered': { $gte: today }
    });

    // Calculate today's earnings
    const todayEarnings = completedToday.reduce(
      (total, order) => total + (order.feeBreakdown?.riderFee || 0),
      0
    );

    // Get available orders
    const availableOrders = await Order.find({ 
      status: 'PENDING',
      rider: rider._id
    }).sort({ 'timestamps.created': -1 });

    res.json({
      currentOrders,
      availableOrders,
      todayStats: {
        deliveries: completedToday.length,
        earnings: todayEarnings
      },
      riderStatus: rider.status || 'OFFLINE'
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update rider routes with new auth
router.get('/available-orders', riderAuth, async (req, res) => {
  try {
    const orders = await Order.find({ status: 'PENDING' });
    res.json(orders);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.post('/orders/:id/accept', riderAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ message: 'Order is not available' });
    }

    order.rider = req.user._id;
    order.status = 'ASSIGNED';
    order.timestamps.assigned = new Date();
    await order.save();

    // Notify through socket.io
    const io = req.app.get('io');
    io.emit('orderStatusUpdated', { orderId: order._id, status: 'ASSIGNED' });

    res.json(order);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Update order status
router.patch('/orders/:id/status', riderAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.rider.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    order.status = status;
    if (status === 'PICKED_UP') {
      order.timestamps.pickedUp = new Date();
    } else if (status === 'DELIVERED') {
      order.timestamps.delivered = new Date();
    }

    await order.save();

    // Notify through socket.io
    const io = req.app.get('io');
    io.emit('orderStatusUpdated', { orderId: order._id, status });

    res.json(order);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.get('/my-orders', riderAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, sortBy = 'timestamps.created', order = 'desc' } = req.query;
    
    // First, get the rider document
    const rider = await Rider.findOne({ user: req.user._id });
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Build the query
    const query = {
      rider: rider._id,
      ...(status ? { status } : {})
    };
    
    const orders = await Order.find(query)
      .populate('rider')
      .sort({ [sortBy]: order })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Order.countDocuments(query);
    
    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalOrders: total
    });
  } catch (error) {
    console.error('My orders error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add revenue statistics endpoint
router.get('/revenue-stats', riderAuth, async (req, res) => {
  try {
    // First, get the rider document
    const rider = await Rider.findOne({ user: req.user._id });
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    // Calculate earnings summaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Get daily revenue for the past 30 days
    const dailyRevenue = await Order.aggregate([
      {
        $match: {
          rider: rider._id,
          status: 'DELIVERED',
          'timestamps.delivered': { $gte: monthAgo }
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
      {
        $project: {
          _id: 0,
          date: "$_id",
          revenue: 1,
          deliveries: 1
        }
      },
      { $sort: { date: -1 } }
    ]);

    // Get recent deliveries
    const recentDeliveries = await Order.find({ 
      rider: rider._id,
      status: 'DELIVERED'
    })
    .sort({ 'timestamps.delivered': -1 })
    .limit(10)
    .select('_id status timestamps.delivered deliveryLocation feeBreakdown.riderFee');

    // Calculate earnings summaries
    const earnings = {
      today: await calculateRiderEarnings(rider._id, today),
      thisWeek: await calculateRiderEarnings(rider._id, weekAgo),
      thisMonth: await calculateRiderEarnings(rider._id, monthAgo)
    };

    res.json({
      earnings,
      dailyRevenue,
      recentDeliveries
    });
  } catch (error) {
    console.error('Revenue stats error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Helper function to calculate earnings
async function calculateRiderEarnings(riderId, startDate) {
  const result = await Order.aggregate([
    {
      $match: {
        rider: riderId,
        status: 'DELIVERED',
        'timestamps.delivered': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$feeBreakdown.riderFee" }
      }
    }
  ]);

  return result[0]?.total || 0;
}

// Get rider incentive summary
router.get('/incentives', riderAuth, async (req, res) => {
  try {
    const rider = await Rider.findOne({ user: req.user._id });
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }
    
    const incentiveSummary = await incentiveService.getRiderIncentiveSummary(rider._id);
    res.json(incentiveSummary);
  } catch (error) {
    console.error('Incentive summary error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Redeem points for cash
router.post('/incentives/redeem', riderAuth, async (req, res) => {
  try {
    const { pointsToRedeem } = req.body;
    
    if (!pointsToRedeem || pointsToRedeem < 100) {
      return res.status(400).json({ 
        message: 'Minimum 100 points required for redemption' 
      });
    }
    
    const rider = await Rider.findOne({ user: req.user._id });
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }
    
    if (rider.incentives.currentPoints < pointsToRedeem) {
      return res.status(400).json({ 
        message: 'Insufficient points for redemption' 
      });
    }
    
    // Calculate cash value (e.g., 100 points = $1)
    const cashValue = (pointsToRedeem / 100).toFixed(2);
    
    // Update rider points
    const updatedRider = await Rider.findByIdAndUpdate(
      rider._id,
      {
        $inc: { 'incentives.currentPoints': -pointsToRedeem },
        $push: {
          'incentives.bonusHistory': {
            amount: -pointsToRedeem,
            reason: `Redeemed ${pointsToRedeem} points for GHC ${cashValue}`,
            dateAwarded: new Date()
          }
        }
      },
      { new: true }
    );
    
    // In a real app, you would initiate a payment to the rider here
    
    res.json({
      success: true,
      pointsRedeemed: pointsToRedeem,
      cashValue,
      remainingPoints: updatedRider.incentives.currentPoints
    });
  } catch (error) {
    console.error('Points redemption error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get rider revenue with incentive information
router.get('/revenue', riderAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const rider = await Rider.findOne({ user: req.user._id });
    
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }
    
    // Set default date range to last 30 days if not provided
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get orders for the rider in the date range
    const orders = await Order.find({
      rider: rider._id,
      'timestamps.delivered': { $gte: start, $lte: end },
      status: 'DELIVERED'
    }).sort({ 'timestamps.delivered': -1 });
    
    // Calculate revenue metrics
    let totalEarnings = 0;
    let incentiveBonuses = 0;
    
    const orderData = orders.map(order => {
      const baseFee = order.feeBreakdown?.riderFee || 0;
      const tierBonus = order.feeBreakdown?.tierBonus || 0;
      const total = order.feeBreakdown?.riderFeeWithBonus || baseFee;
      
      totalEarnings += total;
      incentiveBonuses += tierBonus;
      
      return {
        _id: order._id,
        orderId: order._id,
        date: order.timestamps.delivered,
        amount: baseFee,
        tierBonus,
        total,
        status: order.paymentStatus || 'PENDING'
      };
    });
    
    // Get pending payouts (orders delivered but not paid)
    const pendingOrders = await Order.find({
      rider: rider._id,
      status: 'DELIVERED',
      paymentStatus: { $ne: 'PAID' }
    });
    
    const pendingPayouts = pendingOrders.reduce((total, order) => {
      return total + (order.feeBreakdown?.riderFeeWithBonus || order.feeBreakdown?.riderFee || 0);
    }, 0);
    
    // Get tier information
    const tierBonusPercentage = rider.incentives?.tier === 'BRONZE' ? 0 :
                               rider.incentives?.tier === 'SILVER' ? 5 :
                               rider.incentives?.tier === 'GOLD' ? 10 :
                               rider.incentives?.tier === 'PLATINUM' ? 15 : 0;
    
    res.json({
      totalEarnings,
      deliveryFees: totalEarnings - incentiveBonuses,
      incentiveBonuses,
      completedOrders: orders.length,
      pendingPayouts,
      currentTier: rider.incentives?.tier || 'BRONZE',
      tierBonusPercentage,
      orders: orderData
    });
  } catch (error) {
    console.error('Revenue data error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;



