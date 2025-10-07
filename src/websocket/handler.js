const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function initializeWebSocket(io, redisClient) {
  // Authentication middleware for socket connections
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });
  
  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId}`);
    
    // Join user's personal room
    socket.join(`user:${socket.userId}`);
    
    // Join bet room
    socket.on('join_bet', (betId) => {
      socket.join(`bet:${betId}`);
      logger.info(`User ${socket.userId} joined bet room: ${betId}`);
      
      // Broadcast to bet room that user joined
      socket.to(`bet:${betId}`).emit('user_joined_room', {
        userId: socket.userId,
        betId
      });
    });
    
    // Leave bet room
    socket.on('leave_bet', (betId) => {
      socket.leave(`bet:${betId}`);
      logger.info(`User ${socket.userId} left bet room: ${betId}`);
      
      socket.to(`bet:${betId}`).emit('user_left_room', {
        userId: socket.userId,
        betId
      });
    });
    
    // Real-time score updates
    socket.on('score_update', async (data) => {
      const { betId, holeNumber, score } = data;
      
      // Broadcast score to all users in bet room
      io.to(`bet:${betId}`).emit('score_updated', {
        userId: socket.userId,
        betId,
        holeNumber,
        score,
        timestamp: new Date().toISOString()
      });
      
      // Store in Redis for quick access
      try {
        await redisClient.hSet(
          `bet:${betId}:scores`,
          `${socket.userId}:${holeNumber}`,
          JSON.stringify({ score, timestamp: Date.now() })
        );
      } catch (error) {
        logger.error('Redis score storage error:', error);
      }
    });
    
    // Chat messages in bet lobby
    socket.on('lobby_message', (data) => {
      const { betId, message } = data;
      
      io.to(`bet:${betId}`).emit('new_message', {
        userId: socket.userId,
        message,
        timestamp: new Date().toISOString()
      });
    });
    
    // Quick reactions (emojis, etc.)
    socket.on('quick_reaction', (data) => {
      const { betId, reaction } = data;
      
      socket.to(`bet:${betId}`).emit('reaction_received', {
        userId: socket.userId,
        reaction,
        timestamp: new Date().toISOString()
      });
    });
    
    // Typing indicator
    socket.on('typing', (data) => {
      const { betId } = data;
      socket.to(`bet:${betId}`).emit('user_typing', {
        userId: socket.userId
      });
    });
    
    // Disconnect
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.userId}`);
    });
    
    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });
  
  // Broadcast system notifications
  io.broadcastNotification = (userId, notification) => {
    io.to(`user:${userId}`).emit('notification', notification);
  };
  
  // Broadcast to bet room
  io.broadcastToBet = (betId, event, data) => {
    io.to(`bet:${betId}`).emit(event, data);
  };
  
  logger.info('WebSocket server initialized');
  
  return io;
}

module.exports = { initializeWebSocket };