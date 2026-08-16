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
import { getCustomShortcuts, matchesShortcut } from "./utils/helpers";
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
  const [printerError, setPrinterError] = useState("");
  const printerCheckRef = useRef(null);
  const isCheckingRef = useRef(false);

  const checkPrinter = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    try {
      const status = await getPrinterStatus();
      console.log(`[Printer Status Monitor] API returned status:`, status);
      setPrinterConnected(!!status.connected);
      if (!status.connected) {
        setPrinterError(status.reason || "Printer offline or not found");
      } else {
        setPrinterError("");
      }
    } catch (err) {
      console.warn(`[Printer Status Monitor] API status check failed:`, err);
      // Keep previous printerConnected state on transient network failures rather than forcing 'true'
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (mode === "none") return;
    // Initial check + poll every 5 seconds for faster offline detection
    checkPrinter();
    printerCheckRef.current = setInterval(checkPrinter, 5000);
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

  const clearSessionState = useCallback(() => {
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
  }, []);

  const handleLogin = useCallback((
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
  }, [claimTab]);

  const handleLogout = useCallback(async () => {
    const confirmed = window.confirm("Are you sure you want to log out?");
    if (!confirmed) return;

    try {
      await logoutApi();
    } catch (error) {
      clearAuthToken();
    }
    clearSessionState();
  }, [clearSessionState]);

  const handleCloseShiftAndLogout = useCallback(async () => {
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
  }, [clearSessionState]);

  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const code = e.code;

      // Global logout: Alt + Q
      if (e.altKey && !e.shiftKey && (e.key === "q" || e.key === "Q" || code === "KeyQ")) {
        e.preventDefault();
        handleLogout();
        return;
      }

      // Global close shift + logout: Shift + Alt + Q
      if (e.altKey && e.shiftKey && (e.key === "q" || e.key === "Q" || code === "KeyQ")) {
        e.preventDefault();
        handleCloseShiftAndLogout();
        return;
      }

      // Global search focus: Alt+S, Cmd+S, Alt+F, Cmd+F
      const isSearchShortcut =
        (e.altKey && (e.key === "s" || e.key === "S" || code === "KeyS" || e.key === "f" || e.key === "F" || code === "KeyF")) ||
        (isCmdOrCtrl && (e.key === "s" || e.key === "S" || code === "KeyS" || e.key === "f" || e.key === "F" || code === "KeyF"));

      if (isSearchShortcut) {
        e.preventDefault();
        const searchInput = document.querySelector(
          'input[placeholder*="Search" i], input[placeholder*="search" i], input[placeholder*="SEARCH" i], input[placeholder*="find" i], input[placeholder*="Find" i], input[placeholder*="Type item" i], input[placeholder*="Type category" i]'
        );
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      const shortcuts = getCustomShortcuts();

      // Main Tabs Navigation
      if (matchesShortcut(e, shortcuts.activeBills)) {
        e.preventDefault();
        setActiveTab("billing");
      } else if (matchesShortcut(e, shortcuts.recentBills)) {
        e.preventDefault();
        setActiveTab("recent-bills");
      } else if (matchesShortcut(e, shortcuts.shifts)) {
        e.preventDefault();
        setActiveTab("shifts");
      } else if (matchesShortcut(e, shortcuts.foodMenu)) {
        e.preventDefault();
        setActiveTab("menu");
      } else if (matchesShortcut(e, shortcuts.admin)) {
        e.preventDefault();
        if (isAdmin) setActiveTab("admin");
      }
      
      // Admin Main Sub-Tabs navigation
      else if (isCmdOrCtrl && e.altKey) {
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
        } else if (code === "Digit7" || e.key === "7") {
          if (isAdmin) {
            setActiveTab("admin");
            setAdminJumpTarget({ tab: "purge" });
          }
        }
      }
      // Admin Reports Sub-tabs
      else if (isCmdOrCtrl && e.shiftKey) {
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
    };
    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [isAdmin, handleLogout, handleCloseShiftAndLogout]);

  // Global arrow-key navigation across all visible focusable elements
  useEffect(() => {
    const handleArrowNav = (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();

      // Don't interfere with textareas — they handle vertical arrows internally
      if (tag === "textarea") return;

      // Don't interfere with elements that have their own keyDown handlers (e.g. table rows in billing)
      // Check if the element or a close ancestor has data-arrow-nav="false"
      if (active?.closest("[data-arrow-nav='false']")) return;

      const focusable = Array.from(
        document.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href], input:not([disabled]), select:not([disabled])'
        )
      ).filter((el) => {
        // Only visible elements
        if (el.offsetParent === null && el.tagName !== "BODY") return false;
        // Skip hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return true;
      });

      if (focusable.length === 0) return;

      const currentIdx = focusable.indexOf(active);
      let nextIdx;

      if (e.key === "ArrowDown") {
        nextIdx = currentIdx < focusable.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : focusable.length - 1;
      }

      e.preventDefault();
      focusable[nextIdx]?.focus();
    };

    window.addEventListener("keydown", handleArrowNav);
    return () => window.removeEventListener("keydown", handleArrowNav);
  }, []);

  // Global Tab Focus Trap (locks tab focus within the page, wrapping from last to first)
  useEffect(() => {
    const handleTabTrap = (e) => {
      if (e.key !== "Tab") return;

      const active = document.activeElement;
      const focusable = Array.from(
        document.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
        )
      ).filter((el) => {
        if (el.offsetParent === null && el.tagName !== "BODY") return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return true;
      });

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleTabTrap);
    return () => window.removeEventListener("keydown", handleTabTrap);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-black text-white p-4 flex flex-col ${activeTab === "billing" ? "billing-tab-active" : ""}`}>
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        <div className={`text-center ${activeTab === "billing" ? "mb-2" : "mb-6"}`}>
          {activeTab === "billing" ? (
            <h1 className="text-lg font-bold text-zinc-500 tracking-tight">
              New Udipi Anand Bhavan
            </h1>
          ) : (
            <h1 className="text-3xl font-bold text-white tracking-tight">
              New Udipi Anand Bhavan
            </h1>
          )}
          {mode !== "none" && billingDate && (
            <div className={`${activeTab === "billing" ? "mt-1" : "mt-2"} text-sm text-gray-300`}>
              Date: {billingDate} | {track} | Clerk: {userInitials}
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
            {printerError && (
              <div style={{
                color: "#fca5a5", fontSize: "0.9rem", marginTop: "0.5rem",
                background: "rgba(239, 68, 68, 0.2)", padding: "0.6rem 1.2rem",
                borderRadius: "6px", maxWidth: 500, textAlign: "center",
                border: "1px solid rgba(239, 68, 68, 0.4)", wordBreak: "break-word"
              }}>
                <strong>Details:</strong> {printerError}
              </div>
            )}
            <Button
              onClick={checkPrinter}
              style={{ background: "#2563eb", color: "#fff", marginTop: "0.5rem" }}
            >
              Check Now
            </Button>
          </div>
        )}

        <div inert={((!printerConnected && mode !== "none") || tabBlocked) ? "" : null} className="flex-1 flex flex-col">
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
                      billingDate={billingDate}
                    />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          )}
        </div>
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
