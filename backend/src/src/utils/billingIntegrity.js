const ItemModel = require("../models/itemModel");
const SettingsModel = require("../models/settingsModel");

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getSectionForTable(tableNo) {
  const table = parseInt(tableNo, 10);

  if (Number.isNaN(table)) {
    return "G";
  }

  if (table === 1) {
    return "P";
  }

  if (table >= 15 && table <= 30) {
    return "AC";
  }

  return "G";
}

function getExpectedPriceForSection(item, section) {
  switch (section) {
    case "P":
      return roundMoney(item.price_general);
    case "AC":
      return roundMoney(item.price_ac);
    default:
      return roundMoney(item.price_general);
  }
}

function isCustomPriceAllowed(item, itemName, expectedUnitPrice) {
  if (expectedUnitPrice === 0) {
    return true;
  }

  if (
    String(item?.numeric_code || "").trim() === "189" ||
    String(item?.alpha_code || "").trim().toLowerCase() === "189"
  ) {
    return true;
  }

  return String(itemName || item?.name || "")
    .toUpperCase()
    .includes("MISC");
}

async function verifyOrderIntegrity(orderData) {
  const quantity = Number(orderData.quantity);
  const providedUnitPrice = roundMoney(orderData.unit_price);
  const providedLineTotal = roundMoney(orderData.line_total);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, detail: "Invalid quantity" };
  }

  if (!Number.isFinite(providedUnitPrice) || providedUnitPrice < 0) {
    return { ok: false, detail: "Invalid unit price" };
  }

  if (!Number.isFinite(providedLineTotal) || providedLineTotal < 0) {
    return { ok: false, detail: "Invalid line total" };
  }

  const lookupCode = orderData.item_code || orderData.numeric_item_code;
  const item = lookupCode ? await ItemModel.getItemByCode(String(lookupCode)) : null;

  if (!item) {
    return { ok: false, detail: "Unable to verify menu item" };
  }

  const section = orderData.section || getSectionForTable(orderData.table_no);
  const expectedUnitPrice = getExpectedPriceForSection(item, section);
  const customPriceAllowed = isCustomPriceAllowed(
    item,
    orderData.item_name,
    expectedUnitPrice,
  );

  if (!customPriceAllowed && expectedUnitPrice !== providedUnitPrice) {
    return {
      ok: false,
      detail: "Unit price does not match the configured menu price",
    };
  }

  const expectedLineTotal = roundMoney(providedUnitPrice * quantity);

  if (expectedLineTotal !== providedLineTotal) {
    return {
      ok: false,
      detail: "Line total does not match quantity x unit price",
    };
  }

  return {
    ok: true,
    normalized: {
      quantity,
      unit_price: providedUnitPrice,
      line_total: expectedLineTotal,
      section,
    },
  };
}

async function verifyBillIntegrity({ orders, clerkInitials, submittedTotals }) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { ok: false, detail: "No pending orders found to finalize" };
  }

  const settings = await SettingsModel.getSettings(clerkInitials || "CLK");
  const sgstRate = Number(settings?.sgst_percentage || 0);
  const cgstRate = Number(settings?.cgst_percentage || 0);
  const taxRateSum = sgstRate + cgstRate;
  const scalingFactor = 1 / (1 + taxRateSum / 100);

  const subtotal = roundMoney(
    orders.reduce((sum, order) => {
      const p = Number(order.unit_price || order.actual_price || order.fixed_price || order.line_total || 0);
      const q = Number(order.quantity || 1);
      const unitPriceScaled = roundMoney(p * scalingFactor);
      const lineTotalScaled = roundMoney(unitPriceScaled * q);
      return sum + lineTotalScaled;
    }, 0),
  );

  const menuTotal = roundMoney(
    orders.reduce((sum, order) => {
      const p = Number(order.unit_price || order.actual_price || order.fixed_price || order.line_total || 0);
      const q = Number(order.quantity || 1);
      return sum + roundMoney(p * q);
    }, 0),
  );

  const totalTax = taxRateSum > 0 ? roundMoney(Math.max(0, menuTotal - subtotal)) : 0;

  const sgst = roundMoney(totalTax / 2);
  const cgst = roundMoney(totalTax - sgst);
  const tax_amount = roundMoney(sgst + cgst);
  const grand_total = taxRateSum > 0 ? menuTotal : subtotal;

  const submitted = {
    subtotal: roundMoney(submittedTotals.subtotal),
    sgst: roundMoney(submittedTotals.sgst),
    cgst: roundMoney(submittedTotals.cgst),
    tax_amount: roundMoney(submittedTotals.tax_amount),
    grand_total: roundMoney(submittedTotals.grand_total),
  };

  const computed = {
    subtotal,
    sgst,
    cgst,
    tax_amount,
    grand_total,
  };

  const TOLERANCE = 0.02; // Allow up to 2 cents rounding drift between frontend & backend

  const matches =
    roundMoney(Math.abs(submitted.subtotal - computed.subtotal)) <= TOLERANCE &&
    roundMoney(Math.abs(submitted.sgst     - computed.sgst))     <= TOLERANCE &&
    roundMoney(Math.abs(submitted.cgst     - computed.cgst))     <= TOLERANCE &&
    roundMoney(Math.abs(submitted.tax_amount - computed.tax_amount)) <= TOLERANCE &&
    roundMoney(Math.abs(submitted.grand_total - computed.grand_total)) <= TOLERANCE;

  if (!matches) {
    return {
      ok: false,
      detail: "Submitted bill totals failed backend verification",
      computed,
      submitted,
    };
  }

  return {
    ok: true,
    computed,
  };
}

module.exports = {
  getSectionForTable,
  verifyOrderIntegrity,
  verifyBillIntegrity,
  roundMoney,
};
