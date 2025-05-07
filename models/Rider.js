import mongoose from 'mongoose';

const riderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['ONLINE', 'OFFLINE', 'BUSY'],
    default: 'OFFLINE'
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: null
    }
  },
  ratings: [{
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    rating: Number,
    comment: String,
    createdAt: Date
  }],
  documents: {
    idCard: {
      url: String,
      verified: Boolean
    },
    license: {
      url: String,
      verified: Boolean
    },
    insurance: {
      url: String,
      verified: Boolean
    }
  },
  verified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  role: {type: String, default: 'rider'},
  incentives: {
    currentPoints: {
      type: Number,
      default: 0
    },
    lifetimePoints: {
      type: Number,
      default: 0
    },
    tier: {
      type: String,
      enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'],
      default: 'BRONZE'
    },
    achievements: [{
      name: String,
      description: String,
      pointsAwarded: Number,
      dateAwarded: Date,
      icon: String
    }],
    bonusHistory: [{
      amount: Number,
      reason: String,
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
      },
      dateAwarded: Date
    }]
  }
});

// Create the 2dsphere index
riderSchema.index({ location: '2dsphere' });

// Update the updatedAt timestamp before saving
riderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Rider = mongoose.model('Rider', riderSchema);

export default Rider;

