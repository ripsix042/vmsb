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
}
if (!uri || !uri.trim()) {
  console.error('MONGODB_URI is not set. Add it to .env or set the variable in your host (e.g. Render).');
  process.exit(1);
}
if (!uri.startsWith('mongodb+srv://') && !uri.startsWith('mongodb://')) {
  console.error('MONGODB_URI should start with mongodb+srv:// or mongodb://. Got:', uri.substring(0, 50) + '...');
  process.exit(1);
}
if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
  console.error('MONGODB_URI is set to localhost. Use an Atlas connection string in production.');
  process.exit(1);
}

const { isWeakJwtSecret } = require('./config/security');
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || !jwtSecret.trim()) {
  console.error('JWT_SECRET is not set. Add it to .env or set the variable in your host (e.g. Render).');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && isWeakJwtSecret(jwtSecret)) {
  console.error('JWT_SECRET is too weak or default. Use a long random string (e.g. 32+ chars) in production.');
  process.exit(1);
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
