const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    .then(res => {
        console.log("Tables in database:", res.rows.map(r => r.table_name));
    })
    .catch(err => {
        console.error("Error querying tables:", err.message);
    })
    .finally(() => {
        process.exit(0);
    });
