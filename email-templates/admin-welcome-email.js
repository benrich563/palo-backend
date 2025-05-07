export const getAdminWelcomeEmail = (user, origin = null) => {
  return `
    <div style="max-width: 500px; margin: auto; font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
      <div style="text-align: center;">
        <img src="${origin}/logo.png" alt="Company Logo" style="max-width: 100px; margin-bottom: 10px;" />
        <h2 style="color: #007bff;">Welcome to the Admin Team</h2>
        <p style="color: #555;">Hello <strong>${user.name}</strong>,</p>
        <p style="color: #555;">Your admin account has been created successfully. Here are your account details:</p>
      </div>

      <hr />

      <div style="padding: 10px 0;">
        <h4 style="margin: 0; color: #444;">Account Information</h4>
        <p><strong>Role:</strong> ${user.role}</p>
        <p><strong>Email:</strong> ${user.email}</p>
      </div>

      <hr />

      <div style="text-align: center; margin-top: 20px;">
        <p style="color: #dc3545;"><strong>Important Security Notice</strong></p>
        <p style="color: #666;">For security reasons, please change your password after your first login.</p>
        <a href="${origin}/admin/dashboard" 
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