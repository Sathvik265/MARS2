const XLSX = require("xlsx");

try {
  const workbook = XLSX.readFile("/Users/sathvikkemtur/Documents/rbs-branch/rbs/Documents/Restaurant_Menu_Items_2.xlsx");
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log("Total rows:", data.length);
  for (let i = 0; i < Math.min(10, data.length); i++) {
    console.log(`Row ${i}:`, data[i]);
  }
} catch (e) {
  console.error("Error reading xlsx:", e);
}
