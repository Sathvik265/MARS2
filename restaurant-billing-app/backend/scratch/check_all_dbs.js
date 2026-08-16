const { Pool } = require('pg');

const dbNames = ['postgres', 'hotel_billing', 'hotel_billing_db', 'rbs_db', 'restaurant_billing'];

async function run() {
  for (const dbName of dbNames) {
    const pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: dbName,
      password: 'Deepthi@2004',
      port: 5432,
    });

    try {
      // Check if table exists
      const tableCheck = await pool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'items')"
      );
      const exists = tableCheck.rows[0].exists;
      if (!exists) {
        console.log(`DB [${dbName}]: no 'items' table.`);
        continue;
      }

      const countRes = await pool.query('SELECT count(*) FROM items');
      const maxCreated = await pool.query('SELECT max(created_at) FROM items');
      console.log(`DB [${dbName}]: count = ${countRes.rows[0].count}, max_created = ${maxCreated.rows[0].max}`);
    } catch (e) {
      console.error(`DB [${dbName}] Error:`, e.message);
    } finally {
      await pool.end();
    }
  }
}

run();
