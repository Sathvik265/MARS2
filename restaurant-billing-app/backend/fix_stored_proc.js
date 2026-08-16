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
        console.log("Replacing function move_orders_to_bill_json...");

        // Matches usage in billingModel.js: [billId, table_no.toString(), party_no]
        // Signature: (integer, varchar, varchar)

        const query = `
CREATE OR REPLACE FUNCTION public.move_orders_to_bill_json(
    p_bill_id integer,
    p_table_no character varying,
    p_party_no character varying
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
    moved_count INTEGER := 0;
    v_bill_items JSONB;
BEGIN
    -- 1. Aggregate orders info JSONB array
    SELECT jsonb_agg(
        jsonb_build_object(
            'item_name', o.item_name,
            'item_code_numeric', o.numeric_item_code,
            'item_code_alpha', o.item_code,
            'quantity', o.quantity,
            'fixed_price', o.unit_price,
            'actual_price', o.unit_price,
            'line_total', o.line_total,
            -- FIX: Handle category as text, ensuring it returns a JSON array string or valid jsonb
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
    WHERE o.table_no = p_table_no::INTEGER
    AND o.party_no = p_party_no;

    -- If no items, return 0
    IF v_bill_items IS NULL OR jsonb_array_length(v_bill_items) = 0 THEN
        RETURN 0;
    END IF;

    -- 2. Update bills table
    UPDATE bills SET items_json = v_bill_items WHERE id = p_bill_id;

    -- 3. Delete from orders
    WITH deleted AS (
        DELETE FROM orders
        WHERE table_no = p_table_no::INTEGER
        AND party_no = p_party_no
        RETURNING 1
    )
    SELECT count(*) INTO moved_count FROM deleted;

    RETURN moved_count;
END;
$function$;
`;

        await client.query(query);
        console.log("Successfully updated move_orders_to_bill_json");

    } catch (e) {
        console.error("Error updating function:", e);
    } finally {
        client.release();
        pool.end();
    }
}

updateFunction();
