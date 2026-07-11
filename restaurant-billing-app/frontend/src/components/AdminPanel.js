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

// ================== HOURLY SALES DASHBOARD ==================

function HourlySalesDashboard({ billingDate }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ totalSales: 0, totalBills: 0, avgBill: 0 });

  const loadData = useCallback(async () => {
    if (!billingDate) return;
    setLoading(true);
    try {
      const res = await api.get(`/reports/time-wise?bill_date=${billingDate}`);
      const report = safeArray(res.data?.report);
      // Sort report chronologically by time slot
      report.sort((a, b) => a.time_slot.localeCompare(b.time_slot));
      setData(report);

      // Calculate summary stats
      let totalSales = 0;
      let totalBills = 0;
      report.forEach(item => {
        totalSales += parseFloat(item.total_amount || 0);
        totalBills += parseInt(item.bill_count || 0);
      });
      const avgBill = totalBills > 0 ? (totalSales / totalBills) : 0;
      setSummary({ totalSales, totalBills, avgBill });
    } catch (e) {
      console.error("Failed to load time-wise report:", e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [billingDate]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 300000); // 5 min refresh
    return () => clearInterval(interval);
  }, [loadData]);

  // SVG Chart rendering helpers
  const svgWidth = 500;
  const svgHeight = 160;
  const padding = 30;
  const chartWidth = svgWidth - 2 * padding;
  const chartHeight = svgHeight - 2 * padding;

  const maxVal = data.length > 0 ? Math.max(...data.map(d => parseFloat(d.total_amount || 0))) * 1.15 || 100 : 100;

  const points = data.map((d, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * chartWidth;
    const y = svgHeight - padding - (parseFloat(d.total_amount || 0) / maxVal) * chartHeight;
    return { x, y, data: d };
  });

  const pathD = points.reduce((acc, p, i) => {
    return acc + `${i === 0 ? "M" : "L"} ${p.x} ${p.y} `;
  }, "");

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${svgHeight - padding} L ${points[0].x} ${svgHeight - padding} Z`
    : "";

  return (
    <Card className="border border-zinc-800 bg-zinc-950 text-white rounded-xl shadow-lg">
      <CardHeader className="border-b border-zinc-900 pb-4 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <span>📊 Sales Trend (Hourly)</span>
        </CardTitle>
        <span className="text-xs text-zinc-400">Date: {billingDate}</span>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-zinc-905 bg-zinc-900/40 border border-zinc-850 rounded-lg">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Sales</div>
            <div className="text-xl font-extrabold text-emerald-400 mt-1">₹{summary.totalSales.toFixed(2)}</div>
          </div>
          <div className="p-3 bg-zinc-900/40 border border-zinc-850 rounded-lg">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Bills</div>
            <div className="text-xl font-extrabold text-indigo-400 mt-1">{summary.totalBills}</div>
          </div>
          <div className="p-3 bg-zinc-900/40 border border-zinc-850 rounded-lg">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Avg. Bill Value</div>
            <div className="text-xl font-extrabold text-amber-400 mt-1">₹{summary.avgBill.toFixed(2)}</div>
          </div>
        </div>

        {/* SVG Graph */}
        <div className="relative border border-zinc-900 bg-zinc-950 rounded-lg p-2 flex justify-center">
          {loading && data.length === 0 ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="animate-spin text-zinc-500" />
            </div>
          ) : data.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-zinc-500">
              No sales data captured yet for today
            </div>
          ) : (
            <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="overflow-visible">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="#1f2937" strokeDasharray="3 3" />
              <line x1={padding} y1={padding + chartHeight/2} x2={svgWidth - padding} y2={padding + chartHeight/2} stroke="#1f2937" strokeDasharray="3 3" />
              <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="#374151" />

              {/* Y Axis Labels */}
              <text x={padding - 5} y={padding + 4} fill="#6b7280" fontSize="8" textAnchor="end">₹{maxVal.toFixed(0)}</text>
              <text x={padding - 5} y={padding + chartHeight/2 + 4} fill="#6b7280" fontSize="8" textAnchor="end">₹{(maxVal/2).toFixed(0)}</text>
              <text x={padding - 5} y={svgHeight - padding + 4} fill="#6b7280" fontSize="8" textAnchor="end">₹0</text>

              {/* Area path */}
              {areaD && <path d={areaD} fill="url(#chartGrad)" />}

              {/* Line path */}
              {pathD && <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />}

              {/* Data points */}
              {points.map((p, i) => (
                <g key={i} className="group cursor-pointer">
                  <circle cx={p.x} cy={p.y} r="4" fill="#818cf8" stroke="#1e1b4b" strokeWidth="1.5" className="transition hover:scale-150" />
                  <title>{`${p.data.time_slot} - ₹${parseFloat(p.data.total_amount).toFixed(2)} (${p.data.bill_count} bills)`}</title>
                  
                  {/* X Axis labels */}
                  { (i === 0 || i === points.length - 1 || i % Math.max(2, Math.floor(points.length / 4)) === 0) && (
                    <text x={p.x} y={svgHeight - 12} fill="#6b7280" fontSize="8" textAnchor="middle">{p.data.time_slot}</text>
                  )}
                </g>
              ))}
            </svg>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ================== TOP ITEMS DASHBOARD ==================

function TopItemsDashboard({ sessionId, billingDate }) {
  const [topItems, setTopItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTopItems = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadTopItems();
    const interval = setInterval(loadTopItems, 300000);
    return () => clearInterval(interval);
  }, [loadTopItems]);

  const maxQty = topItems.length > 0 ? Math.max(...topItems.map(item => parseInt(item.total_quantity || 0))) : 1;

  return (
    <Card className="border border-zinc-800 bg-zinc-950 text-white rounded-xl shadow-lg">
      <CardHeader className="border-b border-zinc-900 pb-4">
        <CardTitle className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <span>🔥 Top Best-Sellers (Today)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <div className="text-center py-8">
            <Loader2 size={24} className="mb-2 animate-spin text-zinc-500 mx-auto" />
            <p className="text-zinc-500 text-sm">Loading items...</p>
          </div>
        ) : topItems.length > 0 ? (
          <div className="space-y-4">
            {topItems.map((item, index) => {
              const qty = parseInt(item.total_quantity || 0);
              const percentage = (qty / maxQty) * 100;
              return (
                <div key={index} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-zinc-200">{index + 1}. {item.item_name}</span>
                    <span className="font-bold text-zinc-400">{qty} items</span>
                  </div>
                  {/* Custom Progress Bar */}
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/60">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500 text-sm">
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

export default function EnhancedAdminPanel({ mode, sessionId, jumpTarget, billingDate }) {
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <HourlySalesDashboard billingDate={billingDate} />
                </div>
                <div className="lg:col-span-1">
                  <TopItemsDashboard sessionId={sessionId} billingDate={billingDate} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6">
                <ClerkStatsDashboard sessionId={sessionId} billingDate={billingDate} />
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

function ClerkStatsDashboard({ sessionId, billingDate }) {
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
    const interval = setInterval(loadStats, 300000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const { sales = [], history = [] } = stats;

  const totalClerkSales = sales.reduce((acc, s) => acc + parseFloat(s.total_sales || 0), 0);
  const maxClerkSales = sales.length > 0 ? Math.max(...sales.map(s => parseFloat(s.total_sales || 0))) : 1;

  return (
    <Card className="border border-zinc-800 bg-zinc-950 text-white rounded-xl shadow-lg">
      <CardHeader className="border-b border-zinc-900 pb-4">
        <CardTitle className="text-lg font-bold text-zinc-100 flex items-center gap-2">
          <span>👥 Clerks & Active Sessions</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {loading && !sales.length && !history.length ? (
          <div className="text-center py-8">
            <Loader2 size={24} className="mb-2 animate-spin text-zinc-500 mx-auto" />
            <p className="text-zinc-500 text-sm">Loading stats...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sales contribution */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-zinc-450 text-zinc-400 uppercase tracking-widest border-b border-zinc-900 pb-2">
                Clerk Contribution (Sales)
              </h4>
              {sales.length > 0 ? (
                <div className="space-y-4">
                  {sales.map((s, i) => {
                    const salesVal = parseFloat(s.total_sales || 0);
                    const pctOfMax = (salesVal / maxClerkSales) * 100;
                    const pctOfTotal = totalClerkSales > 0 ? (salesVal / totalClerkSales) * 100 : 0;
                    const displayTrack = s.track === "`" ? "I (`)" : s.track === "``" ? "II (``)" : s.track;

                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold text-zinc-300">
                            {s.clerk_initials} <span className="text-xs text-zinc-500">({displayTrack})</span>
                          </span>
                          <span className="font-bold text-emerald-400">
                            ₹{salesVal.toFixed(2)}{" "}
                            <span className="text-xs text-zinc-500 font-normal">({s.bill_count} bills, {pctOfTotal.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${pctOfMax}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-zinc-500 py-4">No sales recorded yet today.</div>
              )}
            </div>

            {/* Login history timeline */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-900 pb-2">
                Session Activity Log
              </h4>
              {history.length > 0 ? (
                <div className="max-h-60 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-zinc-800">
                  {history.map((h, i) => {
                    const isSessionActive = !h.logout_time;
                    const displayTrack = h.shift_name === "`" ? "I (`)" : h.shift_name === "``" ? "II (``)" : h.shift_name;
                    return (
                      <div key={i} className="flex gap-3 text-xs">
                        {/* Timeline Node */}
                        <div className="flex flex-col items-center">
                          <div className={`w-2.5 h-2.5 rounded-full ${isSessionActive ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse" : "bg-zinc-700"}`} />
                          {i < history.length - 1 && <div className="w-0.5 flex-1 bg-zinc-900 my-1" />}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-zinc-200">
                              Clerk <span className="text-indigo-400 font-bold">{h.clerk_initials}</span> @ {displayTrack}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isSessionActive ? "bg-emerald-950 text-emerald-400" : "bg-zinc-900 text-zinc-500"}`}>
                              {isSessionActive ? "Active" : "Finished"}
                            </span>
                          </div>
                          <p className="text-zinc-500 mt-0.5">
                            {new Date(h.login_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{" "}
                            {h.logout_time
                              ? new Date(h.logout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : "Now"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-zinc-500 py-4">No session logins recorded yet today.</div>
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
