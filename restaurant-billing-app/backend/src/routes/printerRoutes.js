const express = require("express");
const router = express.Router();
const fs = require("fs").promises;
const fsSyncCheck = require("fs");
const path = require("path");
const { execFile, exec } = require("child_process");
const { randomUUID } = require("crypto");
const os = require("os");

const ENV_PRINTER_NAME = process.env.PRINTER_NAME || "";
const PRINTER_FEED_LINES = Math.max(0, parseInt(process.env.PRINTER_FEED_LINES || "4", 10));

const MAX_PRINT_SIZE = 10 * 1024 * 1024; // 10MB limit
const EXEC_TIMEOUT = 25000; // 25 second timeout for print execution
const STATUS_TIMEOUT = 15000; // 15 second timeout for status checks
const TEMP_DIR = os.tmpdir();
const IS_WINDOWS = process.platform === "win32";

const DISABLE_PRINTER_CHECK = process.env.DISABLE_PRINTER_CHECK === "true";

// Normalize printer names for whitespace/hyphen/underscore/case-insensitive matching
function normalizePrinterName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[\s\-_]+/g, "").trim();
}

function getEffectivePrinterName() {
  return process.env.PRINTER_NAME !== undefined ? process.env.PRINTER_NAME : ENV_PRINTER_NAME;
}

// In-memory print job status tracking
const printJobMap = new Map();

function updateJobStatus(jobId, status, error = null) {
  if (!jobId) return;
  printJobMap.set(jobId, {
    jobId,
    status,
    error,
    timestamp: Date.now()
  });
  if (printJobMap.size > 200) {
    const oldestKey = printJobMap.keys().next().value;
    printJobMap.delete(oldestKey);
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve printer status on Windows / macOS
// ---------------------------------------------------------------------------
async function resolvePrinter() {
  const configuredName = getEffectivePrinterName();
  const configuredNorm = normalizePrinterName(configuredName);

  if (DISABLE_PRINTER_CHECK) {
    return { name: configuredName || "Default Printer", online: true, bypassed: true };
  }

  return new Promise((resolve, reject) => {
    if (IS_WINDOWS) {
      const psCommand = `
        $targetNorm = '${configuredNorm.replace(/'/g, "''")}';
        $printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, PortName, @{Name="WorkOffline"; Expression={$_.PrinterStatus -eq 7 -or $_.WorkOffline}}, Default
        if (-not $printers) {
            $printers = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, PortName, @{Name="WorkOffline"; Expression={$_.PrinterStatus -eq 7 -or $_.WorkOffline}}, Default
        }
        if (-not $printers) {
            Write-Output "NO_PRINTERS_FOUND";
            exit 1;
        }

        $printerList = @()
        foreach ($p in $printers) {
            $isOffline = ($p.WorkOffline -eq $true -or $p.WorkOffline -eq 1 -or $p.WorkOffline -eq "True")
            $pNorm = $p.Name.ToLower() -replace '[\s\-_]+', ''
            $sNorm = if ($p.ShareName) { $p.ShareName.ToLower() -replace '[\s\-_]+', '' } else { '' }
            $printerList += [PSCustomObject]@{
                Name = $p.Name
                ShareName = if ($p.ShareName) { $p.ShareName } else { '' }
                NormName = $pNorm
                NormShare = $sNorm
                Default = [bool]$p.Default
                Online = -not $isOffline
            }
        }

        $installedNames = ($printerList | Select-Object -ExpandProperty Name) -join ", "
        $matched = $null

        if ($targetNorm -ne "") {
            $matched = $printerList | Where-Object { $_.NormName.Contains($targetNorm) -or $targetNorm.Contains($_.NormName) -or ($_.NormShare -ne '' -and ($_.NormShare.Contains($targetNorm) -or $targetNorm.Contains($_.NormShare))) } | Select-Object -First 1
        }

        if (-not $matched) {
            $matched = $printerList | Where-Object { $_.Default } | Select-Object -First 1
        }
        if (-not $matched) {
            $matched = $printerList | Select-Object -First 1
        }

        if (-not $matched) {
            Write-Output "NOT_FOUND:Installed printers: [$installedNames]"
            exit 1
        }

        if (-not $matched.Online) {
            Write-Output "OFFLINE:$($matched.Name)|$($matched.ShareName)|Installed printers: [$installedNames]"
            exit 2
        } else {
            Write-Output "ONLINE:$($matched.Name)|$($matched.ShareName)"
            exit 0
        }
      `;

      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { timeout: STATUS_TIMEOUT }, (error, stdout, stderr) => {
        const outStr = stdout ? stdout.trim() : "";
        if (error || !outStr.startsWith("ONLINE:")) {
          if (outStr.startsWith("OFFLINE:")) {
            const parts = outStr.replace("OFFLINE:", "").split("|");
            const offlineName = parts[0].trim();
            const listStr = parts[2] || "";
            const err = new Error(`Printer '${offlineName}' is offline. ${listStr}`);
            err.printer = offlineName;
            reject(err);
          } else if (outStr.startsWith("NOT_FOUND:")) {
            const details = outStr.replace("NOT_FOUND:", "").trim();
            const err = new Error(`Configured printer '${configuredName || "Default"}' not found. ${details}`);
            reject(err);
          } else if (outStr === "NO_PRINTERS_FOUND") {
            reject(new Error("No printers are installed on this Windows system."));
          } else {
            const detailMsg = outStr || stderr || (error ? error.message : "Printer status check failed");
            reject(new Error(`Unable to check printer status: ${detailMsg}`));
          }
        } else {
          const payload = outStr.replace("ONLINE:", "").trim();
          const parts = payload.split("|");
          const resolvedName = parts[0].trim();
          const resolvedShareName = (parts[1] || "").trim();
          resolve({ name: resolvedName, shareName: resolvedShareName, online: true });
        }
      });
    } else {
      // macOS printer resolution
      execFile("lpstat", ["-d"], { timeout: STATUS_TIMEOUT }, (lpErr, lpStdout) => {
        let defaultQueue = null;
        if (!lpErr && lpStdout) {
          const m = lpStdout.match(/system default destination:\s*(.+)/i);
          if (m) defaultQueue = m[1].trim();
        }

        execFile("system_profiler", ["SPPrintersDataType"], { timeout: STATUS_TIMEOUT }, (error, stdout) => {
          if (error || !stdout) {
            reject(new Error("Unable to check printer status on macOS"));
            return;
          }

          const lines = stdout.split("\n");
          let currentPrinter = null;
          let isOffline = false;
          let installedPrinters = [];
          let matchedName = null;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.endsWith(":")) {
              currentPrinter = line.slice(0, -1).trim();
              if (currentPrinter && !installedPrinters.includes(currentPrinter)) {
                installedPrinters.push(currentPrinter);
              }
            }

            if (currentPrinter && configuredNorm) {
              const currentNorm = normalizePrinterName(currentPrinter);
              if (currentNorm.includes(configuredNorm) || configuredNorm.includes(currentNorm)) {
                matchedName = currentPrinter;
                if (line.startsWith("Status:")) {
                  const statusVal = line.replace("Status:", "").trim().toLowerCase();
                  if (statusVal.includes("offline")) isOffline = true;
                }
              }
            }
          }

          if (!matchedName) {
            matchedName = defaultQueue || installedPrinters[0] || configuredName || "Default Printer";
          }

          if (isOffline) {
            const err = new Error(`Printer '${matchedName}' is offline. Installed: [${installedPrinters.join(", ")}]`);
            err.printer = matchedName;
            reject(err);
          } else {
            resolve({ name: matchedName, online: true });
          }
        });
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
    return res.json({ connected: false, reason: err.message, printer: err.printer || getEffectivePrinterName() || "Default Printer" });
  }
});

// ---------------------------------------------------------------------------
// GET /printer/list — Enumerate installed printers for admin configuration
// ---------------------------------------------------------------------------
router.get("/list", async (req, res) => {
  if (!IS_WINDOWS) {
    return res.json({ printers: [{ name: "System Default Printer", isDefault: true, isOnline: true }] });
  }

  const psListCommand = `
    $printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, Default, PrinterStatus, WorkOffline
    if (-not $printers) {
        $printers = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, Default, PrinterStatus, WorkOffline
    }
    $res = @()
    foreach ($p in $printers) {
        $isOffline = ($p.WorkOffline -eq $true -or $p.WorkOffline -eq 1 -or $p.WorkOffline -eq "True" -or $p.PrinterStatus -eq 7)
        $res += [PSCustomObject]@{
            name = $p.Name
            isDefault = [bool]$p.Default
            isOnline = -not $isOffline
        }
    }
    $res | ConvertTo-Json -Compress
  `;

  execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psListCommand], { timeout: STATUS_TIMEOUT }, (error, stdout) => {
    if (error || !stdout) {
      return res.json({ printers: [] });
    }
    try {
      const parsed = JSON.parse(stdout.trim());
      const printersList = Array.isArray(parsed) ? parsed : [parsed];
      return res.json({ printers: printersList });
    } catch (_) {
      return res.json({ printers: [] });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /printer/config — Persist PRINTER_NAME setting to .env
// ---------------------------------------------------------------------------
router.post("/config", async (req, res) => {
  const { printerName } = req.body;
  const newName = typeof printerName === "string" ? printerName.trim() : "";

  process.env.PRINTER_NAME = newName;

  try {
    const envFilePath = path.join(__dirname, "..", "..", ".env");
    if (fsSyncCheck.existsSync(envFilePath)) {
      let content = await fs.readFile(envFilePath, "utf8");
      if (/^PRINTER_NAME=/m.test(content)) {
        content = content.replace(/^PRINTER_NAME=.*/m, `PRINTER_NAME=${newName}`);
      } else {
        content += `\r\nPRINTER_NAME=${newName}\r\n`;
      }
      await fs.writeFile(envFilePath, content, "utf8");
    }
    return res.json({ message: "Printer configuration updated successfully", printerName: newName });
  } catch (err) {
    console.error("Failed to save .env printer config:", err);
    return res.status(500).json({ error: "Failed to persist printer configuration", detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /printer/print/:jobId — Check status of a specific print job
// ---------------------------------------------------------------------------
router.get("/print/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = printJobMap.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Print job not found", jobId });
  }
  return res.json(job);
});

// ---------------------------------------------------------------------------
// Serial Print Queue — prevents buffer corruption from overlapping print jobs
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
        await new Promise(r => setTimeout(r, 400));
        await executePrintJob(job.printBuf, job.jobId);
        console.log(`[PrintQueue] Retry succeeded for job ${job.jobId}`);
      } catch (retryErr) {
        console.error(`[PrintQueue] Retry also failed for job ${job.jobId}:`, retryErr.message);
      }
    }
    if (printQueue.length > 0) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  printQueueRunning = false;
}

// ---------------------------------------------------------------------------
// executePrintJob — sends raw binary buffer to printer via copy /b (Windows)
//                   or lp (macOS). This is the PROVEN approach from b5bcf98
//                   that correctly sends ESC/P2 raw bytes without corruption.
//
// IMPORTANT: Do NOT use System.Printing, Out-Printer, or any PowerShell
// print API here — they add document formatting overhead that dot-matrix
// printers interpret as garbage characters.
// ---------------------------------------------------------------------------
async function executePrintJob(printBuf, jobId) {
  const tempFilePath = path.join(TEMP_DIR, `receipt_${jobId}.txt`);
  updateJobStatus(jobId, "printing");

  const cleanup = async () => {
    try {
      if (fsSyncCheck.existsSync(tempFilePath)) await fs.unlink(tempFilePath);
    } catch (_) { /* ignore */ }
  };

  try {
    await fs.writeFile(tempFilePath, printBuf);

    if (IS_WINDOWS) {
      // Resolve the actual printer to get its share name
      let shareName = "";
      try {
        const resolved = await resolvePrinter();
        // Use share name if available, otherwise fall back to printer name
        shareName = resolved.shareName || resolved.name;
      } catch (resolveErr) {
        // Fall back to configured name
        shareName = getEffectivePrinterName() || "Generic  Text Only";
        console.warn(`[PrintQueue] Printer resolution failed, falling back to '${shareName}': ${resolveErr.message}`);
      }

      // copy /b sends the raw binary buffer to the printer without any
      // encoding or document-format transformation — exactly what ESC/P2
      // dot-matrix printers need.
      const cmdCommand = `copy /b "${tempFilePath}" "\\\\localhost\\${shareName}"`;
      console.log(`[PrintQueue] Sending job ${jobId} to \\\\localhost\\${shareName} via copy /b`);

      await new Promise((resolve, reject) => {
        exec(cmdCommand, { timeout: EXEC_TIMEOUT }, (error, stdout, stderr) => {
          if (error) {
            console.error(`[PrintQueue] Windows copy /b failed for job ${jobId}:`, error.message, stderr);
            reject(error);
          } else {
            console.log(`[PrintQueue] Job ${jobId} sent successfully to ${shareName}`);
            resolve();
          }
        });
      });
    } else {
      // macOS — use lp command
      let resolvedPrinterName = "";
      try {
        const resolved = await resolvePrinter();
        resolvedPrinterName = resolved.name;
      } catch (_) {
        resolvedPrinterName = getEffectivePrinterName() || "";
      }

      const PRINTER_MEDIA_SIZE = process.env.PRINTER_MEDIA_SIZE || "Custom.8.5x4in";
      const args = (!resolvedPrinterName || resolvedPrinterName === "Generic  Text Only")
        ? ["-o", `media=${PRINTER_MEDIA_SIZE}`, tempFilePath]
        : ["-d", resolvedPrinterName, "-o", `media=${PRINTER_MEDIA_SIZE}`, tempFilePath];

      await new Promise((resolve, reject) => {
        execFile("lp", args, { timeout: EXEC_TIMEOUT }, (error) => {
          if (error) reject(error); else resolve();
        });
      });
    }

    await cleanup();
    updateJobStatus(jobId, "success");
  } catch (err) {
    await cleanup();
    updateJobStatus(jobId, "failed", err.message);
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

  try {
    // ESC/P2 initialization — EXACT MATCH to commit b5bcf98:
    //
    //   CR         (0D)         — Flush any partial line from previous job
    //   ESC x 0    (1B 78 00)   — Select DRAFT quality (~300 CPS, fast mode)
    //   ESC M      (1B 4D)      — Select 12 CPI (Elite pitch)
    //   ESC 2      (1B 32)      — Set 1/6-inch line spacing (standard)
    //   ESC l 0    (1B 6C 00)   — Left margin = 0 columns
    //
    // NOTE: We do NOT send ESC @ (reset) at the start! ESC @ resets the
    // printer to its DIP-switch defaults, which may be NLQ mode (~60 CPS)
    // making printing ~5x slower. ESC @ is sent only at the END as cleanup.
    //
    const ESC = 0x1B;
    const escPrefix = Buffer.from([
      0x0D,                     // CR — flush any partial line
      ESC, 0x78, 0x00,          // ESC x 0 — Draft quality (FAST)
      ESC, 0x4D,                // ESC M   — 12 CPI (Elite, matches old system)
      ESC, 0x32,                // ESC 2   — 1/6-inch line spacing
      ESC, 0x6C, 0x00,          // ESC l 0 — Left margin = 0
    ]);

    const textBuf = Buffer.from(text, "utf8");

    // Append feed lines for tear-off, then ESC @ to reset printer state
    // for the next job (prevents state drift / congestion on rapid prints)
    const feedLines = Math.max(0, parseInt(process.env.PRINTER_FEED_LINES || "4", 10));
    const feedBuf = Buffer.from("\r\n".repeat(feedLines), "utf8");
    const escCleanup = Buffer.from([ESC, 0x40]); // ESC @ — Reset at END only

    const printBuf = Buffer.concat([escPrefix, textBuf, feedBuf, escCleanup]);

    const jobId = randomUUID();
    updateJobStatus(jobId, "queued");
    printQueue.push({ printBuf, jobId });
    console.log(`[PrintQueue] Job ${jobId} queued (queue depth: ${printQueue.length})`);

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
