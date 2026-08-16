const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

// GET /api/reconciliation/unprinted
router.get("/unprinted", reportController.getUnprintedBills);

// GET /api/reconciliation/running - running (pending) bills derived from orders table
router.get("/running", reportController.getRunningBills);

module.exports = router;
