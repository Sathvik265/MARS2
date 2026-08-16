import csv
import json
import os

def generate():
    input_file = r"d:\D1\Code\Python codes\rbs\rbs\Documents\Items List .csv"
    output_file = r"d:\D1\Code\Python codes\rbs\rbs\restaurant-billing-app\items_insert.sql"

    sql_statements = []
    
    # -------------------------------------------------------------
    # 1. ADD ROLLBACK TO CLEAR ANY STUCK TRANSACTION ERRORS (25P02)
    # -------------------------------------------------------------
    sql_statements.append("ROLLBACK;")
    sql_statements.append("")
    
    seen_numeric = set()
    alpha_codes = []
    values_list = []

    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if not row or not row[0]: continue
            item_name = row[0].strip()
            alpha_code = row[1].strip()
            numeric_code = row[2].strip()
            general_rate_str = row[3].strip()
            ac_rate_str = row[4].strip()

            if item_name == "---":
                name_to_insert = "Unknown" 
            else:
                name_to_insert = item_name

            try:
                price_gen = float(general_rate_str)
            except:
                price_gen = 0.0
                
            try:
                price_ac = float(ac_rate_str)
            except:
                price_ac = 0.0

            if item_name == "---" or "EXTRA MISC" in item_name.upper():
                price_gen = 0.0
                price_ac = 0.0

            price_fixed = price_gen 

            # Handle duplicate numeric code in the SAME file
            original_num = numeric_code
            suffix_num = 1
            while numeric_code in seen_numeric:
                numeric_code = f"{original_num}{chr(64+suffix_num)}" # A, B, C
                suffix_num += 1
            seen_numeric.add(numeric_code)

            categories = []
            uname = item_name.upper()

            # IDLI rules
            has_idli = "IDLY" in uname or "IDLI" in uname or "S.I.W" in uname or "SIV" in alpha_code or "SAW" in alpha_code
            if has_idli:
                if "S.I.W" in uname or "S.I" in uname or "S. IDLI" in uname or "S.IDLI" in uname:
                    categories.append({"name": "Idli", "category_old": "idli", "qty": 1})
                else:
                    categories.append({"name": "Idli", "category_old": "idli", "qty": 2})

            # WADA rules
            has_wada = "WADA" in uname or "VADA" in uname or "S.I.W" in uname or "SIV" in alpha_code or "SAW" in alpha_code
            if has_wada:
                if "S.I.W" in uname or "S. WADA" in uname or "S.WADA" in uname or "SSAMBHAR" in uname or "SSAMMBAR" in uname or "ISV" in alpha_code or "SIV" in alpha_code:
                    categories.append({"name": "wada", "category_old": "wada", "qty": 1})
                elif "SAW" in alpha_code:
                    categories.append({"name": "wada", "category_old": "wada", "qty": 2})
                else:
                    categories.append({"name": "wada", "category_old": "wada", "qty": 2})

            # DOSA
            if "DOSA" in uname:
                categories.append({"name": "dosa", "category_old": "dosa", "qty": 1})
                
            # COFFEE
            if "COFFEE" in uname or "COFFE" in uname:
                categories.append({"name": "coffee", "category_old": "coffee", "qty": 1})

            # TEA
            if "TEA" in uname:
                categories.append({"name": "tea", "category_old": "tea", "qty": 1})

            # PAVBHAJI
            if "PAV BHAJI" in uname or "PAVBAJI" in uname or "PAVBHAJI" in uname:
                categories.append({"name": "pavbhaji", "category_old": "pavbhaji", "qty": 1})

            # PURI
            if "POORI" in uname or "PURI" in uname:
                categories.append({"name": "puri", "category_old": "puri", "qty": 1})

            # ROTI
            if "ROTI" in uname:
                categories.append({"name": "roti", "category_old": "roti", "qty": 1})

            # JUICE
            if "JUICE" in uname:
                categories.append({"name": "juice", "category_old": "juice", "qty": 1})

            cat_json = json.dumps(categories).replace("'", "''")
            name_esc = name_to_insert.replace("'", "''")
            
            alpha_codes.append(f"'{alpha_code}'")
            values_list.append(f" ('{name_esc}', '{alpha_code}', '{numeric_code}', {price_fixed}, {price_gen}, {price_ac}, '{cat_json}'::jsonb, FALSE)")

    # Construct the final SQL
    sql_statements.append("-- ==========================================================")
    sql_statements.append("-- 2. SAFELY RESOLVE ANY CONFLICTS WITH EXISTING DUMMY ITEMS")
    sql_statements.append("-- ==========================================================")
    # Move the old items out of the way to avoid numeric_code UNIQUE constraints
    alpha_codes_str = ", ".join(alpha_codes)
    sql_statements.append(f"UPDATE items SET numeric_code = numeric_code || '_old_' || id WHERE alpha_code NOT IN ({alpha_codes_str});")
    sql_statements.append("\n-- ==========================================================")
    sql_statements.append("-- 3. INSERT OR UPDATE ALL ITEMS AS A SINGLE BULK OPERATION")
    sql_statements.append("-- ==========================================================")
    sql_statements.append("INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate) VALUES")
    
    # join values with comma
    sql_statements.append(",\n".join(values_list))
    
    # Conflict resolution
    sql_statements.append("ON CONFLICT (alpha_code) DO UPDATE SET ")
    sql_statements.append("  name = EXCLUDED.name, ")
    sql_statements.append("  numeric_code = EXCLUDED.numeric_code, ")
    sql_statements.append("  price_fixed = EXCLUDED.price_fixed, ")
    sql_statements.append("  price_general = EXCLUDED.price_general, ")
    sql_statements.append("  price_ac = EXCLUDED.price_ac, ")
    sql_statements.append("  category = EXCLUDED.category, ")
    sql_statements.append("  is_separate = EXCLUDED.is_separate;")

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_statements))

generate()
