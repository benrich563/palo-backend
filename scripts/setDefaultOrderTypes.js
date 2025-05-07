import mongoose from 'mongoose';
import Order from '../models/Order.js';
import dotenv from 'dotenv';

dotenv.config();

async function setDefaultOrderTypes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const result = await Order.updateMany(
      { type: { $exists: false } },
      { $set: { type: 'DELIVERY' } }
    );

    console.log(`Updated ${result.modifiedCount} orders`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

setDefaultOrderTypes();