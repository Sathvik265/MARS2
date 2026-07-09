import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Button,
  Loader2,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  Label,
} from "./ui/UIComponents";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/Table";
import api from "../services/api";
import {
  TimeRangeReport,
  DateRangeReport,
  ShiftReport,
  ItemReport,
} from "./Reports";
import { API, toast, safeGet, safeArray, safeObject } from "../utils/helpers";
import ClerkManagement from "./ClerkManagement";
import SplitBillSettings from "./Admin/SplitBillSettings";
import TrackControl from "./Admin/TrackControl";

// ================== RECONCILIATION ==================

function EnhancedReconciliation({ sessionId, mode }) {
  const [unprintedBills, setUnprintedBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [detailsCache, setDetailsCache] = useState({});

  const loadRunningBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reconciliation/running`);
      setUnprintedBills(safeArray(res.data));
    } catch (e) {
      console.error("Failed to load running bills:", e);
      toast.error("Failed to load running bills");
      setUnprintedBills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode && mode.includes("admin")) {
      loadRunningBills();
    }
  }, [mode, loadRunningBills]);

  if (!mode || !mode.includes("admin")) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-gray-500">Admin access required</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reconciliation - Unprinted Bills</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button onClick={loadRunningBills} variant="outline" size="sm">
            Refresh List
          </Button>

          {loading ? (
            <div className="text-center py-8">
              <Loader2 size={24} className="mb-2" />
              <p>Loading unprinted bills...</p>
            </div>
          ) : unprintedBills.length > 0 ? (
            <div className="space-y-2">
              {unprintedBills.map((row) => {
                const key = `${row.table_no}-${row.party_no}`;
                const isExpanded = expandedKey === key;
                const details = detailsCache[key];
                return (
                  <div
                    key={key}
                    className="p-3 border rounded-md bg-white shadow-sm"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          Table {row.table_no} - Party {row.party_no}
                        </div>
                        <div className="text-sm text-gray-500">
                          Created: {new Date(row.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            Items: {row.items_count}
                          </div>
                          <div className="font-bold">
                            ₹{Number(row.total_amount || 0).toFixed(2)}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (isExpanded) {
                              setExpandedKey(null);
                              return;
                            }
                            setExpandedKey(key);
                            if (!details) {
                              try {
                                const res = await api.get(
                                  `/billing/orders/table/${row.table_no}/party/${row.party_no}`,
                                );
                                setDetailsCache((prev) => ({
                                  ...prev,
                                  [key]: safeArray(res.data),
                                }));
                              } catch (err) {
                                console.error(
                                  "Failed to load orders for",
                                  key,
                                  err,
                                );
                                toast.error("Failed to load bill details");
                                setDetailsCache((prev) => ({
                                  ...prev,
                                  [key]: [],
                                }));
                              }
                            }
                          }}
                        >
                          {isExpanded ? "Hide" : "Details"}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3">
                        {!details ? (
                          <div className="text-sm text-gray-500">
                            Loading...
                          </div>
                        ) : details.length === 0 ? (
                          <div className="text-sm text-gray-500">No items</div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Rate</TableHead>
                                <TableHead>Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {details.map((d, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{d.item_name}</TableCell>
                                  <TableCell>{d.quantity}</TableCell>
                                  <TableCell>
                                    {Number(d.unit_price || 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    {Number(d.line_total || 0).toFixed(2)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No unprinted bills found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ================== TOP ITEMS DASHBOARD ==================

function TopItemsDashboard({ sessionId }) {
  const [topItems, setTopItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTopItems = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    try {
      const res = await api.get(`/dashboard/top-items`);
      setTopItems(safeArray(res.data));
    } catch (e) {
      console.error("Failed to load top items:", e);
      toast.error("Failed to load top items");
      setTopItems([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadTopItems();
    const interval = setInterval(loadTopItems, 300000);
    return () => clearInterval(interval);
  }, [loadTopItems]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 5 Best-Selling Items Today</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <Loader2 size={24} className="mb-2" />
            <p>Loading top items...</p>
          </div>
        ) : topItems.length > 0 ? (
          <div className="space-y-3">
            {topItems.map((item, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <h4 className="font-medium">{item.item_name}</h4>
                </div>
                <div className="text-right">
                  <p className="font-bold">{item.total_quantity} sold</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No sales data available for today
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ================== SETTINGS EDITOR ==================

function SettingsEditor({ settings, onChange, clerk }) {
  const [form, setForm] = useState(safeObject(settings));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(safeObject(settings));
  }, [settings]);

  const save = async () => {
    setLoading(true);
    try {
      const res = await axios.put(
        `${API}/settings?clerk=${clerk || "CLK"}`,
        form,
      );
      if (onChange) {
        onChange(res.data);
      }
      toast.success("Settings saved");
    } catch (e) {
      console.error("Settings save error:", e);
      toast.error(
        safeGet(e, "response.data.detail", "Failed to save settings"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipt Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Hotel Name</TableCell>
              <TableCell>
                <Input
                  value={safeGet(form, "hotel_name", "")}
                  onChange={(e) =>
                    setForm({ ...form, hotel_name: e.target.value })
                  }
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Phone</TableCell>
              <TableCell>
                <Input
                  value={safeGet(form, "phone", "")}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>GSTIN</TableCell>
              <TableCell>
                <Input
                  value={safeGet(form, "gstin", "")}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Address</TableCell>
              <TableCell>
                <Textarea
                  rows={2}
                  value={safeGet(form, "address", "")}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>SGST %</TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="0.01"
                  value={safeGet(form, "sgst_percentage", 2.5)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sgst_percentage: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>CGST %</TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="0.01"
                  value={safeGet(form, "cgst_percentage", 2.5)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cgst_percentage: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className="mt-4">
          <Button onClick={save} disabled={loading} className="w-full">
            {loading ? <Loader2 size={16} className="mr-2" /> : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ================== ENHANCED ADMIN PANEL ==================

export default function EnhancedAdminPanel({ mode, sessionId, jumpTarget }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState("dashboard");
  const [reportsInnerTab, setReportsInnerTab] = useState("time-range");
  const [settingsClerk, setSettingsClerk] = useState("CLK");

  useEffect(() => {
    if (jumpTarget) {
      if (jumpTarget.tab) {
        setAdminActiveTab(jumpTarget.tab);
      }
      if (jumpTarget.subTab && jumpTarget.tab === "reports") {
        setReportsInnerTab(jumpTarget.subTab);
      }
    }
  }, [jumpTarget]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/settings?clerk=${settingsClerk}`);
      setSettings(safeObject(res.data));
    } catch (e) {
      console.error("Failed to load settings:", e);
      toast.error("Failed to load settings");
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, [settingsClerk]);

  useEffect(() => {
    if (mode === "admin-full") {
      loadSettings();
    }
  }, [mode, loadSettings]);

  // Set default tab based on mode
  useEffect(() => {
    if (mode === "admin-limited" && adminActiveTab === "dashboard") {
      setAdminActiveTab("reports");
    }
  }, [mode, adminActiveTab]);

  const isAdmin = mode && mode.includes("admin");

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <Tabs value={adminActiveTab} onValueChange={setAdminActiveTab}>
        <TabsList>
          {/* Dashboard tab only visible in admin-full mode */}
          {mode === "admin-full" && (
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          )}
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="split-bill">Split Bill</TabsTrigger>
          {mode === "admin-full" && (
            <TabsTrigger value="track-control">Track Control</TabsTrigger>
          )}
          {mode === "admin-full" && (
            <TabsTrigger
              value="purge"
              className="text-red-600 data-[state=active]:text-red-800"
            >
              Purge
            </TabsTrigger>
          )}
        </TabsList>

        {mode === "admin-full" && (
          <TabsContent value="dashboard">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TopItemsDashboard sessionId={sessionId} />
                <ClerkStatsDashboard sessionId={sessionId} />
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="reports">
          <div className="space-y-6">
            <Tabs value={reportsInnerTab} onValueChange={setReportsInnerTab}>
              <TabsList>
                <TabsTrigger value="time-range">Time Range</TabsTrigger>
                <TabsTrigger value="date-range">Date Range</TabsTrigger>
                <TabsTrigger value="shift-report">Shift Report</TabsTrigger>
                <TabsTrigger value="item-report">Item Report</TabsTrigger>
              </TabsList>

              <TabsContent value="time-range">
                <TimeRangeReport sessionId={sessionId} />
              </TabsContent>

              <TabsContent value="date-range">
                <DateRangeReport sessionId={sessionId} />
              </TabsContent>

              <TabsContent value="shift-report">
                <ShiftReport sessionId={sessionId} />
              </TabsContent>

              <TabsContent value="item-report">
                <ItemReport sessionId={sessionId} />
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>

        <TabsContent value="reconciliation">
          <EnhancedReconciliation sessionId={sessionId} mode={mode} />
        </TabsContent>

        {mode === "admin-full" && (
          <TabsContent value="purge">
            <PurgeBillsSection />
          </TabsContent>
        )}

        <TabsContent value="settings">
          <div className="space-y-6">
            {/* Clerk Management Section */}
            <ClerkManagement />

            {/* Receipt Settings Section */}
            <div className="flex items-center gap-2 mb-4">
              <Label>Settings for Clerk:</Label>
              <Input
                value={settingsClerk}
                onChange={(e) => setSettingsClerk(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-24"
                placeholder="CLK"
              />
            </div>
            {loading ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Loader2 size={24} className="mb-2" />
                  <span>Loading settings...</span>
                </CardContent>
              </Card>
            ) : (
              <SettingsEditor
                settings={settings}
                onChange={setSettings}
                clerk={settingsClerk}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="split-bill">
          <SplitBillSettings />
        </TabsContent>

        {mode === "admin-full" && (
          <TabsContent value="track-control">
            <TrackControl
              onResetComplete={() => {
                // After EOD reset, navigate back to dashboard if desired
                setAdminActiveTab("dashboard");
              }}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ClerkStatsDashboard({ sessionId }) {
  const [stats, setStats] = useState({ sales: [], history: [] });
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/dashboard/clerk-stats`);
      setStats(safeObject(res.data));
    } catch (e) {
      console.error("Failed to load clerk stats:", e);
      toast.error("Failed to load clerk stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    // Refresh every 5 minutes
    const interval = setInterval(loadStats, 300000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const { sales = [], history = [] } = stats;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clerk Performance (Today)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !sales.length && !history.length ? (
          <div className="text-center py-8">
            <Loader2 size={24} className="mb-2" />
            <p>Loading stats...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-500 mb-2 border-b pb-1">
                Top Sales by Clerk
              </h4>
              {sales.length > 0 ? (
                <div className="space-y-2">
                  {sales.map((s, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>
                        {s.clerk_initials} ({s.track})
                      </span>
                      <span className="font-bold">
                        ₹{parseFloat(s.total_sales).toFixed(2)} ({s.bill_count}{" "}
                        bills)
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No sales yet today.</div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-500 mb-2 border-b pb-1">
                Login History
              </h4>
              {history.length > 0 ? (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="text-xs flex justify-between">
                      <span>
                        <span className="font-bold">{h.clerk_initials}</span> @{" "}
                        {h.shift_name}
                      </span>
                      <span className="text-gray-500">
                        {new Date(h.login_time).toLocaleTimeString()} -{" "}
                        {h.logout_time
                          ? new Date(h.logout_time).toLocaleTimeString()
                          : "Active"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  No login history today.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PurgeBillsSection() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [shiftPurgeLoading, setShiftPurgeLoading] = useState(false);
  const [shiftStartDate, setShiftStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [shiftEndDate, setShiftEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [shiftName, setShiftName] = useState("");

  const handlePurge = async () => {
    const confirmPassword = window.prompt(
      "Enter admin full password to confirm purge:",
      "",
    );

    if (!confirmPassword) {
      return;
    }

    if (
      !window.confirm(
        `DANGER: Are you sure you want to DELETE ALL bills from ${startDate} to ${endDate}?\n\nThis will delete records for ALL tracks. This cannot be undone.`,
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/billing/bills/purge", {
        startDate,
        endDate,
        confirmPassword,
      });
      toast.success(res.data.message);
    } catch (e) {
      console.error("Purge failed", e);
      toast.error(safeGet(e, "response.data.error", "Purge failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleShiftPurge = async () => {
    if (!shiftName || !shiftName.trim()) {
      toast.error("Please enter a shift name (e.g. `, ``, RBS1, RBS2)");
      return;
    }

    const confirmPassword = window.prompt(
      "Enter admin full password to confirm shift purge:",
      "",
    );

    if (!confirmPassword) {
      return;
    }

    if (
      !window.confirm(
        `DANGER: Are you sure you want to DELETE ALL bills for shift "${shiftName}" from ${shiftStartDate} to ${shiftEndDate}?\n\nThis will ONLY delete bills for this specific shift. This cannot be undone.`,
      )
    ) {
      return;
    }

    setShiftPurgeLoading(true);
    try {
      const res = await api.post("/billing/bills/purge-shift", {
        startDate: shiftStartDate,
        endDate: shiftEndDate,
        shiftName: shiftName.trim(),
        confirmPassword,
      });
      toast.success(res.data.message);
    } catch (e) {
      console.error("Shift purge failed", e);
      toast.error(safeGet(e, "response.data.error", "Shift purge failed"));
    } finally {
      setShiftPurgeLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-red-200 bg-red-50 mt-8">
        <CardHeader>
          <CardTitle className="text-red-800">Danger Zone: Purge All Bills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-red-600">
              Select a date range to delete <strong>ALL</strong> bills created
              within that period (inclusive). This deletes bills for ALL shifts.
            </p>

            <div className="flex gap-4 items-center">
              <div className="flex flex-col gap-1">
                <Label className="text-red-800">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-red-800">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="destructive"
                onClick={handlePurge}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="animate-spin mr-2" size={16} />
                ) : null}
                Purge All Bills
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="text-orange-800">Shift-Wise Purge</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-orange-600">
              Delete bills for a <strong>specific shift only</strong> within a date range.
              Bills from other shifts will NOT be affected.
            </p>

            <div className="flex gap-4 items-center flex-wrap">
              <div className="flex flex-col gap-1">
                <Label className="text-orange-800">Start Date</Label>
                <Input
                  type="date"
                  value={shiftStartDate}
                  onChange={(e) => setShiftStartDate(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-orange-800">End Date</Label>
                <Input
                  type="date"
                  value={shiftEndDate}
                  onChange={(e) => setShiftEndDate(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-orange-800">Shift Name</Label>
                <Input
                  type="text"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  placeholder="`, ``, RBS1, RBS2"
                  className="bg-white w-40"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="destructive"
                onClick={handleShiftPurge}
                disabled={shiftPurgeLoading || !shiftName.trim()}
              >
                {shiftPurgeLoading ? (
                  <Loader2 className="animate-spin mr-2" size={16} />
                ) : null}
                Purge Shift Bills
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
