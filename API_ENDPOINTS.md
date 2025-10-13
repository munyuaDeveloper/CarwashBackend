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
    "paymentType": "cash"
  }'
```

### 16. Get Booking by ID (Admin Only)
```bash
curl -X GET http://localhost:3000/api/v1/bookings/BOOKING_ID_HERE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 17. Update Booking (Admin Only)
```bash
curl -X PATCH http://localhost:3000/api/v1/bookings/BOOKING_ID_HERE \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "carRegistrationNumber": "KCA 456B",
    "amount": 750,
    "serviceType": "half wash",
    "vehicleType": "SUV",
    "paymentType": "till number",
    "status": "completed"
  }'
```

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

### Service Type Options:
- `full wash` - Complete car wash
- `half wash` - Partial car wash

### Payment Type Options:
- `cash` - Cash payment
- `till number` - Mobile money payment
- `attendant collected` - Payment collected by attendant

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
