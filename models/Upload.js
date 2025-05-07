import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['PROFILE', 'PRODUCT', 'DOCUMENT'],
    required: true
  },
  timestamps: {
    created: {
      type: Date,
      default: Date.now
    },
    updated: {
      type: Date,
      default: Date.now
    }
  }
});

export default mongoose.model('Upload', uploadSchema);