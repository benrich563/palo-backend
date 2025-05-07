import express from 'express';
import { auth } from '../middleware/auth.js';
import { validateCoordinates } from '../middleware/validateCoordinates.js';
import { calculateDistance } from '../utils/locationUtils.js';
import Errand from '../models/Errand.js';

const router = express.Router();

// Constants for fee calculation
const BASE_SERVICE_FEE = 30.00;
const PER_KM_RATE = 2.50;
const MIN_DELIVERY_FEE = 15.00;
const MAX_DELIVERY_FEE = 100.00;
const MAX_DELIVERY_DISTANCE = 100; //50 Maximum delivery distance in km

// Helper function to calculate delivery fee
const calculateDeliveryFee = (distance) => {
  let fee = distance * PER_KM_RATE;
  
  // Apply minimum and maximum constraints
  fee = Math.max(MIN_DELIVERY_FEE, Math.min(fee, MAX_DELIVERY_FEE));
  
  // Round to 2 decimal places
  return Math.round(fee * 100) / 100;
};

// Calculate errand fees
router.post('/calculate-fee', [auth], async (req, res) => {
  try {
    const { deliveryLocation, items } = req.body;

    // Hub location (you should move this to environment variables)
    const HUB_LOCATION = {
      coordinates: {
        lat: 5.6037,
        lng: -0.1870
      }
    };

    // Calculate distance
    const distance = calculateDistance(
      HUB_LOCATION.coordinates,
      deliveryLocation.coordinates
    );

    // Validate delivery distance
    if (distance > MAX_DELIVERY_DISTANCE) {
      return res.status(400).json({
        message: `Delivery distance (${distance.toFixed(1)}km) exceeds maximum allowed distance of ${MAX_DELIVERY_DISTANCE}km`
      });
    }
    
    // Calculate estimated total of items
    const estimatedTotal = items.reduce((sum, item) => 
      sum + (item.estimatedPrice * item.quantity), 0);

    // Calculate delivery fee
    const deliveryFee = calculateDeliveryFee(distance);

    // Calculate total fees
    const fees = {
      estimatedTotal,
      serviceFee: BASE_SERVICE_FEE,
      deliveryFee, //ignore the calculation and lets set a base for now
      distance: Math.round(distance * 10) / 10, // Round to 1 decimal place
      total: estimatedTotal + BASE_SERVICE_FEE + deliveryFee
    };

    res.json(fees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create errand
router.post('/', [auth], async (req, res) => {
  try {
    const { deliveryLocation, items, notes } = req.body;

    // Calculate fees first
    const HUB_LOCATION = {
      coordinates: {
        lat: 5.6037,
        lng: -0.1870
      }
    };

    // Calculate distance
    const distance = calculateDistance(
      HUB_LOCATION.coordinates,
      deliveryLocation.coordinates
    );

    // Calculate estimated total of items
    const estimatedTotal = items.reduce((sum, item) => 
      sum + (item.estimatedPrice * item.quantity), 0);

    // Calculate delivery fee
    const deliveryFee = calculateDeliveryFee(distance);


    const total = estimatedTotal + BASE_SERVICE_FEE + deliveryFee
     

    // Calculate total fees
    const pricing = {
      estimatedTotal,
      serviceFee: BASE_SERVICE_FEE,
      deliveryFee,
      total,
      platformFee: 0.2 * total,
      riderFee: 0.8 * total
    };

    // Transform the coordinates for MongoDB
    const errandData = {
      user: req.user._id,
      deliveryLocation: {
        address: deliveryLocation.address,
        type: 'Point',
        coordinates: [
          deliveryLocation.coordinates.lng,
          deliveryLocation.coordinates.lat
        ]
      },
      items,
      notes,
      pricing, // Add pricing information
      timestamps: {
        created: new Date()
      }
    };

    const errand = new Errand(errandData);
    await errand.save();

    res.status(201).json(errand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user's errands
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;

    const errands = await Errand.find(query)
      .populate('rider', 'name phone location')
      .sort({ 'timestamps.created': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Errand.countDocuments(query);

    res.json({
      errands,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalErrands: total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single errand by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const errand = await Errand.findById(req.params.id)
      .populate('rider', 'name phone location');

    if (!errand) {
      return res.status(404).json({ message: 'Errand not found' });
    }

    // Verify the errand belongs to the requesting user
    if (errand.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this errand' });
    }

    res.json(errand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;


