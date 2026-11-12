const pool = require("./backend/src/db");

async function main() {
  const argTarget = process.argv[2]; // e.g. "IDL", "ALL", or item name
  const argNewQty = process.argv[3] !== undefined ? parseInt(process.argv[3], 10) : 1;

  try {
    let sql, params;

    if (!argTarget || argTarget.toUpperCase() === "ALL") {
      // Update all items where qty is currently 2 -> change to argNewQty (default 1)
      sql = `
        UPDATE items
        SET category = replace(category::text, '"qty": 2', '"qty": ' || $1)::jsonb
        WHERE category::text ILIKE '%"qty": 2%'
        RETURNING id, name, alpha_code, numeric_code, category;
      `;
      params = [argNewQty];
    } else {
      // Update specific item by alpha_code, numeric_code or name
      // Replaces whatever qty exists with argNewQty
      sql = `
        UPDATE items
        SET category = (
          SELECT jsonb_agg(
            jsonb_set(cat, '{qty}', to_jsonb($1::int))
          )
          FROM jsonb_array_elements(
            CASE 
              WHEN jsonb_typeof(category) = 'array' THEN category 
              ELSE jsonb_build_array(category) 
            END
          ) cat
        )
        WHERE alpha_code = $2 OR numeric_code = $2 OR name ILIKE $2
        RETURNING id, name, alpha_code, numeric_code, category;
      `;
      params = [argNewQty, argTarget];
    }

    const res = await pool.query(sql, params);

    if (res.rows.length === 0) {
      console.log(`\n⚠️ No matching items found to update.`);
    } else {
      console.log(`\n✅ Successfully updated ${res.rows.length} item(s):`);
      console.table(res.rows.map(r => ({
        id: r.id,
        name: r.name,
        code: r.alpha_code,
        category: JSON.stringify(r.category)
      })));
    }
  } catch (err) {
    console.error("❌ Error running update:", err.message);
  } finally {
    await pool.end();
  }
}

main();

