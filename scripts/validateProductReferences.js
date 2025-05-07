import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Product from '../models/Product.js';
import Store from '../models/Store.js';

dotenv.config();

async function logToFile(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logDir = path.join(process.cwd(), 'logs');
  const logFile = path.join(logDir, 'product-validation.log');

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage);

  // Also log to console
  console.log(logMessage);
}

async function validateProductReferences() {
  try {
    await logToFile('Starting product validation');
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    await logToFile('Connected to MongoDB');

    const invalidProducts = await Product.aggregate([
      {
        $lookup: {
          from: 'stores',
          localField: 'store',
          foreignField: '_id',
          as: 'storeData'
        }
      },
      {
        $match: {
          $or: [
            { storeData: { $size: 0 } },
            { 
              $expr: {
                $and: [
                  { $gt: [{ $size: '$storeData' }, 0] },
                  { $ne: ['$status', { $cond: [{ $eq: [{ $arrayElemAt: ['$storeData.status', 0] }, 'ACTIVE'] }, 'ACTIVE', 'INACTIVE'] }] }
                ]
              }
            }
          ]
        }
      }
    ]);

    await logToFile(`Found ${invalidProducts.length} products with issues`);

    const result = await Product.fixStoreReferences();

    await logToFile('Validation Summary:');
    await logToFile(`Total products checked: ${await Product.countDocuments()}`);
    await logToFile(`Products updated: ${result.updated}`);
    await logToFile(`Errors encountered: ${result.errors}`);

    if (result.errors > 0) {
      await logToFile(`${result.errors} errors encountered during validation`, 'error');
    }

  } catch (error) {
    await logToFile(`Validation failed: ${error.message}`, 'error');
    await logToFile(error.stack, 'error');
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    await logToFile('Disconnected from MongoDB');
    process.exit(0);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  await logToFile(`Uncaught Exception: ${error.message}`, 'error');
  await logToFile(error.stack, 'error');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (error) => {
  await logToFile(`Unhandled Rejection: ${error.message}`, 'error');
  await logToFile(error.stack, 'error');
  process.exit(1);
});

validateProductReferences();
