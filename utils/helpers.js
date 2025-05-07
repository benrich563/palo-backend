export const generateReference = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 15);
  return `PAY_${timestamp}_${random}`.toUpperCase();
};

export const calculateFees = (amount, type) => {
  const baseFee = 1.5; // 1.5% of the amount
  const platformFee = amount * (baseFee / 100);
  
  return {
    baseFee: platformFee,
    total: amount + platformFee
  };
};