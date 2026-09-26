using System;
using System.IO;
using System.Runtime.InteropServices;

namespace RbsRawPrint {
    class Program {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct DOC_INFO_1 {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
        }

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

        static int Main(string[] args) {
            if (args.Length < 2) {
                Console.WriteLine("ERR:Init:2:Usage: rawprint.exe <printerName> <filePath>");
                return 1;
            }

            string printer = args[0];
            string file = args[1];

            if (string.IsNullOrEmpty(printer) || string.IsNullOrEmpty(file) || !File.Exists(file)) {
                Console.WriteLine("ERR:Init:2:Invalid printer name or file path does not exist");
                return 1;
            }

            byte[] bytes;
            try {
                bytes = File.ReadAllBytes(file);
            } catch (Exception ex) {
                Console.WriteLine("ERR:ReadFile:2:" + ex.Message);
                return 1;
            }

            IntPtr hPrinter = IntPtr.Zero;
            if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) {
                int errCode = Marshal.GetLastWin32Error();
                string errMsg = new System.ComponentModel.Win32Exception(errCode).Message;
                Console.WriteLine("ERR:OpenPrinter:" + errCode + ":" + errMsg);
                return 1;
            }

            try {
                DOC_INFO_1 di = new DOC_INFO_1();
                di.pDocName = "RBS Receipt";
                di.pDataType = "RAW";
                di.pOutputFile = null;

                int jobId = StartDocPrinter(hPrinter, 1, ref di);
                if (jobId <= 0) {
                    int errCode = Marshal.GetLastWin32Error();
                    string errMsg = new System.ComponentModel.Win32Exception(errCode).Message;
                    Console.WriteLine("ERR:StartDocPrinter:" + errCode + ":" + errMsg);
                    return 1;
                }

                try {
                    if (!StartPagePrinter(hPrinter)) {
                        int errCode = Marshal.GetLastWin32Error();
                        string errMsg = new System.ComponentModel.Win32Exception(errCode).Message;
                        Console.WriteLine("ERR:StartPagePrinter:" + errCode + ":" + errMsg);
                        return 1;
                    }

                    try {
                        int written = 0;
                        bool ok = WritePrinter(hPrinter, bytes, bytes.Length, out written);
                        if (!ok || written != bytes.Length) {
                            int errCode = Marshal.GetLastWin32Error();
                            string errMsg = ok ? ("Bytes written (" + written + ") != length (" + bytes.Length + ")") : new System.ComponentModel.Win32Exception(errCode).Message;
                            Console.WriteLine("ERR:WritePrinter:" + errCode + ":" + errMsg);
                            return 1;
                        }
                    } finally {
                        EndPagePrinter(hPrinter);
                    }
                } finally {
                    EndDocPrinter(hPrinter);
                }

                Console.WriteLine("OK:" + jobId);
                return 0;
            } finally {
                ClosePrinter(hPrinter);
            }
        }
    }
}
