const pool = require("../db");

// GET /api/reports/time-range
exports.getTimeRangeReport = async (req, res) => {
  try {
    const { date, startTime, endTime } = req.query;
    if (!date || !startTime || !endTime) {
      return res
        .status(400)
        .json({ detail: "date, startTime, and endTime are required" });
    }

    const startTimestamp = `${date} ${startTime}`;
    const endTimestamp = `${date} ${endTime}`;

    const result = await pool.query(
      `
      SELECT b.*, b.track as shift_name
      FROM bills b
      WHERE b.created_at >= $1 AND b.created_at <= $2 AND b.bill_number > 0
      ORDER BY b.created_at`,
      [startTimestamp, endTimestamp],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Time range report error:", error);
    res.status(500).json({ detail: "Failed to generate time range report" });
  }
};

// GET /api/reports/date-range
exports.getDateRangeReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ detail: "startDate and endDate are required" });
    }

    const result = await pool.query(
      `
      SELECT b.*, b.track as shift_name
      FROM bills b
      WHERE b.bill_date >= $1 AND b.bill_date <= $2 AND b.bill_number > 0
      ORDER BY b.bill_date, b.bill_number`,
      [startDate, endDate],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Date range report error:", error);
    res.status(500).json({ detail: "Failed to generate date range report" });
  }
};

// GET /api/reports/by-shift
exports.getShiftReport = async (req, res) => {
  try {
    const { date, shift_name: shiftName } = req.query;
    if (!date || !shiftName) {
      return res
        .status(400)
        .json({ detail: "date and shiftName are required" });
    }

    const result = await pool.query(
      `
      SELECT b.*
      FROM bills b
      WHERE b.bill_date = $1 AND b.track = $2 AND b.bill_number > 0
      ORDER BY b.bill_number`,
      [date, shiftName],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Shift report error:", error);
    res.status(500).json({ detail: "Failed to generate shift report" });
  }
};

// GET /api/reports/shift-summary
exports.getShiftSummaryReport = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ detail: "date is required" });

    const result = await pool.query(
      `
      WITH GstRate AS (
          SELECT (COALESCE(sgst_percentage, 2.50) + COALESCE(cgst_percentage, 2.50)) / 100.0 as rate
          FROM settings LIMIT 1
      ),
      ShiftBaseTotals AS (
          SELECT 
              b.bill_date as date,
              b.track as shift_name,
              SUM((item->>'line_total')::decimal) as base_item_sum
          FROM bills b,
          jsonb_array_elements(b.items_json) as item
          WHERE b.bill_date = $1 AND b.bill_number > 0
          GROUP BY b.bill_date, b.track
      )
      SELECT 
          s.date,
          s.shift_name,
          CEIL(s.base_item_sum) as amount,
          CEIL(s.base_item_sum * (SELECT rate FROM GstRate)) as gst_amount,
          CEIL(s.base_item_sum * (1 + (SELECT rate FROM GstRate))) as total_amount
      FROM ShiftBaseTotals s
      ORDER BY s.shift_name
      `,
      [date],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Shift summary report error:", error);
    res.status(500).json({ detail: "Failed to generate shift summary report" });
  }
};

// GET /api/reports/shift-detailed
exports.getShiftDetailedReport = async (req, res) => {
  try {
    const { date, shift_name } = req.query;
    if (!date || !shift_name)
      return res
        .status(400)
        .json({ detail: "date and shift_name are required" });

    const result = await pool.query(
      `
      WITH GstRate AS (
          SELECT (COALESCE(sgst_percentage, 2.50) + COALESCE(cgst_percentage, 2.50)) / 100.0 as rate
          FROM settings LIMIT 1
      ),
      FlatItems AS (
          SELECT 
              item->>'item_code' as item_code,
              item->>'item_name' as item_name,
              item->>'category' as legacy_category,
              (item->>'quantity')::decimal as qty,
              (item->>'line_total')::decimal as amount,
              COALESCE(item->'categories', '[]'::jsonb) as categories_json
          FROM bills b,
          jsonb_array_elements(b.items_json) as item
          WHERE b.bill_date = $1 AND b.track = $2 AND b.bill_number > 0
      ),
      ProcessedItems AS (
          SELECT 
              item_code,
              item_name,
              qty,
              amount,
              COALESCE(
                  (SELECT cat->>'name' FROM jsonb_array_elements(
                    CASE 
                      WHEN jsonb_typeof(categories_json->0) = 'array' THEN categories_json->0
                      ELSE categories_json
                    END
                  ) cat LIMIT 1),
                  legacy_category
              ) as category_name
          FROM FlatItems
      )
      SELECT   
        COALESCE(p.item_code, '') as item_code,
        p.item_name,
        p.category_name as category,
        CEIL(SUM(p.qty)) as total_quantity,
        CEIL(SUM(p.amount)) as base_amount,
        CEIL(SUM(p.amount) * (SELECT rate FROM GstRate)) as gst_amount,
        CEIL(SUM(p.amount) * (1 + (SELECT rate FROM GstRate))) as final_total
      FROM ProcessedItems p
      GROUP BY p.item_code, p.item_name, p.category_name
      ORDER BY p.category_name, p.item_name
      `,
      [date, shift_name],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Shift detailed report error:", error);
    res
      .status(500)
      .json({ detail: "Failed to generate shift detailed report" });
  }
};

// GET /api/reports/shift-wise (for the frontend Reports component)
exports.getShiftWiseReport = async (req, res) => {
  try {
    const { bill_date } = req.query;
    if (!bill_date) {
      return res.status(400).json({ detail: "bill_date is required" });
    }

    const result = await pool.query(
      `
      SELECT   
        track as shift_name,   
        COUNT(id) as bill_count,
        CEIL(SUM(grand_total)) as total_amount
      FROM bills
      WHERE bill_date = $1 AND bill_number > 0
      GROUP BY track
      ORDER BY track`,
      [bill_date],
    );

    res.json({ report: result.rows });
  } catch (error) {
    console.error("Shift wise report error:", error);
    res.status(500).json({ detail: "Failed to generate shift wise report" });
  }
};

// GET /api/reports/time-wise (for the frontend Reports component)
exports.getTimeWiseReport = async (req, res) => {
  try {
    const { bill_date } = req.query;
    if (!bill_date) {
      return res.status(400).json({ detail: "bill_date is required" });
    }

    const result = await pool.query(
      `
      SELECT   
        TO_CHAR(created_at, 'HH24:00') as time_slot,
        COUNT(id) as bill_count,
        CEIL(SUM(grand_total)) as total_amount
      FROM bills
      WHERE bill_date = $1 AND bill_number > 0
      GROUP BY time_slot
      ORDER BY time_slot`,
      [bill_date],
    );

    res.json({ report: result.rows });
  } catch (error) {
    console.error("Time wise report error:", error);
    res.status(500).json({ detail: "Failed to generate time wise report" });
  }
};

// GET /api/reports/item-wise (for the frontend Reports component)
exports.getItemWiseReport = async (req, res) => {
  try {
    const { bill_date } = req.query;
    if (!bill_date) {
      return res.status(400).json({ detail: "bill_date is required" });
    }

    const result = await pool.query(
      `
      WITH GstRate AS (
          SELECT (COALESCE(sgst_percentage, 2.50) + COALESCE(cgst_percentage, 2.50)) / 100.0 + 1.0 as multiplier
          FROM settings LIMIT 1
      )
      SELECT   
        item->>'item_name' as item_name,   
        CEIL(SUM((item->>'quantity')::numeric)) as total_quantity,
        CEIL(SUM((item->>'line_total')::decimal) * (SELECT multiplier FROM GstRate)) as total_amount
      FROM bills b,
      jsonb_array_elements(b.items_json) as item
      WHERE b.bill_date = $1 AND b.bill_number > 0
      GROUP BY item->>'item_name'
      ORDER BY total_quantity DESC`,
      [bill_date],
    );

    res.json({ report: result.rows });
  } catch (error) {
    console.error("Item wise report error:", error);
    res.status(500).json({ detail: "Failed to generate item wise report" });
  }
};

// GET /api/reports/by-item (advanced item report with optional filters)
exports.getItemReport = async (req, res) => {
  try {
    const { startDate, endDate, item_name, category } = req.query;
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ detail: "startDate and endDate are required" });
    }

    // Build dynamic WHERE clause for optional filters
    let whereConditions = [
      "b.bill_date >= $1",
      "b.bill_date <= $2",
      "b.bill_number > 0",
    ];
    let params = [startDate, endDate];
    let paramIndex = 3;

    if (item_name) {
      whereConditions.push(`item->>'item_name' ILIKE $${paramIndex}`);
      params.push(`%${item_name}%`);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`(
        item->>'category' ILIKE $${paramIndex} OR
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            CASE 
              WHEN jsonb_typeof(COALESCE(item->'categories', '[]'::jsonb)->0) = 'array' THEN COALESCE(item->'categories', '[]'::jsonb)->0
              ELSE COALESCE(item->'categories', '[]'::jsonb)
            END
          ) cat
          WHERE cat->>'name' ILIKE $${paramIndex}
        )
      )`);
      params.push(`%${category}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(" AND ");

    const result = await pool.query(
      `WITH GstRate AS (
          SELECT (COALESCE(sgst_percentage, 2.50) + COALESCE(cgst_percentage, 2.50)) / 100.0 + 1.0 as multiplier
          FROM settings LIMIT 1
      )
      SELECT   
        item->>'item_name' as item_name,
        CEIL(SUM((item->>'quantity')::decimal)) as total_quantity,
        CEIL(SUM((item->>'line_total')::decimal) * (SELECT multiplier FROM GstRate)) as total_amount
      FROM bills b,
      jsonb_array_elements(b.items_json) as item
      WHERE ${whereClause}
      GROUP BY item->>'item_name'
      ORDER BY total_quantity DESC`,
      params,
    );

    const formattedResult = result.rows.map((row) => ({
      itemName: row.item_name,
      totalQuantity: Math.ceil(parseFloat(row.total_quantity || 0)),
      totalAmount: Math.ceil(parseFloat(row.total_amount || 0)),
    }));

    res.json(formattedResult);
  } catch (error) {
    console.error("Item report error:", error);
    res.status(500).json({ detail: "Failed to generate item report" });
  }
};

// GET /api/reconciliation/unprinted
exports.getUnprintedBills = async (req, res) => {
  try {
    // Get bills from the last 24 hours
    const result = await pool.query(`
      SELECT 
        b.*, 
        b.track as shift_name 
      FROM bills b
      WHERE b.created_at > NOW() - INTERVAL '24 hours' 
      ORDER BY b.created_at DESC`);

    res.json(result.rows);
  } catch (error) {
    console.error("Unprinted bills error:", error);
    res.status(500).json({ detail: "Failed to fetch unprinted bills" });
  }
};

// GET /api/reconciliation/running
exports.getRunningBills = async (req, res) => {
  try {
    // Group pending orders by table_no and party_no and include created_at from the latest order
    const result = await pool.query(
      `
      SELECT
        o.table_no,
        o.party_no,
        MAX(o.created_at) as created_at,
        SUM(o.line_total) as total_amount,
        COUNT(o.id) as items_count
      FROM orders o
      GROUP BY o.table_no, o.party_no
      ORDER BY MAX(o.created_at) DESC
      `,
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Running bills error:", error);
    res.status(500).json({ detail: "Failed to fetch running bills" });
  }
};

// DELETE /api/reconciliation/running/table/:tableNo/party/:partyNo
exports.clearRunningBill = async (req, res) => {
  try {
    const { tableNo, partyNo } = req.params;
    const OrderModel = require("../models/orderModel");
    await OrderModel.clearOrders(tableNo, partyNo);
    res.json({ message: "Running bill cleared successfully" });
  } catch (error) {
    console.error("Clear running bill error:", error);
    res.status(500).json({ detail: "Failed to clear running bill" });
  }
};

// Settings using SettingsModel
const SettingsModel = require("../models/settingsModel");

// GET /api/settings
exports.getSettings = async (req, res) => {
  try {
    const requestedClerk = String(
      req.query.clerk || req.auth?.staff_code || "CLK",
    ).toUpperCase();
    const isAdmin = String(req.auth?.mode || "").startsWith("admin");

    if (!isAdmin && requestedClerk !== req.auth?.staff_code) {
      return res
        .status(403)
        .json({ detail: "You can only access your own settings" });
    }

    const settings = await SettingsModel.getSettings(requestedClerk);

    // Fallback if null (shouldn't happen with ensureSettings, but safe check)
    if (!settings) {
      return res.json({
        hotel_name: "",
        phone: "",
        gstin: "",
        address: "",
        clerk_initials: requestedClerk,
      });
    }

    res.json(settings);
  } catch (err) {
    console.error("Get settings error:", err);
    res.status(500).json({ detail: "Failed to get settings" });
  }
};

// GET /api/settings/clerks
exports.getClerks = async (req, res) => {
  try {
    const clerks = await SettingsModel.getAllClerks();
    res.json(clerks);
  } catch (err) {
    console.error("Get clerks error:", err);
    res.status(500).json({ detail: "Failed to get clerks list" });
  }
};

// PUT /api/settings
exports.updateSettings = async (req, res) => {
  try {
    const targetClerk = String(
      req.query.clerk || req.auth?.staff_code || "CLK",
    ).toUpperCase();

    // Check if the targetClerk is 'CLK' or exists in the database settings table
    const checkExists = await pool.query(
      "SELECT 1 FROM settings WHERE clerk_initials = $1",
      [targetClerk]
    );

    if (targetClerk !== "CLK" && checkExists.rows.length === 0) {
      return res.status(404).json({ detail: "This isn't a valid clerk name" });
    }

    const settings = await SettingsModel.updateSettings(
      targetClerk,
      req.body,
    );
    res.json(settings);
  } catch (err) {
    console.error("Update settings error:", err);
    res.status(500).json({ detail: "Failed to update settings" });
  }
};

// POST /api/settings/clerk
exports.createClerk = async (req, res) => {
  try {
    const { clerk } = req.body;
    if (!clerk) {
      return res.status(400).json({ detail: "Clerk initials are required" });
    }
    const targetClerk = String(clerk).toUpperCase().slice(0, 10);
    const settings = await SettingsModel.ensureSettings(targetClerk);
    res.json(settings);
  } catch (err) {
    console.error("Create clerk error:", err);
    res.status(500).json({ detail: "Failed to create clerk" });
  }
};

// PUT /api/settings/section
exports.updateSection = async (req, res) => {
  try {
    const { section } = req.body;
    if (!section) {
      return res.status(400).json({ detail: "Section is required" });
    }
    const settings = await SettingsModel.updateSection(section);
    res.json(settings);
  } catch (err) {
    console.error("Update section error:", err);
    res.status(500).json({ detail: "Failed to update section" });
  }
};

const BillingModel = require("../models/billingModel");

// GET /api/dashboard/top-items
exports.getTopItems = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Fetch raw bills data
    // Using loose date matching to be safe
    const result = await pool.query(
      `SELECT items_json FROM bills 
       WHERE bill_date::text LIKE $1 || '%' AND bill_number > 0`,
      [today],
    );

    // Manually aggregate items
    const itemCounts = {};

    result.rows.forEach((row) => {
      const items = row.items_json || [];
      // items should be an array of objects
      if (Array.isArray(items)) {
        items.forEach((item) => {
          const name = item.item_name || item.name || "Unknown";
          const qty = parseFloat(item.quantity || item.qty) || 0;

          if (name !== "Unknown" && qty > 0) {
            if (itemCounts[name]) {
              itemCounts[name] += qty;
            } else {
              itemCounts[name] = qty;
            }
          }
        });
      }
    });

    // Convert to array and sort
    const sortedItems = Object.entries(itemCounts)
      .map(([name, qty]) => ({
        item_name: name,
        total_quantity: qty,
      }))
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, 5);

    res.json(sortedItems);
  } catch (error) {
    console.error("Top items error:", error);
    res.status(500).json({ detail: "Failed to fetch top items" });
  }
};

// GET /api/dashboard/clerk-stats
exports.getClerkStats = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const [sales, history] = await Promise.all([
      BillingModel.getClerkSales(targetDate),
      BillingModel.getClerkLoginHistory(targetDate),
    ]);

    res.json({
      sales,
      history,
    });
  } catch (error) {
    console.error("Clerk stats error:", error);
    res.status(500).json({ detail: "Failed to fetch clerk stats" });
  }
};

// GET /api/reports/shift-only
exports.getShiftOnlyReport = async (req, res) => {
  try {
    const { date, shift_name } = req.query;
    if (!date || !shift_name)
      return res
        .status(400)
        .json({ detail: "date and shift_name are required" });

    const result = await pool.query(
      `
      WITH GstRate AS (
          SELECT (COALESCE(sgst_percentage, 2.50) + COALESCE(cgst_percentage, 2.50)) / 100.0 as rate
          FROM settings LIMIT 1
      ),
      ShiftBills AS (
          SELECT b.id, b.track, b.items_json
          FROM bills b
          WHERE b.bill_date = $1 AND b.track = $2 AND b.bill_number > 0
      ),
      ShiftBase AS (
          SELECT 
              sb.track as shift_name,
              COUNT(DISTINCT sb.id) as bill_count,
              COALESCE(SUM((item->>'line_total')::decimal), 0.00) as base_item_sum
          FROM ShiftBills sb
          LEFT JOIN LATERAL jsonb_array_elements(sb.items_json) as item ON TRUE
          GROUP BY sb.track
      )
      SELECT 
          s.shift_name,
          s.bill_count,
          ROUND(s.base_item_sum, 2) as base_amount,
          ROUND(s.base_item_sum * (SELECT rate FROM GstRate), 2) as gst_amount,
          ROUND(s.base_item_sum * (1 + (SELECT rate FROM GstRate)), 2) as total_amount
      FROM ShiftBase s
      `,
      [date, shift_name],
    );

    res.json(
      result.rows[0] || {
        shift_name,
        bill_count: 0,
        base_amount: 0,
        total_amount: 0,
        gst_amount: 0,
      },
    );
  } catch (error) {
    console.error("Shift only report error:", error);
    res.status(500).json({ detail: "Failed to generate shift only report" });
  }
};

// GET /api/reports/category-totals
exports.getCategoryTotals = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ detail: "date is required" });
    }

    const [result, gstRes] = await Promise.all([
      pool.query(
        `SELECT items_json FROM bills WHERE bill_date = $1 AND bill_number > 0`,
        [date]
      ),
      pool.query(
        `SELECT (COALESCE(sgst_percentage, 2.50) + COALESCE(cgst_percentage, 2.50)) / 100.0 + 1.0 as multiplier FROM settings LIMIT 1`
      )
    ]);

    const gstMultiplier = parseFloat(gstRes.rows[0]?.multiplier) || 1.05;
    const catMap = {};

    result.rows.forEach(row => {
      const items = row.items_json || [];
      if (Array.isArray(items)) {
        items.forEach(item => {
          let cats = [];
          if (item.categories) {
            cats = Array.isArray(item.categories) ? item.categories : [item.categories];
          } else if (item.category) {
            try {
              const parsed = typeof item.category === 'string' ? JSON.parse(item.category) : item.category;
              cats = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              cats = [];
            }
          }
          if (cats.length > 0 && Array.isArray(cats[0])) cats = cats[0];

          cats.forEach(cat => {
            if (cat && cat.name) {
              const catName = String(cat.name).trim();
              const catQtyMultiplier = parseFloat(cat.qty || cat.quantity) || 1;
              const itemQty = parseFloat(item.quantity || item.qty) || 0;
              const itemBaseAmount = parseFloat(item.line_total || item.amount) || 0;
              const itemAmountWithGst = itemBaseAmount * gstMultiplier;
              const resolvedQty = itemQty * catQtyMultiplier;

              if (!catMap[catName]) {
                catMap[catName] = { category_name: catName, total_quantity: 0, total_amount: 0 };
              }
              catMap[catName].total_quantity += resolvedQty;
              catMap[catName].total_amount += itemAmountWithGst;
            }
          });
        });
      }
    });

    const rows = Object.values(catMap).map(c => ({
      ...c,
      total_quantity: Math.ceil(c.total_quantity),
      total_amount: Math.ceil(c.total_amount)
    }));

    res.json(rows);
  } catch (error) {
    console.error("Category totals error:", error);
    res.status(500).json({ detail: "Failed to fetch category totals" });
  }
};

// GET /api/reports/category-report (detailed items matching selected category, with optional shift filter)
exports.getCategoryReport = async (req, res) => {
  try {
    const { startDate, endDate, category, shift_name, shift } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ detail: "startDate and endDate are required" });
    }

    const shiftFilter = shift_name || shift;
    let queryText = `SELECT items_json, bill_date, track FROM bills WHERE bill_date >= $1 AND bill_date <= $2 AND bill_number > 0`;
    let queryParams = [startDate, endDate];

    if (shiftFilter && shiftFilter.trim() !== "") {
      queryText += ` AND track = $3`;
      queryParams.push(shiftFilter.trim());
    }

    const [result, gstRes] = await Promise.all([
      pool.query(queryText, queryParams),
      pool.query(`
        SELECT (COALESCE(sgst_percentage, 2.50) + COALESCE(cgst_percentage, 2.50)) / 100.0 + 1.0 as multiplier
        FROM settings LIMIT 1
      `)
    ]);

    const gstMultiplier = parseFloat(gstRes.rows[0]?.multiplier) || 1.05;

    const itemAggregation = {}; // key: item_name::category_name

    result.rows.forEach(row => {
      const items = row.items_json || [];
      if (Array.isArray(items)) {
        items.forEach(item => {
          let cats = [];
          if (item.categories) {
            cats = Array.isArray(item.categories) ? item.categories : [item.categories];
          } else if (item.category) {
            try {
              const parsed = typeof item.category === 'string' ? JSON.parse(item.category) : item.category;
              cats = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              cats = [];
            }
          }
          if (cats.length > 0 && Array.isArray(cats[0])) {
            cats = cats[0];
          }

          cats.forEach(cat => {
            if (cat && cat.name) {
              const catName = String(cat.name).trim();
              const catQtyMultiplier = parseFloat(cat.qty || cat.quantity) || 1;
              const itemQty = parseFloat(item.quantity || item.qty) || 0;
              const itemBaseAmount = parseFloat(item.line_total || item.amount) || 0;
              const itemAmountWithGst = itemBaseAmount * gstMultiplier;

              if (!category) {
                // All categories selected: group and aggregate by category name only
                const key = catName;
                const resolvedQty = itemQty * catQtyMultiplier;

                if (!itemAggregation[key]) {
                  itemAggregation[key] = {
                    categoryName: catName,
                    totalQuantity: 0,
                    totalAmount: 0
                  };
                }
                itemAggregation[key].totalQuantity += resolvedQty;
                itemAggregation[key].totalAmount += itemAmountWithGst;
              } else {
                // Specific category selected: group and aggregate by item name + category
                if (catName.toLowerCase().includes(category.toLowerCase())) {
                  const key = `${item.item_name || item.name}::${catName}`;
                  const resolvedQty = itemQty * catQtyMultiplier;

                  if (!itemAggregation[key]) {
                    itemAggregation[key] = {
                      itemName: item.item_name || item.name,
                      categoryName: catName,
                      totalQuantity: 0,
                      totalAmount: 0
                    };
                  }
                  itemAggregation[key].totalQuantity += resolvedQty;
                  itemAggregation[key].totalAmount += itemAmountWithGst;
                }
              }
            }
          });
        });
      }
    });

    const reportData = Object.values(itemAggregation).map(item => ({
      ...item,
      totalQuantity: Math.ceil(item.totalQuantity),
      totalAmount: Math.ceil(item.totalAmount)
    })).sort((a, b) => b.totalQuantity - a.totalQuantity);

    res.json(reportData);
  } catch (error) {
    console.error("Category report error:", error);
    res.status(500).json({ detail: "Failed to generate category report" });
  }
};
