const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.query("SELECT * FROM orders")
    .then(res => {
        console.log(`Total orders in DB: ${res.rows.length}`);
        res.rows.forEach(o => {
            console.log(`ID: ${o.id} | Table: ${o.table_no} | Party: ${o.party_no} | Date: ${o.bill_date} | Item: ${o.item_name} | Qty: ${o.quantity}`);
        });
    })
    .catch(err => {
        console.error("Error:", err.message);
    })
    .finally(() => {
        process.exit(0);
    });
