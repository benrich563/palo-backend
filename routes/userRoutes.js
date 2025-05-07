import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendEmail } from '../utils/email.js';
import { individualAuth, multipleRoles } from '../middleware/auth.js';
import Rider from '../models/Rider.js';
import { getPasswordResetEmail } from '../email-templates/reset-password.js';
import Store from '../models/Store.js';
import Order from '../models/Order.js';
import Errand from '../models/Errand.js';
import referralService from '../services/referralService.js';

const router = express.Router();

// Public routes (no auth required)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role, businessDetails, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate role
    const allowedRoles = ['individual', 'rider', 'business'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role selected' });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password,
      phone,
      role
    });

    // Create new user with business details if role is business
    if (role === "business") {
      // Only keep minimal business info in User model
      user.businessDetails = {
        businessName: businessDetails.businessName,
        registrationNumber: businessDetails.registrationNumber,
        businessType: businessDetails.businessType
      };
    }

    await user.save();

    // Create rider profile if role is rider
    if(role === "rider"){
      const rider = await Rider.create({
        user: user?._id,
        location: {
          type: "Point",
          coordinates: [0, 0]
        }
      });
      
      // Process referral if provided
      if (referralCode) {
        const referralResult = await referralService.processRiderReferral(rider._id, referralCode);
        
        // Award bonus to the new rider
        if (referralResult.success) {
          await referralService.awardReferredBonus(user._id, 'RIDER');
          
          // Award the referrer (will be processed after rider completes verification)
          // This is delayed to prevent fraud
        }
      }
    } else if (referralCode) {
      // Process user referral for non-rider roles
      const referralResult = await referralService.processUserReferral(user._id, referralCode);
      
      // Award bonus to the new user
      if (referralResult.success) {
        await referralService.awardReferredBonus(user._id, 'USER');
        
        // Award the referrer immediately for regular users
        await referralService.awardReferralReward(
          referralResult.referrer, 
          'USER', 
          user._id
        );
      }
    }

    // Generate referral code for the new user
    await referralService.generateReferralCode(user._id);

    // Generate token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });

    sendEmail({
      email: user.email,
      subject: "welcome",
      message: getWelcomeEmail(user, user.role, req.headers.origin)
    }).then(response => console.log(response)).catch(error => console.log(error))
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, location } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    let rider
    // If user is a rider, update their status and location
    if (user.role === 'rider') {
      rider = await Rider.findOne({ user: user._id });
      
      if (rider && location) {
        rider.status = 'ONLINE';
        rider.location = {
          type: 'Point',
          coordinates: location.coordinates // Expecting [longitude, latitude]
        };
        await rider.save();

        // Notify through socket.io
        const io = req.app.get('io');
        io.emit('riderStatusUpdated', {
          riderId: rider._id,
          status: rider.status,
          location: rider.location
        });
      }
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        // Include rider status and location if applicable
        ...(user.role === 'rider' && {
          riderStatus: rider?.status,
          riderLocation: rider?.location
        })
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Protected routes
router.get('/profile', individualAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.patch('/profile', individualAuth, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.phone = phone || user.phone;
    user.address = address || user.address;

    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Change password endpoint
router.post('/profile/password', individualAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Routes accessible by both individuals and business accounts
router.get('/orders', multipleRoles('individual', 'business'), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    // Build date filter if provided
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter['timestamps.created'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Build status filter
    const statusFilter = status ? { status: status.toUpperCase() } : {};

    // Fetch delivery orders
    const deliveryOrders = await Order.find({
      user: req.user._id,
      ...statusFilter,
      ...dateFilter
    })
    .populate('rider', 'user')
    .populate({
      path: 'rider',
      populate: {
        path: 'user',
        select: 'name phone'
      }
    })
    .lean()
    .exec();

    // Fetch errands
    const errands = await Errand.find({
      user: req.user._id,
      ...statusFilter,
      ...dateFilter
    })
    .populate('rider', 'user')
    .populate({
      path: 'rider',
      populate: {
        path: 'user',
        select: 'name phone'
      }
    })
    .lean()
    .exec();

    // Combine and format orders
    const combinedOrders = [
      ...deliveryOrders.map(order => ({
        ...order,
        type: 'DELIVERY'  // Add type indicator for delivery orders
      })),
      ...errands.map(errand => ({
        ...errand,
        type: 'ERRAND'    // Add type indicator for errand orders
      }))
    ];

    // Sort combined orders by creation date
    const sortedOrders = combinedOrders.sort((a, b) => 
      new Date(b.timestamps.created) - new Date(a.timestamps.created)
    );

    // Apply pagination
    const paginatedOrders = sortedOrders.slice(skip, skip + Number(limit));
    const total = sortedOrders.length;

    res.json({
      orders: paginatedOrders,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalOrders: total,
      stats: {
        delivery: deliveryOrders.length,
        errands: errands.length
      }
    });

  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ 
      message: 'Failed to fetch orders',
      error: error.message 
    });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email
    const resetUrl = `${req.headers.origin}/auth/reset-password/${resetToken}`;
    const message = getPasswordResetEmail(user, resetUrl, origin)

    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request',
      message,
    });

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Reset Password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

export default router;





