import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';

export const batchUpdateProducts = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { updates } = req.body;
    const results = {
      successful: [],
      failed: []
    };

    for (const update of updates) {
      try {
        const product = await Product.findById(update.productId);
        
        if (!product) {
          results.failed.push({
            productId: update.productId,
            error: 'Product not found'
          });
          continue;
        }

        // Track stock changes if any
        if (update.stock !== undefined && update.stock !== product.stock) {
          await StockMovement.create({
            product: product._id,
            store: product.store,
            type: 'ADJUSTMENT',
            quantity: update.stock - product.stock,
            previousStock: product.stock,
            newStock: update.stock,
            performedBy: req.user._id,
            notes: update.notes || 'Batch update'
          });
        }

        // Update product
        Object.assign(product, update);
        await product.save();

        results.successful.push({
          productId: product._id,
          message: 'Updated successfully'
        });
      } catch (error) {
        results.failed.push({
          productId: update.productId,
          error: error.message
        });
      }
    }

    await session.commitTransaction();
    res.json(results);
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

export const batchDeleteProducts = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productIds } = req.body;
    const results = {
      successful: [],
      failed: []
    };

    for (const productId of productIds) {
      try {
        const product = await Product.findById(productId);
        
        if (!product) {
          results.failed.push({
            productId,
            error: 'Product not found'
          });
          continue;
        }

        // Archive instead of delete
        product.status = 'INACTIVE';
        product.deletedAt = new Date();
        await product.save();

        results.successful.push({
          productId: product._id,
          message: 'Archived successfully'
        });
      } catch (error) {
        results.failed.push({
          productId,
          error: error.message
        });
      }
    }

    await session.commitTransaction();
    res.json(results);
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};