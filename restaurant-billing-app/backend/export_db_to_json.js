const fs = require("fs");
const path = require("path");
const pool = require("./src/db");

async function exportDatabase() {
  const tables = [
    "shifts",
    "sessions",
    "tables",
    "settings",
    "items",
    "bills",
    "orders",
    "running_bills",
    "audit_log",
    "debug_logs",
    "bill_items"
  ];

  const dbData = {};

  try {
    console.log("Connecting to PostgreSQL and exporting tables to JSON...");
    
    for (const table of tables) {
      console.log(`Exporting table: ${table}...`);
      const res = await pool.query(`SELECT * FROM public.${table}`);
      dbData[table] = res.rows;
      console.log(`Successfully exported ${res.rows.length} rows from ${table}`);
    }

    const outputPath = path.join(__dirname, "db_export.json");
    fs.writeFileSync(outputPath, JSON.stringify(dbData, null, 2), "utf8");
    
    console.log(`\n✅ Database successfully exported to JSON: ${outputPath}`);
  } catch (error) {
    console.error("Error exporting database:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

exportDatabase();
