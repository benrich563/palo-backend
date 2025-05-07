import express from 'express';
import { auth, multipleRoles } from '../middleware/auth.js';
import { validateCoordinates } from '../middleware/validateCoordinates.js';
import { calculateDistance } from '../utils/locationUtils.js';
import { BASE_FEE, calculateDeliveryFees, MAX_DELIVERY_DISTANCE } from '../utils/feeCalculator.js';
import Order from '../models/Order.js';
import Errand from '../models/Errand.js';
import OrderController from '../controllers/OrderController.js';
import Store from '../models/Store.js';
import incentiveService from '../services/incentiveService.js';

const router = express.Router();

// Define HUB_LOCATION constant
const HUB_LOCATION = {
  coordinates: [
    -0.1870, // longitude
    5.6037   // latitude
  ]
};

// Add this new route
router.get('/:orderId/cleanup-status', auth, OrderController.getCleanupStatus);

// Public route for tracking (no auth required)
router.get('/:id/track', async (req, res) => {
  try {
    // Try to find regular order first
    let order = await Order.findById(req.params.id)
      .select('status timestamps rider pickupLocation deliveryLocation item packageDetails')
      .populate('rider', 'name phone currentLocation');

    let orderType = 'DELIVERY';

    // If not found, try to find errand
    if (!order) {
      order = await Errand.findById(req.params.id)
        .select('status timestamps rider location service details')
        .populate('rider', 'name phone currentLocation');

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      orderType = 'ERRAND';
    }

    // Status progress mapping for both types
    const statusProgress = {
      'PENDING': 0,
      'ASSIGNED': 25,
      'ACCEPTED': 25,
      'PICKED_UP': 50,
      'SHOPPING': 50, // Errand specific
      'IN_TRANSIT': 75,
      'DELIVERED': 100,
      'CANCELLED': 0
    };

    // Calculate ETA based on order type
    let eta = null;
    if (order.rider && order.status !== 'DELIVERED' && order.status !== 'CANCELLED') {
      const riderLocation = order.rider.currentLocation;
      let targetLocation;

      if (orderType === 'DELIVERY') {
        targetLocation = order.status === 'ASSIGNED' ? order.pickupLocation : order.deliveryLocation;
      } else {
        targetLocation = order.location; // Errand delivery location
      }

      const remainingDistance = calculateDistance(
        riderLocation?.coordinates || [riderLocation.lng, riderLocation.lat],
        targetLocation?.coordinates || [targetLocation.lng, targetLocation.lat]
      );

      const AVERAGE_SPEED = 30;
      eta = Math.round((remainingDistance / AVERAGE_SPEED) * 60);
    }

    const trackingData = {
      order: {
        _id: order._id,
        type: orderType,
        status: order.status,
        timestamps: order.timestamps,
        ...(orderType === 'DELIVERY' ? {
          item: order.item,
          packageDetails: order.packageDetails,
          pickupLocation: order.pickupLocation,
          deliveryLocation: order.deliveryLocation,
        } : {
          service: order.service,
          details: order.details,
          location: order.location,
        }),
        rider: order.rider ? {
          name: order.rider.name,
          phone: order.rider.phone,
          currentLocation: order.rider.currentLocation
        } : null
      },
      progress: statusProgress[order.status] || 0,
      eta: eta
    };

    res.json(trackingData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Protected routes
router.post('/', auth, async (req, res) => {
  try {
    const { type, deliveryLocation, pickupLocation, packageDetails, items, store } = req.body;

    // Validate coordinates
    const validateLocation = (location) => {
      if (!location?.coordinates?.lat || !location?.coordinates?.lng) {
        throw new Error('Invalid coordinates. Both latitude and longitude are required.');
      }
      return {
        address: location.address,
        type: 'Point',
        coordinates: [location.coordinates.lng, location.coordinates.lat]
      };
    };

    let orderLocations = {};
    let distance;

    // Handle different order types
    if (type === 'SHOPPING') {
      // Get store location from the store data
      const storeData = await Store.findById(store?._id);
      if (!storeData) {
        return res.status(400).json({
          message: 'Store information not found'
        });
      }

      orderLocations = {
        pickupLocation: {
          address: storeData?.address?.address || '',
          type: 'Point',
          coordinates: storeData.location.coordinates
        },
        deliveryLocation: validateLocation(deliveryLocation)
      };

      // Calculate distance from store to delivery location
      distance = calculateDistance(
        orderLocations.pickupLocation.coordinates,
        orderLocations.deliveryLocation.coordinates
      );

      // Calculate fee breakdown for shopping orders
      const feeBreakdown = calculateDeliveryFees(distance, {
        weight: 0, // Default weight
        fragile: false, // Default fragile status
        express: false // Default express status
      }, type);

      // Add commission calculations
      feeBreakdown.platformCommission = feeBreakdown.total * 0.20; // 20%
      feeBreakdown.riderFee = feeBreakdown.total * 0.80; // 80%

      // Create order data structure for shopping orders
      const orderData = {
        type,
        user: req.user._id,
        ...orderLocations,
        packageDetails: {
          items: items || [], // Array of items being purchased
          fragile: false,
          express: false,
          dimensions: {
            length: 0,
            width: 0,
            height: 0,
            weight: 0
          }
        },
        recipientPhone: req.user.phone,
        specialInstructions: req.body.specialInstructions || '',
        status: 'PENDING',
        paymentStatus: 'PENDING_PAYMENT',
        deliveryFee: feeBreakdown.total,
        feeBreakdown: feeBreakdown,
        timestamps: {
          created: new Date()
        },
        store: store._id
      };

      const order = new Order(orderData);
      await order.save();

      console.log('Created order:', order); // Add this log

      return res.status(201).json({
        message: 'Order created successfully',
        orderNumber: order._id.toString(), // Explicitly convert to string
        order: order
      });
    } else if (type === 'DELIVERY') {
      if (!pickupLocation) {
        return res.status(400).json({
          message: 'Pickup location is required for delivery orders'
        });
      }
      orderLocations = {
        pickupLocation: validateLocation(pickupLocation),
        deliveryLocation: validateLocation(deliveryLocation)
      };

      // Calculate distance for delivery orders
      distance = calculateDistance(
        orderLocations.pickupLocation.coordinates,
        orderLocations.deliveryLocation.coordinates
      );
    } else {
      // For ERRAND, we only need delivery location
      orderLocations = {
        deliveryLocation: validateLocation(deliveryLocation)
      };

      // Calculate distance from hub for errands
      distance = calculateDistance(
        HUB_LOCATION.coordinates,
        orderLocations.deliveryLocation.coordinates
      );
    }

    if (distance > MAX_DELIVERY_DISTANCE) {
      // For shopping orders beyond max distance, set fixed delivery fee
      if (type === 'SHOPPING') {
        //calculate items total
        const itemsTotal = packageDetails?.items?.reduce((sum, item) => sum + (item.quantity * item.price), 0)
        const packageFee = packageDetails.fragile ? 10 : 0;
        const total = itemsTotal + BASE_FEE + packageFee;

        const fixedFeeBreakdown = {
          baseFee: BASE_FEE, // Fixed base fee for long distance
          distanceFee: 0,
          packageFee,
          distance: distance,
          total,
          transactionFee: Math.round((total * TRANSACTION_FEE) * 100) / 100,
          deliveryFee: 30,
          subTotal: itemsTotal
        };

        // Add commission calculations
        fixedFeeBreakdown.platformCommission = fixedFeeBreakdown.total * 0.20; // 20%
        fixedFeeBreakdown.riderFee = fixedFeeBreakdown.total * 0.80; // 80%

        // Modified orderData structure for shopping orders
        const orderData = {
          type,
          user: req.user._id,
          ...orderLocations,
          packageDetails: {
            items, // Array of items being purchased
            fragile: false,
            express: false,
            dimensions: {}
          },
          recipientPhone: req.user.phone,
          specialInstructions: req.body.specialInstructions || '',
          status: 'PENDING',
          paymentStatus: 'PENDING_PAYMENT',
          deliveryFee: fixedFeeBreakdown.total,
          feeBreakdown: fixedFeeBreakdown,
          timestamps: {
            created: new Date()
          },
          store: store._id // Add store reference
        };

        const order = new Order(orderData);
        await order.save();

        return res.status(201).json({
          message: 'Order created successfully with fixed delivery fee',
          order: order
        });
      } else {
        return res.status(400).json({
          message: `Distance (${distance.toFixed(1)}km) exceeds maximum delivery range of ${MAX_DELIVERY_DISTANCE}km`
        });
      }
    }

    const feeBreakdown = calculateDeliveryFees(distance, {
      weight: packageDetails.dimensions?.weight || 0,
      fragile: packageDetails.fragile || false,
      express: packageDetails.express || false
    }, type);

    // Prepare order data
    const orderData = {
      type,
      user: req.user._id,
      ...orderLocations, // Spread the validated locations
      item: {
        name: req.body.item.name,
        description: req.body.item.description
      },
      packageDetails,
      senderPhone: req.body.senderPhone,
      recipientPhone: req.body.recipientPhone,
      specialInstructions: req.body.specialInstructions || '',
      status: 'PENDING',
      paymentStatus: 'PENDING_PAYMENT',
      deliveryFee: feeBreakdown.total,
      feeBreakdown: {
        ...feeBreakdown,
        platformCommission: feeBreakdown.total * 0.20, // 20% platform commission
        riderFee: feeBreakdown.total * 0.80 // 80% rider fee
      },
      timestamps: {
        created: new Date()
      }
    };

    const order = new Order(orderData);
    await order.save();

    res.status(201).json({
      message: 'Order created successfully',
      order: order
    });

  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({
      message: 'Failed to create order',
      error: error.message
    });
  }
});

router.get('/', multipleRoles('individual', 'business', 'admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      type,
      startDate,
      endDate,
      sortBy = 'timestamps.created',
      sortOrder = 'desc'
    } = req.query;

    // Base query
    const query = {};

    // Add user-specific filtering
    if (req.user.role === 'user') {
      query.userId = req.user._id;
    } else if (req.user.role === 'business') {
      query.businessId = req.user._id;
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Date range filter
    if (startDate && endDate) {
      query['timestamps.created'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Search functionality
    if (search) {
      query.$or = [
        { 'item.name': { $regex: search, $options: 'i' } },
        { 'pickupLocation.address': { $regex: search, $options: 'i' } },
        { 'deliveryLocation.address': { $regex: search, $options: 'i' } },
        { orderId: { $regex: search, $options: 'i' } }
      ];
    }

    // Get delivery orders
    const deliveryOrders = await Order.find(query)
      .populate('rider', 'name phone currentLocation')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .lean();

    // Get errand orders with the same filters
    const errandQuery = {
      ...query,
      userId: query.userId, // Maintain user filtering
      ...(search && {
        $or: [
          { service: { $regex: search, $options: 'i' } },
          { 'deliveryLocation.address': { $regex: search, $options: 'i' } },
          { orderId: { $regex: search, $options: 'i' } }
        ]
      })
    };

    const errandOrders = await Errand.find(errandQuery)
      .populate('rider', 'name phone currentLocation')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
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

    // Filter by type if specified
    if (type) {
      combinedOrders = combinedOrders.filter(order => order.type === type.toUpperCase());
    }

    // Sort combined orders
    combinedOrders.sort((a, b) => {
      const dateA = new Date(a.timestamps?.created || a.createdAt);
      const dateB = new Date(b.timestamps?.created || b.createdAt);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    // Apply pagination
    const total = combinedOrders.length;
    const paginatedOrders = combinedOrders.slice((page - 1) * limit, page * limit);

    res.json({
      orders: paginatedOrders,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalOrders: total,
      filters: {
        status,
        type,
        search,
        startDate,
        endDate,
        sortBy,
        sortOrder
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch orders'
    });
  }
});

// Get order tracking information
router.get('/:id', async (req, res) => {
  try {
    // First try to find as regular order
    let order = await Order.findById(req.params.id)
      .select('status timestamps rider pickupLocation deliveryLocation item packageDetails type feeBreakdown')
      .populate({
        path: 'rider',
        select: 'location user',
        populate: {
          path: 'user',
          select: 'name phone'
        }
      });

    // If not found as order, try to find as errand
    if (!order) {
      const errand = await Errand.findById(req.params.id)
        .populate({
          path: 'rider',
          select: 'location user',
          populate: {
            path: 'user',
            select: 'name phone'
          }
        });

      if (!errand) {
        return res.status(404).json({ message: 'Order or errand not found' });
      }


      let eta = null;
      if (errand.rider?.location) {
        const riderLocation = {
          lat: errand.rider.location.coordinates[1],
          lng: errand.rider.location.coordinates[0]
        };

        const deliveryLocation = {
          lat: errand.deliveryLocation.coordinates[1],
          lng: errand.deliveryLocation.coordinates[0]
        };

        // For errands, calculate distance from rider to delivery location
        const distance = calculateDistance(riderLocation, deliveryLocation);
        const AVERAGE_SPEED = 30; // km/h
        eta = Math.round((distance / AVERAGE_SPEED) * 60); // minutes
      }

      return res.json({
        ...errand.toObject(),
        eta,
        rider: errand.rider ? {
          _id: errand.rider._id,
          name: errand.rider.user.name,
          phone: errand.rider.user.phone,
          location: errand.rider.location
        } : null
      });
    }

    // Handle regular order tracking
    let eta = null;
    if (order.rider?.location) {
      const riderLocation = {
        lat: order.rider.location.coordinates[1],
        lng: order.rider.location.coordinates[0]
      };

      const destination = order.status === 'PICKED_UP' ? {
        lat: order.deliveryLocation.coordinates[1],
        lng: order.deliveryLocation.coordinates[0]
      } : {
        lat: order.pickupLocation.coordinates[1],
        lng: order.pickupLocation.coordinates[0]
      };

      const distance = calculateDistance(riderLocation, destination);
      const AVERAGE_SPEED = 30; // km/h
      eta = Math.round((distance / AVERAGE_SPEED) * 60); // minutes
    }

    return res.json({
      ...order.toObject(),
      eta,
      rider: order.rider ? {
        _id: order.rider._id,
        name: order.rider.user.name,
        phone: order.rider.user.phone,
        location: order.rider.location
      } : null
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update order status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Update order status
    order.status = status;
    
    // If status is DELIVERED, update the delivered timestamp and award points
    if (status === 'DELIVERED') {
      order.timestamps.delivered = new Date();
      
      // Save order first
      await order.save();
      
      // Award incentive points if there's a rider
      if (order.rider) {
        const incentiveResult = await incentiveService.awardDeliveryPoints(
          order.rider, 
          order._id
        );
        
        // Apply tier bonus to rider fee if applicable
        const rider = await Rider.findById(order.rider);
        if (rider && rider.incentives && rider.incentives.tier) {
          const tierBonus = incentiveService.calculateTierBonus(
            order.feeBreakdown.riderFee,
            rider.incentives.tier
          );
          
          // Update order with bonus amount
          if (tierBonus.bonusAmount > 0) {
            order.feeBreakdown.tierBonus = tierBonus.bonusAmount;
            order.feeBreakdown.riderFeeWithBonus = tierBonus.totalAmount;
            await order.save();
          }
        }
        
        return res.json({ 
          order, 
          incentive: incentiveResult.success ? incentiveResult : null 
        });
      }
      
      return res.json({ order });
    }
    
    await order.save();
    res.json({ order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Calculate delivery fee
router.post('/calculate-fee', [auth, validateCoordinates], async (req, res) => {
  try {
    const { pickupLocation, deliveryLocation, packageDetails, type } = req.body;

    // Validate required inputs
    if (!pickupLocation?.coordinates || !deliveryLocation?.coordinates) {
      return res.status(400).json({
        message: 'Invalid coordinates provided'
      });
    }

    // Validate package details
    if (!packageDetails) {
      return res.status(400).json({
        message: 'Package details are required'
      });
    }

    // Ensure boolean values are properly set
    const validatedPackageDetails = {
      ...packageDetails,
      fragile: Boolean(packageDetails.fragile),
      express: Boolean(packageDetails.express),
      weight: Number(packageDetails.weight) || 0
    };

    // Calculate distance between pickup and delivery locations
    const distance = calculateDistance(
      pickupLocation.coordinates,
      deliveryLocation.coordinates
    );

    if (typeof distance !== 'number' || isNaN(distance)) {
      return res.status(400).json({
        message: 'Invalid distance calculation'
      });
    }

    if (distance > MAX_DELIVERY_DISTANCE) {
      return res.status(400).json({
        message: 'Distance exceeds maximum delivery range',
        details: `Maximum delivery distance is ${MAX_DELIVERY_DISTANCE}km`
      });
    }

    const feeBreakdown = calculateDeliveryFees(distance, validatedPackageDetails, type);

    res.json({
      distance,
      breakdown: feeBreakdown
    });

  } catch (error) {
    console.error('Fee calculation error:', error);
    res.status(500).json({
      message: error.message || 'Error calculating delivery fee'
    });
  }
});

export default router;

































