import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PrintPortal = ({ children }) => {
  const [printWindow, setPrintWindow] = useState(null);

  useEffect(() => {
    // Create hidden iframe for printing
    const iframe = document.createElement("iframe");
    iframe.id = "print-iframe";
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    // CRITICAL: Copy the global print data to the iframe's window so BillPrint can read it
    if (typeof window !== "undefined" && window.printBillData) {
      iframe.contentWindow.printBillData = window.printBillData;
    }

    // Get iframe document
    const iframeDoc = iframe.contentWindow.document;

    // Copy styles from main window to iframe
    const styleSheets = Array.from(document.styleSheets);
    styleSheets.forEach((styleSheet) => {
      try {
        if (styleSheet.href) {
          const link = iframeDoc.createElement("link");
          link.rel = "stylesheet";
          link.href = styleSheet.href;
          iframeDoc.head.appendChild(link);
        } else if (styleSheet.cssRules) {
          const style = iframeDoc.createElement("style");
          Array.from(styleSheet.cssRules).forEach((rule) => {
            style.appendChild(iframeDoc.createTextNode(rule.cssText));
          });
          iframeDoc.head.appendChild(style);
        }
      } catch (e) {
        // Handle cross-origin errors if any
        console.warn("Could not copy stylesheet", e);
      }
    });

    // Add print-specific styles
    const printStyle = iframeDoc.createElement("style");
    printStyle.textContent = `
      @media print {
        @page { 
          margin: 0; 
        }
        html, body {
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body, body * { 
          visibility: visible !important;
          background-color: white !important;
          color: black !important;
        }
        * { 
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
    iframeDoc.head.appendChild(printStyle);

    setPrintWindow(iframe.contentWindow);

    return () => {
      document.body.removeChild(iframe);
    };
  }, []);

  return printWindow ? createPortal(children, printWindow.document.body) : null;
};

export default PrintPortal;
