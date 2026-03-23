// ═══════════════════════════════════════════════════════════
//  Destinations Routes
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const db = require('../database/init');

// ─────────────────────────────────────────────────
//  GET /api/destinations — All destinations
// ─────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const destinations = db.prepare(`
      SELECT d.*,
        (SELECT COUNT(*) FROM missions m WHERE m.dest_id = d.id) as mission_count,
        (SELECT MIN(m.price) FROM missions m WHERE m.dest_id = d.id AND m.badge = 'avail') as starting_price
      FROM destinations d
      ORDER BY d.name ASC
    `).all();

    res.json({ success: true, data: destinations });
  } catch (err) {
    console.error('Destinations error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  GET /api/destinations/:id — Single destination
// ─────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
    if (!dest) {
      return res.status(404).json({ success: false, error: 'Destination not found' });
    }

    const missions = db.prepare(`
      SELECT id, name, launch_date, duration, price, seats_left, badge, description
      FROM missions WHERE dest_id = ?
      ORDER BY price ASC
    `).all(req.params.id);

    res.json({
      success: true,
      data: { ...dest, missions }
    });
  } catch (err) {
    console.error('Destination detail error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
