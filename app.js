const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { getCorsOrigin, RATE_LIMITS, isProduction } = require('./config/security');
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const usersRoutes = require('./routes/users');
const visitRequestsRoutes = require('./routes/visitRequests');
const visitorsRoutes = require('./routes/visitors');
const notificationsRoutes = require('./routes/notifications');
const settingsRoutes = require('./routes/settings');
const integrationSettingsRoutes = require('./routes/integrationSettings');
const auditLogsRoutes = require('./routes/auditLogs');
const errorHandler = require('./middleware/errorHandler');

const app = express();

if (isProduction) app.set('trust proxy', 1);
app.use(cookieParser());

const corsOrigin = getCorsOrigin();
if (corsOrigin.length === 0 && isProduction) {
  throw new Error('CORS_ORIGIN must be set in production (e.g. https://your-frontend.com)');
}
app.use(cors({ origin: corsOrigin.length ? corsOrigin : '*', credentials: true }));

app.use(helmet({
  contentSecurityPolicy: isProduction,
  crossOriginEmbedderPolicy: isProduction,
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

const API_PREFIX = '/api/v1';
const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.api.windowMs,
  max: RATE_LIMITS.api.max,
  message: { error: 'Too many requests', message: 'Try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(API_PREFIX, apiLimiter);
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/visit-requests`, visitRequestsRoutes);
app.use(`${API_PREFIX}/visitors`, visitorsRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${API_PREFIX}/settings`, settingsRoutes);
app.use(`${API_PREFIX}/integration-settings`, integrationSettingsRoutes);
app.use(`${API_PREFIX}/audit-logs`, auditLogsRoutes);
app.use(API_PREFIX, publicRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use(errorHandler);

module.exports = app;
