// ═══════════════════════════════════════════════════════════
//  Dashboard Routes — KPIs, Quick Stats
// ═══════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const db = require('../database/init');
const { authenticate } = require('../middleware/auth');

// ─────────────────────────────────────────────────
//  GET /api/dashboard — Dashboard KPIs and data
// ─────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  try {
    // KPI: Total available missions
    const totalMissions = db.prepare(
      "SELECT COUNT(*) as c FROM missions WHERE badge IN ('avail','soon')"
    ).get().c;

    // KPI: Upcoming launches (missions with badge 'avail')
    const upcomingLaunches = db.prepare(
      "SELECT COUNT(*) as c FROM missions WHERE badge = 'avail'"
    ).get().c;

    // KPI: User's bookings
    const myBookings = db.prepare(
      "SELECT COUNT(*) as c FROM bookings WHERE user_id = ? AND status IN ('confirmed','upcoming')"
    ).get(req.user.id).c;

    const confirmedBookings = db.prepare(
      "SELECT COUNT(*) as c FROM bookings WHERE user_id = ? AND status = 'confirmed'"
    ).get(req.user.id).c;

    const upcomingBookings = db.prepare(
      "SELECT COUNT(*) as c FROM bookings WHERE user_id = ? AND status = 'upcoming'"
    ).get(req.user.id).c;

    // KPI: Average seat availability
    const seatStats = db.prepare(
      "SELECT SUM(seats_left) as avail, SUM(total_seats) as total FROM missions WHERE badge != 'full'"
    ).get();
    const seatPercentage = seatStats.total > 0 ? Math.round((seatStats.avail / seatStats.total) * 100) : 0;

    // Live mission statuses
    const liveStatuses = db.prepare(`
      SELECT * FROM live_mission_status ORDER BY
        CASE status
          WHEN 'active' THEN 1
          WHEN 'upcoming' THEN 2
          WHEN 'delayed' THEN 3
          ELSE 4
        END
    `).all();

    // Enrich with simulated telemetry
    const now = new Date();
    const enrichedStatuses = liveStatuses.map(s => ({
      ...s,
      last_telemetry: now.toISOString(),
      signal_strength: s.status === 'active' ? Math.floor(85 + Math.random() * 15) + '%' : 'N/A',
      velocity: s.status === 'active' ? (Math.floor(7000 + Math.random() * 1000)) + ' m/s' : 'N/A',
      altitude: s.status === 'active' ? (Math.floor(380 + Math.random() * 80)) + ' km' : 'N/A',
    }));

    // AI Recommendations (random pick from available)
    const recommendations = db.prepare(`
      SELECT m.id, m.name, m.price, m.duration, d.emoji as dest_emoji, d.name as dest_name
      FROM missions m
      LEFT JOIN destinations d ON m.dest_id = d.id
      WHERE m.badge = 'avail'
      ORDER BY RANDOM()
      LIMIT 3
    `).all();

    // Next launch
    const nextLaunch = db.prepare(`
      SELECT name, launch_date FROM missions WHERE badge = 'avail' ORDER BY launch_date ASC LIMIT 1
    `).get();

    // Stats for homepage
    const totalCiviliansLaunched = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c + 4217; // offset for demo
    const totalDestinations = db.prepare('SELECT COUNT(*) as c FROM destinations').get().c;

    res.json({
      success: true,
      data: {
        kpis: {
          missions_available: totalMissions,
          upcoming_launches: upcomingLaunches,
          my_bookings: myBookings,
          confirmed_bookings: confirmedBookings,
          upcoming_bookings: upcomingBookings,
          seat_availability: seatPercentage + '%',
        },
        live_statuses: enrichedStatuses,
        recommendations,
        next_launch: nextLaunch,
        global_stats: {
          civilians_launched: totalCiviliansLaunched,
          total_destinations: totalDestinations,
          safe_return_rate: '99.8%',
        }
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────
//  GET /api/dashboard/stats — Public homepage stats
// ─────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const totalBookings = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
    const totalDestinations = db.prepare('SELECT COUNT(*) as c FROM destinations').get().c;
    const inOrbit = Math.floor(4200 + Math.random() * 50);

    res.json({
      success: true,
      data: {
        civilians_launched: totalBookings + 4217,
        destinations: totalDestinations,
        safe_return_rate: '99.8%',
        currently_in_orbit: inOrbit
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
