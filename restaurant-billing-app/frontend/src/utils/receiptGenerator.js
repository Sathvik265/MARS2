import { safeGet, safeArray, safeObject, formatDateToDDMMYYYY } from "./helpers";

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
    if (clean.toLowerCase() === "rbs1" || clean.toLowerCase() === "rbs 1") return "R1";
    return "";
  };
  const trackLetter = getTrackLetter(trackVal);

  const createdAt = safeGet(data, "created_at", null);
  const sgst = safeGet(data, "sgst", 0);
  const cgst = safeGet(data, "cgst", 0);
  const sgstPercentage = safeGet(mergedData, "sgst_percentage", 2.5);
  const cgstPercentage = safeGet(mergedData, "cgst_percentage", 2.5);
  const grandTotal = safeGet(data, "grand_total", 0);

  const printDate = formatDateToDDMMYYYY(createdAt || new Date());

  const LINE_WIDTH = 40; // 40 characters at 12 CPI (Elite) = 3.33 inches

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
  const section = safeGet(settings, "section") || safeGet(data, "section") || "L";
  const sectionChar = (section === "P" || section.toUpperCase() === "PARCEL") ? "P" : "L";
  const hotelNameWithSection = `${hotelName} ${sectionChar}`;

  const titleSuffix = safeGet(data, "titleSuffix", "");
  const hotelHeading = trackLetter ? `${hotelNameWithSection} ${trackLetter}` : hotelNameWithSection;
  const displayHotelName = titleSuffix ? `${hotelHeading} ${titleSuffix}` : hotelHeading;

  // ── HEADER GENERATOR ──
  const buildHeader = () => {
    let h = "";
    h += centerText(displayHotelName, LINE_WIDTH) + "\r\n";
    if (address) h += centerText(address, LINE_WIDTH) + "\r\n";
    if (phone) h += centerText(`Ph: ${phone}`, LINE_WIDTH) + "\r\n";
    if (gstin) h += centerText(`GST:${gstin}`, LINE_WIDTH) + "\r\n";
    h += "\r\n";
    return h;
  };

  // Check if header is already pre-printed on the roll
  const isPreprinted = typeof window !== "undefined" && window.sessionStorage && window.sessionStorage.getItem("rbs_header_preprinted") === "true";

  if (!isPreprinted) {
    ascii += buildHeader();
  }

  // Bill number + track + date
  const billAndTrack = trackLetter ? `${billNumber} ${trackLetter}` : String(billNumber);
  ascii += padRight(billAndTrack, LINE_WIDTH - printDate.length) + printDate + "\r\n";
  ascii += separator + "\r\n";

  // Items
  const NAME_W = 29;
  const QTY_W  = 3;
  const AMT_W  = 8;

  if (items.length === 0) {
    ascii += centerText("No Items", LINE_WIDTH) + "\r\n";
  } else {
    items.forEach(item => {
      const name = String(item.item_name || item.name || "");
      const nameLines = [];
      let temp = name;
      while (temp.length > 0) {
        nameLines.push(temp.substring(0, NAME_W));
        temp = temp.substring(NAME_W);
      }

      const rawQty = Number(item.quantity ?? item.qty ?? 0);
      const qtyStr = String(rawQty);
      const amtStr = Number(item.line_total || item.amount || 0).toFixed(2);

      nameLines.forEach((line, i) => {
        if (i === 0) {
          ascii += padRight(line, NAME_W) + padLeft(qtyStr, QTY_W) + padLeft(amtStr, AMT_W) + "\r\n";
        } else {
          ascii += padRight(line, NAME_W) + " ".repeat(QTY_W + AMT_W) + "\r\n";
        }
      });
    });
  }

  ascii += separator + "\r\n";

  // Taxes
  const fmtPct = (p) => Number(p || 0).toFixed(2);
  const fmtAmt = (a) => Number(a || 0).toFixed(2);

  const sgstLabel = `SGST(${fmtPct(sgstPercentage)}%)`;
  const sgstAmtStr = `Rs. ${fmtAmt(sgst)}`;
  ascii += padRight(sgstLabel, LINE_WIDTH - sgstAmtStr.length) + sgstAmtStr + "\r\n";

  const cgstLabel = `CGST(${fmtPct(cgstPercentage)}%)`;
  const cgstAmtStr = `Rs. ${fmtAmt(cgst)}`;
  ascii += padRight(cgstLabel, LINE_WIDTH - cgstAmtStr.length) + cgstAmtStr + "\r\n";

  ascii += separator + "\r\n";

  // Grand Total
  const payableStr = `Rs. ${Math.round(Number(grandTotal)).toFixed(2)}`;
  ascii += padRight("Payable(Rounded)", LINE_WIDTH - payableStr.length) + payableStr + "\r\n";

  ascii += separator + "\r\n";

  // Footer
  ascii += `Table:${tableNo} Party: ${partyNo} Waiter: ${clerkInitials}` + "\r\n";
  ascii += separator + "\r\n";

  // ── TEAR FEED & PRE-PRINT NEXT HEADER ──
  // 1. Feed lines to roll the footer past the tear-off bar
  ascii += "\r\n".repeat(6);

  // 2. Pre-print the next header on the roll
  ascii += buildHeader();

  // 3. Mark in session storage that the header is pre-printed for the next bill
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem("rbs_header_preprinted", "true");
  }

  return ascii;
}

export function generateAsciiReport(title, columns, data, settings) {
  const mergedData = { ...settings };
  const hotelName = safeGet(mergedData, "hotel_name", "Udupi Anand Bhavan");
  const clerkInitials = safeGet(mergedData, "clerk_initials", "CLK");
  const LINE_WIDTH = 32;

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

  ascii += centerText(`${hotelName} (${clerkInitials})`, LINE_WIDTH) + "\r\n";

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
    data.forEach(row => {
      let rLine = [];
      let nextLineOverrides = null;

      columns.forEach(c => {
        let val = String(c.accessor(row) || "");

        if (val.length > c.width && !c.align) {
          if (!nextLineOverrides) nextLineOverrides = [];
          nextLineOverrides.push({ col: c, text: val.substring(c.width) });
          val = val.substring(0, c.width);
        }

        rLine.push(c.align === "right" ? padLeft(val, c.width) : padRight(val, c.width));
      });
      ascii += rLine.join(" ") + "\r\n";

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

  for (let i = 0; i < 2; i++) {
    ascii += ".\r\n";
  }

  return ascii;
}
