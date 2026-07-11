const pool = require("../src/db");
const BillingModel = require("../src/models/billingModel");

// Mock shift model if needed, but BillingModel only uses it if we revert to old logic.
// New logic passes track directly.

async function test() {
  const date = "2025-12-07"; // Using a fixed test date
  const trackA = "TRACK_A";
  const trackB = "TRACK_B";

  console.log("Starting verification...");

  try {
    // Cleanup first
    await pool.query(
      "DELETE FROM bills WHERE bill_date = $1 AND (track = $2 OR track = $3)",
      [date, trackA, trackB]
    );

    // 1. Create bill for Track A
    console.log("Creating Bill 1 for Track A...");
    const billA1 = await BillingModel.createBill({
      bill_date: date,
      table_no: "1",
      party_no: "1",
      section: "G",
      track: trackA,
      clerk_initials: "A",
      subtotal: 100,
      sgst: 2.5,
      cgst: 2.5,
      tax_amount: 5,
      grand_total: 105,
    });
    console.log(`Bill A1 Number: ${billA1.bill_number}`);
    if (billA1.bill_number !== 1) console.error("FAIL: Bill A1 should be 1");

    // 2. Create bill for Track B
    console.log("Creating Bill 1 for Track B...");
    const billB1 = await BillingModel.createBill({
      bill_date: date,
      table_no: "2",
      party_no: "1",
      section: "G",
      track: trackB,
      clerk_initials: "B",
      subtotal: 200,
      sgst: 5,
      cgst: 5,
      tax_amount: 10,
      grand_total: 210,
    });
    console.log(`Bill B1 Number: ${billB1.bill_number}`);
    if (billB1.bill_number !== 1) console.error("FAIL: Bill B1 should be 1");

    // 3. Create another bill for Track A
    console.log("Creating Bill 2 for Track A...");
    const billA2 = await BillingModel.createBill({
      bill_date: date,
      table_no: "3",
      party_no: "1",
      section: "G",
      track: trackA,
      clerk_initials: "A",
      subtotal: 100,
      sgst: 2.5,
      cgst: 2.5,
      tax_amount: 5,
      grand_total: 105,
    });
    console.log(`Bill A2 Number: ${billA2.bill_number}`);
    if (billA2.bill_number !== 2) console.error("FAIL: Bill A2 should be 2");

    // 4. Create another bill for Track B
    console.log("Creating Bill 2 for Track B...");
    const billB2 = await BillingModel.createBill({
      bill_date: date,
      table_no: "4",
      party_no: "1",
      section: "G",
      track: trackB,
      clerk_initials: "B",
      subtotal: 100,
      sgst: 2.5,
      cgst: 2.5,
      tax_amount: 5,
      grand_total: 105,
    });
    console.log(`Bill B2 Number: ${billB2.bill_number}`);
    if (billB2.bill_number !== 2) console.error("FAIL: Bill B2 should be 2");

    console.log("Verification complete.");
  } catch (e) {
    console.error("Test Error:", e);
  } finally {
    // Cleanup
    await pool.query(
      "DELETE FROM bills WHERE bill_date = $1 AND (track = $2 OR track = $3)",
      [date, trackA, trackB]
    );
    process.exit(0);
  }
}

test();
