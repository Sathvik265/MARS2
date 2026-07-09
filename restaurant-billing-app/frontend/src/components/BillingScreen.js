import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
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
import {
  createOrder,
  createBill as createBillAPI,
  getBillById,
  getPendingOrdersByTableAndParty,
  getAllPendingOrders,
  getLastBillNumber,
  updateOrder,
  deleteOrder,
} from "../services/api";
import { API, toast, safeGet, safeArray, safeObject } from "../utils/helpers";
import { generateAsciiReceipt } from "../utils/receiptGenerator";

export const getSectionForTable = (tableNo) => {
  const table = parseInt(tableNo, 10);
  if (isNaN(table)) return "G";
  if (table === 1) return "P";
  if (table >= 15 && table <= 30) return "AC";
  return "G";
};

export default function Billing({
  drafts = {},
  setDrafts,
  currentTable = "",
  setCurrentTable,
  billingDate,
  activeTab,
  track = "",
  sessionId = null,
  activeShift,
  userInitials, // New prop
  isShiftLoading,
  setPrintData,
}) {
  const [entryCode, setEntryCode] = useState("");
  const [qty, setQty] = useState("1");
  const [loading, setLoading] = useState(false);
  const [isSplitBillMode, setIsSplitBillMode] = useState(false);
  const [nextBillNumber, setNextBillNumber] = useState(null);
  const [currentParty, setCurrentParty] = useState("1");

  const draftKey = currentTable ? `${currentTable}-${currentParty}` : "";

  // --- REFS FOR NAVIGATION ---
  const tableNoRef = useRef(null);
  const partyNoRef = useRef(null);
  const sectionRef = useRef(null);
  const itemCodeRef = useRef(null);
  const qtyRef = useRef(null);
  const searchInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isPrintingRef = useRef(false);

  // Array ref for item quantity inputs
  const itemQtyRefs = useRef([]);
  // Array ref for item move buttons
  const itemMoveRefs = useRef([]);
  // Array ref for item rows (navigation mode)
  const itemRowRefs = useRef([]);

  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const [showF4Popup, setShowF4Popup] = useState(false);
  const [helpTab, setHelpTab] = useState("shortcuts");
  const [searchQuery, setSearchQuery] = useState("");
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [selectedHelpIndex, setSelectedHelpIndex] = useState(0);

  // Dynamic GST percentages
  const [sgstPercentage, setSgstPercentage] = useState(2.5);
  const [cgstPercentage, setCgstPercentage] = useState(2.5);
  const [settingsCache, setSettingsCache] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const clerk =
          userInitials || (activeShift && activeShift.clerk_initials) || "CLK";
        const res = await api.get(`/settings?clerk=${clerk}`);
        if (res.data) {
          setSgstPercentage(parseFloat(res.data.sgst_percentage) || 0);
          setCgstPercentage(parseFloat(res.data.cgst_percentage) || 0);
          setSettingsCache(res.data);
        }
      } catch (err) {
        console.error("Failed to load settings for taxes:", err);
      }
    };
    fetchSettings();
  }, [userInitials, activeShift]);

  const currentDraft = useMemo(() => {
    const defaultDraft = {
      header: {
        table_no: currentTable || "",
        party_no: currentParty || "1",
        section: getSectionForTable(currentTable || ""),
        track: track || "",
        bill_number: null,
      },
      lines: [],
      modified_from_bill_id: null,
    };

    if (!drafts || !draftKey) {
      return defaultDraft;
    }

    const draft = drafts[draftKey];
    if (!draft) {
      return defaultDraft;
    }

    return {
      header: safeObject(draft.header, defaultDraft.header),
      lines: safeArray(draft.lines, []),
      modified_from_bill_id: draft.modified_from_bill_id || null,
    };
  }, [drafts, currentTable, currentParty, draftKey, track]);

  const matchedItem = useMemo(() => {
    if (!entryCode || !entryCode.trim()) return null;
    const cleanCode = entryCode.trim().toLowerCase();
    return menuItems.find(
      (i) =>
        String(safeGet(i, "numeric_code", "")).trim().toLowerCase() === cleanCode ||
        String(safeGet(i, "alpha_code", "")).trim().toLowerCase() === cleanCode
    );
  }, [entryCode, menuItems]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [currentDraft.lines.length]);

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const res = await api.get(`/menu`);
        const items = safeArray(res.data);
        setMenuItems(items);
        setFilteredItems(items);
      } catch (e) {
        console.error("Failed to load menu for help:", e);
        toast.error("Failed to load menu for help panel");
        setMenuItems([]);
        setFilteredItems([]);
      }
    };
    loadMenu();
  }, []);

  useEffect(() => {
    const fetchLastBillNumberData = async () => {
      try {
        const res = await getLastBillNumber(billingDate, track);

        // The API returns the *last* bill number. We want to show the *next* one.
        const lastNum = parseInt(res.last_bill_number, 10);

        if (!isNaN(lastNum)) {
          setNextBillNumber(lastNum + 1);
        } else {
          setNextBillNumber(1); // Default to 1 if no bills exist
        }
      } catch (e) {
        console.error("Failed to fetch last bill number:", e);
        // Fallback or leave as null
      }
    };

    if (activeTab === "billing" || activeTab === "home") {
      fetchLastBillNumberData();
    }
  }, [billingDate, track, activeTab]); // Re-fetch when tab/date/track changes (manual refreshes handle bill finalization)

  useEffect(() => {
    if (activeTab === "billing" && tableNoRef.current) {
      tableNoRef.current.focus();
    }
  }, [activeTab]);

  const onHeaderChange = (patch) => {
    if (!draftKey || !setDrafts) return;

    const newHeader = {
      ...safeObject(currentDraft.header),
      ...patch,
    };

    const newDraft = {
      ...currentDraft,
      header: newHeader,
    };

    setDrafts((prev) => ({
      ...safeObject(prev),
      [draftKey]: newDraft,
    }));
  };

  const setSectionByTable = (tableNo) => {
    const section = getSectionForTable(tableNo);
    // Ensure we trigger the update on the CURRENT draft if it exists
    if (onHeaderChange) {
      onHeaderChange({ section });
    }
  };

  const loadDataForTableAndParty = async (tableNo, partyNo) => {
    if (!tableNo || !setDrafts) return;

    const key = `${tableNo}-${partyNo}`;

    // First, try to update existing draft if any (might be redundant if we overwrite below, but good for UI consistency)
    setSectionByTable(tableNo);

    if (drafts && drafts[key]) return;

    let initialLines = [];
    let modifiedFromBillId = null;

    // Calculate section for new draft
    const initialSection = getSectionForTable(tableNo);

    try {
      const pendingOrders = await getPendingOrdersByTableAndParty(tableNo, String(partyNo));
      
      // Filter out stale orders that belong to previous days
      let filteredOrders = pendingOrders || [];
      if (billingDate) {
        filteredOrders = filteredOrders.filter((order) => {
          let rawDate = safeGet(order, "bill_date");
          let orderDateStr = "";

          if (rawDate) {
            const d = new Date(rawDate);
            try {
              orderDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              }).format(d);
            } catch (e) {
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              orderDateStr = `${year}-${month}-${day}`;
            }
          }
          return orderDateStr === billingDate;
        });
      }

      if (filteredOrders && filteredOrders.length > 0) {
        initialLines = filteredOrders.map((order) => ({
          id: order.id,
          code: order.item_code || order.numeric_item_code,
          name: order.item_name,
          quantity: order.quantity,
          unit_price: order.unit_price,
          line_total: order.line_total,
          numeric_code: order.numeric_item_code,
          alpha_code: order.item_code,
          is_separate: !!order.is_separate,
        }));
        toast.success(
          `Loaded ${filteredOrders.length} pending items for Table ${tableNo} (Party ${partyNo})`,
        );
      }
    } catch (error) {
      console.error("Failed to load pending orders:", error);
      toast.error("Failed to load pending orders for this table.");
    }

    setDrafts((prev) => ({
      ...safeObject(prev),
      [key]: {
        header: {
          table_no: tableNo,
          party_no: partyNo,
          section: initialSection,
          bill_number: null,
        },
        lines: initialLines,
        modified_from_bill_id: modifiedFromBillId,
      },
    }));
  };

  useEffect(() => {
    if (currentTable && currentParty) {
      loadDataForTableAndParty(currentTable, currentParty);
    }
  }, [currentTable, currentParty]);

  // --- NAVIGATION HANDLERS ---
  const handleTableNoKeyDown = (event) => {
    const isCmdOrCtrl = event.metaKey || event.ctrlKey;
    const isAlt = event.altKey;
    // Mac alternative: Cmd+D or Alt+D instead of PageDown
    if (event.key === "PageDown" || (isCmdOrCtrl && event.key.toLowerCase() === "d") || (isAlt && event.key.toLowerCase() === "d")) {
      event.preventDefault();
      if (itemCodeRef.current) itemCodeRef.current.focus();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const newTableNo = event.target.value;
      if (setCurrentTable) {
        setCurrentTable(newTableNo);
      }
      // Always reset party to 1 when navigating away from the table field
      setCurrentParty("1");
      if (partyNoRef.current) {
        partyNoRef.current.focus();
        partyNoRef.current.select();
      }
    }
  };

  const handlePartyNoKeyDown = (event) => {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      // Skip Section, go to Item Code
      if (itemCodeRef.current) itemCodeRef.current.focus();
    }
  };

  const handleSectionKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (itemCodeRef.current) itemCodeRef.current.focus();
    }
  };

  const handleItemCodeKeyDown = (e) => {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const isAlt = e.altKey;
    // Mac alternative: Cmd+1 or Alt+1 instead of F1
    if (e.key === "F1" || (isCmdOrCtrl && (e.key === "1" || e.code === "Digit1")) || (isAlt && (e.key === "1" || e.code === "Digit1"))) {
      e.preventDefault();
      setShowF4Popup(true);
      setHelpTab("shortcuts");
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowF4Popup(false);
      if (setCurrentTable) setCurrentTable("1");
      setCurrentParty("1");
      setTimeout(() => {
        if (tableNoRef.current) {
          tableNoRef.current.focus();
          tableNoRef.current.select();
        }
      }, 0);
    } else if (e.key === "Enter" && entryCode) {
      e.preventDefault();
      const entryCodeStr = entryCode.trim();
      const entryCodeNum = Number(entryCodeStr);

      const item = menuItems.find(
        (i) =>
          String(safeGet(i, "numeric_code", "")).trim() === entryCodeStr ||
          (!isNaN(entryCodeNum) && safeGet(i, "numeric_code") === entryCodeNum) ||
          String(safeGet(i, "alpha_code", "")).trim().toLowerCase() === entryCodeStr.toLowerCase() ||
          String(safeGet(i, "name", "")).trim().toLowerCase() === entryCodeStr.toLowerCase(),
      );
      if (item) {
        // Focus quantity instead of adding directly
        if (qtyRef.current) {
          qtyRef.current.focus();
          qtyRef.current.select();
        }
      } else {
        setShowF4Popup(true);
        setHelpTab("shortcuts");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (itemQtyRefs.current[0]) {
        itemQtyRefs.current[0].focus();
        itemQtyRefs.current[0].select();
      }
    }
  };

  const handleQtyKeyDown = (e) => {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const isAlt = e.altKey;
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    } else if (e.key === "PageDown" || (isCmdOrCtrl && e.key.toLowerCase() === "d") || (isAlt && e.key.toLowerCase() === "d")) {
      e.preventDefault();
      if (itemQtyRefs.current[0]) {
        itemQtyRefs.current[0].focus();
        itemQtyRefs.current[0].select();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (itemCodeRef.current) {
        itemCodeRef.current.focus();
        itemCodeRef.current.select();
      }
    }
  };

  const handleMoveButtonKeyDown = (e, index) => {
    if (e.key === "Enter" || (e.shiftKey && e.key === "Enter")) {
      e.preventDefault();
      handleMoveItemClick(index);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      itemQtyRefs.current[index]?.focus();
      itemQtyRefs.current[index]?.select();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (index < safeArray(currentDraft.lines).length - 1) {
        itemMoveRefs.current[index + 1]?.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (index > 0) {
        itemMoveRefs.current[index - 1]?.focus();
      } else {
        itemCodeRef.current?.focus();
        itemCodeRef.current?.select();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      itemCodeRef.current?.focus();
      itemCodeRef.current?.select();
    }
  };

  const handleTableQtyKeyDown = (e, index) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (index > 0) {
        itemQtyRefs.current[index - 1]?.focus();
        itemQtyRefs.current[index - 1]?.select();
      } else {
        qtyRef.current?.focus();
        qtyRef.current?.select();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (index < safeArray(currentDraft.lines).length - 1) {
        itemQtyRefs.current[index + 1]?.focus();
        itemQtyRefs.current[index + 1]?.select();
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      // Increment quantity by 1
      const currentQty = parseFloat(safeArray(currentDraft.lines)[index]?.quantity || 1);
      const newQty = Math.round((currentQty + 1) * 100) / 100;
      updateQty(index, String(newQty));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      itemMoveRefs.current[index]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      let currentVal = e.target.value;
      if (currentVal.endsWith(".")) {
        currentVal = currentVal.slice(0, -1);
        updateQty(index, currentVal);
      }
      if (itemQtyRefs.current[index]) {
        itemQtyRefs.current[index].focus();
        itemQtyRefs.current[index].select();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Switch back to Nav Mode (Focus Row)
      itemRowRefs.current[index]?.focus();
    }
  };

  const handleRowKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Switch to Edit Mode (Focus Input)
      itemQtyRefs.current[index]?.focus();
      itemQtyRefs.current[index]?.select();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const next = index + 1;
      if (itemQtyRefs.current[next]) {
        itemQtyRefs.current[next].focus();
        itemQtyRefs.current[next].select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const prev = index - 1;
      if (prev >= 0 && itemQtyRefs.current[prev]) {
        itemQtyRefs.current[prev].focus();
        itemQtyRefs.current[prev].select();
      } else if (prev < 0) {
        // Back to item code
        if (itemCodeRef.current) itemCodeRef.current.focus();
      }
    }
  };

  const updateQty = async (index, val) => {
    if (!setDrafts || !draftKey) return;

    // 1. Validate decimal keystroke pattern (allow only positive decimals/empty string/dot)
    if (val !== "" && !/^\d*\.?\d*$/.test(val)) return;

    const lines = safeArray(currentDraft.lines);
    const updatedLines = lines.map((l, i) => {
      if (i !== index) return l;
      return {
        ...l,
        quantity: val, // Store exact typed string!
        line_total: Number(
          (safeGet(l, "unit_price", 0) * (parseFloat(val) || 0)).toFixed(2),
        ),
      };
    });

    setDrafts((prev) => ({
      ...safeObject(prev),
      [draftKey]: {
        ...currentDraft,
        lines: updatedLines,
      },
    }));

    // Immediately update activeTables so the right-panel reflects the change
    // without waiting for the next fetchActiveTables poll.
    if (currentTable) {
      const key = `${currentTable}-${currentParty}`;
      const newTotal = updatedLines.reduce(
        (s, l) => s + Number(l.line_total || 0), 0
      );
      const newCount = updatedLines.reduce(
        (s, l) => s + Number(parseFloat(l.quantity) || 1), 0
      );
      setActiveTables((prev) =>
        prev.map((t) =>
          `${t.table_no}-${t.party_no}` === key
            ? { ...t, total_amount: newTotal, item_count: newCount, last_order_at: new Date() }
            : t
        )
      );
    }

    // Sync to backend if it's an existing order and value is a complete valid number
    if (val !== "" && !val.endsWith(".") && updatedLines[index] && updatedLines[index].id) {
      const parsedQty = parseFloat(val);
      if (Number.isFinite(parsedQty) && parsedQty > 0) {
        try {
          await updateOrder(updatedLines[index].id, { quantity: parsedQty });
          fetchActiveTablesRef.current?.();
        } catch (err) {
          console.error("Failed to sync quantity to DB", err);
        }
      }
    }
  };

  const handleMoveItemClick = async (idx) => {
    const line = safeArray(currentDraft.lines)[idx];
    if (!line || !line.id) {
      toast.error("Cannot move unsaved item. Please save or press enter first.");
      return;
    }

    const targetTableStr = window.prompt(
      `Move '${line.name}' (Qty: ${line.quantity}) to which Table?`,
      currentTable || ""
    );

    if (targetTableStr === null) return; // User cancelled

    const targetTableNo = parseInt(targetTableStr.trim(), 10);
    if (isNaN(targetTableNo) || targetTableNo <= 0 || targetTableNo > 30) {
      toast.error("Please enter a valid table number (1-30).");
      return;
    }

    const targetPartyStr = window.prompt(
      `Move '${line.name}' to Table ${targetTableNo}, which Party?`,
      targetTableNo === parseInt(currentTable, 10) ? (currentParty === "1" ? "2" : "1") : "1"
    );

    if (targetPartyStr === null) return; // User cancelled

    const targetPartyNo = targetPartyStr.trim();
    const targetPartyNum = parseInt(targetPartyNo, 10);
    if (isNaN(targetPartyNum) || targetPartyNum < 1 || targetPartyNum > 9) {
      toast.error("Please enter a valid party number (1-9).");
      return;
    }

    if (targetTableNo === parseInt(currentTable, 10) && targetPartyNo === currentParty) {
      toast.error("Cannot move to the same table and party.");
      return;
    }

    try {
      setLoading(true);
      await api.post(`/billing/orders/${line.id}/move`, {
        targetTableNo: targetTableNo,
        targetPartyNo: targetPartyNo,
      });

      toast.success(`Moved '${line.name}' to Table ${targetTableNo} (Party ${targetPartyNo})`);

      setDrafts((prev) => {
        const nextDrafts = { ...safeObject(prev) };
        const lines = safeArray(currentDraft.lines);
        const updatedLines = lines.filter((_, i) => i !== idx);

        if (updatedLines.length === 0) {
          delete nextDrafts[draftKey];
          setCurrentTable("");
        } else {
          nextDrafts[draftKey] = {
            ...currentDraft,
            lines: updatedLines,
          };
        }

        // Force reload of target table by deleting its cache entry
        const targetKey = `${targetTableNo}-${targetPartyNo}`;
        delete nextDrafts[targetKey];

        return nextDrafts;
      });

      fetchActiveTablesRef.current?.();

      if (itemCodeRef.current) {
        itemCodeRef.current.focus();
      }
    } catch (err) {
      console.error("Failed to move item:", err);
      toast.error(safeGet(err, "response.data.detail", "Failed to move item"));
    } finally {
      setLoading(false);
    }
  };

  const toggleLineSplit = async (index) => {
    if (!setDrafts || !draftKey) return;
    const lines = safeArray(currentDraft.lines);
    const lineToToggle = lines[index];
    if (!lineToToggle) return;

    const newIsSeparate = !lineToToggle.is_separate;

    const updatedLines = lines.map((l, i) => {
      if (i !== index) return l;
      return { ...l, is_separate: newIsSeparate };
    });

    setDrafts((prev) => ({
      ...safeObject(prev),
      [draftKey]: { ...currentDraft, lines: updatedLines },
    }));

    if (lineToToggle.id) {
      try {
        await updateOrder(lineToToggle.id, { is_separate: newIsSeparate });
      } catch (err) {
        toast.error("Failed to sync split status");
        console.error(err);
      }
    }
  };

  const removeLine = (index) => {
    if (!setDrafts || !draftKey) return;
    const lines = safeArray(currentDraft.lines);
    const lineToRemove = lines[index];
    const updatedLines = lines.filter((_, i) => i !== index);

    setDrafts((prev) => ({
      ...safeObject(prev),
      [draftKey]: {
        ...currentDraft,
        lines: updatedLines,
      },
    }));

    if (lineToRemove && lineToRemove.id) {
      deleteOrder(lineToRemove.id)
        .then(() => fetchActiveTablesRef.current?.())
        .catch((e) => console.error("Failed to delete order from backend", e));
    }
  };

  const subtotal = useMemo(() => {
    const lines = safeArray(currentDraft.lines);
    const taxRateSum = (sgstPercentage || 0) + (cgstPercentage || 0);
    const scalingFactor = 1 / (1 + taxRateSum / 100);

    return Number(
      lines.reduce((s, l) => {
        const unitPriceScaled = Number((Number(l.unit_price || 0) * scalingFactor).toFixed(2));
        const lineTotalScaled = Number((unitPriceScaled * Number(l.quantity || 0)).toFixed(2));
        return s + lineTotalScaled;
      }, 0).toFixed(2)
    );
  }, [currentDraft.lines, sgstPercentage, cgstPercentage]);

  const sgst = useMemo(() => {
    const lines = safeArray(currentDraft.lines);
    const taxRateSum = (sgstPercentage || 0) + (cgstPercentage || 0);
    const scalingFactor = 1 / (1 + taxRateSum / 100);

    const totalTax = lines.reduce((s, l) => {
      const unitPriceScaled = Number((Number(l.unit_price || 0) * scalingFactor).toFixed(2));
      const lineTotalScaled = Number((unitPriceScaled * Number(l.quantity || 0)).toFixed(2));
      const itemTax = Number((lineTotalScaled * (taxRateSum / 100)).toFixed(2));
      return s + itemTax;
    }, 0);

    return Number((totalTax / 2).toFixed(2));
  }, [currentDraft.lines, sgstPercentage, cgstPercentage]);

  const cgst = useMemo(() => {
    const lines = safeArray(currentDraft.lines);
    const taxRateSum = (sgstPercentage || 0) + (cgstPercentage || 0);
    const scalingFactor = 1 / (1 + taxRateSum / 100);

    const totalTax = lines.reduce((s, l) => {
      const unitPriceScaled = Number((Number(l.unit_price || 0) * scalingFactor).toFixed(2));
      const lineTotalScaled = Number((unitPriceScaled * Number(l.quantity || 0)).toFixed(2));
      const itemTax = Number((lineTotalScaled * (taxRateSum / 100)).toFixed(2));
      return s + itemTax;
    }, 0);

    return Number((totalTax / 2).toFixed(2));
  }, [currentDraft.lines, sgstPercentage, cgstPercentage]);

  const total = useMemo(
    () => Number((subtotal + sgst + cgst).toFixed(2)),
    [subtotal, sgst, cgst],
  );

  // These are defined later in the file; keep stable call sites without
  // tripping `no-use-before-define` or stale-closure issues.
  const fetchActiveTablesRef = useRef(null);
  const fetchLastBillNumberRef = useRef(null);

  const createBill = useCallback(
    async (lines) => {
      if (!lines || lines.length === 0) {
        toast.error("No items to bill");
        return;
      }
      setLoading(true);
      const header = safeObject(currentDraft.header);

      try {
        const payload = {
          table_no: safeGet(header, "table_no", currentTable),
          party_no: safeGet(header, "party_no", "1"),
          section: safeGet(header, "section", "G"),
          track: activeShift?.shift_name || track || "`",
          clerk_initials: userInitials || activeShift?.clerk_initials || "CLK",
          subtotal: subtotal,
          sgst: sgst,
          cgst: cgst,
          tax_amount: sgst + cgst,
          grand_total: total,
          bill_date: billingDate,
          modified_from_bill_id: currentDraft.modified_from_bill_id,
          session_id: sessionId,
          items: lines.map((l) => ({
            item_name: l.name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            line_total: l.line_total,
            item_code: l.alpha_code || l.code,
            numeric_item_code: l.numeric_code,
            is_separate: l.is_separate,
          })),
        };

        let createdBill = null;
        let retries = 2;
        while (retries >= 0) {
          try {
            createdBill = await createBillAPI(payload);
            break; // Success
          } catch (err) {
            console.error(`Bill creation attempt failed. Retries left: ${retries}`, err);
            if (retries === 0) throw err;
            retries--;
            await new Promise(r => setTimeout(r, 500)); // 500ms delay before retry
          }
        }

        const billId = createdBill?.bill_id;
        const billNumber = createdBill?.bill_number || "Unknown";

        toast.success(`Bill #${billNumber} created`);

        if (billId) {
          const fullBillData = createdBill;

          // --- SPLIT BILL PRINTING LOGIC ---
          let printPayload = fullBillData;

          if (isSplitBillMode) {
            const allItems = safeArray(
              fullBillData.items_json || fullBillData.items,
            );
            const splitItems = allItems.filter(
              (i) =>
                i.is_separate === true ||
                String(i.is_separate) === "true" ||
                i.is_separate === 1,
            );
            const regularItems = allItems.filter(
              (i) =>
                !i.is_separate ||
                String(i.is_separate) === "false" ||
                i.is_separate === 0,
            );

            if (splitItems.length > 0 || regularItems.length > 0) {
              // Changed condition
              const billsToPrint = [];

              if (regularItems.length > 0) {
                const sub = Number(
                  regularItems.reduce((s, i) => s + Number(i.line_total || 0), 0).toFixed(2)
                );
                const taxRateSum = (sgstPercentage || 0) + (cgstPercentage || 0);
                const totalTax = regularItems.reduce(
                  (s, i) => s + Number((Number(i.line_total || 0) * (taxRateSum / 100)).toFixed(2)),
                  0
                );
                const sGstVal = Number((totalTax / 2).toFixed(2));
                const cGstVal = Number((totalTax / 2).toFixed(2));
                const grandVal = Number((sub + sGstVal + cGstVal).toFixed(2));

                billsToPrint.push({
                  ...fullBillData,
                  split: false,
                  bills: null,
                  items: regularItems,
                  items_json: regularItems,
                  titleSuffix: splitItems.length > 0 ? "(Main)" : "", // Add suffix only if there are split items
                  subtotal: sub,
                  grand_total: grandVal,
                  sgst: sGstVal,
                  cgst: cGstVal,
                });
              }

              if (splitItems.length > 0) {
                const sub = Number(
                  splitItems.reduce((s, i) => s + Number(i.line_total || 0), 0).toFixed(2)
                );
                const taxRateSum = (sgstPercentage || 0) + (cgstPercentage || 0);
                const totalTax = splitItems.reduce(
                  (s, i) => s + Number((Number(i.line_total || 0) * (taxRateSum / 100)).toFixed(2)),
                  0
                );
                const sGstVal = Number((totalTax / 2).toFixed(2));
                const cGstVal = Number((totalTax / 2).toFixed(2));
                const grandVal = Number((sub + sGstVal + cGstVal).toFixed(2));

                billsToPrint.push({
                  ...fullBillData,
                  split: false,
                  bills: null,
                  items: splitItems,
                  items_json: splitItems,
                  titleSuffix: regularItems.length > 0 ? "(Split)" : "", // Add suffix only if there are regular items
                  subtotal: sub,
                  grand_total: grandVal,
                  sgst: sGstVal,
                  cgst: cGstVal,
                });
              }

              printPayload = {
                ...fullBillData,
                split: true,
                bills: billsToPrint,
              };
            }
          }
          // ---------------------------------

          if (typeof window !== "undefined") {
            window.printBillData = printPayload;
          }
          if (setPrintData) {
            setPrintData(printPayload);
          }

          try {
            let settings = settingsCache;
            if (!settings) {
              const clerk = userInitials || activeShift?.clerk_initials || "CLK";
              const settingsRes = await api.get(`/settings?clerk=${clerk}`);
              settings = settingsRes.data;
            }

            let rawText = "";
            if (printPayload.split && printPayload.bills) {
              printPayload.bills.forEach((b, idx) => {
                if (idx > 0) {
                  rawText += "\r\n"; // at most 1 line gap
                }
                rawText += generateAsciiReceipt(b, settings);
              });
            } else {
              rawText = generateAsciiReceipt(printPayload, settings);
            }

            await api.post(`/printer/print`, { text: rawText });
            toast.success("Bill sent directly to POS printer!");
          } catch (err) {
            console.error("Direct print failed:", err);
            toast.error(
              "Printer error. Check if backend printer route is running.",
            );
          }

          if (tableNoRef.current) {
            tableNoRef.current.focus();
          }
        }

        if (setDrafts) {
          setDrafts((prev) => {
            const newDrafts = { ...safeObject(prev) };
            delete newDrafts[draftKey];
            return newDrafts;
          });
        }

        if (setCurrentTable) {
          setCurrentTable("1");
        }
        setCurrentParty("1");

        // Refresh numbers
        fetchLastBillNumberRef.current?.();
        fetchActiveTablesRef.current?.();

        // Return focus to table number field and select it (lands on table 1 by default)
        setTimeout(() => {
          if (tableNoRef.current) {
            tableNoRef.current.focus();
            tableNoRef.current.select();
          }
        }, 50);

        setEntryCode("");
        setQty("1");
      } catch (e) {
        console.error("Bill creation error:", e);
        toast.error(
          safeGet(e, "response.data.detail", "Failed to create bill"),
        );
      } finally {
        setLoading(false);
      }
    },
    [
      currentDraft,
      currentTable,
      activeShift,
      track,
      userInitials,
      subtotal,
      sgst,
      cgst,
      total,
      billingDate,
      sessionId,
      setDrafts,
      setCurrentTable,
      setEntryCode,
      setQty,
      tableNoRef,
      setPrintData,
      isSplitBillMode,
      sgstPercentage,
      cgstPercentage,
    ],
  );

  const addItem = useCallback(
    async (focusItemCode = true, overrideCode = null) => {
      const rawCode = overrideCode !== null && overrideCode !== undefined ? overrideCode : entryCode;
      if (!rawCode || !currentTable) return null;

      try {
        const activeCode = String(rawCode);
        const cleanCode = activeCode.trim();
        const res = await api.get(`/menu/lookup/${encodeURIComponent(cleanCode)}`);
        const item = res.data;

        if (!item) {
          toast.error("Item not found");
          return null;
        }

        const section = safeGet(currentDraft, "header.section", "G");
        let unitPrice;

        switch (section) {
          case "AC":
            unitPrice = safeGet(item, "price_ac", 0);
            break;
          case "P":
            unitPrice = safeGet(item, "price_general", 0);
            break;
          default:
            unitPrice = safeGet(item, "price_general", 0);
        }

        const safeExtract = (val, key) => {
          if (val && typeof val === "object") {
            return val[key] || val.name || val.item_name || "";
          }
          return val;
        };

        const itemName = safeExtract(
          safeGet(item, "name", "Unknown Item"),
          "name",
        );
        const itemAlphaCode = safeExtract(
          safeGet(item, "alpha_code", ""),
          "alpha_code",
        );
        const itemNumericCode = safeExtract(
          safeGet(item, "numeric_code", ""),
          "numeric_code",
        );

        // Prompt for dynamic price if item price is 0, name contains MISC, or code is 189
        if (
          Number(unitPrice) === 0 ||
          (typeof itemName === "string" &&
            itemName.toUpperCase().includes("MISC")) ||
          String(itemNumericCode).trim() === "189" ||
          String(itemAlphaCode).trim().toLowerCase() === "189"
        ) {
          const customPriceStr = window.prompt(
            `Enter amount for ${itemName}:`,
            "",
          );
          if (customPriceStr === null) {
            // User cancelled
            if (itemCodeRef.current) itemCodeRef.current.focus();
            return null;
          }
          const customPrice = parseFloat(customPriceStr);
          if (isNaN(customPrice) || customPrice < 0) {
            toast.error("Invalid amount entered. Please enter a valid number.");
            if (itemCodeRef.current) itemCodeRef.current.focus();
            return null;
          }
          unitPrice = customPrice;
        }

        const quantityNum = parseFloat(qty);
        if (isNaN(quantityNum) || quantityNum <= 0) {
          toast.error("Quantity must be greater than 0");
          if (qtyRef.current) {
            qtyRef.current.focus();
            qtyRef.current.select();
          }
          return null;
        }

        const newLine = {
          code: activeCode.toUpperCase(),
          name: itemName,
          quantity: quantityNum,
          unit_price: Number(unitPrice),
          line_total: Number((unitPrice * quantityNum).toFixed(2)),
          numeric_code: itemNumericCode,
          alpha_code: itemAlphaCode,
          is_separate: !!item.is_separate,
        };

        const payload = {
          table_no: currentTable,
          party_no: currentParty,
          section: section,
          item_name: newLine.name,
          quantity: newLine.quantity,
          unit_price: newLine.unit_price,
          line_total: newLine.line_total,
          track: activeShift?.shift_name || track || "SYS",
          clerk_initials: userInitials || activeShift?.clerk_initials || "CLK",
          bill_number: 0,
          item_code: newLine.alpha_code,
          numeric_item_code: newLine.numeric_code,
          bill_date: billingDate, // Use the session date for the order
        };

        const orderRes = await createOrder(payload);
        newLine.id = orderRes.id || orderRes[0]?.id;

        // Refresh active tables to update sequences
        fetchActiveTablesRef.current?.();

        if (focusItemCode && setDrafts) {
          const updatedLines = [...safeArray(currentDraft.lines), newLine];
          setDrafts((prev) => ({
            ...safeObject(prev),
            [draftKey]: {
              ...currentDraft,
              lines: updatedLines,
            },
          }));
          setEntryCode("");
          setQty("1");
          if (itemCodeRef.current) {
            itemCodeRef.current.focus();
          }
        }

        return newLine;
      } catch (e) {
        console.error("Add item error:", e);
        const httpStatus = e?.response?.status;

        if (httpStatus === 404 || !httpStatus) {
          // Item not found — open help popup so user can search
          toast.error(safeGet(e, "response.data.detail", "Item not found"));
          setShowF4Popup(true);
          setHelpTab("shortcuts");
          if (itemCodeRef.current) {
            itemCodeRef.current.focus();
            itemCodeRef.current.select();
          }
        } else {
          // Server error (500, etc.) — don't open help popup, just notify and refocus
          toast.error("Server error looking up item. Please try again.");
          if (itemCodeRef.current) {
            itemCodeRef.current.focus();
            itemCodeRef.current.select();
          }
        }
        return null;
      }
    },
    [
      entryCode,
      currentTable,
      currentDraft,
      qty,
      activeShift,
      track,
      userInitials,
      billingDate,
      setDrafts,
      setEntryCode,
      setQty,
      itemCodeRef,
      setShowF4Popup,
      setHelpTab,
    ],
  );

  const handlePrintBill = useCallback(async () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;

    try {
      if (!currentTable) {
        toast.error("Please enter a table number before printing.");
        return;
      }

      const billIdToPrint =
      safeGet(currentDraft, "modified_from_bill_id") ||
      safeGet(currentDraft, "header.bill_id");

    if (billIdToPrint) {
      try {
        setLoading(true);
        const fullBillData = await getBillById(billIdToPrint);

        // --- SPLIT BILL PRINTING LOGIC ---
        let printPayload = fullBillData;

        if (isSplitBillMode) {
          const allItems = safeArray(
            fullBillData.items_json || fullBillData.items,
          );
          const splitItems = allItems.filter(
            (i) =>
              i.is_separate === true ||
              String(i.is_separate) === "true" ||
              i.is_separate === 1,
          );
          const regularItems = allItems.filter(
            (i) =>
              !i.is_separate ||
              String(i.is_separate) === "false" ||
              i.is_separate === 0,
          );

          if (splitItems.length > 0 || regularItems.length > 0) {
            const billsToPrint = [];

            if (regularItems.length > 0) {
              const sub = Number(
                regularItems.reduce((s, i) => s + Number(i.line_total || 0), 0).toFixed(2)
              );
              const sGstVal = Number((sub * (sgstPercentage / 100)).toFixed(2));
              const cGstVal = Number((sub * (cgstPercentage / 100)).toFixed(2));
              const grandVal = sub;

              billsToPrint.push({
                ...fullBillData,
                split: false,
                bills: null,
                items: regularItems,
                items_json: regularItems,
                titleSuffix: splitItems.length > 0 ? "(Main)" : "",
                subtotal: sub,
                grand_total: grandVal,
                sgst: sGstVal,
                cgst: cGstVal,
              });
            }

            if (splitItems.length > 0) {
              const sub = Number(
                splitItems.reduce((s, i) => s + Number(i.line_total || 0), 0).toFixed(2)
              );
              const sGstVal = Number((sub * (sgstPercentage / 100)).toFixed(2));
              const cGstVal = Number((sub * (cgstPercentage / 100)).toFixed(2));
              const grandVal = sub;

              billsToPrint.push({
                ...fullBillData,
                split: false,
                bills: null,
                items: splitItems,
                items_json: splitItems,
                titleSuffix: regularItems.length > 0 ? "(Split)" : "",
                subtotal: sub,
                grand_total: grandVal,
                sgst: sGstVal,
                cgst: cGstVal,
              });
            }

            printPayload = {
              ...fullBillData,
              split: true,
              bills: billsToPrint,
            };
          }
        }
        // ---------------------------------

        if (typeof window !== "undefined") {
          window.printBillData = printPayload;
        }
        if (setPrintData) {
          setPrintData(printPayload);
        }

        try {
          let settings = settingsCache;
          if (!settings) {
            const clerk = userInitials || activeShift?.clerk_initials || "CLK";
            const settingsRes = await api.get(`/settings?clerk=${clerk}`);
            settings = settingsRes.data;
          }

          let rawText = "";
          if (printPayload.split && printPayload.bills) {
            printPayload.bills.forEach((b, idx) => {
              if (idx > 0) {
                rawText += "\r\n"; // at most 1 line gap
              }
              rawText += generateAsciiReceipt(b, settings);
            });
          } else {
            rawText = generateAsciiReceipt(printPayload, settings);
          }

          await api.post(`/printer/print`, { text: rawText });
          toast.success("Bill sent directly to POS printer!");
        } catch (err) {
          console.error("Direct print failed:", err);
          toast.error(
            "Printer error. Check if backend printer route is running.",
          );
        }

        if (tableNoRef.current) {
          tableNoRef.current.focus();
        }
      } catch (e) {
        console.error("Error fetching bill for reprint:", e);
        toast.error("Failed to load bill for printing");
      } finally {
        setLoading(false);
      }
      return;
    }

    let finalLines = safeArray(currentDraft.lines);

    // If draft lines are empty but there might be pending orders in DB, load them
    if (finalLines.length === 0 && currentTable) {
      try {
        const pendingOrders = await getPendingOrdersByTableAndParty(currentTable, String(currentParty));
        if (pendingOrders && pendingOrders.length > 0) {
          // Filter by billing date
          let filteredOrders = pendingOrders;
          if (billingDate) {
            filteredOrders = pendingOrders.filter((order) => {
              let rawDate = safeGet(order, "bill_date");
              let orderDateStr = "";
              if (rawDate) {
                const d = new Date(rawDate);
                try {
                  orderDateStr = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  }).format(d);
                } catch (e) {
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  orderDateStr = `${year}-${month}-${day}`;
                }
              }
              return orderDateStr === billingDate;
            });
          }
          if (filteredOrders.length > 0) {
            finalLines = filteredOrders.map((order) => ({
              id: order.id,
              code: order.item_code || order.numeric_item_code,
              name: order.item_name,
              quantity: order.quantity,
              unit_price: order.unit_price,
              line_total: order.line_total,
              numeric_code: order.numeric_item_code,
              alpha_code: order.item_code,
              is_separate: !!order.is_separate,
            }));
          }
        }
      } catch (err) {
        console.error("Failed to load pending orders for print:", err);
      }
    }

    if (document.activeElement === qtyRef.current && entryCode) {
      const newItem = await addItem(false);
      if (newItem) {
        finalLines = [...finalLines, newItem];
      } else {
        return;
      }
    }

    if (finalLines.length === 0) {
      toast.error("Please add at least one item to the bill.");
      return;
    }

      await createBill(finalLines);
    } finally {
      isPrintingRef.current = false;
    }
  }, [
    currentTable,
    currentDraft,
    entryCode,
    qtyRef,
    addItem,
    createBill,
    setLoading,
    setPrintData,
    tableNoRef,
    isSplitBillMode,
    sgstPercentage,
    cgstPercentage,
  ]);

  // --- Active Bills Logic ---
  const [activeTables, setActiveTables] = useState([]);
  const [now, setNow] = useState(new Date());
  const [lastBillNumber, setLastBillNumber] = useState(0);

  const fetchLastBillNumber = useCallback(async () => {
    try {
      const res = await getLastBillNumber(billingDate, track);
      // res is { last_bill_number: ... }
      setLastBillNumber(parseInt(safeGet(res, "last_bill_number", 0)) || 0);
    } catch (e) {
      console.error("Failed to fetch last bill number", e);
    }
  }, [billingDate, track]);

  const fetchActiveTables = useCallback(async () => {
    try {
      const orders = await getAllPendingOrders();
      const groups = {};
      orders.forEach((o) => {
        // Filter by billing date to exclude stale orders from previous days
        if (billingDate) {
          let rawDate = safeGet(o, "bill_date");
          let orderDateStr = "";

          if (rawDate) {
            const d = new Date(rawDate);
            try {
              orderDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              }).format(d);
            } catch (e) {
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              orderDateStr = `${year}-${month}-${day}`;
            }
          }

          if (orderDateStr && orderDateStr !== billingDate) {
            return;
          }
        }

        const key = `${o.table_no}-${o.party_no}`;
        if (!groups[key]) {
          groups[key] = {
            table_no: o.table_no,
            party_no: o.party_no,
            first_order_at: new Date(o.created_at),
            last_order_at: new Date(o.created_at),
            item_count: 0,
            total_amount: 0,
          };
        }
        const g = groups[key];
        const orderTime = new Date(o.created_at);
        if (orderTime < g.first_order_at) g.first_order_at = orderTime;
        if (orderTime > g.last_order_at) g.last_order_at = orderTime;

        if (o.updated_at) {
          const updateTime = new Date(o.updated_at);
          if (updateTime > g.last_order_at) g.last_order_at = updateTime;
        }

        // Sum actual quantities, not just row count
        g.item_count += Number(o.quantity || 1);
        g.total_amount += parseFloat(o.line_total || 0);
      });

      // Merge local draft values so qty edits show immediately without waiting for poll.
      // For whichever draft key matches a DB group, override item_count + total_amount
      // with the live draft state (which is already updated optimistically in updateQty).
      if (draftsRef.current) {
        Object.entries(safeObject(draftsRef.current)).forEach(([draftKey, draft]) => {
          const lines = safeArray(draft?.lines);
          if (!lines.length) return;
          const header = safeObject(draft?.header);
          const tableNo = header.table_no;
          const partyNo = header.party_no || "1";
          if (!tableNo) return;
          const key = `${tableNo}-${partyNo}`;
          if (groups[key]) {
            // Override with live draft totals
            groups[key].item_count = lines.reduce(
              (s, l) => s + Number(l.quantity || 1),
              0,
            );
            groups[key].total_amount = lines.reduce(
              (s, l) => s + Number(l.line_total || 0),
              0,
            );
          }
        });
      }

      // Sort by first_order_at to ensure consistent temporary bill numbering
      const sortedTables = Object.values(groups).sort(
        (a, b) => a.first_order_at - b.first_order_at,
      );
      setActiveTables(sortedTables);
    } catch (err) {
      console.error("Failed to fetch active tables", err);
    }
  }, [billingDate]);

  useEffect(() => {
    fetchActiveTablesRef.current = fetchActiveTables;
  }, [fetchActiveTables]);

  useEffect(() => {
    fetchLastBillNumberRef.current = fetchLastBillNumber;
  }, [fetchLastBillNumber]);

  // Initial load and Polling
  useEffect(() => {
    fetchActiveTables();
    fetchLastBillNumber();

    const interval = setInterval(() => {
      setNow(new Date());
      // Poll every 5 seconds for updates
      if (new Date().getSeconds() % 5 === 0) {
        fetchActiveTables();
        fetchLastBillNumber();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchActiveTables, fetchLastBillNumber]);

  const formatDuration = (ms) => {
    const safeMs = Math.max(0, ms);
    const seconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}H ${minutes % 60}M`;
    return `${minutes}M ${seconds % 60}S`;
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      const isAlt = event.altKey;

      const code = event.code;

      // F1 or Cmd+1 / Alt+1
      if (event.key === "F1" || (isCmdOrCtrl && (event.key === "1" || code === "Digit1")) || (isAlt && (event.key === "1" || code === "Digit1"))) {
        event.preventDefault();
        setShowF4Popup((prev) => {
          if (prev && helpTab === "shortcuts") return false;
          setHelpTab("shortcuts");
          return true;
        });
      // F2 or Cmd+2 / Alt+2
      } else if (event.key === "F2" || (isCmdOrCtrl && (event.key === "2" || code === "Digit2")) || (isAlt && (event.key === "2" || code === "Digit2"))) {
        event.preventDefault();
        setShowF4Popup((prev) => {
          if (prev && helpTab === "active") return false;
          setHelpTab("active");
          return true;
        });
      // F4 or Cmd+4 / Alt+4
      } else if (event.key === "F4" || (isCmdOrCtrl && (event.key === "4" || code === "Digit4")) || (isAlt && (event.key === "4" || code === "Digit4"))) {
        event.preventDefault();
        setShowF4Popup((prev) => !prev);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (setCurrentTable) setCurrentTable("1");
        setCurrentParty("1");
        if (showF4Popup) {
          setShowF4Popup(false);
        }
        setTimeout(() => {
          if (tableNoRef.current) {
            tableNoRef.current.focus();
            tableNoRef.current.select();
          }
        }, 0);
      // End/Home or Cmd+Enter / Cmd+P / Ctrl+P
      } else if (
        event.key === "End" || 
        event.key === "Home" || 
        (isCmdOrCtrl && event.key === "Enter") || 
        (isCmdOrCtrl && event.key.toLowerCase() === "p")
      ) {
        event.preventDefault();
        handlePrintBill();
      // PageDown or Cmd+D / Alt+D
      } else if (event.key === "PageDown" || (isCmdOrCtrl && event.key.toLowerCase() === "d") || (isAlt && event.key.toLowerCase() === "d")) {
        event.preventDefault();
        if (itemCodeRef.current) {
          itemCodeRef.current.focus();
        }
      } else if (
        isCmdOrCtrl &&
        (event.key === "f" || event.code === "KeyF")
      ) {
        event.preventDefault();
        setShowF4Popup(true);
        setHelpTab("shortcuts");
      // F3 or Cmd+3 / Alt+3
      } else if (event.key === "F3" || (isCmdOrCtrl && (event.key === "3" || code === "Digit3")) || (isAlt && (event.key === "3" || code === "Digit3"))) {
        event.preventDefault();
        setIsSplitBillMode((prev) => {
          const newState = !prev;
          toast.success(`SPLIT BILL MODE ${newState ? "ENABLED" : "DISABLED"}`);
          return newState;
        });
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [handlePrintBill, helpTab, showF4Popup, setCurrentTable, setCurrentParty]);

  const tempBillNumber = useMemo(() => {
    const existingBillNum = safeGet(currentDraft, "header.bill_number");
    if (existingBillNum !== null && existingBillNum !== undefined) {
      return existingBillNum;
    }

    // The bill number on the screen should only update after previous bills are formally printed/finalised.
    return lastBillNumber ? lastBillNumber + 1 : 1;
  }, [currentDraft, lastBillNumber]);

  const displayBillNumber =
    safeGet(currentDraft, "header.bill_number") !== null
      ? safeGet(currentDraft, "header.bill_number")
      : tempBillNumber;

  useEffect(() => {
    if (showF4Popup && helpTab === "shortcuts") {
      setSearchQuery("");
      setFilteredItems([...menuItems]);
      setSelectedHelpIndex(0);
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    }
  }, [showF4Popup, helpTab, menuItems]);

  useEffect(() => {
    const lowercasedQuery = searchQuery.toLowerCase();
    const filtered = menuItems.filter(
      (item) =>
        String(safeGet(item, "name", "")).toLowerCase().includes(lowercasedQuery) ||
        String(safeGet(item, "numeric_code", ""))
          .toLowerCase()
          .includes(lowercasedQuery) ||
        String(safeGet(item, "alpha_code", "")).toLowerCase().includes(lowercasedQuery),
    );
    setFilteredItems(filtered);
    setSelectedHelpIndex(0);
  }, [searchQuery, menuItems]);

  const handleSearchKeyDown = (e) => {
    const itemsLength = filteredItems.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setSelectedHelpIndex((prev) => (prev + 1) % itemsLength);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setSelectedHelpIndex((prev) => (prev - 1 + itemsLength) % itemsLength);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedHelpIndex]) {
        const selectedItem = filteredItems[selectedHelpIndex];
        const code =
          String(safeGet(selectedItem, "numeric_code", "")).trim() ||
          String(safeGet(selectedItem, "alpha_code", "")).trim();
        
        // Load the item code in input
        setEntryCode(code);
        
        setShowF4Popup(false);
        setSearchQuery("");

        // Focus the qty textbox and select all text
        setTimeout(() => {
          if (qtyRef.current) {
            qtyRef.current.focus();
            qtyRef.current.select();
          }
        }, 50);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowF4Popup(false);
      if (itemCodeRef.current) {
        itemCodeRef.current.focus();
      }
    }
  };

  return (
    <div className="billing-screen-overhaul w-full h-full flex flex-col pb-4">
      <Card className="flex flex-col h-full w-full">
        <CardHeader className="flex-none">
          <CardTitle className="flex items-center gap-4">
            <span className="text-xl font-bold text-white">Billing for {billingDate}</span>
            <div
              onClick={() => setIsSplitBillMode(!isSplitBillMode)}
              className="flex items-center gap-2 bg-gray-900/60 border border-gray-800 rounded-full px-3 py-1 cursor-pointer hover:border-gray-700 select-none transition-all duration-200"
            >
              <div
                className={`w-7 h-4 rounded-full flex items-center p-0.5 transition-colors duration-200 ${
                  isSplitBillMode ? "bg-orange-500" : "bg-gray-700"
                }`}
              >
                <div
                  className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-200 ${
                    isSplitBillMode ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </div>
              <span
                className={`text-xs font-semibold tracking-wide transition-colors duration-200 ${
                  isSplitBillMode ? "text-orange-400" : "text-gray-400"
                }`}
              >
                Split Bill
              </span>
              {isSplitBillMode && (
                <span className="ml-1 text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-black tracking-widest uppercase animate-pulse">
                  Active
                </span>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-none space-y-4 mb-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Table No</Label>
                <Input
                  ref={tableNoRef}
                  placeholder="Type & Enter"
                  value={currentTable}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      if (setCurrentTable) setCurrentTable("");
                      return;
                    }

                    const num = parseInt(val, 10);

                    // Validation: Allow only numbers, max 30
                    if (!isNaN(num) && num >= 1 && num <= 30) {
                      if (setCurrentTable) setCurrentTable(val);
                      // Trigger section update IMMEDIATELY on change
                      setSectionByTable(val);
                    } else {
                      // Optional: Show toast or just ignore invalid input
                      // toast.error("Table number must be between 1 and 30");
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={handleTableNoKeyDown}
                />
              </div>
              <div>
                <Label>Party No.</Label>
                <Input
                  ref={partyNoRef}
                  value={currentParty}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setCurrentParty("");
                      return;
                    }

                    const num = parseInt(val, 10);

                    // Validation: Allow only numbers, less than 10 (1-9)
                    if (!isNaN(num) && num >= 1 && num < 10) {
                      setCurrentParty(String(num));
                    } else {
                      toast.error("Party number must be between 1 and 9");
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={handlePartyNoKeyDown}
                />
              </div>
              <div>
                <Label>Section</Label>
                <Input
                  ref={sectionRef}
                  value={safeGet(currentDraft, "header.section", "G")}
                  readOnly
                  onKeyDown={handleSectionKeyDown}
                />
              </div>
              <div>
                <Label>Bill No.</Label>
                <Input value={displayBillNumber || "..."} readOnly />
              </div>
            </div>
          </div>

          <div className="grid gap-4 mb-4 flex-none items-end" style={{ gridTemplateColumns: "3fr 2fr 7fr 4fr" }}>
            <div>
              <Label>Item Code</Label>
              <Input
                ref={itemCodeRef}
                type="text"
                placeholder="ENTER CODE (E.G. 101, TEA)"
                value={entryCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setEntryCode(val);
                  const cleanVal = val.trim().toLowerCase();
                  const isThreeDigit = /^\d{3}$/.test(val);
                  const isAlphaCodeMatch = cleanVal.length >= 2 && menuItems.some(
                    (i) => String(safeGet(i, "alpha_code", "")).trim().toLowerCase() === cleanVal
                  );
                  if (isThreeDigit || isAlphaCodeMatch) {
                    const exists = menuItems.some(
                      (i) =>
                        String(safeGet(i, "numeric_code", "")).trim() === val.trim() ||
                        String(safeGet(i, "alpha_code", "")).trim().toLowerCase() === cleanVal
                    );
                    if (exists && qtyRef.current) {
                      qtyRef.current.focus();
                      qtyRef.current.select();
                    }
                  }
                }}
                onKeyDown={handleItemCodeKeyDown}
              />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                ref={qtyRef}
                type="number"
                min="0.001"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={handleQtyKeyDown}
              />
            </div>
            <div>
              <Label>Item Name</Label>
              <div
                className="w-full border border-gray-300 rounded-md bg-gray-100 flex items-center px-3 text-lg font-bold text-orange-500 overflow-hidden whitespace-nowrap text-ellipsis"
                style={{ height: "38px" }}
              >
                {matchedItem ? safeGet(matchedItem, "name", "") : <span className="text-gray-500 text-sm font-normal">ENTER CODE...</span>}
              </div>
            </div>
            <div>
              <Label>Grand Total</Label>
              <div
                className="w-full border border-green-700 rounded-md bg-green-950 flex items-center justify-end px-3 text-4xl font-black text-green-400 overflow-hidden whitespace-nowrap grand-total-display"
                style={{ height: "60px" }}
              >
                ₹{total.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 border border-gray-200 rounded-md">
            <Table>
              <TableHeader className="bg-gray-100 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-12 text-lg font-bold py-3 text-black">
                    S.No
                  </TableHead>
                  <TableHead className="text-lg font-bold py-3 text-black">
                    Item Name
                  </TableHead>
                  <TableHead className="w-24 text-lg font-bold py-3 text-black">
                    Qty
                  </TableHead>
                  <TableHead className="w-32 text-lg font-bold py-3 text-black">
                    Rate
                  </TableHead>
                  <TableHead className="text-lg font-bold py-3 text-black">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeArray(currentDraft.lines).map((l, idx) => (
                  <TableRow
                    key={idx}
                    ref={(el) => (itemRowRefs.current[idx] = el)}
                    tabIndex={-1}
                    onKeyDown={(e) => handleRowKeyDown(e, idx)}
                    className="focus:bg-blue-50 outline-none ring-2 ring-transparent focus:ring-blue-300 border-b border-gray-200"
                  >
                    <TableCell className="!py-0 text-base font-bold text-gray-800">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="!py-0">
                      <div className="flex items-center">
                        <span className="mr-3 text-lg font-bold text-black tracking-wide">
                          {safeGet(l, "name", "Unknown Item")}
                        </span>
                        {isSplitBillMode && (
                          <button
                            onClick={() => toggleLineSplit(idx)}
                            className={`ml-2 px-3 py-0.5 text-xs font-bold rounded shadow-sm border-2 transition-all cursor-pointer ${
                              l.is_separate
                                ? "bg-green-100 text-green-700 border-green-500"
                                : "bg-gray-100 text-gray-400 border-gray-300 hover:bg-gray-200"
                            }`}
                            title="Toggle Split Status"
                          >
                            SPLIT
                          </button>
                        )}
                        <div className="flex space-x-1.5 ml-4">
                          <Button
                            ref={(el) => (itemMoveRefs.current[idx] = el)}
                            variant="outline"
                            size="sm"
                            className="h-6 px-1.5 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 text-xs font-bold transition-all focus:ring-2 focus:ring-blue-500"
                            onClick={() => handleMoveItemClick(idx)}
                            onKeyDown={(e) => handleMoveButtonKeyDown(e, idx)}
                            title="Move Item to another Table"
                          >
                            MOVE
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="!py-0">
                      <input
                        ref={(el) => (itemQtyRefs.current[idx] = el)}
                        type="text"
                        className="w-16 h-7 text-lg font-bold text-center border border-gray-300 focus:border-blue-500"
                        value={safeGet(l, "quantity", "")}
                        onChange={(e) => updateQty(idx, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => handleTableQtyKeyDown(e, idx)}
                        onBlur={(e) => {
                          const val = e.target.value;
                          const num = Number(val);
                          if (val === "" || isNaN(num) || num <= 0) {
                            removeLine(idx);
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="!py-0 text-base font-semibold text-gray-700">
                      {Number(safeGet(l, "unit_price", 0)).toFixed(2)}
                    </TableCell>
                    <TableCell className="!py-0 text-base font-bold text-black">
                      {Number(safeGet(l, "line_total", 0)).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {showF4Popup && (
        <div className="f4-popup-overlay">
          <div className="f4-popup-content">
            <button
              className="f4-popup-close"
              onClick={() => setShowF4Popup(false)}
            >
              ×
            </button>
            <div className="f4-popup-tabs">
              <button
                className={`f4-popup-tab-btn ${
                  helpTab === "shortcuts" ? "active" : ""
                }`}
                onClick={() => setHelpTab("shortcuts")}
              >
                SHORTCUTS
              </button>
              <button
                className={`f4-popup-tab-btn ${
                  helpTab === "active" ? "active" : ""
                }`}
                onClick={() => setHelpTab("active")}
              >
                ACTIVE BILLS ({activeTables.length})
              </button>
            </div>

            <div className="f4-popup-body">
              {helpTab === "shortcuts" ? (
                <div className="space-y-4">
                  <p className="text-lg text-yellow-500 font-bold">
                    PRESS F1 IN ITEM CODE TO SEARCH FOR ITEMS.
                  </p>
                  <div className="mb-4">
                    <Input
                      ref={searchInputRef}
                      type="text"
                      placeholder="SEARCH BY CODE OR NAME..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />
                    {filteredItems.length > 0 && (
                      <div className="f4-search-results">
                        <Table>
                          <TableHeader>
                            <TableRow>
                <TableHead>CODE</TableHead>
                              <TableHead>NAME</TableHead>
                              <TableHead>PRICE</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredItems.map((item, index) => (
                              <TableRow
                                key={safeGet(item, "id", Math.random())}
                                ref={(el) => {
                                  if (selectedHelpIndex === index && el) {
                                    el.scrollIntoView({ block: "nearest" });
                                  }
                                }}
                                className={`cursor-pointer hover:bg-gray-800 ${
                                  selectedHelpIndex === index ? "text-white" : ""
                                }`}
                                style={
                                  selectedHelpIndex === index
                                    ? { backgroundColor: "#1d4ed8", color: "#ffffff" }
                                    : {}
                                }
                                onClick={() => {
                                  const code =
                                    String(safeGet(item, "numeric_code", "")).trim() ||
                                    String(safeGet(item, "alpha_code", "")).trim();
                                  setEntryCode(code);
                                  setShowF4Popup(false);
                                  setSearchQuery("");
                                  setTimeout(() => {
                                    if (qtyRef.current) {
                                      qtyRef.current.focus();
                                      qtyRef.current.select();
                                    }
                                  }, 50);
                                }}
                              >
                                <TableCell>
                                  {safeGet(item, "numeric_code", "") ||
                                    safeGet(item, "alpha_code", "") ||
                                    "-"}
                                </TableCell>
                                <TableCell>
                                  {safeGet(item, "name", "UNKNOWN")}
                                </TableCell>
                                <TableCell>
                                  {Number(
                                    safeGet(item, "price_general", 0),
                                  ).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {searchQuery && filteredItems.length === 0 && (
                      <div className="text-center py-4 text-gray-500">
                        NO ITEMS FOUND
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold border-b border-gray-700 pb-1 mt-6">
                    KEYBOARD SHORTCUTS
                  </h3>
                  <ul className="f4-shortcut-list">
                    <li>
                      <span>F1: OPEN ITEM SEARCH IN POPUP</span>
                      <kbd>F1</kbd>
                    </li>
                    <li>
                      <span>F2: OPEN ACTIVE BILLS IN POPUP</span>
                      <kbd>F2</kbd>
                    </li>
                    <li>
                      <span>F4: TOGGLE SHORTCUTS & ACTIVE BILLS POPUP</span>
                      <kbd>F4</kbd>
                    </li>
                    <li>
                      <span>F3: TOGGLE SPLIT BILL MODE</span>
                      <kbd>F3</kbd>
                    </li>
                    <li>
                      <span>ESC: GO TO TABLE NO.</span>
                      <kbd>ESC</kbd>
                    </li>
                    <li>
                      <span>ENTER: MOVE BETWEEN FIELDS / ADD ITEM</span>
                      <kbd>ENTER</kbd>
                    </li>
                    <li>
                      <span>ARROW UP/DOWN: NAVIGATE SEARCH RESULTS</span>
                      <kbd>↑/↓</kbd>
                    </li>
                    <li>
                      <span>PAGEDOWN: MOVE FROM TABLE NO. TO ITEM CODE</span>
                      <kbd>PGDN</kbd>
                    </li>
                    <li>
                      <span>END / HOME: FINALIZE AND PRINT BILL</span>
                      <kbd>END/HOME</kbd>
                    </li>
                  </ul>
                </div>
              ) : (
                <div className="active-bills-list">
                  {activeTables.length === 0 ? (
                    <div className="no-active-bills text-center py-8 text-gray-500">
                      NO ACTIVE BILLS
                    </div>
                  ) : (
                    <table className="f4-active-bills-table">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 font-bold">
                          <th>TABLE</th>
                          <th>ITEMS</th>
                          <th>TOTAL</th>
                          <th>RUNNING FOR</th>
                          <th>LAST ORDER</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTables.map((t) => (
                          <tr
                            key={`${t.table_no}-${t.party_no}`}
                            onClick={() => {
                              if (setCurrentTable) {
                                setCurrentTable(String(t.table_no));
                              }
                              setCurrentParty(String(t.party_no));
                              setShowF4Popup(false);
                            }}
                          >
                            <td>
                              {t.table_no}{" "}
                              {t.party_no !== "1" ? `(${t.party_no})` : ""}
                            </td>
                            <td>{t.item_count}</td>
                            <td>₹{t.total_amount.toFixed(2)}</td>
                            <td className="text-blue-400 font-mono">
                              {formatDuration(now - t.first_order_at)}
                            </td>
                            <td className="text-red-400">
                              {formatDuration(now - t.last_order_at)} AGO
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
