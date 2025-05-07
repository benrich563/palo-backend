import { calculateDistance } from './locationUtils.js';

// Base delivery fee configuration
export const BASE_FEE = 15; // Base fee in GHS
const PER_KM_RATE = 3; // Rate per kilometer in GHS
const MIN_FEE = 15; // Minimum delivery fee
const MAX_FEE = 100; // Maximum delivery fee
export const TRANSACTION_FEE = 0.025
export const MAX_DELIVERY_DISTANCE = 50; // Maximum delivery distance in km

// You'll need to set your business/hub location
const HUB_LOCATION = [-0.1870, 5.6037]; // [longitude, latitude]

// Helper function to normalize coordinates
const normalizeCoordinates = (coordinates) => {
  // Handle array format [longitude, latitude]
  if (Array.isArray(coordinates)) {
    return {
      lng: coordinates[0],
      lat: coordinates[1]
    };
  }
  
  // Handle {lat, lng} format
  if (coordinates.lat !== undefined && coordinates.lng !== undefined) {
    return coordinates;
  }

  // Handle coordinates object with coordinates array
  if (coordinates.coordinates && Array.isArray(coordinates.coordinates)) {
    return {
      lng: coordinates.coordinates[0],
      lat: coordinates.coordinates[1]
    };
  }

  throw new Error('Invalid coordinates format');
};

export const calculateDeliveryFees = (distance, packageDetails = {}, type = 'DELIVERY') => {
  try {
    // Calculate base fee
    const baseFee = BASE_FEE;
    
    // Calculate distance fee
    let distanceFee = distance * PER_KM_RATE;
    
    // Calculate package-specific fees
    let packageFee = 0;
    if (packageDetails.express) {
      packageFee += 15; // Express delivery surcharge
    }
    if (packageDetails.fragile) {
      packageFee += 10; // Fragile items handling fee
    }
    if (packageDetails.weight > 5) {
      packageFee += (packageDetails.weight - 5) * 2; // Additional charge per kg over 5kg
    }

    // Calculate subtotal before service fee
    let subtotal = baseFee + distanceFee + packageFee;

    // Calculate service fee based on type
    const transactionFee = type === 'ERRAND' ? 30 : subtotal * TRANSACTION_FEE; // 1% of subtotal for delivery

    // Calculate total fee including service fee
    let total = subtotal + transactionFee;

    // Apply minimum and maximum constraints
    total = Math.max(MIN_FEE, Math.min(total, MAX_FEE));

    // Round all fees to 2 decimal places
    return {
      baseFee: Math.round(baseFee * 100) / 100,
      distanceFee: Math.round(distanceFee * 100) / 100,
      packageFee: Math.round(packageFee * 100) / 100,
      transactionFee: Math.round(transactionFee * 100) / 100,
      distance: Math.round(distance * 10) / 10, // Round distance to 1 decimal place
      total: Math.round(total * 100) / 100
    };
  } catch (error) {
    console.error('Error calculating delivery fee:', error);
    throw error;
  }
};

// Calculate package-specific fees
export const calculatePackageFee = (packageDetails) => {
  let fee = 0;

  if (packageDetails.fragile) {
    fee += 10; // Fragile items handling fee
  }

  if (packageDetails.express) {
    fee += 15; // Express delivery surcharge
  }

  // Weight-based charges
  if (packageDetails.weight > 5) {
    fee += (packageDetails.weight - 5) * 2;
  }

  return fee;
};






