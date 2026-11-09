-- ========================================================================
-- RESTAURANT BILLING SYSTEM (RBS) - COMPLETE DATABASE SETUP SCRIPT
-- ========================================================================
-- This script completely initializes the PostgreSQL database from scratch.
-- It can be executed on any clean system (Windows / Linux / macOS) running
-- PostgreSQL 12 through 18+.
--
-- INCLUDED:
--   1. Extensions (uuid-ossp)
--   2. Complete Schema (settings, items, shifts, sessions, tables, bills, orders, running_bills, audit_log, debug_logs)
--   3. Decimal quantity support (NUMERIC 10,2)
--   4. Optimized indexes (including partial unique index on finalized bills)
--   5. Stored procedures (move_orders_to_bill_json, get_category_totals_for_date, get_section_by_table, get_current_session_id)
--   6. Dynamic Views (pending_bills, table_status)
--   7. Full seed data:
--      - 101 Menu Items with updated rates and synchronized fixed/general prices
--      - Shifts (` Morning, `` Afternoon, RBS1, RBS2)
--      - Active open sessions initialized for today
--      - Table mappings 1 to 30 (Parcel, General, AC)
--      - System settings with GST (2.5% SGST, 2.5% CGST)
--      - Running bill counters initialized to 0
-- ========================================================================

BEGIN;

-- ========================================================================
-- 1. DROP EXISTING OBJECTS (CLEAN RE-INIT SUPPORT)
-- ========================================================================
DROP VIEW IF EXISTS public.table_status CASCADE;
DROP VIEW IF EXISTS public.pending_bills CASCADE;
DROP VIEW IF EXISTS public.completed_bills CASCADE;

DROP FUNCTION IF EXISTS public.get_current_shift_session_id(VARCHAR, DATE, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.get_current_session_id(VARCHAR, DATE, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.move_orders_to_bill_json(INTEGER, VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.move_orders_to_bill_json(INTEGER, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_section_by_table(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.get_category_totals_for_date(DATE) CASCADE;

DROP TABLE IF EXISTS
    public.audit_log,
    public.orders,
    public.bills,
    public.sessions,
    public.shifts,
    public.items,
    public.tables,
    public.settings,
    public.running_bills,
    public.debug_logs,
    public.bill_items
CASCADE;

-- ========================================================================
-- 2. EXTENSIONS
-- ========================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================================
-- 3. CORE TABLES
-- ========================================================================

-- Settings table
CREATE TABLE public.settings (
    id SERIAL PRIMARY KEY,
    hotel_name VARCHAR(255) DEFAULT 'Udupi Anand Bhavan',
    address TEXT DEFAULT 'Main Road',
    phone VARCHAR(20) DEFAULT '',
    gstin VARCHAR(20) DEFAULT '',
    clerk_initials VARCHAR(50) UNIQUE,
    sgst_percentage DECIMAL(5,2) DEFAULT 2.50,
    cgst_percentage DECIMAL(5,2) DEFAULT 2.50,
    allowed_clerks TEXT DEFAULT 'CLK,V,P,B',
    section VARCHAR(10) DEFAULT 'L',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Master Shifts table
CREATE TABLE public.shifts (
    id SERIAL PRIMARY KEY,
    shift_name VARCHAR(20) NOT NULL UNIQUE CHECK (
        shift_name IN ('`', '``', 'RBS1', 'RBS2')
    ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE public.sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    shift_name VARCHAR(20) NOT NULL REFERENCES public.shifts(shift_name),
    clerk_initials VARCHAR(10) NOT NULL,
    session_date DATE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    closed_by VARCHAR(50),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    last_bill_number INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shift_name, session_date, clerk_initials)
);

-- Tables master table
CREATE TABLE public.tables (
    table_id INTEGER PRIMARY KEY,
    section_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Menu Items table
CREATE TABLE public.items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    alpha_code VARCHAR(20) UNIQUE,
    numeric_code VARCHAR(20) UNIQUE,
    price_fixed DECIMAL(10,2) DEFAULT 0,
    price_general DECIMAL(10,2) DEFAULT 0,
    price_ac DECIMAL(10,2) DEFAULT 0,
    category JSONB DEFAULT '[]'::jsonb,
    is_separate BOOLEAN DEFAULT FALSE,
    split_category INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_category_format CHECK (category IS NULL OR jsonb_typeof(category) IN ('array', 'object'))
);

-- Bills table
CREATE TABLE public.bills (
    id SERIAL PRIMARY KEY,
    bill_number INTEGER NOT NULL,
    bill_date DATE NOT NULL,
    table_no INTEGER REFERENCES public.tables(table_id) ON DELETE SET NULL ON UPDATE CASCADE,
    party_no VARCHAR(20) DEFAULT '1',
    section VARCHAR(10) DEFAULT 'G',
    track VARCHAR(20),
    clerk_initials VARCHAR(10),
    subtotal DECIMAL(10,2) DEFAULT 0,
    sgst DECIMAL(10,2) DEFAULT 0,
    cgst DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    grand_total DECIMAL(10,2) DEFAULT 0,
    items_json JSONB DEFAULT '[]'::jsonb,
    order_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bills_composite_key UNIQUE (table_no, party_no, created_at, track, clerk_initials)
);

-- Orders table (temporary active line items per table/party)
CREATE TABLE public.orders (
    id SERIAL PRIMARY KEY,
    track VARCHAR(20) NOT NULL,
    clerk_initials VARCHAR(10) NOT NULL,
    table_no INTEGER NOT NULL,
    party_no VARCHAR(20) NOT NULL DEFAULT '1',
    bill_number INTEGER NOT NULL DEFAULT 0,
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
    item_code VARCHAR(20),
    numeric_item_code VARCHAR(20),
    item_name VARCHAR(255),
    quantity NUMERIC(10,2) DEFAULT 1.00,
    unit_price DECIMAL(10,2) DEFAULT 0,
    line_total DECIMAL(10,2) DEFAULT 0,
    is_separate BOOLEAN DEFAULT FALSE,
    split_category INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_bills_composite FOREIGN KEY (table_no, party_no, created_at, track, clerk_initials)
        REFERENCES public.bills (table_no, party_no, created_at, track, clerk_initials)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Running bill counters table
CREATE TABLE public.running_bills (
    id INT PRIMARY KEY DEFAULT 1,
    track_morning INT DEFAULT 0,
    track_afternoon INT DEFAULT 0,
    track_rbs1 INT DEFAULT 0,
    track_rbs2 INT DEFAULT 0
);

-- Audit Log table
CREATE TABLE public.audit_log (
    id SERIAL PRIMARY KEY,
    event_id UUID DEFAULT uuid_generate_v4(),
    timestamp_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    performed_by_user_id VARCHAR(50),
    performed_by_user_name VARCHAR(100),
    user_role VARCHAR(20),
    action_type VARCHAR(50),
    resource_type VARCHAR(50),
    resource_id VARCHAR(50),
    shift_session_id UUID REFERENCES public.sessions(session_id),
    ip_address INET,
    payload JSONB,
    correlation_id UUID
);

-- Debug logs table (optional helper)
CREATE TABLE public.debug_logs (
    id SERIAL PRIMARY KEY,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================================
-- 4. INDEXES
-- ========================================================================
CREATE INDEX idx_bills_date_number ON public.bills(bill_date, bill_number);
CREATE INDEX idx_bills_items_json ON public.bills USING GIN (items_json);
CREATE INDEX idx_bills_table_no ON public.bills(table_no);

-- Partial index for finalized bills (ensures bill uniqueness per track/date while allowing bill_number = 0 provisional bills)
CREATE UNIQUE INDEX bills_bill_number_bill_date_unique ON public.bills(bill_number, bill_date, track) WHERE bill_number > 0;

CREATE INDEX idx_items_codes ON public.items(alpha_code, numeric_code);
CREATE INDEX idx_items_category ON public.items USING GIN (category);

CREATE INDEX idx_sessions_shift_date ON public.sessions(shift_name, session_date);
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_date ON public.sessions(session_date);
CREATE INDEX idx_sessions_locked ON public.sessions (shift_name, is_locked);

CREATE INDEX idx_orders_table_no ON public.orders(table_no);
CREATE INDEX idx_orders_bill_number_date ON public.orders(bill_number, bill_date);

CREATE INDEX idx_tables_section_name ON public.tables(section_name);

-- ========================================================================
-- 5. STORED FUNCTIONS & PROCEDURES
-- ========================================================================

-- Function: get section name by table number
CREATE OR REPLACE FUNCTION public.get_section_by_table(p_table_no VARCHAR(20))
RETURNS VARCHAR AS $$
DECLARE
    section_name VARCHAR(100);
    table_num INTEGER;
BEGIN
    BEGIN
        table_num := p_table_no::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RETURN 'Unknown';
    END;
    SELECT t.section_name INTO section_name FROM public.tables t WHERE t.table_id = table_num;
    RETURN COALESCE(section_name, 'Unknown');
END;
$$ LANGUAGE plpgsql;

-- Function: calculate category totals for reporting with decimal quantity support
CREATE OR REPLACE FUNCTION public.get_category_totals_for_date(p_date DATE)
RETURNS TABLE(
    category_name VARCHAR,
    total_quantity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cat->>'name' AS category_name,
        CEIL(SUM((item->>'quantity')::numeric * COALESCE((cat->>'qty')::numeric, 1.0)))::numeric AS total_quantity
    FROM public.bills b
    CROSS JOIN LATERAL jsonb_array_elements(b.items_json) AS item
    CROSS JOIN LATERAL (
        SELECT i.category
        FROM public.items i
        WHERE i.alpha_code = item->>'item_code_alpha'
           OR i.numeric_code = item->>'item_code_numeric'
        LIMIT 1
    ) AS item_info
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE 
            WHEN jsonb_typeof(item_info.category) = 'array' THEN item_info.category
            WHEN item_info.category IS NOT NULL AND item_info.category != 'null'::jsonb THEN jsonb_build_array(item_info.category)
            ELSE '[]'::jsonb
        END
    ) AS cat
    WHERE b.bill_date = p_date
    GROUP BY cat->>'name'
    ORDER BY total_quantity DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: atomically move temporary orders into bills.items_json
CREATE OR REPLACE FUNCTION public.move_orders_to_bill_json(
    p_bill_id INTEGER, 
    p_table_no VARCHAR(20), 
    p_party_no VARCHAR(20)
) RETURNS INTEGER AS $$
DECLARE
    moved_count INTEGER := 0;
    items_array JSONB;
BEGIN
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
            'categories', CASE 
                            WHEN i.category IS NULL OR i.category = 'null'::jsonb THEN '[]'::jsonb
                            WHEN jsonb_typeof(i.category) = 'array' THEN i.category
                            ELSE jsonb_build_array(i.category)
                          END
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

    UPDATE public.bills 
    SET items_json = items_array 
    WHERE id = p_bill_id;

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

-- Function: resolve current active shift session
CREATE OR REPLACE FUNCTION public.get_current_session_id(
    p_shift_type VARCHAR DEFAULT NULL,
    p_target_date DATE DEFAULT NULL,
    p_clerk_initials VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    session_uuid UUID;
    v_shift_type VARCHAR;
    v_target_date DATE := COALESCE(p_target_date, CURRENT_DATE);
BEGIN
    v_shift_type := COALESCE(p_shift_type, CASE
        WHEN CURRENT_TIME BETWEEN '06:00:00' AND '11:59:59' THEN '`'
        WHEN CURRENT_TIME BETWEEN '12:00:00' AND '17:59:59' THEN '``'
        WHEN CURRENT_TIME BETWEEN '18:00:00' AND '21:59:59' THEN 'RBS1'
        ELSE 'RBS2' END);

    SELECT s.session_id INTO session_uuid FROM public.sessions s
    WHERE s.shift_name = v_shift_type 
      AND s.session_date = v_target_date 
      AND s.status = 'OPEN'
      AND (p_clerk_initials IS NULL OR s.clerk_initials = p_clerk_initials)
    ORDER BY s.start_time DESC LIMIT 1;

    RETURN session_uuid;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- 6. VIEWS
-- ========================================================================

-- View: Pending live orders per table/party
CREATE OR REPLACE VIEW public.pending_bills AS
SELECT 
    o.table_no,
    o.party_no,
    public.get_section_by_table(o.table_no::VARCHAR) AS section_name,
    COUNT(o.id) AS total_items,
    SUM(o.line_total) AS total_amount,
    MIN(o.created_at) AS order_started_at,
    MAX(o.updated_at) AS last_updated_at
FROM public.orders o
GROUP BY o.table_no, o.party_no;

-- View: Table occupancy and billing status
CREATE OR REPLACE VIEW public.table_status AS
SELECT
    t.table_id,
    t.section_name,
    CASE WHEN pb.table_no IS NOT NULL THEN 'OCCUPIED' ELSE 'AVAILABLE' END AS status,
    pb.total_items,
    pb.total_amount,
    pb.order_started_at
FROM public.tables t
LEFT JOIN public.pending_bills pb ON t.table_id = pb.table_no
ORDER BY t.table_id;

-- ========================================================================
-- 7. INITIAL MASTER & SEED DATA
-- ========================================================================

-- Default system settings
INSERT INTO public.settings (hotel_name, address, phone, gstin, clerk_initials, sgst_percentage, cgst_percentage, allowed_clerks, section)
VALUES ('Udupi Anand Bhavan', 'Main Road', '080-12345678', '29AAAAA0000A1Z5', 'CLK', 2.50, 2.50, 'CLK,V,P,B', 'L')
ON CONFLICT (clerk_initials) DO UPDATE SET
    hotel_name = EXCLUDED.hotel_name,
    sgst_percentage = EXCLUDED.sgst_percentage,
    cgst_percentage = EXCLUDED.cgst_percentage;

-- Shift types
INSERT INTO public.shifts (shift_name) VALUES
    ('`'), ('``'), ('RBS1'), ('RBS2')
ON CONFLICT (shift_name) DO NOTHING;

-- Table to Section mappings (1 to 30)
INSERT INTO public.tables (table_id, section_name) VALUES
    (1, 'Parcel'),
    (2, 'General'), (3, 'General'), (4, 'General'), (5, 'General'),
    (6, 'General'), (7, 'General'), (8, 'General'), (9, 'General'),
    (10, 'General'), (11, 'General'), (12, 'General'), (13, 'General'), (14, 'General'),
    (15, 'AC'), (16, 'AC'), (17, 'AC'), (18, 'AC'), (19, 'AC'),
    (20, 'AC'), (21, 'AC'), (22, 'AC'), (23, 'AC'), (24, 'AC'),
    (25, 'AC'), (26, 'AC'), (27, 'AC'), (28, 'AC'), (29, 'AC'), (30, 'AC')
ON CONFLICT (table_id) DO UPDATE SET section_name = EXCLUDED.section_name;

-- Running bill counters (all start at 0)
INSERT INTO public.running_bills (id, track_morning, track_afternoon, track_rbs1, track_rbs2)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO UPDATE SET
    track_morning = 0, track_afternoon = 0, track_rbs1 = 0, track_rbs2 = 0;

-- Auto-provision initial open sessions for today
INSERT INTO public.sessions (shift_name, clerk_initials, session_date, status, is_locked, last_bill_number)
VALUES
    ('`', 'SYS', CURRENT_DATE, 'OPEN', FALSE, 0),
    ('``', 'SYS', CURRENT_DATE, 'OPEN', FALSE, 0),
    ('RBS1', 'SYS', CURRENT_DATE, 'OPEN', FALSE, 0),
    ('RBS2', 'SYS', CURRENT_DATE, 'OPEN', FALSE, 0)
ON CONFLICT (shift_name, session_date, clerk_initials) DO NOTHING;

-- ========================================================================
-- 8. COMPLETE MENU ITEMS WITH UPDATED RATES
-- ========================================================================

INSERT INTO public.items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate) VALUES
 ('Unknown', 'TES', '0', 0.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'TBY', '0A', 0.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'O', '0B', 0.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'UTP', '0C', 0.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('Unknown', 'ABU', '0D', 0.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('S.I.W Sambar', 'SRW', '100', 52.0, 52.0, 56.0, '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('IDLY', 'IDL', '101', 34.0, 34.0, 38.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('S.IDLI S.WADA', 'SIV', '102', 46.0, 46.0, 50.0, '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('IDLI S.WADA', 'ISV', '103', 63.0, 63.0, 67.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('WADA', 'WAD', '104', 52.0, 52.0, 56.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('RASAM IDLY', 'RAI', '105', 41.0, 41.0, 45.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('RASAM WADA', 'RAW', '106', 58.0, 58.0, 63.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('POORI', 'POO', '107', 55.0, 55.0, 59.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('PLAIN DOSA', 'PLD', '108', 54.0, 54.0, 58.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('MASALA DOSA', 'MAS', '109', 54.0, 54.0, 58.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('RAVA DOSA', 'RAD', '110', 67.0, 67.0, 71.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('ONION DOSA', 'OND', '111', 75.0, 75.0, 81.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('AB SP IDLY', 'SPI', '112', 45.0, 45.0, 49.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('70.MM.DOSA', 'MMM', '113', 102.0, 102.0, 106.0, '[{"name": "dosa", "category_old": "dosa", "qty": 2}]'::jsonb, FALSE),
 ('AB SPL DOSA', 'JER', '114', 95.0, 95.0, 99.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('AB SPL DOSA', 'ABD', '114A', 92.0, 92.0, 96.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('GHEE KARAM DOSA', 'CCM', '115', 95.0, 95.0, 99.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('TOMATO BATH', 'TOB', '116', 33.0, 33.0, 37.0, '[]'::jsonb, FALSE),
 ('TOMOTO.RICE', 'CAP', '117', 60.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('VEG.BERYANI', 'VEB', '118', 60.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('PAPER DOSA', 'PAD', '119', 102.0, 102.0, 106.0, '[{"name": "dosa", "category_old": "dosa", "qty": 2}]'::jsonb, FALSE),
 ('DAHI WADA', 'DHW', '120', 55.0, 55.0, 59.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('SET DOSA', 'SED', '121', 67.0, 67.0, 71.0, '[{"name": "dosa", "category_old": "dosa", "qty": 3}]'::jsonb, FALSE),
 ('MURKUL/MIXTURE', 'MUM', '122', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('MYSORE BAJJI', 'MYB', '123', 44.0, 44.0, 48.0, '[]'::jsonb, FALSE),
 ('ALU BONDA', 'ALU', '124', 33.0, 33.0, 37.0, '[]'::jsonb, FALSE),
 ('VEG.HALEEM', 'HAL', '125', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('S.I.W Rasam', 'RSM', '126', 50.0, 50.0, 54.0, '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('PAROTA', 'PAR', '128', 50.0, 50.0, 54.0, '[]'::jsonb, FALSE),
 ('Chapathi', 'CHA', '129', 50.0, 50.0, 54.0, '[]'::jsonb, FALSE),
 ('ONION RAVA DOSA', 'ORD', '130', 77.0, 77.0, 81.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('Open Dosa', 'OPD', '131', 67.0, 67.0, 71.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('UTTAPA', 'UTA', '132', 79.0, 79.0, 83.0, '[]'::jsonb, FALSE),
 ('FILTR COFFEE', 'COF', '133', 27.0, 27.0, 30.0, '[{"name": "coffee", "category_old": "coffee", "qty": 1}]'::jsonb, FALSE),
 ('TEA', 'TEA', '134', 25.0, 25.0, 28.0, '[{"name": "tea", "category_old": "tea", "qty": 1}]'::jsonb, FALSE),
 ('TEA + CUP', 'AGH', '135', 20.0, 20.0, 23.0, '[{"name": "tea", "category_old": "tea", "qty": 1}]'::jsonb, FALSE),
 ('TEA+CUP', 'TEC', '135A', 26.0, 26.0, 29.0, '[{"name": "tea", "category_old": "tea", "qty": 1}]'::jsonb, FALSE),
 ('BOURNVITA', 'BOU', '136', 27.0, 27.0, 30.0, '[]'::jsonb, FALSE),
 ('EMPTY CUP', 'EMP', '137', 1.0, 1.0, 3.0, '[]'::jsonb, FALSE),
 ('SAMBARID.WADA', 'SAW', '138', 89.0, 89.0, 93.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}, {"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('VEG F.RICE', 'VFR', '142', 60.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('SUGARLESS COFFE', 'SLC', '143', 27.0, 27.0, 30.0, '[{"name": "coffee", "category_old": "coffee", "qty": 1}]'::jsonb, FALSE),
 ('JAMOON', 'JUJ', '151', 31.0, 31.0, 34.0, '[]'::jsonb, FALSE),
 ('SAMBAR WADA', 'SAR', '152', 59.0, 59.0, 63.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('SAMBAR WADA', 'SWD', '152A', 59.0, 59.0, 63.0, '[{"name": "wada", "category_old": "wada", "qty": 2}]'::jsonb, FALSE),
 ('SAMBAR IDLY', 'SBR', '153', 41.0, 41.0, 45.0, '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb, FALSE),
 ('Coconut Halwaa', 'OKM', '155', 30.0, 30.0, 34.0, '[]'::jsonb, FALSE),
 ('PLATE MEAL', 'PLM', '167', 90.0, 90.0, 94.0, '[]'::jsonb, FALSE),
 ('SPL MEAL', 'SPM', '168', 135.0, 135.0, 139.0, '[]'::jsonb, FALSE),
 ('FRUID SALAD', 'FTS', '169', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('FRIUT WITH ICE', 'FTC', '170', 65.0, 65.0, 69.0, '[]'::jsonb, FALSE),
 ('CURD RICE', 'CUR', '171', 55.0, 55.0, 59.0, '[]'::jsonb, FALSE),
 ('PARCEL JUICE', 'JUI', '172', 35.0, 35.0, 39.0, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('TEST', 'PCO', '175', 0.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('MILK SHAKE', 'BDM', '179', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('CD', 'SLI', '180', 20.0, 20.0, 22.0, '[]'::jsonb, FALSE),
 ('MAAZA', 'CDP', '181', 25.0, 25.0, 28.0, '[]'::jsonb, FALSE),
 ('MOSAMBI', 'MSB', '182', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('P APPLE JUICE', 'FRJ', '183', 40.0, 40.0, 44.0, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('LASSI', 'LAS', '184', 45.0, 45.0, 49.0, '[]'::jsonb, FALSE),
 ('BUTRMILK', 'BTR', '185', 25.0, 25.0, 29.0, '[]'::jsonb, FALSE),
 ('EXTRA SAMBAR.', 'EXS', '186', 3.0, 3.0, 5.0, '[]'::jsonb, FALSE),
 ('PAPAD', 'PPD', '187', 8.0, 8.0, 10.0, '[]'::jsonb, FALSE),
 ('EXTRA RICE', 'EXR', '188', 30.0, 30.0, 34.0, '[]'::jsonb, FALSE),
 ('EXTRA MISC', 'MIS', '189', 0.0, 0.0, 2.0, '[]'::jsonb, FALSE),
 ('WATER BOTAL', 'W13', '190', 20.0, 20.0, 22.0, '[]'::jsonb, FALSE),
 ('JAWAR ROTI', 'JAR', '193', 33.0, 33.0, 37.0, '[{"name": "roti", "category_old": "roti", "qty": 1}]'::jsonb, FALSE),
 ('DAHI PURI...', 'DPP', '199', 40.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('DHAI PAPDY', 'DHP', '200', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('PAV BAJI', 'PBJ', '201', 60.0, 60.0, 64.0, '[]'::jsonb, FALSE),
 ('SAMOSA RAGADA', 'SAM', '202', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('CUTLETRAGADA', 'CUT', '203', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('PLAIN SAMOSA', 'PSA', '204', 20.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('EXTRA PAV', 'PAV', '205', 20.0, 20.0, 22.0, '[]'::jsonb, FALSE),
 ('BEL PURI', 'BEP', '206', 40.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('SAVE PURI', 'SAP', '207', 40.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('PANI PURI', 'PAP', '208', 30.0, 30.0, 34.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('SMBR MASALADOSA', 'MDS', '209', 57.0, 57.0, 61.0, '[{"name": "dosa", "category_old": "dosa", "qty": 1}]'::jsonb, FALSE),
 ('TOMATO CHAT', 'TOM', '210', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('MSL PAVBAJI', 'SPJ', '211', 75.0, 75.0, 79.0, '[{"name": "pavbhaji", "category_old": "pavbhaji", "qty": 1}]'::jsonb, FALSE),
 ('MSL PAVBHAJI', 'MSL', '211A', 62.0, 62.0, 64.0, '[{"name": "pavbhaji", "category_old": "pavbhaji", "qty": 1}]'::jsonb, FALSE),
 ('MASALA POORI', 'WDP', '212', 40.0, 40.0, 44.0, '[{"name": "puri", "category_old": "puri", "qty": 1}]'::jsonb, FALSE),
 ('SPL LASSI', 'LSW', '284', 70.0, 70.0, 74.0, '[]'::jsonb, FALSE),
 ('EXTRA BHAJI', 'BHA', '299', 35.0, 35.0, 39.0, '[]'::jsonb, FALSE),
 ('VANILLA CUP', 'VAT', '300', 10.0, 10.0, 14.0, '[]'::jsonb, FALSE),
 ('CUPS', 'STR', '301', 10.0, 10.0, 14.0, '[]'::jsonb, FALSE),
 ('B.SCOTCH CUP', 'FTR', '302', 20.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('FUN TREAT CUP', 'GRN', '303', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('BAR', 'BSH', '304', 20.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('FUSION BAR', 'KSH', '305', 30.0, 30.0, 34.0, '[]'::jsonb, FALSE),
 ('BAR', 'CCC', '306', 20.0, 20.0, 24.0, '[]'::jsonb, FALSE),
 ('CONES', 'DRY', '309', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('KULFI STICK', 'STP', '311', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('MATKA KULFI', 'BNP', '312', 40.0, 40.0, 44.0, '[]'::jsonb, FALSE),
 ('S.WADA', 'WWW', '500', 29.0, 29.0, 33.0, '[{"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE),
 ('SSAMMBAR.WADA', 'SSW', '501', 35.0, 35.0, 39.0, '[{"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb, FALSE)
ON CONFLICT (alpha_code) DO UPDATE SET 
  name = EXCLUDED.name, 
  numeric_code = EXCLUDED.numeric_code, 
  price_fixed = EXCLUDED.price_fixed, 
  price_general = EXCLUDED.price_general, 
  price_ac = EXCLUDED.price_ac, 
  category = EXCLUDED.category, 
  is_separate = EXCLUDED.is_separate;

-- Ensure fixed prices exactly match general prices
UPDATE public.items SET price_fixed = price_general WHERE price_fixed != price_general;

COMMIT;

-- Verify database population
SELECT 'Database successfully created and initialized with ' || count(*) || ' menu items.' AS status FROM public.items;
