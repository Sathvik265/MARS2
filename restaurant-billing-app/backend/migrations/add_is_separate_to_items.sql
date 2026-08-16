-- Add is_separate column to items table for Split Bill feature
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_separate BOOLEAN DEFAULT FALSE;
