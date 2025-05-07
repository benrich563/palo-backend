import { Schema, model } from 'mongoose';

const errandSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  items: [{
    name: String,
    description: String,
    estimatedPrice: Number,
    quantity: Number,
    specifications: String,
    preferredStore: String
  }],
  status: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'SHOPPING', 'PURCHASED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    default: 'PENDING'
  },
  timestamps: {
    created: Date,
    confirmed: Date,
    shopping: Date,
    purchased: Date,
    inTransit: Date,
    delivered: Date,
    cancelled: Date
  },
  pricing: {
    estimatedTotal: Number,
    actualTotal: Number,
    serviceFee: Number,
    deliveryFee: Number,
    total: Number
  },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PARTIAL', 'PAID'],
    default: 'PENDING'
  },
  rider: {
    type: Schema.Types.ObjectId,
    ref: 'Rider'
  },
  notes: String,
  receipts: [{
    url: String,
    timestamp: Date
  }],
  type: {
    type: String,
    enum: ['DELIVERY', 'ERRAND', 'SHOPPING'],
    required: true,
    default: 'ERRAND'
  }
}, {
  timestamps: true
});

export default model('Errand', errandSchema);
