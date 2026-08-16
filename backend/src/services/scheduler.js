const cron = require('node-cron');
const ShiftModel = require('../models/shiftModel');

// ── Daily 12:00 AM (Midnight) Auto Shift Reopen Job ──────────────────────────
// Runs every day at 12:00 AM (00:00) to ensure all 4 shift tracks (`, ``, RBS, RBS1)
// are automatically OPEN, UNLOCKED, and ready for the new day's billing.
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ [Scheduler 12:00 AM] Auto re-opening all shift sessions for the new day...');
  try {
    await ShiftModel.ensureAllShiftSessionsExist();
    const reopened = await ShiftModel.autoReopenAllShifts();
    console.log(`✅ [Scheduler 12:00 AM] All ${reopened.length} shifts set to OPEN & UNLOCKED.`);
  } catch (error) {
    console.error('❌ [Scheduler 12:00 AM] Error auto-reopening shifts:', error);
  }
});

// Run initial check on server startup
(async () => {
  try {
    await ShiftModel.ensureAllShiftSessionsExist();
    console.log('Shift scheduler initialized (12:00 AM midnight auto re-open active).');
  } catch (err) {
    console.error('Shift scheduler startup check error:', err);
  }
})();

