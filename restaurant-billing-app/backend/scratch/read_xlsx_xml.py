import zipfile
import xml.etree.ElementTree as ET

def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        # Read shared strings
        strings = []
        try:
            with z.open("xl/sharedStrings.xml") as f:
                tree = ET.parse(f)
                for t in tree.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"):
                    strings.append(t.text)
        except KeyError:
            pass

        # Read sheet1
        with z.open("xl/worksheets/sheet1.xml") as f:
            tree = ET.parse(f)
            ns = {"ns": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            rows = []
            for row in tree.findall(".//ns:row", ns):
                row_data = []
                for cell in row.findall("ns:c", ns):
                    val_el = cell.find("ns:v", ns)
                    val = val_el.text if val_el is not None else ""
                    cell_type = cell.get("t")
                    if cell_type == "s" and val:
                        val = strings[int(val)]
                    row_data.append(val)
                rows.append(row_data)
            return rows

try:
    data = read_xlsx("/Users/sathvikkemtur/Documents/rbs-branch/rbs/Documents/Restaurant_Menu_Items_2.xlsx")
    print(f"Total rows: {len(data)}")
    for i in range(min(10, len(data))):
        print(data[i])
except Exception as e:
    print("Error:", e)
