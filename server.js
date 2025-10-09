// server.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const redis = require('redis');
const http = require('http');
const { Server } = require('socket.io');

const logger = require('./src/utils/logger');
const { initializeDatabase } = require('./src/config/database');

// Import routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const betRoutes = require('./src/routes/bets');
const walletRoutes = require('./src/routes/wallet');
const storeRouter = require('./src/routes/store');
const judgeRouter = require('./src/routes/judges');
const socialRoutes = require('./src/routes/social');

// Import websocket handler
const { initializeWebSocket } = require('./src/websocket/handler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    credentials: true
  }
});

// Trust first proxy if behind a proxy (e.g., Heroku, Nginx)
app.set('trust proxy', 1);

// Make io available to routes
app.set('io', io);

// Initialize Redis client with new connection method
const redisClient = redis.createClient({
  url: process.env.UPSTASH_REDIS_URL
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Connected to Redis'));
redisClient.on('ready', () => logger.info('Redis Client Ready'));

// Import RedisStore AFTER session
const RedisStore = require('connect-redis').default;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 500, // Higher for dev
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Session configuration
app.use(session({
  store: new RedisStore({ 
    client: redisClient,
    prefix: 'fwager:sess:'
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/judges', judgeRouter);
app.use('/api/store', storeRouter);
app.use('/api/social', socialRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Connect to Redis
    await redisClient.connect();
    
    // Initialize database
    await initializeDatabase();
    
    // Initialize WebSocket
    initializeWebSocket(io, redisClient);
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    await redisClient.quit();
    process.exit(0);
  });
});

startServer();

module.exports = { app, io, redisClient };