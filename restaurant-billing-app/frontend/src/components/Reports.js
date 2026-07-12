import React, { useState, useEffect } from "react";
import axios from "axios";
import api from "../services/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Button,
  Label,
  Loader2,
} from "./ui/UIComponents";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/Table";
import { API, toast, safeGet, safeArray, formatDateToDDMMYYYY } from "../utils/helpers";
import { generateAsciiReport } from "../utils/receiptGenerator";

const fetchSettings = async () => {
  try {
    const res = await api.get("/settings");
    return res.data;
  } catch (err) {
    console.error("Failed to fetch settings for printer:", err);
    return {};
  }
};

const sendToPosPrinter = async (title, columns, data) => {
  try {
    const settings = await fetchSettings();
    const rawText = generateAsciiReport(title, columns, data, settings);
    await api.post("/printer/print", { text: rawText });
    toast.success("Report sent to POS printer!");
  } catch (err) {
    console.error("Direct print failed:", err);
    toast.error("Printer error. Check if backend printer route is running.");
  }
};

export function TimeRangeReport({ sessionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "21:00",
  });

  const generateReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/time-range`, {
        params: {
          date: filters.date,
          startTime: filters.startTime,
          endTime: filters.endTime,
        },
      });
      setReport(res.data);
      toast.success("Time range report generated successfully");
    } catch (e) {
      console.error("Failed to generate time range report:", e);
      toast.error(
        safeGet(e, "response.data.detail", "Failed to generate report"),
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!report || report.length === 0) return;
    sendToPosPrinter(
      `Time Range Report`,
      [
        { header: "Bill", accessor: (r) => r.bill_number, width: 6 },
        { header: "Tbl", accessor: (r) => r.table_no, width: 4 },
        {
          header: "Amt Rs",
          accessor: (r) => Number(r.grand_total).toFixed(2),
          width: 9,
          align: "right",
        },
        {
          header: "Time",
          accessor: (r) => new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          width: 9,
          align: "right",
        },
      ],
      report
    );
  };

  useEffect(() => {
    const handleCtrlP = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        if (report && report.length > 0) {
          e.preventDefault();
          handlePrint();
        }
      }
    };
    window.addEventListener("keydown", handleCtrlP);
    return () => window.removeEventListener("keydown", handleCtrlP);
  }, [report]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Range Report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={filters.date}
                onChange={(e) =>
                  setFilters({ ...filters, date: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={filters.startTime}
                onChange={(e) =>
                  setFilters({ ...filters, startTime: e.target.value })
                }
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={filters.endTime}
                onChange={(e) =>
                  setFilters({ ...filters, endTime: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={generateReport} disabled={loading}>
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Generate Report
            </Button>
            {report && report.length > 0 && (
              <Button onClick={handlePrint} variant="outline">
                Print Report
              </Button>
            )}
          </div>

          {report && (
            <div className="mt-6 space-y-4">
              {report.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill No</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell>{bill.bill_number}</TableCell>
                        <TableCell>{bill.table_no}</TableCell>
                        <TableCell>
                          {Number(bill.grand_total).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {new Date(bill.created_at).toLocaleTimeString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No bills found for the selected time range
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DateRangeReport({ sessionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });

  const generateReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/date-range`, {
        params: {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
      });
      setReport(res.data);
      toast.success("Date range report generated successfully");
    } catch (e) {
      console.error("Failed to generate date range report:", e);
      toast.error(
        safeGet(e, "response.data.detail", "Failed to generate report"),
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!report || report.length === 0) return;
    sendToPosPrinter(
      `Date Range Report (${filters.startDate.slice(5)} to ${filters.endDate.slice(5)})`,
      [
        { header: "Bill", accessor: (r) => r.bill_number, width: 6 },
        {
          header: "Date",
          accessor: (r) => formatDateToDDMMYYYY(r.bill_date).substring(0, 5),
          width: 6,
        },
        { header: "Tbl", accessor: (r) => r.table_no, width: 4 },
        {
          header: "Amount",
          accessor: (r) => Number(r.grand_total).toFixed(2),
          width: 10,
          align: "right",
        },
      ],
      report
    );
  };

  useEffect(() => {
    const handleCtrlP = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        if (report && report.length > 0) {
          e.preventDefault();
          handlePrint();
        }
      }
    };
    window.addEventListener("keydown", handleCtrlP);
    return () => window.removeEventListener("keydown", handleCtrlP);
  }, [report]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Date Range Report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={generateReport} disabled={loading}>
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Generate Report
            </Button>
            {report && report.length > 0 && (
              <Button onClick={handlePrint} variant="outline">
                Print Report
              </Button>
            )}
          </div>

          {report && (
            <div className="mt-6 space-y-4">
              {report.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell>{bill.bill_number}</TableCell>
                        <TableCell>
                          {formatDateToDDMMYYYY(bill.bill_date)}
                        </TableCell>
                        <TableCell>{bill.table_no}</TableCell>
                        <TableCell>
                          {Number(bill.grand_total).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No bills found for the selected date range
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ShiftReport({ sessionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split("T")[0],
    shiftName: "",
  });
  const [activeReportType, setActiveReportType] = useState("list");
  const [summaryReport, setSummaryReport] = useState(null);
  const [detailedReport, setDetailedReport] = useState(null);
  const [settings, setSettings] = useState({});
  const [asciiPreview, setAsciiPreview] = useState("");
  const [shiftOnlyReport, setShiftOnlyReport] = useState(null);

  useEffect(() => {
    fetchSettings().then((data) => setSettings(data || {}));
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/by-shift`, {
        params: {
          date: filters.date,
          shift_name: filters.shiftName,
        },
      });
      setReport(res.data);
      setActiveReportType("list");

      const rawText = generateAsciiReport(
        `Shift Bills (${filters.date.slice(5)} - ${filters.shiftName})`,
        [
          { header: "Bill", accessor: (r) => r.bill_number, width: 6 },
          { header: "Tbl", accessor: (r) => r.table_no, width: 4 },
          {
            header: "Amount",
            accessor: (r) => Number(r.grand_total).toFixed(2),
            width: 9,
            align: "right",
          },
          {
            header: "Time",
            accessor: (r) => new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            width: 9,
            align: "right",
          },
        ],
        res.data,
        settings
      );
      setAsciiPreview(rawText.replace(/\.\r?\n/g, ""));
      toast.success("Shift report generated successfully");
    } catch (e) {
      console.error("Failed to generate shift report:", e);
      toast.error(
        safeGet(e, "response.data.detail", "Failed to generate report"),
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!report || report.length === 0) return;
    sendToPosPrinter(
      `Shift Bills (${filters.date.slice(5)} - ${filters.shiftName})`,
      [
        { header: "Bill", accessor: (r) => r.bill_number, width: 6 },
        { header: "Tbl", accessor: (r) => r.table_no, width: 4 },
        {
          header: "Amount",
          accessor: (r) => Number(r.grand_total).toFixed(2),
          width: 9,
          align: "right",
        },
        {
          header: "Time",
          accessor: (r) => new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          width: 9,
          align: "right",
        },
      ],
      report
    );
  };

  const triggerActiveReportPrint = () => {
    if (activeReportType === "list" && report && report.length > 0) {
      sendToPosPrinter(
        `Shift Bills (${filters.date.slice(5)} - ${filters.shiftName})`,
        [
          { header: "Bill", accessor: (r) => r.bill_number, width: 6 },
          { header: "Tbl", accessor: (r) => r.table_no, width: 4 },
          {
            header: "Amount",
            accessor: (r) => Number(r.grand_total).toFixed(2),
            width: 9,
            align: "right",
          },
          {
            header: "Time",
            accessor: (r) => new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            width: 9,
            align: "right",
          },
        ],
        report
      );
    } else if (activeReportType === "summary" && summaryReport && summaryReport.length > 0) {
      sendToPosPrinter(
        `Shift Summary (${filters.date})`,
        [
          { header: "Shift Name", accessor: (r) => r.shift_name, width: 14 },
          {
            header: "GST Rs",
            accessor: (r) => Number(r.gst_amount).toFixed(2),
            width: 8,
            align: "right",
          },
          {
            header: "Total Rs",
            accessor: (r) => Number(r.total_amount).toFixed(2),
            width: 9,
            align: "right",
          },
        ],
        summaryReport
      );
    } else if (activeReportType === "detailed" && detailedReport && detailedReport.length > 0) {
      sendToPosPrinter(
        `Detailed Shift Rpt (${filters.shiftName})`,
        [
          { header: "Item Desc", accessor: (r) => r.item_name, width: 19 },
          { header: "Qty", accessor: (r) => r.total_quantity, width: 4 },
          {
            header: "Total Rs",
            accessor: (r) => Number(r.final_total).toFixed(2),
            width: 8,
            align: "right",
          },
        ],
        detailedReport
      );
    } else if (activeReportType === "shift-only" && shiftOnlyReport) {
      const shiftOnlyData = [
        { label: "Shift", value: shiftOnlyReport.shift_name || filters.shiftName },
        { label: "Bills", value: String(shiftOnlyReport.bill_count || 0) },
        { label: "Total Amount", value: `Rs. ${Number(shiftOnlyReport.total_amount || 0).toFixed(2)}` },
        { label: "GST Amount", value: `Rs. ${Number(shiftOnlyReport.gst_amount || 0).toFixed(2)}` },
      ];
      sendToPosPrinter(
        `Shift Only (${filters.shiftName} - ${filters.date})`,
        [
          { header: "Field", accessor: (r) => r.label, width: 15 },
          {
            header: "Value",
            accessor: (r) => r.value,
            width: 16,
            align: "right",
          },
        ],
        shiftOnlyData
      );
    }
  };

  useEffect(() => {
    const handleCtrlP = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        if (asciiPreview) {
          e.preventDefault();
          triggerActiveReportPrint();
        }
      }
    };
    window.addEventListener("keydown", handleCtrlP);
    return () => window.removeEventListener("keydown", handleCtrlP);
  }, [asciiPreview, activeReportType, report, summaryReport, detailedReport, shiftOnlyReport]);

  const handleGenerateSummary = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/reports/shift-summary`, {
        params: { date: filters.date },
      });
      const data = res.data;
      if (!data || data.length === 0) {
        toast.error("No shift data found for this date");
        return;
      }

      const summaryData = [...data];
      const totalAmount = data.reduce((s, r) => s + Number(r.amount), 0);
      const totalGst = data.reduce((s, r) => s + Number(r.gst_amount), 0);
      const grandTotal = data.reduce((s, r) => s + Number(r.total_amount), 0);

      summaryData.push({
        shift_name: "** TOTAL **",
        amount: totalAmount,
        gst_amount: totalGst,
        total_amount: grandTotal,
        date: "",
      });

      setSummaryReport(summaryData);
      setActiveReportType("summary");

      const rawText = generateAsciiReport(
        `Shift Summary (${filters.date})`,
        [
          { header: "Shift Name", accessor: (r) => r.shift_name, width: 14 },
          {
            header: "GST Rs",
            accessor: (r) => Number(r.gst_amount).toFixed(2),
            width: 8,
            align: "right",
          },
          {
            header: "Total Rs",
            accessor: (r) => Number(r.total_amount).toFixed(2),
            width: 9,
            align: "right",
          },
        ],
        summaryData,
        settings
      );
      setAsciiPreview(rawText.replace(/\.\r?\n/g, ""));
    } catch (e) {
      console.error("Failed to generate summary report:", e);
      toast.error("Failed to generate summary report");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDetailed = async () => {
    if (!filters.shiftName || filters.shiftName.trim() === "") {
      toast.error(
        "Please enter a shift name for detailed report",
      );
      return;
    }
    try {
      setLoading(true);
      const res = await axios.get(`${API}/reports/shift-detailed`, {
        params: { date: filters.date, shift_name: filters.shiftName },
      });
      const data = res.data;
      if (!data || data.length === 0) {
        toast.error("No items found for this shift");
        return;
      }

      const detailedData = [...data];
      const totalQty = data.reduce((s, r) => s + Number(r.total_quantity), 0);
      const totalAmount = data.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalGst = data.reduce((s, r) => s + Number(r.gst_amount), 0);
      const finalTotal = data.reduce((s, r) => s + Number(r.final_total), 0);

      detailedData.push({
        item_code: "",
        item_name: "** TOTAL **",
        category: "",
        total_quantity: totalQty,
        total_amount: totalAmount,
        gst_amount: totalGst,
        final_total: finalTotal,
      });

      setDetailedReport(detailedData);
      setActiveReportType("detailed");

      const rawText = generateAsciiReport(
        `Detailed Shift Rpt (${filters.shiftName})`,
        [
          { header: "Item Desc", accessor: (r) => r.item_name, width: 19 },
          { header: "Qty", accessor: (r) => r.total_quantity, width: 4 },
          {
            header: "Total Rs",
            accessor: (r) => Number(r.final_total).toFixed(2),
            width: 8,
            align: "right",
          },
        ],
        detailedData,
        settings
      );
      setAsciiPreview(rawText.replace(/\.\r?\n/g, ""));
    } catch (e) {
      console.error("Failed to generate detailed report:", e);
      toast.error("Failed to generate detailed report");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateShiftOnly = async () => {
    if (!filters.shiftName || filters.shiftName.trim() === "") {
      toast.error(
        "Please enter a shift name for shift only report",
      );
      return;
    }
    try {
      setLoading(true);
      const res = await axios.get(`${API}/reports/shift-only`, {
        params: { date: filters.date, shift_name: filters.shiftName },
      });
      const data = res.data;
      if (!data || (Number(data.bill_count) === 0 && Number(data.total_amount) === 0)) {
        toast.error("No bills found for this shift");
        return;
      }

      setShiftOnlyReport(data);
      setActiveReportType("shift-only");

      const shiftOnlyData = [
        { label: "Shift", value: data.shift_name || filters.shiftName },
        { label: "Bills", value: String(data.bill_count || 0) },
        { label: "Total Amount", value: `Rs. ${Number(data.total_amount || 0).toFixed(2)}` },
        { label: "GST Amount", value: `Rs. ${Number(data.gst_amount || 0).toFixed(2)}` },
      ];

      const rawText = generateAsciiReport(
        `Shift Only (${filters.shiftName} - ${filters.date})`,
        [
          { header: "Field", accessor: (r) => r.label, width: 15 },
          {
            header: "Value",
            accessor: (r) => r.value,
            width: 16,
            align: "right",
          },
        ],
        shiftOnlyData,
        settings
      );
      setAsciiPreview(rawText.replace(/\.\r?\n/g, ""));
    } catch (e) {
      console.error("Failed to generate shift only report:", e);
      toast.error("Failed to generate shift only report");
    } finally {
      setLoading(false);
    }
  };

  const isShiftNameEntered = filters.shiftName && filters.shiftName.trim() !== "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift Report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary Report Section at the top (before date input) */}
          <div className="border-b pb-4">
            <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">Day Summary Report</h3>
            <Button
              onClick={handleGenerateSummary}
              variant="outline"
              disabled={loading}
              className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
            >
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Summary Report (All Shifts)
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={filters.date}
                onChange={(e) =>
                  setFilters({ ...filters, date: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Shift</Label>
              <Input
                type="text"
                value={filters.shiftName}
                onChange={(e) =>
                  setFilters({ ...filters, shiftName: e.target.value })
                }
                placeholder="Enter Shift Name"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={generateReport}
              disabled={loading || !isShiftNameEntered}
            >
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Generate Bill List
            </Button>
            <Button
              onClick={handleGenerateDetailed}
              variant="outline"
              disabled={loading || !isShiftNameEntered}
              className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200 disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Detailed Report
            </Button>
            <Button
              onClick={handleGenerateShiftOnly}
              variant="outline"
              disabled={loading || !isShiftNameEntered}
              className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Shift Only
            </Button>
          </div>

          {asciiPreview && (
            <div className="flex justify-between items-center bg-gray-100 p-3 rounded border border-gray-300">
              <span className="text-sm font-semibold text-gray-700">Preview Generated Successfully</span>
              <Button
                onClick={triggerActiveReportPrint}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-2 shadow transition-all"
              >
                Print Report (Ctrl + P)
              </Button>
            </div>
          )}

          {asciiPreview && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 border-t pt-6">
              {/* HTML Report View (Colspan 7) */}
              <div className="lg:col-span-7 space-y-4">
                {activeReportType === "list" && report && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-800">Shift Bills</h3>
                    {report.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bill No</TableHead>
                            <TableHead>Table</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.map((bill) => (
                            <TableRow key={bill.id}>
                              <TableCell>{bill.bill_number}</TableCell>
                              <TableCell>{bill.table_no}</TableCell>
                              <TableCell>
                                ₹{Number(bill.grand_total).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                {new Date(bill.created_at).toLocaleTimeString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No bills found for the selected shift
                      </div>
                    )}
                  </div>
                )}

                {activeReportType === "summary" && summaryReport && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-800">Shift Summary Report</h3>
                    {summaryReport.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Shift Name</TableHead>
                            <TableHead className="text-right">GST Rs</TableHead>
                            <TableHead className="text-right">Total Rs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summaryReport.map((row, idx) => (
                            <TableRow
                              key={idx}
                              className={row.shift_name === "** TOTAL **" ? "font-bold bg-gray-50 text-black border-t-2 border-gray-400" : ""}
                            >
                              <TableCell>{row.shift_name}</TableCell>
                              <TableCell className="text-right">
                                ₹{Number(row.gst_amount).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                ₹{Number(row.total_amount).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No shift summary found for this date
                      </div>
                    )}
                  </div>
                )}

                {activeReportType === "detailed" && detailedReport && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-800">Detailed Shift Report ({filters.shiftName})</h3>
                    {detailedReport.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item Desc</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Total Rs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailedReport.map((row, idx) => (
                            <TableRow
                              key={idx}
                              className={row.item_name === "** TOTAL **" ? "font-bold bg-gray-50 text-black border-t-2 border-gray-400" : ""}
                            >
                              <TableCell>{row.item_name}</TableCell>
                              <TableCell className="text-right">
                                {row.total_quantity}
                              </TableCell>
                              <TableCell className="text-right">
                                ₹{Number(row.final_total).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No items found for this shift
                      </div>
                    )}
                  </div>
                )}

                {activeReportType === "shift-only" && shiftOnlyReport && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-800">Shift Only Report ({filters.shiftName})</h3>
                    <div className="bg-white border rounded-lg p-6 space-y-3">
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600 font-medium">Shift Name</span>
                        <span className="font-bold text-lg">{shiftOnlyReport.shift_name || filters.shiftName}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600 font-medium">Number of Bills</span>
                        <span className="font-bold text-lg">{shiftOnlyReport.bill_count || 0}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-gray-600 font-medium">Total Amount</span>
                        <span className="font-bold text-xl text-green-700">₹{Number(shiftOnlyReport.total_amount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-gray-600 font-medium">GST Amount (Display Only)</span>
                        <span className="font-semibold text-gray-700">₹{Number(shiftOnlyReport.gst_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Thermal Receipt Print Spool Preview (Colspan 5) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-start bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200">
                <span className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">POS Bill Paper Preview</span>
                <div style={{
                  background: "#ffffff",
                  color: "#000000",
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: "12px",
                  lineHeight: "1.3",
                  padding: "20px 15px",
                  borderLeft: "2px dashed #ccc",
                  borderRight: "2px dashed #ccc",
                  boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
                  width: "100%",
                  maxWidth: "300px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all"
                }}>
                  {asciiPreview}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ItemReport({ sessionId }) {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [itemNames, setItemNames] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dropdownsLoaded, setDropdownsLoaded] = useState(false);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    item_name: "",
    category: "",
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [namesRes, categoriesRes] = await Promise.all([
          axios.get(`${API}/items/names/all`),
          axios.get(`${API}/items/categories/all`),
        ]);
        setItemNames(safeArray(namesRes.data));
        setCategories(safeArray(categoriesRes.data));
        setDropdownsLoaded(true);
      } catch (e) {
        console.error("Failed to fetch dropdown data:", e);
        setDropdownsLoaded(false);
      }
    };
    fetchDropdownData();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const params = {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };
      if (filters.item_name) params.item_name = filters.item_name;
      if (filters.category) params.category = filters.category;

      const res = await axios.get(`${API}/reports/by-item`, {
        params,
      });
      setReport(safeArray(res.data));
      toast.success("Item report generated successfully");
    } catch (e) {
      console.error("Failed to generate item report:", e);
      toast.error(
        safeGet(e, "response.data.detail", "Failed to generate report"),
      );
      setReport([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!report || report.length === 0) return;
    sendToPosPrinter(
      `Item Sales (${filters.startDate.slice(5)} to ${filters.endDate.slice(5)})`,
      [
        { header: "Item", accessor: (r) => r.itemName, width: 17 },
        { header: "Qty", accessor: (r) => r.totalQuantity, width: 4 },
        {
          header: "Amount",
          accessor: (r) => Number(r.totalAmount).toFixed(2),
          width: 10,
          align: "right",
        },
      ],
      report
    );
  };

  useEffect(() => {
    const handleCtrlP = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        if (report && report.length > 0) {
          e.preventDefault();
          handlePrint();
        }
      }
    };
    window.addEventListener("keydown", handleCtrlP);
    return () => window.removeEventListener("keydown", handleCtrlP);
  }, [report]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Item Sales Report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Item Name (optional)</Label>
              {dropdownsLoaded && itemNames.length > 0 ? (
                <select
                  className="w-full p-2 border rounded"
                  value={filters.item_name}
                  onChange={(e) =>
                    setFilters({ ...filters, item_name: e.target.value })
                  }
                >
                  <option value="">All Items</option>
                  {itemNames.map((name, index) => (
                    <option key={index} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type="text"
                  placeholder="Type item name..."
                  value={filters.item_name}
                  onChange={(e) =>
                    setFilters({ ...filters, item_name: e.target.value })
                  }
                />
              )}
            </div>
            <div>
              <Label>Category (optional)</Label>
              {dropdownsLoaded && categories.length > 0 ? (
                <select
                  className="w-full p-2 border rounded"
                  value={filters.category}
                  onChange={(e) =>
                    setFilters({ ...filters, category: e.target.value })
                  }
                >
                  <option value="">All Categories</option>
                  {categories.map((cat, index) => (
                    <option key={index} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type="text"
                  placeholder="Type category..."
                  value={filters.category}
                  onChange={(e) =>
                    setFilters({ ...filters, category: e.target.value })
                  }
                />
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={generateReport} disabled={loading}>
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Generate Report
            </Button>
            {report.length > 0 && (
              <Button onClick={handlePrint} variant="outline">
                Print Report
              </Button>
            )}
          </div>

          {report.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium mb-4">Item Sales Breakdown</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {item.itemName}
                      </TableCell>
                      <TableCell>{item.category || "N/A"}</TableCell>
                      <TableCell className="font-bold">
                        {item.totalQuantity}
                      </TableCell>
                      <TableCell>₹{item.totalAmount?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {report.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">
              No data available for the selected date range
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CategoryReport({ sessionId }) {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [dropdownsLoaded, setDropdownsLoaded] = useState(false);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    category: "",
  });

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const categoriesRes = await axios.get(`${API}/items/categories/all`);
        setCategories(safeArray(categoriesRes.data));
        setDropdownsLoaded(true);
      } catch (e) {
        console.error("Failed to fetch categories list:", e);
        setDropdownsLoaded(false);
      }
    };
    fetchDropdownData();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const params = {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };
      if (filters.category) params.category = filters.category;

      const res = await axios.get(`${API}/reports/category-report`, {
        params,
      });
      setReport(safeArray(res.data));
      toast.success("Category report generated successfully");
    } catch (e) {
      console.error("Failed to generate category report:", e);
      toast.error(
        safeGet(e, "response.data.detail", "Failed to generate category report")
      );
      setReport([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!report || report.length === 0) return;
    const isAllCategories = !filters.category;
    const columns = isAllCategories
      ? [
          { header: "Category", accessor: (r) => r.categoryName, width: 20 },
          { header: "Qty", accessor: (r) => r.totalQuantity, width: 6 },
          {
            header: "Amount",
            accessor: (r) => Number(r.totalAmount).toFixed(2),
            width: 12,
            align: "right",
          },
        ]
      : [
          { header: "Item", accessor: (r) => r.itemName, width: 17 },
          { header: "Cat", accessor: (r) => r.categoryName, width: 7 },
          { header: "Qty", accessor: (r) => r.totalQuantity, width: 4 },
          {
            header: "Amount",
            accessor: (r) => Number(r.totalAmount).toFixed(2),
            width: 10,
            align: "right",
          },
        ];

    sendToPosPrinter(
      `Category Sales (${filters.startDate.slice(5)} to ${filters.endDate.slice(5)})`,
      columns,
      report
    );
  };

  useEffect(() => {
    const handleCtrlP = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        if (report && report.length > 0) {
          e.preventDefault();
          handlePrint();
        }
      }
    };
    window.addEventListener("keydown", handleCtrlP);
    return () => window.removeEventListener("keydown", handleCtrlP);
  }, [report]);

  const totalCategorySum = report.reduce((sum, item) => sum + parseInt(item.totalQuantity || 0), 0);
  const totalAmountSum = report.reduce((sum, item) => sum + parseFloat(item.totalAmount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Sales Report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Category</Label>
              {dropdownsLoaded && categories.length > 0 ? (
                <select
                  className="w-full p-2 border rounded text-white bg-black"
                  value={filters.category}
                  onChange={(e) =>
                    setFilters({ ...filters, category: e.target.value })
                  }
                >
                  <option value="">All Categories</option>
                  {categories.map((cat, index) => (
                    <option key={index} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type="text"
                  placeholder="Type category..."
                  value={filters.category}
                  onChange={(e) =>
                    setFilters({ ...filters, category: e.target.value })
                  }
                />
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={generateReport} disabled={loading}>
              {loading ? <Loader2 size={16} className="mr-2" /> : null}
              Generate Report
            </Button>
            {report.length > 0 && (
              <Button onClick={handlePrint} variant="outline">
                Print Report
              </Button>
            )}
          </div>

          {report.length > 0 && (
            <div className="mt-6 space-y-4">
              <h4 className="font-medium mb-2">
                {!filters.category ? "All Categories Sales Summary" : "Category Sales Breakdown"}
              </h4>
              <Table>
                <TableHeader>
                  {!filters.category ? (
                    <TableRow>
                      <TableHead>Category Name</TableHead>
                      <TableHead className="text-right">Total Items (Quantity)</TableHead>
                      <TableHead className="text-right">Total Value (Amount)</TableHead>
                    </TableRow>
                  ) : (
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  )}
                </TableHeader>
                <TableBody>
                  {report.map((item, index) => (
                    <TableRow key={index}>
                      {!filters.category ? (
                        <>
                          <TableCell className="font-semibold">
                            {item.categoryName}
                          </TableCell>
                          <TableCell className="font-bold text-right">
                            {item.totalQuantity}
                          </TableCell>
                          <TableCell className="text-right">
                            ₹{item.totalAmount?.toFixed(2)}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">
                            {item.itemName}
                          </TableCell>
                          <TableCell>{item.categoryName}</TableCell>
                          <TableCell className="font-bold text-right">
                            {item.totalQuantity}
                          </TableCell>
                          <TableCell className="text-right">
                            ₹{item.totalAmount?.toFixed(2)}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="font-bold bg-zinc-900">
                    {!filters.category ? (
                      <>
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{totalCategorySum}</TableCell>
                        <TableCell className="text-right">₹{totalAmountSum.toFixed(2)}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>Total</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell className="text-right">{totalCategorySum}</TableCell>
                        <TableCell className="text-right">₹{totalAmountSum.toFixed(2)}</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableBody>
              </Table>
              
              <div className="p-4 bg-zinc-900 border rounded-lg flex justify-between items-center text-lg font-bold">
                <span>Total Category Quantity Sum:</span>
                <span className="text-emerald-400">{totalCategorySum}</span>
              </div>
            </div>
          )}

          {report.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">
              No category data available for the selected range/category
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
