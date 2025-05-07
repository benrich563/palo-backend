export const validateCoordinates = (req, res, next) => {
  const { pickupLocation, deliveryLocation } = req.body;

  // Transform coordinates to correct format
  const transformCoordinates = (location) => {
    if (!location) return null;

    // Handle {coordinates: {lat, lng}} format
    if (location?.coordinates?.lat !== undefined && location?.coordinates?.lng !== undefined) {
      return {
        address: location.address,
        coordinates: [location.coordinates.lng, location.coordinates.lat] // Convert to [longitude, latitude]
      };
    }

    // Handle direct {lat, lng} format
    if (location?.lat !== undefined && location?.lng !== undefined) {
      return {
        address: location.address,
        coordinates: [location.lng, location.lat] // Convert to [longitude, latitude]
      };
    }

    // Handle GeoJSON Point format
    if (location?.type === 'Point' && Array.isArray(location?.coordinates)) {
      return {
        address: location.address,
        coordinates: location.coordinates
      };
    }

    // If already in [longitude, latitude] format, return as is
    if (Array.isArray(location?.coordinates) && location.coordinates.length === 2) {
      return location;
    }

    return null;
  };

  // For errands, we only need deliveryLocation
  if (deliveryLocation) {
    const transformedDelivery = transformCoordinates(deliveryLocation);
    if (!transformedDelivery?.coordinates) {
      return res.status(400).json({
        message: 'Invalid coordinates format. Expected either {lat, lng} or [longitude, latitude] format',
        details: 'Delivery location coordinates are invalid or missing'
      });
    }
    req.body.deliveryLocation = transformedDelivery;
  }

  // For orders/deliveries, we need both pickup and delivery
  if (pickupLocation) {
    const transformedPickup = transformCoordinates(pickupLocation);
    if (!transformedPickup?.coordinates) {
      return res.status(400).json({
        message: 'Invalid coordinates format. Expected either {lat, lng} or [longitude, latitude] format',
        details: 'Pickup location coordinates are invalid or missing'
      });
    }
    req.body.pickupLocation = transformedPickup;
  }

  next();
};
