-- ========================================================================
-- RESTAURANT BILLING SYSTEM - MENU RATES UPDATE SCRIPT
-- Hotel New Udupi Anand Bhavan (Charminar, Hyderabad)
-- Source: Updated Menu Boards (Vegetarian Dishes & Chat / Juices)
-- ========================================================================

BEGIN;

-- ------------------------------------------------------------------------
-- 1. SOUTH INDIAN TIFFINS (Photo 2)
-- Columns: Parcel/Self Service | Service
-- ------------------------------------------------------------------------

-- IDLY (Parcel/Self: 36, Service: 38)
UPDATE items 
SET price_fixed = 36.00, price_general = 36.00, price_ac = 38.00 
WHERE alpha_code = 'IDL' OR numeric_code = '101';

-- A.B. SPL. IDLY (Parcel/Self: 50, Service: 52)
UPDATE items 
SET price_fixed = 50.00, price_general = 50.00, price_ac = 52.00 
WHERE alpha_code = 'SPI' OR numeric_code = '112';

-- S-IDLY, S-WADA (Parcel/Self: 52, Service: 54)
UPDATE items 
SET price_fixed = 52.00, price_general = 52.00, price_ac = 54.00 
WHERE alpha_code = 'SIV' OR numeric_code = '102';

-- S-IDLY, S-WADA SAMBAR (Parcel/Self: 60, Service: 62)
UPDATE items 
SET price_fixed = 60.00, price_general = 60.00, price_ac = 62.00 
WHERE alpha_code = 'SRW' OR numeric_code = '100';

-- 2-IDLY, S-WADA (Parcel/Self: 70, Service: 72)
UPDATE items 
SET price_fixed = 70.00, price_general = 70.00, price_ac = 72.00 
WHERE alpha_code = 'ISV' OR numeric_code = '103';

-- WADA (Parcel/Self: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'WAD' OR numeric_code = '104';

-- SAMBAR IDLY (Parcel/Self: 43, Service: 45)
UPDATE items 
SET price_fixed = 43.00, price_general = 43.00, price_ac = 45.00 
WHERE alpha_code = 'SBR' OR numeric_code = '153';

-- RASAM IDLY (Parcel/Self: 43, Service: 45)
UPDATE items 
SET price_fixed = 43.00, price_general = 43.00, price_ac = 45.00 
WHERE alpha_code = 'RAI' OR numeric_code = '105';

-- SAMBAR WADA (Parcel/Self: 72, Service: 74)
UPDATE items 
SET price_fixed = 72.00, price_general = 72.00, price_ac = 74.00 
WHERE alpha_code IN ('SAR', 'SWD') OR numeric_code IN ('152', '152A');

-- RASAM WADA (Parcel/Self: 72, Service: 74)
UPDATE items 
SET price_fixed = 72.00, price_general = 72.00, price_ac = 74.00 
WHERE alpha_code = 'RAW' OR numeric_code = '106';

-- PURI (POORI) (Parcel/Self: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'POO' OR numeric_code = '107';

-- PAROTA (Parcel/Self: 60, Service: 62)
UPDATE items 
SET price_fixed = 60.00, price_general = 60.00, price_ac = 62.00 
WHERE alpha_code = 'PAR' OR numeric_code = '128';

-- MYSORE BAJJI (Parcel/Self: 45, Service: 47)
UPDATE items 
SET price_fixed = 45.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'MYB' OR numeric_code = '123';

-- MURUKULU / MIXTURE (Parcel/Self: 45, Service: 47)
UPDATE items 
SET price_fixed = 45.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'MUM' OR numeric_code = '122';

-- TOMATO BATH (Parcel/Self: 37, Service: 39)
UPDATE items 
SET price_fixed = 37.00, price_general = 37.00, price_ac = 39.00 
WHERE alpha_code = 'TOB' OR numeric_code = '116';

-- CHAPATI (Parcel/Self: 60, Service: 62)
UPDATE items 
SET price_fixed = 60.00, price_general = 60.00, price_ac = 62.00 
WHERE alpha_code = 'CHA' OR numeric_code = '129';


-- ------------------------------------------------------------------------
-- 2. DOSA (Photo 2)
-- Columns: Parcel/Self Service | Service
-- ------------------------------------------------------------------------

-- PLAIN DOSA (Parcel/Self: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'PLD' OR numeric_code = '108';

-- MASALA DOSA (Parcel/Self: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'MAS' OR numeric_code = '109';

-- MASALA DOSA (with sambar) (Parcel/Self: 68, Service: 70)
UPDATE items 
SET price_fixed = 68.00, price_general = 68.00, price_ac = 70.00 
WHERE alpha_code = 'MDS' OR numeric_code = '209';

-- ONION DOSA (Parcel/Self: 87, Service: 89)
UPDATE items 
SET price_fixed = 87.00, price_general = 87.00, price_ac = 89.00 
WHERE alpha_code = 'OND' OR numeric_code = '111';

-- ONION UTAPPA / UTTAPA (Parcel/Self: 87, Service: 89)
UPDATE items 
SET price_fixed = 87.00, price_general = 87.00, price_ac = 89.00 
WHERE alpha_code = 'UTA' OR numeric_code = '132';

-- OPEN DOSA (Parcel/Self: 87, Service: 89)
UPDATE items 
SET price_fixed = 87.00, price_general = 87.00, price_ac = 89.00 
WHERE alpha_code = 'OPD' OR numeric_code = '131';

-- SET DOSA (Parcel/Self: 77, Service: 79)
UPDATE items 
SET price_fixed = 77.00, price_general = 77.00, price_ac = 79.00 
WHERE alpha_code = 'SED' OR numeric_code = '121';

-- RAWA DOSA (Parcel/Self: 77, Service: 79)
UPDATE items 
SET price_fixed = 77.00, price_general = 77.00, price_ac = 79.00 
WHERE alpha_code = 'RAD' OR numeric_code = '110';

-- ONION RAWA DOSA (Parcel/Self: 87, Service: 89)
UPDATE items 
SET price_fixed = 87.00, price_general = 87.00, price_ac = 89.00 
WHERE alpha_code = 'ORD' OR numeric_code = '130';

-- PAPER DOSA (Parcel/Self: 140, Service: 142)
UPDATE items 
SET price_fixed = 140.00, price_general = 140.00, price_ac = 142.00 
WHERE alpha_code = 'PAD' OR numeric_code = '119';

-- 70MM DOSA (Parcel/Self: 140, Service: 142)
UPDATE items 
SET price_fixed = 140.00, price_general = 140.00, price_ac = 142.00 
WHERE alpha_code = 'MMM' OR numeric_code = '113';

-- A.B. SPECIAL DOSA (Parcel/Self: 105, Service: 107)
UPDATE items 
SET price_fixed = 105.00, price_general = 105.00, price_ac = 107.00 
WHERE alpha_code IN ('JER', 'ABD') OR numeric_code IN ('114', '114A');

-- GHEE-KARAMPUDI DOSA (Parcel/Self: 105, Service: 107)
UPDATE items 
SET price_fixed = 105.00, price_general = 105.00, price_ac = 107.00 
WHERE alpha_code = 'CCM' OR numeric_code = '115';


-- ------------------------------------------------------------------------
-- 3. RICE ITEMS (Photo 2)
-- Columns: Parcel/Self Service | Service
-- ------------------------------------------------------------------------

-- VEG. BIRYANI (Parcel/Self: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'VEB' OR numeric_code = '118';

-- TOMATO RICE (Parcel/Self: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'CAP' OR numeric_code = '117';

-- VEG. FRIED RICE (Parcel/Self: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'VFR' OR numeric_code = '142';


-- ------------------------------------------------------------------------
-- 4. SWEETS (Photo 2)
-- Columns: Parcel/Self Service | Service
-- ------------------------------------------------------------------------

-- JAMOON (Parcel/Self: 35, Service: 37)
UPDATE items 
SET price_fixed = 35.00, price_general = 35.00, price_ac = 37.00 
WHERE alpha_code = 'JUJ' OR numeric_code = '151';

-- COCONUT HALWA (Parcel/Self: 35, Service: 37)
UPDATE items 
SET price_fixed = 35.00, price_general = 35.00, price_ac = 37.00 
WHERE alpha_code = 'OKM' OR numeric_code = '155';


-- ------------------------------------------------------------------------
-- 5. SOUTH INDIAN MEAL (Photo 2)
-- Columns: Parcel/Self Service | Service
-- ------------------------------------------------------------------------

-- PLATE MEALS (Parcel/Self: 100, Service: 102)
UPDATE items 
SET price_fixed = 100.00, price_general = 100.00, price_ac = 102.00 
WHERE alpha_code = 'PLM' OR numeric_code = '167';

-- SPECIAL MEALS (Parcel/Self: 150, Service: 152)
UPDATE items 
SET price_fixed = 150.00, price_general = 150.00, price_ac = 152.00 
WHERE alpha_code = 'SPM' OR numeric_code = '168';


-- ------------------------------------------------------------------------
-- 6. HOT BEVERAGES (Photo 2)
-- Columns: Parcel/Self Service | Service
-- ------------------------------------------------------------------------

-- COFFEE (Parcel/Self: 35, Service: 35)
UPDATE items 
SET price_fixed = 35.00, price_general = 35.00, price_ac = 35.00 
WHERE alpha_code IN ('COF', 'SLC') OR numeric_code IN ('133', '143');

-- TEA (Parcel/Self: 30, Service: 30)
UPDATE items 
SET price_fixed = 30.00, price_general = 30.00, price_ac = 30.00 
WHERE alpha_code = 'TEA' OR numeric_code = '134';

-- TEA + CUP (Parcel/Self: 31, Service: 31)
UPDATE items 
SET price_fixed = 31.00, price_general = 31.00, price_ac = 31.00 
WHERE alpha_code IN ('AGH', 'TEC') OR numeric_code IN ('135', '135A');

-- BOURNVITA (Parcel/Self: 35, Service: 35)
UPDATE items 
SET price_fixed = 35.00, price_general = 35.00, price_ac = 35.00 
WHERE alpha_code = 'BOU' OR numeric_code = '136';

-- EMPTY CUP (1.00)
UPDATE items 
SET price_fixed = 1.00, price_general = 1.00, price_ac = 1.00 
WHERE alpha_code = 'EMP' OR numeric_code = '137';


-- ------------------------------------------------------------------------
-- 7. CHAT ITEMS (Photo 1)
-- Columns: Parcel | Self Service | Service
-- price_fixed = Parcel, price_general = Self Service, price_ac = Service
-- ------------------------------------------------------------------------

-- PAV BHAJI (Parcel: 70, Self Service: 65, Service: 67)
UPDATE items 
SET price_fixed = 70.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'PBJ' OR numeric_code = '201';

-- MASALA PAV BHAJI (Parcel: 85, Self Service: 80, Service: 82)
UPDATE items 
SET price_fixed = 85.00, price_general = 80.00, price_ac = 82.00 
WHERE alpha_code IN ('SPJ', 'MSL') OR numeric_code IN ('211', '211A');

-- EXTRA PAV (Parcel: 27, Self Service: 25, Service: 27)
UPDATE items 
SET price_fixed = 27.00, price_general = 25.00, price_ac = 27.00 
WHERE alpha_code = 'PAV' OR numeric_code = '205';

-- EXTRA BHAJI (Parcel: 45, Self Service: 40, Service: 42)
UPDATE items 
SET price_fixed = 45.00, price_general = 40.00, price_ac = 42.00 
WHERE alpha_code = 'BHA' OR numeric_code = '299';

-- SAMOSA RAGDA (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'SAM' OR numeric_code = '202';

-- CUTLET RAGDA (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'CUT' OR numeric_code = '203';

-- MASALA PURI (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'WDP' OR numeric_code = '212';

-- BHEL PURI (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'BEP' OR numeric_code = '206';

-- SEV PURI (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'SAP' OR numeric_code = '207';

-- PANI PURI (Parcel: 40, Self Service: 35, Service: 37)
UPDATE items 
SET price_fixed = 40.00, price_general = 35.00, price_ac = 37.00 
WHERE alpha_code = 'PAP' OR numeric_code = '208';

-- DAHI PURI (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'DPP' OR numeric_code = '199';

-- DAHI PAPDI (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'DHP' OR numeric_code = '200';

-- TOMATO CHAT (Parcel: 50, Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 50.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'TOM' OR numeric_code = '210';

-- PLAIN SAMOSA (Parcel: 22, Self Service: 20, Service: 22)
UPDATE items 
SET price_fixed = 22.00, price_general = 20.00, price_ac = 22.00 
WHERE alpha_code = 'PSA' OR numeric_code = '204';


-- ------------------------------------------------------------------------
-- 8. SUMMER SPECIALS (Photo 1)
-- Columns: Self Service | Service
-- ------------------------------------------------------------------------

-- DAHI WADA (Self Service: 65, Service: 67)
UPDATE items 
SET price_fixed = 65.00, price_general = 65.00, price_ac = 67.00 
WHERE alpha_code = 'DHW' OR numeric_code = '120';

-- CURD RICE (Self Service: 60, Service: 62)
UPDATE items 
SET price_fixed = 60.00, price_general = 60.00, price_ac = 62.00 
WHERE alpha_code = 'CUR' OR numeric_code = '171';

-- LASSI (Self Service: 50, Service: 52)
UPDATE items 
SET price_fixed = 50.00, price_general = 50.00, price_ac = 52.00 
WHERE alpha_code = 'LAS' OR numeric_code = '184';

-- SPL. LASSI (Icecream) (Self Service: 75, Service: 77)
UPDATE items 
SET price_fixed = 75.00, price_general = 75.00, price_ac = 77.00 
WHERE alpha_code = 'LSW' OR numeric_code = '284';

-- BUTTER MILK (Self Service: 30, Service: 32)
UPDATE items 
SET price_fixed = 30.00, price_general = 30.00, price_ac = 32.00 
WHERE alpha_code = 'BTR' OR numeric_code = '185';


-- ------------------------------------------------------------------------
-- 9. FRESH FRUIT JUICES (Photo 1)
-- Columns: Self Service | Service
-- ------------------------------------------------------------------------

-- MOSAMBI (Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 45.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'MSB' OR numeric_code = '182';

-- PINEAPPLE (P APPLE JUICE) (Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 45.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'FRJ' OR numeric_code = '183';

-- PARCEL JUICE (Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 45.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'JUI' OR numeric_code = '172';

-- FRUIT SALAD (Self Service: 50, Service: 52)
UPDATE items 
SET price_fixed = 50.00, price_general = 50.00, price_ac = 52.00 
WHERE alpha_code = 'FTS' OR numeric_code = '169';

-- FRIUT SALAD with Ice Cream (Self Service: 75, Service: 77)
UPDATE items 
SET price_fixed = 75.00, price_general = 75.00, price_ac = 77.00 
WHERE alpha_code = 'FTC' OR numeric_code = '170';

-- MILK SHAKE (Self Service: 45, Service: 47)
UPDATE items 
SET price_fixed = 45.00, price_general = 45.00, price_ac = 47.00 
WHERE alpha_code = 'BDM' OR numeric_code = '179';


-- ------------------------------------------------------------------------
-- 10. COMPANION ITEMS / COMBOS
-- ------------------------------------------------------------------------

-- S.WADA (Single Wada: half plate) (Self: 33, Service: 35)
UPDATE items 
SET price_fixed = 33.00, price_general = 33.00, price_ac = 35.00 
WHERE alpha_code = 'WWW' OR numeric_code = '500';

-- SSAMMBAR.WADA (Single Sambar Wada) (Self: 36, Service: 38)
UPDATE items 
SET price_fixed = 36.00, price_general = 36.00, price_ac = 38.00 
WHERE alpha_code = 'SSW' OR numeric_code = '501';

-- S.I.W Rasam (matches S.I.W Sambar) (Self: 60, Service: 62)
UPDATE items 
SET price_fixed = 60.00, price_general = 60.00, price_ac = 62.00 
WHERE alpha_code = 'RSM' OR numeric_code = '126';


-- ------------------------------------------------------------------------
-- 11. INSERT ADDITIONAL FRESH JUICES FROM MENU BOARD (IF NOT ALREADY PRESENT)
-- Self Service: 45, Service: 47
-- ------------------------------------------------------------------------
INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate)
VALUES
 ('WATER MELON JUICE', 'WMJ', '173', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('ORANGE JUICE',      'ORJ', '174', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('GANGA JAMUNA',      'GJJ', '176', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('MANGO JUICE',       'MNJ', '177', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('APPLE JUICE',       'APJ', '178', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('SAPOTA JUICE',      'STJ', '191', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('GRAPES JUICE',      'GPJ', '192', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE),
 ('BANANA JUICE',      'BAJ', '194', 45.00, 45.00, 47.00, '[{"name": "juice", "category_old": "juice", "qty": 1}]'::jsonb, FALSE)
ON CONFLICT (alpha_code) DO UPDATE SET
  price_fixed = EXCLUDED.price_fixed,
  price_general = EXCLUDED.price_general,
  price_ac = EXCLUDED.price_ac;

COMMIT;

-- ------------------------------------------------------------------------
-- VERIFICATION QUERY
-- ------------------------------------------------------------------------
SELECT 
    numeric_code AS code,
    alpha_code AS alpha,
    name,
    price_fixed AS parcel,
    price_general AS self_serv,
    price_ac AS service
FROM items
WHERE alpha_code IN (
    'IDL', 'SPI', 'SIV', 'SRW', 'ISV', 'WAD', 'SBR', 'RAI', 'SAR', 'RAW',
    'POO', 'PAR', 'MYB', 'MUM', 'TOB', 'CHA',
    'PLD', 'MAS', 'MDS', 'OND', 'UTA', 'OPD', 'SED', 'RAD', 'ORD', 'PAD', 'MMM', 'JER', 'CCM',
    'VEB', 'CAP', 'VFR', 'JUJ', 'OKM', 'PLM', 'SPM', 'COF', 'TEA', 'BOU',
    'PBJ', 'SPJ', 'PAV', 'BHA', 'SAM', 'CUT', 'WDP', 'BEP', 'SAP', 'PAP', 'DPP', 'DHP', 'TOM', 'PSA',
    'DHW', 'CUR', 'LAS', 'LSW', 'BTR', 'MSB', 'FRJ', 'FTS', 'FTC',
    'WMJ', 'ORJ', 'GJJ', 'MNJ', 'APJ', 'STJ', 'GPJ', 'BAJ'
)
ORDER BY numeric_code;
