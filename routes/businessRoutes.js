import express from 'express';
import { businessAuth } from '../middleware/auth.js';
import Store from '../models/Store.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import ProductOrder from '../models/ProductOrder.js';
import https from 'https';
import { businessOrderController } from '../controllers/businessOrderController.js';
import { validateAnalyticsQuery } from '../middleware/analyticsValidation.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import multer from 'multer';
import mongoose from "mongoose"
import { v2 as cloudinary } from 'cloudinary';
import { bufferToStream, upload } from '../utils/imageUpload.js';
import referralService from '../services/referralService.js';

const router = express.Router();

// Define promotion plans constant at the top of the file
const PROMOTION_PLANS = {
  BASIC: { 
    amount: 100, 
    duration: 30, // days
    name: 'Basic Promotion'
  },
  PREMIUM: { 
    amount: 250, 
    duration: 30, // days
    name: 'Premium Promotion'
  }
};

// Register store (one-time payment)
router.post('/store/register', businessAuth, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      address, 
      city, 
      region, 
      phone, 
      category,
      openingHours,
      referralCode 
    } = req.body;

    // Check if user already has a store
    const existingStore = await Store.findOne({ owner: req.user._id });
    if (existingStore) {
      return res.status(400).json({ message: 'You already have a registered store' });
    }

    // Generate payment reference
    const paymentReference = `STORE_REG_${req.user._id}_${Date.now()}`;

    // Create store with pending status
    const store = new Store({
      name,
      description,
      owner: req.user._id,
      location: {
        address,
        city,
        region,
        coordinates: [0, 0] // Will be updated with geocoding
      },
      contact: {
        phone,
        email: req.user.email
      },
      category,
      openingHours: openingHours || {},
      registration: {
        status: 'PENDING_PAYMENT',
        paymentReference,
        requestedAt: new Date()
      }
    });

    await store.save();

    // Process referral if provided
    if (referralCode) {
      await referralService.processVendorReferral(store._id, referralCode);
      // Note: Rewards will be processed after payment verification
    }

    const STORE_REGISTRATION_FEE = 500; // GHC 500

    const params = JSON.stringify({
      email: req.user.email,
      amount: STORE_REGISTRATION_FEE * 100, // Convert to pesewas
      reference: store.registration.paymentReference,
      callback_url: `${process.env.FRONTEND_URL}/business/store/verify/${store.registration.paymentReference}?type=registration`,
      metadata: {
        userId: req.user._id,
        storeId: store._id,
        type: 'store_registration',
        referralCode
      }
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const paymentReq = https.request(options, paymentRes => {
      let data = '';

      paymentRes.on('data', (chunk) => {
        data += chunk;
      });

      paymentRes.on('end', () => {
        try {
          const response = JSON.parse(data);
          res.json(response.data);
        } catch (error) {
          res.status(500).json({ message: 'Failed to process payment request' });
        }
      });
    });

    paymentReq.on('error', (error) => {
      console.error('Payment initialization error:', error);
      res.status(500).json({ message: 'Payment initialization failed' });
    });

    paymentReq.write(params);
    paymentReq.end();

  } catch (error) {
    console.error('Store registration initialization error:', error);
    res.status(500).json({ message: 'Failed to initialize store registration' });
  }
});

// Verify store registration payment
router.get('/store/verify/:reference', businessAuth, async (req, res) => {
  try {
   console.log("reference", req.params.reference)

    // Check if payment was already verified
    const store = await Store.findOne({ 
      'registration.paymentReference': req.params.reference,
      owner: req.user._id
    });

    if (!store) {
      return res.status(404).json({ 
        message: 'Store not found',
        details: 'No store found with this payment reference'
      });
    }

     
    if (store.registration.status === 'COMPLETED') {
      return res.json({ 
        message: 'Store registration successful',
        store,
        alreadyVerified: true
      });
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${req.params.reference}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    };

    const paystackReq = https.request(options, async (paystackRes) => {
      let data = '';

      paystackRes.on('data', (chunk) => {
        data += chunk;
      });

      paystackRes.on('end', async () => {
        try {
          const response = JSON.parse(data);

          if (response.data.status !== 'success') {
            return res.status(400).json({ 
              message: 'Payment verification failed',
              details: response.data.gateway_response || 'Payment was not successful'
            });
          }

          // Verify payment amount matches expected amount
          const expectedAmount = 500 * 100; // GHC 500 in pesewas
          if (response.data.amount !== expectedAmount) {
            return res.status(400).json({ 
              message: 'Payment verification failed',
              details: 'Payment amount does not match expected registration fee'
            });
          }

          // Update store registration status
          try {
            store.registration.status = 'COMPLETED';
            store.status = 'ACTIVE';
            store.registration.completedAt = new Date();
            store.registration.paymentDetails = {
              amount: response.data.amount / 100,
              channel: response.data.channel,
              paymentMethod: response.data.authorization?.card_type || response.data.channel,
              last4: response.data.authorization?.last4,
              bank: response.data.authorization?.bank
            };
            
            await store.save();

            // Create payment record
            const payment = new Payment({
              type: 'STORE_SUBSCRIPTION',
              transactionReference: req.params.reference,
              amount: response.data.amount / 100,
              status: 'SUCCESS',
              paymentMethod: 'PAYSTACK',
              paymentDetails: {
                channel: response.data.channel,
                cardType: response.data.authorization?.card_type,
                last4: response.data.authorization?.last4,
                bank: response.data.authorization?.bank
              },
              metadata: {
                storeId: store._id,
                paymentType: 'STORE_REGISTRATION'
              }
            });
            await payment.save();

            // Process referral rewards if applicable
            const user = await User.findById(req.user._id);
            if (user.referredBy) {
              // Award the referrer
              await referralService.awardReferralReward(
                user.referredBy, 
                'VENDOR', 
                store._id
              );
              
              // Award bonus to the new vendor
              await referralService.awardReferredBonus(user._id, 'VENDOR');
            }

            return res.json({
              message: 'Store registration successful',
              store
            });

          } catch (dbError) {
            return res.status(500).json({
              message: 'Payment verification failed',
              details: 'Failed to update store registration status'
            });
          }
        } catch (parseError) {
           return res.status(500).json({ 
            message: 'Payment verification failed',
            details: 'Failed to process payment provider response'
          });
        }
      });
    });

    paystackReq.on('error', (error) => {
      console.error('Verification request failed:', error);
      return res.status(500).json({ 
        message: 'Payment verification failed',
        details: 'Failed to connect to payment provider'
      });
    });

    paystackReq.end();
  } catch (error) {
    console.error('Store registration verification error:', error);
    return res.status(500).json({ 
      message: 'Payment verification failed',
      details: error.message
    });
  }
});


// Store promotion subscription
router.post('/promote/visibility', businessAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const store = await Store.findOne({ owner: req.user._id });
    
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    if (!PROMOTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid promotion plan' });
    }

    // Generate payment reference
    const paymentReference = `STORE_PROMO_${store._id}_${Date.now()}`;

    // Update store with pending promotion details
    store.promotion = {
      paymentReference,
      plan,
      status: 'PENDING',
      amount: PROMOTION_PLANS[plan].amount,
      requestedAt: new Date()
    };
    
    await store.save();

    const params = JSON.stringify({
      email: req.user.email,
      amount: PROMOTION_PLANS[plan].amount * 100, // Convert to pesewas
      reference: paymentReference,
      callback_url: `${process.env.FRONTEND_URL}/business/store/verify/${paymentReference}?type=promotion`,
      metadata: {
        storeId: store._id,
        userId: req.user._id,
        plan,
        type: 'store_promotion'
      }
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const paymentReq = https.request(options, paymentRes => {
      let data = '';

      paymentRes.on('data', (chunk) => {
        data += chunk;
      });

      paymentRes.on('end', () => {
        try {
          const response = JSON.parse(data);
          res.json(response.data);
        } catch (error) {
          res.status(500).json({ 
            message: 'Failed to process payment request',
            details: error.message
          });
        }
      });
    });

    paymentReq.on('error', (error) => {
      console.error('Payment initialization error:', error);
      res.status(500).json({ 
        message: 'Payment initialization failed',
        details: error.message 
      });
    });

    paymentReq.write(params);
    paymentReq.end();

  } catch (error) {
    console.error('Promotion request error:', error);
    res.status(500).json({ 
      message: 'Failed to process promotion request',
      details: error.message
    });
  }
});

// Verify store promotion payment
router.get('/promote/verify/:reference', businessAuth, async (req, res) => {
  try {
    console.log('Verifying promotion payment:', req.params.reference);

    const store = await Store.findOne({ 
      'promotion.paymentReference': req.params.reference 
    });

    console.log("store", store);

    if (!store) {
      return res.status(404).json({ 
        message: 'Store not found',
        details: 'No store found with this promotion payment reference'
      });
    }

    if (store.promotion.status === 'ACTIVE') {
      return res.json({ 
        message: 'Store promotion successful',
        store,
        alreadyVerified: true
      });
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${req.params.reference}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    };

    const paystackReq = https.request(options, async (paystackRes) => {
      let data = '';

      paystackRes.on('data', (chunk) => {
        data += chunk;
      });

      paystackRes.on('end', async () => {
        const response = JSON.parse(data);
        
        if (response.data.status === 'success') {
          const plan = response.data.metadata.plan;
          
          // Verify the plan exists
          if (!PROMOTION_PLANS[plan]) {
            return res.status(400).json({ 
              message: 'Payment verification failed',
              details: 'Invalid promotion plan'
            });
          }

          // Verify payment amount matches plan amount
          const expectedAmount = PROMOTION_PLANS[plan].amount * 100; // Convert to pesewas
          if (response.data.amount !== expectedAmount) {
            return res.status(400).json({ 
              message: 'Payment verification failed',
              details: 'Payment amount does not match plan amount'
            });
          }

          const duration = PROMOTION_PLANS[plan].duration;

          // Update store promotion details
          store.promotion.plan = plan;
          store.promotion.status = 'ACTIVE';
          store.promotion.startDate = new Date();
          store.promotion.endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
          
          // Create payment record
          const payment = new Payment({
            type: 'STORE_PROMOTION',
            transactionReference: req.params.reference,
            amount: response.data.amount / 100,
            status: 'SUCCESS',
            paymentMethod: 'PAYSTACK',
            paymentDetails: {
              channel: response.data.channel,
              cardType: response.data.authorization?.card_type,
              last4: response.data.authorization?.last4,
              bank: response.data.authorization?.bank
            },
            metadata: {
              storeId: store._id,
              plan,
              type: 'store_promotion'
            }
          });

          await Promise.all([store.save(), payment.save()]);

          res.json({ 
            message: 'Store promotion successful',
            store
          });
        } else {
          res.status(400).json({ 
            message: 'Promotion payment verification failed',
            details: response.data.gateway_response
          });
        }
      });
    });

    paystackReq.on('error', (error) => {
      console.error('Verification request failed:', error);
      res.status(500).json({ message: 'Payment verification failed' });
    });

    paystackReq.end();
  } catch (error) {
    console.error('Store promotion verification error:', error);
    res.status(500).json({ message: 'Payment verification failed' });
  }
});

// Get store details
router.get('/store', businessAuth, async (req, res) => {
  try {
    // First, get the user data
    const user = await User.findById(req.user._id)
      .select('name email phone businessDetails')
      .lean();

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        details: 'User account not found'
      });
    }

    // Then get store details including registration and promotion status
    const store = await Store.findOne({ owner: req.user._id })
      .select('_id name status category address location description website openingHours socialMedia promotion registration bannerImage logoImage')
      .lean();

    console.log('Store from DB:', store); // Add this to see what we're getting

    if (!store) {
      return res.status(404).json({ 
        message: 'Store not found',
        details: 'No store registered for this user'
      });
    }

    // Format delivery subscription data
    const deliverySubscription = user.businessDetails?.deliverySubscription ? {
      plan: user.businessDetails.deliverySubscription.plan,
      remainingDeliveries: user.businessDetails.deliverySubscription.remainingDeliveries,
      endDate: user.businessDetails.deliverySubscription.endDate,
      status: user.businessDetails.deliverySubscription.status
    } : null;

    // Format promotion data with null checks
    const promotion = store.promotion ? {
      plan: store.promotion.plan || 'NONE',
      status: store.promotion.status || 'INACTIVE',
      startDate: store.promotion.startDate,
      endDate: store.promotion.endDate,
      isActive: store.promotion.status === 'ACTIVE' && 
                store.promotion.endDate && 
                new Date(store.promotion.endDate) > new Date()
    } : {
      plan: 'NONE',
      status: 'INACTIVE',
      startDate: null,
      endDate: null,
      isActive: false
    };

    // Combine all data with null checks
    const storeData = {
      _id: store._id,
      personalData: {
        name: user.name,
        email: user.email,
        phone: user.phone
      },
      documents: user.businessDetails?.documents || [],
      businessName: store.name,
      category: store.category || '',
      status: store.status || 'PENDING',
      promotion,
      deliverySubscription,
      registrationStatus: store.registration?.status || 'PENDING',
      isFullyActive: store.registration?.status === 'COMPLETED' && 
                    store.status === 'ACTIVE',
      description: store.description || '',
      address: store.address || '',
      location: store.location || { type: 'Point', coordinates: [0, 0] },
      website: store.website || '',
      openingHours: store.openingHours || {},
      socialMedia: store.socialMedia || {},
      bannerImage: store.bannerImage,
      logoImage: store.logoImage,
      businessDetails: {
        registrationNumber: user.businessDetails?.registrationNumber || '',
        taxId: user.businessDetails?.taxId || ''
      }
    };

    res.json({ 
      store: storeData,
      message: 'Store details retrieved successfully'
    });

  } catch (error) {
    console.error('Store details error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch store details',
      details: error.message
    });
  }
});

// Update store details
router.put('/store', businessAuth, async (req, res) => {
  try {
    const { store: storeUpdate, user: userUpdate } = req.body;
    
    // Find and update store
    const store = await Store.findOne({ owner: req.user._id });
    if (!store) {
      throw new Error('Store not found');
    }

    // Update store fields
    if (storeUpdate) {
      // Update all store fields
      store.name = storeUpdate.name;
      store.description = storeUpdate.description;
      store.category = storeUpdate.category;
      store.address = storeUpdate.address;
      store.location = storeUpdate.location;
      store.phoneNumber = storeUpdate.phoneNumber;
      store.email = storeUpdate.email;
      store.website = storeUpdate.website;
      store.openingHours = storeUpdate.openingHours;
      store.socialMedia = storeUpdate.socialMedia;
    }

    await store.save();

    // Update user business details
    if (userUpdate?.businessDetails) {
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          $set: {
            'businessDetails.registrationNumber': userUpdate.businessDetails.registrationNumber,
            'businessDetails.taxId': userUpdate.businessDetails.taxId
          }
        },
        { new: true, runValidators: true }
      );

      if (!updatedUser) {
        throw new Error('User not found');
      }
    }

    // Fetch complete updated data
    const updatedStore = await Store.findOne({ owner: req.user._id });
    const updatedUser = await User.findById(req.user._id)
      .select('businessDetails');

    // Combine store and user data for response
    const responseData = {
      ...updatedStore.toObject(),
      registrationNumber: updatedUser.businessDetails?.registrationNumber,
      taxId: updatedUser.businessDetails?.taxId
    };

    res.json({
      message: 'Store updated successfully',
      store: responseData
    });

  } catch (error) {
    console.error('Store update error:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to update store details'
    });
  }
});

// Add a new route for image upload
router.post('/store/upload-image', [businessAuth, upload.single('image')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an image' });
    }

    const imageType = req.query.type; // 'banner' or 'logo'
    if (!['banner', 'logo'].includes(imageType)) {
      return res.status(400).json({ message: 'Invalid image type' });
    }

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `delivery/stores/${imageType}s`,
          resource_type: 'auto',
        },
        async (error, result) => {
          if (error) {
            console.error('Upload error:', error);
            return res.status(500).json({ message: 'Upload failed' });
          }

          // Update store with new image URL
          const store = await Store.findOne({ owner: req.user._id });
          if (imageType === 'banner') {
            store.bannerImage = result.secure_url;
          } else {
            store.logoImage = result.secure_url;
          }
          await store.save();

          res.json({
            url: result.secure_url,
            public_id: result.public_id
          });
        }
      );

      bufferToStream(req.file.buffer).pipe(stream);
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Product management
router.post('/products', businessAuth, async (req, res) => {
  try {
    const store = await Store.findOne({ owner: req.user._id });
    
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const product = new Product({
      store: store._id,  // Save the actual store ID
      ...req.body,
      status: store.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get store products
router.get('/products', businessAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const store = await User.findOne(req.user._id);
    
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    const query = { store: store._id };
    if (status) query.status = status;

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalProducts: total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update product
router.put('/products/:id', businessAuth, async (req, res) => {
  try {
    const store = await Store.findOne({ owner: req.user._id });
    const product = await Product.findOne({ 
      _id: req.params.id,
      store: store._id
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    Object.assign(product, req.body);
    await product.save();
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get store orders
router.get('/orders', businessAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const store = await Store.findOne({ owner: req.user._id });
    
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Handle different order types
    let orders = [];
    let total = 0;

    // Get product orders
    if (!type || type === 'PRODUCT') {
      const productQuery = { 
        business: store._id,
        ...(status && { processingStatus: status })
      };
      
      const productOrders = await ProductOrder.find(productQuery)
        .populate('items.product', 'name images')
        .populate('deliveryOrder')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      orders = [...orders, ...productOrders.map(order => ({ ...order.toObject(), type: 'PRODUCT' }))];
      total += await ProductOrder.countDocuments(productQuery);
    }

    // Get delivery orders
    if (!type || type === 'DELIVERY') {
      const deliveryQuery = {
        business: store._id,
        type: 'DELIVERY',
        ...(status && { status })
      };

      const deliveryOrders = await Order.find(deliveryQuery)
        .populate('rider', 'name phone currentLocation')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      orders = [...orders, ...deliveryOrders.map(order => ({ ...order.toObject(), type: 'DELIVERY' }))];
      total += await Order.countDocuments(deliveryQuery);
    }

    // Get shopping orders
    if (!type || type === 'SHOPPING') {
      const shoppingQuery = {
        business: store._id,
        type: 'SHOPPING',
        ...(status && { status })
      };

      const shoppingOrders = await Order.find(shoppingQuery)
        .populate('rider', 'name phone currentLocation')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      orders = [...orders, ...shoppingOrders.map(order => ({ ...order.toObject(), type: 'SHOPPING' }))];
      total += await Order.countDocuments(shoppingQuery);
    }

    // Sort combined orders by creation date
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalOrders: total
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// Get order details
router.get('/orders/:id', businessAuth, async (req, res) => {
  try {
    const store = await Store.findOne({ owner: req.user._id });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Try to find product order first
    let order = await ProductOrder.findOne({
      _id: req.params.id,
      business: store._id
    }).populate('items.product deliveryOrder');

    if (order) {
      return res.json({ order: { ...order.toObject(), type: 'PRODUCT' } });
    }

    // Try to find delivery/shopping order
    order = await Order.findOne({
      _id: req.params.id,
      business: store._id
    }).populate('rider', 'name phone currentLocation');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order: { ...order.toObject(), type: order.type } });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ message: 'Failed to fetch order details' });
  }
});

// Update order status
router.patch('/orders/:id', businessAuth, async (req, res) => {
  try {
    const store = await Store.findOne({ owner: req.user._id });
    const order = await ProductOrder.findOne({ 
      _id: req.params.id,
      business: store._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const { processingStatus, notes } = req.body;

    if (processingStatus) {
      order.processingStatus = processingStatus;
      order.timestamps[processingStatus.toLowerCase()] = new Date();

      // If status is READY_FOR_PICKUP, create delivery order
      if (processingStatus === 'READY_FOR_PICKUP' && !order.deliveryOrder) {
        const deliveryOrder = new Order({
          orderType: 'BUSINESS',
          business: store._id,
          pickupLocation: {
            address: store.address.street,
            coordinates: store.address.coordinates.coordinates
          },
          deliveryLocation: {
            address: order.customer.address
          },
          senderPhone: store.phone,
          recipientPhone: order.customer.phone,
          packageDetails: {
            items: order.items.map(item => ({
              name: item.name,
              quantity: item.quantity
            }))
          }
        });

        await deliveryOrder.save();
        order.deliveryOrder = deliveryOrder._id;
      }
    }

    if (notes) {
      order.notes.business = notes;
    }

    await order.save();

    // Emit socket event for real-time updates
    req.app.get('io').to(`order_${order._id}`).emit('orderUpdated', order);

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Order Management
router.patch('/orders/:orderId/process', 
  businessAuth, 
  businessOrderController.processOrder
);

router.get('/orders/history', 
  businessAuth, 
  businessOrderController.getOrderHistory
);

// Payment Management
router.get('/payments/history', 
  businessAuth, 
  businessOrderController.getPaymentHistory
);

router.post('/orders/:orderId/refund', 
  businessAuth, 
  businessOrderController.processRefund
);

// Analytics
router.get('/analytics', 
  businessAuth,
  validateAnalyticsQuery,
  businessOrderController.getAnalytics
);

// Get dashboard stats
router.get('/dashboard', businessAuth, async (req, res) => {
  try {
    const businessId = req.user._id;
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));

    // Get total orders and revenue
    const totalStats = await Order.aggregate([
      { 
        $match: { 
          business: businessId,
          status: { $ne: 'CANCELLED' }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$amount' }
        }
      }
    ]);

    // Get monthly growth
    const previousMonth = await Order.aggregate([
      {
        $match: {
          business: businessId,
          status: { $ne: 'CANCELLED' },
          createdAt: {
            $gte: new Date(today.setDate(today.getDate() - 60)),
            $lt: thirtyDaysAgo
          }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$amount' }
        }
      }
    ]);

    // Get recent orders
    const recentOrders = await Order.find({ business: businessId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name')  // Changed from 'customer' to 'user'
      .lean();

    // Calculate monthly growth percentage
    const currentMonthRevenue = totalStats[0]?.totalRevenue || 0;
    const previousMonthRevenue = previousMonth[0]?.revenue || 0;
    const monthlyGrowth = previousMonthRevenue === 0 
      ? 100 
      : ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100;

    res.json({
      stats: {
        totalOrders: totalStats[0]?.totalOrders || 0,
        totalRevenue: totalStats[0]?.totalRevenue || 0,
        monthlyGrowth: parseFloat(monthlyGrowth.toFixed(2)),
        activeUsers: await Order.distinct('user', {  // Changed from 'customer' to 'user'
          business: businessId,
          createdAt: { $gte: thirtyDaysAgo }
        }).count()
      },
      recentOrders: recentOrders.map(order => ({
        _id: order._id,
        createdAt: order.createdAt,
        status: order.status,
        total: order.amount,
        user: order.user  // Changed from 'customer' to 'user'
      }))
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delivery Subscription Plans
const DELIVERY_SUBSCRIPTION_PLANS = {
  BASIC: { 
    amount: 200, 
    deliveries: 20,
    name: 'Basic Plan'
  },
  STANDARD: { 
    amount: 300, 
    deliveries: 30,
    name: 'Standard Plan'
  },
  PREMIUM: { 
    amount: 500, 
    deliveries: 50,
    name: 'Premium Plan'
  }
};

// Initialize delivery subscription
router.post('/delivery-subscription', businessAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!DELIVERY_SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }

    const reference = `DELIVERY_SUB_${user._id}_${Date.now()}`;
    const params = JSON.stringify({
      email: user.email,
      amount: DELIVERY_SUBSCRIPTION_PLANS[plan].amount * 100,
      reference,
      callback_url: `${req.headers.origin}/business/store/subscription/verify/${reference}`,
      metadata: {
        userId: user._id,
        plan,
        type: 'delivery_subscription',
        deliveries: DELIVERY_SUBSCRIPTION_PLANS[plan].deliveries
      }
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const paymentReq = https.request(options, paymentRes => {
      let data = '';

      paymentRes.on('data', (chunk) => {
        data += chunk;
      });

      paymentRes.on('end', () => {
        res.json(JSON.parse(data));
      });
    });

    paymentReq.on('error', error => {
      console.error('Payment initialization error:', error);
      res.status(500).json({ message: 'Payment initialization failed' });
    });

    paymentReq.write(params);
    paymentReq.end();

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify delivery subscription payment
router.get('/delivery-subscription/verify/:reference', businessAuth, async (req, res) => {
  try {
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${req.params.reference}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    };

    const verifyReq = https.request(options, verifyRes => {
      let data = '';

      verifyRes.on('data', (chunk) => {
        data += chunk;
      });

      verifyRes.on('end', async () => {
        try {
          const response = JSON.parse(data);

          if (response.data.status === 'success') {
            const { userId, plan, deliveries } = response.data.metadata;

            // Update user subscription
            const user = await User.findById(userId);
            if (!user) {
              return res.status(404).json({ message: 'User not found' });
            }

            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1);

            user.businessDetails.deliverySubscription = {
              plan,
              remainingDeliveries: deliveries,
              startDate,
              endDate,
              lastPaymentReference: req.params.reference
            };

            await user.save();

            // Create payment record
            await Payment.create({
              type: 'DELIVERY_SUBSCRIPTION',
              transactionReference: req.params.reference,
              amount: response.data.amount / 100,
              status: 'SUCCESS',
              paymentDetails: {
                channel: response.data.channel,
                cardType: response.data.authorization?.card_type,
                last4: response.data.authorization?.last4,
                bank: response.data.authorization?.bank,
                countryCode: response.data.authorization?.country_code,
                brand: response.data.authorization?.brand,
                authorization: response.data.authorization
              },
              metadata: {
                customerEmail: response.data.customer.email,
                customerName: response.data.customer.name,
                phoneNumber: response.data.customer.phone
              },
              paidAt: new Date()
            });

            res.json({
              message: "Subscription activated successfully",
              subscription: user.businessDetails.deliverySubscription
            });
          } else {
            res.status(400).json({
              message: "Payment verification failed",
              details: response.data.gateway_response
            });
          }
        } catch (error) {
          console.error('Verification processing error:', error);
          res.status(500).json({ message: error.message });
        }
      });
    });

    verifyReq.on('error', error => {
      console.error('Verification request error:', error);
      res.status(500).json({ message: error.message });
    });

    verifyReq.end();
  } catch (error) {
    console.error('Verification endpoint error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get subscription status
router.get('/delivery-subscription', businessAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      subscription: user.businessDetails.deliverySubscription,
      plans: DELIVERY_SUBSCRIPTION_PLANS
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update store opening hours
router.put('/store/hours', businessAuth, async (req, res) => {
  try {
    const { openingHours } = req.body;
    
    console.log('Received opening hours update:', openingHours);

    const store = await Store.findOne({ owner: req.user._id });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    store.openingHours = openingHours;
    await store.save();

    console.log('Saved opening hours:', store.openingHours);

    res.json({
      message: 'Store hours updated successfully',
      store: {
        openingHours: store.openingHours
      }
    });

  } catch (error) {
    console.error('Hours update error:', error);
    res.status(500).json({ 
      message: 'Failed to update store hours',
      details: error.message
    });
  }
});

export default router;



















































