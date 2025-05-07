import { withTransaction } from '../utils/transactionWrapper.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

export const createOrder = async (orderData) => {
  return await withTransaction(async (session) => {
    const sessionOptions = session ? { session } : {};
    
    // Create order
    const order = await Order.create([orderData], sessionOptions);
    
    // Update product inventory
    for (const item of orderData.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { inventory: -item.quantity } },
        sessionOptions
      );
    }
    
    return order[0]; // Return the created order
  });
};

export const refundOrder = async (orderId) => {
  return await withTransaction(async (session) => {
    const sessionOptions = session ? { session } : {};
    
    const order = await Order.findById(orderId, null, sessionOptions);
    if (!order) throw new Error('Order not found');
    
    // Restore inventory
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { inventory: item.quantity } },
        sessionOptions
      );
    }
    
    // Update order status
    order.status = 'refunded';
    await order.save(sessionOptions);
    
    return order;
  });
};
