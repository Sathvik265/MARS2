const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'Deepthi@2004',
  port: 5432,
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT 
        pid,
        usename,
        datname,
        client_addr,
        application_name,
        state,
        query,
        backend_start
      FROM pg_stat_activity
      WHERE datname IS NOT NULL
      ORDER BY backend_start DESC
    `);
    console.log(`Active connections: ${res.rows.length}`);
    console.table(res.rows.map(r => ({
      pid: r.pid,
      db: r.datname,
      user: r.usename,
      state: r.state,
      query: r.query.substring(0, 100),
      start: r.backend_start
    })));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
