const { Pool } = require("pg");
require("dotenv").config();

// Use a high port for testing to prevent conflicts
process.env.PORT = "8009";

// Initialize Postgres connection pool using env variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function runSimulation() {
  console.log("==================================================================");
  console.log("              RBS BILLING SYSTEM SIMULATION TEST                  ");
  console.log("==================================================================");

  let client;
  try {
    client = await pool.connect();
    console.log("✅ Connected to database");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  const testDate = "2026-07-10";
  const track = "RBS1";
  const clerk = "SRIHARI";
  const adminPassword = process.env.ADMIN_FULL_PASSWORD || "vittal";

  try {
    // 1. Ensure shift session exists and is OPEN for track RBS1 and testDate
    console.log(`\n[1/7] Ensuring shift session is OPEN for track '${track}' on ${testDate}...`);
    
    // Check if shift RBS1 exists
    const shiftCheck = await client.query("SELECT shift_name FROM shifts WHERE shift_name = $1", [track]);
    if (shiftCheck.rows.length === 0) {
      await client.query("INSERT INTO shifts (shift_name) VALUES ($1)", [track]);
    }

    // Insert or update session manually
    const sessionCheck = await client.query(
      `SELECT id FROM sessions 
       WHERE shift_name = $1 AND clerk_initials = $2 AND session_date = $3`,
      [track, clerk, testDate]
    );

    if (sessionCheck.rows.length > 0) {
      await client.query(
        `UPDATE sessions SET status = 'OPEN', is_locked = FALSE WHERE id = $1`,
        [sessionCheck.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO sessions (shift_name, clerk_initials, session_date, status, is_locked)
         VALUES ($1, $2, $3, 'OPEN', FALSE)`,
        [track, clerk, testDate]
      );
    }
    console.log(`✅ Shift session configured: track='${track}', date='${testDate}'`);

    // 2. Start the Express server
    console.log("\n[2/7] Starting Express server on port 8009...");
    const app = require("../src/app");
    
    // Give the server a moment to bind and print start logs
    await new Promise(r => setTimeout(r, 1500));
    console.log("✅ Express server is ready");

    const baseUrl = "http://localhost:8009/api";

    // 3. Login via API to get auth token
    console.log("\n[3/7] Logging in as Admin to obtain API token...");
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staff_code: clerk,
        date: testDate,
        track: track,
        password: adminPassword
      })
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Login failed with status ${loginRes.status}: ${errText}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.auth_token;
    console.log(`✅ Logged in successfully. Token: ${token.substring(0, 15)}...`);

    const headers = {
      "Content-Type": "application/json",
      "x-auth-token": token
    };

    // 4. Fetch menu items to select from
    console.log("\n[4/7] Fetching menu items from API...");
    const menuRes = await fetch(`${baseUrl}/menu`, { headers });
    if (!menuRes.ok) {
      throw new Error(`Failed to fetch menu. Status: ${menuRes.status}`);
    }
    const menuItems = await menuRes.json();
    console.log(`✅ Loaded ${menuItems.length} menu items from database`);

    if (menuItems.length === 0) {
      throw new Error("No menu items found in the database. Please run migrations/inserts first.");
    }

    // 5. Simulating 100 Bills (including split billing)
    console.log("\n[5/7] Simulating the creation of 105 bills...");
    const totalBillsToSimulate = 105;
    let successfulBills = 0;
    let totalSimulatedAmount = 0;

    for (let i = 1; i <= totalBillsToSimulate; i++) {
      const tableNo = Math.floor(Math.random() * 29) + 2; // Tables 2 to 30
      const partyNo = String(Math.floor(Math.random() * 3) + 1); // Parties 1 to 3
      const numItems = Math.floor(Math.random() * 3) + 2; // 2 to 4 items per bill
      
      const selectedItems = [];
      const chosenIndices = new Set();
      
      while (selectedItems.length < numItems) {
        const randIdx = Math.floor(Math.random() * menuItems.length);
        if (!chosenIndices.has(randIdx)) {
          chosenIndices.add(randIdx);
          selectedItems.push(menuItems[randIdx]);
        }
      }

      // Determine section based on table
      let section = "G";
      if (tableNo >= 15 && tableNo <= 30) {
        section = "AC";
      }

      // Format items array for checkout
      const billItems = selectedItems.map(menuItem => {
        const qty = Math.floor(Math.random() * 2) + 1; // Quantity 1 or 2
        const unitPrice = section === "AC" ? Number(menuItem.price_ac) : Number(menuItem.price_general);
        const lineTotal = roundMoney(unitPrice * qty);
        
        // Random split category between 0 and 3 (20% chance of split billing)
        const splitCat = Math.random() < 0.20 ? Math.floor(Math.random() * 3) + 1 : 0;
        const isSeparate = splitCat > 0;

        return {
          item_name: menuItem.name,
          quantity: qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          item_code: menuItem.alpha_code,
          numeric_item_code: menuItem.numeric_code,
          is_separate: isSeparate,
          split_category: splitCat
        };
      });

      // Calculate bill totals using the backend integrity formulas
      const sgstRate = 2.5;
      const cgstRate = 2.5;
      const taxRateSum = sgstRate + cgstRate;
      const scalingFactor = 1 / (1 + taxRateSum / 100);

      const subtotal = roundMoney(
        billItems.reduce((sum, item) => {
          const unitPriceScaled = roundMoney(item.unit_price * scalingFactor);
          const lineTotalScaled = roundMoney(unitPriceScaled * item.quantity);
          return sum + lineTotalScaled;
        }, 0)
      );

      const totalTax = roundMoney(
        billItems.reduce((sum, item) => {
          const unitPriceScaled = roundMoney(item.unit_price * scalingFactor);
          const lineTotalScaled = roundMoney(unitPriceScaled * item.quantity);
          const itemTax = roundMoney(lineTotalScaled * (taxRateSum / 100));
          return sum + itemTax;
        }, 0)
      );

      const sgst = roundMoney(totalTax / 2);
      const cgst = roundMoney(totalTax / 2);
      const taxAmount = roundMoney(sgst + cgst);
      const grandTotal = roundMoney(subtotal + sgst + cgst);

      // Submit checkout request to API
      const billPayload = {
        table_no: tableNo,
        party_no: partyNo,
        section: section,
        track: track,
        clerk_initials: clerk,
        subtotal: subtotal,
        sgst: sgst,
        cgst: cgst,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        bill_date: testDate,
        items: billItems
      };

      const billRes = await fetch(`${baseUrl}/billing/bills`, {
        method: "POST",
        headers,
        body: JSON.stringify(billPayload)
      });

      if (billRes.ok) {
        successfulBills++;
        totalSimulatedAmount += grandTotal;
      } else {
        const errorText = await billRes.text();
        console.error(`⚠️ Failed to create bill #${i} (Table ${tableNo}, Party ${partyNo}):`, errorText);
      }

      if (i % 20 === 0 || i === totalBillsToSimulate) {
        console.log(`   - Progress: Created ${successfulBills}/${i} bills...`);
      }
    }

    console.log(`✅ Simulation complete. Created ${successfulBills} bills totaling Rs. ${totalSimulatedAmount.toFixed(2)}`);

    // 6. Verify Reports and Dashboard Stats
    console.log("\n[6/7] Querying Reports and Dashboards to verify aggregated data...");
    
    // Clerk Stats
    const clerkStatsRes = await fetch(`${baseUrl}/dashboard/clerk-stats?date=${testDate}`, { headers });
    if (clerkStatsRes.ok) {
      const clerkStats = await clerkStatsRes.json();
      console.log("\n📊 --- CLERK STATISTICS ---");
      console.table(clerkStats);
    }

    // Top Selling Items
    const topItemsRes = await fetch(`${baseUrl}/dashboard/top-items?date=${testDate}`, { headers });
    if (topItemsRes.ok) {
      const topItems = await topItemsRes.json();
      console.log("\n🏆 --- TOP SELLING ITEMS ---");
      console.table(topItems);
    }

    // Time-wise sales report
    const timeWiseRes = await fetch(`${baseUrl}/reports/time-wise?startDate=${testDate}&endDate=${testDate}`, { headers });
    if (timeWiseRes.ok) {
      const timeWiseReport = await timeWiseRes.json();
      console.log("\n⏰ --- TIME-WISE SALES SUMMARY ---");
      console.table(timeWiseReport.map(r => ({
        Hour: r.hour_label || r.hour,
        Bills: r.bill_count,
        Sales: r.total_sales
      })));
    }

    // 7. Purge data to clean up
    console.log("\n[7/7] Executing admin purging API to clean up simulated records...");
    const purgeRes = await fetch(`${baseUrl}/billing/bills/purge`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        startDate: testDate,
        endDate: testDate,
        confirmPassword: adminPassword
      })
    });

    if (purgeRes.ok) {
      const purgeData = await purgeRes.json();
      console.log(`✅ Purge successful: ${purgeData.message}`);
    } else {
      const errText = await purgeRes.text();
      console.error("❌ Purging failed:", errText);
    }

  } catch (err) {
    console.error("❌ Simulation encountered an error:", err);
  } finally {
    // Release pg client if checked out
    if (client) {
      try {
        client.release();
        console.log("🧹 Released database client");
      } catch (err) {
        console.error("Warning: Failed to release client:", err.message);
      }
    }
    // Release pool and exit
    console.log("🧹 Closing database pool and exiting...");
    await pool.end();
    console.log("👋 Done!");
    process.exit(0);
  }
}

runSimulation();
