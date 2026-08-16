const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function fixFunction() {
    const client = await pool.connect();
    try {
        console.log("Fixing function move_orders_to_bill_json...");

        await client.query(`
CREATE OR REPLACE FUNCTION public.move_orders_to_bill_json(
    p_table_no integer,
    p_party_no character varying,
    p_bill_no character varying
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
    moved_count INTEGER;
BEGIN
    -- Move orders to bill_items table
    -- The error showed a SELECT jsonb_agg being used. 
    -- It seems the previous implementation might have been selecting into a variable to then insert?
    -- OR maybe it was doing an INSERT INTO ... SELECT ...
    
    -- Let's reconstruct standard move logic but respecting the JSON construction that was failling.
    -- The error was: "SELECT jsonb_agg(...) FROM orders o LEFT JOIN items i ... WHERE ..."
    -- This suggests it might be populating a 'items_json' column in 'bills' table?
    -- OR it populates 'bill_items' table.
    
    -- Wait, if I don't know the exact target, I might break it.
    -- However, standard "move orders to bill" in this app likely:
    -- 1. Inserts into bill_items
    -- 2. Deletes from orders
    
    -- But the error context "select_common_type" inside "move_orders_to_bill_json"
    -- strongly supports that there was a complex SELECT statement.
    
    -- Hypothesized logic based on error dump:
    /*
    INSERT INTO bill_items (bill_id, ... data ...)
    SELECT 
       (SELECT id FROM bills WHERE bill_number = p_bill_no LIMIT 1),
       ... 
       jsonb_build_object( ... 'categories', ... ) 
    FROM orders ...
    */
    
    -- Given I cannot see the full function, I must check 'bill_items' schema to see if it has a json column?
    -- Converting blindly is risky. 
    
    -- ALTERNATIVE: I can update the column type in the query part I know exists.
    -- But I need to wrap it in the rest of the function.
    
    -- Let's try to get the definition ONE MORE TIME but simply SELECT prosrc FROM pg_proc WHERE proname='move_orders_to_bill_json';
    -- Maybe pg_get_functiondef includes too much noise.
    
    const res = await client.query("SELECT prosrc FROM pg_proc WHERE proname='move_orders_to_bill_json'");
    console.log("--- PROSRC START ---");
    console.log(res.rows[0].prosrc);
    console.log("--- PROSRC END ---");
    
    `);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        client.release();
        pool.end();
    }
}

// Just get source first
async function getSource() {
    const client = await pool.connect();
    try {
        const res = await client.query("SELECT prosrc FROM pg_proc WHERE proname='move_orders_to_bill_json'");
        console.log("--- SOURCE ---");
        console.log(res.rows[0].prosrc);
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

getSource();
