const pool = require('../src/db');
const billingController = require('../src/controllers/billingController');
const OrderModel = require('../src/models/orderModel');

async function runTest() {
  console.log("=== STARTING CONTROLLER SYNC TEST ===");

  const TEST_TABLE = 99;
  const TEST_PARTY = "1";
  const TEST_TRACK = "`";
  const TEST_CLERK = "CLK";
  const TEST_DATE = "2026-06-12";

  try {
    // 1. Clean up any previous test leftovers
    console.log("Cleaning up previous test data...");
    await pool.query("DELETE FROM orders WHERE table_no = $1", [TEST_TABLE]);
    await pool.query("DELETE FROM bills WHERE table_no = $1", [TEST_TABLE]);

    // 2. Setup menu items (ensure we have at least one valid item code to lookup)
    const menuRes = await pool.query("SELECT * FROM items LIMIT 2");
    if (menuRes.rows.length === 0) {
      throw new Error("No menu items found in DB to run integration test.");
    }
    const item1 = menuRes.rows[0];
    const item2 = menuRes.rows[1] || item1;
    console.log(`Using menu items: '${item1.name}' (${item1.alpha_code || item1.numeric_code}) and '${item2.name}' (${item2.alpha_code || item2.numeric_code})`);

    // 3. Create a provisional bill in DB
    console.log("Creating provisional bill...");
    const testCreatedAt = new Date(Date.now() - 3600000);
    const provBillRes = await pool.query(
      `INSERT INTO bills (bill_number, bill_date, table_no, party_no, section, track, clerk_initials, items_json, created_at)
       VALUES (0, $1, $2, $3, 'G', $4, $5, '[]'::jsonb, $6)
       RETURNING *`,
      [TEST_DATE, TEST_TABLE, TEST_PARTY, TEST_TRACK, TEST_CLERK, testCreatedAt]
    );
    const provBill = provBillRes.rows[0];
    console.log("Provisional bill created with ID:", provBill.id);

    // 4. Create one order in the DB (simulating stale state, e.g. a ₹20 item)
    console.log("Creating stale order in database...");
    await OrderModel.createOrder({
      track: TEST_TRACK,
      clerk_initials: TEST_CLERK,
      table_no: TEST_TABLE,
      party_no: TEST_PARTY,
      bill_number: 0,
      bill_date: TEST_DATE,
      item_code: item1.alpha_code,
      numeric_item_code: item1.numeric_code,
      item_name: item1.name,
      quantity: 1,
      unit_price: 20.00,
      line_total: 20.00,
      created_at: provBill.created_at,
    });

    // 5. Build mock request payload with DIFFERENT items (simulating frontend state: 2 quantities of item2)
    // We expect the backend to delete the ₹20 order and insert this new order, then verify and finalize.
    const newQty = 1.5;
    const unitPrice = parseFloat(item2.price_general) || 50.00;
    const lineTotal = newQty * unitPrice;
    
    // Calculate taxes (5% GST: 2.5% SGST, 2.5% CGST)
    const total = lineTotal;
    const sgst = Math.round((total * 0.025) * 100) / 100;
    const cgst = Math.round((total * 0.025) * 100) / 100;
    const tax_amount = sgst + cgst;
    const subtotal = total - tax_amount;

    console.log(`Frontend computed totals: Grand Total=${total}, SGST=${sgst}, CGST=${cgst}, Subtotal=${subtotal}`);

    const req = {
      body: {
        table_no: TEST_TABLE,
        party_no: TEST_PARTY,
        section: "G",
        track: TEST_TRACK,
        clerk_initials: TEST_CLERK,
        bill_date: TEST_DATE,
        subtotal: subtotal,
        sgst: sgst,
        cgst: cgst,
        tax_amount: tax_amount,
        grand_total: total,
        items: [
          {
            item_name: item2.name,
            quantity: newQty,
            unit_price: unitPrice,
            line_total: lineTotal,
            item_code: item2.alpha_code,
            numeric_item_code: item2.numeric_code,
            is_separate: true // Test the is_separate property propagation
          }
        ]
      }
    };

    let statusVal = 200;
    let responseData = null;

    const res = {
      status(val) {
        statusVal = val;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    // 6. Run the controller finalize (createBill) function
    console.log("Calling billingController.createBill...");
    await billingController.createBill(req, res);

    console.log("Response status:", statusVal);
    console.log("Response data:", JSON.stringify(responseData, null, 2));

    if (statusVal === 201) {
      console.log("SUCCESS: Bill finalized successfully!");
      
      // Let's verify that the finalized bill in database has the new items
      const finalizedBillRes = await pool.query("SELECT * FROM bills WHERE id = $1", [responseData.bill_id]);
      const bill = finalizedBillRes.rows[0];
      console.log("Finalized bill details:");
      console.log("- Bill Number:", bill.bill_number);
      console.log("- Items JSON:", JSON.stringify(bill.items_json, null, 2));
      
      // Check that the items contains the separate flag
      const firstItem = bill.items_json[0];
      if (firstItem && firstItem.is_separate === true) {
        console.log("SUCCESS: is_separate status correctly preserved!");
      } else {
        console.error("FAIL: is_separate status was NOT preserved. Item:", firstItem);
      }

      // Check that the old orders are cleared
      const remainingOrders = await OrderModel.getPendingOrdersByTableAndParty(TEST_TABLE, TEST_PARTY);
      console.log("Remaining pending orders in DB:", remainingOrders.length);
      if (remainingOrders.length === 0) {
        console.log("SUCCESS: Pending orders correctly cleared from database!");
      } else {
        console.error("FAIL: Pending orders were not cleared. Remaining:", remainingOrders);
      }

    } else {
      console.error("FAIL: Bill finalization failed with status", statusVal);
    }

  } catch (err) {
    console.error("Error during integration test:", err);
  } finally {
    // Clean up
    console.log("Cleaning up test data...");
    await pool.query("DELETE FROM orders WHERE table_no = $1", [TEST_TABLE]);
    await pool.query("DELETE FROM bills WHERE table_no = $1", [TEST_TABLE]);
    pool.end();
    console.log("=== TEST COMPLETED ===");
  }
}

runTest().catch(console.error);
