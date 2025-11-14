# Carwash Backend API

A robust Node.js/Express backend API for managing a carwash business, including user authentication, booking management, and wallet/commission tracking system.

## 🚀 Features

- **User Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (Admin, Attendant)
  - Password reset via email
  - Secure password hashing with bcrypt

- **Booking Management**
  - Vehicle wash bookings (full wash, half wash)
  - Carpet cleaning bookings
  - Multiple payment types (attendant cash, admin cash, admin till)
  - Booking status tracking (pending, in progress, completed, cancelled)

- **Wallet & Commission System**
  - Daily wallet balance calculation
  - Automatic commission tracking (40% attendant, 60% company)
  - Company debt tracking for cash collections
  - Daily payment settlement
  - System wallet for overall revenue tracking

- **Security Features**
  - Helmet.js for HTTP security headers
  - Rate limiting to prevent abuse
  - Data sanitization against NoSQL injection
  - CORS configuration for cross-origin requests
  - Request compression for performance

## 🛠️ Tech Stack

- **Runtime**: Node.js (>=18.0.0)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Language**: TypeScript
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, express-rate-limit, express-mongo-sanitize
- **Email**: Nodemailer
- **Validation**: Validator.js

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (>=18.0.0)
- npm or yarn
- MongoDB Atlas account or local MongoDB instance
- Git

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CarwashBackend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `config.env` file in the root directory:
   ```env
   NODE_ENV=development
   PORT=3000
   
   # Database
   DATABASE=mongodb+srv://username:<PASSWORD>@cluster.mongodb.net/carwash
   DATABASE_PASSWORD=your_password_here
   
   # JWT
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRES_IN=90d
   JWT_COOKIE_EXPIRES_IN=90
   
   # Email (Optional)
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_USERNAME=your-email@yourdomain.com
   EMAIL_PASSWORD=your-email-password
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   ```

   See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for detailed information.

4. **Build the project**
   ```bash
   npm run build
   ```

## 🚦 Running the Application

### Development Mode
```bash
npm run dev
```
This will start the server with nodemon and TypeScript support. The server will automatically restart on file changes.

### Production Mode
```bash
npm start
```
This runs the compiled JavaScript from the `dist` directory.

### Other Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run build:watch` - Watch mode for TypeScript compilation
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors automatically
- `npm run format` - Format code with Prettier
- `npm run type-check` - Type check without emitting files
- `npm run debug` - Run with Node.js inspector for debugging

## 📚 API Documentation

The API base URL is:
- **Development**: `http://localhost:3000/api/v1`
- **Production**: `https://your-domain.com/api/v1`

### Available Endpoints

#### Authentication
- `POST /api/v1/users/signup` - Register a new user
- `POST /api/v1/users/login` - Login user
- `GET /api/v1/users/logout` - Logout user
- `POST /api/v1/users/forgotPassword` - Request password reset
- `PATCH /api/v1/users/resetPassword/:token` - Reset password
- `PATCH /api/v1/users/updateMyPassword` - Update password (authenticated)

#### User Management
- `GET /api/v1/users/me` - Get current user
- `DELETE /api/v1/users/deleteMe` - Delete current user account
- `GET /api/v1/users` - Get all users (Admin only)
- `POST /api/v1/users` - Create user (Admin only)
- `GET /api/v1/users/:id` - Get user by ID (Admin only)
- `PATCH /api/v1/users/:id` - Update user (Admin only)
- `DELETE /api/v1/users/:id` - Delete user (Admin only)

#### Booking Management
- `GET /api/v1/bookings` - Get all bookings
- `POST /api/v1/bookings` - Create booking (Admin only)
- `GET /api/v1/bookings/:id` - Get booking by ID (Admin only)
- `PATCH /api/v1/bookings/:id` - Update booking (Admin only)
- `DELETE /api/v1/bookings/:id` - Delete booking (Admin only)
- `GET /api/v1/bookings/attendant/:id` - Get bookings by attendant
- `GET /api/v1/bookings/status/:status` - Get bookings by status

#### Wallet Management
- `GET /api/v1/wallets/my-wallet` - Get my wallet (Attendant only)
- `POST /api/v1/wallets/settle` - Settle attendant balances (Admin only)
- `GET /api/v1/wallets/daily-summary` - Get daily wallet summary (Admin only)
- `GET /api/v1/wallets` - Get all wallets (Admin only)
- `GET /api/v1/wallets/summary` - Get wallet summary (Admin only)
- `GET /api/v1/wallets/debt-summary` - Get company debt summary (Admin only)
- `GET /api/v1/wallets/unpaid` - Get unpaid wallets (Admin only)
- `GET /api/v1/wallets/system` - Get system wallet (Admin only)
- `GET /api/v1/wallets/system/summary` - Get system wallet summary (Admin only)
- `GET /api/v1/wallets/:id` - Get attendant wallet (Admin only)
- `GET /api/v1/wallets/:id/debt` - Get attendant debt details (Admin only)
- `PATCH /api/v1/wallets/:id/mark-paid` - Mark attendant as paid (Admin only)
- `PATCH /api/v1/wallets/:id/rebuild` - Rebuild wallet balance (Admin only)

For detailed API documentation with request/response examples, see [API_ENDPOINTS.md](./API_ENDPOINTS.md).

## 📁 Project Structure

```
CarwashBackend/
├── api/                 # API entry point for serverless
├── controllers/         # Request handlers
│   ├── authController.ts
│   ├── bookingController.ts
│   ├── errorController.ts
│   ├── handlerFactory.ts
│   ├── userController.ts
│   └── walletController.ts
├── models/             # Mongoose models
│   ├── bookingModel.ts
│   ├── systemWalletModel.ts
│   ├── userModel.ts
│   └── walletModel.ts
├── routes/             # API routes
│   ├── bookingRoutes.ts
│   ├── userRoutes.ts
│   └── walletRoutes.ts
├── types/              # TypeScript type definitions
│   └── index.ts
├── utils/              # Utility functions
│   ├── apiFeatures.ts
│   ├── appError.ts
│   ├── catchAsync.ts
│   ├── email.ts
│   └── jwt.ts
├── app.ts              # Express app configuration
├── server.ts           # Server entry point
├── config.env          # Environment variables (not in git)
├── tsconfig.json       # TypeScript configuration
├── vercel.json         # Vercel deployment configuration
└── package.json        # Dependencies and scripts
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. After successful login, include the token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

Tokens are also sent as HTTP-only cookies for enhanced security.

## 💰 Wallet System

The wallet system operates on a daily basis with the following commission structure:

- **Attendant Commission**: 40% of booking amount
- **Company Share**: 60% of booking amount

### Payment Types

- **`attendant_cash`**: Attendant collects cash, owes 60% to company
- **`admin_cash`**: Admin collects cash, attendant gets 40% commission
- **`admin_till`**: Admin collects via mobile till, attendant gets 40% commission

### Daily Operations

- Wallet balances are calculated from today's completed bookings
- Attendants can view their daily wallet balance
- Admins can settle multiple attendants at once
- System wallet tracks overall revenue and company share

For detailed wallet system documentation, see [API_ENDPOINTS.md](./API_ENDPOINTS.md#wallet-system-business-logic).

## 🚀 Deployment

### Deploying to Vercel

This project is configured for deployment on Vercel. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

Quick steps:
1. Push your code to GitHub
2. Import the repository in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

The `vercel.json` file is already configured for serverless deployment.

## 🧪 Testing

To test the API endpoints, you can use:

- **cURL** (examples in [API_ENDPOINTS.md](./API_ENDPOINTS.md))
- **Postman** or **Insomnia**
- **Thunder Client** (VS Code extension)

## 🔒 Security

This API implements several security measures:

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting (100 requests per hour per IP)
- Data sanitization against NoSQL injection
- Security headers with Helmet.js
- CORS configuration
- Request body size limits

## 📝 Environment Variables

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for a complete list of required and optional environment variables.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

ISC

## 👤 Author

**Peter Munyua**

## 📞 Support

For issues and questions:
1. Check the [API_ENDPOINTS.md](./API_ENDPOINTS.md) documentation
2. Review [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues
3. Check Vercel deployment logs for production issues

---

Built with ❤️ using Node.js, Express, TypeScript, and MongoDB

