// MySQL connection pool and small helpers shared by the API.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function sslOptions() {
  const mode = (process.env.DB_SSL || 'required').toLowerCase();
  if (mode === 'off' || mode === 'false' || mode === 'disabled') return undefined;
  if (mode === 'verify') {
    const caPath = process.env.DB_SSL_CA;
    if (!caPath) throw new Error('DB_SSL=verify needs DB_SSL_CA pointing at server-ca.pem');
    return { ca: fs.readFileSync(path.resolve(caPath)), rejectUnauthorized: true };
  }
  // "required": encrypt, but do not verify the certificate (Cloud SQL's default setup).
  return { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'cs411_project',
  ssl: sslOptions(),
  connectionLimit: 8,
  connectTimeout: 10000,
  decimalNumbers: true,
  dateStrings: true,
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// The Stage 3 table spells Airports.airport_name as "aiport_name".
// Look up the real column once so the app works before and after it is renamed.
let schema = null;
async function getSchema() {
  if (schema) return schema;
  const cols = await query(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Airports'`
  );
  const names = cols.map((c) => c.name);
  if (names.length === 0) throw new Error('Table Airports not found in database ' + (process.env.DB_NAME || 'cs411_project'));
  schema = {
    airportName: names.includes('airport_name') ? 'airport_name' : 'aiport_name',
  };
  return schema;
}

// Explain the usual Cloud SQL connection failures in plain words.
function describeDbError(err) {
  const code = err && (err.code || err.errno);
  switch (code) {
    case 'ETIMEDOUT':
    case 'ECONNREFUSED':
    case 'EHOSTUNREACH':
      return 'Cannot reach the database server. On Cloud SQL, add your public IP under Connections -> Networking -> Authorized networks.';
    case 'ER_ACCESS_DENIED_ERROR':
      return 'The database rejected the username or password in .env.';
    case 'ER_BAD_DB_ERROR':
      return 'The database name in DB_NAME does not exist on this server.';
    case 'HANDSHAKE_SSL_ERROR':
    case 'HANDSHAKE_NO_SSL_SUPPORT':
      return 'SSL handshake failed. Check DB_SSL (required / verify / off).';
    default:
      return err && err.message ? err.message : 'Unknown database error';
  }
}

module.exports = { pool, query, getSchema, describeDbError };
