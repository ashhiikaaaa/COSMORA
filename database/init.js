// ═══════════════════════════════════════════════════════════
//  Cosmora Database Initialization — SQLite via better-sqlite3
// ═══════════════════════════════════════════════════════════
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DB_PATH = process.env.DB_PATH || './cosmora.db';
const db = new Database(path.resolve(__dirname, '..', DB_PATH));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────────
//  TABLE: users (Login / Signup data)
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name    TEXT    NOT NULL,
    last_name     TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    avatar_url    TEXT    DEFAULT NULL,
    role          TEXT    DEFAULT 'traveler' CHECK(role IN ('traveler','admin','commander')),
    health_status TEXT    DEFAULT 'excellent' CHECK(health_status IN ('excellent','good','medical_waiver')),
    age           INTEGER DEFAULT NULL,
    oxygen_req    REAL    DEFAULT 0.5,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: destinations
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS destinations (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    distance    TEXT    NOT NULL,
    transit_time TEXT   NOT NULL,
    gradient    TEXT    NOT NULL,
    planet_size INTEGER DEFAULT 100,
    emoji       TEXT    NOT NULL,
    tag         TEXT    NOT NULL
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: missions
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS missions (
    id          TEXT    PRIMARY KEY,
    dest_id     TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    launch_date TEXT    NOT NULL,
    duration    TEXT    NOT NULL,
    price       INTEGER NOT NULL,
    total_seats INTEGER NOT NULL DEFAULT 12,
    seats_left  INTEGER NOT NULL DEFAULT 12,
    badge       TEXT    DEFAULT 'avail' CHECK(badge IN ('avail','soon','full')),
    description TEXT    NOT NULL,
    tag         TEXT,
    long_desc   TEXT,
    planet_grad TEXT,
    created_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (dest_id) REFERENCES destinations(id)
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: mission_timeline
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS mission_timeline (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT    NOT NULL,
    day_label  TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    description TEXT   NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: mission_safety
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS mission_safety (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT    NOT NULL,
    icon       TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    description TEXT   NOT NULL,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: mission_meta (detail page metadata)
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS mission_meta (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT    NOT NULL,
    icon       TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    label      TEXT    NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: bookings
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id          TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    mission_id  TEXT    NOT NULL,
    seat        TEXT    NOT NULL,
    base_price  INTEGER NOT NULL,
    tax         INTEGER NOT NULL DEFAULT 0,
    total_price INTEGER NOT NULL,
    status      TEXT    DEFAULT 'confirmed' CHECK(status IN ('confirmed','upcoming','completed','cancelled')),
    payment_method TEXT DEFAULT 'card',
    created_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id)    REFERENCES users(id),
    FOREIGN KEY (mission_id) REFERENCES missions(id)
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: live_mission_status (real-time tracking)
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS live_mission_status (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_name TEXT    NOT NULL,
    planet_grad  TEXT    NOT NULL,
    position     TEXT    NOT NULL,
    oxygen       TEXT    DEFAULT 'Stable',
    crew_count   INTEGER DEFAULT 0,
    status       TEXT    DEFAULT 'active' CHECK(status IN ('active','upcoming','delayed','completed')),
    details      TEXT,
    updated_at   TEXT    DEFAULT (datetime('now'))
  );
`);

// ─────────────────────────────────────────────────
//  TABLE: sessions (optional — token blacklist)
// ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ═══════════════════════════════════════════════════
//  SEED DATA
// ═══════════════════════════════════════════════════

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return; // already seeded

  console.log('🌱 Seeding Cosmora database...');

  // ── Demo User ──
  const hash = bcrypt.hashSync('cosmora2031', 10);
  db.prepare(`
    INSERT INTO users (first_name, last_name, email, password_hash, role, age, health_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('Yuri', 'Cosmos', 'commander@cosmora.space', hash, 'commander', 32, 'excellent');

  // ── Destinations ──
  const insertDest = db.prepare(`
    INSERT OR IGNORE INTO destinations (id, name, distance, transit_time, gradient, planet_size, emoji, tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const destinations = [
    ['moon', 'The Moon', '384,400 km', '3 days', 'radial-gradient(circle at 40% 35%,#e8e8e8,#c0c0c0 30%,#888 60%,#444)', 110, '🌕', 'Closest neighbour'],
    ['mars', 'Mars', '78.3M km', '7 months', 'radial-gradient(circle at 38% 32%,#f97316,#c2410c 40%,#7c2d12 65%,#1c0a05)', 90, '🔴', 'Red Planet'],
    ['orbit', 'Earth Orbit', '420 km', '6 hours', 'radial-gradient(circle at 38% 32%,#4db8ff,#1d6fa8 30%,#0d3d6e 55%,#061828)', 120, '🌍', 'Low Earth Orbit'],
    ['europa', 'Europa', '628M km', '6 years', 'radial-gradient(circle at 45% 40%,#bfdbfe,#6ba3d6 30%,#2d5a8e 55%,#0d1b36)', 85, '🧊', "Jupiter's Moon"],
    ['station', 'Space Station', '408 km', '4 hours', 'radial-gradient(circle at 50% 50%,#94a3b8,#475569 50%,#1e293b)', 70, '🛸', 'ISS-2 Platform'],
  ];
  destinations.forEach(d => insertDest.run(...d));

  // ── Missions ──
  const insertMission = db.prepare(`
    INSERT OR IGNORE INTO missions (id, dest_id, name, launch_date, duration, price, total_seats, seats_left, badge, description, tag, long_desc, planet_grad)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const missions = [
    ['lunar-escape', 'moon', 'Lunar Escape Experience', 'Mar 28, 2031', '7 days', 280000, 8, 8, 'avail', 'Walk the Sea of Tranquility. Witness Earthrise.', 'Lunar Mission · 7 Days', "Step onto the Moon's surface, peer into ancient craters, and watch Earth rise above the lunar horizon in an experience that rewires what it means to be human.", 'radial-gradient(circle at 40% 35%,#e8e8e8,#c0c0c0 30%,#888 60%,#444)'],
    ['lunar-pro', 'moon', 'Lunar Summit Trek', 'Apr 15, 2031', '14 days', 420000, 6, 4, 'soon', 'Deep crater exploration with AI geological guide.', 'Lunar Deep · 14 Days', 'Venture deep into the Moon\'s most dramatic craters with a full AI geological survey kit.', 'radial-gradient(circle at 40% 35%,#e8e8e8,#c0c0c0 30%,#888 60%,#444)'],
    ['mars-odyssey', 'mars', 'Martian Horizon Odyssey', 'Jun 2, 2031', '18 months', 1200000, 4, 2, 'avail', 'Olympus Mons base camp. Rust-red horizons.', 'Deep Space · 18 Months', 'Set foot on Mars. Hike the slopes of Olympus Mons. Watch the rust-red sky ignite at dusk.', 'radial-gradient(circle at 38% 32%,#f97316,#c2410c 40%,#7c2d12 65%,#1c0a05)'],
    ['blue-marble', 'orbit', 'Blue Marble Experience', 'Mar 31, 2031', '14 days', 95000, 12, 12, 'avail', '16 sunrises daily in zero gravity.', 'LEO · 14 Days', 'Float 420 km above Earth in the most luxurious micro-gravity suite ever built.', 'radial-gradient(circle at 38% 32%,#4db8ff,#1d6fa8 30%,#0d3d6e 55%,#061828)'],
    ['express-orbit', 'orbit', 'Orbital Express 48H', 'Apr 1, 2031', '48 hours', 55000, 8, 6, 'avail', 'Quick orbit getaway. Perfect for first-timers.', 'LEO · 48 Hours', 'The shortest space mission available. Perfect entry point to space tourism.', 'radial-gradient(circle at 38% 32%,#4db8ff,#1d6fa8 30%,#0d3d6e 55%,#061828)'],
    ['europa-dive', 'europa', 'Europa Subsurface Dive', 'Jan 2032', '2 years', 8500000, 2, 1, 'soon', "The furthest civilian journey ever sold.", 'Outer System · 2 Years', "Jupiter's ocean moon holds the greatest mystery in the solar system.", 'radial-gradient(circle at 45% 40%,#bfdbfe,#6ba3d6 30%,#2d5a8e 55%,#0d1b36)'],
  ];
  missions.forEach(m => insertMission.run(...m));

  // ── Mission Timeline Data ──
  const insertTimeline = db.prepare(`
    INSERT INTO mission_timeline (mission_id, day_label, title, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  const timelines = {
    'lunar-escape': [
      ['Day 1–3', 'Transit to Lunar Orbit', 'Depart Earth aboard Cosmora-7. AI pilots the optimal Hohmann transfer.', 1],
      ['Day 4–5', 'Lunar Surface Operations', 'Walk the Sea of Tranquility. Visit the Apollo 11 Memorial Site.', 2],
      ['Day 6', 'Earthrise Viewing Window', 'Watch Earth emerge above the lunar horizon from the observation dome.', 3],
      ['Day 7', 'Return Transit', 'Burn for home. Final zero-g dinner under the stars.', 4],
    ],
    'mars-odyssey': [
      ['Month 1–7', 'Trans-Mars Injection', 'Solar-powered cruise ship. AI-guided sleep cycles.', 1],
      ['Month 8–20', 'Mars Surface Operations', 'Olympus Mons base camp. Valles Marineris flyover.', 2],
      ['Month 21–27', 'Return Journey', 'Earth return burn. Live broadcast capability.', 3],
    ],
    'blue-marble': [
      ['Hour 1–6', 'Launch & Orbital Insertion', 'Vertical launch from Cape Cosmora. Achieve LEO in under 6 hours.', 1],
      ['Days 1–13', 'Orbital Experience', 'Daily EVA opportunities. Earth observation sessions.', 2],
      ['Day 14', 'Re-entry & Splashdown', 'Guided atmospheric re-entry. Pacific Ocean recovery.', 3],
    ],
    'europa-dive': [
      ['Year 1–3', 'Deep Space Transit via Jupiter', 'Gravity-assist manoeuvres. AI sleep-cycle management.', 1],
      ['Year 3–4', 'Europa Orbital Operations', 'Map the subsurface ocean. AI sonar analysis.', 2],
      ['Year 5–6', 'Return & Debriefing', 'Homeward bound. Full scientific debrief.', 3],
    ],
  };

  for (const [missionId, items] of Object.entries(timelines)) {
    items.forEach(([day, title, desc, order]) => insertTimeline.run(missionId, day, title, desc, order));
  }

  // ── Mission Safety Data ──
  const insertSafety = db.prepare(`
    INSERT INTO mission_safety (mission_id, icon, title, description) VALUES (?, ?, ?, ?)
  `);

  const safetyData = {
    'lunar-escape': [
      ['🛡', 'Medical Clearance', 'Pre-flight health screening and oxygen profile calibration required.'],
      ['🔄', 'Life Support Redundancy', 'Triple-redundant O2 and pressure systems throughout mission.'],
      ['🤖', 'AI Emergency Protocol', 'Cosmora AI monitors all vitals and can reroute mission within 30 seconds.'],
      ['🧪', 'Health Monitoring', 'Continuous biometric tracking via smart suit sensors.'],
    ],
    'mars-odyssey': [
      ['🛡', 'Radiation Shielding', 'Proprietary cosmic ray deflection array active throughout deep space transit.'],
      ['🌬', 'Atmospheric Suit', 'AI-pressurised suit adapts to Martian atmospheric conditions automatically.'],
      ['🏥', 'Medical Bay', 'Full surgical capability aboard. AI diagnostics for all crew.'],
      ['⚡', 'Solar Weather AI', 'Real-time solar flare detection and automatic shelter protocol.'],
    ],
    'blue-marble': [
      ['🛡', 'ISS-grade Systems', 'All life support derived from International Space Station heritage hardware.'],
      ['🌡', 'Thermal Management', 'AI-controlled cabin temperature adapts to your body in real time.'],
      ['💊', 'Space Sickness Protocol', 'Pre-flight adaptation training and in-flight medication protocols.'],
      ['🔭', 'Debris Avoidance AI', 'Orbital debris tracking with sub-second avoidance manoeuvre capability.'],
    ],
    'europa-dive': [
      ['🛡', 'Deep Space Rated', 'Mission-grade hull built for intense radiation environment.'],
      ['🔋', 'Nuclear Power', 'RTG-powered systems guarantee 100-year mission lifespan.'],
      ['🤖', 'Autonomous AI', 'Full autonomous operation capability in case of comms blackout.'],
      ['🧬', 'Longevity Protocol', 'Specialised nutrition, exercise, and sleep protocols for multi-year missions.'],
    ],
  };

  for (const [missionId, items] of Object.entries(safetyData)) {
    items.forEach(([icon, title, desc]) => insertSafety.run(missionId, icon, title, desc));
  }

  // ── Mission Meta ──
  const insertMeta = db.prepare(`
    INSERT INTO mission_meta (mission_id, icon, value, label, sort_order) VALUES (?, ?, ?, ?, ?)
  `);

  const metaData = {
    'lunar-escape': [['🌕', '384,400 km', 'Distance', 1], ['⏱', '3 days', 'Transit', 2], ['📅', 'Mar 28, 2031', 'Launch', 3], ['💺', '8 seats', 'Capacity', 4]],
    'mars-odyssey': [['🔴', '78.3M km', 'Distance', 1], ['⏱', '7 months', 'Transit', 2], ['📅', 'Jun 2, 2031', 'Launch', 3], ['💺', '2 seats', 'Capacity', 4]],
    'blue-marble': [['🌍', '420 km', 'Altitude', 1], ['⏱', '6 hours', 'Transit', 2], ['📅', 'Mar 31, 2031', 'Launch', 3], ['💺', '12 seats', 'Capacity', 4]],
    'europa-dive': [['🧊', '628M km', 'Distance', 1], ['⏱', '6 years', 'Transit', 2], ['📅', 'Jan 2032', 'Launch', 3], ['💺', '1 seat', 'Capacity', 4]],
  };

  for (const [missionId, items] of Object.entries(metaData)) {
    items.forEach(([icon, val, label, order]) => insertMeta.run(missionId, icon, val, label, order));
  }

  // ── Live Mission Status ──
  const insertStatus = db.prepare(`
    INSERT INTO live_mission_status (mission_name, planet_grad, position, oxygen, crew_count, status, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertStatus.run('Mars X-12', 'radial-gradient(circle at 38% 32%,#4db8ff,#1d6fa8 30%,#0d3d6e 55%,#061828)', 'Earth Orbit', 'Stable', 8, 'active', 'Active Mission — currently in transit');
  insertStatus.run('Lunar Gateway LG-7', 'radial-gradient(circle at 40% 35%,#e8e8e8,#c0c0c0 30%,#888 60%,#444)', 'Cape Cosmora', 'Pre-check', 0, 'upcoming', 'Launch: Mar 28, 2031 · 47 seats remaining');
  insertStatus.run('Mars Horizon MH-4', 'radial-gradient(circle at 38% 32%,#f97316,#c2410c 40%,#7c2d12 65%,#1c0a05)', 'Launchpad Hold', 'N/A', 0, 'delayed', 'Solar weather delay · ETA revised to Apr 2031');

  // ── Demo Bookings ──
  const insertBooking = db.prepare(`
    INSERT INTO bookings (id, user_id, mission_id, seat, base_price, tax, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertBooking.run('CMR-2031-04721', 1, 'lunar-escape', 'A7', 280000, 23784, 321084, 'confirmed');
  insertBooking.run('CMR-2031-03318', 1, 'blue-marble', 'B3', 95000, 8984, 112484, 'upcoming');

  console.log('✅ Cosmora database seeded successfully!');
}

seedIfEmpty();

module.exports = db;
