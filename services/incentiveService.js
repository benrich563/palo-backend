import Rider from '../models/Rider.js';
import Order from '../models/Order.js';

// Point values for different actions
const INCENTIVE_POINTS = {
  COMPLETED_DELIVERY: 10,
  COMPLETED_EXPRESS: 15,
  FIVE_STAR_RATING: 5,
  CONSECUTIVE_DAYS: 20,
  PEAK_HOUR_DELIVERY: 5,
  WEEKEND_DELIVERY: 5
};

// Tier thresholds
const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 500,
  GOLD: 1500,
  PLATINUM: 5000
};

// Tier benefits (percentage bonus on rider fee)
const TIER_BENEFITS = {
  BRONZE: 0,
  SILVER: 5,  // 5% bonus
  GOLD: 10,   // 10% bonus
  PLATINUM: 15 // 15% bonus
};

// Award points for completed delivery
export const awardDeliveryPoints = async (riderId, orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order || order.status !== 'DELIVERED') {
      return { success: false, message: 'Order not eligible for points' };
    }

    let pointsToAward = INCENTIVE_POINTS.COMPLETED_DELIVERY;
    const bonusReasons = [];

    // Check for express delivery
    if (order.packageDetails?.express) {
      pointsToAward += INCENTIVE_POINTS.COMPLETED_EXPRESS;
      bonusReasons.push('Express delivery');
    }

    // Check for weekend delivery
    const deliveryDate = new Date(order.timestamps.delivered);
    const dayOfWeek = deliveryDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 = Sunday, 6 = Saturday
      pointsToAward += INCENTIVE_POINTS.WEEKEND_DELIVERY;
      bonusReasons.push('Weekend delivery');
    }

    // Check for peak hour delivery (5pm-8pm)
    const hour = deliveryDate.getHours();
    if (hour >= 17 && hour <= 20) {
      pointsToAward += INCENTIVE_POINTS.PEAK_HOUR_DELIVERY;
      bonusReasons.push('Peak hour delivery');
    }

    // Update rider's points
    const rider = await Rider.findByIdAndUpdate(
      riderId,
      {
        $inc: {
          'incentives.currentPoints': pointsToAward,
          'incentives.lifetimePoints': pointsToAward
        },
        $push: {
          'incentives.bonusHistory': {
            amount: pointsToAward,
            reason: `Delivery completed: ${bonusReasons.join(', ')}`,
            orderId: order._id,
            dateAwarded: new Date()
          }
        }
      },
      { new: true }
    );

    // Check and update tier if needed
    await updateRiderTier(riderId);

    return {
      success: true,
      pointsAwarded: pointsToAward,
      currentPoints: rider.incentives.currentPoints,
      bonusReasons
    };
  } catch (error) {
    console.error('Error awarding delivery points:', error);
    return { success: false, message: error.message };
  }
};

// Award points for good rating
export const awardRatingPoints = async (riderId, orderId, rating) => {
  if (rating < 5) return { success: false, message: 'Only 5-star ratings earn points' };

  try {
    const rider = await Rider.findByIdAndUpdate(
      riderId,
      {
        $inc: {
          'incentives.currentPoints': INCENTIVE_POINTS.FIVE_STAR_RATING,
          'incentives.lifetimePoints': INCENTIVE_POINTS.FIVE_STAR_RATING
        },
        $push: {
          'incentives.bonusHistory': {
            amount: INCENTIVE_POINTS.FIVE_STAR_RATING,
            reason: '5-star rating received',
            orderId,
            dateAwarded: new Date()
          }
        }
      },
      { new: true }
    );

    await updateRiderTier(riderId);

    return {
      success: true,
      pointsAwarded: INCENTIVE_POINTS.FIVE_STAR_RATING,
      currentPoints: rider.incentives.currentPoints
    };
  } catch (error) {
    console.error('Error awarding rating points:', error);
    return { success: false, message: error.message };
  }
};

// Update rider tier based on lifetime points
export const updateRiderTier = async (riderId) => {
  try {
    const rider = await Rider.findById(riderId);
    if (!rider) return { success: false, message: 'Rider not found' };

    const lifetimePoints = rider.incentives.lifetimePoints;
    let newTier = 'BRONZE';

    if (lifetimePoints >= TIER_THRESHOLDS.PLATINUM) {
      newTier = 'PLATINUM';
    } else if (lifetimePoints >= TIER_THRESHOLDS.GOLD) {
      newTier = 'GOLD';
    } else if (lifetimePoints >= TIER_THRESHOLDS.SILVER) {
      newTier = 'SILVER';
    }

    // Only update if tier has changed
    if (newTier !== rider.incentives.tier) {
      await Rider.findByIdAndUpdate(
        riderId,
        {
          'incentives.tier': newTier,
          $push: {
            'incentives.achievements': {
              name: `${newTier} Tier Achieved`,
              description: `Congratulations on reaching ${newTier} tier!`,
              pointsAwarded: 0,
              dateAwarded: new Date(),
              icon: 'trophy'
            }
          }
        }
      );

      return { success: true, newTier, previousTier: rider.incentives.tier };
    }

    return { success: true, noChange: true, currentTier: newTier };
  } catch (error) {
    console.error('Error updating rider tier:', error);
    return { success: false, message: error.message };
  }
};

// Calculate bonus amount based on rider tier
export const calculateTierBonus = (baseAmount, tier) => {
  const bonusPercentage = TIER_BENEFITS[tier] || 0;
  const bonusAmount = (baseAmount * bonusPercentage) / 100;
  return {
    bonusPercentage,
    bonusAmount,
    totalAmount: baseAmount + bonusAmount
  };
};

// Get rider incentive summary
export const getRiderIncentiveSummary = async (riderId) => {
  try {
    const rider = await Rider.findById(riderId)
      .select('incentives user')
      .populate('user', 'name');

    if (!rider) return { success: false, message: 'Rider not found' };

    // Get recent bonus history
    const recentBonuses = rider.incentives.bonusHistory
      .sort((a, b) => b.dateAwarded - a.dateAwarded)
      .slice(0, 10);

    // Calculate next tier progress
    let nextTier = null;
    let pointsToNextTier = 0;
    let nextTierProgress = 100;

    if (rider.incentives.tier !== 'PLATINUM') {
      if (rider.incentives.tier === 'BRONZE') {
        nextTier = 'SILVER';
        pointsToNextTier = TIER_THRESHOLDS.SILVER - rider.incentives.lifetimePoints;
        nextTierProgress = (rider.incentives.lifetimePoints / TIER_THRESHOLDS.SILVER) * 100;
      } else if (rider.incentives.tier === 'SILVER') {
        nextTier = 'GOLD';
        pointsToNextTier = TIER_THRESHOLDS.GOLD - rider.incentives.lifetimePoints;
        nextTierProgress = ((rider.incentives.lifetimePoints - TIER_THRESHOLDS.SILVER) / 
                          (TIER_THRESHOLDS.GOLD - TIER_THRESHOLDS.SILVER)) * 100;
      } else if (rider.incentives.tier === 'GOLD') {
        nextTier = 'PLATINUM';
        pointsToNextTier = TIER_THRESHOLDS.PLATINUM - rider.incentives.lifetimePoints;
        nextTierProgress = ((rider.incentives.lifetimePoints - TIER_THRESHOLDS.GOLD) / 
                          (TIER_THRESHOLDS.PLATINUM - TIER_THRESHOLDS.GOLD)) * 100;
      }
    }

    return {
      success: true,
      riderName: rider.user.name,
      currentPoints: rider.incentives.currentPoints,
      lifetimePoints: rider.incentives.lifetimePoints,
      currentTier: rider.incentives.tier,
      tierBenefit: `${TIER_BENEFITS[rider.incentives.tier]}% bonus on delivery fees`,
      nextTier,
      pointsToNextTier,
      nextTierProgress: Math.min(Math.round(nextTierProgress), 100),
      recentBonuses,
      achievements: rider.incentives.achievements
    };
  } catch (error) {
    console.error('Error getting rider incentive summary:', error);
    return { success: false, message: error.message };
  }
};

export default {
  awardDeliveryPoints,
  awardRatingPoints,
  updateRiderTier,
  calculateTierBonus,
  getRiderIncentiveSummary
};