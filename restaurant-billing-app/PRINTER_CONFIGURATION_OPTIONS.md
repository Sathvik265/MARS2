# ESC/P Hardware Printer Configuration & Command Options

This document provides a line-by-line breakdown of each control byte in the receipt print configuration buffer, along with all available options, parameters, and hex codes for ESC/P and ESC/POS dot-matrix / thermal printers.

---

## Configuration Buffer Breakdown

```javascript
const ESC = 0x1B;
const escPrefix = Buffer.from([
  0x0D,                     // 1. CR     — Carriage Return / Flush line
  ESC, 0x40,                // 2. ESC @  — Hardware Reset & Initialize
  ESC, 0x78, 0x00,          // 3. ESC x 0 — Draft Quality Mode (Fastest)
  ESC, 0x45,                // 4. ESC E  — Emphasized Mode ON (Dark Text)
  ESC, 0x55, 0x01,          // 5. ESC U 1 — Unidirectional Mode ON (Uniform Line Density)
  ESC, 0x4D,                // 6. ESC M  — 12 CPI Pitch (Elite Pitch)
  ESC, 0x32,                // 7. ESC 2  — 1/6-inch Line Spacing
  ESC, 0x6C, 0x00,          // 8. ESC l 0 — Left Margin = 0 Columns
]);
```

---

## Exhaustive Reference: Each Item & All Available Options

### 1. `0x0D` — Pre-Print Buffer Flush (Carriage Return)
Flushes any unprinted character bytes from the printer's internal RAM before applying configuration settings.

| Command / Hex | Constant / ASCII | Description & Behavior |
| :--- | :--- | :--- |
| `0x0D` | `CR` (`\r`) | **Carriage Return (Current)**: Moves carriage to left edge and flushes buffer without feeding paper vertically. |
| `0x0A` | `LF` (`\n`) | **Line Feed**: Flushes buffer and feeds paper down by 1 line based on current line spacing. |
| `0x0C` | `FF` (`\f`) | **Form Feed**: Flushes buffer and feeds paper to the top of the next page / cut position. |
| *(None)* | *(Omitted)* | **No Pre-Flush**: Skips pre-flush byte. |

---

### 2. `ESC, 0x40` — Hardware Reset (`ESC @`)
Clears the print buffer and resets all parameters (pitch, line spacing, margins, character sets) to printer factory defaults.

| Command / Hex | ASCII | Description & Behavior |
| :--- | :--- | :--- |
| `0x1B, 0x40` | `ESC @` | **Master Hardware Initialize (Current)**: Clears internal RAM buffer, resets pitch to default, cancels bold/italic/condensed modes. Recommended at the start of every print job. |
| *(Omitted)* | *(None)* | **No Reset**: Preserves settings left over from previous print job (can cause corruption if another app altered margins or pitch). |

---

### 3. `ESC, 0x78, n` — Print Quality & Speed Mode (`ESC x n`)
Controls print head resolution, speed, and dot density.

| Command / Hex | ASCII / Value | Description & Speed / Density Impact |
| :--- | :--- | :--- |
| `0x1B, 0x78, 0x00` | `ESC x 0` | **Draft Quality Mode (Current)**: High-speed motor drive, 9-pin/thermal draft font. **Fastest possible print speed**. |
| `0x1B, 0x78, 0x01` | `ESC x 1` | **Near Letter Quality (NLQ) Mode**: High-density dot placement. **~50% slower speed**, higher visual resolution. |
| `0x1B, 0x6B, 0x00` | `ESC k 0` | **NLQ Roman Font**: Selects Roman font in NLQ mode. |
| `0x1B, 0x6B, 0x01` | `ESC k 1` | **NLQ Sans Serif Font**: Selects Sans Serif font in NLQ mode. |
| `0x1B, 0x6B, 0x02` | `ESC k 2` | **NLQ Courier Font**: Selects Courier font in NLQ mode. |
| `0x1B, 0x6B, 0x03` | `ESC k 3` | **NLQ Prestige Font**: Selects Prestige font in NLQ mode. |
| `0x1B, 0x6B, 0x04` | `ESC k 4` | **NLQ Script Font**: Selects Script font in NLQ mode. |

---

### 4. `ESC, 0x45` / `ESC, 0x47` — Text Darkness & Stroke Weight

Controls character darkness, bolding, and dot pulse width.

| Command / Hex | ASCII | Description & Performance Profile |
| :--- | :--- | :--- |
| `0x1B, 0x45` | `ESC E` | **Emphasized Mode ON (Current)**: Fires printhead pins with wider micro-pulse width. Produces **DARK, bold, crisp characters in 1 single pass at FULL DRAFT SPEED**. |
| `0x1B, 0x46` | `ESC F` | **Emphasized Mode OFF**: Restores standard draft line stroke weight. |
| `0x1B, 0x47` | `ESC G` | **Double-Strike Mode ON**: Passes printhead twice per line with slight vertical offset. Produces dark text, but **cuts print speed in half (50% slower)**. |
| `0x1B, 0x48` | `ESC H` | **Double-Strike Mode OFF**: Turns off double-strike mode. |
| `0x1B, 0x45, 0x1B, 0x47` | `ESC E ESC G` | **Emphasized + Double-Strike**: Maximum possible ink/thermal darkness, but slowest speed. |

---

### 5. `ESC, 0x55, n` — Print Directionality (`ESC U n`)

Controls carriage sweep direction.

| Command / Hex | ASCII / Value | Description & Alignment Behavior |
| :--- | :--- | :--- |
| `0x1B, 0x55, 0x01` | `ESC U 1` | **Unidirectional Mode ON (Current)**: Forces printhead to sweep left-to-right ONLY for every line. **Completely eliminates alternating dark and light lines** caused by bidirectional head alignment or voltage variations. |
| `0x1B, 0x55, 0x00` | `ESC U 0` | **Bidirectional Mode**: Sweeps left-to-right on line 1, right-to-left on line 2. Slightly faster carriage return time, but can cause dark/light alternating line artifacts on worn ribbons/heads. |

---

### 6. `ESC, 0x4D` / `ESC, 0x50` / `ESC, 0x67` — Character Pitch & Width (CPI)

Sets character horizontal density (Characters Per Inch) and line capacity.

| Command / Hex | ASCII | Characters Per Inch (CPI) | Line Capacity (3" Roll / 8" Page) | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| `0x1B, 0x50` | `ESC P` | **10 CPI (Pica)** | ~32-36 cols / 80 cols | Large bold headings / wide text. |
| `0x1B, 0x4D` | `ESC M` | **12 CPI (Elite) (Current)** | ~40-42 cols / 96 cols | **Standard compact receipt format**. |
| `0x1B, 0x67` | `ESC g` | **15 CPI** | ~50 cols / 120 cols | Micro text / wide table columns. |
| `0x0F` | `SI` (`Ctrl+O`) | **Condensed Mode ON** | ~17.1 CPI (~132 cols) | Printing 132-column wide reports. |
| `0x12` | `DC2` (`Ctrl+R`)| **Condensed Mode OFF** | Restores 10/12 CPI | Cancels condensed mode. |
| `0x1B, 0x57, 0x01` | `ESC W 1` | **Double-Width ON** | 2x horizontal size | Large bill headers / totals. |
| `0x1B, 0x57, 0x00` | `ESC W 0` | **Double-Width OFF** | 1x standard size | Normal item text. |
| `0x1B, 0x70, 0x01` | `ESC p 1` | **Proportional ON** | Variable width | Decorative text. |
| `0x1B, 0x70, 0x00` | `ESC p 0` | **Proportional OFF** | Fixed pitch | Column-aligned tabular data. |

---

### 7. `ESC, 0x32` / `ESC, 0x30` / `ESC, 0x33, n` — Line Spacing

Sets vertical distance between lines.

| Command / Hex | ASCII | Spacing Value | Description & Visual Layout |
| :--- | :--- | :--- | :--- |
| `0x1B, 0x32` | `ESC 2` | **1/6 Inch (Current)** | 6 lines per inch. Standard clean receipt spacing. |
| `0x1B, 0x30` | `ESC 0` | **1/8 Inch** | 8 lines per inch. Compact spacing for short receipts. |
| `0x1B, 0x31` | `ESC 1` | **7/72 Inch** | 10.28 lines per inch. Tight spacing. |
| `0x1B, 0x41, n` | `ESC A n` | **n/60 Inch** | Custom spacing in 1/60" increments (e.g. `ESC A 10` = 1/6"). |
| `0x1B, 0x33, n` | `ESC 3 n` | **n/216 Inch** | Custom micro spacing in 1/216" or 1/180" increments. |

---

### 8. `ESC, 0x6C, n` — Left Margin (`ESC l n`)

Sets left margin offset in character column units.

| Command / Hex | ASCII / Value | Column Offset | Description |
| :--- | :--- | :--- | :--- |
| `0x1B, 0x6C, 0x00` | `ESC l 0` | **0 Columns (Current)** | Prints from absolute left edge of paper; maximizes printable width. |
| `0x1B, 0x6C, 0x02` | `ESC l 2` | **2 Columns** | Indents receipt payload by 2 character widths. |
| `0x1B, 0x6C, n` | `ESC l n` | **n Columns** | Indents receipt payload by `n` character widths (`0 <= n <= 255`). |
| `0x1B, 0x51, n` | `ESC Q n` | **Right Margin = n** | Sets right margin at column `n`. |

---

## Summary of Default Hardware Profile in RBS

The configuration below delivers **maximum print speed, uniform line density, dark crisp text, and optimal column alignment**:

```javascript
const escPrefix = Buffer.from([
  0x0D,                     // CR     — Pre-flush line
  ESC, 0x40,                // ESC @  — Hardware Reset
  ESC, 0x78, 0x00,          // ESC x 0 — Draft Mode (Max Speed)
  ESC, 0x45,                // ESC E  — Emphasized Mode (DARK Text in 1 Pass)
  ESC, 0x55, 0x01,          // ESC U 1 — Unidirectional Mode (Uniform Density, No Alternate Lines)
  ESC, 0x4D,                // ESC M  — 12 CPI (Elite Receipt Layout)
  ESC, 0x32,                // ESC 2  — 1/6-inch Line Spacing
  ESC, 0x6C, 0x00,          // ESC l 0 — 0 Margin Offset
]);

const escCleanup = Buffer.from([
  ESC, 0x45, 0x00,          // ESC E 0 — Turn OFF Emphasized Mode
  ESC, 0x55, 0x00,          // ESC U 0 — Turn OFF Unidirectional Mode (Restore Default)
  ESC, 0x40                 // ESC @   — Master Reset
]);
```
