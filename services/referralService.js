import User from '../models/User.js';
import Store from '../models/Store.js';
import Rider from '../models/Rider.js';
import crypto from 'crypto';

// Reward amounts
const REWARD_AMOUNTS = {
  USER_REFERRAL: 10, // GHC 10 for referring a user
  VENDOR_REFERRAL: 50, // GHC 50 for referring a vendor
  RIDER_REFERRAL: 25, // GHC 25 for referring a rider
  REFERRED_USER_BONUS: 5, // GHC 5 bonus for new users who were referred
  REFERRED_VENDOR_BONUS: 20, // GHC 20 bonus for new vendors who were referred
  REFERRED_RIDER_BONUS: 10 // GHC 10 bonus for new riders who were referred
};

// Generate a unique referral code
export const generateReferralCode = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // If user already has a referral code, return it
    if (user.referralCode) {
      return { success: true, referralCode: user.referralCode };
    }

    // Generate a new referral code based on user's name and random string
    let referralCode;
    let isUnique = false;

    while (!isUnique) {
      // Take first 3 characters of name (or less if name is shorter)
      const namePrefix = user.name.substring(0, 3).toUpperCase();
      // Generate 5 random alphanumeric characters
      const randomString = crypto.randomBytes(3).toString('hex').toUpperCase();
      referralCode = `${namePrefix}${randomString}`;

      // Check if code is unique
      const existingUser = await User.findOne({ referralCode });
      if (!existingUser) {
        isUnique = true;
      }
    }

    // Save the referral code to user
    user.referralCode = referralCode;
    await user.save();

    return { success: true, referralCode };
  } catch (error) {
    console.error('Error generating referral code:', error);
    return { success: false, message: error.message };
  }
};

// Process user referral
export const processUserReferral = async (newUserId, referralCode) => {
  try {
    if (!referralCode) {
      return { success: false, message: 'No referral code provided' };
    }

    // Find referring user
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return { success: false, message: 'Invalid referral code' };
    }

    // Update new user with referrer info
    const newUser = await User.findByIdAndUpdate(
      newUserId,
      { referredBy: referrer._id },
      { new: true }
    );

    // Add referral to referrer's list
    await User.findByIdAndUpdate(
      referrer._id,
      {
        $push: {
          'referrals.users': {
            user: newUserId,
            date: new Date(),
            rewarded: false
          }
        }
      }
    );

    return { 
      success: true, 
      message: 'Referral processed successfully',
      referrer: referrer._id
    };
  } catch (error) {
    console.error('Error processing user referral:', error);
    return { success: false, message: error.message };
  }
};

// Process vendor referral
export const processVendorReferral = async (storeId, referralCode) => {
  try {
    if (!referralCode) {
      return { success: false, message: 'No referral code provided' };
    }

    // Find referring user
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return { success: false, message: 'Invalid referral code' };
    }

    // Get store and owner info
    const store = await Store.findById(storeId).populate('owner');
    if (!store) {
      return { success: false, message: 'Store not found' };
    }

    // Update store owner with referrer info
    await User.findByIdAndUpdate(
      store.owner._id,
      { referredBy: referrer._id }
    );

    // Add referral to referrer's list
    await User.findByIdAndUpdate(
      referrer._id,
      {
        $push: {
          'referrals.vendors': {
            store: storeId,
            date: new Date(),
            rewarded: false
          }
        }
      }
    );

    return { 
      success: true, 
      message: 'Vendor referral processed successfully',
      referrer: referrer._id
    };
  } catch (error) {
    console.error('Error processing vendor referral:', error);
    return { success: false, message: error.message };
  }
};

// Process rider referral
export const processRiderReferral = async (riderId, referralCode) => {
  try {
    if (!referralCode) {
      return { success: false, message: 'No referral code provided' };
    }

    // Find referring user
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return { success: false, message: 'Invalid referral code' };
    }

    // Get rider and user info
    const rider = await Rider.findById(riderId).populate('user');
    if (!rider) {
      return { success: false, message: 'Rider not found' };
    }

    // Update rider's user with referrer info
    await User.findByIdAndUpdate(
      rider.user._id,
      { referredBy: referrer._id }
    );

    // Add referral to referrer's list
    await User.findByIdAndUpdate(
      referrer._id,
      {
        $push: {
          'referrals.riders': {
            rider: riderId,
            date: new Date(),
            rewarded: false
          }
        }
      }
    );

    return { 
      success: true, 
      message: 'Rider referral processed successfully',
      referrer: referrer._id
    };
  } catch (error) {
    console.error('Error processing rider referral:', error);
    return { success: false, message: error.message };
  }
};

// Award referral reward
export const awardReferralReward = async (userId, type, referredId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    let rewardAmount = 0;
    let description = '';

    switch (type) {
      case 'USER':
        rewardAmount = REWARD_AMOUNTS.USER_REFERRAL;
        description = `Reward for referring a new user`;
        
        // Mark the referral as rewarded
        await User.updateOne(
          { _id: userId, 'referrals.users.user': referredId },
          { $set: { 'referrals.users.$.rewarded': true } }
        );
        break;
        
      case 'VENDOR':
        rewardAmount = REWARD_AMOUNTS.VENDOR_REFERRAL;
        description = `Reward for referring a new vendor`;
        
        // Mark the referral as rewarded
        await User.updateOne(
          { _id: userId, 'referrals.vendors.store': referredId },
          { $set: { 'referrals.vendors.$.rewarded': true } }
        );
        break;
        
      case 'RIDER':
        rewardAmount = REWARD_AMOUNTS.RIDER_REFERRAL;
        description = `Reward for referring a new rider`;
        
        // Mark the referral as rewarded
        await User.updateOne(
          { _id: userId, 'referrals.riders.rider': referredId },
          { $set: { 'referrals.riders.$.rewarded': true } }
        );
        break;
        
      default:
        return { success: false, message: 'Invalid referral type' };
    }

    // Add reward to user's balance
    await User.findByIdAndUpdate(
      userId,
      {
        $inc: { 'rewards.balance': rewardAmount },
        $push: {
          'rewards.history': {
            amount: rewardAmount,
            type: 'REFERRAL_REWARD',
            description,
            date: new Date()
          }
        }
      }
    );

    return { 
      success: true, 
      message: 'Referral reward awarded successfully',
      rewardAmount
    };
  } catch (error) {
    console.error('Error awarding referral reward:', error);
    return { success: false, message: error.message };
  }
};

// Award bonus to referred user
export const awardReferredBonus = async (userId, type) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    let bonusAmount = 0;
    let description = '';

    switch (type) {
      case 'USER':
        bonusAmount = REWARD_AMOUNTS.REFERRED_USER_BONUS;
        description = 'Welcome bonus for joining via referral';
        break;
        
      case 'VENDOR':
        bonusAmount = REWARD_AMOUNTS.REFERRED_VENDOR_BONUS;
        description = 'Welcome bonus for registering your store via referral';
        break;
        
      case 'RIDER':
        bonusAmount = REWARD_AMOUNTS.REFERRED_RIDER_BONUS;
        description = 'Welcome bonus for joining as a rider via referral';
        break;
        
      default:
        return { success: false, message: 'Invalid referral type' };
    }

    // Add bonus to user's balance
    await User.findByIdAndUpdate(
      userId,
      {
        $inc: { 'rewards.balance': bonusAmount },
        $push: {
          'rewards.history': {
            amount: bonusAmount,
            type: 'REFERRAL_REWARD',
            description,
            date: new Date()
          }
        }
      }
    );

    return { 
      success: true, 
      message: 'Referral bonus awarded successfully',
      bonusAmount
    };
  } catch (error) {
    console.error('Error awarding referral bonus:', error);
    return { success: false, message: error.message };
  }
};

// Get user's referral stats
export const getReferralStats = async (userId) => {
  try {
    const user = await User.findById(userId)
      .populate('referrals.users.user', 'name email createdAt')
      .populate({
        path: 'referrals.vendors.store',
        select: 'name location createdAt',
        populate: {
          path: 'owner',
          select: 'name email'
        }
      })
      .populate({
        path: 'referrals.riders.rider',
        select: 'createdAt',
        populate: {
          path: 'user',
          select: 'name email'
        }
      });

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Generate referral code if user doesn't have one
    if (!user.referralCode) {
      const result = await generateReferralCode(userId);
      if (result.success) {
        user.referralCode = result.referralCode;
      }
    }

    // Calculate total rewards earned from referrals
    const referralRewards = user.rewards.history
      .filter(item => item.type === 'REFERRAL_REWARD')
      .reduce((total, item) => total + item.amount, 0);

    return {
      success: true,
      referralCode: user.referralCode,
      referralLink: `${process.env.FRONTEND_URL}/register?ref=${user.referralCode}`,
      stats: {
        totalReferrals: 
          user.referrals.users.length + 
          user.referrals.vendors.length + 
          user.referrals.riders.length,
        userReferrals: user.referrals.users.length,
        vendorReferrals: user.referrals.vendors.length,
        riderReferrals: user.referrals.riders.length,
        totalRewards: referralRewards,
        rewardsBalance: user.rewards.balance
      },
      recentReferrals: {
        users: user.referrals.users
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5)
          .map(ref => ({
            id: ref.user._id,
            name: ref.user.name,
            email: ref.user.email,
            date: ref.date,
            rewarded: ref.rewarded
          })),
        vendors: user.referrals.vendors
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5)
          .map(ref => ({
            id: ref.store._id,
            name: ref.store.name,
            ownerName: ref.store.owner.name,
            location: ref.store.location.address,
            date: ref.date,
            rewarded: ref.rewarded
          })),
        riders: user.referrals.riders
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5)
          .map(ref => ({
            id: ref.rider._id,
            name: ref.rider.user.name,
            email: ref.rider.user.email,
            date: ref.date,
            rewarded: ref.rewarded
          }))
      }
    };
  } catch (error) {
    console.error('Error getting referral stats:', error);
    return { success: false, message: error.message };
  }
};

// Redeem rewards balance
export const redeemRewards = async (userId, amount) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    if (user.rewards.balance < amount) {
      return { success: false, message: 'Insufficient rewards balance' };
    }

    // Deduct from rewards balance
    await User.findByIdAndUpdate(
      userId,
      {
        $inc: { 'rewards.balance': -amount },
        $push: {
          'rewards.history': {
            amount: -amount,
            type: 'REDEMPTION',
            description: 'Rewards balance redemption',
            date: new Date()
          }
        }
      }
    );

    // In a real app, you would process the payment to the user here
    // This could be a credit to their account, a mobile money transfer, etc.

    return { 
      success: true, 
      message: 'Rewards redeemed successfully',
      amount,
      remainingBalance: user.rewards.balance - amount
    };
  } catch (error) {
    console.error('Error redeeming rewards:', error);
    return { success: false, message: error.message };
  }
};

export default {
  generateReferralCode,
  processUserReferral,
  processVendorReferral,
  processRiderReferral,
  awardReferralReward,
  awardReferredBonus,
  getReferralStats,
  redeemRewards
};