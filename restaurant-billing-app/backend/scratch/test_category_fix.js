const pool = require('../src/db');

async function test() {
  console.log("=== Testing Category Fix ===");
  const testName = "TEMP_TEST_ITEM_999";
  
  // Clean up any old test items first
  await pool.query("DELETE FROM items WHERE name = $1", [testName]);

  // 1. Simulating POST /api/menu (creating item)
  // Incoming category is a plain string: "Dessert"
  const categoryStr = "Dessert";
  let categoryJson = JSON.stringify([{ qty: 1, name: categoryStr.trim() }]);
  
  console.log("Inserting test item...");
  let insertRes = await pool.query(
    `INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate)
     VALUES ($1, 'ZZZ', 999, 10.0, 10.0, 10.0, $2, false) RETURNING *`,
    [testName, categoryJson]
  );
  
  const insertedId = insertRes.rows[0].id;
  console.log("Inserted category in DB:", insertRes.rows[0].category);

  // 2. Simulating PUT /api/menu/:id (updating other details, category is sent back as JSON string)
  // This is what the frontend does. It loads the category from the DB and sends it back on update.
  const incomingCategoryFromFrontend = insertRes.rows[0].category; // "[{\"qty\":1,\"name\":\"Dessert\"}]"
  
  // Apply our new app.js logic on the incoming value:
  let updatedCategoryJson;
  if (typeof incomingCategoryFromFrontend === "string" && incomingCategoryFromFrontend.trim()) {
    const trimmed = incomingCategoryFromFrontend.trim();
    let isJson = false;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (typeof parsed === "object" || Array.isArray(parsed))) {
        updatedCategoryJson = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
        isJson = true;
      }
    } catch (e) {
      // Not JSON
    }
    if (!isJson) {
      updatedCategoryJson = JSON.stringify([{ qty: 1, name: trimmed }]);
    }
  }

  console.log("Simulating item update with same category string...");
  let updateRes = await pool.query(
    `UPDATE items SET category = $1 WHERE id = $2 RETURNING *`,
    [updatedCategoryJson, insertedId]
  );
  
  console.log("Updated category in DB:", updateRes.rows[0].category);
  
  if (updateRes.rows[0].category === insertRes.rows[0].category) {
    console.log("SUCCESS: Category was NOT double-wrapped!");
  } else {
    console.error("FAIL: Category was double-wrapped! Old:", insertRes.rows[0].category, "New:", updateRes.rows[0].category);
  }

  // 3. Simulating item update with a NEW category string
  const incomingNewCategory = "Sweet Dessert";
  let finalCategoryJson;
  if (typeof incomingNewCategory === "string" && incomingNewCategory.trim()) {
    const trimmed = incomingNewCategory.trim();
    let isJson = false;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (typeof parsed === "object" || Array.isArray(parsed))) {
        finalCategoryJson = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
        isJson = true;
      }
    } catch (e) {
      // Not JSON
    }
    if (!isJson) {
      finalCategoryJson = JSON.stringify([{ qty: 1, name: trimmed }]);
    }
  }

  console.log("Simulating item update with new plain category string...");
  let updateRes2 = await pool.query(
    `UPDATE items SET category = $1 WHERE id = $2 RETURNING *`,
    [finalCategoryJson, insertedId]
  );
  
  console.log("Updated new category in DB:", updateRes2.rows[0].category);
  
  const expectedNew = JSON.stringify([{ qty: 1, name: "Sweet Dessert" }]);
  if (updateRes2.rows[0].category === expectedNew) {
    console.log("SUCCESS: Plain string was correctly wrapped!");
  } else {
    console.error("FAIL: Plain string was NOT correctly wrapped! Expected:", expectedNew, "Got:", updateRes2.rows[0].category);
  }

  // Cleanup
  await pool.query("DELETE FROM items WHERE id = $1", [insertedId]);
  console.log("Cleanup complete.");
  pool.end();
}

test().catch((err) => {
  console.error(err);
  pool.end();
});
