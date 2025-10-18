# Carwash Backend API Endpoints

## Base URL
```
http://localhost:3000/api/v1
```

## Authentication Endpoints

### 1. User Registration
```bash
curl -X POST http://localhost:3000/api/v1/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "passwordConfirm": "password123",
    "role": "attendant"
  }'
```

### 2. User Login
```bash
curl -X POST http://localhost:3000/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### 3. User Logout
```bash
curl -X GET http://localhost:3000/api/v1/users/logout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. Forgot Password
```bash
curl -X POST http://localhost:3000/api/v1/users/forgotPassword \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com"
  }'
```

### 5. Reset Password
```bash
curl -X PATCH http://localhost:3000/api/v1/users/resetPassword/RESET_TOKEN_HERE \
  -H "Content-Type: application/json" \
  -d '{
    "password": "newpassword123",
    "passwordConfirm": "newpassword123"
  }'
```

### 6. Update Password (Authenticated)
```bash
curl -X PATCH http://localhost:3000/api/v1/users/updateMyPassword \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "passwordCurrent": "oldpassword123",
    "password": "newpassword123",
    "passwordConfirm": "newpassword123"
  }'
```

## User Management Endpoints

### 7. Get Current User
```bash
curl -X GET http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 8. Delete Current User Account
```bash
curl -X DELETE http://localhost:3000/api/v1/users/deleteMe \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 9. Get All Users (Admin Only)
```bash
# Get all users
curl -X GET http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get only attendants
curl -X GET "http://localhost:3000/api/v1/users?role=attendant" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get only admins
curl -X GET "http://localhost:3000/api/v1/users?role=admin" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 10. Create User (Admin Only)
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "password": "password123",
    "passwordConfirm": "password123",
    "role": "admin",
    "photo": "profile.jpg"
  }'
```

### 11. Get User by ID (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/users/USER_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 12. Update User (Admin Only)
```bash
curl -X PATCH http://localhost:3000/api/v1/users/USER_ID_HERE \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Updated Name",
    "email": "updated@example.com",
    "role": "admin",
    "photo": "new-photo.jpg"
  }'
```

### 13. Delete User (Admin Only)
```bash
curl -X DELETE http://localhost:3000/api/v1/users/USER_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Booking Management Endpoints

### 14. Get All Bookings
```bash
curl -X GET http://localhost:3000/api/v1/bookings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 15. Create Booking (Admin Only)

#### For Vehicle Bookings:
```bash
curl -X POST http://localhost:3000/api/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "carRegistrationNumber": "KCA 123A",
    "attendant": "ATTENDANT_ID_HERE",
    "amount": 500,
    "serviceType": "full wash",
    "vehicleType": "Sedan",
    "category": "vehicle",
    "paymentType": "attendant_cash"
  }'
```

#### For Carpet Cleaning Bookings:
```bash
curl -X POST http://localhost:3000/api/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "phoneNumber": "+254712345678",
    "color": "Red",
    "attendant": "ATTENDANT_ID_HERE",
    "amount": 250,
    "category": "carpet",
    "paymentType": "attendant_cash"
  }'
```

**Required Fields:**
- `attendant` (string): ObjectId of the attendant
- `amount` (number): Booking amount
- `category` (string): Either "vehicle" or "carpet"
- `paymentType` (string): "attendant_cash", "admin_cash", or "admin_till"

**For Vehicle Bookings, also include:**
- `carRegistrationNumber` (string): Vehicle registration number
- `serviceType` (string): "full wash" or "half wash"
- `vehicleType` (string): Type of vehicle

**For Carpet Bookings, also include:**
- `phoneNumber` (string): Customer phone number
- `color` (string): Carpet color

### 16. Get Booking by ID (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/bookings/BOOKING_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 17. Update Booking (Admin Only)

#### For Vehicle Bookings:
```bash
curl -X PATCH http://localhost:3000/api/v1/bookings/BOOKING_ID_HERE \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "carRegistrationNumber": "KCA 456B",
    "amount": 750,
    "serviceType": "half wash",
    "vehicleType": "SUV",
    "category": "vehicle",
    "paymentType": "admin_till",
    "status": "completed"
  }'
```

#### For Carpet Cleaning Bookings:
```bash
curl -X PATCH http://localhost:3000/api/v1/bookings/BOOKING_ID_HERE \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "phoneNumber": "+254712345679",
    "color": "Blue",
    "amount": 300,
    "category": "carpet",
    "paymentType": "admin_till",
    "status": "completed"
  }'
```

**Optional Fields (all can be updated):**
- `carRegistrationNumber` (string): Vehicle registration number (vehicle bookings)
- `phoneNumber` (string): Customer phone number (carpet bookings)
- `color` (string): Carpet color (carpet bookings)
- `attendant` (string): ObjectId of the attendant
- `amount` (number): Booking amount
- `serviceType` (string): "full wash" or "half wash" (vehicle bookings)
- `vehicleType` (string): Type of vehicle (vehicle bookings)
- `category` (string): "vehicle" or "carpet"
- `paymentType` (string): "attendant_cash", "admin_cash", or "admin_till"
- `status` (string): "pending", "in progress", "completed", or "cancelled"

### 18. Delete Booking (Admin Only)
```bash
curl -X DELETE http://localhost:3000/api/v1/bookings/BOOKING_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 19. Get Bookings by Attendant
```bash
curl -X GET http://localhost:3000/api/v1/bookings/attendant/ATTENDANT_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 20. Get Bookings by Status
```bash
curl -X GET http://localhost:3000/api/v1/bookings/status/pending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Wallet Management Endpoints

### 21. Get My Wallet (Attendant Only)
```bash
# Get current day's wallet balance
curl -X GET http://localhost:3000/api/v1/wallets/my-wallet \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get wallet balance for a specific date
curl -X GET "http://localhost:3000/api/v1/wallets/my-wallet?date=2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "wallet": {
      "_id": "wallet_id",
      "attendant": {
        "_id": "attendant_id",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "attendant"
      },
      "balance": 150.00,
      "companyDebt": 90.00,
      "totalEarnings": 500.00,
      "totalCommission": 200.00,
      "totalCompanyShare": 300.00,
      "isPaid": false
    },
    "date": "2024-01-15"
  }
}
```

### 22. Settle Attendant Balances (Admin Only)
```bash
curl -X POST http://localhost:3000/api/v1/wallets/settle \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attendantIds": ["attendant_id_1", "attendant_id_2", "attendant_id_3"]
  }'
```

**Response:**
```json
{
  "status": "success",
  "message": "Settled balances for 3 attendants",
  "data": {
    "settledWallets": [
      {
        "attendantId": "attendant_id_1",
        "attendantName": "John Doe",
        "attendantEmail": "john@example.com",
        "wallet": {
          "_id": "wallet_id",
          "balance": 0,
          "isPaid": true
        },
        "bookingsUpdated": 5
      }
    ],
    "errors": []
  }
}
```

### 23. Get Daily Wallet Summary (Admin Only)
```bash
# Get current day's summary
curl -X GET http://localhost:3000/api/v1/wallets/daily-summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get summary for a specific date
curl -X GET "http://localhost:3000/api/v1/wallets/daily-summary?date=2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "summary": {
      "date": "2024-01-15",
      "totalAttendants": 3,
      "totalBookings": 15,
      "totalAmount": 7500,
      "totalCommission": 3000,
      "totalCompanyShare": 4500,
      "attendants": [
        {
          "attendantId": "attendant_id_1",
          "attendantName": "John Doe",
          "attendantEmail": "john@example.com",
          "totalBookings": 5,
          "totalAmount": 2500,
          "totalCommission": 1000,
          "totalCompanyShare": 1500,
          "attendantCashBookings": 3,
          "attendantCashAmount": 1500,
          "companyDebt": 1500
        }
      ]
    }
  }
}
```

### 24. Get All Wallets (Admin Only)
```bash
# Get current day's wallets
curl -X GET http://localhost:3000/api/v1/wallets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get wallets for a specific date
curl -X GET "http://localhost:3000/api/v1/wallets?date=2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 25. Get Wallet Summary (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 25. Get Company Debt Summary (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/debt-summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 26. Get Unpaid Wallets (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/unpaid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 27. Get System Wallet (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/system \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "systemWallet": {
      "_id": "system_wallet_id",
      "totalRevenue": 5000.00,
      "totalCompanyShare": 3000.00,
      "totalAttendantPayments": 1200.00,
      "totalAdminCollections": 2000.00,
      "totalAttendantCollections": 3000.00,
      "currentBalance": 3200.00,
      "lastUpdated": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

### 28. Get System Wallet Summary (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/system/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "summary": {
      "systemWallet": {
        "totalRevenue": 5000.00,
        "totalCompanyShare": 3000.00,
        "totalAttendantPayments": 1200.00,
        "totalAdminCollections": 2000.00,
        "totalAttendantCollections": 3000.00,
        "currentBalance": 3200.00
      },
      "totalAttendantDebts": 800.00,
      "netCompanyBalance": 2400.00
    }
  }
}
```

### 29. Get Attendant Wallet (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/ATTENDANT_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 30. Get Attendant Debt Details (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/ATTENDANT_ID_HERE/debt \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 31. Mark Attendant as Paid (Admin Only)
```bash
curl -X PATCH http://localhost:3000/api/v1/wallets/ATTENDANT_ID_HERE/mark-paid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 32. Rebuild Wallet Balance (Admin Only)
```bash
curl -X PATCH http://localhost:3000/api/v1/wallets/ATTENDANT_ID_HERE/rebuild \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Note:** Wallet balances are automatically recalculated from transactions whenever:
- A booking is created, updated, or deleted
- A wallet is accessed (getMyWallet, getAttendantWallet, etc.)
- Payment submissions are made
- Attendants are marked as paid

This endpoint is available for manual balance verification if needed.

**Response:**
```json
{
  "status": "success",
  "message": "Wallet balance rebuilt successfully",
  "data": {
    "wallet": {
      "_id": "wallet_id",
      "attendant": "attendant_id",
      "balance": 150.00,
      "companyDebt": 90.00,
      "totalEarnings": 500.00,
      "totalCommission": 200.00,
      "totalCompanyShare": 300.00,
      "isPaid": false
    }
  }
}
```

### 33. Get Attendant Bookings (Attendant/Admin)
```bash
# Get my bookings (attendant)
curl -X GET http://localhost:3000/api/v1/wallets/my-wallet/bookings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get specific attendant's bookings (admin)
curl -X GET http://localhost:3000/api/v1/wallets/ATTENDANT_ID_HERE/bookings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "results": 5,
  "data": {
    "bookings": [
      {
        "_id": "booking_id",
        "carRegistrationNumber": "KCA 123A",
        "attendant": {
          "_id": "attendant_id",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "amount": 500,
        "serviceType": "full wash",
        "paymentType": "attendant_cash",
        "status": "completed",
        "attendantPaid": false,
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### 34. Get Booking Details (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/wallets/bookings/BOOKING_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "booking": {
      "_id": "booking_id",
      "carRegistrationNumber": "KCA 123A",
      "attendant": {
        "_id": "attendant_id",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "amount": 500,
      "serviceType": "full wash",
      "paymentType": "attendant_cash",
      "status": "completed",
      "attendantPaid": false,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

## Wallet System Business Logic

### Commission Structure
- **Attendant Commission**: 40% of booking amount (ALWAYS)
- **Company Share**: 60% of booking amount
- **Company Debt**: Only when attendant collects cash

### Payment Types and Wallet Behavior
- **`attendant_cash`**: Attendant gets 40% commission + owes 60% to company (wallet shows negative company share)
- **`admin_cash`**: Attendant gets 40% commission + no debt (admin has money) + company wallet gets 60%
- **`admin_till`**: Attendant gets 40% commission + no debt (admin has money) + company wallet gets 60%

### Wallet Balance Calculation
- **Attendant Cash**: Balance = -Company Share (e.g., -150 for 60% of 250)
- **Admin Cash/Till**: Balance = Commission (e.g., 400 for 40% of 1000)
- **Reversal**: Opposite of the original transaction

### End-of-Day Summary
**Attendant should have 40% of total amount earned, Company should have 60% of total amount earned.**

### Wallet Operations
1. **Automatic Credit**: When ANY booking is created, attendant gets 40% commission
2. **Debt Tracking**: Company debt only increases when attendant collects cash
3. **Payment Submission**: Attendants submit company share to reduce debt
4. **Payment Reset**: Admins can mark attendants as paid (resets balance and debt)
5. **System Tracking**: System wallet tracks all revenue and company share

## Daily Payment Wallet System

### Overview
The wallet system now operates on a daily basis, calculating balances only from completed bookings from the current date. Attendants are paid daily, and the system provides flexibility for editing bookings while maintaining accurate daily wallet balances.

### Key Features
1. **Daily Calculation**: Wallet balances are calculated only from today's completed bookings
2. **Daily Payments**: Attendants are paid daily based on current day's earnings
3. **Flexible Editing**: Bookings can be edited without complex transaction reversals
4. **Attendant Paid Tracking**: Each booking tracks if the attendant has been paid
5. **Batch Settlement**: Multiple attendants can be settled at once

### Business Rules
1. **Daily Balance Calculation**: Wallet balance = sum of today's completed unpaid bookings based on payment type
2. **Payment Type Logic**: 
   - `attendant_cash`: Balance = -companyShare (attendant owes company)
   - `admin_cash/admin_till`: Balance = +commission (no debt)
3. **Attendant Paid Status**: Tracks if attendant commission has been paid for each booking
4. **Exclude Paid Bookings**: Once `attendantPaid` is `true`, those bookings are excluded from all balance calculations
5. **Daily Reset**: After payment, wallet is reset for the next day
6. **Batch Processing**: Multiple attendants can be settled simultaneously

### Daily Balance Calculation Logic
- **Total Earnings**: Sum of today's completed booking amounts (excluding paid bookings)
- **Total Commission**: 40% of today's total earnings (excluding paid bookings)
- **Total Company Share**: 60% of today's total earnings (excluding paid bookings)
- **Company Debt**: Sum of company share from today's `attendant_cash` bookings (excluding paid bookings)
- **Wallet Balance**: Commission from today's admin bookings minus company share from today's attendant cash bookings (excluding paid bookings)
- **Paid Bookings**: Once `attendantPaid` is `true`, those bookings are excluded from balance calculations

### Daily Payment Flow
1. **Booking Creation**: Wallet balance is calculated from today's completed bookings
2. **Booking Update**: Wallet balance is recalculated to reflect changes
3. **Booking Deletion**: Wallet balance is recalculated without the deleted booking
4. **Daily Settlement**: All unpaid bookings for selected attendants are marked as paid, wallets are reset
5. **Next Day**: Process starts fresh for the new day

### Date Parameter Usage
Most wallet endpoints now support an optional `date` query parameter to view unpaid balances for previous days:

- **Format**: `YYYY-MM-DD` (e.g., `2024-01-15`)
- **Default**: If no date is provided, uses current date
- **Purpose**: View unpaid balances for any specific date
- **Filtering**: When a date is specified, only returns wallets that have unpaid bookings for that date
- **Use Cases**:
  - Review previous day's unpaid balances
  - Audit historical payment data
  - Check what was owed on a specific date
  - Filter out wallets with no activity on a specific date

**Example Usage:**
```bash
# Get wallet balance for January 15, 2024
curl -X GET "http://localhost:3000/api/v1/wallets/my-wallet?date=2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get daily summary for January 15, 2024
curl -X GET "http://localhost:3000/api/v1/wallets/daily-summary?date=2024-01-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Query Parameters for Filtering

### Get All Users with Filters
```bash
# Filter by role (attendant or admin)
curl -X GET "http://localhost:3000/api/v1/users?role=attendant" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get all users (no filter)
curl -X GET "http://localhost:3000/api/v1/users" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get All Bookings with Filters
```bash
# Filter by date range
curl -X GET "http://localhost:3000/api/v1/bookings?createdAt[gte]=2024-01-01&createdAt[lte]=2024-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter by amount range
curl -X GET "http://localhost:3000/api/v1/bookings?amount[gte]=300&amount[lte]=1000" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Sort by creation date (newest first)
curl -X GET "http://localhost:3000/api/v1/bookings?sort=-createdAt" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Pagination
curl -X GET "http://localhost:3000/api/v1/bookings?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Select specific fields
curl -X GET "http://localhost:3000/api/v1/bookings?fields=carRegistrationNumber,amount,serviceType" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Status Values

### Booking Status Options:
- `pending` - Booking is pending
- `in progress` - Service is in progress
- `completed` - Service completed
- `cancelled` - Booking cancelled

### Category Options:
- `vehicle` - Vehicle wash service
- `carpet` - Carpet cleaning service

### Service Type Options (Vehicle bookings only):
- `full wash` - Complete car wash
- `half wash` - Partial car wash

### Payment Type Options:
- `attendant_cash` - Attendant collects cash
- `admin_cash` - Admin collects cash
- `admin_till` - Admin collects via mobile till

### User Role Options:
- `attendant` - Service attendant
- `admin` - System administrator

## Notes

1. **Replace placeholders:**
   - `YOUR_JWT_TOKEN` - Get this from login response
   - `USER_ID_HERE` - Get from user creation or listing
   - `BOOKING_ID_HERE` - Get from booking creation or listing
   - `ATTENDANT_ID_HERE` - Get from user listing
   - `RESET_TOKEN_HERE` - Get from forgot password email

2. **Authentication:** Most endpoints require a valid JWT token in the Authorization header.

3. **Admin Only:** Some endpoints require admin role - ensure your user has admin privileges.

4. **Content-Type:** Always include `Content-Type: application/json` for POST/PATCH requests.

5. **Error Handling:** The API returns structured error responses with appropriate HTTP status codes.
