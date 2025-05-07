import mongoose from 'mongoose';

/**
 * Wrapper function that handles transactions based on environment
 * @param {Function} operation - Async function containing the database operations
 * @param {Object} options - Additional options for the transaction
 * @returns {Promise} - Result of the operation
 */
export const withTransaction = async (operation, options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    // In development, execute operation without transaction
    return await operation(null);
  }

  // In production, use transactions
  const session = await mongoose.startSession();
  try {
    session.startTransaction(options);
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};