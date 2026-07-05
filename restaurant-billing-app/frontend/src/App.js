import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  clearAuthToken,
  getShiftStatus,
  logout as logoutApi,
  closeShiftAndLogout as closeShiftAndLogoutApi,
  getPrinterStatus,
  setAuthToken,
} from "./services/api";
import RecentBills from "./components/RecentBills";
import { LoginPanel } from "./components/LoginPanel";
import BillPrint from "./components/BillPrint";
import ShiftTab from "./components/ShiftManagement";
import FoodMenu from "./components/FoodMenu";
import Billing from "./components/BillingScreen";
import EnhancedAdminPanel from "./components/AdminPanel";
import PrintPortal from "./components/PrintPortal";
import { useUser } from "./context/UserContext";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "./components/ui/UIComponents";
import "./styles/App.css";

// Unique ID for this browser tab (persists across refreshes, not new tabs)
const TAB_ID = (() => {
  let id = sessionStorage.getItem("rbs_tab_id");
  if (!id) {
    id = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem("rbs_tab_id", id);
  }
  return id;
})();

function App() {
  // Use global user context
  const {
    userInitials,
    setUserInitials,
    track,
    setTrack,
    billingDate,
    setBillingDate,
    sessionId,
    setSessionId,
  } = useUser();

  const [mode, setMode] = useState(
    () =>
      localStorage.getItem("authToken")
        ? localStorage.getItem("mode") || "none"
        : "none",
  );

  const isAdmin = mode && mode.includes("admin");

  const [drafts, setDrafts] = useState({});
  const [currentTable, setCurrentTable] = useState("");
  const [activeTab, setActiveTab] = useState("billing");
  const [activeShift, setActiveShift] = useState(null);
  const [isShiftLoading, setIsShiftLoading] = useState(true);
  const [printData, setPrintData] = useState(null);

  // ── Printer detection gate ──────────────────────────────────────────────
  const [printerConnected, setPrinterConnected] = useState(true); // optimistic start
  const printerCheckRef = useRef(null);

  const checkPrinter = useCallback(async () => {
    try {
      const status = await getPrinterStatus();
      setPrinterConnected(!!status.connected);
    } catch {
      // If the API itself fails (backend down), don't block the app
      setPrinterConnected(true);
    }
  }, []);

  useEffect(() => {
    if (mode === "none") return;
    // Initial check + poll every 15 seconds
    checkPrinter();
    printerCheckRef.current = setInterval(checkPrinter, 15000);
    return () => clearInterval(printerCheckRef.current);
  }, [mode, checkPrinter]);

  // ── Single-tab enforcement ──────────────────────────────────────────────
  const [tabBlocked, setTabBlocked] = useState(false);

  useEffect(() => {
    if (mode === "none") return;

    // Mark this tab as the active one
    localStorage.setItem("rbs_active_tab", TAB_ID);
    localStorage.setItem("rbs_active_user", userInitials || "unknown");

    const handleStorage = (e) => {
      if (e.key === "rbs_active_tab" && e.newValue && e.newValue !== TAB_ID) {
        // Another tab took over — block this one
        setTabBlocked(true);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [mode, userInitials]);

  // Broadcast to other tabs on login
  const claimTab = useCallback(() => {
    localStorage.setItem("rbs_active_tab", TAB_ID);
    localStorage.setItem("rbs_tab_claimed_at", Date.now().toString());
    setTabBlocked(false);
  }, []);

  useEffect(() => {
    const fetchShiftStatus = async () => {
      if (mode !== "none" && billingDate && track) {
        setIsShiftLoading(true);
        try {
          const status = await getShiftStatus(billingDate);
          const openShift = status.find(
            (s) => s.status === "OPEN" && s.shift_name === track,
          );
          setActiveShift(openShift || status.find((s) => s.status === "OPEN"));
        } catch (err) {
          console.error("Error fetching shift status:", err);
        } finally {
          setIsShiftLoading(false);
        }
      }
    };
    fetchShiftStatus();
  }, [mode, billingDate, track]);

  // State for admin jump target (shortcuts)
  const [adminJumpTarget, setAdminJumpTarget] = useState(null);

  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const code = e.code;

      // Admin Main Tabs (Ctrl + Alt + Number / Cmd + Option + Number)
      if (isCmdOrCtrl && e.altKey) {
        if (code === "Digit1" || e.key === "1") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "dashboard" });
          }
        } else if (code === "Digit2" || e.key === "2") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "reports" });
          }
        } else if (code === "Digit3" || e.key === "3") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "reconciliation" });
          }
        } else if (code === "Digit4" || e.key === "4") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "settings" });
          }
        } else if (code === "Digit5" || e.key === "5") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "split-bill" });
          }
        } else if (code === "Digit6" || e.key === "6") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "track-control" });
          }
        } else if (code === "Digit7" || e.key === "7") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "purge" });
          }
        }
      }
      // Admin Reports Sub-tabs (Ctrl + Shift + Number / Cmd + Shift + Number)
      else if (isCmdOrCtrl && e.shiftKey) {
        // Cmd+Shift+3,4,5 are system screenshot shortcuts on macOS, so we ignore e.metaKey for them
        if (code === "Digit1" || e.key === "1" || e.key === "!") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "reports", subTab: "time-range" });
          }
        } else if (code === "Digit2" || e.key === "2" || e.key === "@") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "reports", subTab: "date-range" });
          }
        } else if ((code === "Digit3" || e.key === "3" || e.key === "#") && !e.metaKey) {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "reports", subTab: "shift-report" });
          }
        } else if ((code === "Digit4" || e.key === "4" || e.key === "$") && !e.metaKey) {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "reports", subTab: "item-report" });
          }
        }
      }
      // Main Tabs (Alt + Number / Option + Number)
      else if (e.altKey) {
        if (code === "Digit1" || e.key === "1") {
          setActiveTab("billing");
        } else if (code === "Digit2" || e.key === "2") {
          setActiveTab("recent-bills");
        } else if (code === "Digit3" || e.key === "3") {
          setActiveTab("shifts");
        } else if (code === "Digit4" || e.key === "4") {
          setActiveTab("menu");
        } else if (code === "Digit5" || e.key === "5") {
          if (isAdmin) setActiveTab("admin");
        }
      }
    };
    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [isAdmin]);

  const clearSessionState = () => {
    setMode("none");
    setBillingDate(null);
    setTrack("");
    setSessionId(null);
    setUserInitials("CLK");
    setDrafts({});
    setCurrentTable("");
    setActiveTab("billing");
    localStorage.removeItem("mode");
    localStorage.removeItem("rbs_active_tab");
    localStorage.removeItem("rbs_active_user");
  };

  const handleLogin = (
    newMode,
    date,
    newTrack,
    newSessionId,
    initials = "CLK",
    authToken = null,
  ) => {
    if (authToken) {
      setAuthToken(authToken);
    }
    setMode(newMode);
    setBillingDate(date);
    setTrack(newTrack);
    setSessionId(newSessionId);
    setUserInitials(initials);
    localStorage.setItem("mode", newMode);
    // Claim this tab as the active session
    claimTab();
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("Are you sure you want to log out?");
    if (!confirmed) return;

    try {
      await logoutApi();
    } catch (error) {
      clearAuthToken();
    }
    clearSessionState();
  };

  const handleCloseShiftAndLogout = async () => {
    const confirmed = window.confirm(
      "This will CLOSE the current shift and log out. Are you sure?"
    );
    if (!confirmed) return;

    try {
      await closeShiftAndLogoutApi();
    } catch (error) {
      clearAuthToken();
    }
    clearSessionState();
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-black text-white p-4 flex flex-col ${activeTab === "billing" ? "billing-tab-active" : ""}`}>
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            New Udipi Anand Bhavan
          </h1>
          {mode !== "none" && billingDate && (
            <div className="mt-2 text-sm text-gray-300">
              Mode: {mode} | Date: {billingDate} | Track: {track || "Default"}
              <span className="ml-4 inline-flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
                <Button
                  size="sm"
                  onClick={handleCloseShiftAndLogout}
                  style={{ background: "#7f1d1d", color: "#fecaca", border: "1px solid #991b1b" }}
                >
                  Close Shift & Log Out
                </Button>
              </span>
            </div>
          )}
        </div>

        {/* Tab blocked overlay — another tab claimed the session */}
        {tabBlocked && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)", display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "1rem", color: "#fff"
          }}>
            <div style={{ fontSize: "3rem" }}>🔒</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>Session moved to another tab</div>
            <div style={{ color: "#9ca3af", maxWidth: 400, textAlign: "center" }}>
              This app was opened in another browser tab or window. Only one tab can be active at a time.
            </div>
            <Button onClick={claimTab} style={{ background: "#2563eb", color: "#fff", marginTop: "1rem" }}>
              Use this tab instead
            </Button>
          </div>
        )}

        {/* Printer disconnected overlay */}
        {mode !== "none" && !printerConnected && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(0,0,0,0.88)", display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "1rem", color: "#fff"
          }}>
            <div style={{ fontSize: "3rem" }}>🖨️</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fca5a5" }}>
              Printer Not Detected
            </div>
            <div style={{ color: "#9ca3af", maxWidth: 400, textAlign: "center" }}>
              The billing system requires a connected printer. Please connect your printer and wait — the system will check again automatically every 15 seconds.
            </div>
            <Button
              onClick={checkPrinter}
              style={{ background: "#2563eb", color: "#fff", marginTop: "0.5rem" }}
            >
              Check Now
            </Button>
          </div>
        )}

        {mode === "none" ? (
          <div className="flex-1 flex items-center justify-center">
            <LoginPanel onLogin={handleLogin} />
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="billing">Billing</TabsTrigger>
                <TabsTrigger value="recent-bills">Recent Bills</TabsTrigger>
                <TabsTrigger value="shifts">Shifts</TabsTrigger>
                <TabsTrigger value="menu">Food Menu</TabsTrigger>
                {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
              </TabsList>

              <TabsContent value="billing">
                <Billing
                  drafts={drafts}
                  setDrafts={setDrafts}
                  currentTable={currentTable}
                  setCurrentTable={setCurrentTable}
                  billingDate={billingDate}
                  activeTab={activeTab}
                  track={track}
                  sessionId={sessionId}
                  activeShift={activeShift}
                  userInitials={userInitials}
                  isShiftLoading={isShiftLoading}
                  setPrintData={setPrintData}
                />
              </TabsContent>

              <TabsContent value="recent-bills">
                <RecentBills billingDate={billingDate} />
              </TabsContent>

              <TabsContent value="shifts">
                <ShiftTab
                  mode={mode}
                  sessionId={sessionId}
                  currentShift={track}
                  currentDate={billingDate}
                  onLogout={handleLogout}
                  onCloseShiftAndLogout={handleCloseShiftAndLogout}
                />
              </TabsContent>

              <TabsContent value="menu">
                <FoodMenu mode={mode} />
              </TabsContent>

              {isAdmin && (
                <TabsContent value="admin">
                  <EnhancedAdminPanel
                    mode={mode}
                    sessionId={sessionId}
                    jumpTarget={adminJumpTarget}
                  />
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}
      </div>

      {/* Hidden print area */}
      <div className="hidden">
        <PrintPortal>
          <div className="bill-print-area print-receipt print-area">
            <BillPrint billData={printData} />
          </div>
        </PrintPortal>
      </div>
    </div>
  );
}

export default App;
