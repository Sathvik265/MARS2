param(
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [Parameter(Mandatory=$true)][string]$FilePath
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.IO;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOW
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static string SendFileToPrinter(string szPrinterName, string szFileName)
    {
        IntPtr hPrinter = new IntPtr(0);
        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero))
        {
            int err = Marshal.GetLastWin32Error();
            return "ERROR: OpenPrinterW failed for '" + szPrinterName + "' (Win32 Error Code: " + err + ")";
        }

        DOCINFOW di = new DOCINFOW();
        di.pDocName = "RBS Bill Document";
        di.pDataType = "RAW";

        if (!StartDocPrinter(hPrinter, 1, di))
        {
            int err = Marshal.GetLastWin32Error();
            ClosePrinter(hPrinter);
            return "ERROR: StartDocPrinterW failed for '" + szPrinterName + "' (Win32 Error Code: " + err + ")";
        }

        if (!StartPagePrinter(hPrinter))
        {
            int err = Marshal.GetLastWin32Error();
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return "ERROR: StartPagePrinter failed for '" + szPrinterName + "' (Win32 Error Code: " + err + ")";
        }

        byte[] bytes = File.ReadAllBytes(szFileName);
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        
        int dwWritten = 0;
        bool success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
        
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        if (success && dwWritten == bytes.Length)
        {
            return "SUCCESS";
        }
        else
        {
            int err = Marshal.GetLastWin32Error();
            return "ERROR: WritePrinter failed (Written: " + dwWritten + "/" + bytes.Length + ", Win32 Error Code: " + err + ")";
        }
    }
}
"@

try {
    $result = [RawPrinterHelper]::SendFileToPrinter($PrinterName, $FilePath)
    if ($result -eq "SUCCESS") { 
        Write-Output "SUCCESS"
        exit 0
    } else { 
        Write-Output $result
        exit 1
    }
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
