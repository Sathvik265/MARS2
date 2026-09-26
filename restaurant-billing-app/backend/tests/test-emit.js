const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const psScript = `
if (-not ('RbsRawPrinter' -as [type])) {
    $Domain = [AppDomain]::CurrentDomain
    $DynAssembly = New-Object System.Reflection.AssemblyName('RbsRawWinspool')
    $AssemblyBuilder = $Domain.DefineDynamicAssembly($DynAssembly, [System.Reflection.Emit.AssemblyBuilderAccess]::Run)
    $ModuleBuilder = $AssemblyBuilder.DefineDynamicModule('RbsRawWinspoolModule')

    $TypeBuilderDoc = $ModuleBuilder.DefineType('DOC_INFO_1', 'Public, SequentialLayout, Sealed, BeforeFieldInit', [ValueType])
    $TypeBuilderDoc.DefineField('pDocName', [string], 'Public') | Out-Null
    $TypeBuilderDoc.DefineField('pOutputFile', [string], 'Public') | Out-Null
    $TypeBuilderDoc.DefineField('pDataType', [string], 'Public') | Out-Null
    $TypeBuilderDoc.CreateType() | Out-Null

    $TypeBuilder = $ModuleBuilder.DefineType('RbsRawPrinter', 'Public, Class')
    $DocInfoType = $ModuleBuilder.GetType('DOC_INFO_1')

    $PInvokeOpen = $TypeBuilder.DefinePInvokeMethod('OpenPrinter', 'winspool.drv', 'Public, Static', [System.Reflection.CallingConventions]::Standard, [bool], @([string], [IntPtr].MakeByRefType(), [IntPtr]), [System.Runtime.InteropServices.CallingConvention]::StdCall, [System.Runtime.InteropServices.CharSet]::Unicode)
    $PInvokeOpen.SetImplementationFlags($PInvokeOpen.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)

    $PInvokeStartDoc = $TypeBuilder.DefinePInvokeMethod('StartDocPrinter', 'winspool.drv', 'Public, Static', [System.Reflection.CallingConventions]::Standard, [int], @([IntPtr], [int], $DocInfoType.MakeByRefType()), [System.Runtime.InteropServices.CallingConvention]::StdCall, [System.Runtime.InteropServices.CharSet]::Unicode)
    $PInvokeStartDoc.SetImplementationFlags($PInvokeStartDoc.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)

    $PInvokeStartPage = $TypeBuilder.DefinePInvokeMethod('StartPagePrinter', 'winspool.drv', 'Public, Static', [System.Reflection.CallingConventions]::Standard, [bool], @([IntPtr]), [System.Runtime.InteropServices.CallingConvention]::StdCall, [System.Runtime.InteropServices.CharSet]::Unicode)
    $PInvokeStartPage.SetImplementationFlags($PInvokeStartPage.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)

    $PInvokeWrite = $TypeBuilder.DefinePInvokeMethod('WritePrinter', 'winspool.drv', 'Public, Static', [System.Reflection.CallingConventions]::Standard, [bool], @([IntPtr], [byte[]], [int], [int].MakeByRefType()), [System.Runtime.InteropServices.CallingConvention]::StdCall, [System.Runtime.InteropServices.CharSet]::Unicode)
    $PInvokeWrite.SetImplementationFlags($PInvokeWrite.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)

    $PInvokeEndPage = $TypeBuilder.DefinePInvokeMethod('EndPagePrinter', 'winspool.drv', 'Public, Static', [System.Reflection.CallingConventions]::Standard, [bool], @([IntPtr]), [System.Runtime.InteropServices.CallingConvention]::StdCall, [System.Runtime.InteropServices.CharSet]::Unicode)
    $PInvokeEndPage.SetImplementationFlags($PInvokeEndPage.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)

    $PInvokeEndDoc = $TypeBuilder.DefinePInvokeMethod('EndDocPrinter', 'winspool.drv', 'Public, Static', [System.Reflection.CallingConventions]::Standard, [bool], @([IntPtr]), [System.Runtime.InteropServices.CallingConvention]::StdCall, [System.Runtime.InteropServices.CharSet]::Unicode)
    $PInvokeEndDoc.SetImplementationFlags($PInvokeEndDoc.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)

    $PInvokeClose = $TypeBuilder.DefinePInvokeMethod('ClosePrinter', 'winspool.drv', 'Public, Static', [System.Reflection.CallingConventions]::Standard, [bool], @([IntPtr]), [System.Runtime.InteropServices.CallingConvention]::StdCall, [System.Runtime.InteropServices.CharSet]::Unicode)
    $PInvokeClose.SetImplementationFlags($PInvokeClose.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)

    $TypeBuilder.CreateType() | Out-Null
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

const encodedScript = Buffer.from(psScript, "utf16le").toString("base64");
const testFile = path.join(os.tmpdir(), "test_raw_emit_print.txt");
fs.writeFileSync(testFile, "Hello World Reflection.Emit RAW Print Test\r\n");

execFile(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript],
  {
    env: { ...process.env, RBS_PRINTER: "EPSON LQ-310 ESC/P2 (Copy 2)", RBS_FILE: testFile },
    timeout: 25000,
  },
  (err, stdout, stderr) => {
    console.log("Exit Code / Err:", err ? err.code || err.message : 0);
    console.log("STDOUT:", stdout.trim());
    console.log("STDERR:", stderr.trim());
  }
);
