/**
 * Calculate distance between two points using Haversine formula
 * @param {Object|Array} point1 - {lat: number, lng: number} or [lng, lat] or {coordinates: {lat: number, lng: number}}
 * @param {Object|Array} point2 - {lat: number, lng: number} or [lng, lat] or {coordinates: {lat: number, lng: number}}
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (point1, point2) => {
  // Normalize points to {lat, lng} format
  const normalizePoint = (point) => {
    if (!point) return null;

    // Handle array format [lng, lat]
    if (Array.isArray(point)) {
      return { lat: point[1], lng: point[0] };
    }

    // Handle {coordinates: [lng, lat]} format from middleware
    if (Array.isArray(point.coordinates)) {
      return { lat: point.coordinates[1], lng: point.coordinates[0] };
    }

    // Handle {coordinates: {lat, lng}} format
    if (point.coordinates?.lat !== undefined && point.coordinates?.lng !== undefined) {
      return point.coordinates;
    }

    // Handle direct {lat, lng} format
    if (point.lat !== undefined && point.lng !== undefined) {
      return point;
    }

    return null;
  };

  const p1 = normalizePoint(point1);
  const p2 = normalizePoint(point2);

  // Validate normalized points
  if (!p1?.lat || !p1?.lng || !p2?.lat || !p2?.lng) {
    throw new Error('Invalid coordinates format. Expected {lat: number, lng: number} or [lng, lat] array');
  }

  const R = 6371; // Earth's radius in km
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;

  return distance;
};

/**
 * Convert degrees to radians
 * @param {number} degrees 
 * @returns {number} Radians
 */
const toRad = (degrees) => {
  return degrees * Math.PI / 180;
};



