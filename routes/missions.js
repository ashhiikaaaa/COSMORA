// ═══════════════════════════════════════════════════════════
//  Mission Routes — CRUD, Filtering, Detail, Live Status
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const db = require('../database/init');
const { optionalAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────────
//  GET /api/missions — List all missions (with filter)
// ─────────────────────────────────────────────────
router.get('/', optionalAuth, (req, res) => {
  try {
    const { dest, badge, search, sort, limit, offset } = req.query;
    let query = `
      SELECT m.*, d.name as dest_name, d.emoji as dest_emoji, d.gradient as dest_gradient
      FROM missions m
      LEFT JOIN destinations d ON m.dest_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (dest && dest !== 'all') {
      query += ' AND m.dest_id = ?';
      params.push(dest);
    }

    if (badge) {
      query += ' AND m.badge = ?';
      params.push(badge);
    }

    if (search) {
      query += ' AND (m.name LIKE ? OR m.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Sorting
    const sortOptions = {
      'price_asc': 'm.price ASC',
      'price_desc': 'm.price DESC',
      'launch': 'm.launch_date ASC',
      'seats': 'm.seats_left DESC',
    };
    query += ` ORDER BY ${sortOptions[sort] || 'm.created_at DESC'}`;

    // Pagination
    const lim = Math.min(parseInt(limit) || 20, 100);
    const off = parseInt(offset) || 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(lim, off);

    const missions = db.prepare(query).all(...params);

    // Total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM missions m WHERE 1=1`;
    const countParams = [];
    if (dest && dest !== 'all') { countQuery += ' AND m.dest_id = ?'; countParams.push(dest); }
    if (badge) { countQuery += ' AND m.badge = ?'; countParams.push(badge); }
    if (search) { countQuery += ' AND (m.name LIKE ? OR m.description LIKE ?)'; countParams.push(`%${search}%`, `%${search}%`); }
    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({
      success: true,
      data: missions,
      pagination: { total, limit: lim, offset: off, hasMore: off + lim < total }
    });
  } catch (err) {
    console.error('Missions list error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  GET /api/missions/featured — Homepage featured
// ─────────────────────────────────────────────────
router.get('/featured', (req, res) => {
  try {
    const missions = db.prepare(`
      SELECT m.*, d.name as dest_name, d.emoji as dest_emoji
      FROM missions m
      LEFT JOIN destinations d ON m.dest_id = d.id
      WHERE m.badge IN ('avail', 'soon')
      ORDER BY m.price ASC
      LIMIT 4
    `).all();

    res.json({ success: true, data: missions });
  } catch (err) {
    console.error('Featured missions error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  GET /api/missions/status/live — Real-time mission status
//  ⚠️ MUST be before /:id to avoid being caught by param route
// ─────────────────────────────────────────────────
router.get('/status/live', (req, res) => {
  try {
    const statuses = db.prepare(`
      SELECT * FROM live_mission_status ORDER BY
        CASE status
          WHEN 'active' THEN 1
          WHEN 'upcoming' THEN 2
          WHEN 'delayed' THEN 3
          ELSE 4
        END
    `).all();

    // Dynamically update some values to simulate real-time data
    const enrichedStatuses = statuses.map(s => {
      const now = new Date();
      return {
        ...s,
        last_telemetry: now.toISOString(),
        signal_strength: s.status === 'active' ? Math.floor(85 + Math.random() * 15) + '%' : 'N/A',
        velocity: s.status === 'active' ? (Math.floor(7000 + Math.random() * 1000)) + ' m/s' : 'N/A',
        altitude: s.status === 'active' ? (Math.floor(380 + Math.random() * 80)) + ' km' : 'N/A',
      };
    });

    res.json({
      success: true,
      data: enrichedStatuses,
      server_time: new Date().toISOString()
    });
  } catch (err) {
    console.error('Live status error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  GET /api/missions/:id — Mission Detail
// ─────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const mission = db.prepare(`
      SELECT m.*, d.name as dest_name, d.emoji as dest_emoji, d.gradient as dest_gradient,
             d.distance as dest_distance, d.transit_time as dest_transit
      FROM missions m
      LEFT JOIN destinations d ON m.dest_id = d.id
      WHERE m.id = ?
    `).get(req.params.id);

    if (!mission) {
      return res.status(404).json({ success: false, error: 'Mission not found' });
    }

    // Get timeline
    const timeline = db.prepare(`
      SELECT day_label, title, description FROM mission_timeline
      WHERE mission_id = ? ORDER BY sort_order ASC
    `).all(req.params.id);

    // Get safety
    const safety = db.prepare(`
      SELECT icon, title, description FROM mission_safety
      WHERE mission_id = ?
    `).all(req.params.id);

    // Get meta
    const meta = db.prepare(`
      SELECT icon, value, label FROM mission_meta
      WHERE mission_id = ? ORDER BY sort_order ASC
    `).all(req.params.id);

    // Taken seats (for booking page)
    const takenSeats = db.prepare(`
      SELECT seat FROM bookings
      WHERE mission_id = ? AND status IN ('confirmed', 'upcoming')
    `).all(req.params.id).map(b => b.seat);

    res.json({
      success: true,
      data: {
        ...mission,
        timeline,
        safety,
        meta,
        taken_seats: takenSeats
      }
    });
  } catch (err) {
    console.error('Mission detail error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
