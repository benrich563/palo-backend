import mongoose from 'mongoose';

const productOrderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  customer: {
    name: String,
    email: String,
    phone: String,
    address: String
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: String,
    price: Number,
    quantity: Number,
    subtotal: Number
  }],
  totals: {
    subtotal: Number,
    tax: Number,
    deliveryFee: Number,
    total: Number
  },
  processingStatus: {
    type: String,
    enum: ['PENDING_CONFIRMATION', 'PROCESSING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING_CONFIRMATION'
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'REFUNDED'],
    default: 'PENDING'
  },
  paymentMethod: {
    type: String,
    enum: ['CARD', 'CASH', 'TRANSFER'],
    required: true
  },
  deliveryOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'  // Reference to existing delivery order model
  },
  notes: {
    customer: String,
    business: String
  },
  timestamps: {
    ordered: Date,
    confirmed: Date,
    processed: Date,
    ready: Date,
    completed: Date,
    cancelled: Date
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate order number before saving
productOrderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.orderNumber = `PO${year}${month}${count.toString().padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model('ProductOrder', productOrderSchema);