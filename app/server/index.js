const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const api = require('./api');
const { pool, describeDbError } = require('./db');

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, async () => {
  console.log(`FareWise running at http://localhost:${port}`);
  try {
    const [[row]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');
    console.log(`Connected to MySQL ${row.version} at ${process.env.DB_HOST || '127.0.0.1'}, database "${row.db}"`);
  } catch (err) {
    console.error('Database not reachable yet:', describeDbError(err));
  }
});
