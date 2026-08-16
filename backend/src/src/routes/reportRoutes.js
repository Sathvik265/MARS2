const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

// Time range report
router.get("/time-range", reportController.getTimeRangeReport);

// Date range report
router.get("/date-range", reportController.getDateRangeReport);

// Shift-specific report
router.get("/by-shift", reportController.getShiftReport);
router.get("/shift-summary", reportController.getShiftSummaryReport);
router.get("/shift-detailed", reportController.getShiftDetailedReport);
router.get("/shift-only", reportController.getShiftOnlyReport);

// Reports for frontend component
router.get("/shift-wise", reportController.getShiftWiseReport);
router.get("/time-wise", reportController.getTimeWiseReport);
router.get("/item-wise", reportController.getItemWiseReport);

// Advanced item report with shift breakdown
router.get("/by-item", reportController.getItemReport);

// Category totals report
router.get("/category-totals", reportController.getCategoryTotals);

// Category report (items breakdown by category)
router.get("/category-report", reportController.getCategoryReport);

module.exports = router;
