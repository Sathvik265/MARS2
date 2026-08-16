const fs = require("fs");
const path = require("path");
const pool = require("./src/db");

async function importDatabase() {
  const inputPath = path.join(__dirname, "db_export.json");
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Import source file not found: ${inputPath}`);
    process.exit(1);
  }

  const dbData = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  
  // The insertion order is crucial due to foreign key relationships
  const tablesOrder = [
    "shifts",
    "tables",
    "sessions",
    "settings",
    "items",
    "bills",
    "orders",
    "running_bills",
    "audit_log",
    "debug_logs",
    "bill_items"
  ];

  const client = await pool.connect();

  try {
    console.log("Starting JSON database import...");
    await client.query("BEGIN");

    // Clean all tables first
    for (let i = tablesOrder.length - 1; i >= 0; i--) {
      const table = tablesOrder[i];
      console.log(`Clearing existing data from public.${table}...`);
      await client.query(`TRUNCATE TABLE public.${table} CASCADE`);
    }

    // Insert records
    for (const table of tablesOrder) {
      const rows = dbData[table] || [];
      console.log(`Importing ${rows.length} rows into public.${table}...`);
      
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col];
          // Handle complex structures like array/object to string JSON
          if (val && typeof val === "object") {
            return JSON.stringify(val);
          }
          return val;
        });

        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
        const colList = columns.map(c => `"${c}"`).join(", ");
        
        await client.query(
          `INSERT INTO public.${table} (${colList}) VALUES (${placeholders})`,
          values
        );
      }

      // Update primary key sequence if column 'id' or table-specific id sequence exists
      const hasSerialId = columns.includes("id") || columns.includes("bill_item_id");
      if (hasSerialId) {
        const idColName = columns.includes("bill_item_id") ? "bill_item_id" : "id";
        const seqNameRes = await client.query(
          `SELECT pg_get_serial_sequence('public.${table}', '${idColName}') AS seq`
        );
        const seqName = seqNameRes.rows[0]?.seq;
        if (seqName) {
          await client.query(
            `SELECT setval('${seqName}', COALESCE((SELECT MAX("${idColName}") FROM public.${table}), 1), true)`
          );
          console.log(`Updated sequence for public.${table}`);
        }
      }
    }

    await client.query("COMMIT");
    console.log("\n✅ Database import completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Database import failed:", error);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

importDatabase();
