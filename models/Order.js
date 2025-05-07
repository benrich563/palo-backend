import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  item: {
    name: String,
    description: String
  },
  pickupLocation: {
    address: String,
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number]  // [longitude, latitude]
  },
  deliveryLocation: {
    address: String,
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number]  // [longitude, latitude]
  },
  timestamps: {
    created: Date,
    assigned: Date,
    pickedUp: Date,
    inTransit: Date,
    delivered: Date,
    cancelled: Date
  },
  status: {
    type: String,
    enum: ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    default: 'PENDING'
  },
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider'
  },
  senderPhone: String,
  recipientPhone: String,
  packageDetails: {
    categoryId: String,
    itemId: String,
    fragile: Boolean,
    express: Boolean,
    items: Array,
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      weight: Number
    }
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING_PAYMENT', 'PAID', 'FAILED', 'REFUNDED'],
    default: 'PENDING_PAYMENT'
  },
  deliveryFee: Number,
  feeBreakdown: {
    baseFee: Number,
    distanceFee: Number,
    packageFee: Number,
    distance: Number,
    total: Number,
    platformCommission: Number, // 20% of total
    riderFee: Number,          // 80% of total,
    transactionFee: Number, // 2.5% of total
    subtotal: Number,
    deliveryFee: Number,
    serviceFee: Number,
    total: Number,
    riderFee: Number,
    tierBonus: {
      type: Number,
      default: 0
    },
    riderFeeWithBonus: {
      type: Number,
      default: 0
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: function() {
      return this.type === 'SHOPPING';
    }
  },
  storeDetails: {
    name: String,
    address: String
  },
  orderType: {
    type: String,
    enum: ['INDIVIDUAL', 'BUSINESS'],
    default: 'INDIVIDUAL'
  },
  processingStatus: {
    type: String,
    enum: ['PENDING_CONFIRMATION', 'PROCESSING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING_CONFIRMATION'
  },
  cancellationReason: String,
  refundStatus: {
    type: String,
    enum: ['NONE', 'REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED'],
    default: 'NONE'
  },
  refundReason: String,
  refundAmount: Number,
  businessNotes: String,
  customerNotes: String,
  processingTime: Number, // in minutes
  salesChannel: {
    type: String,
    enum: ['WEBSITE', 'IN_STORE', 'MARKETPLACE'],
    default: 'WEBSITE'
  },
  type: {
    type: String,
    enum: ['DELIVERY', 'ERRAND', 'SHOPPING'],
    required: true,
    default: 'DELIVERY'
  }
}, { timestamps: true });

// Add geospatial index
orderSchema.index({ "pickupLocation.coordinates": "2dsphere" });
orderSchema.index({ "deliveryLocation.coordinates": "2dsphere" });

// Add index for cleanup job
orderSchema.index({ createdAt: 1, paymentStatus: 1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;






