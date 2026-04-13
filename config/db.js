const mongoose = require('mongoose');

/**
 * @param {string} [uri] - Optional; if not provided, uses process.env.MONGODB_URI
 */
const connectDB = async (uri = process.env.MONGODB_URI) => {
  const connectionUri = (uri || '').trim();
  if (!connectionUri) {
    console.error('MONGODB_URI is not set. Add it to visitormanagementbackend/.env (see .env.example).');
    process.exit(1);
  }
  try {
    const conn = await mongoose.connect(connectionUri);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`MongoDB connected: ${conn.connection.host}`);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
