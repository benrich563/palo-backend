import StoreReview from '../models/StoreReview';
import Order from '../models/Order';

export const createReview = async (req, res) => {
  try {
    const { orderId, rating, review, images } = req.body;
    const customerId = req.user._id;

    // Verify order exists and belongs to customer
    const order = await Order.findOne({
      _id: orderId,
      customer: customerId,
      status: 'DELIVERED'
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found or not eligible for review' });
    }

    // Check if review already exists
    const existingReview = await StoreReview.findOne({
      order: orderId,
      customer: customerId
    });

    if (existingReview) {
      return res.status(400).json({ message: 'Review already exists for this order' });
    }

    const newReview = await StoreReview.create({
      store: order.store,
      customer: customerId,
      order: orderId,
      rating,
      review,
      images: images || [],
      status: 'PENDING'
    });

    await newReview.populate('customer', 'name avatar');

    res.status(201).json(newReview);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStoreReviews = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { page = 1, limit = 10, sort = '-createdAt' } = req.query;

    const reviews = await StoreReview.find({
      store: storeId,
      status: 'APPROVED'
    })
      .populate('customer', 'name avatar')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StoreReview.countDocuments({
      store: storeId,
      status: 'APPROVED'
    });

    const stats = await StoreReview.aggregate([
      { $match: { store: mongoose.Types.ObjectId(storeId), status: 'APPROVED' } },
      { 
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratings: {
            $push: '$rating'
          }
        }
      },
      {
        $project: {
          _id: 0,
          averageRating: 1,
          totalReviews: 1,
          ratingDistribution: {
            5: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 5] } } } },
            4: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 4] } } } },
            3: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 3] } } } },
            2: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 2] } } } },
            1: { $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', 1] } } } }
          }
        }
      }
    ]);

    res.json({
      reviews,
      total,
      stats: stats[0] || {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const replyToReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { content } = req.body;
    const businessId = req.user.businessId;

    const review = await StoreReview.findOne({
      _id: reviewId,
      store: businessId
    });

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    review.reply = {
      content,
      timestamp: new Date()
    };

    await review.save();
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};