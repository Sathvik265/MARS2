const pool = require('../src/db');

async function update() {
  console.log("Updating move_orders_to_bill_json stored procedure...");
  
  const query = `
CREATE OR REPLACE FUNCTION public.move_orders_to_bill_json(
    p_bill_id integer, 
    p_table_no text, 
    p_party_no text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    v_bill_items JSONB;
BEGIN
    -- 1. Aggregating orders into a JSONB array including is_separate flag from orders table (or fallback to items default)
    SELECT jsonb_agg(
        jsonb_build_object(
            'item_name', o.item_name,
            'item_code_numeric', o.numeric_item_code,
            'item_code_alpha', o.item_code,
            'quantity', o.quantity,
            'fixed_price', o.unit_price,
            'actual_price', o.unit_price,
            'line_total', o.line_total,
            'is_separate', COALESCE(o.is_separate, i.is_separate, false),
            'category', i.category
        )
        ORDER BY o.id
    )
    INTO v_bill_items
    FROM orders o
    LEFT JOIN items i ON (i.alpha_code = o.item_code OR i.numeric_code::text = o.numeric_item_code::text)
    WHERE o.table_no::text = p_table_no
    AND o.party_no::text = p_party_no;

    -- Handle empty items case
    IF v_bill_items IS NULL THEN
        v_bill_items := '[]'::jsonb;
    END IF;

    -- 2. Update the bill items_json (and legacy items column to be safe)
    UPDATE bills 
    SET items_json = v_bill_items,
        items = v_bill_items
    WHERE id = p_bill_id;

    -- 3. Delete the moved orders
    DELETE FROM orders 
    WHERE table_no::text = p_table_no 
    AND party_no::text = p_party_no;

END;
$function$;
  `;
  
  await pool.query(query);
  console.log("Function move_orders_to_bill_json successfully updated in DB!");
  process.exit(0);
}

update().catch((err) => {
  console.error("Failed to update function:", err);
  process.exit(1);
});
