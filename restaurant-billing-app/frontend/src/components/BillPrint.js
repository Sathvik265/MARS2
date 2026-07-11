import React, { useEffect, useState } from "react";
import api from "../services/api";
import { API, safeGet, safeArray, safeObject } from "../utils/helpers";
import { useUser } from "../context/UserContext";

// Inline CSS to handle the continuous roll logic
const printStyles = `
@media print {
  @page {
    /* Let the printer driver determine the page size, removing size: auto as it causes issues with dot matrix drivers */
    margin: 0;
  }
  html, body {
    margin: 0;
    padding: 0;
    height: auto !important;
    min-height: 0 !important;
    -webkit-print-color-adjust: exact;
  }
  .print-area {
    width: 105mm;
    margin: 0;
    padding: 0;
  }
  /* Hide browser headers/footers if the driver supports it */
  header, footer, .no-print {
    display: none !important;
  }
}
`;

const BillContent = ({ data, settings, isLast = true }) => {
  const header = safeObject(data.header);
  const items = safeArray(data.items_json || data.items);
  const mergedData = { ...settings, ...data };

  const billNumber = safeGet(data, "bill_number") || safeGet(header, "bill_number", "N/A");
  const tableNo = safeGet(data, "table_no") || safeGet(header, "table_no", "N/A");
  const partyNo = safeGet(data, "party_no") || safeGet(header, "party_no", "0");
  const hotelName = safeGet(mergedData, "hotel_name", "Udupi Anand Bhavan");
  const address = safeGet(mergedData, "address", "");
  const phone = safeGet(mergedData, "phone", "");
  const gstin = safeGet(mergedData, "gstin", "");
  const clerkInitials = safeGet(data, "clerk_initials") || safeGet(settings, "clerk_initials") || "CLK";

  const trackVal = safeGet(data, "track") || safeGet(header, "track", "");
  const getTrackLetter = (t) => {
    const clean = String(t || "").trim();
    if (clean === "`") return "I";
    if (clean === "``") return "II";
    if (clean.toLowerCase() === "rbs") return "R";
    if (clean.toLowerCase() === "rbs1" || clean.toLowerCase() === "rbs 1") return "R1";
    return "";
  };
  const trackLetter = getTrackLetter(trackVal);
  const section = safeGet(settings, "section") || safeGet(data, "section") || "L";
  const sectionChar = (section === "P" || section.toUpperCase() === "PARCEL") ? "P" : "L";
  const hotelNameWithSection = `${hotelName} ${sectionChar}`;

  const titleSuffix = safeGet(data, "titleSuffix", "");
  const hotelHeading = trackLetter ? `${hotelNameWithSection} ${trackLetter}` : hotelNameWithSection;
  const displayHotelName = titleSuffix ? `${hotelHeading} ${titleSuffix}` : hotelHeading;

  const createdAt = safeGet(data, "created_at", null);
  const sgst = safeGet(data, "sgst", 0);
  const cgst = safeGet(data, "cgst", 0);
  const sgstPercentage = safeGet(mergedData, "sgst_percentage", 2.5);
  const cgstPercentage = safeGet(mergedData, "cgst_percentage", 2.5);
  const grandTotal = safeGet(data, "grand_total", 0);

  const printTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const printDate = createdAt ? new Date(createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");

  const LINE_WIDTH = 35; // Decreased by exactly 5 characters (~0.5 inch at standard 10 cpi)

  const padRight = (str, len) => {
    let s = String(str);
    return s.length >= len ? s.substring(0, len) : s + " ".repeat(len - s.length);
  };

  const padLeft = (str, len) => {
    let s = String(str);
    return s.length >= len ? s.substring(0, len) : " ".repeat(len - s.length) + s;
  };

  const centerText = (str, len) => {
    let s = String(str);
    if (s.length >= len) return s.substring(0, len);
    const leftPad = Math.floor((len - s.length) / 2);
    const rightPad = len - s.length - leftPad;
    return " ".repeat(leftPad) + s + " ".repeat(rightPad);
  };

  const separator = "-".repeat(LINE_WIDTH);

  let ascii = "";

  // Header
  ascii += centerText(`${displayHotelName} (${clerkInitials})`, LINE_WIDTH) + "\n";
  if (address) ascii += centerText(address, LINE_WIDTH) + "\n";
  if (phone) ascii += centerText(`Ph: ${phone}`, LINE_WIDTH) + "\n";
  if (gstin) ascii += centerText(`GST: ${gstin}`, LINE_WIDTH) + "\n";

  ascii += separator + "\n";

  // Meta Info
  const timeAndBill = `${printTime} #${billNumber}`;
  // remaining spaces for date
  const dateStr = printDate;
  ascii += padRight(timeAndBill, LINE_WIDTH - dateStr.length) + dateStr + "\n";

  ascii += separator + "\n";

  // Items header
  // Let Item Width = 19, Qty = 5, Total = 11
  ascii += padRight("Item", 19) + padLeft("Qty", 5) + padLeft("Total", 11) + "\n";
  ascii += separator + "\n";

  if (items.length === 0) {
    ascii += centerText("No Items", LINE_WIDTH) + "\n";
  } else {
    items.forEach(item => {
      const name = String(item.item_name || item.name);

      const nameLines = [];
      let temp = name;
      while (temp.length > 0) {
        nameLines.push(temp.substring(0, 19));
        temp = temp.substring(19);
      }

      const qty = String(item.quantity || item.qty);
      const total = Number(item.line_total || item.amount).toFixed(2);

      nameLines.forEach((line, i) => {
        if (i === 0) {
          ascii += padRight(line, 19) + padLeft(qty, 5) + padLeft(total, 11) + "\n";
        } else {
          ascii += padRight(line, 19) + " ".repeat(16) + "\n";
        }
      });
    });
  }

  ascii += separator + "\n";

  // Totals

  const cgstLabel = `CGST (${Number(cgstPercentage || 0).toFixed(1)}%)`;
  const cgstStr = Number(cgst || 0).toFixed(2);
  ascii += padRight(cgstLabel, LINE_WIDTH - cgstStr.length) + cgstStr + "\n";

  const sgstLabel = `SGST (${Number(sgstPercentage || 0).toFixed(1)}%)`;
  const sgstStr = Number(sgst || 0).toFixed(2);
  ascii += padRight(sgstLabel, LINE_WIDTH - sgstStr.length) + sgstStr + "\n";

  ascii += separator + "\n";

  const totalStr = `Rs. ${Math.round(Number(grandTotal)).toFixed(2)}`;
  ascii += padRight("TOTAL", LINE_WIDTH - totalStr.length) + totalStr + "\n";

  ascii += separator + "\n";
  ascii += centerText(`Table: ${tableNo} | Party: ${partyNo}`, LINE_WIDTH) + "\n";

  // Feed lines at bottom
  // if (isLast) {
  //   for (let i = 0; i < 20; i++) {
  //     ascii += ".\n";
  //   }
  // }

  return (
    <pre style={{
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: "13px",
      margin: 0,
      padding: "0px 5px",
      whiteSpace: "pre",
      color: "black",
      background: "white",
      lineHeight: "1.2"
    }}>
      {ascii}
    </pre>
  );
};

export default function BillPrint({ billData = null }) {
  const [fetchedSettings, setFetchedSettings] = useState(null);
  const { userInitials: loggedInClerk } = useUser();

  useEffect(() => {
    if (!billData?.hotel_name) {
      const mode = localStorage.getItem("mode");
      if (!mode || mode === "none") return;

      const clerk = billData?.clerk_initials || loggedInClerk || "CLK";
      api.get(`/settings?clerk=${clerk}`)
        .then((res) => setFetchedSettings(res.data))
        .catch((err) => console.error("Settings fetch failed", err));
    }
  }, [billData, loggedInClerk]);

  const data = billData || (typeof window !== "undefined" && window.printBillData);

  if (!data) return <div>Loading Bill...</div>;

  const bills = safeArray(data.bills);

  return (
    <>
      <style>{printStyles}</style>
      <div className="print-receipt-container print-area">
        {bills.length > 0 ? (
          bills.map((bill, index) => (
            <React.Fragment key={index}>
              <BillContent data={bill} settings={fetchedSettings || data} isLast={index === bills.length - 1} />
              {index < bills.length - 1 && <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />}
            </React.Fragment>
          ))
        ) : (
          <BillContent data={data} settings={fetchedSettings || data} isLast={true} />
        )}
      </div>
    </>
  );
}