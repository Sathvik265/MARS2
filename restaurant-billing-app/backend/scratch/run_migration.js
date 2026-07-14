const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function run() {
  try {
    console.log("Starting migrations...");

    // 1. Add allowed_clerks column
    await pool.query(`ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS allowed_clerks TEXT DEFAULT 'CLK,V,P,B'`);
    console.log("Allowed clerks column added/verified.");

    // 2. Add section column
    await pool.query(`ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS section VARCHAR(10) DEFAULT 'L'`);
    console.log("Section column added/verified.");

    // 3. Drop unique constraint on sessions
    await pool.query(`ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_shift_name_session_date_clerk_initials_key`);
    console.log("Unique constraint dropped/verified.");

    // 4. Alter quantity types in orders and bill_items
    await pool.query(`ALTER TABLE public.orders ALTER COLUMN quantity TYPE numeric(10,2)`);
    await pool.query(`ALTER TABLE public.bill_items ALTER COLUMN quantity TYPE numeric(10,2)`);
    console.log("Altered quantity column type to numeric(10,2) in orders and bill_items.");

    // 5. Redefine get_category_totals_for_date
    await pool.query(`DROP FUNCTION IF EXISTS public.get_category_totals_for_date(date)`);
    await pool.query(`
      CREATE FUNCTION public.get_category_totals_for_date(p_date date)
      RETURNS TABLE(category_name character varying, total_quantity numeric)
      LANGUAGE plpgsql
      AS $$
      BEGIN
          RETURN QUERY
          SELECT 
              cat->>'name' AS category_name,
              SUM((item->>'quantity')::numeric * (cat->>'qty')::numeric)::numeric AS total_quantity
          FROM public.bills b
          CROSS JOIN LATERAL jsonb_array_elements(b.items_json) AS item
          CROSS JOIN LATERAL (
              SELECT i.category
              FROM public.items i
              WHERE i.alpha_code = item->>'item_code_alpha'
                 OR i.numeric_code = item->>'item_code_numeric'
              LIMIT 1
          ) AS item_info
          CROSS JOIN LATERAL jsonb_array_elements(item_info.category) AS cat
          WHERE b.bill_date = p_date
          GROUP BY cat->>'name'
          ORDER BY total_quantity DESC;
      END;
      $$
    `);
    console.log("Redefined get_category_totals_for_date function.");

    console.log("Migrations completed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

run();
