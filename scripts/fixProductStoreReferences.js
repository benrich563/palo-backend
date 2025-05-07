import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import Store from '../models/Store.js';

dotenv.config();

async function fixProductStoreReferences() {
  let connection;
  try {
    // Connect with options to suppress deprecation warnings
    connection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Get all products with store reference
    const products = await Product.find({}).select('_id store status');
    console.log(`Found ${products.length} products to check`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const product of products) {
      try {
        // Try to find store where the product's store field matches the owner
        const store = await Store.findOne({ owner: product.store }).select('_id status');
        
        if (store) {
          // Update product with correct store ID
          const updateResult = await Product.findByIdAndUpdate(product._id, {
            store: store._id,
            status: store.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
          });
          
          if (updateResult) {
            updated++;
            console.log(`Updated product ${product._id}: Changed store reference from ${product.store} to ${store._id}`);
          }
        } else {
          // Check if the store reference is already correct
          const directStore = await Store.findById(product.store).select('_id status');
          if (directStore) {
            if (product.status !== (directStore.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE')) {
              await Product.findByIdAndUpdate(product._id, {
                status: directStore.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
              });
              console.log(`Updated status for product ${product._id}`);
              updated++;
            } else {
              skipped++;
              console.log(`Skipped product ${product._id}: Store reference already correct`);
            }
          } else {
            console.log(`Warning: Product ${product._id} has invalid store reference: ${product.store}`);
            errors++;
          }
        }
      } catch (error) {
        console.error(`Error processing product ${product._id}:`, error.message);
        errors++;
      }
    }

    console.log('\nMigration Summary:');
    console.log('------------------');
    console.log(`Total products processed: ${products.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already correct): ${skipped}`);
    console.log(`Errors: ${errors}`);

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
    process.exit(0);
  }
}

// Run the migration with proper error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
  process.exit(1);
});

fixProductStoreReferences().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
