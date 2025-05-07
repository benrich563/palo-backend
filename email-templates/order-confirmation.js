export const getOrderConfirmationEmail = (order, origin = null) => {
    return `
    <div style="max-width: 500px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
      <div style="text-align: center;">
        <img src="${origin}/logo.png" alt="Company Logo" style="max-width: 100px; margin-bottom: 10px;" />
        <h2 style="color: #333;">Order Confirmation</h2>
        <p style="color: #555;">Thank you for placing your order! Below are your order details:</p>
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
        <h4 style="margin: 0; color: #444;">Pricing Breakdown</h4>
        <p><strong>Base Fare:</strong> GHS ${order.feeBreakdown.baseFare}</p>
        <p><strong>Distance Fee:</strong> GHS ${order.feeBreakdown.distanceFee}</p>
        <p><strong>Weight Fee:</strong> GHS ${order.feeBreakdonn.weightFee}</p>
        <h3 style="margin-top: 10px;">Total: GHS ${order.feeBreakdown.totalPrice}</h3>
      </div>
  
      <hr />
  
      <div style="text-align: center; margin-top: 20px;">
        <p style="color: #d9534f;"><strong>Your order can only be confirmed after payment!</strong></p>
        <p style="color: #666;">Orders without payment will be deleted from our system in the next <strong>3 days</strong>.</p>
        <a href="${origin}/payment/${order._id}" style="display: inline-block; padding: 12px 20px; background: #007bff; color: #fff; text-decoration: none; border-radius: 5px;">Make Payment</a>
      </div>
  
      <hr />
  
      <div style="text-align: center; font-size: 12px; color: #888;">
        <p>Need help? <a href="${origin}/contact-us" style="color: #007bff;">Contact Support</a></p>
      </div>
    </div>
    `;
  };
  