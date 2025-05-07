import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  // Reference fields based on type
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: function() {
      return !this.type || this.type === 'ORDER';
    }
  },
  errandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Errand',
    required: function() {
      return this.type === 'ERRAND';
    }
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: function() {
      return this.type === 'DELIVERY_SUBSCRIPTION' || this.type === 'STORE_SUBSCRIPTION';
    }
  },
  
  // Payment type and status
  type: {
    type: String,
    enum: ['ORDER', 'ERRAND', 'DELIVERY_SUBSCRIPTION', 'STORE_SUBSCRIPTION'],
    default: 'ORDER',
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
    default: 'PENDING',
    required: true
  },
  
  // Add orderType field to track the specific type of order
  orderType: {
    type: String,
    enum: ['DELIVERY', 'ERRAND', 'SHOPPING'],
    required: function() {
      return this.type === 'ORDER';
    }
  },
  
  // Payment details
  transactionReference: {
    type: String,
    required: true,
    unique: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'GHS',
    required: true
  },
  paymentMethod: {
    type: String,
    required: true,
    default: 'PAYSTACK'
  },

  // Fee breakdown
  feeBreakdown: {
    baseFee: { type: Number, default: 0 },
    distanceFee: { type: Number, default: 0 },
    packageFee: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    platformCommission: { type: Number, default: 0 },
    riderFee: { type: Number, default: 0 }
  },

  // Payment provider details
  paymentDetails: {
    channel: String,
    cardType: String,
    last4: String,
    bank: String,
    countryCode: String,
    brand: String,
    authorization: {
      type: Object,
      select: false  // Hide sensitive data by default
    }
  },

  // Refund information
  refund: {
    amount: Number,
    reason: String,
    reference: String,
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED']
    },
    processedAt: Date
  },

  // Customer and business information
  metadata: {
    customerEmail: String,
    customerName: String,
    phoneNumber: String,
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // Timestamps
  paidAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  timestamps: true
});

// Virtuals
paymentSchema.virtual('relatedDocument', {
  ref: function() {
    switch(this.type) {
      case 'ERRAND': return 'Errand';
      case 'ORDER': return 'Order';
      case 'DELIVERY_SUBSCRIPTION':
      case 'STORE_SUBSCRIPTION':
        return 'Subscription';
      default: return 'Order';
    }
  },
  localField: function() {
    switch(this.type) {
      case 'ERRAND': return 'errandId';
      case 'ORDER': return 'orderId';
      case 'DELIVERY_SUBSCRIPTION':
      case 'STORE_SUBSCRIPTION':
        return 'subscriptionId';
      default: return 'orderId';
    }
  },
  foreignField: '_id',
  justOne: true
});

// Methods
paymentSchema.methods.initializeRefund = async function(amount, reason) {
  this.refund = {
    amount,
    reason,
    status: 'PENDING',
    reference: `REF_${this.transactionReference}_${Date.now()}`
  };
  return this.save();
};

// Indexes
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ errandId: 1 });
paymentSchema.index({ subscriptionId: 1 });
paymentSchema.index({ transactionReference: 1 }, { unique: true });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });
paymentSchema.index({ type: 1 });
paymentSchema.index({ 'metadata.businessId': 1 });
paymentSchema.index({ 'metadata.userId': 1 });

// Configuration
paymentSchema.set('toJSON', { virtuals: true });
paymentSchema.set('toObject', { virtuals: true });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;



