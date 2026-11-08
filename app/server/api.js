// REST API for FareWise. Every query is parameterized; table and column names
// follow the Stage 3 schema (Airports, Airlines, Booking_Window, Users,
// Saved_Route, Fare_Prices).
const express = require('express');
const { pool, query, getSchema, describeDbError } = require('./db');

const router = express.Router();

class BadRequest extends Error {
  constructor(message) { super(message); this.status = 400; }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- filter helpers ----------

const DAY_VALUES = ['any', 'weekday', 'weekend', 'holiday'];
const STOP_VALUES = ['any', 'nonstop', 'connecting'];

// Holiday = departures around Memorial Day, July 4, Labor Day, Thanksgiving,
// and Christmas to New Year's (same rule as the Stage 2 design doc).
const DAY_SQL = {
  weekday: 'DAYOFWEEK(f.departure_date) BETWEEN 2 AND 6',
  weekend: 'DAYOFWEEK(f.departure_date) IN (1, 7)',
  holiday: `(
    (MONTH(f.departure_date) = 5  AND DAY(f.departure_date) >= 24) OR
    (MONTH(f.departure_date) = 7  AND DAY(f.departure_date) <= 7)  OR
    (MONTH(f.departure_date) = 9  AND DAY(f.departure_date) <= 7)  OR
    (MONTH(f.departure_date) = 11 AND DAY(f.departure_date) BETWEEN 20 AND 30) OR
    (MONTH(f.departure_date) = 12 AND DAY(f.departure_date) >= 18) OR
    (MONTH(f.departure_date) = 1  AND DAY(f.departure_date) <= 5)
  )`,
};

// Saved routes created by other tools may spell filters differently; map them.
function normalizeDay(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('weekday')) return 'weekday';
  if (s.includes('weekend')) return 'weekend';
  if (s.includes('holiday')) return 'holiday';
  return 'any';
}
function normalizeStops(v) {
  const s = String(v || '').toLowerCase().replace(/[\s_-]/g, '');
  if (s === '' || s === 'any' || s === 'all') return 'any';
  if (s.includes('nonstop') || s.includes('direct') || s === '0') return 'nonstop';
  if (s.includes('connect') || s.includes('stop') || /^[1-9]/.test(s)) return 'connecting';
  return 'any';
}

function airportCode(v, field) {
  const s = String(v || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(s)) throw new BadRequest(`${field} must be an airport code like ORD`);
  return s;
}
function optionalInt(v, field) {
  if (v === undefined || v === null || v === '' || v === 'any') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new BadRequest(`${field} must be a whole number`);
  return n;
}

// Build WHERE pieces for Fare_Prices (alias f).
function fareWhere({ origin, destination, airlineId, day, stops }, { skipAirline = false } = {}) {
  const where = ['f.origin_airport = ?', 'f.destination_airport = ?'];
  const params = [origin, destination];
  if (!skipAirline && airlineId != null) { where.push('f.airline_id = ?'); params.push(airlineId); }
  if (DAY_SQL[day]) where.push(DAY_SQL[day]);
  if (stops === 'nonstop') where.push('f.num_stops = 0');
  if (stops === 'connecting') where.push('f.num_stops >= 1');
  return { sql: where.join(' AND '), params };
}

function parseFilters(src) {
  const origin = airportCode(src.origin, 'origin');
  const destination = airportCode(src.destination, 'destination');
  if (origin === destination) throw new BadRequest('Origin and destination must be different airports');
  return {
    origin,
    destination,
    airlineId: optionalInt(src.airline, 'airline'),
    day: normalizeDay(src.day),
    stops: normalizeStops(src.stops),
  };
}

// Core analysis: fare summary, booking-window breakdown, airline leaderboard.
async function explore(filters) {
  const all = fareWhere(filters);
  const noAirline = fareWhere(filters, { skipAirline: true });

  const [summaryRows, windows, airlines] = await Promise.all([
    query(
      `SELECT COUNT(*) AS observations, AVG(f.fare) AS avg_fare, MIN(f.fare) AS min_fare,
              MAX(f.fare) AS max_fare, AVG(f.duration_min) AS avg_duration,
              SUM(f.num_stops = 0) AS nonstop_count
       FROM Fare_Prices f WHERE ${all.sql}`,
      all.params
    ),
    // LEFT JOIN keeps every window on the chart, even ones with no fares.
    query(
      `SELECT b.window_id, b.label, b.min_days, b.max_days,
              AVG(f.fare) AS avg_fare, MIN(f.fare) AS min_fare, COUNT(f.fare_id) AS observations
       FROM Booking_Window b
       LEFT JOIN Fare_Prices f
         ON DATEDIFF(f.departure_date, f.search_date) BETWEEN b.min_days AND b.max_days
        AND ${all.sql}
       GROUP BY b.window_id, b.label, b.min_days, b.max_days
       ORDER BY b.min_days DESC`,
      all.params
    ),
    query(
      `SELECT a.airline_id, a.airline_code, a.airline_name,
              AVG(f.fare) AS avg_fare, MIN(f.fare) AS min_fare, COUNT(*) AS observations
       FROM Fare_Prices f
       JOIN Airlines a ON a.airline_id = f.airline_id
       WHERE ${noAirline.sql}
       GROUP BY a.airline_id, a.airline_code, a.airline_name
       ORDER BY avg_fare ASC`,
      noAirline.params
    ),
  ]);

  const summary = summaryRows[0];
  const withData = windows.filter((w) => w.observations > 0);
  const pool3 = withData.filter((w) => w.observations >= 3);
  const ranked = (pool3.length ? pool3 : withData).slice().sort((a, b) => a.avg_fare - b.avg_fare);
  const best = ranked[0] || null;

  return {
    filters,
    summary,
    windows,
    bestWindowId: best ? best.window_id : null,
    airlines,
  };
}

// ---------- routes ----------

router.get('/health', wrap(async (req, res) => {
  try {
    const [[info]] = await pool.query(
      `SELECT VERSION() AS version, DATABASE() AS db,
              (SELECT COUNT(*) FROM Fare_Prices) AS fares,
              (SELECT COUNT(*) FROM Airports)    AS airports,
              (SELECT COUNT(*) FROM Airlines)    AS airlines,
              (SELECT COUNT(*) FROM Users)       AS users,
              (SELECT COUNT(*) FROM Saved_Route) AS saved_routes`
    );
    res.json({ connected: true, host: process.env.DB_HOST || '127.0.0.1', ...info });
  } catch (err) {
    res.status(503).json({ connected: false, error: describeDbError(err) });
  }
}));

router.get('/meta', wrap(async (req, res) => {
  const [airlines, windows] = await Promise.all([
    query('SELECT airline_id, airline_code, airline_name FROM Airlines ORDER BY airline_name'),
    query('SELECT window_id, label, min_days, max_days FROM Booking_Window ORDER BY min_days'),
  ]);
  res.json({ airlines, windows, dayValues: DAY_VALUES, stopValues: STOP_VALUES });
}));

router.get('/airports', wrap(async (req, res) => {
  const { airportName } = await getSchema();
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (!q) return res.json([]);
  const like = `%${q}%`;
  const rows = await query(
    `SELECT airport_code AS code, ${airportName} AS name, city, country
     FROM Airports
     WHERE airport_code LIKE ? OR ${airportName} LIKE ? OR city LIKE ?
     ORDER BY (airport_code = ?) DESC, (airport_code LIKE ?) DESC, (city LIKE ?) DESC, airport_code
     LIMIT 8`,
    [like, like, like, q.toUpperCase(), `${q}%`, `${q}%`]
  );
  res.json(rows);
}));

router.get('/routes/popular', wrap(async (req, res) => {
  const rows = await query(
    `SELECT f.origin_airport AS origin, f.destination_airport AS destination,
            oa.city AS origin_city, da.city AS destination_city,
            COUNT(*) AS observations, AVG(f.fare) AS avg_fare
     FROM Fare_Prices f
     JOIN Airports oa ON oa.airport_code = f.origin_airport
     JOIN Airports da ON da.airport_code = f.destination_airport
     GROUP BY f.origin_airport, f.destination_airport, oa.city, da.city
     ORDER BY observations DESC
     LIMIT 8`
  );
  res.json(rows);
}));

router.get('/explore', wrap(async (req, res) => {
  res.json(await explore(parseFilters(req.query)));
}));

// ----- users (login comes later; the app acts as one user) -----

router.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const rows = await query(
    `SELECT user_id, username, email, airport_home FROM Users
     WHERE username LIKE ? ORDER BY user_id LIMIT 20`,
    [`%${q}%`]
  );
  res.json(rows);
}));

router.get('/users/default', wrap(async (req, res) => {
  const wanted = optionalInt(process.env.DEFAULT_USER_ID, 'DEFAULT_USER_ID');
  const rows = wanted != null
    ? await query('SELECT user_id, username, email, airport_home FROM Users WHERE user_id = ?', [wanted])
    : await query('SELECT user_id, username, email, airport_home FROM Users ORDER BY user_id LIMIT 1');
  if (!rows.length) return res.status(404).json({ error: 'No users found in the Users table' });
  res.json(rows[0]);
}));

// ----- saved routes (CRUD) -----

function parseRouteBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.origin !== undefined) out.origin_airport = airportCode(body.origin, 'origin');
  if (!partial || body.destination !== undefined) out.destination_airport = airportCode(body.destination, 'destination');
  if (out.origin_airport && out.destination_airport && out.origin_airport === out.destination_airport) {
    throw new BadRequest('Origin and destination must be different airports');
  }
  if (!partial || body.airline !== undefined) out.airline_id = optionalInt(body.airline, 'airline');
  if (!partial || body.window !== undefined) out.window_id = optionalInt(body.window, 'window');
  if (!partial || body.day !== undefined) {
    const d = String(body.day || 'any').toLowerCase();
    if (!DAY_VALUES.includes(d)) throw new BadRequest('day must be one of ' + DAY_VALUES.join(', '));
    out.departure_day_filter = d;
  }
  if (!partial || body.stops !== undefined) {
    const s = String(body.stops || 'any').toLowerCase();
    if (!STOP_VALUES.includes(s)) throw new BadRequest('stops must be one of ' + STOP_VALUES.join(', '));
    out.stop_type = s;
  }
  if (!partial || body.target_price !== undefined) {
    const p = Number(body.target_price);
    if (!Number.isFinite(p) || p <= 0 || p > 99999999) throw new BadRequest('Target price must be a positive amount');
    out.target_price = Math.round(p * 100) / 100;
  }
  if (!partial || body.note !== undefined) {
    const n = String(body.note || '').trim();
    if (n.length > 255) throw new BadRequest('Note must be 255 characters or fewer');
    out.note = n || null;
  }
  return out;
}

function userIdFrom(req) {
  const id = optionalInt(req.query.userId ?? req.body?.userId, 'userId');
  if (id == null) throw new BadRequest('userId is required');
  return id;
}

function translateWriteError(err) {
  if (err && (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW')) {
    return new BadRequest('That airport, airline or booking window does not exist');
  }
  return err;
}

// Recommendation for one saved route, computed from Fare_Prices (never stored).
async function insightFor(route) {
  const filters = {
    origin: route.origin_airport,
    destination: route.destination_airport,
    airlineId: route.airline_id,
    day: normalizeDay(route.departure_day_filter),
    stops: normalizeStops(route.stop_type),
  };
  const result = await explore(filters);
  const best = result.windows.find((w) => w.window_id === result.bestWindowId) || null;
  const planned = result.windows.find((w) => w.window_id === route.window_id) || null;
  return {
    observations: result.summary.observations,
    avg_fare: result.summary.avg_fare,
    min_fare: result.summary.min_fare,
    best_window: best && { window_id: best.window_id, label: best.label, avg_fare: best.avg_fare, min_days: best.min_days, max_days: best.max_days },
    planned_window_avg: planned ? planned.avg_fare : null,
  };
}

const ROUTE_SELECT = (airportName) => `
  SELECT r.route_id, r.user_id, r.origin_airport, r.destination_airport, r.airline_id,
         r.departure_day_filter, r.stop_type, r.target_price, r.note, r.created_at,
         COALESCE(r.is_archived, 0) AS is_archived, r.window_id,
         oa.city AS origin_city, oa.${airportName} AS origin_name,
         da.city AS destination_city, da.${airportName} AS destination_name,
         a.airline_name, a.airline_code, b.label AS window_label
  FROM Saved_Route r
  JOIN Airports oa ON oa.airport_code = r.origin_airport
  JOIN Airports da ON da.airport_code = r.destination_airport
  LEFT JOIN Airlines a ON a.airline_id = r.airline_id
  LEFT JOIN Booking_Window b ON b.window_id = r.window_id`;

async function loadRoute(routeId, userId) {
  const { airportName } = await getSchema();
  const rows = await query(`${ROUTE_SELECT(airportName)} WHERE r.route_id = ? AND r.user_id = ?`, [routeId, userId]);
  return rows[0] || null;
}

router.get('/users/:userId/routes/count', wrap(async (req, res) => {
  const userId = optionalInt(req.params.userId, 'userId');
  const [row] = await query(
    `SELECT SUM(COALESCE(is_archived, 0) = 0) AS active, SUM(COALESCE(is_archived, 0) = 1) AS archived
     FROM Saved_Route WHERE user_id = ?`,
    [userId]
  );
  res.json({ active: Number(row.active || 0), archived: Number(row.archived || 0) });
}));

router.get('/users/:userId/routes', wrap(async (req, res) => {
  const userId = optionalInt(req.params.userId, 'userId');
  const archived = req.query.archived === '1' ? 1 : 0;
  const { airportName } = await getSchema();
  const routes = await query(
    `${ROUTE_SELECT(airportName)}
     WHERE r.user_id = ? AND COALESCE(r.is_archived, 0) = ?
     ORDER BY r.created_at DESC, r.route_id DESC
     LIMIT 60`,
    [userId, archived]
  );
  const insights = await Promise.all(routes.map(insightFor));
  res.json(routes.map((r, i) => ({ ...r, insight: insights[i] })));
}));

router.post('/routes', wrap(async (req, res) => {
  const userId = userIdFrom(req);
  const fields = parseRouteBody(req.body || {});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // route_id has no AUTO_INCREMENT in the Stage 3 table; lock and take the next id.
    const [[{ next }]] = await conn.query('SELECT COALESCE(MAX(route_id), 0) + 1 AS next FROM Saved_Route FOR UPDATE');
    await conn.query(
      `INSERT INTO Saved_Route
         (route_id, user_id, origin_airport, destination_airport, airline_id, window_id,
          departure_day_filter, stop_type, target_price, note, created_at, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)`,
      [next, userId, fields.origin_airport, fields.destination_airport, fields.airline_id, fields.window_id,
        fields.departure_day_filter, fields.stop_type, fields.target_price, fields.note]
    );
    await conn.commit();
    const route = await loadRoute(next, userId);
    res.status(201).json({ ...route, insight: await insightFor(route) });
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw translateWriteError(err);
  } finally {
    conn.release();
  }
}));

router.put('/routes/:routeId', wrap(async (req, res) => {
  const userId = userIdFrom(req);
  const routeId = optionalInt(req.params.routeId, 'routeId');
  const fields = parseRouteBody(req.body || {}, { partial: true });
  const keys = Object.keys(fields);
  if (!keys.length) throw new BadRequest('Nothing to update');
  try {
    const result = await query(
      `UPDATE Saved_Route SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE route_id = ? AND user_id = ?`,
      [...keys.map((k) => fields[k]), routeId, userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Saved route not found' });
  } catch (err) {
    throw translateWriteError(err);
  }
  const route = await loadRoute(routeId, userId);
  res.json({ ...route, insight: await insightFor(route) });
}));

// "Delete" archives the route (Stage 2 design: is_archived replaces the archive table).
router.delete('/routes/:routeId', wrap(async (req, res) => {
  const userId = userIdFrom(req);
  const routeId = optionalInt(req.params.routeId, 'routeId');
  const result = await query('UPDATE Saved_Route SET is_archived = 1 WHERE route_id = ? AND user_id = ?', [routeId, userId]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Saved route not found' });
  res.json({ route_id: routeId, is_archived: 1 });
}));

router.post('/routes/:routeId/restore', wrap(async (req, res) => {
  const userId = userIdFrom(req);
  const routeId = optionalInt(req.params.routeId, 'routeId');
  const result = await query('UPDATE Saved_Route SET is_archived = 0 WHERE route_id = ? AND user_id = ?', [routeId, userId]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Saved route not found' });
  res.json({ route_id: routeId, is_archived: 0 });
}));

// ---------- errors ----------

router.use((req, res) => res.status(404).json({ error: 'Unknown API route' }));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err.status === 400) return res.status(400).json({ error: err.message });
  console.error('[api]', req.method, req.originalUrl, '-', err.code || '', err.message);
  res.status(500).json({ error: describeDbError(err) });
});

module.exports = router;
