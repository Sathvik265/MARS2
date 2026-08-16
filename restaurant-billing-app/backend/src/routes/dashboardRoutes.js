const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

// GET /api/dashboard/top-items
router.get("/top-items", reportController.getTopItems);

// GET /api/dashboard/clerk-stats
router.get("/clerk-stats", reportController.getClerkStats);

module.exports = router;
