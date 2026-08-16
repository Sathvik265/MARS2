const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function updateFunction() {
    const client = await pool.connect();
    try {
        console.log("Updating function move_orders_to_bill_json...");

        // Original query had: 'categories', COALESCE(i.category, '[]'::jsonb)
        // Since i.category is now VARCHAR, we should just return it as a string,
        // OR if the frontend expects an array, wrap it.
        // Based on previous JSON, user wanted "dosa" as category.
        // Let's assume 'categories' field in JSON is expected to be a string or array.
        // Safest bet: If it was '[]' ie array, we should probably wrap the text in an array ["dosa"].
        // OR just return the string if the UI handles it.
        // Checking the error again: "COALESCE types character varying and jsonb cannot be matched"

        // New logic:
        // 'categories', CASE WHEN i.category IS NOT NULL THEN jsonb_build_array(i.category) ELSE '[]'::jsonb END
        // This ensures it returns a JSONB array, compatible with '[]'::jsonb fallback.

        const query = `
CREATE OR REPLACE FUNCTION public.move_orders_to_bill_json(p_table_no integer, p_party_no character varying, p_bill_no character varying)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    moved_count INTEGER;
    v_bill_items JSONB;
BEGIN
    -- 1. Aggregate orders into JSONB array
    SELECT jsonb_agg(
        jsonb_build_object(
            'item_name', o.item_name,
            'item_code_numeric', o.numeric_item_code,
            'item_code_alpha', o.item_code,
            'quantity', o.quantity,
            'fixed_price', o.unit_price,
            'actual_price', o.unit_price,
            'line_total', o.line_total,
            -- FIX HERE: i.category is now TEXT. Wrap in array to maintain JSONB structure or just cast.
            -- Assuming frontend expects list:
            'categories', CASE 
                            WHEN i.category IS NOT NULL AND i.category != '' 
                            THEN jsonb_build_array(i.category) 
                            ELSE '[]'::jsonb 
                          END
        )
    )
    INTO v_bill_items
    FROM orders o
    LEFT JOIN items i ON (i.alpha_code = o.item_code OR i.numeric_code = o.numeric_item_code)
    WHERE o.table_no = p_table_no
    AND o.party_no = p_party_no;

    -- If no items, return 0
    IF v_bill_items IS NULL THEN
        RETURN 0;
    END IF;

    -- 2. Insert into bill_items as a single block or loop?
    -- Wait, the function name move_orders_to_bill_json suggests it moves orders to bill_items table?
    -- The error was in "SQL statement" inside this function.
    -- Let's look at what the function likely does. It likely inserts into bill_items.
    -- If bill_items expects individual rows, this aggregation might be for a different purpose?
    -- Ah, maybe it inserts into a JSON column in bills table?
    
    -- Actually, looking at standard patterns, maybe it moves rows to bill_items.
    -- But the error came from a SELECT jsonb_agg...
    
    -- Let's assume the previous logic was correctly grabbing data, just the COALESCE failed.
    -- We just need to replace the logic.
    
    -- Wait, I don't see the INSERT part in the partial output.
    -- I will assume the function body logic based on the error context.
    -- But I need to be careful not to delete the INSERT part.
    
    -- RE-STRATEGY: I only saw "SELECT jsonb_agg..." in the error.
    -- I must get the FULL definition to preserve the rest of the function.
    -- The previous "node get_func_def.js" output was somehow empty or failed to pipe?
    -- "Exit code: 0" but output was garbled/empty.
    
    -- I will try to read the definition again using console.log but chopping it into chunks if it's too large?
    -- Or just console.log(JSON.stringify(res.rows[0].pg_get_functiondef)) to avoid newline truncation issues.
    
    throw new Error("Safeguard: verify function body before overwriting");

  } catch (e) {
    console.error("Error:", e);
  } finally {
    client.release();
    pool.end();
  }
}
// updateFunction(); 
`;

        // I will rewrite the get_def script first as safeguard is triggered mentaly.

        const res = await client.query("SELECT pg_get_functiondef('move_orders_to_bill_json'::regproc)");
        console.log("--- FUNCTION DEF START ---");
        console.log(res.rows[0].pg_get_functiondef);
        console.log("--- FUNCTION DEF END ---");

    } catch (e) {
        console.error("Error:", e);
    } finally {
        client.release();
        pool.end();
    }
}

updateFunction();
