# Environment Variables for Vercel Deployment

## Required Environment Variables

Set these in your Vercel dashboard under Project Settings > Environment Variables:

### Database Configuration
```
DATABASE=mongodb+srv://username:password@cluster.mongodb.net/carwash
DATABASE_PASSWORD=your_password_here
```

### JWT Configuration
```
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=90d
JWT_COOKIE_EXPIRES_IN=90
```

### Email Configuration (Optional)
```
EMAIL_FROM=noreply@yourdomain.com
EMAIL_USERNAME=your-email@yourdomain.com
EMAIL_PASSWORD=your-email-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

## How to Set Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add each variable with its value
5. Make sure to set them for Production, Preview, and Development environments
