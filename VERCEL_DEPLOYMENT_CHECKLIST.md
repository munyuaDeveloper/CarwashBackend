# ✅ Vercel Deployment Checklist

## Pre-Deployment Setup

### 1. Code Preparation
- [x] Created `vercel.json` configuration
- [x] Created `api/index.ts` serverless entry point
- [x] Updated `package.json` with vercel-build script
- [x] Updated CORS configuration for production
- [x] Added `.vercel/` to `.gitignore`

### 2. Environment Variables Setup
- [ ] Set up MongoDB Atlas cluster
- [ ] Get MongoDB connection string
- [ ] Prepare JWT secret (use a strong, random string)
- [ ] Prepare email credentials (if using email features)

### 3. GitHub Repository
- [ ] Push all changes to GitHub
- [ ] Ensure repository is public or connected to Vercel account

## Vercel Deployment Steps

### 1. Connect to Vercel
- [ ] Go to [vercel.com](https://vercel.com)
- [ ] Sign in with GitHub
- [ ] Click "New Project"
- [ ] Import your GitHub repository

### 2. Configure Project Settings
- [ ] Framework Preset: Other
- [ ] Build Command: `npm run vercel-build`
- [ ] Output Directory: `dist`
- [ ] Install Command: `npm install`

### 3. Set Environment Variables
In Vercel Dashboard > Project Settings > Environment Variables:

#### Required Variables:
- [ ] `DATABASE` = `mongodb+srv://username:password@cluster.mongodb.net/carwash`
- [ ] `DATABASE_PASSWORD` = `your_password_here`
- [ ] `JWT_SECRET` = `your-super-secret-jwt-key-here`
- [ ] `JWT_EXPIRES_IN` = `90d`
- [ ] `JWT_COOKIE_EXPIRES_IN` = `90`
- [ ] `NODE_ENV` = `production`

#### Optional Email Variables:
- [ ] `EMAIL_FROM` = `noreply@yourdomain.com`
- [ ] `EMAIL_USERNAME` = `your-email@yourdomain.com`
- [ ] `EMAIL_PASSWORD` = `your-email-password`
- [ ] `EMAIL_HOST` = `smtp.gmail.com`
- [ ] `EMAIL_PORT` = `587`
- [ ] `EMAIL_SECURE` = `false`

### 4. Deploy
- [ ] Click "Deploy"
- [ ] Wait for build to complete
- [ ] Note your deployment URL

## Post-Deployment Testing

### 1. Basic Health Check
- [ ] Test: `GET https://your-project.vercel.app/api/v1/users`
- [ ] Should return authentication error (expected)

### 2. User Registration Test
```bash
curl -X POST https://your-project.vercel.app/api/v1/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "passwordConfirm": "password123",
    "role": "attendant"
  }'
```

### 3. User Login Test
```bash
curl -X POST https://your-project.vercel.app/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## Troubleshooting

### Common Issues:
- [ ] Build fails: Check all dependencies in package.json
- [ ] Database connection fails: Verify MongoDB Atlas settings
- [ ] CORS errors: Update CORS origins in app.ts
- [ ] Environment variables not found: Check Vercel dashboard settings

### Debug Steps:
- [ ] Check Vercel function logs
- [ ] Verify environment variables are set
- [ ] Test database connection
- [ ] Check MongoDB Atlas network access

## Production Considerations

### Security:
- [ ] Use strong, unique JWT secret
- [ ] Use strong database password
- [ ] Update CORS origins to your actual frontend domains
- [ ] Consider rate limiting adjustments

### Monitoring:
- [ ] Monitor Vercel function logs
- [ ] Set up error tracking (optional)
- [ ] Monitor database performance

## Next Steps After Deployment

1. **Update Frontend**: Point your frontend to the new Vercel URL
2. **Test All Endpoints**: Run through your API documentation
3. **Monitor Performance**: Check Vercel analytics
4. **Set up Custom Domain**: (Optional) Configure custom domain in Vercel

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Express.js on Vercel](https://vercel.com/docs/concepts/functions/serverless-functions)
