export const findAvailableRiders = async (orderType, location) => {
  const maxDistance = orderType === 'ERRAND' ? 5000 : 3000; // Meters
  
  const riders = await Rider.find({
    status: 'AVAILABLE',
    currentLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [location.coordinates[0], location.coordinates[1]]
        },
        $maxDistance: maxDistance
      }
    },
    ...(orderType === 'ERRAND' ? {
      'preferences.errandEnabled': true,
      'verification.isVerified': true
    } : {})
  }).populate('user', 'name phone');

  return riders;
};

export const assignRider = async (orderId, orderType) => {
  const order = orderType === 'ERRAND' 
    ? await Errand.findById(orderId)
    : await Order.findById(orderId);

  if (!order) throw new Error('Order not found');

  const location = orderType === 'ERRAND' 
    ? order.location 
    : order.pickupLocation;

  const riders = await findAvailableRiders(orderType, location);
  // ... rest of assignment logic
};