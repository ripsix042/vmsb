const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io = null;

/**
 * Attach Socket.io to the HTTP server. Authenticate via JWT and join user room.
 * Call from server.js after app.listen().
 * @param {import('http').Server} httpServer
 */
function attachSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: true },
  });

  io.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('_id').lean();
      if (!user) return next(new Error('User not found'));
      socket.userId = user._id.toString();
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const room = `user:${socket.userId}`;
    socket.join(room);
  });

  return io;
}

/**
 * Get the Socket.io server instance. Returns null if not yet attached.
 * Use in controllers to emit to user rooms: getIO()?.to(`user:${hostId}`).emit('event', payload)
 */
function getIO() {
  return io;
}

/**
 * Emit to a user's room (e.g. for real-time notification to host).
 * @param {string} userId - Host/user ID to notify
 * @param {string} event - Event name (e.g. 'walk-in:request', 'visit:checked-in')
 * @param {*} payload - Data to send
 */
function emitToUser(userId, event, payload) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

module.exports = { attachSocket, getIO, emitToUser };
