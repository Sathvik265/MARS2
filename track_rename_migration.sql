BEGIN;

-- 1. Drop existing constraints (check + FK)
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_name_check;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_shift_name_fkey;

-- 2. Rename in shifts table (use id to avoid intermediate check violations)
UPDATE shifts SET shift_name = 'RBS_TEMP' WHERE id = 3;
UPDATE shifts SET shift_name = 'RBS1' WHERE id = 4;
UPDATE shifts SET shift_name = 'RBS' WHERE id = 3;

-- 3. Rename in sessions table
UPDATE sessions SET shift_name = 'RBS_TEMP' WHERE shift_name = 'RBS1';
UPDATE sessions SET shift_name = 'RBS1' WHERE shift_name = 'RBS2';
UPDATE sessions SET shift_name = 'RBS' WHERE shift_name = 'RBS_TEMP';

-- 4. Rename in bills table
UPDATE bills SET track = 'RBS_TEMP' WHERE track = 'RBS1';
UPDATE bills SET track = 'RBS1' WHERE track = 'RBS2';
UPDATE bills SET track = 'RBS' WHERE track = 'RBS_TEMP';

-- 5. Rename in orders table
UPDATE orders SET track = 'RBS_TEMP' WHERE track = 'RBS1';
UPDATE orders SET track = 'RBS1' WHERE track = 'RBS2';
UPDATE orders SET track = 'RBS' WHERE track = 'RBS_TEMP';

-- 6. Re-add updated check constraint with new track names
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_name_check
  CHECK (shift_name = ANY(ARRAY['`', '``', 'RBS', 'RBS1']::varchar[]));

-- 7. Re-add FK
ALTER TABLE sessions ADD CONSTRAINT sessions_shift_name_fkey
  FOREIGN KEY (shift_name) REFERENCES shifts(shift_name);

COMMIT;

-- Verify
SELECT 'shifts' as tbl, id, shift_name FROM shifts ORDER BY id;
SELECT 'sessions' as tbl, shift_name, status FROM sessions ORDER BY shift_name;
