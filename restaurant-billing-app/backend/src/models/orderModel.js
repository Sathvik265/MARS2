const pool = require("../db");

const OrderModel = {
  // Create a new order
  async createOrder(orderData) {
    const {
      track,
      clerk_initials,
      table_no,
      party_no = "1",
      bill_number,
      bill_date,
      item_code,
      numeric_item_code,
      item_name,
      quantity,
      unit_price,
      line_total,
      created_at, // IMPORTANT: Must enable passing this to match Bill's timestamp (FK)
      is_separate,
    } = orderData;

    // Default bill_date to current date if not provided
    const finalBillDate = bill_date || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    // If created_at is provided, we MUST use it. Otherwise default to database default (which might fail FK if no matching bill exists)
    // We include it in columns.

    // Check if created_at is passed. If so, insert it.
    let query, params;

    if (created_at) {
      query = `INSERT INTO orders (
            track, clerk_initials, table_no, party_no, bill_number, bill_date,
            item_code, numeric_item_code, item_name, quantity, unit_price, line_total, created_at, is_separate
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *`;
      params = [
        track,
        clerk_initials,
        table_no,
        party_no,
        bill_number,
        finalBillDate,
        item_code,
        numeric_item_code,
        item_name,
        quantity,
        unit_price,
        line_total,
        created_at,
        is_separate === true,
      ];
    } else {
      query = `INSERT INTO orders (
            track, clerk_initials, table_no, party_no, bill_number, bill_date,
            item_code, numeric_item_code, item_name, quantity, unit_price, line_total, is_separate
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *`;
      params = [
        track,
        clerk_initials,
        table_no,
        party_no,
        bill_number,
        finalBillDate,
        item_code,
        numeric_item_code,
        item_name,
        quantity,
        unit_price,
        line_total,
        is_separate === true,
      ];
    }

    const result = await pool.query(query, params);
    return result.rows[0];
  },

  // Bulk create orders for faster finalization
  async bulkCreateOrders(ordersArray) {
    if (!ordersArray || ordersArray.length === 0) return [];

    const finalBillDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const values = [];
    const params = [];
    let paramIndex = 1;

    for (const orderData of ordersArray) {
      const {
        track, clerk_initials, table_no, party_no = "1", bill_number, bill_date,
        item_code, numeric_item_code, item_name, quantity, unit_price, line_total, created_at, is_separate
      } = orderData;

      const dateToUse = bill_date || finalBillDate;

      if (created_at) {
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(
          track, clerk_initials, table_no, party_no, bill_number, dateToUse,
          item_code, numeric_item_code, item_name, quantity, unit_price, line_total, created_at, is_separate === true
        );
      } else {
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, DEFAULT, $${paramIndex++})`);
        params.push(
          track, clerk_initials, table_no, party_no, bill_number, dateToUse,
          item_code, numeric_item_code, item_name, quantity, unit_price, line_total, is_separate === true
        );
      }
    }

    const query = `
      INSERT INTO orders (
        track, clerk_initials, table_no, party_no, bill_number, bill_date,
        item_code, numeric_item_code, item_name, quantity, unit_price, line_total, created_at, is_separate
      )
      VALUES ${values.join(', ')}
      RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows;
  },

  // Get pending orders by table and party
  async getPendingOrdersByTableAndParty(table_no, party_no) {
    const result = await pool.query(
      "SELECT * FROM orders WHERE table_no = $1 AND party_no = $2 ORDER BY created_at",
      [table_no, party_no]
    );
    return result.rows;
  },

  // Get pending orders by table
  async getPendingOrdersByTable(table_no) {
    const result = await pool.query(
      "SELECT * FROM orders WHERE table_no = $1 ORDER BY party_no, created_at",
      [table_no]
    );
    return result.rows;
  },

  // Get all pending orders
  async getAllPendingOrders() {
    const result = await pool.query(
      "SELECT * FROM orders ORDER BY table_no, party_no, created_at"
    );
    return result.rows;
  },

  // Clear orders for a table/party
  async clearOrders(table_no, party_no) {
    await pool.query(
      "DELETE FROM orders WHERE table_no = $1 AND party_no = $2",
      [table_no, party_no]
    );
  },

  // Delete a specific order
  async deleteOrder(orderId) {
    await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
  },

  // Update order quantity and split status
  async updateOrder(orderId, newQuantity, newLineTotal, is_separate) {
    const result = await pool.query(
      `UPDATE orders 
       SET quantity = $1, line_total = $2, is_separate = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [newQuantity, newLineTotal, is_separate === true, orderId]
    );
    return result.rows[0];
  },

  // Move an order to another table/party
  async moveOrder(orderId, targetTableNo, targetPartyNo, targetCreatedAt, targetTrack, targetClerk) {
    const result = await pool.query(
      `UPDATE orders 
       SET table_no = $1, party_no = $2, created_at = $3, track = $4, clerk_initials = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [parseInt(targetTableNo, 10), targetPartyNo, targetCreatedAt, targetTrack, targetClerk, orderId]
    );
    return result.rows[0];
  },


  // Get order by ID
  async getOrderById(orderId) {
    const result = await pool.query("SELECT * FROM orders WHERE id = $1", [
      orderId,
    ]);
    return result.rows[0];
  },

  // Get total for pending orders
  async getOrdersTotal(table_no, party_no) {
    const result = await pool.query(
      `SELECT 
        COALESCE(SUM(line_total), 0) as total,
        COUNT(*) as item_count
       FROM orders 
       WHERE table_no = $1 AND party_no = $2`,
      [table_no, party_no]
    );
    return result.rows[0];
  },

  // Get orders by track and clerk
  async getOrdersByTrackAndClerk(track, clerk_initials) {
    const result = await pool.query(
      "SELECT * FROM orders WHERE track = $1 AND clerk_initials = $2 ORDER BY created_at DESC",
      [track, clerk_initials]
    );
    return result.rows;
  },
};

module.exports = OrderModel;
