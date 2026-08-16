-- ========================================================================
-- RESTAURANT BILLING SYSTEM - UNIFIED DATABASE CREATION SCRIPT
-- This script creates the database from scratch including Updates 1, 2, and 3.
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
    settings
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
    clerk_initials VARCHAR(50) UNIQUE, -- Added from Update-2
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
    category JSONB DEFAULT '[]'::jsonb, -- Modified from Update-1
    is_separate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_category_format CHECK (category IS NULL OR jsonb_typeof(category) = 'array') -- Added from Update-1
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
    table_no INTEGER REFERENCES tables(table_id) ON DELETE SET NULL ON UPDATE CASCADE, -- Modified from Update-1 (INTEGER + FK)
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
    UNIQUE(bill_number, bill_date),
    -- Composite Unique Key for FK reference (Added from Update-3)
    CONSTRAINT uq_bills_composite_key UNIQUE (table_no, party_no, created_at, track, clerk_initials)
);

-- Temporary storage for orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    track VARCHAR(20) NOT NULL,
    clerk_initials VARCHAR(10) NOT NULL,
    table_no INTEGER NOT NULL, -- Modified from Update-3 (INTEGER)
    party_no VARCHAR(20) NOT NULL DEFAULT '1',
    bill_number INTEGER NOT NULL,
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Added from Update-1
    item_code VARCHAR(20),
    numeric_item_code VARCHAR(20),
    item_name VARCHAR(255),
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) DEFAULT 0,
    line_total DECIMAL(10,2) DEFAULT 0,
    is_separate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Composite FK referencing bills (Added from Update-3)
    CONSTRAINT fk_orders_bills_composite FOREIGN KEY (table_no, party_no, created_at, track, clerk_initials)
        REFERENCES bills (table_no, party_no, created_at, track, clerk_initials)
        ON DELETE CASCADE
        ON UPDATE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_bills_table_no ON bills(table_no); -- Update-1

CREATE INDEX IF NOT EXISTS idx_items_codes ON items(alpha_code, numeric_code);
CREATE INDEX IF NOT EXISTS idx_items_category ON items USING GIN (category); -- Update-1

CREATE INDEX IF NOT EXISTS idx_sessions_shift_date ON sessions(shift_name, session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);

CREATE INDEX IF NOT EXISTS idx_orders_table_no ON orders(table_no);
CREATE INDEX IF NOT EXISTS idx_orders_bill_number_date ON orders(bill_number, bill_date); -- Update-1

CREATE INDEX IF NOT EXISTS idx_tables_section_name ON tables(section_name);

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

-- Function to get category totals (Added from Update-1)
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

-- Function to move orders into the `bills.items_json` column (Modified from Update-1)
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
LEFT JOIN pending_bills pb ON t.table_id = pb.table_no -- Updated join condition to match INTEGER
ORDER BY t.table_id;

-- ========================================================================
-- 7. INSERT INITIAL DATA
-- ========================================================================

-- Insert default settings
INSERT INTO settings (hotel_name, address, phone, gstin, clerk_initials)
SELECT 'Udupi Anand Bhavan', 'Default Address', '123-456-7890', 'GST123456789', 'CLK'
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- Insert sample menu items (using new JSON structure)
INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category) VALUES
('Idli (2 pcs)', 'IDL', '101', 25.00, 30.00, 35.00, '[{"name": "South Indian", "qty": 1}]'::jsonb),
('Dosa Plain', 'DOS', '102', 35.00, 40.00, 45.00, '[{"name": "South Indian", "qty": 1}]'::jsonb),
('Vada (2 pcs)', 'VAD', '103', 30.00, 35.00, 40.00, '[{"name": "South Indian", "qty": 1}]'::jsonb),
('Coffee', 'COF', '201', 15.00, 20.00, 25.00, '[{"name": "Beverages", "qty": 1}]'::jsonb),
('Tea', 'TEA', '202', 12.00, 15.00, 18.00, '[{"name": "Beverages", "qty": 1}]'::jsonb)
ON CONFLICT (alpha_code) DO NOTHING;

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

-- Ensures that there is an open session for each shift for the current day.
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

COMMIT;

SELECT 'Database successfully created.' AS status;
