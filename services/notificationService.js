export const sendOrderNotifications = async (order, type, event) => {
  const isErrand = type === 'ERRAND';
  const templates = {
    CREATED: {
      title: `New ${isErrand ? 'Errand' : 'Delivery'} Request`,
      body: isErrand 
        ? `New errand request for ${order.service}`
        : `New delivery request for ${order.item.name}`
    },
    ASSIGNED: {
      title: `${isErrand ? 'Errand' : 'Delivery'} Assigned`,
      body: `A rider has been assigned to your ${isErrand ? 'errand' : 'delivery'}`
    },
    // ... other notification templates
  };

  const notification = templates[event];
  if (!notification) return;

  // Send to appropriate users
  await Promise.all([
    sendUserNotification(order.user, notification),
    order.rider && sendRiderNotification(order.rider, notification)
  ]);
};