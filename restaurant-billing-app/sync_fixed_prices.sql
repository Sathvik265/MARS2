-- One-time migration: Sync fixed prices to match general prices for all items
-- Run this script once against the database

UPDATE items SET price_fixed = price_general WHERE price_fixed != price_general;

-- Verify the update
SELECT COUNT(*) as items_with_mismatch 
FROM items 
WHERE price_fixed != price_general;
