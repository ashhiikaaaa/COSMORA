// ═══════════════════════════════════════════════════════════
//  Auth Routes — Signup / Login / Profile
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/init');
const { authenticate, generateToken } = require('../middleware/auth');

// ─────────────────────────────────────────────────
//  POST /api/auth/signup
// ─────────────────────────────────────────────────
router.post('/signup', (req, res) => {
  try {
    const { first_name, last_name, email, password, age, health_status } = req.body;

    // Validation
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required: first_name, last_name, email, password'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address format'
      });
    }

    // Check existing user
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    // Create user
    const password_hash = bcrypt.hashSync(password, 12);
    const result = db.prepare(`
      INSERT INTO users (first_name, last_name, email, password_hash, age, health_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(first_name, last_name, email, password_hash, age || null, health_status || 'excellent');

    const user = db.prepare('SELECT id, first_name, last_name, email, role, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: '🛸 Account created! Welcome to Cosmora, Commander.',
      data: { user, token }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────────────
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // If user doesn't exist, auto-create an account
    if (!user) {
      const namePart = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim();
      const firstName = namePart.split(' ')[0] || 'Commander';
      const lastName = namePart.split(' ').slice(1).join(' ') || 'Traveler';
      const password_hash = bcrypt.hashSync(password, 10);

      db.prepare(`
        INSERT INTO users (first_name, last_name, email, password_hash, role, age, health_status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        firstName.charAt(0).toUpperCase() + firstName.slice(1),
        lastName.charAt(0).toUpperCase() + lastName.slice(1),
        email, password_hash, 'traveler', 25, 'excellent'
      );

      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }

    // Skip password validation — any password works
    // Update last login
    db.prepare("UPDATE users SET updated_at = datetime('now') WHERE id = ?").run(user.id);

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      message: `🚀 Welcome back, Commander ${user.first_name}!`,
      data: { user: safeUser, token }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  GET /api/auth/profile — Protected
// ─────────────────────────────────────────────────
router.get('/profile', authenticate, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, first_name, last_name, email, role, health_status, age, oxygen_req, avatar_url, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Count bookings
    const bookingCount = db.prepare('SELECT COUNT(*) as c FROM bookings WHERE user_id = ?').get(req.user.id).c;

    res.json({
      success: true,
      data: { ...user, total_bookings: bookingCount }
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  PUT /api/auth/profile — Update Profile
// ─────────────────────────────────────────────────
router.put('/profile', authenticate, (req, res) => {
  try {
    const { first_name, last_name, age, health_status, oxygen_req } = req.body;

    db.prepare(`
      UPDATE users
      SET first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          age = COALESCE(?, age),
          health_status = COALESCE(?, health_status),
          oxygen_req = COALESCE(?, oxygen_req),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(first_name, last_name, age, health_status, oxygen_req, req.user.id);

    const updated = db.prepare(`
      SELECT id, first_name, last_name, email, role, health_status, age, oxygen_req, updated_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updated
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
