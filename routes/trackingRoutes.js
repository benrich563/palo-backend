import express from 'express';
import Order from '../models/Order.js';
import Rider from '../models/Rider.js';
import { calculateDistance } from '../utils/locationUtils.js';
import { riderAuth } from '../middleware/auth.js';

const router = express.Router();

// Get order tracking information
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .select('status timestamps rider pickupLocation deliveryLocation')
      .populate({
        path: 'rider',
        select: 'location user',
        populate: {
          path: 'user',
          select: 'name phone'
        }
      });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Calculate ETA if rider is assigned
    let eta = null;
    if (order.rider && order.rider.location && order.status !== 'DELIVERED') {
      const destination = order.status === 'PICKED_UP' ? 
        order.deliveryLocation.coordinates : 
        order.pickupLocation.coordinates;
      
      const distance = calculateDistance(
        order.rider.location.coordinates,
        destination
      );
      
      // Assume average speed of 30 km/h
      const AVERAGE_SPEED = 30;
      eta = Math.round((distance / AVERAGE_SPEED) * 60); // minutes
    }

    res.json({
      ...order.toObject(),
      rider: order.rider ? {
        _id: order.rider._id,
        name: order.rider.user.name,
        phone: order.rider.user.phone,
        location: order.rider.location
      } : null,
      eta
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Update rider location
router.post('/rider-location', riderAuth, async (req, res) => {
  try {
    const { coordinates } = req.body;
    
    if (!coordinates || !Array.isArray(coordinates)) {
      return res.status(400).json({ message: 'Invalid location format' });
    }

    const rider = await Rider.findOneAndUpdate(
      { user: req.user._id },
      {
        $set: {
          'location.type': 'Point',
          'location.coordinates': coordinates,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' });
    }

    const io = req.app.get('io');

    // Get current orders for rider
    const currentOrders = await Order.find({
      rider: rider._id,
      status: { $nin: ['DELIVERED', 'CANCELLED'] }
    });

    // Emit location update for each active order
    if (currentOrders && currentOrders.length > 0) {
      currentOrders.forEach(order => {
        const destination = order.status === 'PICKED_UP' ? 
          order.deliveryLocation.coordinates : 
          order.pickupLocation.coordinates;
        
        const distance = calculateDistance(coordinates, destination);
        const AVERAGE_SPEED = 30; // km/h
        const eta = Math.round((distance / AVERAGE_SPEED) * 60);

        io.to(`order_${order._id}`).emit('locationUpdate', {
          location: coordinates,
          status: order.status,
          progress: calculateProgress(order.status),
          eta: `${eta} minutes`
        });
      });
    }

    // Broadcast to tracking room and admin dashboard
    io.emit('riderLocationUpdated', {
      riderId: rider._id,
      coordinates: coordinates,
      lastUpdated: new Date(),
      status: rider.status
    });

    res.json({ 
      message: 'Location updated successfully',
      location: {
        coordinates,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

function calculateProgress(status) {
  const statusProgress = {
    'PENDING': 0,
    'ASSIGNED': 25,
    'PICKED_UP': 50,
    'IN_TRANSIT': 75,
    'DELIVERED': 100
  };
  return statusProgress[status] || 0;
}

export default router;
