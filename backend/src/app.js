import cors from 'cors';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import aiRoutes from './routes/ai.routes.js';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import logRoutes from './routes/log.routes.js';
import salesforceRoutes, { salesforceOauthCallback } from './routes/salesforce.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
import { healthCheck } from './database/db.js';
import { asyncHandler } from './middleware/asyncHandler.js';
import { requireAuth } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', asyncHandler(async (req, res) => {
  const database = await healthCheck();
  res.json({ status: 'ok', service: 'salesforce-agentassist-api', database });
}));

// Public routes.
app.use('/api/v1', apiLimiter);
app.use('/api/v1/auth', authRoutes);
app.get('/api/v1/salesforce/oauth/callback', salesforceOauthCallback);

// Protected routes.
app.use('/api/v1/customers', requireAuth, customerRoutes);
app.use('/api/v1/tickets', requireAuth, ticketRoutes);
app.use('/api/v1/ai', requireAuth, aiRoutes);
app.use('/api/v1/salesforce', requireAuth, salesforceRoutes);
app.use('/api/v1/logs', requireAuth, logRoutes);
app.use('/api/v1/settings', requireAuth, settingsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
