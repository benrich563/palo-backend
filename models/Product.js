import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    validate: {
      validator: async function(storeId) {
        if (!storeId) return false;
        const store = await mongoose.model('Store').findById(storeId);
        return store !== null;
      },
      message: 'Invalid store reference'
    }
  },
  // Add this to help with queries
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  price: {
    type: Number,
    required: true
  },
  images: [{
    type: String
  }],
  category: String,
  stock: {
    type: Number,
    default: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 5
  },
  stockAlerts: {
    enabled: {
      type: Boolean,
      default: true
    },
    lastNotified: Date
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'],
    default: 'ACTIVE'
  },
  specifications: [{
    name: String,
    value: String
  }],
  rating: {
    type: Number,
    default: 0
  },
  totalRatings: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Add middleware to check stock levels
productSchema.pre('save', async function(next) {
  if (this.stock <= this.lowStockThreshold && this.stockAlerts.enabled) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!this.stockAlerts.lastNotified || this.stockAlerts.lastNotified < oneHourAgo) {
      // Update last notified time
      this.stockAlerts.lastNotified = new Date();
      
      // Notify store owner (implement this in a separate service)
      const store = await Store.findById(this.store).populate('owner');
      await notifyLowStock(store.owner, this);
    }
  }
  next();
});

// Add this middleware to automatically populate owner from store
productSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('store')) {
    const store = await mongoose.model('Store').findById(this.store);
    if (store) {
      this.owner = store.owner;
    }
  }
  next();
});

// Add middleware to sync product status with store status
productSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('store')) {
    const store = await mongoose.model('Store').findById(this.store);
    if (!store) {
      throw new Error('Referenced store does not exist');
    }
    this.status = store.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
  }
  next();
});

// Add method to validate store reference
productSchema.methods.validateStoreReference = async function() {
  const store = await mongoose.model('Store').findById(this.store);
  if (!store) {
    throw new Error('Invalid store reference');
  }
  return store;
};

// Add static method to fix store references in bulk
productSchema.statics.fixStoreReferences = async function() {
  const products = await this.find({});
  let updated = 0;
  let errors = 0;

  for (const product of products) {
    try {
      const store = await product.validateStoreReference();
      const correctStatus = store.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
      
      if (product.status !== correctStatus) {
        product.status = correctStatus;
        await product.save();
        updated++;
      }
    } catch (error) {
      errors++;
      console.error(`Error fixing product ${product._id}:`, error.message);
    }
  }
  
  return { updated, errors };
};

const Product = mongoose.model('Product', productSchema);

export default Product;


