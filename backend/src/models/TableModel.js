const pool = require("../db");

const TableModel = {
  // Get all tables
  async getAllTables() {
    const result = await pool.query("SELECT * FROM tables ORDER BY table_id");
    return result.rows;
  },

  // Get table by ID
  async getTableById(tableId) {
    const result = await pool.query(
      "SELECT * FROM tables WHERE table_id = $1",
      [tableId]
    );
    return result.rows[0];
  },

  // Get tables by section
  async getTablesBySection(sectionName) {
    const result = await pool.query(
      "SELECT * FROM tables WHERE section_name = $1 ORDER BY table_id",
      [sectionName]
    );
    return result.rows;
  },

  // Get table status
  async getTableStatus() {
    const result = await pool.query("SELECT * FROM table_status");
    return result.rows;
  },

  // Update table section
  async updateTableSection(tableId, sectionName) {
    const result = await pool.query(
      `UPDATE tables 
       SET section_name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE table_id = $2
       RETURNING *`,
      [sectionName, tableId]
    );
    return result.rows[0];
  },
};

module.exports = TableModel;
