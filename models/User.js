import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  role: {
    type: String,
    enum: ['USER', 'BUSINESS', 'RIDER', 'ADMIN'],
    default: 'USER'
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'SUSPENDED'],
    default: 'PENDING'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  lastLogin: Date,
  businessDetails: {
    businessType: {
      type: String,
      trim: true
    },
    registrationNumber: {
      type: String,
      trim: true
    },
    taxId: {
      type: String,
      trim: true
    },
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING'
    },
    verificationDate: Date,
    documents: [{
      type: String,
      trim: true
    }],
    deliverySubscription: {
      plan: {
        type: String,
        enum: ['NONE', 'BASIC', 'STANDARD', 'PREMIUM'],
        default: 'NONE'
      },
      status: {
        type: String,
        enum: ['INACTIVE', 'ACTIVE', 'EXPIRED'],
        default: 'INACTIVE'
      },
      startDate: Date,
      endDate: Date,
      remainingDeliveries: {
        type: Number,
        default: 0
      }
    }
  },
  riderDetails: {
    vehicleType: {
      type: String,
      enum: ['MOTORCYCLE', 'BICYCLE', 'CAR', 'VAN'],
    },
    vehicleNumber: String,
    licenseNumber: String,
    insuranceNumber: String,
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      }
    },
    isAvailable: {
      type: Boolean,
      default: false
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    totalRatings: {
      type: Number,
      default: 0
    },
    documents: [{
      type: String,
      trim: true
    }],
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING'
    }
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true // Allows null values without triggering unique constraint
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referrals: {
    users: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      date: {
        type: Date,
        default: Date.now
      },
      rewarded: {
        type: Boolean,
        default: false
      }
    }],
    vendors: [{
      store: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store'
      },
      date: {
        type: Date,
        default: Date.now
      },
      rewarded: {
        type: Boolean,
        default: false
      }
    }],
    riders: [{
      rider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rider'
      },
      date: {
        type: Date,
        default: Date.now
      },
      rewarded: {
        type: Boolean,
        default: false
      }
    }]
  },
  rewards: {
    balance: {
      type: Number,
      default: 0
    },
    history: [{
      amount: Number,
      type: {
        type: String,
        enum: ['REFERRAL_REWARD', 'CASHBACK', 'PROMOTION', 'REDEMPTION'],
        required: true
      },
      description: String,
      date: {
        type: Date,
        default: Date.now
      }
    }]
  }
}, {
  timestamps: true
});

// Index for location-based queries for riders
userSchema.index({ 'riderDetails.currentLocation': '2dsphere' });

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;




