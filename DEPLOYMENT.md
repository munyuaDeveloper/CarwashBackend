# 🚀 Deploying Carwash Backend to Vercel

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Push your code to GitHub
3. **MongoDB Atlas**: Set up a MongoDB Atlas cluster
4. **Environment Variables**: Prepare your environment variables

## Deployment Steps

### 1. Prepare Your Repository

Make sure your code is pushed to GitHub with the following files:
- `vercel.json` (Vercel configuration)
- `api/index.ts` (Serverless entry point)
- `ENVIRONMENT_VARIABLES.md` (Environment variables guide)

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will automatically detect it's a Node.js project

### 3. Configure Build Settings

Vercel should auto-detect these settings:
- **Framework Preset**: Other
- **Build Command**: `npm run vercel-build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 4. Set Environment Variables

In your Vercel dashboard:
1. Go to Project Settings > Environment Variables
2. Add the following variables:

#### Required Variables:
```
DATABASE=mongodb+srv://username:password@cluster.mongodb.net/carwash
DATABASE_PASSWORD=your_password_here
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=90d
JWT_COOKIE_EXPIRES_IN=90
NODE_ENV=production
```

#### Optional Email Variables:
```
EMAIL_FROM=noreply@yourdomain.com
EMAIL_USERNAME=your-email@yourdomain.com
EMAIL_PASSWORD=your-email-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

### 5. Deploy

1. Click "Deploy" in Vercel
2. Wait for the build to complete
3. Your API will be available at: `https://your-project-name.vercel.app`

## API Endpoints

After deployment, your API will be available at:
- Base URL: `https://your-project-name.vercel.app/api/v1`
- Example: `https://your-project-name.vercel.app/api/v1/users/signup`

## Testing Your Deployment

### 1. Test Health Check
```bash
curl https://your-project-name.vercel.app/api/v1/users
```

### 2. Test User Registration
```bash
curl -X POST https://your-project-name.vercel.app/api/v1/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "passwordConfirm": "password123",
    "role": "attendant"
  }'
```

## Troubleshooting

### Common Issues:

1. **Build Failures**: Check that all dependencies are in `package.json`
2. **Database Connection**: Verify MongoDB Atlas connection string
3. **Environment Variables**: Ensure all required variables are set
4. **CORS Issues**: Check your CORS configuration in `app.ts`

### Debug Steps:

1. Check Vercel function logs in the dashboard
2. Verify environment variables are set correctly
3. Test database connection locally first
4. Check MongoDB Atlas network access settings

## Production Considerations

1. **Security**: Use strong JWT secrets and database passwords
2. **Rate Limiting**: Your current rate limiting should work fine
3. **CORS**: Configured for React Native apps (allows all origins)
4. **Monitoring**: Consider adding logging and monitoring
5. **Mobile App Security**: Consider implementing additional API key validation for mobile apps

## Updating Your Deployment

1. Push changes to your GitHub repository
2. Vercel will automatically redeploy
3. Check the deployment logs for any issues

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify all environment variables are set
3. Test your API endpoints
4. Check MongoDB Atlas connection
