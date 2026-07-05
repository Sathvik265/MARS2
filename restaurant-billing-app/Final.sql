-- ========================================================================
-- RESTAURANT BILLING SYSTEM - UNIFIED DATABASE CREATION SCRIPT
-- This script creates the database from scratch including all recent schema patches
-- (settings taxes, sessions lockdown columns, running_bills counter table)
-- and populates the database with the full fixed menu items (from items_insert_fixed.sql).
-- ========================================================================

BEGIN;

-- ========================================================================
-- 1. DROP ALL EXISTING OBJECTS
-- ========================================================================

DROP VIEW IF EXISTS table_status CASCADE;
DROP VIEW IF EXISTS pending_bills CASCADE;
DROP VIEW IF EXISTS completed_bills CASCADE;

DROP FUNCTION IF EXISTS get_current_shift_session_id(VARCHAR, DATE, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS get_current_session_id(VARCHAR, DATE, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS move_orders_to_bill_json(INTEGER, VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS get_section_by_table(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS get_category_totals_for_date(DATE) CASCADE;

DROP TABLE IF EXISTS
    audit_log,
    orders,
    bills,
    sessions,
    shifts,
    items,
    tables,
    settings,
    running_bills
CASCADE;

-- ========================================================================
-- 2. SETUP AND EXTENSIONS
-- ========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================================
-- 3. CREATE TABLES
-- ========================================================================

-- Table for system-wide settings
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    hotel_name VARCHAR(255) DEFAULT 'Restaurant Name',
    address TEXT,
    phone VARCHAR(20),
    gstin VARCHAR(20),
    clerk_initials VARCHAR(50) UNIQUE,
    sgst_percentage DECIMAL(5,2) DEFAULT 2.50,
    cgst_percentage DECIMAL(5,2) DEFAULT 2.50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for menu items
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    alpha_code VARCHAR(20) UNIQUE,
    numeric_code VARCHAR(20) UNIQUE,
    price_fixed DECIMAL(10,2) DEFAULT 0,
    price_general DECIMAL(10,2) DEFAULT 0,
    price_ac DECIMAL(10,2) DEFAULT 0,
    category JSONB DEFAULT '[]'::jsonb,
    is_separate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_category_format CHECK (category IS NULL OR jsonb_typeof(category) = 'array')
);

-- Master table for shift types
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    shift_name VARCHAR(20) NOT NULL UNIQUE CHECK (
        shift_name IN ('`', '``', 'RBS1', 'RBS2')
    ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for individual shift instances
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    shift_name VARCHAR(20) NOT NULL REFERENCES shifts(shift_name),
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

-- Table for mapping table numbers to sections
CREATE TABLE IF NOT EXISTS tables (
    table_id INTEGER PRIMARY KEY,
    section_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Main table for bills
CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    bill_number INTEGER NOT NULL,
    bill_date DATE NOT NULL,
    table_no INTEGER REFERENCES tables(table_id) ON DELETE SET NULL ON UPDATE CASCADE,
    party_no VARCHAR(20) DEFAULT '1',
    section VARCHAR(10) DEFAULT 'G',
    track VARCHAR(20),
    clerk_initials VARCHAR(10),
    subtotal DECIMAL(10,2) DEFAULT 0,
    sgst DECIMAL(10,2) DEFAULT 0,
    cgst DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    grand_total DECIMAL(10,2) DEFAULT 0,
    items_json JSONB,
    order_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bills_bill_number_bill_date_track_key UNIQUE (bill_number, bill_date, track),
    CONSTRAINT uq_bills_composite_key UNIQUE (table_no, party_no, created_at, track, clerk_initials)
);

-- Temporary storage for orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    track VARCHAR(20) NOT NULL,
    clerk_initials VARCHAR(10) NOT NULL,
    table_no INTEGER NOT NULL,
    party_no VARCHAR(20) NOT NULL DEFAULT '1',
    bill_number INTEGER NOT NULL,
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
    item_code VARCHAR(20),
    numeric_item_code VARCHAR(20),
    item_name VARCHAR(255),
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) DEFAULT 0,
    line_total DECIMAL(10,2) DEFAULT 0,
    is_separate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_bills_composite FOREIGN KEY (table_no, party_no, created_at, track, clerk_initials)
        REFERENCES bills (table_no, party_no, created_at, track, clerk_initials)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Counter table for running bills
CREATE TABLE IF NOT EXISTS running_bills (
    id INT PRIMARY KEY DEFAULT 1,
    track_morning INT DEFAULT 0,
    track_afternoon INT DEFAULT 0,
    track_rbs1 INT DEFAULT 0,
    track_rbs2 INT DEFAULT 0
);

-- Table for logging system events
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    event_id UUID DEFAULT uuid_generate_v4(),
    timestamp_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    performed_by_user_id VARCHAR(50),
    performed_by_user_name VARCHAR(100),
    user_role VARCHAR(20),
    action_type VARCHAR(50),
    resource_type VARCHAR(50),
    resource_id VARCHAR(50),
    shift_session_id UUID REFERENCES sessions(session_id),
    ip_address INET,
    payload JSONB,
    correlation_id UUID
);

-- ========================================================================
-- 4. CREATE INDEXES
-- ========================================================================

CREATE INDEX IF NOT EXISTS idx_bills_date_number ON bills(bill_date, bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_items_json ON bills USING GIN (items_json);
CREATE INDEX IF NOT EXISTS idx_bills_table_no ON bills(table_no);

CREATE INDEX IF NOT EXISTS idx_items_codes ON items(alpha_code, numeric_code);
CREATE INDEX IF NOT EXISTS idx_items_category ON items USING GIN (category);

CREATE INDEX IF NOT EXISTS idx_sessions_shift_date ON sessions(shift_name, session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_locked ON sessions (shift_name, is_locked);

CREATE INDEX IF NOT EXISTS idx_orders_table_no ON orders(table_no);
CREATE INDEX IF NOT EXISTS idx_orders_bill_number_date ON orders(bill_number, bill_date);

CREATE INDEX IF NOT EXISTS idx_tables_section_name ON tables(section_name);

CREATE UNIQUE INDEX IF NOT EXISTS bills_bill_number_bill_date_unique ON bills(bill_number, bill_date, track) WHERE bill_number > 0;

-- ========================================================================
-- 5. CREATE FUNCTIONS
-- ========================================================================

-- Function to get section name by table number
CREATE OR REPLACE FUNCTION get_section_by_table(p_table_no VARCHAR(20))
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
    SELECT t.section_name INTO section_name FROM tables t WHERE t.table_id = table_num;
    RETURN COALESCE(section_name, 'Unknown');
END;
$$ LANGUAGE plpgsql;

-- Function to get category totals
CREATE OR REPLACE FUNCTION get_category_totals_for_date(p_date DATE)
RETURNS TABLE(
    category_name VARCHAR,
    total_quantity INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cat->>'name' AS category_name,
        SUM((item->>'quantity')::INTEGER * (cat->>'qty')::INTEGER)::INTEGER AS total_quantity
    FROM bills b
    CROSS JOIN LATERAL jsonb_array_elements(b.items_json) AS item
    CROSS JOIN LATERAL (
        SELECT i.category
        FROM items i
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

-- Function to move orders into the `bills.items_json` column
CREATE OR REPLACE FUNCTION move_orders_to_bill_json(
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
            'categories', COALESCE(i.category, '[]'::jsonb)
        )
    )
    INTO items_array 
    FROM orders o
    LEFT JOIN items i ON (i.alpha_code = o.item_code OR i.numeric_code = o.numeric_item_code)
    WHERE o.table_no::VARCHAR = p_table_no 
    AND o.party_no = p_party_no;

    IF items_array IS NULL OR jsonb_array_length(items_array) = 0 THEN 
        RETURN 0; 
    END IF;

    -- Update bills with the items_json including categories
    UPDATE bills 
    SET items_json = items_array 
    WHERE id = p_bill_id;

    -- Delete orders after moving to bill
    WITH deleted AS (
        DELETE FROM orders 
        WHERE table_no::VARCHAR = p_table_no 
        AND party_no = p_party_no 
        RETURNING 1
    )
    SELECT count(*) INTO moved_count FROM deleted;

    RETURN moved_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get the current session ID
CREATE OR REPLACE FUNCTION get_current_session_id(
    p_shift_type VARCHAR DEFAULT NULL, p_target_date DATE DEFAULT NULL, p_clerk_initials VARCHAR DEFAULT NULL
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
    SELECT s.session_id INTO session_uuid FROM sessions s
    WHERE s.shift_name = v_shift_type AND s.session_date = v_target_date AND s.status = 'OPEN'
      AND (p_clerk_initials IS NULL OR s.clerk_initials = p_clerk_initials)
    ORDER BY s.start_time DESC LIMIT 1;
    RETURN session_uuid;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- 6. CREATE VIEWS
-- ========================================================================

-- View for pending bills
CREATE OR REPLACE VIEW pending_bills AS
SELECT DISTINCT o.table_no, o.party_no,
    get_section_by_table(o.table_no::VARCHAR) as section_name,
    COUNT(o.id) as total_items,
    SUM(o.line_total) as total_amount,
    MIN(o.created_at) as order_started_at,
    MAX(o.updated_at) as last_updated_at
FROM orders o GROUP BY o.table_no, o.party_no;

-- View to show the current status of each table
CREATE OR REPLACE VIEW table_status AS
SELECT
    t.table_id,
    t.section_name,
    CASE WHEN pb.table_no IS NOT NULL THEN 'OCCUPIED' ELSE 'AVAILABLE' END as status,
    pb.total_items,
    pb.total_amount,
    pb.order_started_at
FROM tables t
LEFT JOIN pending_bills pb ON t.table_id = pb.table_no
ORDER BY t.table_id;

-- ========================================================================
-- 7. INSERT INITIAL DATA & CONTROLS
-- ========================================================================

-- Insert default settings
INSERT INTO settings (hotel_name, address, phone, gstin, clerk_initials, sgst_percentage, cgst_percentage)
SELECT 'Udupi Anand Bhavan', 'Default Address', '123-456-7890', 'GST123456789', 'CLK', 2.50, 2.50
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- Populate the standard shift names
INSERT INTO shifts (shift_name) VALUES
    ('`'), ('``'), ('RBS1'), ('RBS2')
ON CONFLICT (shift_name) DO NOTHING;

-- Insert table-to-section mappings
INSERT INTO tables (table_id, section_name) VALUES
    (1, 'Parcel'),
    (2, 'General'), (3, 'General'), (4, 'General'), (5, 'General'),
    (6, 'General'), (7, 'General'), (8, 'General'), (9, 'General'),
    (10, 'General'), (11, 'General'), (12, 'General'), (13, 'General'), (14, 'General'),
    (15, 'AC'), (16, 'AC'), (17, 'AC'), (18, 'AC'), (19, 'AC'),
    (20, 'AC'), (21, 'AC'), (22, 'AC'), (23, 'AC'), (24, 'AC'),
    (25, 'AC'), (26, 'AC'), (27, 'AC'), (28, 'AC'), (29, 'AC'), (30, 'AC')
ON CONFLICT (table_id) DO UPDATE SET section_name = EXCLUDED.section_name;

-- Ensure running_bills tracking row is set up
INSERT INTO running_bills (id, track_morning, track_afternoon, track_rbs1, track_rbs2)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Ensures that there is an open session for each shift for the current day
DO $$
BEGIN
    INSERT INTO sessions (shift_name, clerk_initials, session_date)
    SELECT '`', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE shift_name = '`' AND session_date = CURRENT_DATE);
    INSERT INTO sessions (shift_name, clerk_initials, session_date)
    SELECT '``', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE shift_name = '``' AND session_date = CURRENT_DATE);
    INSERT INTO sessions (shift_name, clerk_initials, session_date)
    SELECT 'RBS1', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE shift_name = 'RBS1' AND session_date = CURRENT_DATE);
    INSERT INTO sessions (shift_name, clerk_initials, session_date)
    SELECT 'RBS2', 'SYS', CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE shift_name = 'RBS2' AND session_date = CURRENT_DATE);
END;
$$;

-- ========================================================================
-- 8. BULK INSERT FIXED MENU ITEMS
-- ========================================================================

INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate) VALUES
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

COMMIT;

SELECT 'Database successfully created and populated.' AS status;
