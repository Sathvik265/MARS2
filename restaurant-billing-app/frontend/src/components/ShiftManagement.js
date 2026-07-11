import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Loader2,
} from "./ui/UIComponents";
import api, { getShiftStatus, reopenShift, closeShift } from "../services/api";
import { toast, safeGet, safeArray } from "../utils/helpers";

// The four canonical tracks — always render exactly these four rows
const TRACKS = [
  { id: "`", label: "`" },
  { id: "``", label: "``" },
  { id: "RBS", label: "RBS" },
  { id: "RBS1", label: "RBS1" },
];


export default function ShiftTab({ mode, sessionId, currentShift, currentDate, onLogout, onCloseShiftAndLogout }) {
  const [sessionsByTrack, setSessionsByTrack] = useState({});
  const [loading, setLoading] = useState(false);
  const [actingOn, setActingOn] = useState(null); // track id currently being toggled
  const [section, setSection] = useState("L");

  const isAdmin = mode && mode.includes("admin");
  const isClerk = mode === "clerk";

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get("/settings?clerk=CLK");
        if (res.data && res.data.section) {
          setSection(res.data.section.toUpperCase());
        }
      } catch (e) {
        console.error("Failed to load settings in ShiftTab:", e);
      }
    };
    fetchSettings();
  }, []);

  const handleUpdateSection = async (sec) => {
    try {
      await api.put("/settings/section", { section: sec });
      setSection(sec);
      toast.success(`Section updated to ${sec === "L" ? "Line" : "Parcel"}`);
    } catch (e) {
      toast.error("Failed to update section");
      console.error(e);
    }
  };

  const renderSectionSetting = () => (
    <Card className="border border-zinc-800 bg-zinc-950 text-white rounded-xl shadow-lg max-w-md mx-auto overflow-hidden">
      <CardHeader className="border-b border-zinc-900 bg-zinc-950/50 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          System Section
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-zinc-400">
          Set section where the system is currently being used: Line (L) or Parcel (P).
        </p>
        <div className="flex gap-4">
          <Button
            variant={section === "L" ? "primary" : "outline"}
            className="flex-1 py-2 font-bold"
            onClick={() => handleUpdateSection("L")}
          >
            Line (L)
          </Button>
          <Button
            variant={section === "P" ? "primary" : "outline"}
            className="flex-1 py-2 font-bold"
            onClick={() => handleUpdateSection("P")}
          >
            Parcel (P)
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Load sessions and index them by shift_name (last-write wins — keeps the
  // latest session for each track regardless of how many rows exist in the DB)
  const loadShiftStatus = useCallback(async () => {
    setLoading(true);
    try {
      const rows = safeArray(await getShiftStatus());
      const byTrack = {};
      for (const row of rows) {
        const key = row.shift_name;
        // Prefer OPEN sessions; otherwise keep the most-recent one
        if (!byTrack[key] || row.status === "OPEN" || new Date(row.start_time) > new Date(byTrack[key].start_time)) {
          byTrack[key] = row;
        }
      }
      setSessionsByTrack(byTrack);
    } catch (e) {
      console.error("Failed to load shift status:", e);
      toast.error("Failed to load shift status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShiftStatus();
    const interval = setInterval(loadShiftStatus, 30000);
    return () => clearInterval(interval);
  }, [loadShiftStatus]);

  // Toggle a track open ↔ closed
  const handleToggle = async (trackId) => {
    const session = sessionsByTrack[trackId];
    if (!session) return;
    setActingOn(trackId);
    try {
      if (session.status === "OPEN") {
        await closeShift(session.session_id);
        toast.success(`Track "${trackId}" closed`);
      } else {
        await reopenShift(session.session_id);
        toast.success(`Track "${trackId}" re-opened`);
      }
      await loadShiftStatus();
    } catch (e) {
      toast.error(safeGet(e, "response.data.detail", "Action failed"));
    } finally {
      setActingOn(null);
    }
  };

  // ── Clerk view: simple info card ─────────────────────────────────────────
  if (isClerk) {
    const formattedShift = currentShift === "`" ? "I (`)" : currentShift === "``" ? "II (``)" : currentShift;
    return (
      <div className="space-y-6 max-w-md mx-auto">
        <Card className="border border-zinc-800 bg-zinc-950 text-white rounded-xl shadow-lg w-full overflow-hidden">
          <CardHeader className="border-b border-zinc-900 bg-zinc-950/50 pb-4">
            <CardTitle className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Active Shift Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg flex flex-col justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Current Track</span>
                <span className="text-2xl font-bold text-white mt-1">{formattedShift || "—"}</span>
              </div>
              <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg flex flex-col justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Business Date</span>
                <span className="text-lg font-bold text-indigo-400 mt-1">{currentDate || "—"}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {onLogout && (
                <Button 
                  variant="outline" 
                  className="flex-1 py-2 px-4 border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white transition duration-200"
                  onClick={onLogout}
                >
                  Logout Account
                </Button>
              )}
              {onCloseShiftAndLogout && (
                <Button
                  className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-medium border border-transparent shadow transition duration-200"
                  onClick={onCloseShiftAndLogout}
                >
                  Close Shift & Log Out
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        {renderSectionSetting()}
      </div>
    );
  }

  // ── Admin view: 4-track grid ──────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <Card>
        <CardContent style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
          Access denied
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Track Management</CardTitle>
            <Button variant="outline" size="sm" onClick={loadShiftStatus} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" style={{ marginRight: 4 }} /> : null}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && Object.keys(sessionsByTrack).length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <Loader2 size={24} className="animate-spin" />
              <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>Loading…</p>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1rem",
            }}>
              {TRACKS.map(({ id, label }) => {
                const session = sessionsByTrack[id];
                const isOpen = session?.status === "OPEN";
                const isBusy = actingOn === id;
                const noSession = !session;

                return (
                  <div
                    key={id}
                    style={{
                      border: `2px solid ${isOpen ? "#86efac" : "#fca5a5"}`,
                      borderRadius: "0.75rem",
                      padding: "1.25rem",
                      background: isOpen ? "#f0fdf4" : "#fff7f7",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                      transition: "border-color 0.2s",
                    }}
                  >
                    {/* Track label + ID */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "2rem", color: "#000000" }}>{label}</div>
                      <div style={{ fontSize: "0rem", color: "#000000", fontFamily: "monospace" }}>
                        {id}
                      </div>
                    </div>

                    {/* Status badge */}
                    <div>
                      <span style={{
                        display: "inline-block",
                        padding: "0.2rem 0.65rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: isOpen ? "#dcfce7" : "#fee2e2",
                        color: isOpen ? "#166534" : "#991b1b",
                      }}>
                        {noSession ? "No Session" : isOpen ? "● OPEN" : "○ CLOSED"}
                      </span>
                    </div>

                    {/* Clerk */}
                    {session?.clerk_initials && (
                      <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                        Clerk: <strong>{session.clerk_initials}</strong>
                      </div>
                    )}

                    {/* Times */}
                    {session?.start_time && (
                      <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                        Opened: {new Date(session.start_time).toLocaleTimeString()}
                      </div>
                    )}
                    {session?.end_time && (
                      <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                        Closed: {new Date(session.end_time).toLocaleTimeString()}
                      </div>
                    )}

                    {/* Action button */}
                    <Button
                      size="sm"
                      disabled={isBusy || noSession}
                      onClick={() => handleToggle(id)}
                      style={{
                        marginTop: "auto",
                        background: isOpen ? "#ef4444" : "#22c55e",
                        color: "white",
                        border: "none",
                        opacity: noSession ? 0.4 : 1,
                      }}
                    >
                      {isBusy
                        ? <Loader2 size={13} className="animate-spin" />
                        : isOpen ? "Close Track" : "Open Track"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {renderSectionSetting()}
    </div>
  );
}
