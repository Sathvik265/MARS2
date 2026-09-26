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

// Find rawprint.exe helper binary on disk (or auto-extract embedded fallback binary)
const RAWPRINT_EXE_BASE64 = `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bnRpbWUuQ29tcGlsZXJTZXJ2aWNlcwBDb21waWxhdGlvblJlbGF4YXRpb25zQXR0cmlidXRlAFJ1bnRpbWVDb21wYXRpYmlsaXR5QXR0cmlidXRlAHJhd3ByaW50AERsbEltcG9ydEF0dHJpYnV0ZQB3aW5zcG9vbC5kcnYAT3BlblByaW50ZXJXAFN0YXJ0RG9jUHJpbnRlclcAQ29uc29sZQBXcml0ZUxpbmUAU3RyaW5nAElzTnVsbE9yRW1wdHkAU3lzdGVtLklPAEZpbGUARXhpc3RzAFJlYWRBbGxCeXRlcwBFeGNlcHRpb24AZ2V0X01lc3NhZ2UAQ29uY2F0AEludFB0cgBaZXJvAE1hcnNoYWwAR2V0TGFzdFdpbjMyRXJyb3IAU3lzdGVtLkNvbXBvbmVudE1vZGVsAFdpbjMyRXhjZXB0aW9uAEludDMyAFN0cnVjdExheW91dEF0dHJpYnV0ZQBMYXlvdXRLaW5kAE1hcnNoYWxBc0F0dHJpYnV0ZQBVbm1hbmFnZWRUeXBlAAAAAG9FAFIAUgA6AEkAbgBpAHQAOgAyADoAVQBzAGEAZwBlADoAIAByAGEAdwBwAHIAaQBuAHQALgBlAHgAZQAgADwAcAByAGkAbgB0AGUAcgBOAGEAbQBlAD4AIAA8AGYAaQBsAGUAUABhAHQAaAA+AAB3RQBSAFIAOgBJAG4AaQB0ADoAMgA6AEkAbgB2AGEAbABpAGQAIABwAHIAaQBuAHQAZQByACAAbgBhAG0AZQAgAG8AcgAgAGYAaQBsAGUAIABwAGEAdABoACAAZABvAGUAcwAgAG4AbwB0ACAAZQB4AGkAcwB0AAAfRQBSAFIAOgBSAGUAYQBkAEYAaQBsAGUAOgAyADoAACFFAFIAUgA6AE8AcABlAG4AUAByAGkAbgB0AGUAcgA6AAADOgAAF1IAQgBTACAAUgBlAGMAZQBpAHAAdAAAB1IAQQBXAAApRQBSAFIAOgBTAHQAYQByAHQARABvAGMAUAByAGkAbgB0AGUAcgA6AAArRQBSAFIAOgBTAHQAYQByAHQAUABhAGcAZQBQAHIAaQBuAHQAZQBuADoAAB9CAHkAdABlAHMAIAB3AHIAaQB0AHQAZQBuACAAKAAAGykAIAAhAD0AIABsAGUAbgBnAHQAaAAgACgAAAMpAAAjRQBSAFIA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAMAAAAYD0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

function getRawPrintExePath() {
  const candidates = [
    path.join(path.dirname(process.execPath), "rawprint.exe"),
    path.join(process.cwd(), "rawprint.exe"),
    path.join(process.cwd(), "backend", "rawprint.exe"),
    path.join(TEMP_DIR, "rawprint.exe"),
  ];
  for (const p of candidates) {
    if (fsSyncCheck.existsSync(p)) return p;
  }

  // Auto-extract embedded binary if missing on disk
  try {
    const targetDir = path.dirname(process.execPath);
    let targetPath = path.join(targetDir, "rawprint.exe");
    try {
      fsSyncCheck.writeFileSync(targetPath, Buffer.from(RAWPRINT_EXE_BASE64, "base64"));
      console.log(`[PrintQueue] Auto-extracted embedded rawprint.exe to '${targetPath}'`);
      return targetPath;
    } catch (_) {
      targetPath = path.join(TEMP_DIR, "rawprint.exe");
      fsSyncCheck.writeFileSync(targetPath, Buffer.from(RAWPRINT_EXE_BASE64, "base64"));
      console.log(`[PrintQueue] Auto-extracted embedded rawprint.exe to temp '${targetPath}'`);
      return targetPath;
    }
  } catch (err) {
    console.error(`[PrintQueue] Failed to auto-extract embedded rawprint.exe: ${err.message}`);
  }

  return null;
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
    return { name: configuredName || "Default Printer", shareName: "", driverName: "Generic / Text Only", shared: false, online: true, bypassed: true };
  }

  return new Promise((resolve, reject) => {
    if (IS_WINDOWS) {
      const psCommand = `
        $targetNorm = '${configuredNorm.replace(/'/g, "''")}';
        $printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, DriverName, PortName, WorkOffline, PrinterStatus, Default, Shared
        if (-not $printers) {
            $printers = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, DriverName, PortName, WorkOffline, PrinterStatus, Default, Shared
        }
        if (-not $printers) {
            Write-Output "NO_PRINTERS_FOUND";
            exit 1;
        }

        $printerList = @()
        foreach ($p in $printers) {
            $gp = Get-Printer -Name $p.Name -ErrorAction SilentlyContinue
            $isOffline = ($p.WorkOffline -eq $true -or $p.WorkOffline -eq 1 -or $p.WorkOffline -eq "True" -or $p.PrinterStatus -eq 2 -or $p.PrinterStatus -eq 7 -or ($gp -and ($gp.WorkOffline -eq $true -or $gp.PrinterStatus -eq "Offline" -or $gp.PrinterStatus -eq "Error")))
            $pNorm = $p.Name.ToLower() -replace '[\\s\\-_]+', ''
            $sNorm = if ($p.ShareName) { $p.ShareName.ToLower() -replace '[\\s\\-_]+', '' } else { '' }
            $printerList += [PSCustomObject]@{
                Name = $p.Name
                ShareName = if ($p.ShareName) { $p.ShareName } else { '' }
                DriverName = if ($p.DriverName) { $p.DriverName } else { '' }
                Shared = [bool]$p.Shared
                NormName = $pNorm
                NormShare = $sNorm
                Default = [bool]$p.Default
                Online = -not $isOffline
            }
        }

        $installedNames = ($printerList | Select-Object -ExpandProperty Name) -join ", "

        # 1. Exact match on Name or ShareName (takes highest priority)
        $matched = $printerList | Where-Object { $_.NormName -eq $targetNorm -or ($_.NormShare -ne '' -and $_.NormShare -eq $targetNorm) } | Select-Object -First 1

        # 2. Substring match fallback
        if (-not $matched -and $targetNorm -ne "") {
            $matched = $printerList | Where-Object { $_.NormName.Contains($targetNorm) -or $targetNorm.Contains($_.NormName) -or ($_.NormShare -ne '' -and ($_.NormShare.Contains($targetNorm) -or $targetNorm.Contains($_.NormShare))) } | Select-Object -First 1
        }

        # 3. Default printer
        if (-not $matched) {
            $matched = $printerList | Where-Object { $_.Default } | Select-Object -First 1
        }

        # 4. First available printer
        if (-not $matched) {
            $matched = $printerList | Select-Object -First 1
        }

        if (-not $matched) {
            Write-Output "NOT_FOUND:Installed printers: [$installedNames]"
            exit 1
        }

        if (-not $matched.Online) {
            Write-Output "OFFLINE:$($matched.Name)|$($matched.ShareName)|$($matched.DriverName)|$($matched.Shared)|Installed printers: [$installedNames]"
            exit 2
        } else {
            Write-Output "ONLINE:$($matched.Name)|$($matched.ShareName)|$($matched.DriverName)|$($matched.Shared)"
            exit 0
        }
      `;

      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { timeout: STATUS_TIMEOUT }, (error, stdout, stderr) => {
        const outStr = stdout ? stdout.trim() : "";
        if (error || !outStr.startsWith("ONLINE:")) {
          if (outStr.startsWith("OFFLINE:")) {
            const parts = outStr.replace("OFFLINE:", "").split("|");
            const offlineName = parts[0].trim();
            const listStr = parts[4] || parts[2] || "";
            const err = new Error(`Printer '${offlineName}' is OFFLINE or DISCONNECTED. Please ensure the printer is turned ON and the USB cable is firmly plugged in. Installed: ${listStr}`);
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
          const resolvedDriverName = (parts[2] || "").trim();
          const resolvedShared = (parts[3] || "").trim().toLowerCase() === "true";
          resolve({
            name: resolvedName,
            shareName: resolvedShareName,
            driverName: resolvedDriverName,
            shared: resolvedShared,
            online: true
          });
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
            resolve({ name: matchedName, shareName: "", driverName: "macOS CUPS", shared: false, online: true });
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
    return res.json({ connected: true, printer: printerInfo.name, driverName: printerInfo.driverName, shared: printerInfo.shared });
  } catch (err) {
    return res.json({ connected: false, reason: err.message, printer: err.printer || getEffectivePrinterName() || "Default Printer" });
  }
});

// ---------------------------------------------------------------------------
// GET /printer/list — Enumerate installed printers for admin configuration
// ---------------------------------------------------------------------------
router.get("/list", async (req, res) => {
  if (!IS_WINDOWS) {
    return res.json({ printers: [{ name: "System Default Printer", shareName: "", driverName: "macOS CUPS", shared: false, isDefault: true, isOnline: true }] });
  }

  const psListCommand = `
    $printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, DriverName, Default, PrinterStatus, WorkOffline, Shared
    if (-not $printers) {
        $printers = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name, ShareName, DriverName, Default, PrinterStatus, WorkOffline, Shared
    }
    $res = @()
    foreach ($p in $printers) {
        $gp = Get-Printer -Name $p.Name -ErrorAction SilentlyContinue
        $isOffline = ($p.WorkOffline -eq $true -or $p.WorkOffline -eq 1 -or $p.WorkOffline -eq "True" -or $p.PrinterStatus -eq 2 -or $p.PrinterStatus -eq 7 -or ($gp -and ($gp.WorkOffline -eq $true -or $gp.PrinterStatus -eq "Offline" -or $gp.PrinterStatus -eq "Error")))
        $res += [PSCustomObject]@{
            name = $p.Name
            shareName = if ($p.ShareName) { $p.ShareName } else { '' }
            driverName = if ($p.DriverName) { $p.DriverName } else { '' }
            shared = [bool]$p.Shared
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
      const resData = await executePrintJob(job.printBuf, job.jobId);
      job.resolve(resData);
    } catch (err) {
      console.error(`[PrintQueue] Job ${job.jobId} failed:`, err.message);
      // Retry once on transient failure
      try {
        console.log(`[PrintQueue] Retrying job ${job.jobId}...`);
        await new Promise(r => setTimeout(r, 400));
        const resData = await executePrintJob(job.printBuf, job.jobId);
        console.log(`[PrintQueue] Retry succeeded for job ${job.jobId}`);
        job.resolve(resData);
      } catch (retryErr) {
        console.error(`[PrintQueue] Retry also failed for job ${job.jobId}:`, retryErr.message);
        job.reject(retryErr);
      }
    }
    if (printQueue.length > 0) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  printQueueRunning = false;
}

// ---------------------------------------------------------------------------
// C# / PowerShell P/Invoke RAW printing script using winspool.drv
// ---------------------------------------------------------------------------
const WIN32_RAW_PRINT_SCRIPT = `
if (-not ('RbsRawPrinter' -as [type])) {
    $cSharpCode = @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct DOC_INFO_1 {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
}

public class RbsRawPrinter {
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 pDocInfo);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);
}
"@
    Add-Type -TypeDefinition $cSharpCode
}

$printer = $env:RBS_PRINTER
$file = $env:RBS_FILE

if ([string]::IsNullOrWhiteSpace($printer) -or [string]::IsNullOrWhiteSpace($file) -or -not (Test-Path $file)) {
    [Console]::Out.WriteLine("ERR:Init:2:Invalid printer name or file path")
    exit 1
}

try {
    $bytes = [IO.File]::ReadAllBytes($file)
} catch {
    $msg = $_.Exception.Message
    [Console]::Out.WriteLine("ERR:ReadFile:2:\${msg}")
    exit 1
}

$hPrinter = [IntPtr]::Zero
if (-not [RbsRawPrinter]::OpenPrinter($printer, [ref]$hPrinter, [IntPtr]::Zero)) {
    $errCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    $errMsg = (New-Object System.ComponentModel.Win32Exception($errCode)).Message
    [Console]::Out.WriteLine("ERR:OpenPrinter:\${errCode}:\${errMsg}")
    exit 1
}

try {
    $di = New-Object DOC_INFO_1
    $di.pDocName = "RBS Receipt"
    $di.pDataType = "RAW"
    $di.pOutputFile = $null

    $jobId = [RbsRawPrinter]::StartDocPrinter($hPrinter, 1, [ref]$di)
    if ($jobId -le 0) {
        $errCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        $errMsg = (New-Object System.ComponentModel.Win32Exception($errCode)).Message
        [Console]::Out.WriteLine("ERR:StartDocPrinter:\${errCode}:\${errMsg}")
        exit 1
    }

    try {
        if (-not [RbsRawPrinter]::StartPagePrinter($hPrinter)) {
            $errCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
            $errMsg = (New-Object System.ComponentModel.Win32Exception($errCode)).Message
            [Console]::Out.WriteLine("ERR:StartPagePrinter:\${errCode}:\${errMsg}")
            exit 1
        }

        try {
            $written = 0
            $ok = [RbsRawPrinter]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written)
            if (-not $ok -or $written -ne $bytes.Length) {
                $errCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
                $errMsg = if ($ok) { "Bytes written ($written) does not match file length ($($bytes.Length))" } else { (New-Object System.ComponentModel.Win32Exception($errCode)).Message }
                [Console]::Out.WriteLine("ERR:WritePrinter:\${errCode}:\${errMsg}")
                exit 1
            }
        } finally {
            [RbsRawPrinter]::EndPagePrinter($hPrinter) | Out-Null
        }
    } finally {
        [RbsRawPrinter]::EndDocPrinter($hPrinter) | Out-Null
    }

    [Console]::Out.WriteLine("OK:\${jobId}")
    exit 0
} finally {
    [RbsRawPrinter]::ClosePrinter($hPrinter) | Out-Null
}
`;

// ---------------------------------------------------------------------------
// executePrintJob — sends raw binary buffer to printer via native rawprint.exe
//                   or winspool.drv (Windows) or lp (macOS).
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
    let result = { printer: "", spoolerJobId: null };

    if (IS_WINDOWS) {
      let printerName = "";
      let shareName = "";
      let driverName = "";
      let shared = false;

      try {
        const resolved = await resolvePrinter();
        printerName = resolved.name;
        shareName = resolved.shareName;
        driverName = resolved.driverName;
        shared = resolved.shared;
      } catch (resolveErr) {
        printerName = getEffectivePrinterName() || "Generic  Text Only";
        console.warn(`[PrintQueue] Printer resolution failed for job ${jobId}, falling back to '${printerName}': ${resolveErr.message}`);
        if (resolveErr.message && (resolveErr.message.includes("offline") || resolveErr.message.includes("OFFLINE") || resolveErr.message.includes("disconnected"))) {
          throw resolveErr;
        }
      }

      if (/IPP|v4|Class Driver|XPS/i.test(driverName)) {
        console.warn(`[PrintQueue] Warning: Printer '${printerName}' uses driver '${driverName}' which may not support RAW printing.`);
      }

      console.log(`[PrintQueue] Windows job ${jobId}: printer='${printerName}', driver='${driverName}', bytes=${printBuf.length}`);

      const rawExePath = getRawPrintExePath();

      if (rawExePath) {
        console.log(`[PrintQueue] Executing native rawprint helper: '${rawExePath}'`);
        const nativeResult = await new Promise((resolve, reject) => {
          execFile(
            rawExePath,
            [printerName, tempFilePath],
            { timeout: EXEC_TIMEOUT },
            (error, stdout, stderr) => {
              const outStr = stdout ? stdout.trim() : "";
              const errStr = stderr ? stderr.trim() : "";

              if (outStr.startsWith("OK:")) {
                const spoolerJobIdStr = outStr.replace("OK:", "").trim();
                const spoolerJobId = parseInt(spoolerJobIdStr, 10) || null;
                resolve({ spoolerJobId, stdout: outStr, stderr: errStr });
              } else if (outStr.startsWith("ERR:")) {
                const parts = outStr.split(":");
                const step = parts[1] || "Unknown";
                const win32Code = parts[2] || "0";
                const win32Msg = parts.slice(3).join(":") || "Unknown Win32 error";

                let formattedMsg = `Print job failed at ${step} (Win32 error ${win32Code}: ${win32Msg}).`;
                if (step === "StartDocPrinter" || /IPP|v4|Class Driver|XPS/i.test(driverName)) {
                  formattedMsg += ` Printer driver '${driverName}' may not accept RAW printing. Please install the 'Generic / Text Only' driver or the manufacturer's v3 ESC/P2 driver.`;
                }

                const err = new Error(formattedMsg);
                err.step = step;
                err.win32Code = win32Code;
                err.stdout = outStr;
                err.stderr = errStr;
                reject(err);
              } else {
                const combinedErr = errStr || outStr || (error ? error.message : "Native rawprint execution failed");
                const err = new Error(`Native rawprint execution failed: ${combinedErr}`);
                err.stdout = outStr;
                err.stderr = errStr;
                reject(err);
              }
            }
          );
        });

        result.printer = printerName;
        result.spoolerJobId = nativeResult.spoolerJobId;
        console.log(`[PrintQueue] Windows job ${jobId} printed successfully via native rawprint.exe (spoolerJobId: ${nativeResult.spoolerJobId})`);

      } else {
        console.log(`[PrintQueue] rawprint.exe not found, using PowerShell winspool fallback`);
        const encodedScript = Buffer.from(WIN32_RAW_PRINT_SCRIPT, "utf16le").toString("base64");

        const winspoolResult = await new Promise((resolve, reject) => {
          execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript],
            {
              env: { ...process.env, RBS_PRINTER: printerName, RBS_FILE: tempFilePath },
              timeout: EXEC_TIMEOUT,
            },
            (error, stdout, stderr) => {
              const outStr = stdout ? stdout.trim() : "";
              const errStr = stderr ? stderr.trim() : "";

              if (outStr.startsWith("OK:")) {
                const spoolerJobIdStr = outStr.replace("OK:", "").trim();
                const spoolerJobId = parseInt(spoolerJobIdStr, 10) || null;
                resolve({ spoolerJobId, stdout: outStr, stderr: errStr });
              } else if (outStr.startsWith("ERR:")) {
                const parts = outStr.split(":");
                const step = parts[1] || "Unknown";
                const win32Code = parts[2] || "0";
                const win32Msg = parts.slice(3).join(":") || "Unknown Win32 error";

                let formattedMsg = `Print job failed at ${step} (Win32 error ${win32Code}: ${win32Msg}).`;
                if (step === "StartDocPrinter" || /IPP|v4|Class Driver|XPS/i.test(driverName)) {
                  formattedMsg += ` Printer driver '${driverName}' may not accept RAW printing. Please install the 'Generic / Text Only' driver or the manufacturer's v3 ESC/P2 driver.`;
                }

                const err = new Error(formattedMsg);
                err.step = step;
                err.win32Code = win32Code;
                err.stdout = outStr;
                err.stderr = errStr;
                reject(err);
              } else {
                const combinedErr = errStr || outStr || (error ? error.message : "PowerShell winspool execution failed");
                const err = new Error(`Winspool execution failed: ${combinedErr}`);
                err.stdout = outStr;
                err.stderr = errStr;
                reject(err);
              }
            }
          );
        });

        result.printer = printerName;
        result.spoolerJobId = winspoolResult.spoolerJobId;
        console.log(`[PrintQueue] Windows job ${jobId} printed successfully via winspool (spoolerJobId: ${winspoolResult.spoolerJobId})`);
      }

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

      result.printer = resolvedPrinterName;
      result.spoolerJobId = null;
    }

    await cleanup();
    updateJobStatus(jobId, "success");
    return result;

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
    return res.status(400).json({ success: false, error: "No print text provided" });
  }
  if (typeof text !== "string" || text.length > MAX_PRINT_SIZE) {
    return res.status(413).json({ success: false, error: "Print content exceeds maximum size limit" });
  }

  try {
    const ESC = 0x1B;
    const escPrefix = Buffer.from([
      0x0D,                     // CR — flush any partial line
      ESC, 0x78, 0x00,          // ESC x 0 — Draft quality (FAST)
      ESC, 0x4D,                // ESC M   — 12 CPI (Elite, matches old system)
      ESC, 0x32,                // ESC 2   — 1/6-inch line spacing
      ESC, 0x6C, 0x00,          // ESC l 0 — Left margin = 0
    ]);

    const textBuf = Buffer.from(text, "utf8");

    const feedLines = Math.max(0, parseInt(process.env.PRINTER_FEED_LINES || "4", 10));
    const feedBuf = Buffer.from("\r\n".repeat(feedLines), "utf8");
    const escCleanup = Buffer.from([ESC, 0x40]); // ESC @ — Reset at END only

    const printBuf = Buffer.concat([escPrefix, textBuf, feedBuf, escCleanup]);

    const jobId = randomUUID();
    updateJobStatus(jobId, "queued");

    let resolveJob, rejectJob;
    const jobPromise = new Promise((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });

    printQueue.push({
      printBuf,
      jobId,
      resolve: resolveJob,
      reject: rejectJob
    });

    console.log(`[PrintQueue] Job ${jobId} queued (queue depth: ${printQueue.length})`);

    processPrintQueue().catch(err => {
      console.error("[PrintQueue] Queue processing error:", err.message);
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Print execution timed out (25s)")), EXEC_TIMEOUT);
    });

    const result = await Promise.race([jobPromise, timeoutPromise]);

    return res.json({
      success: true,
      jobId,
      printer: result.printer,
      spoolerJobId: result.spoolerJobId
    });

  } catch (err) {
    console.error("Print operation failed:", err.message);
    return res.status(500).json({
      success: false,
      jobId: req.body?.jobId || null,
      error: err.message,
      detail: err.stderr || err.stdout || err.detail || err.message
    });
  }
});

router.executePrintJob = executePrintJob;
router.resolvePrinter = resolvePrinter;

module.exports = router;
