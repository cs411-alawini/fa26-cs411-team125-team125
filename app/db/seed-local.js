// Builds a LOCAL test database with the Stage 3 schema and synthetic rows
// shaped like the Cloud SQL data (1,200 users, 2,400 saved routes, 13,200 fares).
// It drops and recreates every table, so it refuses to run against a remote host.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(`Refusing to seed ${host}: this script wipes tables and is only for a local MySQL.`);
  process.exit(1);
}

let seed = 411;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

const AIRPORTS = [
  ['ATL', 'Hartsfield-Jackson Atlanta International', 'Atlanta', 'United States'],
  ['BOS', 'Logan International', 'Boston', 'United States'],
  ['CLT', 'Charlotte Douglas International', 'Charlotte', 'United States'],
  ['DCA', 'Ronald Reagan Washington National', 'Washington', 'United States'],
  ['DEN', 'Denver International', 'Denver', 'United States'],
  ['DFW', 'Dallas/Fort Worth International', 'Dallas', 'United States'],
  ['DTW', 'Detroit Metropolitan Wayne County', 'Detroit', 'United States'],
  ['EWR', 'Newark Liberty International', 'Newark', 'United States'],
  ['FLL', 'Fort Lauderdale-Hollywood International', 'Fort Lauderdale', 'United States'],
  ['HNL', 'Daniel K. Inouye International', 'Honolulu', 'United States'],
  ['IAD', 'Washington Dulles International', 'Washington', 'United States'],
  ['IAH', 'George Bush Intercontinental', 'Houston', 'United States'],
  ['JFK', 'John F. Kennedy International', 'New York', 'United States'],
  ['LAS', 'Harry Reid International', 'Las Vegas', 'United States'],
  ['LAX', 'Los Angeles International', 'Los Angeles', 'United States'],
  ['LGA', 'LaGuardia', 'New York', 'United States'],
  ['MDW', 'Chicago Midway International', 'Chicago', 'United States'],
  ['MIA', 'Miami International', 'Miami', 'United States'],
  ['MSP', 'Minneapolis-Saint Paul International', 'Minneapolis', 'United States'],
  ['ORD', "O'Hare International", 'Chicago', 'United States'],
  ['PDX', 'Portland International', 'Portland', 'United States'],
  ['PHL', 'Philadelphia International', 'Philadelphia', 'United States'],
  ['PHX', 'Phoenix Sky Harbor International', 'Phoenix', 'United States'],
  ['SAN', 'San Diego International', 'San Diego', 'United States'],
  ['SEA', 'Seattle-Tacoma International', 'Seattle', 'United States'],
  ['SFO', 'San Francisco International', 'San Francisco', 'United States'],
  ['CMI', 'University of Illinois Willard', 'Champaign', 'United States'],
  ['YYZ', 'Toronto Pearson International', 'Toronto', 'Canada'],
  ['LHR', 'Heathrow', 'London', 'United Kingdom'],
  ['CDG', 'Charles de Gaulle', 'Paris', 'France'],
];
const AIRLINES = [
  [1, 'AA', 'American Airlines'], [2, 'DL', 'Delta Air Lines'], [3, 'UA', 'United Airlines'],
  [4, 'WN', 'Southwest Airlines'], [5, 'B6', 'JetBlue Airways'], [6, 'AS', 'Alaska Airlines'],
  [7, 'NK', 'Spirit Airlines'], [8, 'F9', 'Frontier Airlines'], [9, 'G4', 'Allegiant Air'], [10, 'HA', 'Hawaiian Airlines'],
];
// Local guesses at the five Stage 3 windows; the real ranges live on Cloud SQL.
const WINDOWS = [
  [1, 'Last minute', 0, 7], [2, 'Short term', 8, 21], [3, 'Medium term', 22, 45],
  [4, 'Early booking', 46, 90], [5, 'Long term', 91, 330],
];
const WINDOW_FACTOR = { 1: 1.38, 2: 1.12, 3: 0.86, 4: 0.94, 5: 1.05 };

async function insertMany(conn, table, cols, rows, chunk = 1000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await conn.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ?`, [part]);
  }
}

(async () => {
  const conn = await mysql.createConnection({
    host, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, multipleStatements: true,
  });
  const db = process.env.DB_NAME || 'cs411_project';
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
  await conn.query(`USE \`${db}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  await insertMany(conn, 'Airports', ['airport_code', 'aiport_name', 'city', 'country'], AIRPORTS);
  await insertMany(conn, 'Airlines', ['airline_id', 'airline_code', 'airline_name'], AIRLINES);
  await insertMany(conn, 'Booking_Window', ['window_id', 'label', 'min_days', 'max_days'], WINDOWS);

  const domestic = AIRPORTS.filter((a) => a[3] === 'United States').map((a) => a[0]);
  const codes = AIRPORTS.map((a) => a[0]);

  // A handful of busy routes plus a long tail, like the Stage 3 data.
  const hubs = [['JFK', 'LAX'], ['ORD', 'LAX'], ['ORD', 'SFO'], ['ATL', 'MIA'], ['SEA', 'SFO'], ['BOS', 'ORD'], ['DFW', 'DEN'], ['CMI', 'ORD'], ['JFK', 'LHR']];
  const routes = [...hubs];
  while (routes.length < 140) {
    const o = pick(domestic); const d = pick(rand() < 0.9 ? domestic : codes);
    if (o !== d && !routes.some(([x, y]) => x === o && y === d)) routes.push([o, d]);
  }
  const base = new Map(routes.map(([o, d]) => [`${o}-${d}`, between(110, 340) + (['LHR', 'CDG', 'HNL'].includes(d) ? 380 : 0)]));

  const fares = [];
  const day0 = new Date('2026-01-05T00:00:00Z');
  for (let id = 1; id <= 13200; id++) {
    const [o, d] = rand() < 0.22 ? pick(hubs) : pick(routes);
    const airline = pick(AIRLINES)[0];
    const win = pick(WINDOWS);
    const lead = between(win[2], Math.min(win[3], 200));
    const dep = new Date(day0.getTime() + between(20, 330) * 86400000);
    const search = new Date(dep.getTime() - lead * 86400000);
    const stops = rand() < 0.45 ? 0 : rand() < 0.8 ? 1 : 2;
    const dow = dep.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 1.13 : 1;
    const budget = [7, 8, 9].includes(airline) ? 0.78 : 1;
    const fare = base.get(`${o}-${d}`) * WINDOW_FACTOR[win[0]] * weekend * budget * (stops === 0 ? 1.12 : 0.92) * (0.75 + rand() * 0.5);
    fares.push([id, o, d, airline, search.toISOString().slice(0, 10), dep.toISOString().slice(0, 10),
      Math.round(fare * 100) / 100, stops, between(70, 330) + stops * between(55, 140)]);
  }
  await insertMany(conn, 'Fare_Prices', ['fare_id', 'origin_airport', 'destination_airport', 'airline_id', 'search_date', 'departure_date', 'fare', 'num_stops', 'duration_min'], fares);

  const first = ['alex', 'sam', 'jordan', 'taylor', 'morgan', 'casey', 'riley', 'jamie', 'avery', 'quinn', 'drew', 'kai', 'rowan', 'skyler', 'reese'];
  const users = [];
  for (let id = 1; id <= 1200; id++) {
    const name = `${pick(first)}${id}`;
    users.push([id, name, `${name}@example.com`, 'local-dev-not-a-real-hash', pick(domestic)]);
  }
  await insertMany(conn, 'Users', ['user_id', 'username', 'email', 'password_hash', 'airport_home'], users);

  const notes = ['Thanksgiving trip', 'Spring break', 'Visit family', 'Conference in March', 'Summer internship move', null, null, null];
  const saved = [];
  for (let id = 1; id <= 2400; id++) {
    const [o, d] = pick(routes);
    const avg = base.get(`${o}-${d}`);
    saved.push([id, pick(['any', 'weekday', 'weekend', 'holiday']), pick(['any', 'nonstop', 'connecting']),
      Math.round(avg * (0.7 + rand() * 0.5)), pick(notes),
      `2026-${String(between(8, 10)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')} 12:00:00`,
      rand() < 0.15 ? 1 : 0, ((id - 1) % 1200) + 1, o, d,
      rand() < 0.5 ? pick(AIRLINES)[0] : null, rand() < 0.6 ? pick(WINDOWS)[0] : null]);
  }
  await insertMany(conn, 'Saved_Route', ['route_id', 'departure_day_filter', 'stop_type', 'target_price', 'note', 'created_at', 'is_archived', 'user_id', 'origin_airport', 'destination_airport', 'airline_id', 'window_id'], saved);

  const [counts] = await conn.query(`SELECT
    (SELECT COUNT(*) FROM Users) users, (SELECT COUNT(*) FROM Saved_Route) saved_routes, (SELECT COUNT(*) FROM Fare_Prices) fares`);
  console.log('Local database ready:', counts[0]);
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
