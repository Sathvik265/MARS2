const express = require("express");
const router = express.Router();
const billingController = require("../controllers/billingController");
const { requireAdminFull } = require("../middleware/auth");

// Bill routes
router.get("/bills", billingController.getAllBills);
router.get("/bills/:billId", billingController.getBillById);
router.get(
  "/bills/number/:billNumber/date/:billDate",
  billingController.getBillByNumber,
);
router.get("/bills/:billId/items", billingController.getBillItems);
router.get("/bills/last-number/:date", billingController.getLastBillNumber);
router.post("/bills", billingController.createBill);

router.post("/bills/purge", requireAdminFull, billingController.purgeBills);
router.post("/bills/purge-shift", requireAdminFull, billingController.purgeShiftBills);

router.get(
  "/bills/date-range/:startDate/:endDate",
  billingController.getBillsByDateRange,
);

// Order routes
router.get("/orders", billingController.getAllPendingOrders);
router.get("/orders/table/:tableNo", billingController.getOrdersByTable);
router.get(
  "/orders/table/:tableNo/party/:partyNo",
  billingController.getOrdersByTableAndParty,
);
router.post("/orders", billingController.createOrder);
router.put("/orders/:orderId", billingController.updateOrder);
router.post("/orders/:orderId/move", billingController.moveOrder);
router.delete("/orders/:orderId", billingController.deleteOrder);
router.delete(
  "/orders/table/:tableNo/party/:partyNo",
  billingController.clearOrders,
);
router.get("/orders/total/:tableNo/:partyNo", billingController.getOrdersTotal);

module.exports = router;
