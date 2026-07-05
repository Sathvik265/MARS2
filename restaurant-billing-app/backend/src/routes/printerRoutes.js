const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const fsSyncCheck = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { randomUUID } = require("crypto");
const os = require("os");

// Cache configuration at startup to avoid repeated lookups
const PRINTER_NAME = process.env.PRINTER_NAME || "Generic  Text Only";
const MAX_PRINT_SIZE = 10 * 1024 * 1024; // 10MB limit
const EXEC_TIMEOUT = 25000; // 25 second timeout
const TEMP_DIR = os.tmpdir();
const IS_WINDOWS = process.platform === "win32";

// Set DISABLE_PRINTER_CHECK=true in .env to bypass printer detection during testing
const DISABLE_PRINTER_CHECK = process.env.DISABLE_PRINTER_CHECK === "true";

// GET /printer/status — checks if the printer is connected and available
router.get("/status", async (req, res) => {
  // Allow bypassing printer detection for testing
  if (DISABLE_PRINTER_CHECK) {
    return res.json({ connected: true, bypassed: true, message: "Printer check disabled (DISABLE_PRINTER_CHECK=true)" });
  }

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Printer status check timed out"));
      }, 5000);

      if (IS_WINDOWS) {
        // Query the printer using PowerShell to check if it exists and is not offline
        const psCommand = `$p = Get-Printer -Name '${PRINTER_NAME}' -ErrorAction Stop; if ($p.WorkOffline) { exit 1 } else { exit 0 }`;
        execFile(
          "powershell.exe",
          ["-Command", psCommand],
          { timeout: 5000 },
          (error) => {
            clearTimeout(timeout);
            if (error) reject(new Error("Printer is offline or not found"));
            else resolve();
          }
        );
      } else {
        // macOS: Use system_profiler to check real hardware status (including Offline status)
        execFile("system_profiler", ["SPPrintersDataType"], { timeout: 5000 }, (error, stdout) => {
          clearTimeout(timeout);
          if (error || !stdout) {
            reject(new Error("Unable to check printer status"));
            return;
          }

          const lines = stdout.split("\n");
          let currentPrinter = null;
          let isOffline = false;
          let printerFound = false;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.endsWith(":")) {
              currentPrinter = line.slice(0, -1).trim();
            }

            if (currentPrinter) {
              const matchesTarget = PRINTER_NAME === "Generic  Text Only"
                ? true
                : currentPrinter.toLowerCase().replace(/[-_]/g, " ").includes(PRINTER_NAME.toLowerCase().replace(/[-_]/g, " "));

              if (matchesTarget) {
                printerFound = true;
                if (line.startsWith("Status:")) {
                  const statusVal = line.replace("Status:", "").trim().toLowerCase();
                  if (statusVal.includes("offline")) {
                    isOffline = true;
                  }
                }
              }
            }
          }

          if (isOffline) {
            reject(new Error("Printer is offline"));
          } else if (!printerFound && PRINTER_NAME !== "Generic  Text Only") {
            reject(new Error(`Printer '${PRINTER_NAME}' not found`));
          } else {
            resolve();
          }
        });
      }
    });

    return res.json({ connected: true, printer: PRINTER_NAME });
  } catch (err) {
    return res.json({ connected: false, reason: err.message, printer: PRINTER_NAME });
  }
});



router.post("/print", async (req, res) => {
  const { text } = req.body;

  // Input validation
  if (!text) {
    return res.status(400).json({ error: "No print text provided" });
  }

  if (typeof text !== "string" || text.length > MAX_PRINT_SIZE) {
    return res.status(413).json({ error: "Print content exceeds maximum size limit" });
  }

  // Use unique temp file per request to prevent race conditions
  const tempFilePath = path.join(TEMP_DIR, `receipt_${randomUUID()}.txt`);

  try {
    // Handle macOS/Linux printing
    if (!IS_WINDOWS) {
      await fs.writeFile(tempFilePath, text, "utf8");

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Print job execution timeout"));
        }, 30000);

        // If PRINTER_NAME is Generic Text Only, use the default macOS printer
        const PRINTER_MEDIA_SIZE = process.env.PRINTER_MEDIA_SIZE || "Custom.8.5x4in";
        const args = PRINTER_NAME === "Generic  Text Only"
          ? ["-o", `media=${PRINTER_MEDIA_SIZE}`, tempFilePath]
          : ["-d", PRINTER_NAME, "-o", `media=${PRINTER_MEDIA_SIZE}`, tempFilePath];

        execFile(
          "lp",
          args,
          { timeout: EXEC_TIMEOUT },
          (error) => {
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve();
          }
        );
      });

      return res.json({ message: "Print job sent successfully on macOS" });
    }

    // Write the receipt asynchronously (non-blocking)
    await fs.writeFile(tempFilePath, text, "utf8");

    // Execute the raw copy with timeout protection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Print job execution timeout"));
      }, 30000);

      // Use execFile (more secure and performant than exec)
      execFile(
        "cmd.exe",
        ["/c", `copy /b "${tempFilePath}" "\\\\localhost\\${PRINTER_NAME}"`],
        { timeout: EXEC_TIMEOUT },
        (error) => {
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        }
      );
    });

    res.json({ message: "Print job sent successfully" });
  } catch (err) {
    console.warn("Print operation failed:", err.message);
    // Soft fallback: return 200 with warning so frontend flow does not halt
    res.json({ 
      message: "Processed bill, but printer connection failed.", 
      warning: "Printer not found. Is it turned on and shared on network?" 
    });
  } finally {
    // Guarantee cleanup in all scenarios
    try {
      if (fsSyncCheck.existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath);
      }
    } catch (cleanupErr) {
      console.error("Failed to cleanup temp file:", cleanupErr);
    }
  }
});

module.exports = router;
