-- Database schema update script for decimal quantity support
-- Updates orders and bill_items quantity columns to numeric(10,2)

ALTER TABLE public.orders ALTER COLUMN quantity TYPE NUMERIC(10,2);
ALTER TABLE public.orders ALTER COLUMN quantity SET DEFAULT 1.00;

ALTER TABLE public.bill_items ALTER COLUMN quantity TYPE NUMERIC(10,2);

DROP FUNCTION IF EXISTS public.get_category_totals_for_date(date);

-- Update PL/pgSQL function to handle decimal quantities in category totals
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
