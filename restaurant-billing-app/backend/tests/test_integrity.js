const { roundMoney, verifyBillIntegrity } = require("../src/utils/billingIntegrity");
const SettingsModel = require("../src/models/settingsModel");

// mock settings model
SettingsModel.getSettings = async () => ({
  sgst_percentage: 2.5,
  cgst_percentage: 2.5
});

async function run() {
  const check = await verifyBillIntegrity({
    orders: [
      { line_total: 100.0 }
    ],
    clerkInitials: 'CLK',
    submittedTotals: {
      subtotal: 95,
      sgst: 2.5,
      cgst: 2.5,
      tax_amount: 5,
      grand_total: 100
    }
  });
  console.log(check);
}

run();
