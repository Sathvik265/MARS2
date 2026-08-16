const express = require("express");
const router = express.Router();
const shiftController = require("../controllers/shiftController"); // Import shiftController
const {
  requireAdminAny,
  requireSessionCloseAccess,
} = require("../middleware/auth");

// Shift routes
router.get("/shifts", shiftController.getAllShifts);
router.get("/shifts/:shiftName", shiftController.getShiftByName);

// Session routes
router.get("/sessions", shiftController.getAllSessions);
router.get("/sessions/:sessionId", shiftController.getSessionById);
router.post("/sessions", requireAdminAny, shiftController.createSession);
router.put(
  "/sessions/:sessionId/close",
  requireSessionCloseAccess,
  shiftController.closeSession,
);
router.get("/sessions/open/all", shiftController.getOpenSessions);
router.get("/sessions/date/:date", shiftController.getSessionsByDate);
router.get("/current-shift", shiftController.getCurrentShiftType);
router.post(
  "/sessions/ensure-all-exist",
  requireAdminAny,
  shiftController.ensureAllShiftSessionsExist,
); // Renamed route

// New route to reopen a session
router.put("/sessions/:sessionId/reopen", requireAdminAny, shiftController.reopenSession);

module.exports = router;
