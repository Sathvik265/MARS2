const pool = require("./src/db/index");

async function run() {
  try {
    await pool.query('DROP TABLE IF EXISTS running_bills');
    await pool.query(`
      CREATE TABLE running_bills (
        id INT PRIMARY KEY DEFAULT 1,
        "\`" INT DEFAULT 0,
        "\`\`" INT DEFAULT 0,
        "RBS1" INT DEFAULT 0,
        "RBS2" INT DEFAULT 0
      )
    `);
    await pool.query(`
      INSERT INTO running_bills (id, "\`", "\`\`", "RBS1", "RBS2")
      VALUES (1, 0, 0, 0, 0)
    `);
    const result = await pool.query(`SELECT "\`" as a, "\`\`" as b FROM running_bills`);
    console.log("Success! Columns:", result.rows);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    process.exit(0);
  }
}
run();
