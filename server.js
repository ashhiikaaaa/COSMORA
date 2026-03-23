// ═══════════════════════════════════════════════════════════
//  Cosmora Backend — Express Server
//  Space Tourism Platform API
// ═══════════════════════════════════════════════════════════
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Request Logger ──────────────────────────────
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── Static Files (Serve Frontend) ───────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ──────────────────────────────────
const authRoutes = require('./routes/auth');
const missionRoutes = require('./routes/missions');
const destinationRoutes = require('./routes/destinations');
const bookingRoutes = require('./routes/bookings');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/auth', authRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/destinations', destinationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ─── Health Check ────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    service: 'Cosmora Backend API',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ─── API Documentation Route ─────────────────────
app.get('/api', (req, res) => {
  res.json({
    service: 'Cosmora Space Tourism API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/signup': 'Create new account',
        'POST /api/auth/login': 'Sign in',
        'GET  /api/auth/profile': 'Get user profile (auth required)',
        'PUT  /api/auth/profile': 'Update profile (auth required)',
      },
      missions: {
        'GET  /api/missions': 'List missions (filter: dest, badge, search, sort)',
        'GET  /api/missions/featured': 'Featured missions',
        'GET  /api/missions/:id': 'Mission detail with timeline/safety',
        'GET  /api/missions/status/live': 'Real-time mission status',
      },
      destinations: {
        'GET  /api/destinations': 'All destinations',
        'GET  /api/destinations/:id': 'Destination with its missions',
      },
      bookings: {
        'GET  /api/bookings': 'User bookings (auth required)',
        'POST /api/bookings': 'Create booking (auth required)',
        'GET  /api/bookings/:id': 'Booking detail (auth required)',
        'DELETE /api/bookings/:id': 'Cancel booking (auth required)',
      },
      dashboard: {
        'GET  /api/dashboard': 'Dashboard KPIs (auth required)',
        'GET  /api/dashboard/stats': 'Public stats',
      },
      system: {
        'GET  /api/health': 'Health check',
      }
    }
  });
});

// ─── SPA Fallback ────────────────────────────────
// Handle unknown API routes first
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// Serve frontend for all other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ───────────────────────────────
app.use((err, req, res, next) => {
  console.error('🚨 Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Something went wrong on our end. Mission Control has been notified.'
  });
});

// ─── Start Server ────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║   🚀 COSMORA BACKEND — LIVE                     ║
  ║                                                  ║
  ║   Server:  http://localhost:${PORT}               ║
  ║   API:     http://localhost:${PORT}/api            ║
  ║   Health:  http://localhost:${PORT}/api/health     ║
  ║                                                  ║
  ║   Demo Login:                                    ║
  ║   Email:    commander@cosmora.space               ║
  ║   Password: cosmora2031                           ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
