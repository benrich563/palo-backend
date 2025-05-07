import mongoose from 'mongoose';

// MongoDB Connection Options
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
  autoIndex: process.env.NODE_ENV !== 'production',
  maxPoolSize: 10,
  connectTimeoutMS: 10000
};

// Connect to MongoDB with retry logic
const connectWithRetry = async () => {
  try {
    // Use different connection URI based on environment
    const uri = process.env.NODE_ENV === 'production' 
      ? process.env.MONGODB_URI_PROD 
      : process.env.MONGODB_URI;

    // Add retryWrites only in production
    if (process.env.NODE_ENV === 'production') {
      mongooseOptions.retryWrites = true;
    }

    await mongoose.connect(uri, mongooseOptions);
    console.log('Connected to MongoDB');
    
    if (process.env.NODE_ENV === 'production') {
      const isReplSet = mongoose.connection.client.topology?.constructor.name === 'ReplSet';
      if (!isReplSet) {
        console.warn('Warning: Production environment without replica set. Transactions will not be available.');
      }
    }
    
  } catch (err) {
    console.error('MongoDB connection error:', err);
    console.log('Retrying connection in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
};

// Close MongoDB connection
const closeConnection = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    throw err;
  }
};

export { connectWithRetry, closeConnection };





