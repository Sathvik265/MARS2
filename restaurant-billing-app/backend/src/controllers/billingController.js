const BillingModel = require("../models/billingModel");
const OrderModel = require("../models/orderModel");
const pool = require("../db");
const { ADMIN_FULL_PASSWORD } = require("../auth/config");
const {
  verifyOrderIntegrity,
  verifyBillIntegrity,
  roundMoney,
  getSectionForTable,
} = require("../utils/billingIntegrity");

const billingController = {
  // Get all bills
  async getAllBills(req, res) {
    try {
      const bills = await BillingModel.getAllBills();
      res.json(bills);
    } catch (error) {
      console.error("Error fetching bills:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch bills", details: error.message });
    }
  },

  // Get bill by ID
  async getBillById(req, res) {
    try {
      const { billId } = req.params;
      const bill = await BillingModel.getBillById(billId);
      if (bill) {
        res.json(bill);
      } else {
        res.status(404).json({ error: "Bill not found" });
      }
    } catch (error) {
      console.error("Error fetching bill:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch bill", details: error.message });
    }
  },

  // Get bill by number and date
  async getBillByNumber(req, res) {
    try {
      const { billNumber, billDate } = req.params;
      const bill = await BillingModel.getBillByNumber(billNumber, billDate);
      if (bill) {
        res.json(bill);
      } else {
        res.status(404).json({ error: "Bill not found" });
      }
    } catch (error) {
      console.error("Error fetching bill:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch bill", details: error.message });
    }
  },

  // Get bill items from JSON
  async getBillItems(req, res) {
    try {
      const { billId } = req.params;
      const items = await BillingModel.getBillItems(billId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching bill items:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch bill items", details: error.message });
    }
  },

  // Finalize a bill (formerly createBill)
  async createBill(req, res) {
    try {
      const billData = req.body;

      // Validate required fields
      if (!billData.table_no || !billData.party_no) {
        return res
          .status(400)
          .json({ error: "table_no and party_no are required" });
      }

      // We need to know which bill to finalize.
      // The frontend might not send created_at, so we rely on finding the ACTIVE provisional bill.

      let { table_no, party_no, track, clerk_initials, items } = billData;

      // 1. Find or Create Provisional Bill first
      const provisionalRes = await pool.query(
        `SELECT * FROM bills WHERE table_no = $1 AND party_no = $2 AND bill_number = 0 ORDER BY created_at DESC LIMIT 1`,
        [parseInt(table_no), party_no],
      );
      let provisionalBill = provisionalRes.rows[0];

      if (provisionalBill) {
        const targetTrack = track || provisionalBill.track;
        const targetClerk = clerk_initials || provisionalBill.clerk_initials;
        if (provisionalBill.track !== targetTrack || provisionalBill.clerk_initials !== targetClerk) {
          const updateRes = await pool.query(
            `UPDATE bills SET track = $1, clerk_initials = $2 WHERE id = $3 RETURNING *`,
            [targetTrack, targetClerk, provisionalBill.id]
          );
          provisionalBill = updateRes.rows[0];
        }
      }

      if (!provisionalBill) {
        const now = new Date();
        const provisionalBillData = {
          bill_date:
            billData.bill_date || new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Kolkata',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).format(new Date()),
          table_no: parseInt(table_no),
          party_no: party_no,
          section: billData.section || "G",
          track: track || "`",
          clerk_initials: clerk_initials || "CLK",
          created_at: now,
        };

        provisionalBill =
          await BillingModel.createProvisionalBill(provisionalBillData);
      }

      // 2. Sync database orders with the items sent from the frontend if provided
      if (Array.isArray(items) && items.length > 0) {
        await OrderModel.clearOrders(table_no, party_no);
        const ordersToCreate = items.map(item => ({
          track: track || provisionalBill.track,
          clerk_initials: clerk_initials || provisionalBill.clerk_initials,
          table_no: parseInt(table_no),
          party_no: party_no,
          bill_number: 0,
          bill_date: provisionalBill.bill_date,
          item_code: item.item_code,
          numeric_item_code: item.numeric_item_code,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          created_at: provisionalBill.created_at,
          is_separate: item.is_separate,
        }));
        await OrderModel.bulkCreateOrders(ordersToCreate);
      }

      // 3. Fetch all orders (now guaranteed to match the frontend state)
      const allOrders = await OrderModel.getPendingOrdersByTableAndParty(
        table_no,
        party_no,
      );

      // Filter out stale orders that belong to previous days.
      let existingOrders = allOrders;
      if (provisionalBill.bill_date) {
        const getFormattedDateStr = (dateInput) => {
          if (!dateInput) return "";
          const d = new Date(dateInput);
          try {
            return new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Kolkata',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).format(d);
          } catch (e) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
          }
        };

        const provisionalBillDateStr = getFormattedDateStr(provisionalBill.bill_date);

        existingOrders = allOrders.filter(o => {
          return getFormattedDateStr(o.bill_date) === provisionalBillDateStr;
        });
      }

      if (existingOrders && existingOrders.length > 0) {
        track = existingOrders[0].track;
        clerk_initials = existingOrders[0].clerk_initials;
      }

      const totalsCheck = await verifyBillIntegrity({
        orders: existingOrders,
        clerkInitials: clerk_initials,
        submittedTotals: billData,
      });

      if (!totalsCheck.ok) {
        console.error("DEBUG totalsCheck failed:", totalsCheck);
        return res.status(400).json({ error: totalsCheck.detail, computed: totalsCheck.computed });
      }

      const bill_date = billData.bill_date || new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      const finalizeData = {
        ...billData,
        table_no: parseInt(table_no),
        party_no,
        bill_date,
        subtotal: totalsCheck.computed.subtotal,
        sgst: totalsCheck.computed.sgst,
        cgst: totalsCheck.computed.cgst,
        tax_amount: totalsCheck.computed.tax_amount,
        grand_total: totalsCheck.computed.grand_total,
        track, // Use the corrected track value
        clerk_initials, // Use the corrected clerk_initials
        provisional_bill_id: provisionalBill.id, // Vital: Match exactly on ID
        order_id: `ORD-${table_no}-${party_no}-${Date.now()}`,
      };

      // Finalize bill
      const result = await BillingModel.finalizeBill(finalizeData);

      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating bill:", error);
      res
        .status(500)
        .json({ error: "Failed to create bill", details: error.message });
    }
  },

  async getLastBillNumber(req, res) {
    try {
      const { date } = req.params;
      const track = req.query.track || req.auth?.track;
      const result = await BillingModel.getLastBillNumber(date, track);
      res.json(result);
    } catch (error) {
      console.error("Error getting last bill number:", error);
      res.status(500).json({
        error: "Failed to get last bill number",
        details: error.message,
      });
    }
  },

  // Get bills by date range
  async getBillsByDateRange(req, res) {
    try {
      const { startDate, endDate } = req.params;
      const bills = await BillingModel.getBillsByDateRange(startDate, endDate);
      res.json(bills);
    } catch (error) {
      console.error("Error fetching bills:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch bills", details: error.message });
    }
  },

  // === ORDER OPERATIONS ===

  // Get all pending orders
  async getAllPendingOrders(req, res) {
    try {
      const orders = await OrderModel.getAllPendingOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch orders", details: error.message });
    }
  },

  // Get orders by table
  async getOrdersByTable(req, res) {
    try {
      const { tableNo } = req.params;
      const orders = await OrderModel.getPendingOrdersByTable(tableNo);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch orders", details: error.message });
    }
  },

  // Get orders by table and party
  async getOrdersByTableAndParty(req, res) {
    try {
      const { tableNo, partyNo } = req.params;
      const orders = await OrderModel.getPendingOrdersByTableAndParty(
        tableNo,
        partyNo,
      );
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch orders", details: error.message });
    }
  },

  // Create new order
  async createOrder(req, res) {
    try {
      const orderData = req.body;

      // Validate required fields
      if (!orderData.table_no || !orderData.item_name || !orderData.quantity) {
        return res.status(400).json({
          error: "table_no, item_name, and quantity are required",
        });
      }

      // Set defaults
      if (!orderData.party_no) orderData.party_no = "1";
      orderData.track = req.auth?.track || orderData.track || "TRACK1";
      orderData.clerk_initials =
        req.auth?.staff_code || orderData.clerk_initials || "SYS";
      if (!orderData.bill_number) orderData.bill_number = 0; // Always 0 for pending

      // Ensure bill_date is present, default to today if not
      if (!orderData.bill_date) {
        orderData.bill_date = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());
      }

      const orderCheck = await verifyOrderIntegrity(orderData);

      if (!orderCheck.ok) {
        return res.status(400).json({ error: orderCheck.detail });
      }

      orderData.quantity = orderCheck.normalized.quantity;
      orderData.unit_price = orderCheck.normalized.unit_price;
      orderData.line_total = orderCheck.normalized.line_total;

      // 1. Find or Create Provisional Bill
      let provisionalBill = await BillingModel.getProvisionalBill(
        orderData.table_no,
        orderData.party_no,
        orderData.track,
        orderData.clerk_initials,
        orderData.bill_date,
      );

      if (!provisionalBill) {
        const now = new Date();
        const provisionalBillData = {
          bill_date: orderData.bill_date,
          table_no: orderData.table_no,
          party_no: orderData.party_no,
          section: "G",
          track: orderData.track,
          clerk_initials: orderData.clerk_initials,
          created_at: now,
        };

        provisionalBill =
          await BillingModel.createProvisionalBill(provisionalBillData);
      }

      // 2. Attach the Bill's 'created_at' to the Order so FK mapping works
      orderData.created_at = provisionalBill.created_at;

      // 3. Create Order
      const order = await OrderModel.createOrder(orderData);
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res
        .status(500)
        .json({ error: "Failed to create order", details: error.message });
    }
  },

  // Update order
  async updateOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { quantity, is_separate } = req.body;

      const existingOrder = await OrderModel.getOrderById(orderId);

      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }

      let safeQuantity = Number(existingOrder.quantity);
      if (quantity !== undefined) {
        safeQuantity = Number(quantity);
        if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
          return res.status(400).json({ error: "Invalid quantity" });
        }
      }

      const finalIsSeparate = is_separate !== undefined ? is_separate : existingOrder.is_separate;

      const line_total = roundMoney(
        safeQuantity * Number(existingOrder.unit_price || 0),
      );
      
      const updatedOrder = await OrderModel.updateOrder(
        orderId,
        safeQuantity,
        line_total,
        finalIsSeparate
      );

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order:", error);
      res
        .status(500)
        .json({ error: "Failed to update order", details: error.message });
    }
  },

  // Delete order
  async deleteOrder(req, res) {
    try {
      const { orderId } = req.params;
      await OrderModel.deleteOrder(orderId);
      res.json({ message: "Order deleted successfully" });
    } catch (error) {
      console.error("Error deleting order:", error);
      res
        .status(500)
        .json({ error: "Failed to delete order", details: error.message });
    }
  },

  // Clear orders for table/party
  async clearOrders(req, res) {
    try {
      const { tableNo, partyNo } = req.params;
      await OrderModel.clearOrders(tableNo, partyNo);
      res.json({ message: "Orders cleared successfully" });
    } catch (error) {
      console.error("Error clearing orders:", error);
      res
        .status(500)
        .json({ error: "Failed to clear orders", details: error.message });
    }
  },

  // Get orders total
  async getOrdersTotal(req, res) {
    try {
      const { tableNo, partyNo } = req.params;
      const total = await OrderModel.getOrdersTotal(tableNo, partyNo);
      res.json(total);
    } catch (error) {
      console.error("Error getting orders total:", error);
      res
        .status(500)
        .json({ error: "Failed to get orders total", details: error.message });
    }
  },
  // Purge all bills for a date range
  async purgeBills(req, res) {
    try {
      const { startDate, endDate, confirmPassword } = req.body;

      if (confirmPassword !== ADMIN_FULL_PASSWORD) {
        return res.status(403).json({ error: "Invalid admin password" });
      }

      // Default to "today" if no date provided
      let start = startDate;
      let end = endDate;

      if (!start || !end) {
        // Adjust for timezone offset to get local YYYY-MM-DD
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const today = new Date(now.getTime() - offset)
          .toISOString()
          .split("T")[0];
        if (!start) start = today;
        if (!end) end = today;
      }

      const count = await BillingModel.deleteBillsByDateRange(start, end);

      res.status(200).json({
        message: `Purged ${count} bills from ${start} to ${end}`,
        count,
        range: { start, end },
      });
    } catch (error) {
      console.error("Purge error:", error);
      res
        .status(500)
        .json({ error: "Failed to purge bills", details: error.message });
    }
  },

  // Purge bills for a specific shift in a date range
  async purgeShiftBills(req, res) {
    try {
      const { startDate, endDate, shiftName, confirmPassword } = req.body;

      if (confirmPassword !== ADMIN_FULL_PASSWORD) {
        return res.status(403).json({ error: "Invalid admin password" });
      }

      if (!shiftName || !shiftName.trim()) {
        return res.status(400).json({ error: "shiftName is required" });
      }

      let start = startDate;
      let end = endDate;

      if (!start || !end) {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const today = new Date(now.getTime() - offset)
          .toISOString()
          .split("T")[0];
        if (!start) start = today;
        if (!end) end = today;
      }

      const count = await BillingModel.deleteBillsByDateRangeAndShift(start, end, shiftName.trim());

      res.status(200).json({
        message: `Purged ${count} bills for shift "${shiftName}" from ${start} to ${end}`,
        count,
        range: { start, end },
        shiftName: shiftName.trim(),
      });
    } catch (error) {
      console.error("Shift purge error:", error);
      res
        .status(500)
        .json({ error: "Failed to purge shift bills", details: error.message });
    }
  },

  // Move order to another table
  async moveOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { targetTableNo, targetPartyNo = "1" } = req.body;

      if (!targetTableNo) {
        return res.status(400).json({ error: "targetTableNo is required" });
      }

      // 1. Get the existing order to move
      const order = await OrderModel.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // If already at target table, do nothing
      if (parseInt(order.table_no, 10) === parseInt(targetTableNo, 10) && order.party_no === targetPartyNo) {
        return res.json(order);
      }

      // Determine default track and clerk credentials from user auth session (or fallback to original order track/clerk)
      let targetTrack = (req.auth && req.auth.track) ? req.auth.track : order.track;
      let targetClerk = (req.auth && req.auth.staff_code) ? req.auth.staff_code : order.clerk_initials;
      let targetCreatedAt;

      // 2. Check if the target table already has active pending orders
      const targetOrders = await OrderModel.getPendingOrdersByTableAndParty(targetTableNo, targetPartyNo);

      if (targetOrders && targetOrders.length > 0) {
        // Target table is already occupied; inherit its active credentials to merge properly under the same provisional bill
        targetTrack = targetOrders[0].track;
        targetClerk = targetOrders[0].clerk_initials;
        targetCreatedAt = targetOrders[0].created_at;
      } else {
        // Target table is empty; locate or create a new provisional bill
        let targetProvisionalBill = await BillingModel.getProvisionalBill(
          targetTableNo,
          targetPartyNo,
          targetTrack,
          targetClerk,
          order.bill_date
        );

        if (!targetProvisionalBill) {
          const now = new Date();
          const provisionalBillData = {
            bill_date: order.bill_date,
            table_no: targetTableNo,
            party_no: targetPartyNo,
            section: getSectionForTable(targetTableNo),
            track: targetTrack,
            clerk_initials: targetClerk,
            created_at: now,
          };

          targetProvisionalBill = await BillingModel.createProvisionalBill(provisionalBillData);
        }
        targetCreatedAt = targetProvisionalBill.created_at;
      }

      // 3. Move the order by updating all 5 composite foreign key columns: table_no, party_no, created_at, track, and clerk_initials
      const updatedOrder = await OrderModel.moveOrder(
        orderId,
        targetTableNo,
        targetPartyNo,
        targetCreatedAt,
        targetTrack,
        targetClerk
      );

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error moving order:", error);
      res.status(500).json({ error: "Failed to move order", details: error.message });
    }
  },
};

module.exports = billingController;
