-- ========================================================================
-- RESTAURANT BILLING SYSTEM - UNIFIED FIXED DATABASE SETUP SCRIPT (Final_Dump_Fixed.sql)
-- Recreates the database schema from the user-provided dump, corrected for:
-- 1. items.numeric_code -> VARCHAR(20) to support alphanumeric codes (e.g. 114A, 135A) and lookup UPPER() check.
-- 2. items.category -> JSONB to support category array operations in reports.
-- 3. bills/orders.table_no -> INTEGER to link with tables(table_id) FK and prevent type mismatches with codebase parsers.
-- 4. move_orders_to_bill_json -> updated to write the correct 'categories' key expected by reporting controllers.
-- ========================================================================

-- Re-enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================================
-- 1. CREATE TABLES
-- ========================================================================

-- Master shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
    id SERIAL PRIMARY KEY,
    shift_name character varying(20) NOT NULL UNIQUE CHECK (
        shift_name IN ('`', '``', 'RBS1', 'RBS2')
    ),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Individual clerk/shift sessions
CREATE TABLE IF NOT EXISTS public.sessions (
    id SERIAL PRIMARY KEY,
    session_id uuid DEFAULT public.uuid_generate_v4() UNIQUE,
    shift_name character varying(20) NOT NULL REFERENCES public.shifts(shift_name),
    clerk_initials character varying(10) NOT NULL,
    session_date date NOT NULL,
    start_time timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    end_time timestamp with time zone,
    status character varying(10) DEFAULT 'OPEN'::character varying NOT NULL CHECK (
        status IN ('OPEN', 'CLOSED')
    ),
    closed_by character varying(50),
    is_locked boolean DEFAULT false NOT NULL,
    last_bill_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shift_name, session_date, clerk_initials)
);

-- Master settings table
CREATE TABLE IF NOT EXISTS public.settings (
    id SERIAL PRIMARY KEY,
    hotel_name character varying(255) DEFAULT 'Restaurant Name'::character varying,
    address text,
    phone character varying(20),
    gstin character varying(20),
    clerk_initials character varying(10) UNIQUE DEFAULT 'CLK'::character varying,
    sgst_percentage numeric(5,2) DEFAULT 2.50,
    cgst_percentage numeric(5,2) DEFAULT 2.50,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Menu items table
CREATE TABLE IF NOT EXISTS public.items (
    id SERIAL PRIMARY KEY,
    name character varying(255) NOT NULL,
    alpha_code character varying(20) UNIQUE,
    numeric_code character varying(20) UNIQUE,
    price_fixed numeric(10,2) DEFAULT 0.00,
    price_general numeric(10,2) DEFAULT 0.00,
    price_ac numeric(10,2) DEFAULT 0.00,
    category jsonb DEFAULT '[]'::jsonb,
    is_separate boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_category_format CHECK (category IS NULL OR jsonb_typeof(category) = 'array')
);

-- Tables mapping table
CREATE TABLE IF NOT EXISTS public.tables (
    table_id integer PRIMARY KEY,
    section_name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- Bills table
CREATE TABLE IF NOT EXISTS public.bills (
    id SERIAL PRIMARY KEY,
    bill_number integer NOT NULL,
    bill_date date NOT NULL,
    table_no integer REFERENCES public.tables(table_id) ON DELETE SET NULL ON UPDATE CASCADE,
    party_no character varying(20) DEFAULT '1'::character varying,
    section character varying(10) DEFAULT 'G'::character varying,
    track character varying(20),
    clerk_initials character varying(10),
    subtotal numeric(10,2) DEFAULT 0.00,
    sgst numeric(10,2) DEFAULT 0.00,
    cgst numeric(10,2) DEFAULT 0.00,
    tax_amount numeric(10,2) DEFAULT 0.00,
    grand_total numeric(10,2) DEFAULT 0.00,
    items_json jsonb DEFAULT '[]'::jsonb,
    items jsonb DEFAULT '[]'::jsonb,
    order_id character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bills_bill_number_bill_date_track_key UNIQUE (bill_number, bill_date, track),
    CONSTRAINT uq_bills_composite_key UNIQUE (table_no, party_no, created_at, track, clerk_initials)
);

-- Temporary orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id SERIAL PRIMARY KEY,
    track character varying(20) NOT NULL,
    clerk_initials character varying(10) NOT NULL,
    table_no integer NOT NULL,
    party_no character varying(20) DEFAULT '1'::character varying NOT NULL,
    bill_number integer NOT NULL,
    bill_date date DEFAULT CURRENT_DATE NOT NULL,
    item_code character varying(20),
    numeric_item_code character varying(20),
    item_name character varying(255),
    quantity integer DEFAULT 1,
    unit_price numeric(10,2) DEFAULT 0.00,
    line_total numeric(10,2) DEFAULT 0.00,
    is_separate boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_bills_composite FOREIGN KEY (table_no, party_no, created_at, track, clerk_initials)
        REFERENCES public.bills(table_no, party_no, created_at, track, clerk_initials)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Bill items table (Legacy/analytical table)
CREATE TABLE IF NOT EXISTS public.bill_items (
    bill_item_id SERIAL PRIMARY KEY,
    bill_id integer NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    item_name character varying(255) NOT NULL,
    quantity integer NOT NULL,
    price_per_item numeric(10,2) NOT NULL,
    line_total numeric(10,2),
    created_at timestamp with time zone DEFAULT now()
);

-- Counter table for running bills
CREATE TABLE IF NOT EXISTS public.running_bills (
    id integer DEFAULT 1 PRIMARY KEY,
    track_morning integer DEFAULT 0,
    track_afternoon integer DEFAULT 0,
    track_rbs1 integer DEFAULT 0,
    track_rbs2 integer DEFAULT 0
);

-- Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
    id SERIAL PRIMARY KEY,
    event_id uuid DEFAULT public.uuid_generate_v4(),
    timestamp_utc timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    performed_by_user_id character varying(50),
    performed_by_user_name character varying(100),
    user_role character varying(20),
    action_type character varying(50),
    resource_type character varying(50),
    resource_id character varying(50),
    shift_session_id uuid REFERENCES public.sessions(session_id),
    ip_address inet,
    payload jsonb,
    correlation_id uuid
);

-- Debug logs table
CREATE TABLE IF NOT EXISTS public.debug_logs (
    id SERIAL PRIMARY KEY,
    message text,
    data jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================================
-- 2. CREATE INDEXES
-- ========================================================================

CREATE INDEX IF NOT EXISTS idx_bills_date_number ON public.bills(bill_date, bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_items_json ON public.bills USING GIN (items_json);
CREATE INDEX IF NOT EXISTS idx_bills_table_no ON public.bills(table_no);

CREATE INDEX IF NOT EXISTS idx_items_codes ON public.items(alpha_code, numeric_code);
CREATE INDEX IF NOT EXISTS idx_items_category ON public.items USING GIN (category);

CREATE INDEX IF NOT EXISTS idx_sessions_shift_date ON public.sessions(shift_name, session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_locked ON public.sessions (shift_name, is_locked);

CREATE INDEX IF NOT EXISTS idx_orders_table_no ON public.orders(table_no);
CREATE INDEX IF NOT EXISTS idx_orders_bill_number_date ON public.orders(bill_number, bill_date);

CREATE INDEX IF NOT EXISTS idx_tables_section_name ON public.tables(section_name);

CREATE UNIQUE INDEX IF NOT EXISTS bills_bill_number_bill_date_unique ON public.bills(bill_number, bill_date, track) WHERE bill_number > 0;

-- ========================================================================
-- 3. CREATE FUNCTIONS
-- ========================================================================

-- move_orders_to_bill_json function
CREATE OR REPLACE FUNCTION public.move_orders_to_bill_json(
    p_bill_id integer, 
    p_table_no text, 
    p_party_no text
) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_bill_items JSONB;
BEGIN
    -- Aggregating orders into a JSONB array including is_separate flag from orders table (or fallback to items default)
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
            'categories', COALESCE(i.category, '[]'::jsonb) -- Key changed to 'categories' to support dashboard/reporting controller
        )
        ORDER BY o.id
    )
    INTO v_bill_items
    FROM public.orders o
    LEFT JOIN public.items i ON (i.alpha_code = o.item_code OR i.numeric_code = o.numeric_item_code)
    WHERE o.table_no::text = p_table_no
    AND o.party_no::text = p_party_no;

    -- Handle empty items case
    IF v_bill_items IS NULL THEN
        v_bill_items := '[]'::jsonb;
    END IF;

    -- Update the bill items_json and legacy items column
    UPDATE public.bills 
    SET items_json = v_bill_items,
        items = v_bill_items
    WHERE id = p_bill_id;

    -- Delete the moved orders
    DELETE FROM public.orders 
    WHERE table_no::text = p_table_no 
    AND party_no::text = p_party_no;
END;
$$;

-- get_section_by_table function
CREATE OR REPLACE FUNCTION public.get_section_by_table(p_table_no character varying)
RETURNS character varying AS $$
DECLARE
    section_name character varying(100);
    table_num integer;
BEGIN
    BEGIN
        table_num := p_table_no::integer;
    EXCEPTION WHEN OTHERS THEN
        RETURN 'Unknown';
    END;
    SELECT t.section_name INTO section_name FROM public.tables t WHERE t.table_id = table_num;
    RETURN COALESCE(section_name, 'Unknown');
END;
$$ LANGUAGE plpgsql;

-- get_category_totals_for_date function
CREATE OR REPLACE FUNCTION public.get_category_totals_for_date(p_date date)
RETURNS TABLE(category_name character varying, total_quantity integer) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cat->>'name' AS category_name,
        SUM((item->>'quantity')::integer * (cat->>'qty')::integer)::integer AS total_quantity
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
$$ LANGUAGE plpgsql;

-- get_current_session_id function
CREATE OR REPLACE FUNCTION public.get_current_session_id(
    p_shift_type character varying DEFAULT NULL::character varying, 
    p_target_date date DEFAULT NULL::date, 
    p_clerk_initials character varying DEFAULT NULL::character varying
) RETURNS uuid AS $$
DECLARE
    session_uuid uuid;
    v_shift_type character varying;
    v_target_date date := COALESCE(p_target_date, CURRENT_DATE);
BEGIN
    v_shift_type := COALESCE(p_shift_type, CASE
        WHEN CURRENT_TIME BETWEEN '06:00:00'::time without time zone AND '11:59:59'::time without time zone THEN '`'::character varying
        WHEN CURRENT_TIME BETWEEN '12:00:00'::time without time zone AND '17:59:59'::time without time zone THEN '``'::character varying
        WHEN CURRENT_TIME BETWEEN '18:00:00'::time without time zone AND '21:59:59'::time without time zone THEN 'RBS1'::character varying
        ELSE 'RBS2'::character varying END);
    SELECT s.session_id INTO session_uuid FROM public.sessions s
    WHERE s.shift_name::text = v_shift_type::text AND s.session_date = v_target_date AND s.status::text = 'OPEN'::text
      AND (p_clerk_initials IS NULL OR s.clerk_initials::text = p_clerk_initials::text)
    ORDER BY s.start_time DESC LIMIT 1;
    RETURN session_uuid;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- 4. CREATE VIEWS
-- ========================================================================

-- View for pending bills
CREATE OR REPLACE VIEW public.pending_bills AS
SELECT DISTINCT o.table_no, o.party_no,
    public.get_section_by_table(o.table_no::character varying) as section_name,
    COUNT(o.id) as total_items,
    SUM(o.line_total) as total_amount,
    MIN(o.created_at) as order_started_at,
    MAX(o.updated_at) as last_updated_at
FROM public.orders o GROUP BY o.table_no, o.party_no;

-- View to show table status
CREATE OR REPLACE VIEW public.table_status AS
SELECT
    t.table_id,
    t.section_name,
    CASE WHEN pb.table_no IS NOT NULL THEN 'OCCUPIED' ELSE 'AVAILABLE' END as status,
    pb.total_items,
    pb.total_amount,
    pb.order_started_at
FROM public.tables t
LEFT JOIN public.pending_bills pb ON t.table_id = pb.table_no
ORDER BY t.table_id;

-- ========================================================================
-- 5. INITIAL DATA INSERTS
-- ========================================================================

-- Insert default settings
INSERT INTO public.settings (hotel_name, address, phone, gstin, clerk_initials, sgst_percentage, cgst_percentage)
SELECT 'Udupi Anand Bhavan', 'Default Address', '123-456-7890', 'GST123456789', 'CLK', 2.50, 2.50
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

-- Populate standard shifts
INSERT INTO public.shifts (shift_name) VALUES
    ('`'), ('``'), ('RBS1'), ('RBS2')
ON CONFLICT (shift_name) DO NOTHING;

-- Table-to-section mappings
INSERT INTO public.tables (table_id, section_name) VALUES
    (1, 'Parcel'),
    (2, 'General'), (3, 'General'), (4, 'General'), (5, 'General'),
    (6, 'General'), (7, 'General'), (8, 'General'), (9, 'General'),
    (10, 'General'), (11, 'General'), (12, 'General'), (13, 'General'), (14, 'General'),
    (15, 'AC'), (16, 'AC'), (17, 'AC'), (18, 'AC'), (19, 'AC'),
    (20, 'AC'), (21, 'AC'), (22, 'AC'), (23, 'AC'), (24, 'AC'),
    (25, 'AC'), (26, 'AC'), (27, 'AC'), (28, 'AC'), (29, 'AC'), (30, 'AC')
ON CONFLICT (table_id) DO UPDATE SET section_name = EXCLUDED.section_name;

-- Standard running bills counter
INSERT INTO public.running_bills (id, track_morning, track_afternoon, track_rbs1, track_rbs2)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Session triggers for current day
DO $$
BEGIN
    INSERT INTO public.sessions (shift_name, clerk_initials, session_date)
    SELECT '`', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM public.sessions WHERE shift_name = '`' AND session_date = CURRENT_DATE);
    INSERT INTO public.sessions (shift_name, clerk_initials, session_date)
    SELECT '``', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM public.sessions WHERE shift_name = '``' AND session_date = CURRENT_DATE);
    INSERT INTO public.sessions (shift_name, clerk_initials, session_date)
    SELECT 'RBS1', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM public.sessions WHERE shift_name = 'RBS1' AND session_date = CURRENT_DATE);
    INSERT INTO public.sessions (shift_name, clerk_initials, session_date)
    SELECT 'RBS2', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM public.sessions WHERE shift_name = 'RBS2' AND session_date = CURRENT_DATE);
END;
$$;

-- ========================================================================
-- 6. BULK INSERT FIXED MENU ITEMS
-- ========================================================================

INSERT INTO public.items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate) VALUES
 ('Unknown', 'TES', '0', 2.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'TBY', '0A', 2.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'O', '0B', 2.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'UTP', '0C', 2.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'ABU', '0D', 2.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('S.I.W Sambar', 'SRW', '100', 54.0, 52.0, 56.0, '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('IDLY', 'IDL', '101', 36.0, 34.0, 38.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('S.IDLI S.WADA', 'SIV', '102', 48.0, 46.0, 50.0, '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('IDLI S.WADA', 'ISV', '103', 65.0, 63.0, 67.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('WADA', 'WAD', '104', 54.0, 52.0, 56.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('RASAM IDLY', 'RAI', '105', 43.0, 41.0, 45.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('RASAM WADA', 'RAW', '106', 60.0, 58.0, 63.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('POORI', 'POO', '107', 57.0, 55.0, 59.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('PLAIN DOSA', 'PLD', '108', 56.0, 54.0, 58.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('MASALA DOSA', 'MAS', '109', 56.0, 54.0, 58.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('RAVA DOSA', 'RAD', '110', 69.0, 67.0, 71.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('ONION DOSA', 'OND', '111', 77.0, 75.0, 81.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('AB SP IDLY', 'SPI', '112', 47.0, 45.0, 49.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('70.MM.DOSA', 'MMM', '113', 104.0, 102.0, 106.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('AB SPL DOSA', 'JER', '114', 97.0, 95.0, 99.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('AB SPL DOSA', 'ABD', '114A', 94.0, 92.0, 96.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('GHEE KARAM DOSA', 'CCM', '115', 97.0, 95.0, 99.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('TOMATO BATH', 'TOB', '116', 35.0, 33.0, 37.0, '[]'::jsonb, FALSE),
 ('TOMOTO.RICE', 'CAP', '117', 62.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('VEG.BERYANI', 'VEB', '118', 62.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('PAPER DOSA', 'PAD', '119', 104.0, 102.0, 106.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('DAHI WADA', 'DHW', '120', 57.0, 55.0, 59.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('SET DOSA', 'SED', '121', 69.0, 67.0, 71.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('MURKUL/MIXTURE', 'MUM', '122', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('MYSORE BAJJI', 'MYB', '123', 46.0, 44.0, 48.0, '[]'::jsonb, FALSE),
 ('ALU BONDA', 'ALU', '124', 35.0, 33.0, 37.0, '[]'::jsonb, FALSE),
 ('VEG.HALEEM', 'HAL', '125', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('S.I.W Rasam', 'RSM', '126', 52.0, 50.0, 54.0, '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('PAROTA', 'PAR', '128', 52.0, 50.0, 54.0, '[]'::jsonb, FALSE),
 ('Chapathi', 'CHA', '129', 52.0, 50.0, 54.0, '[]'::jsonb, FALSE),
 ('ONION RAVA DOSA', 'ORD', '130', 79.0, 77.0, 81.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('Open Dosa', 'OPD', '131', 69.0, 67.0, 71.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('UTTAPA', 'UTA', '132', 81.0, 79.0, 83.0, '[]'::jsonb, FALSE),
 ('FILTR COFFEE', 'COF', '133', 29.0, 27.0, 30.0, '[{"name": "coffee", "category_old": "coffee", "qty": 1}]'::jsonb, FALSE),
 ('TEA', 'TEA', '134', 27.0, 25.0, 28.0, '[{"name": "tea", "category_old": "tea", "qty": 1}]'::jsonb, FALSE),
 ('TEA + CUP', 'AGH', '135', 22.0, 20.0, 23.0, '[{"name": "tea", "category_old": "tea", "qty": 1}]'::jsonb, FALSE),
 ('TEA+CUP', 'TEC', '135A', 28.0, 26.0, 29.0, '[{"name": "tea", "category_old": "tea", "qty": 1}]'::jsonb, FALSE),
 ('BOURNVITA', 'BOU', '136', 29.0, 27.0, 30.0, '[]'::jsonb, FALSE),
 ('EMPTY CUP', 'EMP', '137', 3.0, 1.0, 3.0, '[]'::jsonb, FALSE),
 ('SAMBARID.WADA', 'SAW', '138', 91.0, 89.0, 93.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}, {"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('VEG F.RICE', 'VFR', '142', 62.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('SUGARLESS COFFE', 'SLC', '143', 29.0, 27.0, 30.0, '[{"name": "coffee", "category_old": "coffee", "qty": 1}]'::jsonb, FALSE),
 ('JAMOON', 'JUJ', '151', 33.0, 31.0, 34.0, '[]'::jsonb, FALSE),
 ('SAMBAR WADA', 'SAR', '152', 61.0, 59.0, 63.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('SAMBAR WADA', 'SWD', '152A', 61.0, 59.0, 63.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('SAMBAR IDLY', 'SBR', '153', 43.0, 41.0, 45.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('Coconut Halwaa', 'OKM', '155', 32.0, 30.0, 34.0, '[]'::jsonb, FALSE),
 ('PLATE MEAL', 'PLM', '167', 92.0, 90.0, 94.0, '[]'::jsonb, FALSE),
 ('SPL MEAL', 'SPM', '168', 137.0, 135.0, 139.0, '[]'::jsonb, FALSE),
 ('FRUID SALAD', 'FTS', '169', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('FRIUT WITH ICE', 'FTC', '170', 67.0, 65.0, 69.0, '[]'::jsonb, FALSE),
 ('CURD RICE', 'CUR', '171', 57.0, 55.0, 59.0, '[]'::jsonb, FALSE),
 ('PARCEL JUICE', 'JUI', '172', 37.0, 35.0, 39.0, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('TEST', 'PCO', '175', 2.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('MILK SHAKE', 'BDM', '179', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('CD', 'SLI', '180', 22.0, 20.0, 22.0, '[]'::jsonb, FALSE),
 ('MAAZA', 'CDP', '181', 27.0, 25.0, 28.0, '[]'::jsonb, FALSE),
 ('MOSAMBI', 'MSB', '182', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('P APPLE JUICE', 'FRJ', '183', 42.0, 40.0, 44.0, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('LASSI', 'LAS', '184', 47.0, 45.0, 49.0, '[]'::jsonb, FALSE),
 ('BUTRMILK', 'BTR', '185', 27.0, 25.0, 29.0, '[]'::jsonb, FALSE),
 ('EXTRA SAMBAR.', 'EXS', '186', 5.0, 3.0, 5.0, '[]'::jsonb, FALSE),
 ('PAPAD', 'PPD', '187', 10.0, 8.0, 10.0, '[]'::jsonb, FALSE),
 ('EXTRA RICE', 'EXR', '188', 32.0, 30.0, 34.0, '[]'::jsonb, FALSE),
 ('EXTRA MISC', 'MIS', '189', 2.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('WATER BOTAL', 'W13', '190', 22.0, 20.0, 22.0, '[]'::jsonb, FALSE),
 ('JAWAR ROTI', 'JAR', '193', 35.0, 33.0, 37.0, '[{"name": "roti", "category_old": "roti", "qty": 1}]'::jsonb, FALSE),
 ('DAHI PURI...', 'DPP', '199', 42.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('DHAI PAPDY', 'DHP', '200', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('PAV BAJI', 'PBJ', '201', 62.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('SAMOSA RAGADA', 'SAM', '202', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('CUTLETRAGADA', 'CUT', '203', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('PLAIN SAMOSA', 'PSA', '204', 22.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('EXTRA PAV', 'PAV', '205', 22.0, 20.0, 22.0, '[]'::jsonb, FALSE),
 ('BEL PURI', 'BEP', '206', 42.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('SAVE PURI', 'SAP', '207', 42.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('PANI PURI', 'PAP', '208', 32.0, 30.0, 34.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('SMBR MASALADOSA', 'MDS', '209', 59.0, 57.0, 61.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('TOMATO CHAT', 'TOM', '210', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('MSL PAVBAJI', 'SPJ', '211', 77.0, 75.0, 79.0, '[{"name": "pavbhaji", "category_old": "pavbhaji", "qty": 1}]'::jsonb, FALSE),
 ('MSL PAVBHAJI', 'MSL', '211A', 64.0, 62.0, 64.0, '[{"name": "pavbhaji", "category_old": "pavbhaji", "qty": 1}]'::jsonb, FALSE),
 ('MASALA POORI', 'WDP', '212', 42.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('SPL LASSI', 'LSW', '284', 72.0, 70.0, 74.0, '[]'::jsonb, FALSE),
 ('EXTRA BHAJI', 'BHA', '299', 37.0, 35.0, 39.0, '[]'::jsonb, FALSE),
 ('VANILLA CUP', 'VAT', '300', 12.0, 10.0, 14.0, '[]'::jsonb, FALSE),
 ('CUPS', 'STR', '301', 12.0, 10.0, 14.0, '[]'::jsonb, FALSE),
 ('B.SCOTCH CUP', 'FTR', '302', 22.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('FUN TREAT CUP', 'GRN', '303', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('BAR', 'BSH', '304', 22.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('FUSION BAR', 'KSH', '305', 32.0, 30.0, 34.0, '[]'::jsonb, FALSE),
 ('BAR', 'CCC', '306', 22.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('CONES', 'DRY', '309', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('KULFI STICK', 'STP', '311', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('MATKA KULFI', 'BNP', '312', 42.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('S.WADA', 'WWW', '500', 31.0, 29.0, 33.0, '[{"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('SSAMMBAR.WADA', 'SSW', '501', 37.0, 35.0, 39.0, '[{"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE)
ON CONFLICT (alpha_code) DO UPDATE SET 
  name = EXCLUDED.name, 
  numeric_code = EXCLUDED.numeric_code, 
  price_fixed = EXCLUDED.price_fixed, 
  price_general = EXCLUDED.price_general, 
  price_ac = EXCLUDED.price_ac, 
  category = EXCLUDED.category, 
  is_separate = EXCLUDED.is_separate;
