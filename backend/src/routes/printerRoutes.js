const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const fsSyncCheck = require("fs");
const path = require("path");
const { execFile, exec } = require("child_process");
const { randomUUID } = require("crypto");
const os = require("os");

// PRINTER_NAME       — the display name of the printer (for detection/status check)
// PRINTER_SHARE_NAME — the Windows share name used in copy /b (for printing on Windows)
//                      If not set, falls back to PRINTER_NAME.
// PRINTER_FEED_LINES — number of blank lines appended after the receipt for easy tear-off
//                      Default: 4. Increase for more feed, decrease to reduce paper waste.
const PRINTER_NAME = process.env.PRINTER_NAME || "Generic  Text Only";
const PRINTER_SHARE_NAME = process.env.PRINTER_SHARE_NAME || PRINTER_NAME;
const PRINTER_FEED_LINES = Math.max(0, parseInt(process.env.PRINTER_FEED_LINES || "0", 10));

const MAX_PRINT_SIZE = 10 * 1024 * 1024; // 10MB limit
const EXEC_TIMEOUT = 25000; // 25 second timeout
const TEMP_DIR = os.tmpdir();
const IS_WINDOWS = process.platform === "win32";

// Set DISABLE_PRINTER_CHECK=true in .env to bypass printer detection during testing
const DISABLE_PRINTER_CHECK = process.env.DISABLE_PRINTER_CHECK === "true";

// ---------------------------------------------------------------------------
// Helper: resolve printer status on Windows using Get-Printer → CIM → WMI
// ---------------------------------------------------------------------------
let printerStatusCache = null;
let printerStatusCacheTime = 0;
const STATUS_CACHE_MS = 10000; // Cache status for 10s to eliminate spooler lock contention

async function resolvePrinter(forceRefresh = false) {
  if (DISABLE_PRINTER_CHECK) {
    return { name: PRINTER_NAME, online: true };
  }

  if (!forceRefresh && printerStatusCache && (Date.now() - printerStatusCacheTime < STATUS_CACHE_MS)) {
    return printerStatusCache;
  }

  return new Promise((resolve, reject) => {
    if (IS_WINDOWS) {
      const psCommand = `
        $target = '${PRINTER_NAME}';
        $cleanTarget = ($target -replace '(?i)\\b(ESC|POS|ESC\\/P)\\b', '').Trim()
        $printers = Get-Printer -ErrorAction SilentlyContinue
        if (-not $printers) {
            $printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, @{Name="WorkOffline"; Expression={$_.PrinterStatus -eq 7 -or $_.WorkOffline}}
        }
        if (-not $printers) {
            $printers = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, @{Name="WorkOffline"; Expression={$_.PrinterStatus -eq 7 -or $_.WorkOffline}}
        }
        if (-not $printers) {
            Write-Output "NO_PRINTERS_FOUND";
            exit 1;
        }

        # 1. Direct or clean name match ignoring Error status printers
        $p = $printers | Where-Object { $_.Name -like "*$target*" -or $_.Name -like "*$cleanTarget*" -or ($cleanTarget -and $cleanTarget.Contains($_.Name)) } | Where-Object { $_.PrinterStatus -ne 'Error' -and $_.PrinterStatus -ne 7 } | Select-Object -First 1

        # 2. Token match (e.g. EPSON and LQ-310)
        if (-not $p -and $cleanTarget) {
            $p = $printers | Where-Object {
                $pName = $_.Name.ToLower()
                $tokens = $cleanTarget.ToLower().Split(' ')
                $m = $true
                foreach ($t in $tokens) {
                    if ($t.Length -gt 1 -and -not $pName.Contains($t)) { $m = $false }
                }
                $m
            } | Where-Object { $_.PrinterStatus -ne 'Error' -and $_.PrinterStatus -ne 7 } | Select-Object -First 1
        }

        # 3. Fallback to any online printer matching EPSON, LQ-310, or Generic
        if (-not $p) {
            $p = $printers | Where-Object { $_.Name -like "*EPSON*" -or $_.Name -like "*LQ-310*" -or $_.Name -like "*Generic*" } | Where-Object { $_.PrinterStatus -ne 'Error' -and $_.PrinterStatus -ne 7 } | Select-Object -First 1
        }

        if (-not $p) {
            $names = ($printers | Select-Object -ExpandProperty Name) -join ", "
            Write-Output "NOT_FOUND:Installed printers: [$names]";
            exit 1;
        }

        $name = $p.Name;
        $offline = $p.WorkOffline;
        if ($offline -eq $true -or $offline -eq 1 -or $offline -eq "True") {
           Write-Output "OFFLINE:$name";
           exit 2;
        } else {
           Write-Output "ONLINE:$name";
           exit 0;
        }
      `;
      execFile("powershell.exe", ["-Command", psCommand], { timeout: 5000 }, (error, stdout) => {
        if (error) {
          printerStatusCache = null;
          if (error.code === 2 || (stdout && stdout.startsWith("OFFLINE:"))) {
            const name = stdout ? stdout.replace("OFFLINE:", "").trim() : PRINTER_NAME;
            reject(new Error(`Printer '${name}' is offline`));
          } else {
            reject(new Error(`Printer '${PRINTER_NAME}' not found and no default printer configured`));
          }
        } else if (stdout && stdout.startsWith("ONLINE:")) {
          const name = stdout.replace("ONLINE:", "").trim();
          const result = { name, online: true };
          printerStatusCache = result;
          printerStatusCacheTime = Date.now();
          resolve(result);
        } else {
          printerStatusCache = null;
          reject(new Error("Unable to check printer status"));
        }
      });
    } else {
      // macOS: Use system_profiler to check real hardware status
      execFile("system_profiler", ["SPPrintersDataType"], { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout) {
          reject(new Error("Unable to check printer status"));
          return;
        }

        const lines = stdout.split("\n");
        let currentPrinter = null;
        let isOffline = false;
        let printerFound = false;
        let matchedName = PRINTER_NAME;

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
              matchedName = currentPrinter;
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
          reject(new Error(`Printer '${matchedName}' is offline`));
        } else if (!printerFound && PRINTER_NAME !== "Generic  Text Only") {
          reject(new Error(`Printer '${PRINTER_NAME}' not found`));
        } else {
          const result = { name: matchedName, online: true };
          printerStatusCache = result;
          printerStatusCacheTime = Date.now();
          resolve(result);
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// GET /printer/status
// ---------------------------------------------------------------------------
router.get("/status", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  if (DISABLE_PRINTER_CHECK) {
    return res.json({ connected: true, bypassed: true, message: "Printer check disabled (DISABLE_PRINTER_CHECK=true)" });
  }

  try {
    const printerInfo = await resolvePrinter();
    return res.json({ connected: true, printer: printerInfo.name });
  } catch (err) {
    return res.json({ connected: false, reason: err.message, printer: PRINTER_NAME });
  }
});

// ---------------------------------------------------------------------------
// Serial Print Queue — prevents buffer corruption from overlapping print jobs
// and allows instant API response (fire-and-forget)
// ---------------------------------------------------------------------------
const printQueue = [];
let printQueueRunning = false;

async function processPrintQueue() {
  if (printQueueRunning) return;
  printQueueRunning = true;

  while (printQueue.length > 0) {
    const job = printQueue.shift();
    try {
      await executePrintJob(job.printBuf, job.jobId);
    } catch (err) {
      console.error(`[PrintQueue] Job ${job.jobId} failed:`, err.message);
      // Retry once on transient failure
      try {
        console.log(`[PrintQueue] Retrying job ${job.jobId}...`);
        await new Promise(r => setTimeout(r, 100));
        await executePrintJob(job.printBuf, job.jobId);
        console.log(`[PrintQueue] Retry succeeded for job ${job.jobId}`);
      } catch (retryErr) {
        console.error(`[PrintQueue] Retry also failed for job ${job.jobId}:`, retryErr.message);
      }
    }
    // Minimal inter-job delay to let printer buffer flush fast
    if (printQueue.length > 0) {
      await new Promise(r => setTimeout(r, 10));
    }
  }

  printQueueRunning = false;
}

async function executePrintJob(printBuf, jobId) {
  const tempFilePath = path.join(TEMP_DIR, `receipt_${jobId}.txt`);

  const cleanup = async () => {
    try {
      if (fsSyncCheck.existsSync(tempFilePath)) await fs.unlink(tempFilePath);
    } catch (_) { /* ignore */ }
  };

  try {
    await fs.writeFile(tempFilePath, printBuf);

    const shareName = PRINTER_SHARE_NAME;
    // Use 127.0.0.1 direct loopback IP for fast Windows share copy without NetBIOS delays
    const cmdCommand = `copy /b "${tempFilePath}" "\\\\127.0.0.1\\${shareName}"`;

    await new Promise((resolve, reject) => {
      exec(cmdCommand, { timeout: EXEC_TIMEOUT }, (error, stdout, stderr) => {
        if (error) {
          // Fallback to localhost if 127.0.0.1 share resolution fails
          const fbCmd = `copy /b "${tempFilePath}" "\\\\localhost\\${shareName}"`;
          exec(fbCmd, { timeout: EXEC_TIMEOUT }, (fbErr, fbStdout, fbStderr) => {
            if (fbErr) {
              console.error(`[PrintQueue] Windows copy /b failed for job ${jobId}:`, fbErr.message, fbStderr);
              reject(fbErr);
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });

    // Refresh cache on successful print
    printerStatusCache = { name: PRINTER_SHARE_NAME, online: true };
    printerStatusCacheTime = Date.now();

    await cleanup();
  } catch (err) {
    await cleanup();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /printer/print
// ---------------------------------------------------------------------------
router.post("/print", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "No print text provided" });
  }
  if (typeof text !== "string" || text.length > MAX_PRINT_SIZE) {
    return res.status(413).json({ error: "Print content exceeds maximum size limit" });
  }

  if (DISABLE_PRINTER_CHECK) {
    console.log("[Printer] Bypass physical printing (DISABLE_PRINTER_CHECK=true)");
    return res.json({ message: "Print job bypassed successfully (DISABLE_PRINTER_CHECK=true)" });
  }

  try {
    // ── macOS / Linux ───────────────────────────────────────────────────────
    if (!IS_WINDOWS) {
      const tempFilePath = path.join(TEMP_DIR, `receipt_${randomUUID()}.txt`);
      const cleanup = async () => {
        try {
          if (fsSyncCheck.existsSync(tempFilePath)) await fs.unlink(tempFilePath);
        } catch (_) { /* ignore */ }
      };

      await fs.writeFile(tempFilePath, text, "utf8");
      const PRINTER_MEDIA_SIZE = process.env.PRINTER_MEDIA_SIZE || "Custom.8.5x4in";
      const args = PRINTER_NAME === "Generic  Text Only"
        ? ["-o", `media=${PRINTER_MEDIA_SIZE}`, tempFilePath]
        : ["-d", PRINTER_NAME, "-o", `media=${PRINTER_MEDIA_SIZE}`, tempFilePath];

      await new Promise((resolve, reject) => {
        execFile("lp", args, { timeout: EXEC_TIMEOUT }, (error) => {
          if (error) reject(error); else resolve();
        });
      });
      await cleanup();
      return res.json({ message: "Print job sent successfully on macOS" });
    }

    // ── Windows ─────────────────────────────────────────────────────────────
    //
    // ESC/P High Speed Draft Initialization:
    //
    //   CR         (0D)         — Flush any partial line
    //   ESC x 0    (1B 78 00)   — Draft quality (maximum speed ~300+ CPS)
    //   ESC s 1    (1B 73 01)   — High-Speed Draft mode (Super draft)
    //   ESC U 0    (1B 55 00)   — Bidirectional printing (print on both passes)
    //   ESC F      (1B 46)      — Cancel double-strike (single pass high speed)
    //   ESC H      (1B 48)      — Cancel double-pass emphasized mode
    //   ESC M      (1B 4D)      — 12 CPI (Elite pitch)
    //   ESC 2      (1B 32)      — 1/6-inch line spacing (fast line feed)
    //   ESC l 0    (1B 6C 00)   — Left margin = 0 columns
    //
    const ESC = 0x1B;
    const escPrefix = Buffer.from([
      0x0D,                     // CR      — Flush any partial line
      ESC, 0x78, 0x00,          // ESC x 0 — Draft quality mode
      ESC, 0x73, 0x01,          // ESC s 1 — High-Speed Draft mode (300-347 CPS)
      ESC, 0x55, 0x00,          // ESC U 0 — Bidirectional printing
      ESC, 0x46,                // ESC F   — Cancel double-strike
      ESC, 0x48,                // ESC H   — Cancel emphasized / double-pass
      ESC, 0x4D,                // ESC M   — 12 CPI (Elite pitch)
      ESC, 0x32,                // ESC 2   — 1/6-inch line spacing
      ESC, 0x6C, 0x00,          // ESC l 0 — Left margin = 0
    ]);

    const textBuf = Buffer.from(text, "utf8");

    const feedBuf = Buffer.from("\r\n".repeat(PRINTER_FEED_LINES), "utf8");
    const printBuf = Buffer.concat([escPrefix, textBuf, feedBuf]);

    // Queue the job and return immediately (fire-and-forget)
    const jobId = randomUUID();
    printQueue.push({ printBuf, jobId });
    console.log(`[PrintQueue] Job ${jobId} queued (queue depth: ${printQueue.length})`);

    // Kick off queue processing (non-blocking)
    processPrintQueue().catch(err => {
      console.error("[PrintQueue] Queue processing error:", err.message);
    });

    return res.json({ message: "Print job queued successfully", jobId });

  } catch (err) {
    console.error("Print operation failed:", err.message);
    return res.status(500).json({
      error: "Failed to send print job",
      detail: err.message
    });
  }
});

module.exports = router;
