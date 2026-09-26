const { executePrintJob, resolvePrinter } = require("../src/routes/printerRoutes");
const { randomUUID } = require("crypto");

async function runTest() {
  console.log("=================================================");
  console.log("   MANUAL TEST: Windows RAW Printer Spooler    ");
  console.log("=================================================");

  try {
    console.log("Resolving target printer...");
    const printerInfo = await resolvePrinter();
    console.log("Resolved Printer Info:");
    console.log(`  - Name:       ${printerInfo.name}`);
    console.log(`  - ShareName:  ${printerInfo.shareName || "(None)"}`);
    console.log(`  - DriverName: ${printerInfo.driverName || "(Unknown)"}`);
    console.log(`  - Shared:     ${printerInfo.shared}`);
    console.log(`  - Online:     ${printerInfo.online}`);

    const ESC = 0x1B;
    const escPrefix = Buffer.from([
      0x0D,                     // CR
      ESC, 0x78, 0x00,          // ESC x 0 — Draft quality
      ESC, 0x4D,                // ESC M   — 12 CPI
      ESC, 0x32,                // ESC 2   — 1/6-inch line spacing
      ESC, 0x6C, 0x00,          // ESC l 0 — Left margin = 0
    ]);

    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const textBuf = Buffer.from(
      "----------------------------------------\r\n" +
      "       RBS RAW PRINT TEST RECEIPT       \r\n" +
      "----------------------------------------\r\n" +
      `Date/Time:  ${timestamp}\r\n` +
      `Printer:    ${printerInfo.name}\r\n` +
      `Driver:     ${printerInfo.driverName}\r\n` +
      "----------------------------------------\r\n" +
      "Status: RAW byte transfer via winspool\r\n" +
      "Result: Print spooler job submitted OK\r\n" +
      "----------------------------------------\r\n",
      "utf8"
    );

    const feedLines = 4;
    const feedBuf = Buffer.from("\r\n".repeat(feedLines), "utf8");
    const escCleanup = Buffer.from([ESC, 0x40]);

    const printBuf = Buffer.concat([escPrefix, textBuf, feedBuf, escCleanup]);
    const jobId = randomUUID();

    console.log(`\nExecuting print job ${jobId} (${printBuf.length} bytes)...`);
    const result = await executePrintJob(printBuf, jobId);

    console.log("\n=================================================");
    console.log("SUCCESS: Print job spooled successfully!");
    console.log(`  - Target Printer: ${result.printer}`);
    console.log(`  - Spooler Job ID: ${result.spoolerJobId !== null ? result.spoolerJobId : "(N/A)"}`);
    console.log("=================================================");
  } catch (err) {
    console.error("\n=================================================");
    console.error("FAILURE: Print job failed!");
    console.error(`  - Error:  ${err.message}`);
    if (err.stdout) console.error(`  - Stdout: ${err.stdout}`);
    if (err.stderr) console.error(`  - Stderr: ${err.stderr}`);
    console.error("=================================================");
    process.exit(1);
  }
}

runTest();
