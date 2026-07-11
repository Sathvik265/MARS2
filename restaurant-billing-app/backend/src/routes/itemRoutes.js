const express = require("express");
const router = express.Router();
const ItemModel = require("../models/itemModel");
const { requireAdminFull } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const items = await ItemModel.getAllItems();
    res.json(items);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch items", details: error.message });
  }
});

router.get("/separate", async (req, res) => {
  try {
    const items = await ItemModel.getSeparateItems();
    res.json(items);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch separate items",
      details: error.message,
    });
  }
});

router.get("/regular", async (req, res) => {
  try {
    const items = await ItemModel.getRegularItems();
    res.json(items);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch regular items", details: error.message });
  }
});

// Get all unique item names for dropdown (MUST be before /:id)
router.get("/names/all", async (req, res) => {
  try {
    const names = await ItemModel.getAllItemNames();
    res.json(names);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch item names", details: error.message });
  }
});

// Get all unique categories for dropdown (MUST be before /:id)
router.get("/categories/all", async (req, res) => {
  try {
    const categories = await ItemModel.getAllCategories();
    res.json(categories);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch categories", details: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await ItemModel.getItemById(req.params.id);
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ error: "Item not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch item", details: error.message });
  }
});

router.post("/bulk-update", requireAdminFull, async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Expected an array of items" });
    }

    const results = [];
    for (const itemData of items) {
      const alphaCode = itemData.alpha_code ? String(itemData.alpha_code).trim().toUpperCase() : null;
      const numericCode = itemData.numeric_code ? String(itemData.numeric_code).trim() : null;

      let existingItem = null;
      if (alphaCode) {
        existingItem = await ItemModel.getItemByCode(alphaCode);
      }
      if (!existingItem && numericCode) {
        existingItem = await ItemModel.getItemByCode(numericCode);
      }

      if (existingItem) {
        const payload = {
          name: itemData.name || existingItem.name,
          alpha_code: alphaCode || existingItem.alpha_code,
          numeric_code: numericCode || existingItem.numeric_code,
          price_fixed: parseFloat(itemData.price_fixed) !== undefined && !isNaN(parseFloat(itemData.price_fixed)) ? parseFloat(itemData.price_fixed) : existingItem.price_fixed,
          price_general: parseFloat(itemData.price_general) !== undefined && !isNaN(parseFloat(itemData.price_general)) ? parseFloat(itemData.price_general) : existingItem.price_general,
          price_ac: parseFloat(itemData.price_ac) !== undefined && !isNaN(parseFloat(itemData.price_ac)) ? parseFloat(itemData.price_ac) : existingItem.price_ac,
          category: existingItem.category,
          is_separate: itemData.is_separate !== undefined ? itemData.is_separate : existingItem.is_separate,
          split_category: itemData.split_category !== undefined ? parseInt(itemData.split_category, 10) : (existingItem.split_category || 0),
        };
        const updated = await ItemModel.updateItem(existingItem.id, payload);
        results.push(updated);
      } else {
        const payload = {
          name: itemData.name || "Unknown Item",
          alpha_code: alphaCode,
          numeric_code: numericCode,
          price_fixed: parseFloat(itemData.price_fixed) || 0,
          price_general: parseFloat(itemData.price_general) || 0,
          price_ac: parseFloat(itemData.price_ac) || 0,
          category: { qty: 1, name: "General" },
          is_separate: itemData.is_separate === true || (parseInt(itemData.split_category, 10) > 0),
          split_category: parseInt(itemData.split_category, 10) || 0,
        };
        const inserted = await ItemModel.createItem(payload);
        results.push(inserted);
      }
    }

    res.json({ message: "Bulk update complete", count: results.length });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({ error: "Failed to perform bulk update", details: error.message });
  }
});

router.post("/", requireAdminFull, async (req, res) => {
  try {
    const item = await ItemModel.createItem(req.body);
    res.status(201).json(item);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to create item", details: error.message });
  }
});

router.put("/:id", requireAdminFull, async (req, res) => {
  try {
    const item = await ItemModel.updateItem(req.params.id, req.body);
    res.json(item);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update item", details: error.message });
  }
});

router.patch("/:id/separate", requireAdminFull, async (req, res) => {
  try {
    const { is_separate } = req.body;
    const item = await ItemModel.updateItemSeparate(req.params.id, is_separate);
    res.json(item);
  } catch (error) {
    res.status(500).json({
      error: "Failed to update item separate status",
      details: error.message,
    });
  }
});

router.patch("/:id/split-category", requireAdminFull, async (req, res) => {
  try {
    const { split_category } = req.body;
    const catVal = parseInt(split_category, 10);
    if (isNaN(catVal) || catVal < 0) {
      return res.status(400).json({ error: "Invalid split category" });
    }
    const item = await ItemModel.updateItemSplitCategory(req.params.id, catVal);
    res.json(item);
  } catch (error) {
    res.status(500).json({
      error: "Failed to update item split category",
      details: error.message,
    });
  }
});

router.delete("/:id", requireAdminFull, async (req, res) => {
  try {
    await ItemModel.deleteItem(req.params.id);
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to delete item", details: error.message });
  }
});

router.get("/search/:term", async (req, res) => {
  try {
    const items = await ItemModel.searchItems(req.params.term);
    res.json(items);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to search items", details: error.message });
  }
});

module.exports = router;
