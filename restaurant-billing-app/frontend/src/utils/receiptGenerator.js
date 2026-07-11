import { safeGet, safeArray, safeObject } from "./helpers";

export function generateAsciiReceipt(data, settings) {
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
    if (clean.toLowerCase() === "rbs1" || clean.toLowerCase() === "rbs 1") return "R2";
    return "";
  };
  const trackLetter = getTrackLetter(trackVal);

  const createdAt = safeGet(data, "created_at", null);
  const sgst = safeGet(data, "sgst", 0);
  const cgst = safeGet(data, "cgst", 0);
  const sgstPercentage = safeGet(mergedData, "sgst_percentage", 2.5);
  const cgstPercentage = safeGet(mergedData, "cgst_percentage", 2.5);
  const grandTotal = safeGet(data, "grand_total", 0);

  const printTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const printDate = createdAt ? new Date(createdAt).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");

  const LINE_WIDTH = 40; // 40 characters at 12 CPI (Elite) = 3.33 inches — matches old system

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

  // Title Suffix support (for split bills)
  const section = safeGet(mergedData, "section", "L");
  const sectionChar = (section === "P" || section.toUpperCase() === "PARCEL") ? "P" : "L";
  const hotelNameWithSection = `${hotelName} ${sectionChar}`;

  const titleSuffix = safeGet(data, "titleSuffix", "");
  const hotelHeading = trackLetter ? `${hotelNameWithSection} ${trackLetter}` : hotelNameWithSection;
  const displayHotelName = titleSuffix ? `${hotelHeading} ${titleSuffix}` : hotelHeading;

  // Meta Info
  const timeAndBill = `${printTime} #${billNumber}`;
  const dateStr = printDate;
  ascii += padRight(timeAndBill, LINE_WIDTH - dateStr.length) + dateStr + "\r\n";

  ascii += separator + "\r\n";

  // Items header (24, 5, 11)
  ascii += padRight("Item", 24) + padLeft("Qty", 5) + padLeft("Total", 11) + "\r\n";
  ascii += separator + "\r\n";

  if (items.length === 0) {
    ascii += centerText("No Items", LINE_WIDTH) + "\r\n";
  } else {
    items.forEach(item => {
      const name = String(item.item_name || item.name);

      const nameLines = [];
      let temp = name;
      while (temp.length > 0) {
        nameLines.push(temp.substring(0, 24));
        temp = temp.substring(24);
      }

      const qty = String(item.quantity || item.qty);
      const total = Number(item.line_total || item.amount).toFixed(2);

      nameLines.forEach((line, i) => {
        if (i === 0) {
          ascii += padRight(line, 24) + padLeft(qty, 5) + padLeft(total, 11) + "\r\n";
        } else {
          ascii += padRight(line, 24) + " ".repeat(16) + "\r\n";
        }
      });
    });
  }

  ascii += separator + "\r\n";

  // Totals

  const cgstLabel = `CGST (${Number(cgstPercentage || 0).toFixed(1)}%)`;
  const cgstStr = Number(cgst || 0).toFixed(2);
  ascii += padRight(cgstLabel, LINE_WIDTH - cgstStr.length) + cgstStr + "\r\n";

  const sgstLabel = `SGST (${Number(sgstPercentage || 0).toFixed(1)}%)`;
  const sgstStr = Number(sgst || 0).toFixed(2);
  ascii += padRight(sgstLabel, LINE_WIDTH - sgstStr.length) + sgstStr + "\r\n";

  ascii += separator + "\r\n";

  const totalStr = `Rs. ${Math.round(Number(grandTotal)).toFixed(2)}`;
  ascii += padRight("TOTAL", LINE_WIDTH - totalStr.length) + totalStr + "\r\n";

  ascii += separator + "\r\n";
  ascii += centerText(`Table: ${tableNo} | Party: ${partyNo}`, LINE_WIDTH) + "\r\n";
  ascii += separator + "\r\n";

  // Minimal gap between details and footer
  for (let i = 0; i < 2; i++) {
    ascii += "\r\n";
  }

  // Header moved to the bottom
  ascii += centerText(`${displayHotelName} (${clerkInitials})`, LINE_WIDTH) + "\r\n";
  if (address) ascii += centerText(address, LINE_WIDTH) + "\r\n";
  if (phone) ascii += centerText(`Ph: ${phone}`, LINE_WIDTH) + "\r\n";
  if (gstin) ascii += centerText(`GST: ${gstin}`, LINE_WIDTH) + "\r\n";

  // 2-inch gap for mechanical paper feed tear-off (approx 12 lines)
  /* for (let i = 0; i < 12; i++) {
     ascii += ".\r\n";
   }*/

  return ascii;
}

export function generateAsciiReport(title, columns, data, settings) {
  const mergedData = { ...settings };
  const hotelName = safeGet(mergedData, "hotel_name", "Udupi Anand Bhavan");
  const clerkInitials = safeGet(mergedData, "clerk_initials", "CLK");
  const LINE_WIDTH = 32; // Standard continuous paper width (32 columns)

  const padRight = (str, len) => {
    let s = String(str || "");
    return s.length >= len ? s.substring(0, len) : s + " ".repeat(len - s.length);
  };

  const padLeft = (str, len) => {
    let s = String(str || "");
    return s.length >= len ? s.substring(0, len) : " ".repeat(len - s.length) + s;
  };

  const centerText = (str, len) => {
    let s = String(str || "");
    if (s.length >= len) return s.substring(0, len);
    const leftPad = Math.floor((len - s.length) / 2);
    const rightPad = len - s.length - leftPad;
    return " ".repeat(leftPad) + s + " ".repeat(rightPad);
  };

  const separator = "-".repeat(LINE_WIDTH);

  let ascii = "";

  // Header Title
  ascii += centerText(`${hotelName} (${clerkInitials})`, LINE_WIDTH) + "\r\n";

  // Wrap very long report titles onto two lines perfectly
  const titleLines = [];
  let tempTitle = title;
  while (tempTitle.length > 0) {
    titleLines.push(tempTitle.substring(0, LINE_WIDTH));
    tempTitle = tempTitle.substring(LINE_WIDTH);
  }
  titleLines.forEach(l => {
    ascii += centerText(l, LINE_WIDTH) + "\r\n";
  });

  ascii += separator + "\r\n";

  // Build Column Headers
  let headerLine = [];
  columns.forEach(c => {
    let t = c.header;
    headerLine.push(c.align === "right" ? padLeft(t, c.width) : padRight(t, c.width));
  });
  ascii += headerLine.join(" ") + "\r\n";
  ascii += separator + "\r\n";

  if (!data || data.length === 0) {
    ascii += centerText("No Data", LINE_WIDTH) + "\r\n";
  } else {
    // Build Rows
    data.forEach(row => {
      let rLine = [];
      let nextLineOverrides = null; // for wrapping row text manually

      columns.forEach(c => {
        let val = String(c.accessor(row) || "");

        // Custom wrap for the first primary column if text is too long (usually item desc)
        if (val.length > c.width && !c.align) {
          if (!nextLineOverrides) nextLineOverrides = [];
          nextLineOverrides.push({ col: c, text: val.substring(c.width) });
          val = val.substring(0, c.width);
        }

        rLine.push(c.align === "right" ? padLeft(val, c.width) : padRight(val, c.width));
      });
      ascii += rLine.join(" ") + "\r\n";

      // Print stacked multi-line row if needed
      if (nextLineOverrides) {
        let subLine = [];
        columns.forEach(c => {
          let matchingWrap = nextLineOverrides.find(ov => ov.col === c);
          let wrapVal = matchingWrap ? matchingWrap.text.substring(0, c.width) : "";
          subLine.push(c.align === "right" ? padLeft(wrapVal, c.width) : padRight(wrapVal, c.width));
        });
        ascii += subLine.join(" ") + "\r\n";
      }
    });
  }

  ascii += separator + "\r\n";
  const printTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  ascii += centerText(`End of Rpt | ${printTime}`, LINE_WIDTH) + "\r\n";
  ascii += separator + "\r\n";

  // Minimal mechanical feed loop
  for (let i = 0; i < 2; i++) {
    ascii += ".\r\n";
  }

  return ascii;
}
