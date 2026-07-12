/**
 * TrackControl.js
 * Admin-full only component providing:
 *  1. Track Lockdown Panel  — view & toggle is_locked per track
 *  2. End-of-Day Audit & Reset — inspect unprinted bills then reset counters
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Loader2,
} from "../ui/UIComponents";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/Table";
import { getTrackStatuses, setTrackLock, getEODAudit, triggerEODReset } from "../../services/api";
import { toast, safeArray, safeObject, formatDateToDDMMYYYY, getFriendlyShiftName } from "../../utils/helpers";

// Friendly display labels for each track identifier
const TRACK_LABELS = {
  "`": "Track 1 (Morning)",
  "``": "Track 2 (Afternoon)",
  RBS: "Track 3 (Evening)",
  RBS1: "Track 4 (Night)",
};

const ALL_TRACKS = ["`", "``", "RBS", "RBS1"];

// ---------------------------------------------------------------------------
// TrackLockdownPanel
// ---------------------------------------------------------------------------
function TrackLockdownPanel() {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [togglingTrack, setTogglingTrack] = useState(null);

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTrackStatuses();
      setStatuses(safeArray(data));
    } catch (err) {
      console.error("Failed to load track statuses:", err);
      toast.error("Failed to load track statuses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const handleToggleLock = async (track, currentlyLocked) => {
    setTogglingTrack(track);
    try {
      await setTrackLock(track, !currentlyLocked);
      toast.success(
        `Track "${TRACK_LABELS[track] || track}" ${!currentlyLocked ? "locked" : "unlocked"} successfully.`
      );
      await loadStatuses();
    } catch (err) {
      console.error("Failed to toggle lock:", err);
      const msg =
        err?.response?.data?.detail || "Failed to update lock status";
      toast.error(msg);
    } finally {
      setTogglingTrack(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <CardTitle>Track Lockdown Control</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStatuses}
            disabled={loading}
            id="btn-refresh-track-statuses"
          >
            {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1rem" }}>
          When a clerk logs out, their track is automatically locked. Use the
          toggles below to unlock a track so clerks can re-access it.
          Admins can always log in regardless of lock status.
        </p>

        {loading && statuses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <Loader2 size={24} className="animate-spin mb-2" />
            <p>Loading track statuses…</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Track</TableHead>
                <TableHead>Session Status</TableHead>
                <TableHead>Lock State</TableHead>
                <TableHead>Last Bill #</TableHead>
                <TableHead>Active Clerk</TableHead>
                <TableHead style={{ textAlign: "right" }}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ALL_TRACKS.map((trackId) => {
                const row = statuses.find((s) => s.shift_name === trackId);
                const isLocked = row ? !!row.is_locked : false;
                const sessionStatus = row?.status || "—";
                const lastBillNo = row?.last_bill_number ?? "—";
                const clerInitials = row?.clerk_initials || "—";
                const isToggling = togglingTrack === trackId;

                return (
                  <TableRow key={trackId}>
                    <TableCell>
                      <span style={{ fontWeight: 600 }}>
                        {TRACK_LABELS[trackId] || getFriendlyShiftName(trackId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background:
                            sessionStatus === "OPEN" ? "#dcfce7" : "#fee2e2",
                          color:
                            sessionStatus === "OPEN" ? "#166534" : "#991b1b",
                        }}
                      >
                        {sessionStatus}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isLocked ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "0.375rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: "#fdf4ff",
                            color: "#6b21a8",
                          }}
                        >
                          🔒 Locked
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "0.375rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: "#f0fdf4",
                            color: "#166534",
                          }}
                        >
                          🟢 Unlocked
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span style={{ fontWeight: 600 }}>{lastBillNo}</span>
                    </TableCell>
                    <TableCell>{clerInitials}</TableCell>
                    <TableCell style={{ textAlign: "right" }}>
                      {row ? (
                        <Button
                          size="sm"
                          variant={isLocked ? "default" : "outline"}
                          onClick={() => handleToggleLock(trackId, isLocked)}
                          disabled={isToggling}
                          id={`btn-lock-${trackId.replace(/`/g, "bt")}`}
                          style={{
                            background: isLocked ? "#7c3aed" : undefined,
                            color: isLocked ? "white" : undefined,
                            minWidth: "7rem",
                          }}
                        >
                          {isToggling ? (
                            <Loader2 size={14} className="animate-spin mr-1" />
                          ) : null}
                          {isLocked ? "🔓 Unlock Track" : "🔒 Lock Track"}
                        </Button>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                          No session
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// EODAuditPanel
// ---------------------------------------------------------------------------
function EODAuditPanel({ onResetComplete }) {
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const runAudit = async () => {
    setAuditLoading(true);
    setConfirmed(false);
    try {
      const data = await getEODAudit();
      setAuditData(safeObject(data));
    } catch (err) {
      console.error("EOD audit failed:", err);
      toast.error(err?.response?.data?.detail || "Failed to fetch EOD audit");
    } finally {
      setAuditLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }

    setResetting(true);
    try {
      const result = await triggerEODReset();
      toast.success(result.message || "EOD reset complete!");
      setAuditData(null);
      setConfirmed(false);
      if (onResetComplete) onResetComplete();
    } catch (err) {
      console.error("EOD reset failed:", err);
      toast.error(err?.response?.data?.detail || "EOD reset failed");
    } finally {
      setResetting(false);
    }
  };

  const unprintedByTrack = auditData?.by_track || {};
  const totalUnprinted = auditData?.total_unprinted ?? null;

  return (
    <Card style={{ borderColor: "#fbbf24", background: "#fffbeb" }}>
      <CardHeader>
        <CardTitle style={{ color: "#92400e" }}>
          📅 End-of-Day Audit &amp; Reset
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: "0.85rem", color: "#78350f", marginBottom: "1rem" }}>
          Run the audit to view all unprinted (pending) bills before closing the
          day. Then use <strong>Close Day</strong> to reset all bill counters to
          0 and lock all tracks.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          <Button
            onClick={runAudit}
            disabled={auditLoading}
            variant="outline"
            id="btn-run-eod-audit"
            style={{ borderColor: "#d97706", color: "#92400e" }}
          >
            {auditLoading ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : null}
            🔍 Run EOD Audit
          </Button>

          {auditData !== null && (
            <Button
              onClick={handleReset}
              disabled={resetting}
              id="btn-eod-reset"
              style={{
                background: confirmed ? "#dc2626" : "#f59e0b",
                color: "white",
                minWidth: "10rem",
              }}
            >
              {resetting ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : null}
              {confirmed
                ? "⚠ Confirm Close Day"
                : "🗓 Close Day (Reset Counters)"}
            </Button>
          )}

          {confirmed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmed(false)}
              style={{ color: "#6b7280" }}
            >
              Cancel
            </Button>
          )}
        </div>

        {confirmed && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: "0.375rem",
              padding: "0.75rem 1rem",
              color: "#991b1b",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            <strong>⚠ Warning:</strong> This will reset all bill counters to 0
            and lock all tracks. This action cannot be undone. Click{" "}
            <strong>Confirm Close Day</strong> to proceed.
          </div>
        )}

        {auditData !== null && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.75rem",
              }}
            >
              <h4 style={{ fontWeight: 700, color: "#92400e", margin: 0 }}>
                Audit Results
              </h4>
              <span
                style={{
                  padding: "0.15rem 0.6rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  background: totalUnprinted > 0 ? "#fee2e2" : "#dcfce7",
                  color: totalUnprinted > 0 ? "#991b1b" : "#166534",
                }}
              >
                {totalUnprinted} unprinted bill{totalUnprinted !== 1 ? "s" : ""}
              </span>
            </div>

            {totalUnprinted === 0 ? (
              <div style={{ color: "#166534", padding: "1rem 0", fontWeight: 500 }}>
                ✅ All clear — no pending unprinted bills.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {Object.entries(unprintedByTrack).map(([trackId, bills]) => (
                  <div key={trackId}>
                    <h5
                      style={{
                        fontWeight: 600,
                        color: "#78350f",
                        marginBottom: "0.5rem",
                        borderBottom: "1px solid #fde68a",
                        paddingBottom: "0.25rem",
                      }}
                    >
                    {TRACK_LABELS[trackId] || getFriendlyShiftName(trackId)} —{" "}
                      <span style={{ fontWeight: 400 }}>
                        {bills.length} unprinted bill{bills.length !== 1 ? "s" : ""}
                      </span>
                    </h5>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Table</TableHead>
                          <TableHead>Party</TableHead>
                          <TableHead>Clerk</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bills.map((bill) => (
                          <TableRow key={bill.id}>
                            <TableCell>{bill.table_no ?? "—"}</TableCell>
                            <TableCell>{bill.party_no ?? "—"}</TableCell>
                            <TableCell>{bill.clerk_initials}</TableCell>
                            <TableCell>
                              {bill.bill_date
                                ? formatDateToDDMMYYYY(bill.bill_date)
                                : "—"}
                            </TableCell>
                            <TableCell>{bill.item_count}</TableCell>
                            <TableCell>
                              {new Date(bill.created_at).toLocaleTimeString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TrackControl — main export
// ---------------------------------------------------------------------------
export default function TrackControl({ onResetComplete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <TrackLockdownPanel />
      <EODAuditPanel onResetComplete={onResetComplete} />
    </div>
  );
}
