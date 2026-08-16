require("dotenv").config({ path: "./.env" });
const { Pool } = require("pg");
const fs = require("fs");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function main() {
  const res = await pool.query(`
    SELECT jsonb_build_object('categories', COALESCE(i.category, '[]'::jsonb)) as obj
    FROM items i
    WHERE alpha_code = 'IDL' LIMIT 1
  `);
  fs.writeFileSync("out4.json", JSON.stringify(res.rows, null, 2), "utf8");
  process.exit(0);
}
main();
