const pool = require('../src/db');

async function run() {
  try {
    const res = await pool.query('SELECT * FROM orders ORDER BY table_no, party_no, created_at');
    console.log(`Total orders in DB: ${res.rows.length}`);
    console.table(res.rows.map(r => ({
      id: r.id,
      table: r.table_no,
      party: r.party_no,
      item: r.item_name,
      qty: r.quantity,
      price: r.unit_price,
      total: r.line_total,
      bill_number: r.bill_number
    })));
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
