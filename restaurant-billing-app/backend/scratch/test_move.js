require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Pool } = require("pg");
const OrderModel = require("../src/models/orderModel");
const BillingModel = require("../src/models/billingModel");
const { getSectionForTable } = require("../src/utils/billingIntegrity");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function main() {
  try {
    // 1. Fetch any pending order
    const ordersRes = await pool.query("SELECT * FROM orders LIMIT 1");
    if (ordersRes.rows.length === 0) {
      console.log("No pending orders found to test with. Creating a dummy order first...");
      // Let's check if there is an open session
      const sessions = await pool.query("SELECT * FROM sessions WHERE status = 'OPEN' LIMIT 1");
      if (sessions.rows.length === 0) {
        console.log("No open session found. Cannot create dummy order.");
        return;
      }
      const session = sessions.rows[0];
      
      // Create provisional bill first
      const now = new Date();
      const provisionalBillData = {
        bill_date: new Date().toISOString().split("T")[0],
        table_no: 15,
        party_no: "1",
        section: "AC",
        track: session.shift_name,
        clerk_initials: session.clerk_initials,
        created_at: now,
      };
      const provBill = await BillingModel.createProvisionalBill(provisionalBillData);
      
      // Create dummy order
      const orderData = {
        track: session.shift_name,
        clerk_initials: session.clerk_initials,
        table_no: 15,
        party_no: "1",
        bill_number: 0,
        bill_date: provisionalBillData.bill_date,
        item_code: "IDL",
        numeric_item_code: "101",
        item_name: "Idli (2 pcs)",
        quantity: 2,
        unit_price: 30.00,
        line_total: 60.00,
        created_at: provBill.created_at,
      };
      await OrderModel.createOrder(orderData);
      console.log("Dummy order created successfully.");
    }

    // Fetch the order again
    const finalOrders = await pool.query("SELECT * FROM orders LIMIT 1");
    const order = finalOrders.rows[0];
    console.log("Testing with order:", order);

    const targetTableNo = 17;
    const targetPartyNo = "1";

    console.log(`Moving order ${order.id} from table ${order.table_no} to ${targetTableNo}...`);

    // 2. Find or create provisional bill for target
    let targetProvisionalBill = await BillingModel.getProvisionalBill(
      targetTableNo,
      targetPartyNo,
      order.track,
      order.clerk_initials
    );

    if (!targetProvisionalBill) {
      console.log("Creating target provisional bill...");
      const now = new Date();
      const provisionalBillData = {
        bill_date: order.bill_date,
        table_no: targetTableNo,
        party_no: targetPartyNo,
        section: getSectionForTable(targetTableNo),
        track: order.track,
        clerk_initials: order.clerk_initials,
        created_at: now,
      };
      targetProvisionalBill = await BillingModel.createProvisionalBill(provisionalBillData);
      console.log("Target provisional bill created:", targetProvisionalBill);
    }

    // 3. Move order
    const updatedOrder = await OrderModel.moveOrder(
      order.id,
      targetTableNo,
      targetPartyNo,
      targetProvisionalBill.created_at,
      order.track,
      order.clerk_initials
    );
    console.log("Move succeeded! Updated order:", updatedOrder);

  } catch (err) {
    console.error("DIAGNOSTIC ERROR DETECTED:", err);
  } finally {
    await pool.end();
  }
}

main();
