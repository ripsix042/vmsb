const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

let uri = process.env.MONGODB_URI;
if (uri && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.startsWith('MONGODB_URI=')) {
      uri = trimmed.slice('MONGODB_URI='.length).trim();
      if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
        uri = uri.slice(1, -1);
      }
    }
  }
  process.env.MONGODB_URI = uri;
} else {
  require('dotenv').config();
}

// let uri = process.env.MONGODB_URI;
if (!uri || !uri.trim()) {
  console.error('MONGODB_URI is not set. Set it in .env (local) or in Environment Variables (e.g. Render dashboard).');
  process.exit(1);
}
if (!uri.startsWith('mongodb+srv://') && !uri.startsWith('mongodb://')) {
  console.error('MONGODB_URI should start with mongodb+srv:// or mongodb://. Got:', uri.substring(0, 50) + '...');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && (uri.includes('localhost') || uri.includes('127.0.0.1'))) {
  console.error('MONGODB_URI is set to localhost. Use an Atlas connection string in production.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_DB_TLS !== 'false' && uri.startsWith('mongodb://')) {
  const lowered = uri.toLowerCase();
  if (!lowered.includes('tls=true') && !lowered.includes('ssl=true')) {
    console.error('Production MONGODB_URI (mongodb://) must explicitly enable TLS/SSL.');
    process.exit(1);
  }
}
if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_NONPROD_PROD_DB !== 'true') {
  const prodKeywords = (process.env.PROD_DB_KEYWORDS || 'prod,production')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const lowerUri = uri.toLowerCase();
  if (prodKeywords.some((k) => lowerUri.includes(k))) {
    console.error('Refusing to start non-production app against production-like database URI.');
    process.exit(1);
  }
}

const { isWeakJwtSecret } = require('./config/security');
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || !jwtSecret.trim()) {
  console.error('JWT_SECRET is not set. Set it in .env (local) or in Environment Variables (e.g. Render dashboard).');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && isWeakJwtSecret(jwtSecret)) {
  console.error('JWT_SECRET is too weak or default. Use a long random string (e.g. 32+ chars) in production.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  const smtpHost = (process.env.SMTP_HOST || '').trim().toLowerCase();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const emailFrom = (process.env.EMAIL_FROM || '').trim();
  if ((smtpHost || smtpUser) && (!smtpHost || !smtpUser || !emailFrom)) {
    console.error('SMTP_HOST, SMTP_USER and EMAIL_FROM must all be set together in production.');
    process.exit(1);
  }
  if ((smtpHost.includes('localhost') || smtpHost.includes('127.0.0.1')) && smtpHost) {
    console.error('SMTP_HOST cannot be localhost in production.');
    process.exit(1);
  }
  if (!process.env.INVITE_REDIRECT_ALLOWLIST && !process.env.FRONTEND_URL) {
    console.error('Set INVITE_REDIRECT_ALLOWLIST (or FRONTEND_URL) for safe invite redirects in production.');
    process.exit(1);
  }
}

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5050;

connectDB(uri)
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
    app.set('httpServer', server);
    const { attachSocket } = require('./services/socket');
    attachSocket(server);
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
