// ═══════════════════════════════════════════════════════════
//  Bookings Routes — Create, List, Cancel
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/init');
const { authenticate } = require('../middleware/auth');

// All booking routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────
//  GET /api/bookings — User's bookings
// ─────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT b.*, m.name as mission_name, m.launch_date, m.duration, m.dest_id,
             d.name as dest_name, d.emoji as dest_emoji, d.gradient as dest_gradient
      FROM bookings b
      LEFT JOIN missions m ON b.mission_id = m.id
      LEFT JOIN destinations d ON m.dest_id = d.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(req.user.id);

    res.json({
      success: true,
      data: bookings,
      total: bookings.length
    });
  } catch (err) {
    console.error('Bookings list error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  POST /api/bookings — Create a new booking
// ─────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { mission_id, seat, payment_method } = req.body;

    if (!mission_id || !seat) {
      return res.status(400).json({
        success: false,
        error: 'mission_id and seat are required'
      });
    }

    // Check mission exists and has seats
    const mission = db.prepare('SELECT * FROM missions WHERE id = ?').get(mission_id);
    if (!mission) {
      return res.status(404).json({ success: false, error: 'Mission not found' });
    }

    if (mission.seats_left <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Sorry, this mission is fully booked'
      });
    }

    // Check seat not already taken
    const seatTaken = db.prepare(`
      SELECT id FROM bookings
      WHERE mission_id = ? AND seat = ? AND status IN ('confirmed', 'upcoming')
    `).get(mission_id, seat);

    if (seatTaken) {
      return res.status(400).json({
        success: false,
        error: `Seat ${seat} is already taken. Please select another seat.`
      });
    }

    // Check user doesn't already have a booking for this mission
    const existingBooking = db.prepare(`
      SELECT id FROM bookings
      WHERE user_id = ? AND mission_id = ? AND status IN ('confirmed', 'upcoming')
    `).get(req.user.id, mission_id);

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        error: 'You already have a booking for this mission'
      });
    }

    // Calculate pricing
    const basePrice = mission.price;
    const lifeSupportFee = 12500;
    const aiGuideFee = 4800;
    const subtotal = basePrice + lifeSupportFee + aiGuideFee;
    const tax = Math.round(subtotal * 0.08);
    const totalPrice = subtotal + tax;

    // Generate booking ID
    const year = new Date().getFullYear();
    const seq = String(Math.floor(10000 + Math.random() * 90000));
    const bookingId = `CMR-${year}-${seq}`;

    // Create booking
    db.prepare(`
      INSERT INTO bookings (id, user_id, mission_id, seat, base_price, tax, total_price, status, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(bookingId, req.user.id, mission_id, seat, basePrice, tax, totalPrice, 'confirmed', payment_method || 'card');

    // Decrement seats
    db.prepare('UPDATE missions SET seats_left = seats_left - 1 WHERE id = ?').run(mission_id);

    // Check if mission is now full
    const updated = db.prepare('SELECT seats_left FROM missions WHERE id = ?').get(mission_id);
    if (updated.seats_left <= 0) {
      db.prepare("UPDATE missions SET badge = 'full' WHERE id = ?").run(mission_id);
    }

    // Fetch complete booking
    const booking = db.prepare(`
      SELECT b.*, m.name as mission_name, m.launch_date, m.duration,
             d.name as dest_name, d.emoji as dest_emoji
      FROM bookings b
      LEFT JOIN missions m ON b.mission_id = m.id
      LEFT JOIN destinations d ON m.dest_id = d.id
      WHERE b.id = ?
    `).get(bookingId);

    res.status(201).json({
      success: true,
      message: '🎉 Booking confirmed! Welcome aboard, Commander.',
      data: booking
    });
  } catch (err) {
    console.error('Booking create error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  GET /api/bookings/:id — Single booking detail
// ─────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, m.name as mission_name, m.launch_date, m.duration, m.dest_id,
             d.name as dest_name, d.emoji as dest_emoji, d.gradient as dest_gradient
      FROM bookings b
      LEFT JOIN missions m ON b.mission_id = m.id
      LEFT JOIN destinations d ON m.dest_id = d.id
      WHERE b.id = ? AND b.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    console.error('Booking detail error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  DELETE /api/bookings/:id — Cancel booking
// ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT * FROM bookings WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking is already cancelled' });
    }

    // Cancel booking
    db.prepare("UPDATE bookings SET status = 'cancelled', created_at = created_at WHERE id = ?").run(req.params.id);

    // Restore seat
    db.prepare('UPDATE missions SET seats_left = seats_left + 1 WHERE id = ?').run(booking.mission_id);

    // Restore badge if was full
    const mission = db.prepare('SELECT seats_left FROM missions WHERE id = ?').get(booking.mission_id);
    if (mission.seats_left > 0) {
      db.prepare("UPDATE missions SET badge = 'avail' WHERE id = ? AND badge = 'full'").run(booking.mission_id);
    }

    res.json({
      success: true,
      message: 'Booking cancelled. Full refund will be processed within 5-7 business days.',
      data: { booking_id: req.params.id, refund_amount: booking.total_price }
    });
  } catch (err) {
    console.error('Booking cancel error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
