// Shared utility functions and constants for the Restaurant Billing System

export const API = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000/api";
export const BACKEND_URL = API.replace(/\/api\/?$/, "");

// Toast notification system
export const toast = {
  success: (message) => console.log("SUCCESS:", message),
  error: (message) => console.error("ERROR:", message),
};

// Safe utility functions
export const safeGet = (obj, path, defaultValue = null) => {
  try {
    const keys = path.split(".");
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return defaultValue;
      current = current[key];
    }
    return current === undefined ? defaultValue : current;
  } catch (e) {
    return defaultValue;
  }
};

export const safeArray = (arr, defaultValue = []) => {
  return Array.isArray(arr) ? arr : defaultValue;
};

export const safeObject = (obj, defaultValue = {}) => {
  return obj && typeof obj === "object" && !Array.isArray(obj)
    ? obj
    : defaultValue;
};

// Date formatter helper: DD/MM/YYYY
export const formatDateToDDMMYYYY = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Shift name friendly label mapping
export const getFriendlyShiftName = (track) => {
  if (track === "`") return "Track 1";
  if (track === "``") return "Track 2";
  if (track === "RBS") return "Track 3";
  if (track === "RBS1") return "Track 4";
  return track || "Default";
};

// Custom shortcuts retrieval
export const getCustomShortcuts = () => {
  const defaults = {
    activeBills: "alt+1",
    recentBills: "alt+2",
    shifts: "alt+3",
    foodMenu: "alt+4",
    admin: "alt+5",
    shortcutsHelp: "f1",
    activeTables: "f2",
    itemsSearch: "f4",
    printBill: "end",
    focusItemCode: "pagedown",
    toggleSplit: "f3"
  };
  try {
    const saved = localStorage.getItem("rbs_keyboard_shortcuts");
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Failed to load keyboard shortcuts from localStorage", e);
  }
  return defaults;
};

// Custom shortcuts saving
export const saveCustomShortcuts = (shortcuts) => {
  try {
    localStorage.setItem("rbs_keyboard_shortcuts", JSON.stringify(shortcuts));
  } catch (e) {
    console.error("Failed to save keyboard shortcuts to localStorage", e);
  }
};

// Action Label helper
export const getShortcutActionLabel = (actionKey) => {
  const labels = {
    activeBills: "Active Bills Tab",
    recentBills: "Recent Bills Tab",
    shifts: "Shifts Tab",
    foodMenu: "Food Menu Tab",
    admin: "Admin Tab",
    shortcutsHelp: "Shortcuts Help Popup",
    activeTables: "Active Tables Popup",
    itemsSearch: "Items Search Popup",
    printBill: "Print Bill",
    focusItemCode: "Focus Item Code",
    toggleSplit: "Toggle Split Category"
  };
  return labels[actionKey] || actionKey;
};

// Validation check for duplicate or browser-restricted shortcuts
export const validateShortcut = (keyCombo, actionKey, currentShortcuts) => {
  const cleaned = keyCombo.toLowerCase().trim();
  
  // Forbidden browser/system keys
  const forbidden = [
    "f1", "alt+tab", "control+tab", "ctrl+tab", "cmd+tab", "meta+tab",
    "ctrl+w", "cmd+w", "meta+w", "ctrl+t", "cmd+t", "meta+t",
    "ctrl+n", "cmd+n", "meta+n", "ctrl+r", "cmd+r", "meta+r", "f5"
  ];
  
  if (forbidden.includes(cleaned)) {
    return { valid: false, reason: `Shortcut '${keyCombo}' is reserved by the browser/system and cannot be used.` };
  }
  
  // Check if taken by another action
  for (const [key, val] of Object.entries(currentShortcuts)) {
    if (key !== actionKey && val.toLowerCase().trim() === cleaned) {
      return { valid: false, reason: `Shortcut '${keyCombo}' is already assigned to '${getShortcutActionLabel(key)}'.` };
    }
  }
  
  return { valid: true };
};

// Shortcut matcher
export const matchesShortcut = (e, shortcutString) => {
  if (!shortcutString) return false;
  const parts = shortcutString.toLowerCase().split("+").map(p => p.trim());
  const hasAlt = parts.includes("alt") || parts.includes("option");
  const hasCtrl = parts.includes("ctrl") || parts.includes("control");
  const hasShift = parts.includes("shift");
  const hasMeta = parts.includes("meta") || parts.includes("cmd") || parts.includes("command");

  // Check modifiers
  if (e.altKey !== hasAlt) return false;
  if (e.ctrlKey !== hasCtrl) return false;
  if (e.shiftKey !== hasShift) return false;
  if (e.metaKey !== hasMeta) return false;

  // Check key itself (the non-modifier part)
  const mainKey = parts.filter(p => !["alt", "option", "ctrl", "control", "shift", "meta", "cmd", "command"].includes(p))[0];
  if (!mainKey) return false;

  const eventKey = e.key.toLowerCase();
  const eventCode = e.code.toLowerCase();

  // Handle function keys f1-f12
  if (/^f[1-9][0-2]?$/.test(mainKey)) {
    return eventKey === mainKey;
  }

  // Handle special keys
  if (mainKey === "enter") return eventKey === "enter";
  if (mainKey === "escape" || mainKey === "esc") return eventKey === "escape";
  if (mainKey === "pagedown" || mainKey === "pgdn") return eventKey === "pagedown";
  if (mainKey === "pageup" || mainKey === "pgup") return eventKey === "pageup";
  if (mainKey === "end") return eventKey === "end";
  if (mainKey === "home") return eventKey === "home";
  if (mainKey === "tab") return eventKey === "tab";

  // Check numeric keys
  if (/^\d$/.test(mainKey)) {
    return eventKey === mainKey || eventCode === `digit${mainKey}`;
  }

  // Check alphabetical keys
  if (mainKey.length === 1) {
    return eventKey === mainKey || eventCode === `key${mainKey}`;
  }

  return eventKey === mainKey || eventCode === mainKey;
};

// Extract category name from DB record format
export const getCategoryName = (raw) => {
  if (!raw) return "";
  let display = String(raw);
  if (typeof raw === "object") {
    if (Array.isArray(raw) && raw.length > 0) {
      display = raw[0].name || raw[0].item_name || display;
    } else if (!Array.isArray(raw)) {
      display = raw.name || raw.item_name || display;
    }
  } else if (typeof raw === "string") {
    try {
      if (raw.trim().startsWith("[") || raw.trim().startsWith("{")) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          display = parsed[0].name || parsed[0].item_name || display;
        } else if (parsed && typeof parsed === "object") {
          display = parsed.name || parsed.item_name || display;
        }
      }
    } catch (e) {
      // Fallback
    }
  }
  if (display.startsWith("[") && display.includes("name")) {
    const match = display.match(/["']name["']\s*:\s*["']([^"']+)["']/i);
    if (match && match[1]) display = match[1];
  }
  return display === "-" || display === "N/A" ? "" : display;
};

