# E-Commerce Platform Backend

This is the backend server for the E-Commerce platform, providing API endpoints for user authentication, business management, product management, order processing, and image uploads.

## Technologies Used

- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **MongoDB** - Database
- **Mongoose** - MongoDB object modeling
- **JWT** - Authentication
- **Cloudinary** - Image storage and management
- **Nodemailer** - Email sending
- **Socket.io** - Real-time communication

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Cloudinary account
- SMTP server access (for email functionality)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:

```
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ecommerce
# or
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/ecommerce

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (Nodemailer)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password
EMAIL_FROM=noreply@example.com

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000
```

### Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login user
- `POST /api/users/verify` - Verify user email
- `POST /api/users/forgot-password` - Request password reset
- `POST /api/users/reset-password` - Reset password

### Business Management

- `GET /api/business/store` - Get business store details
- `POST /api/business/store` - Create business store
- `PUT /api/business/store` - Update business store
- `POST /api/business/store/upload-image` - Upload store images (logo/banner)

### Product Management

- `GET /api/business/products` - Get all products for a business
- `GET /api/business/products/:id` - Get product by ID
- `POST /api/business/products` - Create a new product
- `PUT /api/business/products/:id` - Update a product
- `DELETE /api/business/products/:id` - Delete a product

### Order Management

- `GET /api/business/orders` - Get all orders for a business
- `GET /api/business/orders/:id` - Get order by ID
- `PUT /api/business/orders/:id` - Update order status

### Image Uploads

- `POST /api/uploads/image` - Upload an image to Cloudinary

## File Structure

```
backend/
├── config/             # Configuration files
│   ├── cloudinary.js   # Cloudinary configuration
│   ├── db.js           # Database connection
│   └── passport.js     # Authentication strategies
├── controllers/        # Route controllers
│   ├── authController.js
│   ├── businessController.js
│   ├── orderController.js
│   ├── productController.js
│   └── uploadController.js
├── middleware/         # Custom middleware
│   ├── auth.js         # Authentication middleware
│   └── errorHandler.js # Error handling middleware
├── models/             # Mongoose models
│   ├── User.js
│   ├── Business.js
│   ├── Product.js
│   └── Order.js
├── routes/             # API routes
│   ├── authRoutes.js
│   ├── businessRoutes.js
│   ├── orderRoutes.js
│   ├── productRoutes.js
│   └── uploadRoutes.js
├── utils/              # Utility functions
│   ├── emailTemplates.js
│   ├── imageUpload.js
│   └── sendEmail.js
├── .env                # Environment variables (not in repo)
├── .gitignore          # Git ignore file
├── package.json        # Project dependencies
├── server.js           # Entry point
└── README.md           # This file
```

## Socket.IO Integration

The server uses Socket.IO for real-time communication, particularly for order notifications. When a new order is placed, a notification is sent to the business owner in real-time.

## Error Handling

The application uses a centralized error handling middleware that catches all errors and returns appropriate HTTP responses.

## Authentication

JWT (JSON Web Tokens) are used for authentication. Protected routes require a valid JWT token in the Authorization header.

## Image Upload

Images are uploaded to Cloudinary. The server handles the upload process and returns the URL and public ID of the uploaded image.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.