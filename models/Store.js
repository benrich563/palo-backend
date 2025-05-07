import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Store name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Store address is required']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Store category is required']
  },
  // New fields for business information
  businessType: {
    type: String,
    required: [true, 'Business type is required']
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  taxId: {
    type: String,
    trim: true
  },
  // Image fields
  bannerImage: {
    type: String,
    trim: true
  },
  logoImage: {
    type: String,
    trim: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  openingHours: {
    type: Map,
    of: {
      open: String,
      close: String
    }
  },
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE'],
    default: 'PENDING'
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
  registration: {
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'],
      default: 'PENDING'
    },
    documents: [{
      type: String,
      trim: true
    }],
    verificationDate: Date,
    rejectionReason: String
  },
  promotion: {
    plan: {
      type: String,
      enum: ['NONE', 'BASIC', 'STANDARD', 'PREMIUM'],
      default: 'NONE'
    },
    status: {
      type: String,
      enum: ['PENDING', 'INACTIVE', 'ACTIVE', 'EXPIRED'],
      default: 'INACTIVE'
    },
    startDate: Date,
    endDate: Date,
    paymentReference: String
  }
}, {
  timestamps: true
});

// Index for location-based queries
storeSchema.index({ location: '2dsphere' });

// Index for searching stores by name
storeSchema.index({ name: 'text', description: 'text' });

// Add this before creating the model
storeSchema.pre('save', async function(next) {
  // Only run this middleware if store status has changed
  if (this.isModified('status')) {
    const newStatus = this.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
    
    // Update all products belonging to this store
    await mongoose.model('Product').updateMany(
      { store: this._id },
      { status: newStatus }
    );
    
    console.log(`Updated status of all products for store ${this._id} to ${newStatus}`);
  }
  next();
});

const Store = mongoose.model('Store', storeSchema);

export default Store;


