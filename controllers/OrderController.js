import Order from '../models/Order.js';

class OrderController {
  static async getCleanupStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      const order = await Order.findById(orderId);
      
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      const createdDate = new Date(order.createdAt);
      const expiryDate = new Date(createdDate.getTime() + (2 * 24 * 60 * 60 * 1000));
      const now = new Date();
      
      return res.json({
        willBeDeleted: order.paymentStatus === 'PENDING_PAYMENT',
        expiryDate,
        expired: now > expiryDate
      });
    } catch (error) {
      next(error);
    }
  }
}

export default OrderController;


