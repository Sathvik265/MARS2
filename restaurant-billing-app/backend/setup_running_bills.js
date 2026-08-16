const pool = require("./src/db/index");

async function setup() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS running_bills (
        id INT PRIMARY KEY DEFAULT 1,
        track_morning INT DEFAULT 0,
        track_afternoon INT DEFAULT 0,
        track_rbs1 INT DEFAULT 0,
        track_rbs2 INT DEFAULT 0
      );
    `);
    await pool.query(`
      INSERT INTO running_bills (id, track_morning, track_afternoon, track_rbs1, track_rbs2)
      VALUES (1, 0, 0, 0, 0)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("running_bills table created");
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
setup();
