export const getWelcomeEmail = (user, role, origin = null) => {
    let msg = "";
    if (role === "rider") {
      msg = "Welcome to our rider platform! Start accepting delivery requests and earn money on your own schedule.";
    } else if (role === "business") {
      msg = "Welcome to our delivery platform! We're excited to have you as a vendor. Let us handle your deliveries so you can focus on growing your business.";
    } else {
      msg = "Welcome to our platform! We're thrilled to have you here.";
    }
  
    return `
    <div style="max-width: 500px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
      <div style="text-align: center;">
        <img src="${origin}/logo.png" alt="Company Logo" style="max-width: 100px; margin-bottom: 10px;" />
        <h2 style="color: #007bff;">Welcome to Our Delivery Platform</h2>
        <p style="color: #555;">Hello <strong>${user.name}</strong>,</p>
        <p style="color: #555;">${msg}</p>
      </div>
  
      <hr />
  
      <div style="text-align: center; margin-top: 20px;">
        <p><strong>Get Started:</strong></p>
        <a href="${origin}/dashboard" 
          style="display: inline-block; padding: 12px 20px; background: #007bff; color: #fff; text-decoration: none; border-radius: 5px;">
          Go to Dashboard
        </a>
      </div>
  
      <hr />
  
      <div style="text-align: center; font-size: 12px; color: #888;">
        <p>Need help? <a href="${origin}/support" style="color: #007bff;">Contact Support</a></p>
      </div>
    </div>
    `;
  };
  