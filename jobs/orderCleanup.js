import cron from 'node-cron';
import Order from '../models/Order';

// Run every hour
export const startOrderCleanupJob = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Find and cancel unpaid orders older than 2 days
      const expiredOrders = await Order.find({
        createdAt: { $lt: twoDaysAgo },
        paymentStatus: 'PENDING_PAYMENT',
        status: { $nin: ['CANCELLED', 'DELIVERED'] }
      });

      for (const order of expiredOrders) {
        await Order.findByIdAndUpdate(order._id, {
          status: 'CANCELLED',
          processingStatus: 'CANCELLED',
          cancellationReason: 'Payment timeout - Order expired',
          'timestamps.cancelled': new Date()
        });

        // Emit socket event for real-time updates
        const io = global.io;
        if (io) {
          io.emit(`order_${order._id}`, {
            type: 'ORDER_CANCELLED',
            reason: 'Payment timeout'
          });
        }
      }

      console.log(`Cleaned up ${expiredOrders.length} expired orders`);
    } catch (error) {
      console.error('Order cleanup job failed:', error);
    }
  });
};
