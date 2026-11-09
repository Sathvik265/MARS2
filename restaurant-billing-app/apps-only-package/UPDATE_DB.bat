<# :
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath '%~f0') -join [Environment]::NewLine)"
exit /b %ERRORLEVEL%
#>

$host.UI.RawUI.WindowTitle = "Restaurant Billing System - Database Updater"
$PSScriptRoot = (Split-Path -Parent $MyInvocation.MyCommand.Definition)
if (-not $PSScriptRoot) { $PSScriptRoot = (Get-Location).Path }

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "       RESTAURANT BILLING SYSTEM - DATABASE AUTO-UPDATER" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Locate PostgreSQL psql.exe
$pgBin = $null
try {
    $wherePsql = (where.exe psql.exe 2>$null)
    if ($wherePsql) {
        $first = ($wherePsql -split "`r?`n")[0].Trim()
        if ($first -and (Test-Path $first)) { $pgBin = Split-Path $first }
    }
} catch {}

if (-not $pgBin) {
    foreach ($v in 18..12) {
        $candidate = "C:\Program Files\PostgreSQL\$v\bin"
        if (Test-Path "$candidate\psql.exe") {
            $pgBin = $candidate
            break
        }
    }
}

if (-not $pgBin) {
    Write-Host "[ERROR] PostgreSQL (psql.exe) was not found in PATH or standard Program Files." -ForegroundColor Red
    Write-Host "Please ensure PostgreSQL is installed and running on this computer." -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$env:Path = "$pgBin;$env:Path"

# 2. Locate DB credentials from .env
$dbUser = "postgres"
$dbHost = "localhost"
$dbPort = "5432"
$dbName = "restaurant_billing_db"
$dbPass = "Deepthi@2004"

$envCandidates = @(
    "$PSScriptRoot\backend\.env",
    "$PSScriptRoot\.env",
    "$PSScriptRoot\..\backend\.env",
    "$env:USERPROFILE\Desktop\dist-package\backend\.env",
    "$env:USERPROFILE\Desktop\apps-only-package\backend\.env"
)

foreach ($cand in $envCandidates) {
    if (Test-Path $cand) {
        Get-Content $cand | ForEach-Object {
            if ($_ -match '^\s*([^#=]+)=(.*)$') {
                $k = $matches[1].Trim()
                $v = $matches[2].Trim()
                if ($k -ieq 'DB_USER' -and $v) { $dbUser = $v }
                if ($k -ieq 'DB_HOST' -and $v) { $dbHost = $v }
                if ($k -ieq 'DB_PORT' -and $v) { $dbPort = $v }
                if ($k -ieq 'DB_NAME' -and $v) { $dbName = $v }
                if ($k -ieq 'DB_PASSWORD' -and $v -and $v -ne 'your_postgres_password') { $dbPass = $v }
            }
        }
        break
    }
}

$env:PGPASSWORD = $dbPass

Write-Host "[*] Located PostgreSQL at : $pgBin" -ForegroundColor Gray
Write-Host "[*] Target Database       : $dbName ($dbHost`:$dbPort)" -ForegroundColor Gray
Write-Host "[*] Database User         : $dbUser" -ForegroundColor Gray
Write-Host ""
Write-Host "Applying database updates... Please wait..." -ForegroundColor Yellow

$patchSql = @'
BEGIN;

-- 1. Ensure uuid-ossp extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Ensure items_json column exists in bills
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'items_json'
    ) THEN
        ALTER TABLE public.bills ADD COLUMN items_json JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- 3. Support decimal quantities in orders
ALTER TABLE public.orders ALTER COLUMN quantity TYPE NUMERIC(10,2);
ALTER TABLE public.orders ALTER COLUMN quantity SET DEFAULT 1.00;

-- 4. Create GIN index on items_json
CREATE INDEX IF NOT EXISTS idx_bills_items_json ON public.bills USING GIN (items_json);

-- 5. Drop old faulty move_orders_to_bill_json procedures (both TEXT and VARCHAR signatures)
DROP FUNCTION IF EXISTS public.move_orders_to_bill_json(INTEGER, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.move_orders_to_bill_json(INTEGER, VARCHAR, VARCHAR) CASCADE;

-- 6. Recreate clean move_orders_to_bill_json
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

-- 7. Update get_category_totals_for_date
DROP FUNCTION IF EXISTS public.get_category_totals_for_date(date) CASCADE;

CREATE OR REPLACE FUNCTION public.get_category_totals_for_date(p_date date) 
RETURNS TABLE(category_name character varying, total_quantity numeric)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cat->>'name' AS category_name,
        CEIL(SUM((item->>'quantity')::numeric * (cat->>'qty')::numeric))::numeric AS total_quantity
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
$$;

-- 8. Update category multipliers for combos and multiple-quantity items
UPDATE public.items 
SET category = '[{"name": "dosa", "category_old": "dosa", "qty": 2}]'::jsonb
WHERE numeric_code IN ('113', '119') OR alpha_code IN ('MMM', 'PAD');

UPDATE public.items 
SET category = '[{"name": "dosa", "category_old": "dosa", "qty": 3}]'::jsonb
WHERE numeric_code = '121' OR alpha_code = 'SED';

UPDATE public.items 
SET category = '[{"name": "Idli", "category_old": "idli", "qty": 2}]'::jsonb
WHERE numeric_code = '101' OR alpha_code = 'IDL';

UPDATE public.items 
SET category = '[{"name": "Idli", "category_old": "idli", "qty": 1}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb
WHERE numeric_code = '102' OR alpha_code = 'SIV';

UPDATE public.items 
SET category = '[{"name": "Idli", "category_old": "idli", "qty": 2}, {"name": "wada", "category_old": "wada", "qty": 1}]'::jsonb
WHERE numeric_code = '103' OR alpha_code = 'ISV';

COMMIT;
'@

$patchSql | psql.exe -U $dbUser -h $dbHost -p $dbPort -d $dbName

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "[SUCCESS] DATABASE UPDATED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "  - 70.MM.DOSA (113)  : set to 2 qty" -ForegroundColor Green
    Write-Host "  - PAPER DOSA (119)  : set to 2 qty" -ForegroundColor Green
    Write-Host "  - SET DOSA (121)    : set to 3 qty" -ForegroundColor Green
    Write-Host "  - IDLY & WADA       : multipliers updated" -ForegroundColor Green
    Write-Host "  - Stored Procedures : updated (fixed column 'items' error)" -ForegroundColor Green
    Write-Host "  - Existing Bills    : 100% preserved" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ERROR] Database update failed. Check PostgreSQL service and password." -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to exit"
