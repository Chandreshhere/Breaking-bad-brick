/**
 * Standalone Express server for EasyPanel deployment.
 * Serves the frontend static files and wraps Firebase callable functions as REST endpoints.
 */
import express from 'express';
import path from 'path';
import cors from 'cors';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Import Firebase functions
import { bootstrap } from './callable/bootstrap';
import { syncProfile } from './callable/syncProfile';
import { startRun, submitRun } from './callable/runs';
import { purchaseCosmetic, equipCosmetic } from './callable/shop';
import { getLeaderboard } from './callable/leaderboard';
import { updateConsent } from './callable/consent';
import { claimMission } from './callable/missions';
import { registerPushToken } from './callable/push';
import { exportPlayer, deletePlayer } from './callable/privacy';
import { admobSsv } from './http/admobSsv';
import { revenuecatWebhook } from './http/revenuecatWebhook';

// Helper to wrap callable functions as Express endpoints
const wrapCallable = (fn: any) => async (req: express.Request, res: express.Response) => {
  try {
    const context = {
      auth: req.headers.authorization ? {
        uid: req.headers['x-user-id'] || '',
        token: {}
      } : undefined,
      app: req.headers['x-app-check-token'] ? {} : undefined,
      rawRequest: req,
    };

    const result = await fn(req.body.data || req.body, context);
    res.json({ data: result });
  } catch (error: any) {
    console.error('Function error:', error);
    res.status(error.code || 500).json({
      error: {
        message: error.message || 'Internal server error',
        code: error.code || 'INTERNAL'
      }
    });
  }
};

// API Routes - Callable functions as REST endpoints
app.post('/api/bootstrap', wrapCallable(bootstrap));
app.post('/api/syncProfile', wrapCallable(syncProfile));
app.post('/api/startRun', wrapCallable(startRun));
app.post('/api/submitRun', wrapCallable(submitRun));
app.post('/api/purchaseCosmetic', wrapCallable(purchaseCosmetic));
app.post('/api/equipCosmetic', wrapCallable(equipCosmetic));
app.post('/api/getLeaderboard', wrapCallable(getLeaderboard));
app.post('/api/updateConsent', wrapCallable(updateConsent));
app.post('/api/claimMission', wrapCallable(claimMission));
app.post('/api/registerPushToken', wrapCallable(registerPushToken));
app.post('/api/exportPlayer', wrapCallable(exportPlayer));
app.post('/api/deletePlayer', wrapCallable(deletePlayer));

// HTTP endpoints (external webhooks)
app.post('/admobSsv', (req, res) => admobSsv(req, res));
app.post('/revenuecatWebhook', (req, res) => revenuecatWebhook(req, res));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend files
const frontendPath = path.join(__dirname, '../../dist');
app.use(express.static(frontendPath));

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend served from: ${frontendPath}`);
});
