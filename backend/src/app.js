// Updated app.js for the new database schema
// Modified authentication and related functionality to work with shift_sessions table

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pool = require("./db");
require("dotenv").config();
require("./services/scheduler"); // Initialize shift scheduler (if still needed)

// Create app before using app.use(...)
const app = express();
const PORT = process.env.PORT || 8000;

// Add these imports after creating app (single import set)
const billingRoutes = require("./routes/billingRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const itemRoutes = require("./routes/itemRoutes");
const tableRoutes = require("./routes/tableRoutes");
const reportRoutes = require("./routes/reportRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reconciliationRoutes = require("./routes/reconciliationRoutes");
const printerRoutes = require("./routes/printerRoutes");
const trackRoutes = require("./routes/trackRoutes");
const reportController = require("./controllers/reportController");
const SettingsModel = require("./models/settingsModel");
const ShiftModel = require("./models/shiftModel");
const { resolveAdminMode } = require("./auth/config");
const { createSession, deleteSession } = require("./auth/sessionStore");
const {
  attachAuth,
  requireAuth,
  requireAdminAny,
  requireAdminFull,
} = require("./middleware/auth");

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Rate limiting - development & multi-device tuned
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100000, // Greatly increased to support multi-terminal POS systems
});
app.use("/api/", limiter);

// CORS config
app.use(
  cors({
    origin: ["http://127.0.0.1:3000", "http://localhost:3000"],
    credentials: true,
  }),
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/api", attachAuth);

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ================ ROUTES (centralized) ================
app.use("/api/billing", requireAuth, billingRoutes);
app.use("/api/shifts", requireAuth, shiftRoutes);
app.use("/api/items", requireAuth, itemRoutes);
app.use("/api/tables", requireAuth, tableRoutes);
app.use("/api/printer", printerRoutes);
app.use("/api/tracks", trackRoutes); // Track lockdown & EOD
app.use("/api/reports", requireAdminAny, reportRoutes);
app.use("/api/dashboard", requireAdminAny, dashboardRoutes);
app.use("/api/reconciliation", requireAdminAny, reconciliationRoutes);

// Simple settings endpoints for admin UI
app.get("/api/settings/clerks", requireAdminAny, reportController.getClerks);
app.get("/api/settings", requireAuth, reportController.getSettings);
app.put("/api/settings", requireAdminAny, reportController.updateSettings);
app.post("/api/settings/clerk", requireAdminAny, reportController.createClerk);
app.put("/api/settings/section", requireAuth, reportController.updateSection);

app.get("/api/auth/shift-status", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT session_id, shift_name, status, is_locked, last_bill_number, start_time, end_time
       FROM sessions
       ORDER BY shift_name, start_time DESC`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ detail: "Failed to fetch shift status" });
  }
});

// POST /api/auth/login - Updated for shift_sessions table
app.post("/api/auth/login", async (req, res) => {
  try {
    const { staff_code: initials, date, track, password = "" } = req.body;

    // Normalize initials to uppercase and limit to 10 characters for DB consistency
    const upperStaffCode = initials ? String(initials).toUpperCase().slice(0, 10) : null;

    if (!initials || !date || !track) {
      return res.status(400).json({
        detail: "Initials, date, and track are required",
      });
    }

    let mode = "clerk";

    if (upperStaffCode === "SRIHARI") {
      mode = resolveAdminMode(password);

      if (!mode) {
        return res.status(401).json({
          detail: "Invalid admin password",
        });
      }
    } else {
      if (upperStaffCode.length > 3) {
        return res.status(400).json({
          detail: "Clerk initials must be at most 3 characters",
        });
      }
    }

    // IMPORTANT: If the requested track/shift is CLOSED, do not allow login.
    // We check by shift_name only — session_date is a fixed creation date and
    // doesn't change per login, so date-specific comparisons always miss closed shifts.
    const closedCheck = await pool.query(
      `SELECT 1 FROM sessions WHERE shift_name = $1 AND UPPER(status) = 'CLOSED' LIMIT 1`,
      [track],
    );
    const openCheck = await pool.query(
      `SELECT 1 FROM sessions WHERE shift_name = $1 AND UPPER(status) = 'OPEN' LIMIT 1`,
      [track],
    );
    if (closedCheck.rows.length > 0 && openCheck.rows.length === 0) {
      if (mode === "admin-full") {
        // Automatically open the shift!
        await pool.query(
          `UPDATE sessions 
           SET status = 'OPEN', 
               end_time = NULL, 
               closed_by = NULL, 
               is_locked = FALSE, 
               clerk_initials = $1 
           WHERE shift_name = $2`,
          [upperStaffCode, track]
        );
      } else {
        return res
          .status(403)
          .json({ detail: "Shift is closed for this track/date" });
      }
    }

    // LOCKDOWN CHECK: Only block clerks when the track is locked AND
    // there is no currently OPEN session. If admin has already reopened
    // the track (status = OPEN), the clerk should be allowed in.
    if (mode === "clerk") {
      const lockCheck = await pool.query(
        `SELECT s.is_locked
           FROM sessions s
           WHERE s.shift_name = $1
             AND s.is_locked = TRUE
             AND NOT EXISTS (
               SELECT 1 FROM sessions s2
               WHERE s2.shift_name = $1 AND s2.status = 'OPEN' AND s2.is_locked = FALSE
             )
           LIMIT 1`,
        [track],
      );
      if (lockCheck.rows.length > 0) {
        return res.status(423).json({
          detail:
            "This track is logged out. Please contact an admin to unlock it.",
          locked: true,
        });
      }
    }

    // Find an existing open session for this track (regardless of clerk)
    // The database constraint allows only ONE open session per shift_name
    let shiftSessionResult = await pool.query(
      `SELECT session_id, clerk_initials FROM sessions 
             WHERE shift_name = $1 AND status = 'OPEN'`,
      [track],
    );

    let shift_session_id;

    if (shiftSessionResult.rows.length > 0) {
      // Reuse the existing open session for this track.
      // Also clear is_locked and update clerk_initials so that the session reflects the current logged in clerk
      shift_session_id = shiftSessionResult.rows[0].session_id;
      await pool.query(
        `UPDATE sessions SET is_locked = FALSE, clerk_initials = $1 WHERE session_id = $2`,
        [upperStaffCode, shift_session_id],
      );
    } else {
      // No open session exists for this track, create a new one
      const createResult = await pool.query(
        `INSERT INTO sessions (shift_name, clerk_initials, session_date, status, start_time, is_locked)
     VALUES ($1, $2, $3, 'OPEN', CURRENT_TIMESTAMP, FALSE)
     RETURNING session_id`,
        [track, upperStaffCode, date],
      );

      if (createResult.rows.length > 0) {
        shift_session_id = createResult.rows[0].session_id;
      } else {
        return res
          .status(409)
          .json({ detail: "Unable to create session for clerk" });
      }
    }

    // Ensure settings exist for the master row 'CLK' and admin 'SRIHARI'
    if (upperStaffCode === "SRIHARI") {
      await SettingsModel.ensureSettings("SRIHARI");
    } else {
      await SettingsModel.ensureSettings("CLK");
    }
    const authToken = createSession({
      staff_code: upperStaffCode,
      mode,
      session_id: shift_session_id,
      track,
      billing_date: date,
    });

    res.json({
      mode,
      shift_session_id,
      session_id: shift_session_id, // For backward compatibility
      auth_token: authToken,
    });
  } catch (error) {
    console.error("Auth login error:", error);
    res.status(500).json({ detail: "Authentication failed" });
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  deleteSession(req.auth.token);
  res.json({ detail: "Logged out", track_locked: false });
});

// POST /api/auth/close-shift-logout — closes the current shift AND logs out
// Used by the "Close Shift & Log Out" button for both admin and clerk
app.post("/api/auth/close-shift-logout", requireAuth, async (req, res) => {
  const { mode, track } = req.auth;

  if (track) {
    try {
      const openSession = await ShiftModel.getCurrentOpenSession(track);
      if (openSession) {
        await ShiftModel.closeSession(openSession.session_id, req.auth.staff_code || "LOGOUT");
        console.log(`🔒 Track '${track}' shift CLOSED on close-shift-logout.`);
      }
    } catch (err) {
      console.error(`Failed to close shift for '${track}':`, err.message);
      // Non-fatal — still complete the logout
    }
  }

  deleteSession(req.auth.token);
  res.json({ detail: "Shift closed and logged out" });
});

// ================ MENU ROUTES (UNCHANGED) ================
// GET /api/menu - all menu items
app.get("/api/menu", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM items ORDER BY category, name",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get menu error:", error);
    res.status(500).json({ detail: "Failed to fetch menu items" });
  }
});

// POST /api/menu/bulk-update
app.post("/api/menu/bulk-update", requireAdminFull, async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Expected an array of items" });
    }

    const results = [];
    for (const itemData of items) {
      const alphaCode = itemData.alpha_code ? String(itemData.alpha_code).trim().toUpperCase() : null;
      const numericCode = itemData.numeric_code ? String(itemData.numeric_code).trim() : null;

      let existingItemResult = null;
      if (alphaCode) {
        const numericVal = !isNaN(Number(alphaCode)) && alphaCode.trim() !== '' ? Number(alphaCode) : -1;
        existingItemResult = await pool.query(
          `SELECT * FROM items WHERE UPPER(alpha_code) = $1 OR UPPER(numeric_code) = $1 OR id = $2 LIMIT 1`,
          [alphaCode.toUpperCase(), numericVal]
        );
      }
      if ((!existingItemResult || existingItemResult.rows.length === 0) && numericCode) {
        const numericVal = !isNaN(Number(numericCode)) && numericCode.trim() !== '' ? Number(numericCode) : -1;
        existingItemResult = await pool.query(
          `SELECT * FROM items WHERE UPPER(alpha_code) = $1 OR UPPER(numeric_code) = $1 OR id = $2 LIMIT 1`,
          [numericCode.toUpperCase(), numericVal]
        );
      }

      const existingItem = existingItemResult && existingItemResult.rows.length > 0 ? existingItemResult.rows[0] : null;

      if (existingItem) {
        let categoryJson = existingItem.category;
        try {
          const parsed = typeof categoryJson === "string" ? JSON.parse(categoryJson) : categoryJson;
          if (!Array.isArray(parsed)) {
            if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
              categoryJson = JSON.stringify([parsed]);
            } else {
              categoryJson = JSON.stringify([{ qty: 1, name: "General" }]);
            }
          } else {
            categoryJson = JSON.stringify(parsed);
          }
        } catch (e) {
          categoryJson = JSON.stringify([{ qty: 1, name: "General" }]);
        }

        const payload = {
          name: itemData.name || existingItem.name,
          alpha_code: alphaCode || existingItem.alpha_code,
          numeric_code: numericCode || existingItem.numeric_code,
          price_fixed: parseFloat(itemData.price_fixed) !== undefined && !isNaN(parseFloat(itemData.price_fixed)) ? parseFloat(itemData.price_fixed) : existingItem.price_fixed,
          price_general: parseFloat(itemData.price_general) !== undefined && !isNaN(parseFloat(itemData.price_general)) ? parseFloat(itemData.price_general) : existingItem.price_general,
          price_ac: parseFloat(itemData.price_ac) !== undefined && !isNaN(parseFloat(itemData.price_ac)) ? parseFloat(itemData.price_ac) : existingItem.price_ac,
          category: categoryJson,
          is_separate: existingItem.is_separate,
        };

        const updated = await pool.query(
          `UPDATE items SET
            name = $1, alpha_code = $2, numeric_code = $3,
            price_fixed = $4, price_general = $5, price_ac = $6,
            category = $7, is_separate = $8
           WHERE id = $9 RETURNING *`,
          [
            payload.name,
            payload.alpha_code,
            payload.numeric_code,
            payload.price_fixed,
            payload.price_general,
            payload.price_ac,
            payload.category,
            payload.is_separate,
            existingItem.id
          ]
        );
        results.push(updated.rows[0]);
      } else {
        const categoryJson = JSON.stringify([{ qty: 1, name: "General" }]);
        const inserted = await pool.query(
          `INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            itemData.name || "Unknown Item",
            alphaCode,
            numericCode,
            parseFloat(itemData.price_fixed) || 0,
            parseFloat(itemData.price_general) || 0,
            parseFloat(itemData.price_ac) || 0,
            categoryJson,
            false
          ]
        );
        results.push(inserted.rows[0]);
      }
    }

    res.json({ message: "Bulk update complete", count: results.length });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({ detail: "Failed to perform bulk update", details: error.message });
  }
});

// POST /api/menu - add menu item
app.post("/api/menu", requireAdminFull, async (req, res) => {
  try {
    const {
      name,
      alpha_code,
      numeric_code,
      price_fixed,
      price_general,
      price_ac,
      category,
      is_separate, // Add is_separate
    } = req.body;

    if (!name || (!alpha_code && !numeric_code)) {
      return res.status(400).json({ detail: "Name and code required" });
    }

    // Ensure category is properly formatted as JSON for database
    // The database constraint requires an ARRAY with objects containing 'qty' and 'name' fields
    let categoryJson;
    if (typeof category === "string" && category.trim()) {
      const trimmed = category.trim();
      let isJson = false;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && (typeof parsed === "object" || Array.isArray(parsed))) {
          categoryJson = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
          isJson = true;
        }
      } catch (e) {
        // Not a valid JSON string, treat as plain text
      }

      if (!isJson) {
        // If it's a plain string, wrap it in JSON array format with qty
        categoryJson = JSON.stringify([
          {
            qty: 1, // Default quantity
            name: trimmed,
          },
        ]);
      }
    } else if (typeof category === "object" && category !== null) {
      // If it's already an object, wrap in array
      if (Array.isArray(category)) {
        categoryJson = JSON.stringify(category);
      } else {
        categoryJson = JSON.stringify([
          {
            qty: category.qty || 1,
            name: category.name || "",
          },
        ]);
      }
    } else {
      // Default empty category
      categoryJson = JSON.stringify([{ qty: 1, name: "" }]);
    }

    const result = await pool.query(
      `INSERT INTO items (name, alpha_code, numeric_code, price_fixed, price_general, price_ac, category, is_separate)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name,
        alpha_code?.toUpperCase(),
        numeric_code,
        parseFloat(price_fixed) || 0,
        parseFloat(price_general) || 0,
        parseFloat(price_ac) || 0,
        categoryJson,
        is_separate || false,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Add menu item error:", error);

    // Better error handling based on constraint type
    if (error.constraint) {
      if (
        error.constraint.includes("unique") ||
        error.constraint.includes("pkey")
      ) {
        return res.status(400).json({ detail: "Item code already exists" });
      } else if (error.constraint === "chk_category_format") {
        return res.status(400).json({
          detail: "Invalid category format. Category must be a string.",
        });
      } else {
        return res
          .status(400)
          .json({ detail: `Constraint violation: ${error.constraint}` });
      }
    }
    res.status(500).json({ detail: "Failed to add menu item" });
  }
});

// DELETE /api/menu/:id
app.delete("/api/menu/:id", requireAdminFull, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM items WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ detail: "Item not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Delete menu item error:", error);
    res.status(500).json({ detail: "Failed to delete menu item" });
  }
});

// PUT /api/menu/:id - update menu item
app.put("/api/menu/:id", requireAdminFull, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      alpha_code,
      numeric_code,
      price_fixed,
      price_general,
      price_ac,
      category,
      is_active,
      is_separate, // Add is_separate
    } = req.body;

    if (!name || (!alpha_code && !numeric_code)) {
      return res.status(400).json({ detail: "Name and code required" });
    }

    // Ensure category is properly formatted as JSON for database (Same logic as POST)
    let categoryJson;
    if (typeof category === "string" && category.trim()) {
      const trimmed = category.trim();
      let isJson = false;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && (typeof parsed === "object" || Array.isArray(parsed))) {
          categoryJson = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
          isJson = true;
        }
      } catch (e) {
        // Not a valid JSON string, treat as plain text
      }

      if (!isJson) {
        // If it's a plain string, wrap it in JSON array format with qty
        categoryJson = JSON.stringify([
          {
            qty: 1, // Default quantity
            name: trimmed,
          },
        ]);
      }
    } else if (typeof category === "object" && category !== null) {
      // If it's already an object, wrap in array
      if (Array.isArray(category)) {
        categoryJson = JSON.stringify(category);
      } else {
        categoryJson = JSON.stringify([
          {
            qty: category.qty || 1,
            name: category.name || "",
          },
        ]);
      }
    } else {
      // Default empty category
      categoryJson = JSON.stringify([{ qty: 1, name: "" }]);
    }

    const result = await pool.query(
      `UPDATE items SET
                name = $1,
                alpha_code = $2,
                numeric_code = $3,
                price_fixed = $4,
                price_general = $5,
                price_ac = $6,
                category = $7,
                is_separate = $8
             WHERE id = $9
             RETURNING *`,
      [
        name,
        alpha_code ? alpha_code.toUpperCase() : null,
        numeric_code,
        parseFloat(price_fixed) || 0,
        parseFloat(price_general) || 0,
        parseFloat(price_ac) || 0,
        categoryJson, // Use formatted category
        is_separate || false,
        id,
      ],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ detail: "Item not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update menu item error:", error);
    if (error.constraint)
      return res.status(400).json({ detail: "Item code already exists" });
    res.status(500).json({ detail: "Failed to update menu item" });
  }
});

// GET /api/menu/lookup/:code
app.get("/api/menu/lookup/:code", requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const upperCode = code.toUpperCase();
    const numericVal = !isNaN(Number(code)) && code.trim() !== '' ? Number(code) : -1;
    
    const result = await pool.query(
      `SELECT * FROM items 
             WHERE (id = $2 OR UPPER(alpha_code) = $1 OR UPPER(numeric_code) = $1 OR UPPER(name) = $1) LIMIT 1`,
      [upperCode, numericVal],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ detail: "Item not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Lookup item error:", error);
    res.status(500).json({ detail: "Failed to lookup item" });
  }
});

// ================ ADMIN MODULE ENHANCEMENTS (UPDATED) ================
// GET /api/admin/dashboard - Updated for new schema
app.get("/api/admin/dashboard", requireAdminAny, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const salesResult = await pool.query(
      `SELECT COALESCE(SUM(grand_total), 0) as total_sales, COUNT(*) as total_bills 
             FROM bills WHERE bill_date = $1`,
      [today],
    );

    const tablesResult = await pool.query(
      `SELECT DISTINCT table_no FROM bills 
             WHERE bill_date = $1 AND created_at >= $2`,
      [today, new Date(Date.now() - 2 * 60 * 60 * 1000)],
    );

    const totalTables = 50;
    const occupiedTables = tablesResult.rows.length;
    const vacantTables = totalTables - occupiedTables;

    const topItemsResult = await pool.query(
      `SELECT bi.item_name, SUM(bi.quantity) as total_quantity, SUM(bi.line_total) as total_sales
             FROM bill_items bi
             INNER JOIN bills b ON bi.bill_id = b.id
             WHERE b.bill_date = $1
             GROUP BY bi.item_name
             ORDER BY total_quantity DESC
             LIMIT 5`,
      [today],
    );

    const billsCount = salesResult.rows[0].total_bills;

    res.json({
      totalSales: parseFloat(salesResult.rows[0].total_sales),
      totalBills: parseInt(billsCount),
      occupiedTables: occupiedTables,
      vacantTables: vacantTables,
      topSellingItems: topItemsResult.rows.map((item) => ({
        name: item.item_name,
        quantity: parseFloat(item.total_quantity),
        sales: parseFloat(item.total_sales),
      })),
    });
  } catch (error) {
    console.error("Dashboard metrics error:", error);
    res.status(500).json({ detail: "Failed to fetch dashboard metrics" });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Restaurant Billing Backend",
    version: "2.1.0",
    schema_version: "Updated with merged shift_sessions table",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({
    detail:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    timestamp: new Date().toISOString(),
  });
});

// DB connection test & auto-migrations for settings schema integrity
pool
  .query("SELECT NOW()")
  .then(async () => {
    console.log("✅ Database connected successfully");
    try {
      await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS allowed_clerks TEXT DEFAULT 'CLK,V,P,B'");
      await pool.query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS section VARCHAR(10) DEFAULT 'L'");
      console.log("✅ Settings table schema verified (allowed_clerks and section columns ensured)");
    } catch (e) {
      console.error("Warning: Settings table schema check failed:", e.message);
    }
  })
  .catch((err) => console.error("❌ Database connection failed:", err));

const server = app.listen(PORT, () => {
  console.log(`🚀 Restaurant Billing Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📊 API Base URL: http://127.0.0.1:${PORT}/api`);
  console.log(`📋 Schema: Updated with merged shift_sessions table`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `❌ Port ${PORT} is already in use. Stop the process using this port or set a different PORT environment variable.`,
    );
    console.error(
      `You can free the port (PowerShell): netstat -ano | findstr :${PORT} ; taskkill /PID <pid> /F  OR Stop-Process -Id <pid> -Force`,
    );
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});

module.exports = app;
