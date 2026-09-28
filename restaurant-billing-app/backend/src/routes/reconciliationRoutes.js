const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

// GET /api/reconciliation/unprinted
router.get("/unprinted", reportController.getUnprintedBills);

// GET /api/reconciliation/running - running (pending) bills derived from orders table
router.get("/running", reportController.getRunningBills);

// DELETE /api/reconciliation/running/table/:tableNo/party/:partyNo - clear a running bill
router.delete(
  "/running/table/:tableNo/party/:partyNo",
  reportController.clearRunningBill
);

module.exports = router;
