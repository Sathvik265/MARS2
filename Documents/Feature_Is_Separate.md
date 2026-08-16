# Food Menu - Is Separate Checkbox Feature

## Date: 2026-02-11

## Summary

Implemented the ability to check/uncheck `is_separate` for menu items during both creation (Add Item) and editing (Edit Item).

## Changes Implemented

### 1. Backend Updates (`backend/src/app.js`)

- **POST /api/menu**: Updated to accept `is_separate` field from the request body and insert it into the `items` table. Default is `false`.
- **PUT /api/menu/:id**: Updated to accept `is_separate` field and update the `items` table.

### 2. Frontend Updates (`frontend/src/components/FoodMenu.js`)

- **Add Item Form**:
  - Added a checkbox "Is Separate?" to the form.
  - Updated `handleNewItemChange` to correctly handle checkbox inputs (using `checked` instead of `value`).
  - Updated `handleAddItem` to include `is_separate` in the API payload.

- **Edit Item Modal**:
  - Added a "Is Separate?" checkbox to the Edit modal.
  - Updated `setEditingItem` to populate the checkbox state from the existing item data.
  - Updated `saveEditedItem` to include `is_separate` in the update API payload.

## How to Test

1.  **Add New Item**:
    - Go to "Food Menu" tab.
    - Click "+ Add New Item".
    - Fill in details for a new item.
    - Check the "Is Separate?" checkbox.
    - Click "Add Item".
    - Verify in the database (or via behavior) that the item has `is_separate = true`.

2.  **Edit Existing Item**:
    - Click "Edit" on an existing item.
    - Toggle the "Is Separate?" checkbox.
    - Click "Save".
    - Refresh the page and check "Edit" again to ensure the state persisted.

## Notes

- The `is_separate` field defaults to `false` if not specified.
- The checkbox handles boolean values directly.
