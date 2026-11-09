-- ========================================================================
-- RBS (Restaurant Billing System) - Safe Pendrive Database Patch Script
-- Target: Apply schema updates, items_json column, decimal quantity support,
--         and updated category totals function without dropping existing data.
-- ========================================================================

BEGIN;

-- 1. Ensure extension for UUID generation is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Ensure items_json column exists in bills table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'items_json'
    ) THEN
        ALTER TABLE public.bills ADD COLUMN items_json JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- 3. Support decimal quantities in orders and bill tables
ALTER TABLE public.orders ALTER COLUMN quantity TYPE NUMERIC(10,2);
ALTER TABLE public.orders ALTER COLUMN quantity SET DEFAULT 1.00;

-- 4. Create GIN index on items_json for fast category & report queries
CREATE INDEX IF NOT EXISTS idx_bills_items_json ON public.bills USING GIN (items_json);

-- 5. Update move_orders_to_bill_json function to embed categories in items_json snapshot
DROP FUNCTION IF EXISTS public.move_orders_to_bill_json(INTEGER, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.move_orders_to_bill_json(
    p_bill_id INTEGER, 
    p_table_no VARCHAR(20), 
    p_party_no VARCHAR(20)
) RETURNS INTEGER AS $$
DECLARE
    moved_count INTEGER := 0;
    items_array JSONB;
BEGIN
    -- Build items_json with category information included
    SELECT jsonb_agg(
        jsonb_build_object(
            'item_name', o.item_name,
            'item_code_numeric', o.numeric_item_code,
            'item_code_alpha', o.item_code,
            'quantity', o.quantity,
            'fixed_price', o.unit_price,
            'actual_price', o.unit_price,
            'line_total', o.line_total,
            'split_category', COALESCE(o.split_category, i.split_category, 0),
            'categories', COALESCE(i.category, '[]'::jsonb)
        )
    )
    INTO items_array 
    FROM public.orders o
    LEFT JOIN public.items i ON (i.alpha_code = o.item_code OR i.numeric_code = o.numeric_item_code)
    WHERE o.table_no::VARCHAR = p_table_no 
      AND o.party_no = p_party_no;

    IF items_array IS NULL OR jsonb_array_length(items_array) = 0 THEN 
        RETURN 0; 
    END IF;

    -- Update bills with the snapshotted items_json
    UPDATE public.bills 
    SET items_json = items_array 
    WHERE id = p_bill_id;

    -- Delete active orders after moving to bill
    WITH deleted AS (
        DELETE FROM public.orders 
        WHERE table_no::VARCHAR = p_table_no 
          AND party_no = p_party_no 
        RETURNING 1
    )
    SELECT count(*) INTO moved_count FROM deleted;

    RETURN moved_count;
END;
$$ LANGUAGE plpgsql;

-- 6. Update get_category_totals_for_date function for category quantity calculations
DROP FUNCTION IF EXISTS public.get_category_totals_for_date(date) CASCADE;

CREATE OR REPLACE FUNCTION public.get_category_totals_for_date(p_date date) 
RETURNS TABLE(category_name character varying, total_quantity numeric)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cat->>'name' AS category_name,
        CEIL(SUM((item->>'quantity')::numeric * (cat->>'qty')::numeric))::numeric AS total_quantity
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
$$;

-- 7. Update category multipliers for combos and multiple-quantity items
UPDATE public.items 
SET category = '[{"name": "dosa", "category_old": "dosa", "qty": 2}]'::jsonb
WHERE numeric_code IN ('113', '119') OR alpha_code IN ('MMM', 'PAD');

UPDATE public.items 
SET category = '[{"name": "dosa", "category_old": "dosa", "qty": 3}]'::jsonb
WHERE numeric_code = '121' OR alpha_code = 'SED';

UPDATE public.items 
SET category = '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb
WHERE numeric_code = '101' OR alpha_code = 'IDL';

UPDATE public.items 
SET category = '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb
WHERE numeric_code = '102' OR alpha_code = 'SIV';

UPDATE public.items 
SET category = '[{"name": "Idli", "category_old": "idli", "qty": 2}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb
WHERE numeric_code = '103' OR alpha_code = 'ISV';

COMMIT;
