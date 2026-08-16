-- ========================================================================
-- RESTAURANT BILLING SYSTEM - SCHEMA UPDATE (FIXED)
-- Switch FK from bill_number to composite key (table_no, party_no, created_at, track, clerk_initials)
-- ========================================================================

BEGIN;

-- 1. Drop existing FK constraint if it exists
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_bills;
-- Also drop the previous attempt's constraint if it managed to partially apply (unlikely due to error but good practice)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_bills_composite;

-- 2. Fix Data Type Mismatch: Convert orders.table_no to INTEGER
-- CHECK FIRST: Make sure all data can be converted.
-- If this fails, you have non-numeric data in orders.table_no that needs manual cleanup.
ALTER TABLE orders 
ALTER COLUMN table_no TYPE INTEGER USING table_no::INTEGER;

-- 3. Add Unique Constraint on bills to support the new FK
-- ensuring (table_no, party_no, created_at, track, clerk_initials) is unique
ALTER TABLE bills 
DROP CONSTRAINT IF EXISTS uq_bills_composite_key; -- Drop if exists from previous run

ALTER TABLE bills 
ADD CONSTRAINT uq_bills_composite_key 
UNIQUE (table_no, party_no, created_at, track, clerk_initials);

-- 4. Add the Foreign Key Constraint to orders
ALTER TABLE orders
ADD CONSTRAINT fk_orders_bills_composite
FOREIGN KEY (table_no, party_no, created_at, track, clerk_initials)
REFERENCES bills (table_no, party_no, created_at, track, clerk_initials)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- 5. Verification
SELECT 'Foreign key updated successfully. orders.table_no converted to INTEGER.' as status;

COMMIT;
