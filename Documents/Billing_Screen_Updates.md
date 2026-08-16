# Billing Screen Updates

## Date: 2026-02-11

## Summary

Refined the billing screen layout to use a strictly constrained viewport height for the items list, ensuring it fits on screen without causing the entire page to scroll.

## Changes Implemented

### 1. Viewport-Relative Item List Height

- **Items List Box**: Set to `45vh` (45% of viewport height). This specific height ensures that together with the header (~30%) and footer, the total content fits comfortably within a standard window (e.g., 768px height or greater).
- **Scroll Behavior**:
  - The items list box scrolls internally if content exceeds `45vh`.
  - No page-level scrolling occurs on standard screens.

### 2. Compact List View

- **Reduced Row Height**: Applied `!py-2` padding to rows for density.
- **Sticky Header**: Table header remains fixed at the top of the scrollable box.

### 3. Quick Actions

- **Plus Value Button**: Retained next to the Remove button.

### 4. Admin Panel Fix

- Resolved `useEffect` warning.

## Technical Details

- **Container Height**: `h-[45vh]` with `min-h-[300px]`.
- **Layout**: Removed complex flexbox dependencies on parent containers to simplify rendering logic and prevent clipping issues.

## File Modified

- `frontend/src/components/BillingScreen.js`
- `frontend/src/components/AdminPanel.js`
