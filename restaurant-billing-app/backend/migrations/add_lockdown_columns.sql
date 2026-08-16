-- Migration: Add is_locked and last_bill_number columns to sessions table
-- Run once against the live PostgreSQL database.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_bill_number INTEGER NOT NULL DEFAULT 0;

-- Index for fast lock-status lookups
CREATE INDEX IF NOT EXISTS idx_sessions_locked ON sessions (shift_name, is_locked);

COMMENT ON COLUMN sessions.is_locked IS
  'Set to TRUE when a clerk logs out of this track. Prevents clerk re-access until an admin unlocks via the Track Control dashboard.';

COMMENT ON COLUMN sessions.last_bill_number IS
  'Snapshot of the running_bills counter taken at the moment a clerk closes the session.';
