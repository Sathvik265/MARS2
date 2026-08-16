const cron = require('node-cron');
const pool = require('../db');
const ShiftModel = require('../models/shiftModel'); // Import ShiftModel

// Schedule a job to run at 12:00 AM every day to open shifts.
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily shift opening job...');
  try {
    await ShiftModel.ensureAllShiftSessionsExist(); // Ensure all shifts have an entry
    const shiftsToOpen = ["`", "``", "RBS1", "RBS2"];
    for (const shiftName of shiftsToOpen) {
      const session = await ShiftModel.createSession({ // Use createSession to open/update
        shift_name: shiftName,
        clerk_initials: "SYS_AUTO",
        status: "OPEN",
      });
      console.log(`Shift ${shiftName} set to OPEN. Session ID: ${session.session_id}`);
    }
    console.log('All shifts set to OPEN.');
  } catch (error) {
    console.error('Error opening shifts:', error);
  }
});

// Schedule a job to run at 11:59 PM every day to close open shifts.
cron.schedule('59 23 * * *', async () => {
  console.log('Running daily shift closing job...');
  try {
    const shiftsToClose = ["`", "``", "RBS1", "RBS2"];
    for (const shiftName of shiftsToClose) {
      // Find the current open session for this shift
      const currentSession = await ShiftModel.getCurrentOpenSession(shiftName);
      if (currentSession) {
        await ShiftModel.closeSession(currentSession.session_id, "SYS_AUTO");
        console.log(`Shift ${shiftName} set to CLOSED. Session ID: ${currentSession.session_id}`);
      }
    }
    console.log('All shifts set to CLOSED.');
  } catch (error) {
    console.error('Error closing shifts:', error);
  }
});

console.log('Shift scheduler initialized.');
