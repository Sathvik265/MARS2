const pool = require("../db");

const ItemModel = {
  // Get all items
  async getAllItems() {
    const result = await pool.query("SELECT * FROM items ORDER BY name");
    return result.rows;
  },

  // Get item by ID
  async getItemById(id) {
    const result = await pool.query("SELECT * FROM items WHERE id = $1", [id]);
    return result.rows[0];
  },

  // Get item by code
  async getItemByCode(code) {
    const result = await pool.query(
      "SELECT * FROM items WHERE alpha_code = $1 OR CAST(numeric_code AS TEXT) = $1",
      [code],
    );
    return result.rows[0];
  },

  // Create new item
  async createItem(itemData) {
    const {
      name,
      alpha_code,
      numeric_code,
      price_fixed,
      price_general,
      price_ac,
      category,
      is_separate = false,
      split_category = 0,
    } = itemData;

    // Ensure category is a valid JSON array or object string if passed as string
    // If it's already an object/array, pg will handle it for JSONB

    const finalIsSeparate = split_category > 0 || is_separate;

    const result = await pool.query(
      `INSERT INTO items (
        name, alpha_code, numeric_code, price_fixed, 
        price_general, price_ac, category, is_separate, split_category
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        name,
        alpha_code,
        numeric_code,
        price_fixed,
        price_general,
        price_ac,
        category,
        finalIsSeparate,
        split_category,
      ],
    );
    return result.rows[0];
  },

  // Update item
  async updateItem(id, itemData) {
    const {
      name,
      alpha_code,
      numeric_code,
      price_fixed,
      price_general,
      price_ac,
      category,
      is_separate,
      split_category = 0,
    } = itemData;

    const finalIsSeparate = split_category > 0 || is_separate;

    const result = await pool.query(
      `UPDATE items 
       SET name = $1, alpha_code = $2, numeric_code = $3,
           price_fixed = $4, price_general = $5, price_ac = $6,
           category = $7, is_separate = $8, split_category = $9
       WHERE id = $10
       RETURNING *`,
      [
        name,
        alpha_code,
        numeric_code,
        price_fixed,
        price_general,
        price_ac,
        category,
        finalIsSeparate,
        split_category,
        id,
      ],
    );
    return result.rows[0];
  },

  // Update item separate status
  async updateItemSeparate(id, is_separate) {
    const split_category = is_separate ? 1 : 0;
    const result = await pool.query(
      `UPDATE items SET is_separate = $1, split_category = $2 WHERE id = $3 RETURNING *`,
      [is_separate, split_category, id],
    );
    return result.rows[0];
  },

  // Update item split category
  async updateItemSplitCategory(id, split_category) {
    const is_separate = split_category > 0;
    const result = await pool.query(
      `UPDATE items SET split_category = $1, is_separate = $2 WHERE id = $3 RETURNING *`,
      [split_category, is_separate, id],
    );
    return result.rows[0];
  },

  // Delete item
  async deleteItem(id) {
    await pool.query("DELETE FROM items WHERE id = $1", [id]);
  },

  // Get items by category - DEPRECATED/MODIFIED behavior
  // Since category is now JSON, exact match might not work as before.
  // This function might need to be updated to search within the JSON if needed.
  // For now, we'll keep it but it might return empty if passed a simple string that doesn't match the JSON structure.
  async getItemsByCategory(category) {
    // Assuming we might want to find items that contain a specific category name in the JSON array
    // Example JSON: [{"name": "Idli", "qty": 1}]
    const result = await pool.query(
      "SELECT * FROM items WHERE category @> $1::jsonb ORDER BY name",
      [JSON.stringify([{ name: category }])],
      // This assumes we are looking for an exact match of an object in the array
      // A better approach might be needed depending on frontend usage
    );
    return result.rows;
  },

  // Get separate items
  async getSeparateItems() {
    const result = await pool.query(
      "SELECT * FROM items WHERE is_separate = true ORDER BY name",
    );
    return result.rows;
  },

  // Get regular items
  async getRegularItems() {
    const result = await pool.query(
      "SELECT * FROM items WHERE is_separate = false ORDER BY name",
    );
    return result.rows;
  },

  // Search items
  async searchItems(searchTerm) {
    const result = await pool.query(
      `SELECT * FROM items 
       WHERE name ILIKE $1 
          OR alpha_code ILIKE $1 
          OR CAST(numeric_code AS TEXT) ILIKE $1
       ORDER BY name`,
      [`%${searchTerm}%`],
    );
    return result.rows;
  },

  // Get all unique item names for dropdown
  async getAllItemNames() {
    const result = await pool.query(
      `SELECT DISTINCT name FROM items ORDER BY name`,
    );
    return result.rows.map((row) => row.name);
  },

  // Get all unique categories for dropdown
  async getAllCategories() {
    const result = await pool.query(
      `SELECT DISTINCT category::text as category 
       FROM items 
       WHERE category IS NOT NULL AND category::text != 'null'
       ORDER BY category`,
    );
    // Extract category names from JSON if needed
    const categories = result.rows.map((row) => {
      try {
        const parsed = JSON.parse(row.category);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) {
          return parsed[0].name;
        }
        return row.category;
      } catch {
        return row.category;
      }
    });
    // Return unique values
    return [...new Set(categories)];
  },
};

module.exports = ItemModel;
