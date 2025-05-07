import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  type: {
    type: String,
    enum: ['INCREASE', 'DECREASE', 'ADJUSTMENT', 'SALE', 'RETURN'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousStock: Number,
  newStock: Number,
  reference: {
    type: String,
    trim: true
  },
  notes: String,
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ store: 1, createdAt: -1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

export default StockMovement;