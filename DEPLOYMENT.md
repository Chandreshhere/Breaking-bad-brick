# Deployment Guide for EasyPanel (AWS)

This guide explains how to deploy Breaking Bad Brick to EasyPanel on AWS using Docker.

## Architecture

The deployment uses a single Docker container that:
- Builds the Vite frontend (TypeScript + Three.js)
- Builds the Firebase Functions backend (TypeScript + Express)
- Serves the static frontend files via Express
- Exposes backend API endpoints at `/api/*`
- Handles external webhooks at `/admobSsv` and `/revenuecatWebhook`

## Prerequisites

1. **Firebase Setup**
   - Firebase project created
   - Service account key generated (for Firebase Admin SDK)
   - Firestore database initialized

2. **EasyPanel Account**
   - EasyPanel instance running on AWS
   - Docker support enabled

## Environment Variables

You need to configure these environment variables in EasyPanel:

### Required
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Firebase service account JSON (stringified)
- `FIREBASE_PROJECT_ID` - Your Firebase project ID
- `PORT` - Port number (default: 8080)
- `NODE_ENV` - Set to `production`

### Optional
- Firebase configuration for the frontend (if using different project for client)
- AdMob and RevenueCat credentials (if using those services)

## Deployment Steps

### Option 1: Using EasyPanel UI

1. **Create a new project** in EasyPanel
   - Name: `breaking-bad-brick`
   - Type: Docker

2. **Configure the source**
   - Connect your Git repository
   - Branch: `main`
   - Build context: `/`
   - Dockerfile: `Dockerfile`

3. **Set environment variables**
   ```
   NODE_ENV=production
   PORT=8080
   FIREBASE_PROJECT_ID=your-project-id
   GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
   ```

4. **Configure port mapping**
   - Container port: 8080
   - Public port: 80 or 443 (with SSL)

5. **Deploy**
   - Click "Deploy" and wait for the build to complete

### Option 2: Using Docker Compose Locally (Testing)

1. **Create a `.env` file** in the root directory:
   ```env
   NODE_ENV=production
   PORT=8080
   FIREBASE_PROJECT_ID=your-project-id
   GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
   ```

2. **Build and run**:
   ```bash
   npm run docker:build
   npm run docker:up
   ```

3. **Access the app**:
   - Open `http://localhost:8080`

4. **View logs**:
   ```bash
   npm run docker:logs
   ```

5. **Stop the container**:
   ```bash
   npm run docker:down
   ```

### Option 3: Manual Docker Build

```bash
# Build the image
docker build -t breaking-bad-brick .

# Run the container
docker run -d \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e FIREBASE_PROJECT_ID=your-project-id \
  -e GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}' \
  --name breaking-bad-brick \
  breaking-bad-brick
```

## Firebase Service Account Setup

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. For EasyPanel, stringify the JSON:
   ```bash
   cat service-account.json | jq -c . | pbcopy
   ```
5. Paste the stringified JSON into the `GOOGLE_APPLICATION_CREDENTIALS_JSON` environment variable

## Health Check

The deployment includes a health check endpoint:
- URL: `http://your-domain/health`
- Returns: `{"status": "ok", "timestamp": "..."}`

EasyPanel will automatically use this endpoint to monitor the service.

## API Endpoints

Once deployed, the following endpoints are available:

### Game APIs (Callable Functions)
- `POST /api/bootstrap` - Initialize player data
- `POST /api/syncProfile` - Sync player profile
- `POST /api/startRun` - Start a game run
- `POST /api/submitRun` - Submit run results
- `POST /api/purchaseCosmetic` - Purchase cosmetic items
- `POST /api/equipCosmetic` - Equip cosmetic items
- `POST /api/getLeaderboard` - Get leaderboard data
- `POST /api/updateConsent` - Update user consent
- `POST /api/claimMission` - Claim mission rewards
- `POST /api/registerPushToken` - Register push notification token
- `POST /api/exportPlayer` - Export player data
- `POST /api/deletePlayer` - Delete player account

### External Webhooks
- `POST /admobSsv` - AdMob Server-Side Verification
- `POST /revenuecatWebhook` - RevenueCat webhook

### Frontend
- `GET /` - Serves the game (SPA)
- `GET /health` - Health check endpoint

## Updating Frontend API Calls

The frontend needs to be updated to call the new REST endpoints instead of Firebase callable functions.

Update your Firebase callable function calls from:
```typescript
const result = await httpsCallable(functions, 'bootstrap')();
```

To REST API calls:
```typescript
const result = await fetch('/api/bootstrap', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${await user.getIdToken()}`,
    'X-User-ID': user.uid
  },
  body: JSON.stringify({ data: yourData })
});
```

## Troubleshooting

### Build Fails
- Check that all dependencies are listed in `package.json`
- Verify TypeScript compiles without errors locally
- Check Docker build logs in EasyPanel

### App Won't Start
- Verify environment variables are set correctly
- Check Firebase service account JSON is valid
- Review application logs in EasyPanel

### 404 on API Calls
- Ensure frontend is calling `/api/*` endpoints
- Check that the backend server started successfully
- Verify CORS settings if calling from external domain

### Firebase Connection Issues
- Verify `GOOGLE_APPLICATION_CREDENTIALS_JSON` is set
- Check that the service account has necessary permissions
- Ensure Firestore rules allow server-side access

## Performance Optimization

1. **Enable CDN** in EasyPanel for static assets
2. **Configure auto-scaling** based on CPU/memory usage
3. **Set up monitoring** and alerts
4. **Enable HTTP/2** and compression

## Security Considerations

1. Never commit `.env` files or service account keys
2. Use EasyPanel's secret management for sensitive data
3. Enable HTTPS/SSL for all traffic
4. Regularly update dependencies
5. Implement rate limiting if needed

## Support

For issues:
1. Check EasyPanel logs
2. Review the health check endpoint
3. Verify Firebase console for backend errors
4. Check network tab in browser for frontend errors
