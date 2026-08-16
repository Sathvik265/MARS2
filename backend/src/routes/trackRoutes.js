/**
 * trackRoutes.js
 * Handles track-level lockdown management and End-of-Day (EOD) operations.
 * Mounted at /api/tracks in app.js
 */
const express = require("express");
const router = express.Router();
const ShiftModel = require("../models/shiftModel");
const BillingModel = require("../models/billingModel");
const { requireAuth, requireAdminFull } = require("../middleware/auth");

const VALID_TRACKS = ["`", "``", "RBS", "RBS1"];

// ---------------------------------------------------------------------------
// GET /api/tracks/status
// Returns lock status + last bill number for all 4 tracks.
// Accessible to any authenticated user (used by LoginPanel to show lock state).
// ---------------------------------------------------------------------------
router.get("/status", requireAuth, async (req, res) => {
  try {
    const statuses = await ShiftModel.getAllTrackStatuses();
    res.json(statuses);
  } catch (err) {
    console.error("GET /api/tracks/status error:", err);
    res.status(500).json({ detail: "Failed to fetch track statuses" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/tracks/:trackName/lock
// Body: { is_locked: true|false }
// Admin-only. Used by the Track Control dashboard to lock/unlock a track.
// ---------------------------------------------------------------------------
router.patch("/:trackName/lock", requireAdminFull, async (req, res) => {
  try {
    const { trackName } = req.params;
    const { is_locked } = req.body;

    if (!VALID_TRACKS.includes(trackName)) {
      return res
        .status(400)
        .json({ detail: `Invalid track name. Valid: ${VALID_TRACKS.join(", ")}` });
    }

    if (typeof is_locked !== "boolean") {
      return res
        .status(400)
        .json({ detail: "is_locked must be a boolean (true or false)" });
    }

    const updated = await ShiftModel.setTrackLocked(trackName, is_locked);
    if (!updated) {
      return res
        .status(404)
        .json({ detail: `No session found for track '${trackName}'` });
    }

    res.json({
      message: `Track '${trackName}' ${is_locked ? "locked" : "unlocked"} successfully`,
      track: updated,
    });
  } catch (err) {
    console.error("PATCH /api/tracks/:trackName/lock error:", err);
    res.status(500).json({ detail: "Failed to update track lock status" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tracks/eod-audit
// Admin-only. Returns all unprinted bills (bill_number=0 with items) grouped
// by track. To be reviewed before confirming EOD reset.
// ---------------------------------------------------------------------------
router.get("/eod-audit", requireAdminFull, async (req, res) => {
  try {
    const unprinted = await BillingModel.getUnprintedBillsEOD();

    // Group by track for the UI
    const grouped = {};
    for (const bill of unprinted) {
      if (!grouped[bill.track]) {
        grouped[bill.track] = [];
      }
      grouped[bill.track].push(bill);
    }

    res.json({
      total_unprinted: unprinted.length,
      by_track: grouped,
      bills: unprinted,
    });
  } catch (err) {
    console.error("GET /api/tracks/eod-audit error:", err);
    res.status(500).json({ detail: "Failed to fetch EOD audit data" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/tracks/eod-reset
// Admin-only. Resets all 4 running_bills counters to 0.
// Requires body: { confirm: true } as a safety check.
// ---------------------------------------------------------------------------
router.post("/eod-reset", requireAdminFull, async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== true) {
      return res.status(400).json({
        detail: "Must send { confirm: true } to perform EOD reset",
      });
    }

    // Run audit first to include in response
    const unprinted = await BillingModel.getUnprintedBillsEOD();

    // Reset all counters
    await BillingModel.resetAllTrackCounters();

    // Optionally snapshot the last bill number into sessions (for record-keeping)
    const tracks = VALID_TRACKS;
    for (const track of tracks) {
      try {
        await ShiftModel.setTrackLocked(track, true);
      } catch (e) {
        // Non-fatal – track may not have a session yet
        console.warn(`Could not lock track '${track}' during EOD reset:`, e.message);
      }
    }

    res.json({
      message: "EOD reset complete. All bill counters reset to 0. All tracks locked.",
      unprinted_at_reset: unprinted.length,
      reset_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("POST /api/tracks/eod-reset error:", err);
    res.status(500).json({ detail: "Failed to perform EOD reset" });
  }
});

module.exports = router;
