import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { uploadErrorHandler } from './middleware/errorHandler.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { connectWithRetry, closeConnection } from './config/db.js';
import mongoose from 'mongoose';

// Routes
import orderRoutes from './routes/orderRoutes.js';
import riderRoutes from './routes/riderRoutes.js';
import trackingRoutes from './routes/trackingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import userRoutes from './routes/userRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import businessRoutes from './routes/businessRoutes.js';
import productRoutes from './routes/productRoutes.js';
import errandRoutes from './routes/errandRoutes.js';

dotenv.config();

const app = express();
const server = createServer(app);

// Socket.io setup with security configurations
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  connectTimeout: 60000
});

// Security Middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect to MongoDB
connectWithRetry();

// Socket.io connection handling with error handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinOrderTracking', (orderId) => {
    if (!orderId) {
      socket.emit('error', { message: 'Order ID is required' });
      return;
    }
    socket.join(`order_${orderId}`);
    console.log(`Client ${socket.id} joined order tracking room: order_${orderId}`);
  });

  socket.on('leaveOrderTracking', (orderId) => {
    if (!orderId) {
      socket.emit('error', { message: 'Order ID is required' });
      return;
    }
    socket.leave(`order_${orderId}`);
    console.log(`Client ${socket.id} left order tracking room: order_${orderId}`);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Client ${socket.id} disconnected:`, reason);
  });
});

// Make io accessible to routes
app.set('io', io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/riders', riderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/products', productRoutes);
app.use('/api/errands', errandRoutes);

// Error handlers
app.use(uploadErrorHandler);  // Specific error handler for uploads
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({ 
      status: 'error',
      message: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ 
      status: 'error',
      message: 'Token expired',
      code: 'TOKEN_EXPIRED'
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message: 'Validation error',
      errors: Object.values(err.errors).map(e => e.message),
      code: 'VALIDATION_ERROR'
    });
  }

  // Get status code from error or default to 500
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    console.log('Server closed');
    await closeConnection();
    process.exit(0);
  });
});






