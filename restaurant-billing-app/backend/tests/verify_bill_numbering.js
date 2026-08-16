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
    console.log("Starting Bill Numbering Verification...");

    // Debug: Check sessions table columns
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions'"
    );
    console.log(
      "Sessions Table Columns:",
      cols.rows.map((r) => r.column_name).join(", ")
    );
    // 2. Create Bill 1
    console.log("\n2. Creating Bill 1...");
    const bill1 = await createTestBill(client, track, today, 101);
    console.log(`✅ Created Bill 1: Number ${bill1.bill_number}`);
    if (parseInt(bill1.bill_number) !== 1)
      throw new Error(`Expected Bill Number 1, got ${bill1.bill_number}`);

    // 3. Create Bill 2
    console.log("\n3. Creating Bill 2...");
    const bill2 = await createTestBill(client, track, today, 102);
    console.log(`✅ Created Bill 2: Number ${bill2.bill_number}`);
    if (parseInt(bill2.bill_number) !== 2)
      throw new Error(`Expected Bill Number 2, got ${bill2.bill_number}`);

    // 4. Close Session and Open New One (Reset Test)
    console.log("\n4. Closing Session and Opening New One...");
    await client.query(
      "UPDATE sessions SET status = 'CLOSED', end_time = CURRENT_TIMESTAMP WHERE id = $1",
      [sessionId]
    );

    // Wait a second to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 1000));

    const session2Res = await client.query(
      `
        INSERT INTO sessions (shift_name, clerk_initials, session_date, start_time, status)
        VALUES ($1, 'TEST', $2, CURRENT_TIMESTAMP, 'OPEN')
        RETURNING *
    `,
      [track, today]
    );
    console.log(`✅ Opened new session ${session2Res.rows[0].id} for ${track}`);

    // 5. Create Bill 3 (Should be 1)
    console.log("\n5. Creating Bill 3 (Should be 1)...");
    const bill3 = await createTestBill(client, track, today, 103);
    console.log(`✅ Created Bill 3: Number ${bill3.bill_number}`);
    if (parseInt(bill3.bill_number) !== 1)
      throw new Error(
        `Expected Bill Number 1 (Reset), got ${bill3.bill_number}`
      );

    console.log("\n✅ Verification Successful!");

    // Cleanup
    await client.query("DELETE FROM bills WHERE id IN ($1, $2, $3)", [
      bill1.bill_id,
      bill2.bill_id,
      bill3.bill_id,
    ]);
    await client.query("DELETE FROM sessions WHERE id IN ($1, $2)", [
      sessionId,
      session2Res.rows[0].id,
    ]);
    console.log("✅ Cleanup completed");
  } catch (err) {
    console.error("❌ Verification failed:", err.message);
    if (err.code) console.error("Error Code:", err.code);
  } finally {
    client.release();
    await pool.end();
  }
}

async function createTestBill(client, track, date, tableNo) {
  const BillingModel = require("../src/models/billingModel");

  // Ensure table exists
  await client.query(
    `INSERT INTO tables (table_id, table_name, capacity) VALUES ($1, 'Test', 4) ON CONFLICT (table_id) DO NOTHING`,
    [tableNo]
  );

  // Create a dummy order so the stored proc has something to do
  await client.query(
    `INSERT INTO orders (track, clerk_initials, table_no, party_no, bill_number, bill_date, item_code, numeric_item_code, item_name, quantity, unit_price, line_total) VALUES ($1, 'TEST', $2, '1', 0, $3, 'TEST', '000', 'Test', 1, 100, 100)`,
    [track, tableNo, date]
  );

  // Ensure holding bill exists (since we are bypassing controller)
  await BillingModel.ensureHoldingBill(date);

  return await BillingModel.createBill({
    bill_date: date,
    table_no: tableNo,
    party_no: "1",
    section: "AC",
    track: track,
    clerk_initials: "TEST",
    subtotal: 100,
    sgst: 2.5,
    cgst: 2.5,
    tax_amount: 5,
    grand_total: 105,
  });
}

verify();
