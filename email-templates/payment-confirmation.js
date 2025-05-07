export const getPaymentConfirmationEmail = (order) => {
    return `
    <div style="max-width: 500px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
      <div style="text-align: center;">
        <img src="${origin}/logo.png" alt="Company Logo" style="max-width: 100px; margin-bottom: 10px;" />
        <h2 style="color: #28a745;">Payment Successful</h2>
        <p style="color: #555;">Thank you for your payment! Your order is now confirmed and will be processed shortly.</p>
      </div>
  
      <hr />
  
      <div style="padding: 10px 0;">
        <h4 style="margin: 0; color: #444;">Order Details</h4>
        <p><strong>Order ID:</strong> ${order.orderId}</p>
        <p><strong>Pickup Address:</strong> ${order.pickupInformation.address}</p>
        <p><strong>Delivery Address:</strong> ${order.deliveryInformation.address}</p>
      </div>
  
      <hr />
  
      <div style="padding: 10px 0;">
        <h4 style="margin: 0; color: #444;">Payment Details</h4>
        <p><strong>Transaction ID:</strong> ${order.transactionId}</p>
        <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        <h3 style="margin-top: 10px; color: #28a745;">Total Paid: GHS ${order.pricing.totalPrice}</h3>
      </div>
  
      <hr />
  
      <div style="text-align: center; margin-top: 20px;">
        <p style="color: #007bff;"><strong>Your delivery is now being processed.</strong></p>
        <p style="color: #666;">Track your order status using the link below:</p>
        <a href="${origin}/track/${order.orderId}" style="display: inline-block; padding: 12px 20px; background: #007bff; color: #fff; text-decoration: none; border-radius: 5px;">Track Order</a>
      </div>
  
      <hr />
  
      <div style="text-align: center; font-size: 12px; color: #888;">
        <p>Need help? <a href="${origin}/contact-us" style="color: #007bff;">Contact Support</a></p>
      </div>
    </div>
    `;
  };
  