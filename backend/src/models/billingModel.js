const pool = require("../db");
const ShiftModel = require("./shiftModel");

const BillingModel = {
  // Get all bills
  async getAllBills() {
    const result = await pool.query(
      "SELECT * FROM bills ORDER BY created_at DESC",
    );
    return result.rows;
  },

  // Get bill by ID
  async getBillById(billId) {
    const result = await pool.query("SELECT * FROM bills WHERE id = $1", [
      billId,
    ]);
    return result.rows[0];
  },

  // Get bill by number and date
  async getBillByNumber(billNumber, billDate) {
    const result = await pool.query(
      "SELECT * FROM bills WHERE bill_number = $1 AND bill_date = $2",
      [billNumber, billDate],
    );
    return result.rows[0];
  },

  // Get bill items from JSON
  async getBillItems(billId) {
    const result = await pool.query(
      "SELECT items_json FROM bills WHERE id = $1",
      [billId],
    );
    if (result.rows.length > 0 && result.rows[0].items_json) {
      return result.rows[0].items_json;
    }
    return [];
  },

  _getTrackColumn(track) {
    if (track === "`") return "track_morning";
    if (track === "``") return "track_afternoon";
    if (track === "RBS1") return "track_rbs1";
    if (track === "RBS2") return "track_rbs2";
    return "track_morning"; // Fallback
  },

  // Increment and get next bill number using the running_bills table.
  // Auto-resets to 1 each new day: if no finalized bills exist for today on
  // this track, the counter is zeroed so the first bill of the day is always #1.
  // Self-heals: if the counter is behind the actual day-max it syncs up first.
  // Accepts an optional `dbClient` so it can run inside an existing transaction.
  async getNextBillNumber(track, date, dbClient) {
    const colName = this._getTrackColumn(track);
    const db = dbClient || pool; // Use transaction client if provided

    // 1. Check actual max bill_number in bills table for this track on TODAY
    const actualRes = await db.query(
      `SELECT COALESCE(MAX(bill_number), 0) AS actual_max
         FROM bills
         WHERE track = $1 AND bill_date = $2 AND bill_number > 0`,
      [track, date]
    );
    const actualMax = parseInt(actualRes.rows[0]?.actual_max) || 0;

    // 2. If no bills exist for today on this track → new day → reset counter to 0
    if (actualMax === 0) {
      await db.query(
        `UPDATE running_bills SET ${colName} = 0 WHERE id = 1`
      );
    } else {
      // 3. Otherwise, if the running counter is behind reality, sync it up first
      const counterRes = await db.query(
        `SELECT ${colName} AS current_val FROM running_bills WHERE id = 1`
      );
      const counterVal = parseInt(counterRes.rows[0]?.current_val) || 0;
      if (counterVal < actualMax) {
        await db.query(
          `UPDATE running_bills SET ${colName} = $1 WHERE id = 1`,
          [actualMax]
        );
      }
    }

    // 4. Atomically increment and return — first bill of day → counter was 0 → returns 1
    const result = await db.query(
      `UPDATE running_bills SET ${colName} = ${colName} + 1 WHERE id = 1 RETURNING ${colName} AS max_num`
    );
    return parseInt(result.rows[0]?.max_num) || 1;
  },

  // Find an existing provisional bill (bill_number = 0)
  async getProvisionalBill(table_no, party_no, track, clerk_initials, bill_date) {
    let query = `SELECT * FROM bills 
       WHERE table_no = $1 
       AND party_no = $2 
       AND track = $3 
       AND clerk_initials = $4 
       AND bill_number = 0`;
    const params = [parseInt(table_no), party_no, track, clerk_initials];
    if (bill_date) {
      query += ` AND bill_date = $5`;
      params.push(bill_date);
    }
    query += ` ORDER BY created_at DESC LIMIT 1`;
    const result = await pool.query(query, params);
    return result.rows[0];
  },

  // Create a new provisional bill
  async createProvisionalBill(data) {
    const {
      bill_date,
      table_no,
      party_no,
      section,
      track,
      clerk_initials,
      created_at, // Allow explicit timestamp
    } = data;

    // Use provided timestamp or generate one in Node (ms precision) to ensure consistency with orders FK
    const finalCreatedAt = created_at || new Date();

    const result = await pool.query(
      `INSERT INTO bills (
        bill_number, bill_date, table_no, party_no, section, 
        track, clerk_initials, items_json, created_at
      )
      VALUES (0, $1, $2, $3, $4, $5, $6, '[]'::jsonb, $7)
      RETURNING *`,
      [
        bill_date,
        parseInt(table_no),
        party_no,
        section,
        track,
        clerk_initials,
        finalCreatedAt,
      ],
    );
    return result.rows[0];
  },

  // Finalize an existing provisional bill into a real bill
  async finalizeBill(data) {
    const {
      // Keys to find the bill
      provisional_bill_id,

      track,
      clerk_initials,

      // Update data
      bill_date,
      subtotal,
      sgst,
      cgst,
      tax_amount,
      grand_total,
      order_id,
      table_no, // needed for move_orders_to_bill_json
      party_no, // needed for move_orders_to_bill_json
    } = data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Generate real bill number — run INSIDE transaction to prevent race conditions
      const bill_number = await this.getNextBillNumber(track, bill_date, client);

      // 2. Update the existing provisional bill
      // We must match on the explicit ID for safety
      const updateRes = await client.query(
        `UPDATE bills SET
          bill_number = $1,
          bill_date = $2,
          subtotal = $3,
          sgst = $4,
          cgst = $5,
          tax_amount = $6,
          grand_total = $7,
          order_id = $8,
          clerk_initials = $10
        WHERE id = $9 
          AND bill_number = 0 -- Safety check
        RETURNING id`,
        [
          bill_number,
          bill_date,
          subtotal,
          sgst,
          cgst,
          tax_amount,
          grand_total,
          order_id,
          provisional_bill_id, // 9
          clerk_initials,      // 10
        ],
      );

      if (updateRes.rows.length === 0) {
        throw new Error("Provisional bill not found or already finalized.");
      }

      const billId = updateRes.rows[0].id;

      // 3. Move orders to items_json (and clear from orders table)
      // Note: The FK constraint on orders will cascade update if we changed PK, but we didn't change the FK cols.
      // Wait: We didn't change created_at, so FK remains valid.
      // But move_orders_to_bill_json deletes orders. The FK cascade delete might interfere if not handled or if FK is on delete cascade.
      // Actually, standard move logic deletes orders.
      // Deleting orders is fine, that's what we want.

      await client.query("SELECT move_orders_to_bill_json($1, $2, $3)", [
        billId,
        table_no.toString(),
        party_no,
      ]);

      // Load settings to fetch current CGST and SGST rates for this clerk,
      // and dynamically compute the scaling factor to apply to item prices.
      const SettingsModel = require("./settingsModel");
      const settings = await SettingsModel.getSettings(clerk_initials || "CLK");
      const sgstRate = Number(settings?.sgst_percentage || 0);
      const cgstRate = Number(settings?.cgst_percentage || 0);
      const taxRateSum = sgstRate + cgstRate;
      const scalingFactor = 1 / (1 + taxRateSum / 100);

      const finalBillRes = await client.query("SELECT * FROM bills WHERE id = $1", [billId]);
      const finalBill = finalBillRes.rows[0];
      const items = finalBill.items_json || [];

      // Scale unit price and line total for each item in the aggregated list
      const scaledItems = items.map(item => {
        const rawUnitPrice = Number(item.unit_price || item.fixed_price || 0);
        const unitPriceScaled = Number((rawUnitPrice * scalingFactor).toFixed(2));
        const lineTotalScaled = Number((unitPriceScaled * Number(item.quantity || 0)).toFixed(2));
        return {
          ...item,
          original_unit_price: item.original_unit_price || rawUnitPrice,
          fixed_price: unitPriceScaled, // keep them aligned in JSON structure
          actual_price: unitPriceScaled,
          unit_price: unitPriceScaled,
          line_total: lineTotalScaled
        };
      });

      await client.query(
        "UPDATE bills SET items_json = $1 WHERE id = $2",
        [JSON.stringify(scaledItems), billId]
      );

      // Re-fetch the updated bill to return correct items_json to frontend
      const updatedBillRes = await client.query("SELECT * FROM bills WHERE id = $1", [billId]);
      const updatedBill = updatedBillRes.rows[0];

      await client.query("COMMIT");
      return {
        ...updatedBill,
        bill_id: billId,
        message: "Bill finalized successfully",
      };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error in finalizeBill transaction:", err);
      throw err;
    } finally {
      client.release();
    }
  },

  // Retain for compatibility or logic unrelated to main flow
  async createBill(data) {
    // Alias to finalizeBill for now to avoid breaking other calls if any,
    // BUT ideally controller should call finalizeBill explicitly.
    return this.finalizeBill(data);
  },

  async getLastBillNumber(date, track) {
    if (!track) {
      return { last_bill_number: 0 };
    }

    // Read the actual max from the bills table for today — this is always
    // accurate regardless of counter state or daily resets.
    if (date) {
      const result = await pool.query(
        `SELECT COALESCE(MAX(bill_number), 0) AS last_bill_number
           FROM bills
           WHERE track = $1 AND bill_date = $2 AND bill_number > 0`,
        [track, date]
      );
      return result.rows[0] || { last_bill_number: 0 };
    }

    // Fallback: use the running counter if no date given
    const colName = this._getTrackColumn(track);
    const result = await pool.query(
      `SELECT ${colName} AS last_bill_number FROM running_bills WHERE id = 1`
    );
    return result.rows[0] || { last_bill_number: 0 };
  },

  async resetRunningBill(track) {
    const colName = this._getTrackColumn(track);
    await pool.query(`UPDATE running_bills SET ${colName} = 0 WHERE id = 1`);
  },

  /**
   * EOD: Reset ALL four track counters to 0 in a single atomic update.
   */
  async resetAllTrackCounters() {
    await pool.query(
      `UPDATE running_bills
         SET track_morning = 0,
             track_afternoon = 0,
             track_rbs1 = 0,
             track_rbs2 = 0
         WHERE id = 1`
    );
  },

  /**
   * EOD Audit: Return provisional bills that have actual items (unprinted) from pending orders.
   */
  async getUnprintedBillsEOD() {
    const result = await pool.query(
      `SELECT
         b.id,
         o.track,
         o.table_no,
         o.party_no,
         o.clerk_initials,
         o.bill_date,
         o.created_at,
         COUNT(o.id) as item_count,
         json_agg(json_build_object(
             'item_name', o.item_name,
             'quantity', o.quantity,
             'unit_price', o.unit_price,
             'line_total', o.line_total
         ))::jsonb as items_json
       FROM orders o
       LEFT JOIN bills b ON (
         o.table_no = b.table_no 
         AND o.party_no = b.party_no 
         AND o.created_at = b.created_at 
         AND b.bill_number = 0
       )
       WHERE o.track != 'SYS'
       GROUP BY b.id, o.track, o.table_no, o.party_no, o.clerk_initials, o.bill_date, o.created_at
       ORDER BY o.track, o.created_at DESC`
    );
    return result.rows;
  },

  // Get bills by date range
  async getBillsByDateRange(startDate, endDate) {
    const result = await pool.query(
      `SELECT * FROM bills 
       WHERE bill_date BETWEEN $1 AND $2 
       AND bill_number > 0
       ORDER BY created_at DESC`,
      [startDate, endDate],
    );
    return result.rows;
  },

  // Get bills by table
  async getBillsByTable(tableNo) {
    const result = await pool.query(
      "SELECT * FROM bills WHERE table_no = $1 ORDER BY created_at DESC LIMIT 50",
      [tableNo],
    );
    return result.rows;
  },

  // Ensure holding bill (Bill #0) exists for the date
  async ensureHoldingBill(date) {
    const client = await pool.connect();
    try {
      const check = await client.query(
        "SELECT id FROM bills WHERE bill_number = 0 AND bill_date = $1",
        [date],
      );
      if (check.rows.length === 0) {
        await client.query(
          `INSERT INTO bills (
            bill_number, bill_date, table_no, party_no, section, 
            track, clerk_initials, subtotal, sgst, cgst, 
            tax_amount, grand_total, items_json
          ) VALUES (0, $1, NULL, '0', 'SYS', 'SYS', 'SYS', 0, 0, 0, 0, 0, '[]'::jsonb)
          ON CONFLICT (bill_number, bill_date, track) DO NOTHING`,
          [date],
        );
      }
    } finally {
      client.release();
    }
  },
  // Delete all bills (and associated orders) for a given date range
  async deleteBillsByDateRange(startDate, endDate) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Delete orders first
      await client.query(
        "DELETE FROM orders WHERE bill_date BETWEEN $1 AND $2",
        [startDate, endDate],
      );

      // 2. Delete bills
      const result = await client.query(
        "DELETE FROM bills WHERE bill_date BETWEEN $1 AND $2",
        [startDate, endDate],
      );

      await client.query("COMMIT");
      return result.rowCount; // Number of bills deleted
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  // Delete bills (and associated orders) for a given date range AND specific shift (track)
  async deleteBillsByDateRangeAndShift(startDate, endDate, shiftName) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Delete orders for this shift in the date range
      await client.query(
        "DELETE FROM orders WHERE bill_date BETWEEN $1 AND $2 AND track = $3",
        [startDate, endDate, shiftName],
      );

      // 2. Delete bills for this shift in the date range
      const result = await client.query(
        "DELETE FROM bills WHERE bill_date BETWEEN $1 AND $2 AND track = $3",
        [startDate, endDate, shiftName],
      );

      await client.query("COMMIT");
      return result.rowCount;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  // Get total sales per clerk for a specific date
  async getClerkSales(date) {
    const result = await pool.query(
      `SELECT clerk_initials, track, COUNT(*) as bill_count, COALESCE(SUM(CAST(grand_total AS NUMERIC)), 0) as total_sales 
       FROM bills 
       WHERE bill_date::text LIKE $1 || '%' AND bill_number > 0
       GROUP BY clerk_initials, track
       ORDER BY total_sales DESC`,
      [date],
    );
    return result.rows;
  },

  // Get clerk login/logout history by joining shifts and sessions
  async getClerkLoginHistory(date) {
    // Assuming 'sessions' or 'shift_log' table tracks login/logout.
    // If sessions table is used for active state, we might need to check how history is stored.
    // Based on previous context, there is a 'shift_sessions' or similar table.
    // Let's use the 'sessions' table which seems to track this.
    const result = await pool.query(
      `SELECT s.shift_name, s.clerk_initials, s.created_at as login_time, NULL as logout_time 
        FROM sessions s
        WHERE DATE(s.created_at) = $1
        ORDER BY s.created_at DESC`,
      [date],
    );
    return result.rows;
  },
};

module.exports = BillingModel;
