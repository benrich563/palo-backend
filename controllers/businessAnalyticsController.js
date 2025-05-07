import Product from '../models/Product';
import Order from '../models/Order';

export const getProductAnalytics = async (req, res) => {
  try {
    const { businessId } = req.user;
    const { timeframe = '30' } = req.query; // days
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeframe));

    const productMetrics = await Order.aggregate([
      {
        $match: {
          'timestamps.created': { $gte: startDate },
          status: { $in: ['DELIVERED', 'COMPLETED'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.productId',
          totalSales: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          averageRating: { $avg: '$items.rating' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $match: {
          'product.store': businessId
        }
      },
      {
        $project: {
          name: '$product.name',
          totalSales: 1,
          revenue: 1,
          averageRating: 1,
          stock: '$product.stock'
        }
      }
    ]);

    res.json({ productMetrics });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};