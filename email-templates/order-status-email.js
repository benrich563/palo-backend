export const getOrderStatusEmail = (order, rider = null, origin= null) => {
    let subject = "";
    let message = "";
    let buttonText = "";
    let buttonLink = "";
    let statusColor = "#007bff"; // Default color (blue)
    
    switch (order.status) {
        case "processing":
            subject = "Your Order is Being Processed!";
            message = "Great news! Your order is now being processed. We will notify you once a rider is assigned.";
            buttonText = "Track Order";
            buttonLink = `${origin}/tracking/${order.orderId}`;
            statusColor = "#ffc107"; // Yellow
            break;
        
        case "out-for-delivery":
            subject = "Your Order is Out for Delivery!";
            message = `Your order has been assigned to <strong>${rider?.name}</strong>. They are on the way to deliver your package!`;
            buttonText = "Track Rider";
            buttonLink = `${origin}/tracking/${order.orderId}`;
            statusColor = "#17a2b8"; // Cyan
            break;
        
        case "completed":
            subject = "Your Order Has Been Delivered!";
            message = "Your order has been successfully delivered. We hope you had a great experience!";
            buttonText = "Rate Your Experience";
            buttonLink = `${origin}/review/${order.orderId}`;
            statusColor = "#28a745"; // Green
            break;
        
        case "cancelled":
            subject = "Your Order Has Been Cancelled";
            message = "We're sorry, but your order has been cancelled. If this was a mistake, please contact support.";
            buttonText = "Contact Support";
            buttonLink = `${origin}/contact-us`;
            statusColor = "#dc3545"; // Red
            break;
        
        default:
            subject = "Order Update";
            message = "There has been an update to your order.";
            buttonText = "View Order";
            buttonLink = `${origin}/orders/${order._id}`;
    }

    return `
    <div style="max-width: 500px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
      <div style="text-align: center;">
        <img src="${origin}/logo.png" alt="Company Logo" style="max-width: 100px; margin-bottom: 10px;" />
        <h2 style="color: ${statusColor};">${subject}</h2>
        <p style="color: #555;">${message}</p>
      </div>

      <hr />

      <div style="padding: 10px 0;">
        <h4 style="margin: 0; color: #444;">Order Details</h4>
        <p><strong>Order ID:</strong> ${order.orderId}</p>
        <p><strong>Pickup Address:</strong> ${order.pickupInformation.address}</p>
        <p><strong>Delivery Address:</strong> ${order.deliveryInformation.address}</p>
      </div>

      ${rider ? `
      <hr />
      <div style="padding: 10px 0;">
        <h4 style="margin: 0; color: #444;">Rider Details</h4>
        <p>Your order has been assigned to</p>
        <p><strong>Name:</strong> ${rider.name}</p>
        <p><strong>Phone:</strong> <a href="tel:${rider.phone}" style="color: #007bff;">${rider.phone}</a></p>
      </div>
      ` : ""}

      <hr />

      <div style="text-align: center; margin-top: 20px;">
        <a href="${buttonLink}" style="display: inline-block; padding: 12px 20px; background: ${statusColor}; color: #fff; text-decoration: none; border-radius: 5px;">
          ${buttonText}
        </a>
      </div>

      <hr />

      <div style="text-align: center; font-size: 12px; color: #888;">
        <p>Need help? <a href="${origin}/contact-use" style="color: #007bff;">Contact Support</a></p>
      </div>
    </div>
    `;
};
