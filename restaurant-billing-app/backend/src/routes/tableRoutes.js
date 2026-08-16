const express = require("express");
const router = express.Router();
const TableModel = require("../models/TableModel");
const { requireAdminAny } = require("../middleware/auth");

router.get("/tables", async (req, res) => {
  try {
    const tables = await TableModel.getAllTables();
    res.json(tables);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch tables", details: error.message });
  }
});

router.get("/tables/status", async (req, res) => {
  try {
    const status = await TableModel.getTableStatus();
    res.json(status);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch table status", details: error.message });
  }
});

router.get("/tables/:tableId", async (req, res) => {
  try {
    const table = await TableModel.getTableById(req.params.tableId);
    if (table) {
      res.json(table);
    } else {
      res.status(404).json({ error: "Table not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch table", details: error.message });
  }
});

router.get("/tables/section/:sectionName", async (req, res) => {
  try {
    const tables = await TableModel.getTablesBySection(req.params.sectionName);
    res.json(tables);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch tables", details: error.message });
  }
});

router.put("/tables/:tableId", requireAdminAny, async (req, res) => {
  try {
    const { section_name } = req.body;
    const table = await TableModel.updateTableSection(
      req.params.tableId,
      section_name
    );
    res.json(table);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to update table", details: error.message });
  }
});

module.exports = router;
