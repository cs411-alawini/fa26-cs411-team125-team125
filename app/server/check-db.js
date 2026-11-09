// Quick connection test: `npm run db:check`
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool, describeDbError } = require('./db');

(async () => {
  const tables = ['Airports', 'Airlines', 'Booking_Window', 'Users', 'Saved_Route', 'Fare_Prices'];
  try {
    const [[v]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS db');
    console.log(`Connected: MySQL ${v.version}, database "${v.db}" on ${process.env.DB_HOST}`);
    for (const t of tables) {
      const [[c]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      console.log(`  ${t.padEnd(15)} ${c.n} rows`);
    }
    process.exitCode = 0;
  } catch (err) {
    console.error('Connection failed:', describeDbError(err));
    console.error('  (' + (err.code || '') + ' ' + err.message + ')');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
