const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function verify() {
  const client = await pool.connect();
  try {
    console.log("Starting verification...");

    // 1. Create Test Item
    const categoryJson = JSON.stringify([{ name: "TestCat", qty: 1 }]);
    const randomSuffix = Date.now().toString().slice(-4);
    const itemRes = await client.query(
      `
      INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category)
      VALUES ('Test Item ' || $2, 'TEST' || $2, $2, 100, 100, 110, $1)
      RETURNING *
    `,
      [categoryJson, randomSuffix]
    );
    const item = itemRes.rows[0];
    console.log("✅ Created Test Item:", item.name);

    // 2. Get/Create Table
    let tableNo = 999;
    const tableCheck = await client.query(
      "SELECT table_id FROM tables LIMIT 1"
    );
    if (tableCheck.rows.length > 0) {
      tableNo = tableCheck.rows[0].table_id;
      console.log("✅ Using existing table:", tableNo);
    } else {
      try {
        await client.query(
          `
                INSERT INTO tables (table_id, table_name, capacity)
                VALUES ($1, 'Test Table', 4)
                ON CONFLICT (table_id) DO NOTHING
            `,
          [tableNo]
        );
        console.log("✅ Created Test Table 999");
      } catch (e) {
        console.log("⚠️ Table creation skipped");
      }
    }

    // 3. Create Order
    const today = new Date().toISOString().split("T")[0];
    const holdingBillNumber = 0;
    const orderCreatedAt = new Date();

    // First insert a provisional bill matching the FK of the order
    await client.query(
      `
      INSERT INTO bills (
        bill_number, bill_date, table_no, party_no, section, 
        track, clerk_initials, subtotal, sgst, cgst, 
        tax_amount, grand_total, items_json, created_at
      )
      VALUES (0, $1, $2, '1', 'AC', 'TRACK1', 'TEST', 0, 0, 0, 0, 0, '[]'::jsonb, $3)
      `,
      [today, tableNo, orderCreatedAt]
    );

    await client.query(
      `
      INSERT INTO orders (
        track, clerk_initials, table_no, party_no, bill_number, bill_date,
        item_code, numeric_item_code, item_name, quantity, unit_price, line_total, created_at
      )
      VALUES ('TRACK1', 'TEST', $1, '1', $2, $3, $4, $5, 'Test Item', 2, 100, 200, $6)
    `,
      [tableNo, holdingBillNumber, today, item.alpha_code, item.numeric_code, orderCreatedAt]
    );
    console.log("✅ Created Test Order");

    // 4. Debug Join
    const debugJoin = await client.query(
      `
        SELECT o.item_code, i.alpha_code 
        FROM orders o
        LEFT JOIN items i ON (i.alpha_code = o.item_code OR i.numeric_code = o.numeric_item_code)
        WHERE o.table_no = $1 AND o.party_no = '1' AND o.item_code = $2
    `,
      [tableNo.toString(), item.alpha_code]
    );
    console.log("Debug Join Count:", debugJoin.rows.length);

    // 5. Create Final Bill
    const finalBillNumber = Math.floor(Math.random() * 1000000);
    const billRes = await client.query(
      `
      INSERT INTO bills (
        bill_number, bill_date, table_no, party_no, section, 
        track, clerk_initials, subtotal, sgst, cgst, 
        tax_amount, grand_total, items_json
      )
      VALUES ($1, $2, $3, '1', 'AC', 'TRACK1', 'TEST', 200, 5, 5, 10, 210, '[]'::jsonb)
      RETURNING id
    `,
      [finalBillNumber, today, tableNo]
    );
    const billId = billRes.rows[0].id;

    // 6. Move Orders
    const moveRes = await client.query(
      "SELECT move_orders_to_bill_json($1, $2, $3)",
      [billId, tableNo.toString(), "1"]
    );
    console.log(
      "✅ Moved orders result:",
      moveRes.rows[0].move_orders_to_bill_json
    );

    // 7. Verify
    const billCheck = await client.query(
      "SELECT items_json FROM bills WHERE id = $1",
      [billId]
    );
    const itemsJson = billCheck.rows[0].items_json;
    console.log("itemsJson length:", itemsJson ? itemsJson.length : 0);

    if (itemsJson && itemsJson.length > 0) {
      console.log(
        "First item categories:",
        JSON.stringify(itemsJson[0].categories)
      );
    }

    // Cleanup
    await client.query("DELETE FROM bills WHERE id = $1", [billId]);
    await client.query("DELETE FROM bills WHERE table_no = $1 AND party_no = '1' AND created_at = $2", [tableNo, orderCreatedAt]);
    await client.query("DELETE FROM items WHERE id = $1", [item.id]);
    console.log("✅ Cleanup completed");
  } catch (err) {
    console.error("❌ Verification failed:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();
