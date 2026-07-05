import axios from "axios";

// FIXED: Updated to use the correct port (8000) instead of 5000
const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000/api";
const AUTH_TOKEN_KEY = "authToken";

if (!process.env.REACT_APP_API_URL) {
  console.warn(
    "REACT_APP_API_URL is not defined. Falling back to http://127.0.0.1:8000/api"
  );
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

const handleAuthError = (error) => {
  if (error.response && error.response.status === 401) {
    if (typeof window !== "undefined") {
      const mode = localStorage.getItem("mode");
      if (!mode || mode === "none") {
        return Promise.reject(error);
      }
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem("mode");
      localStorage.removeItem("track");
      localStorage.removeItem("billingDate");
      localStorage.removeItem("sessionId");
      localStorage.removeItem("userInitials");
      window.location.reload();
    }
  }
  return Promise.reject(error);
};

api.interceptors.response.use((response) => response, handleAuthError);
axios.interceptors.response.use((response) => response, handleAuthError);

const applyAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common["X-Auth-Token"] = token;
    axios.defaults.headers.common["X-Auth-Token"] = token;
  } else {
    delete api.defaults.headers.common["X-Auth-Token"];
    delete axios.defaults.headers.common["X-Auth-Token"];
  }
};

if (typeof window !== "undefined") {
  applyAuthToken(localStorage.getItem(AUTH_TOKEN_KEY));
}

export const setAuthToken = (token) => {
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }

  applyAuthToken(token);
};

export const clearAuthToken = () => {
  setAuthToken(null);
};

// ==================== AUTHENTICATION ====================
export const login = async (staff_code, date, track, password = "") => {
  const response = await api.post("/auth/login", {
    staff_code,
    date,
    track,
    password,
  });

  if (response.data?.auth_token) {
    setAuthToken(response.data.auth_token);
  }

  return response.data;
};

export const logout = async () => {
  try {
    const response = await api.post("/auth/logout");
    return response.data;
  } finally {
    clearAuthToken();
  }
};

export const closeShiftAndLogout = async () => {
  try {
    const response = await api.post("/auth/close-shift-logout");
    return response.data;
  } finally {
    clearAuthToken();
  }
};

export const getPrinterStatus = async () => {
  const response = await api.get("/printer/status");
  return response.data;
};

// ==================== MENU OPERATIONS ====================
export const fetchMenu = async () => {
  const response = await api.get("/menu");
  return response.data;
};

export const addMenuItem = async (menuItem) => {
  const response = await api.post("/menu", menuItem);
  return response.data;
};

export const deleteMenuItem = async (id) => {
  const response = await api.delete(`/menu/${id}`);
  return response.data;
};

export const lookupMenuItem = async (code) => {
  const response = await api.get(`/menu/lookup/${code}`);
  return response.data;
};

// ==================== BILLING OPERATIONS ====================
export const createOrder = async (orderData) => {
  const response = await api.post("/billing/orders", orderData);
  return response.data;
};

export const updateOrder = async (orderId, orderData) => {
  const response = await api.put(`/billing/orders/${orderId}`, orderData);
  return response.data;
};

export const getAllPendingOrders = async () => {
  const response = await api.get("/billing/orders");
  return response.data;
};

export const getPendingOrdersByTable = async (table_no) => {
  const response = await api.get(`/billing/orders/table/${table_no}`);
  return response.data;
};

export const getPendingOrdersByTableAndParty = async (tableNo, partyNo) => {
  const response = await api.get(
    `/billing/orders/table/${tableNo}/party/${partyNo}`
  );
  return response.data;
};

export const deleteOrder = async (orderId) => {
  const response = await api.delete(`/billing/orders/${orderId}`);
  return response.data;
};

export const clearOrders = async (tableNo, partyNo) => {
  const response = await api.delete(
    `/billing/orders/table/${tableNo}/party/${partyNo}`
  );
  return response.data;
};

export const getBillById = async (billId) => {
  const response = await api.get(`/billing/bills/${billId}`);
  return response.data;
};

export const getLastBillNumber = async (date, track) => {
  const urlParams = track ? `?track=${encodeURIComponent(track)}` : '';
  const response = await api.get(`/billing/bills/last-number/${date}${urlParams}`);
  return response.data;
};

export const createBill = async (billData) => {
  const response = await api.post("/billing/bills", billData);
  return response.data;
};

export const getBillsByDate = async (bill_date) => {
  const response = await api.get(
    `/billing/bills/date-range/${bill_date}/${bill_date}`
  );
  return response.data;
};

export const getShiftStatus = async () => {
  // No date parameter
  const response = await api.get(`/shifts/sessions`); // Call route to get all sessions
  return response.data;
};

// ==================== SHIFT MANAGEMENT ====================
const USE_DEMO =
  (process.env.REACT_APP_USE_DEMO_SHIFTS || "false").toLowerCase() === "true";

export const getCurrentShifts = async (date) => {
  // Demo mode: call /shifts/demo
  if (USE_DEMO) {
    const url = date
      ? `/shifts/demo?date=${encodeURIComponent(date)}`
      : "/shifts/demo";
    const response = await api.get(url);
    return response.data;
  }

  const response = await api.get("/shifts/sessions/open/all");
  return response.data;
};

export const closeShift = async (session_id) => {
  const response = await api.put(`/shifts/sessions/${session_id}/close`);
  return response.data;
};

export const reopenShift = async (session_id) => {
  const response = await api.put(`/shifts/sessions/${session_id}/reopen`);
  return response.data;
};

// ==================== REPORTS ====================
export const getTimeWiseReport = async (bill_date) => {
  const response = await api.get(`/reports/time-wise?bill_date=${bill_date}`);
  return response.data;
};

export const getItemWiseReport = async (bill_date) => {
  const response = await api.get(`/reports/item-wise?bill_date=${bill_date}`);
  return response.data;
};

export const getShiftWiseReport = async (bill_date) => {
  const response = await api.get(`/reports/shift-wise?bill_date=${bill_date}`);
  return response.data;
};

export const getDateRangeReport = async (startDate, endDate) => {
  const response = await api.get(
    `/reports/date-range?startDate=${startDate}&endDate=${endDate}`
  );
  return response.data;
};

export const getTimeRangeReport = async (date, startTime, endTime) => {
  const response = await api.get(
    `/reports/time-range?date=${date}&startTime=${startTime}&endTime=${endTime}`
  );
  return response.data;
};

export const getItemReport = async (startDate, endDate) => {
  const response = await api.get(
    `/reports/by-item?startDate=${startDate}&endDate=${endDate}`
  );
  return response.data;
};

export const updateMenuItem = async (id, item) => {
  const response = await api.put(`/menu/${id}`, item);
  return response.data;
};

// ==================== DASHBOARD ====================
export const getTopItems = async () => {
  const response = await api.get("/dashboard/top-items");
  return response.data;
};

// ==================== RECONCILIATION ====================
export const getUnprintedBills = async () => {
  const response = await api.get("/reconciliation/unprinted");
  return response.data;
};

// ==================== TRACK LOCKDOWN & EOD ====================

/**
 * Fetch lock status + last bill number for all 4 tracks.
 * No admin required — used by LoginPanel to show locked state.
 */
export const getTrackStatuses = async () => {
  const response = await api.get("/tracks/status");
  return response.data;
};

/**
 * Admin: Lock or unlock a specific track.
 * @param {string} track  e.g. 'RBS1'
 * @param {boolean} isLocked
 */
export const setTrackLock = async (track, isLocked) => {
  const response = await api.patch(`/tracks/${encodeURIComponent(track)}/lock`, {
    is_locked: isLocked,
  });
  return response.data;
};

/**
 * Admin: Run the EOD audit — returns all unprinted bills grouped by track.
 */
export const getEODAudit = async () => {
  const response = await api.get("/tracks/eod-audit");
  return response.data;
};

/**
 * Admin: Perform the EOD reset — zeros all bill counters and locks all tracks.
 */
export const triggerEODReset = async () => {
  const response = await api.post("/tracks/eod-reset", { confirm: true });
  return response.data;
};

// ==================== SETTINGS ====================
export const getSettings = async () => {
  const response = await api.get("/settings");
  return response.data;
};

export const updateSettings = async (settings) => {
  const response = await api.put("/settings", settings);
  return response.data;
};

// ==================== HEALTH CHECK ====================
export const healthCheck = async () => {
  const response = await api.get("/health");
  return response.data;
};

export default api;
