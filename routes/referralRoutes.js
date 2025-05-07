import express from 'express';
import { auth } from '../middleware/auth.js';
import referralService from '../services/referralService.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Get user's referral code
router.get('/code', async (req, res) => {
  try {
    const result = await referralService.generateReferralCode(req.user._id);
    
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }
    
    res.json({ 
      referralCode: result.referralCode,
      referralLink: `${process.env.FRONTEND_URL}/register?ref=${result.referralCode}`
    });
  } catch (error) {
    console.error('Get referral code error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get referral statistics
router.get('/stats', async (req, res) => {
  try {
    const result = await referralService.getReferralStats(req.user._id);
    
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }
    
    res.json({
      referralCode: result.referralCode,
      referralLink: `${process.env.FRONTEND_URL}/register?ref=${result.referralCode}`,
      stats: {
        totalReferrals: result.totalReferrals,
        pendingReferrals: result.pendingReferrals,
        completedReferrals: result.completedReferrals,
        totalEarned: result.totalEarned,
        users: result.users,
        vendors: result.vendors,
        riders: result.riders
      }
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Process referral reward manually (for testing)
router.post('/process-reward', async (req, res) => {
  try {
    const { referredId, type } = req.body;
    
    if (!referredId || !type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const result = await referralService.awardReferralReward(req.user._id, type, referredId);
    
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }
    
    res.json({ message: 'Referral reward processed successfully' });
  } catch (error) {
    console.error('Process referral reward error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
