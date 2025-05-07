import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

   
    //get user from database
    const user = await User.findById(decoded.id);
    
    // Add decoded data to request
    req.user = user;
    req.role = decoded.role;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.' 
      });
    }
    next();
  };
};

// Specific role middlewares
export const requireAdmin = requireRole('admin');
export const requireRider = requireRole('rider');
export const requireIndividual = requireRole('individual');
export const requireBusiness = requireRole('business');

// Combined auth middlewares
export const adminAuth = [auth, requireAdmin];
export const riderAuth = [auth, requireRider];
export const individualAuth = [auth, requireIndividual];
export const businessAuth = [auth, requireBusiness];

// Multiple roles middleware
export const multipleRoles = (...roles) => [auth, requireRole(...roles)];