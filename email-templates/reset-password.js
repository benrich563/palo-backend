export const getPasswordResetEmail = (user, resetUrl, origin = null) => {
    return `
    <div style="max-width: 500px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
      <div style="text-align: center;">
        <img src="${origin}/logo.png" alt="Company Logo" style="max-width: 100px; margin-bottom: 10px;" />
        <h2 style="color: #dc3545;">Password Reset Request</h2>
        <p style="color: #555;">Hello <strong>${user.name}</strong>,</p>
        <p style="color: #555;">You recently requested to reset your password. Click the button below to proceed:</p>
      </div>
  
      <hr />
  
      <div style="text-align: center; margin-top: 20px;">
        <a href="${resetUrl}" 
          style="display: inline-block; padding: 12px 20px; background: #dc3545; color: #fff; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
      </div>
  
      <hr />
  
      <p style="color: #777; font-size: 14px; text-align: center;">
        If you did not request this, please ignore this email. This link is valid for only <strong>1 hour</strong>.
      </p>
  
      <div style="text-align: center; font-size: 12px; color: #888;">
        <p>Need help? <a href="${origin}/support" style="color: #007bff;">Contact Support</a></p>
      </div>
    </div>
    `;
  };
  