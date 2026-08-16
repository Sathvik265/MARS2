import React, { useState, useEffect, useRef } from "react";
import { getBillsByDate, getBillById } from "../services/api";
import { useUser } from "../context/UserContext";
import { formatDateToDDMMYYYY } from "../utils/helpers";
import "../styles/RecentBills.css";

function RecentBills({ billingDate }) {
  const { track } = useUser();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBill, setSelectedBill] = useState(null);
  const [focusedBillIndex, setFocusedBillIndex] = useState(-1); // For keyboard navigation
  const [expandedBillId, setExpandedBillId] = useState(null); // For showing/hiding items
  const [billDetailsCache, setBillDetailsCache] = useState({});
  const rowRefs = useRef([]);

  const fetchBills = React.useCallback(async () => {
    if (!billingDate) {
      setBills([]);
      return;
    }
    try {
      setLoading(true);
      const response = await getBillsByDate(billingDate);
      const normalized = (response || []).map((b) => normalizeBill(b));
      setBills(normalized);
      setFocusedBillIndex(normalized && normalized.length > 0 ? 0 : -1); // Set focus to first bill
      setError(null);
    } catch (err) {
      console.error("Error fetching bills:", err);
      setError("Failed to fetch bills");
    } finally {
      setLoading(false);
    }
  }, [billingDate]);

  const filteredBills = bills.filter(
    (bill) => {
      // Show only bills matching the current active track (if track is selected)
      const matchesTrack = !track || String(bill.track).toLowerCase() === String(track).toLowerCase();
      if (!matchesTrack) return false;

      return (
        (bill.bill_number || "").toString().includes(searchTerm) ||
        String(bill.table_no || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        String(bill.track || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      );
    }
  );

  // Normalize bill returned by backend to a consistent shape used by UI
  const normalizeBill = (raw) => {
    if (!raw) return raw;
    const bill = { ...raw };
    let items = [];
    if (Array.isArray(raw.items) && raw.items.length > 0) {
      items = raw.items;
    } else if (raw.items_json) {
      try {
        items =
          typeof raw.items_json === "string"
            ? JSON.parse(raw.items_json)
            : raw.items_json;
      } catch (e) {
        // fallback: treat as empty
        items = [];
      }
    }

    // Map item keys to UI-friendly keys
    const mapped = items.map((it) => {
      const q = it.quantity || it.qty;
      const finalQty =
        q && typeof q === "object" ? q.qty || q.quantity || 1 : q || 1;

      const n = it.item_name || it.name || it.item_name;
      const finalName =
        n && typeof n === "object" ? n.name || n.item_name || "" : n || "";

      return {
        code: it.item_code_numeric || it.numeric_item_code || it.numeric_code || "",
        name: finalName,
        quantity: finalQty,
        unit_price:
          it.unit_price || it.fixed_price || it.actual_price || it.price || 0,
        line_total:
          it.line_total ||
          Number((finalQty || 1) * (it.unit_price || it.fixed_price || 0)),
      };
    });

    bill.items = mapped;
    // ensure grand_total available as number/string
    bill.grand_total = bill.grand_total || bill.total || 0;
    return bill;
  };

  const toggleBillAtIndex = React.useCallback(
    async (index) => {
      const bill = filteredBills[index];
      if (!bill) return;

      // If already expanded, collapse
      if (expandedBillId === bill.id) {
        setExpandedBillId(null);
        setSelectedBill(null);
        return;
      }

      // If cached, use cache
      if (billDetailsCache[bill.id]) {
        setSelectedBill(billDetailsCache[bill.id]);
        setExpandedBillId(bill.id);
        return;
      }

      try {
        const raw = await getBillById(bill.id);
        const fullBill = normalizeBill(raw);
        setBillDetailsCache((prev) => ({ ...prev, [bill.id]: fullBill }));
        setSelectedBill(fullBill);
        setExpandedBillId(bill.id);
      } catch (err) {
        console.error("Failed to fetch bill details:", err);
      }
    },
    [filteredBills, billDetailsCache, expandedBillId],
  );

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      // Global shortcuts (work even if list is empty)
      if (((event.altKey || event.metaKey) && event.key.toLowerCase() === "s") || (isCmdOrCtrl && event.key.toLowerCase() === "s")) {
        event.preventDefault();
        const searchEl = document.getElementById("recent-bills-search");
        if (searchEl) searchEl.focus();
        return;
      }

      if (filteredBills.length === 0) return;

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          setFocusedBillIndex((prevIndex) =>
            prevIndex <= 0 ? filteredBills.length - 1 : prevIndex - 1,
          );
          break;
        case "ArrowDown":
          event.preventDefault();
          setFocusedBillIndex((prevIndex) =>
            prevIndex >= filteredBills.length - 1 ? 0 : prevIndex + 1,
          );
          break;
        case "Enter":
        case " ": // Space
          event.preventDefault();
          if (focusedBillIndex !== -1) {
            toggleBillAtIndex(focusedBillIndex);
          }
          break;
        case "Escape":
          setSearchTerm("");
          break;
        case "F3":
          // focus search box by id
          const searchEl = document.getElementById("recent-bills-search");
          if (searchEl) searchEl.focus();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredBills, focusedBillIndex, toggleBillAtIndex]); // include toggleBillAtIndex

  // Focus the DOM node corresponding to focusedBillIndex
  useEffect(() => {
    if (
      focusedBillIndex >= 0 &&
      rowRefs.current &&
      rowRefs.current[focusedBillIndex]
    ) {
      try {
        rowRefs.current[focusedBillIndex].focus();
      } catch (e) {
        /* ignore focus errors */
      }
    }
  }, [focusedBillIndex, filteredBills]);

  // Clamp focused index when filteredBills change
  useEffect(() => {
    if (filteredBills.length === 0) {
      setFocusedBillIndex(-1);
    } else if (focusedBillIndex === -1) {
      setFocusedBillIndex(0);
    } else if (focusedBillIndex >= filteredBills.length) {
      setFocusedBillIndex(filteredBills.length - 1);
    }
  }, [filteredBills, focusedBillIndex]);

  if (loading) {
    return (
      <div className="recent-bills-container">
        <div className="system-title">Udupi Anand Bhavan — Billing System</div>
        <div className="nav-section">
          <div className="nav-tabs">
            <div className="nav-tab">📋 Billing</div>
            <div className="nav-tab">🍽️ Food Menu</div>
            <div className="nav-tab active">📄 Recent Bills</div>
            <div className="nav-tab">⚙️ Admin</div>
          </div>
        </div>
        <div className="loading-section">
          <div>Loading bills...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-bills-wrapper">
      <div className="recent-bills-header">
        <h2>Billing for {formatDateToDDMMYYYY(billingDate) || billingDate}</h2>
        <div className="search-inline">
          <input
            id="recent-bills-search"
            className="search-input"
            placeholder="Search bill no or table..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {error && <div className="recent-error">{error}</div>}
      </div>

      <div className="cards-container">
        {filteredBills.length === 0 && (
          <div className="empty-message">
            {searchTerm
              ? `No bills found matching "${searchTerm}"`
              : `No bills found for ${billingDate}`}
          </div>
        )}

        {filteredBills.map((bill, index) => {
          const isSearchActive = searchTerm.trim() !== "";
          const isExpanded = isSearchActive || expandedBillId === bill.id;
          return (
            <div
              key={bill.id}
              ref={(el) => (rowRefs.current[index] = el)}
              tabIndex={0}
              className={`bill-card ${isExpanded ? "expanded" : ""} ${
                focusedBillIndex === index ? "focused" : ""
              }`}
              onClick={async () => {
                // If search is active, cards are kept expanded by default
                if (isSearchActive) {
                  setFocusedBillIndex(index);
                  return;
                }
                if (isExpanded) {
                  setExpandedBillId(null);
                } else {
                  setExpandedBillId(bill.id);
                }
                setFocusedBillIndex(index);
              }}
            >
              <div className="card-top">
                <div className="card-left">
                  <div className="bill-title">
                    Bill #{bill.bill_number} — T:{bill.table_no} P:
                    {bill.party_no} S:{bill.track}
                  </div>
                  <div className="bill-time">
                    {new Date(bill.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="card-right">
                  <div className="bill-amount">
                    ₹{parseFloat(bill.grand_total).toFixed(2)}
                  </div>
                  <div className="expand-icon">{isExpanded ? "▲" : "▼"}</div>
                </div>
              </div>

              {isExpanded && bill.items && bill.items.length > 0 && (
                <div className="card-body">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: "15%", textAlign: "left" }}>Code</th>
                        <th style={{ width: "40%", textAlign: "left" }}>Item</th>
                        <th className="col-qty" style={{ width: "15%", textAlign: "right" }}>Qty</th>
                        <th className="col-price" style={{ width: "15%", textAlign: "right" }}>Price</th>
                        <th className="col-total" style={{ width: "15%", textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bill.items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.code}</td>
                          <td>{it.name}</td>
                          <td className="col-qty">{it.quantity}</td>
                          <td className="col-price">
                            ₹{parseFloat(it.unit_price).toFixed(2)}
                          </td>
                          <td className="col-total">
                            ₹{parseFloat(it.line_total).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td colSpan={4} className="total-label">
                          Total Amount:
                        </td>
                        <td className="col-total">
                          ₹{parseFloat(bill.grand_total).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RecentBills;
