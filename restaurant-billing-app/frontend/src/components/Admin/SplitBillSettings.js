import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Loader2,
  Button,
} from "../ui/UIComponents";

import { API as HELPER_API } from "../../utils/helpers";

const API = process.env.REACT_APP_API_URL || HELPER_API || "http://127.0.0.1:8000/api";

// ── Item Row ──────────────────────────────────────────────────────────────────
function ItemRow({ item, onChangeCategory, maxCategory, saving }) {
  const isSeparate = (item.split_category || 0) > 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.55rem 0.75rem",
        borderRadius: "0.5rem",
        background: isSeparate ? "#eef2ff" : "transparent",
        borderLeft: isSeparate ? "3px solid #6366f1" : "3px solid transparent",
        transition: "background 0.15s, border-color 0.15s",
        opacity: saving ? 0.5 : 1,
      }}
    >
      {/* Numeric code badge */}
      <span
        style={{
          minWidth: "2.2rem",
          textAlign: "center",
          fontSize: "0.7rem",
          fontWeight: 700,
          padding: "0.1rem 0.35rem",
          borderRadius: "0.25rem",
          background: isSeparate ? "#e0e7ff" : "#374151",
          fontFamily: "monospace",
          color: isSeparate ? "#3730a3" : "#e5e7eb",
        }}
      >
        {item.numeric_code || item.alpha_code || "—"}
      </span>

      {/* Name */}
      <span style={{ flex: 1, fontSize: "0.875rem", fontWeight: isSeparate ? 600 : 400, color: isSeparate ? "#1e1b4b" : "#f9fafb" }}>
        {item.name}
      </span>

      {/* Price */}
      <span style={{ fontSize: "0.8rem", color: isSeparate ? "#3730a3" : "#9ca3af", minWidth: "3.5rem", textAlign: "right" }}>
        ₹{item.price_general}
      </span>

      {/* Split Category Dropdown */}
      <select
        value={item.split_category || 0}
        onChange={(e) => onChangeCategory(item, parseInt(e.target.value, 10) || 0)}
        disabled={saving}
        style={{
          padding: "0.2rem 0.4rem",
          borderRadius: "0.375rem",
          border: "1px solid #d1d5db",
          background: "white",
          color: "black",
          fontSize: "0.8rem",
          outline: "none",
          cursor: "pointer",
        }}
      >
        {Array.from({ length: maxCategory + 1 }, (_, i) => (
          <option key={i} value={i}>
            {i === 0 ? "None" : `Split ${i}`}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SplitBillSettings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "separate" | "regular"
  const [saving, setSaving] = useState({}); // { [itemId]: true }
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [focusedPill, setFocusedPill] = useState(null);
  const [maxCategory, setMaxCategory] = useState(3);

  useEffect(() => { fetchItems(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API}/items`);
      const menu = res.data || [];
      setItems(menu.sort((a, b) => a.name.localeCompare(b.name)));
      
      // Determine initial max category from existing items
      const currentMax = Math.max(3, ...menu.map(i => parseInt(i.split_category, 10) || 0));
      setMaxCategory(currentMax);
    } catch {
      setError("Failed to load items");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeCategory = async (item, newCategory) => {
    if (saving[item.id]) return;

    // Optimistic update
    setItems(prev =>
      prev.map(i => i.id === item.id ? { ...i, split_category: newCategory, is_separate: newCategory > 0 } : i)
    );
    setSaving(prev => ({ ...prev, [item.id]: true }));

    try {
      await axios.patch(`${API}/items/${item.id}/split-category`, { split_category: newCategory });
      setToast({
        type: "success",
        msg: `${item.name} → ${newCategory > 0 ? `Split ${newCategory} ✓` : "Regular Bill"}`,
      });
    } catch {
      // Revert
      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, split_category: item.split_category, is_separate: item.is_separate } : i)
      );
      setToast({ type: "error", msg: `Failed to update ${item.name}` });
    } finally {
      setSaving(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const separateItems = useMemo(() => items.filter(i => (i.split_category || 0) > 0), [items]);
  const regularItems = useMemo(() => items.filter(i => (i.split_category || 0) === 0), [items]);

  const filteredItems = useMemo(() => {
    const pool =
      filterMode === "separate" ? separateItems :
        filterMode === "regular" ? regularItems : items;
    const q = search.toLowerCase().trim();
    if (!q) return pool;
    return pool.filter(i =>
      i.name.toLowerCase().includes(q) ||
      String(i.alpha_code || "").toLowerCase().includes(q) ||
      String(i.numeric_code || "").includes(q)
    );
  }, [items, search, filterMode, separateItems, regularItems]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "16rem" }}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  const pillStyle = (active, focused) => ({
    padding: "0.3rem 0.85rem",
    borderRadius: "9999px",
    fontSize: "0.8rem",
    fontWeight: 600,
    border: "1.5px solid",
    cursor: "pointer",
    transition: "all 0.15s",
    background: active ? "#6366f1" : "transparent",
    borderColor: active ? "#6366f1" : "#d1d5db",
    color: active ? "white" : "#374151",
    outline: "none",
    boxShadow: focused ? "0 0 0 3px rgba(99, 102, 241, 0.4)" : "none",
  });

  return (
    <div style={{ padding: "0.5rem", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "1.25rem", right: "1.5rem", zIndex: 9999,
          padding: "0.75rem 1.25rem",
          borderRadius: "0.5rem",
          background: toast.type === "success" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${toast.type === "success" ? "#86efac" : "#fca5a5"}`,
          color: toast.type === "success" ? "#166534" : "#991b1b",
          fontSize: "0.875rem",
          fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          maxWidth: "320px",
        }}>
          {toast.msg}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", background: "#fef2f2", borderRadius: "0.5rem", color: "#991b1b", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {/* ── Header stats row ── */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {[
          { label: "Total Items", value: items.length, color: "#6366f1", bg: "#eef2ff" },
          { label: "Separate Bill", value: separateItems.length, color: "#059669", bg: "#f0fdf4" },
          { label: "Regular Bill", value: regularItems.length, color: "#d97706", bg: "#fffbeb" },
        ].map(s => (
          <div key={s.label} style={{
            padding: "0.6rem 1.2rem",
            borderRadius: "0.6rem",
            background: s.bg,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{s.label}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <Button
          onClick={() => setMaxCategory(prev => prev + 1)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm shadow-sm transition-all focus:ring-2 focus:ring-indigo-500"
        >
          + Add Split Category
        </Button>
      </div>

      {/* ── Two-panel layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1rem", alignItems: "start" }}>

        {/* LEFT: Full item list */}
        <Card>
          <CardHeader>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <CardTitle style={{ fontSize: "1rem", margin: 0 }}>All Menu Items</CardTitle>
              <div style={{ flex: 1, minWidth: "160px", position: "relative" }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="🔍 Search name / code…"
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.75rem",
                    borderRadius: "0.375rem",
                    border: searchFocused ? "1.5px solid #6366f1" : "1px solid #d1d5db",
                    boxShadow: searchFocused ? "0 0 0 3px rgba(99, 102, 241, 0.2)" : "none",
                    fontSize: "0.85rem",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                />
              </div>
              {/* Filter pills */}
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {[["all", "All"], ["separate", "Separate"], ["regular", "Regular"]].map(([val, lbl]) => (
                  <button
                    key={val}
                    style={pillStyle(filterMode === val, focusedPill === val)}
                    onClick={() => setFilterMode(val)}
                    onFocus={() => setFocusedPill(val)}
                    onBlur={() => setFocusedPill(null)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: "0.5rem" }}>
              Assign items to a specific **Split Category** (Split 1, Split 2, etc.) to print them on separate tickets when that split level is selected.
            </div>

            {/* Column headers */}
            <div style={{
              display: "flex", alignItems: "center", gap: "0.75rem",
              padding: "0.3rem 0.75rem", fontSize: "0.7rem", fontWeight: 700,
              color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em",
              borderBottom: "1px solid #f3f4f6", marginBottom: "0.25rem",
            }}>
              <span style={{ minWidth: "2.2rem" }}>Code</span>
              <span style={{ flex: 1 }}>Name</span>
              <span style={{ minWidth: "3.5rem", textAlign: "right" }}>Price</span>
              <span style={{ minWidth: "2.75rem", textAlign: "right" }}>Category</span>
            </div>

            <div style={{ maxHeight: "58vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              {filteredItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onChangeCategory={handleChangeCategory}
                  maxCategory={maxCategory}
                  saving={!!saving[item.id]}
                />
              ))}
              {filteredItems.length === 0 && (
                <div style={{ textAlign: "center", padding: "2.5rem", color: "#9ca3af" }}>
                  No items match your filter
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Separate items summary panel */}
        <Card style={{ position: "sticky", top: "1rem" }}>
          <CardHeader>
            <CardTitle style={{ fontSize: "0.95rem", margin: 0, color: "#6366f1" }}>
              ✂ Split Bill Groupings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {separateItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0", color: "#9ca3af", fontSize: "0.85rem" }}>
                No items assigned to split categories yet.
                <br />
                Select a Split category for any item.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "60vh", overflowY: "auto" }}>
                {Array.from({ length: maxCategory }, (_, idx) => {
                  const cat = idx + 1;
                  const catItems = separateItems.filter(i => (i.split_category || 0) === cat);
                  if (catItems.length === 0) return null;
                  return (
                    <div key={cat}>
                      <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#4f46e5", marginBottom: "0.35rem", borderBottom: "1px solid #e0e7ff", paddingBottom: "0.15rem" }}>
                        Split Bill {cat} ({catItems.length})
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        {catItems.map(item => (
                          <div key={item.id} style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "0.4rem 0.5rem",
                            background: "#eef2ff",
                            borderRadius: "0.375rem",
                            fontSize: "0.8rem",
                          }}>
                            <span style={{ fontWeight: 500, color: "#1e1b4b" }}>{item.name}</span>
                            <button
                              onClick={() => handleChangeCategory(item, 0)}
                              title="Remove from split"
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "#6366f1", fontSize: "0.9rem", lineHeight: 1, padding: "0.1rem 0.2rem",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {separateItems.length > 0 && (
              <div style={{
                marginTop: "0.75rem",
                paddingTop: "0.6rem",
                borderTop: "1px solid #e0e7ff",
                fontSize: "0.75rem",
                color: "#6b7280",
                textAlign: "center",
              }}>
                {separateItems.length} item{separateItems.length !== 1 ? "s" : ""} will print on separate tickets
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
