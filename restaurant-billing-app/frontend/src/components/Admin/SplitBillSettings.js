import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Loader2,
} from "../ui/UIComponents";

const API = process.env.REACT_APP_API_URL;

// ── Toggle Switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "2.75rem",
        height: "1.5rem",
        borderRadius: "9999px",
        border: "none",
        cursor: "pointer",
        transition: "background 0.2s, box-shadow 0.2s",
        background: checked ? "#6366f1" : "#d1d5db",
        flexShrink: 0,
        outline: "none",
        boxShadow: focused ? "0 0 0 3px rgba(99, 102, 241, 0.6)" : "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          width: "1.1rem",
          height: "1.1rem",
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 0.2s",
          left: checked ? "calc(100% - 1.25rem)" : "0.2rem",
        }}
      />
    </button>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────
function ItemRow({ item, onToggle, saving }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.55rem 0.75rem",
        borderRadius: "0.5rem",
        background: item.is_separate ? "#eef2ff" : "transparent",
        borderLeft: item.is_separate ? "3px solid #6366f1" : "3px solid transparent",
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
          background: item.is_separate ? "#e0e7ff" : "#374151",
          fontFamily: "monospace",
          color: item.is_separate ? "#3730a3" : "#e5e7eb",
        }}
      >
        {item.numeric_code || item.alpha_code || "—"}
      </span>

      {/* Name */}
      <span style={{ flex: 1, fontSize: "0.875rem", fontWeight: item.is_separate ? 600 : 400, color: item.is_separate ? "#1e1b4b" : "#f9fafb" }}>
        {item.name}
      </span>

      {/* Price */}
      <span style={{ fontSize: "0.8rem", color: item.is_separate ? "#3730a3" : "#9ca3af", minWidth: "3.5rem", textAlign: "right" }}>
        ₹{item.price_general}
      </span>

      {/* Toggle */}
      <Toggle checked={!!item.is_separate} onChange={() => onToggle(item)} />
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

  useEffect(() => { fetchItems(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API}/items`);
      setItems(
        (res.data || []).sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {
      setError("Failed to load items");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (item) => {
    if (saving[item.id]) return;
    const newStatus = !item.is_separate;

    // Optimistic update
    setItems(prev =>
      prev.map(i => i.id === item.id ? { ...i, is_separate: newStatus } : i)
    );
    setSaving(prev => ({ ...prev, [item.id]: true }));

    try {
      await axios.patch(`${API}/items/${item.id}/separate`, { is_separate: newStatus });
      setToast({
        type: "success",
        msg: `${item.name} → ${newStatus ? "Separate Bill ✓" : "Regular Bill"}`,
      });
    } catch {
      // Revert
      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, is_separate: item.is_separate } : i)
      );
      setToast({ type: "error", msg: `Failed to update ${item.name}` });
    } finally {
      setSaving(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const separateItems = useMemo(() => items.filter(i => i.is_separate), [items]);
  const regularItems = useMemo(() => items.filter(i => !i.is_separate), [items]);

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
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
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
              Toggle the switch to mark items as <strong>Separate Bill</strong> (they print on their own ticket when split billing is active).
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
              <span style={{ minWidth: "2.75rem" }}>Split</span>
            </div>

            <div style={{ maxHeight: "58vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
              {filteredItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
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
              ✂ Separate Bill Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            {separateItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0", color: "#9ca3af", fontSize: "0.85rem" }}>
                No items marked as separate yet.
                <br />
                Toggle the switch on any item.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {separateItems.map(item => (
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
                      onClick={() => handleToggle(item)}
                      title="Remove"
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
                {separateItems.length} item{separateItems.length !== 1 ? "s" : ""} will print on a separate ticket
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
