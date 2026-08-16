import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Button,
  Label,
  Loader2,
} from "./ui/UIComponents";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/Table";
import { updateMenuItem, bulkUpdateMenuItems } from "../services/api";
import { API, toast, safeGet, safeArray, getCategoryName } from "../utils/helpers";
import * as XLSX from "xlsx";

function CategorySelector({ value, onChange, existingCategories }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const wrapperRef = React.useRef(null);

  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = existingCategories.filter((cat) =>
    cat.toLowerCase().includes(search.toLowerCase())
  );

  const showCreateOption = search.trim() !== "" && !existingCategories.some(
    (cat) => cat.toLowerCase() === search.trim().toLowerCase()
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Input
        value={search}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          const val = e.target.value;
          setSearch(val);
          onChange(val);
          setIsOpen(true);
        }}
        placeholder="Type or select category..."
        className="w-full text-black"
      />
      {isOpen && (filtered.length > 0 || showCreateOption) && (
        <div 
          className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg divide-y divide-gray-100"
          style={{ zIndex: 99999999 }}
        >
          {filtered.map((cat) => (
            <div
              key={cat}
              className="px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 cursor-pointer font-medium text-left"
              onClick={() => {
                onChange(cat);
                setSearch(cat);
                setIsOpen(false);
              }}
            >
              📁 {cat}
            </div>
          ))}
          {showCreateOption && (
            <div
              className="px-3 py-2 text-sm text-green-600 hover:bg-green-50 cursor-pointer font-semibold flex items-center gap-1 text-left"
              onClick={() => {
                onChange(search.trim());
                setIsOpen(false);
              }}
            >
              <span>➕ Create new category:</span>
              <span className="text-gray-900 underline">"{search.trim()}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FoodMenu({ mode }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const existingCategories = React.useMemo(() => {
    const cats = new Set();
    items.forEach((item) => {
      const catName = getCategoryName(safeGet(item, "category"));
      if (catName) {
        cats.add(catName);
      }
    });
    return Array.from(cats);
  }, [items]);
  const [newItem, setNewItem] = useState({
    name: "",
    alpha_code: "",
    numeric_code: "",
    price_fixed: "",
    price_general: "",
    price_ac: "",
    category: "",
    quantity: "", // Logic added to support quantity
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkUpdateStatus, setBulkUpdateStatus] = useState("");
  const [bulkUpdateErrorMsg, setBulkUpdateErrorMsg] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const searchInputRef = React.useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.code === "KeyF")) ||
        ((e.altKey || e.metaKey) && e.key.toLowerCase() === "s")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/menu`);
      setItems(safeArray(res.data));
    } catch (e) {
      console.error("Menu load error:", e);
      toast.error("Failed to load menu");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const [editingItem, setEditingItem] = useState(null);
  const saveEditedItem = async () => {
    if (!editingItem) return;
    try {
      const payload = {
        name: editingItem.name,
        alpha_code: editingItem.alpha_code,
        numeric_code: editingItem.numeric_code,
        price_fixed: editingItem.price_fixed,
        price_general: editingItem.price_general,
        price_ac: editingItem.price_ac,
        category: editingItem.category,
        is_separate: editingItem.is_separate || false,
      };
      await updateMenuItem(editingItem.id, payload);
      toast.success("Item updated");
      setEditingItem(null);
      load();
    } catch (e) {
      console.error("Failed to update item:", e);
      let userMessage = "Failed to update item";
      if (e?.response) {
        try {
          const status = e.response.status;
          const data = e.response.data;
          userMessage =
            (data && data.detail) ||
            (data && JSON.stringify(data)) ||
            `${e.message} (status ${status})`;
        } catch (inner) {
          userMessage = e.message;
        }
      } else {
        userMessage = e.message || userMessage;
      }
      toast.error(userMessage);
    }
  };

  const renderEditModal = () => {
    if (!editingItem) return null;

    const overlayStyle = {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2147483647,
      padding: 12,
    };

    const cardStyle = {
      maxWidth: 560,
      width: "100%",
      zIndex: 2147483648,
    };

    const modal = (
      <div style={overlayStyle} aria-modal="true" role="dialog">
        <Card style={cardStyle}>
          <CardHeader>
            <CardTitle>Edit Item</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <Label>Name</Label>
                <Input
                  value={editingItem.name}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Alpha Code</Label>
                <Input
                  value={editingItem.alpha_code}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      alpha_code: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>Numeric Code</Label>
                <Input
                  value={editingItem.numeric_code}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      numeric_code: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>Fixed Price</Label>
                <Input
                  type="number"
                  value={editingItem.price_fixed}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      price_fixed: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>General Price</Label>
                <Input
                  type="number"
                  value={editingItem.price_general}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      price_general: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>AC Price</Label>
                <Input
                  type="number"
                  value={editingItem.price_ac}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      price_ac: e.target.value,
                    })
                  }
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editingItem.is_separate || false}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      is_separate: e.target.checked,
                    })
                  }
                  id="edit_is_separate"
                />
                <Label htmlFor="edit_is_separate">Is Separate?</Label>
              </div>
              <div>
                <Label>Category</Label>
                <CategorySelector
                  value={editingItem.category}
                  onChange={(val) =>
                    setEditingItem({ ...editingItem, category: val })
                  }
                  existingCategories={existingCategories}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={saveEditedItem}>Save</Button>
                <Button variant="outline" onClick={() => setEditingItem(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );

    return ReactDOM.createPortal(modal, document.body);
  };

  const validateField = (name, value) => {
    const errors = {};

    if (name === "name") {
      if (!value || !value.trim()) {
        errors.name = "Item name is required";
      }
    }

    if (name === "alpha_code" && value) {
      const alphaCode = value.trim().toUpperCase();
      if (!/^[A-Z]{0,3}$/.test(alphaCode)) {
        errors.alpha_code = "Only letters allowed (max 3)";
      } else if (alphaCode.length > 0 && alphaCode.length < 3) {
        errors.alpha_code = "Must be exactly 3 letters";
      } else if (
        alphaCode.length === 3 &&
        items.some((item) => item.alpha_code === alphaCode)
      ) {
        errors.alpha_code = `"${alphaCode}" already exists`;
      }
    }

    if (name === "numeric_code" && value) {
      const numericCode = value.trim();
      if (!/^\d{0,3}$/.test(numericCode)) {
        errors.numeric_code = "Only digits allowed (max 3)";
      } else if (numericCode.length > 0 && numericCode.length < 3) {
        errors.numeric_code = "Must be exactly 3 digits";
      } else if (
        numericCode.length === 3 &&
        items.some((item) => item.numeric_code === parseInt(numericCode))
      ) {
        errors.numeric_code = `"${numericCode}" already exists`;
      }
    }

    return errors;
  };

  const handleNewItemChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Handle checkbox vs text input
    const newValue = type === "checkbox" ? checked : value;

    // Update the value
    setNewItem((prev) => ({ ...prev, [name]: newValue }));

    // Validate the field
    const fieldErrors = validateField(name, value);
    setValidationErrors((prev) => ({
      ...prev,
      ...fieldErrors,
      // Clear error if field is now valid
      [name]: fieldErrors[name] || undefined,
    }));
  };

  const handleAddItem = async () => {
    // Check if there are any validation errors
    const hasErrors = Object.values(validationErrors).some((error) => error);
    if (hasErrors) {
      toast.error("Please fix validation errors before submitting");
      return;
    }

    // Validation
    const errors = [];

    // Name is required
    if (!newItem.name || !newItem.name.trim()) {
      errors.push("Item name is required");
    }

    // At least one code is required
    if (!newItem.alpha_code && !newItem.numeric_code) {
      errors.push("At least one code (Alpha or Numeric) is required");
    }

    // Alpha code validation: must be exactly 3 letters
    if (newItem.alpha_code) {
      const alphaCode = newItem.alpha_code.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(alphaCode)) {
        errors.push("Alpha code must be exactly 3 letters (e.g., DSA, TEA)");
      }
      // Check if alpha code already exists
      if (items.some((item) => item.alpha_code === alphaCode)) {
        errors.push(`Alpha code "${alphaCode}" already exists`);
      }
    }

    // Numeric code validation: must be exactly 3 digits
    if (newItem.numeric_code) {
      const numericCode = newItem.numeric_code.trim();
      if (!/^\d{3}$/.test(numericCode)) {
        errors.push("Numeric code must be exactly 3 digits (e.g., 101, 204)");
      }
      // Check if numeric code already exists
      if (items.some((item) => item.numeric_code === parseInt(numericCode))) {
        errors.push(`Numeric code "${numericCode}" already exists`);
      }
    }

    // Show all errors
    if (errors.length > 0) {
      toast.error(errors.join(". "));
      return;
    }

    try {
      await axios.post(`${API}/menu`, {
        name: newItem.name.trim(),
        alpha_code: newItem.alpha_code?.trim().toUpperCase() || null,
        numeric_code: newItem.numeric_code?.trim() || null,
        price_fixed: parseFloat(newItem.price_fixed) || 0,
        price_general: parseFloat(newItem.price_general) || 0,
        price_ac: parseFloat(newItem.price_ac) || 0,
        category: {
          qty: parseInt(newItem.quantity) || 1, // Use user input or default to 1
          name: newItem.category?.trim() || "",
        },
        is_separate: newItem.is_separate || false,
      });

      toast.success("Item added successfully");
      setNewItem({
        name: "",
        alpha_code: "",
        numeric_code: "",
        price_fixed: "",
        price_general: "",
        price_ac: "",
        category: "",
        quantity: "",
      });
      setValidationErrors({}); // Clear validation errors
      setShowAddForm(false); // Hide form after adding
      load();
    } catch (e) {
      console.error("Add item error:", e);
      toast.error(safeGet(e, "response.data.detail", "Failed to add item"));
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm("Are you sure you want to delete this item?")) {
      return;
    }

    try {
      await axios.delete(`${API}/menu/${itemId}`);
      toast.success("Item deleted successfully");
      load();
    } catch (e) {
      console.error("Delete item error:", e);
      toast.error(safeGet(e, "response.data.detail", "Failed to delete item"));
    }
  };

  const handleBulkUpdate = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm(`Are you sure you want to perform bulk update using "${file.name}"?`)) {
      e.target.value = "";
      return;
    }

    setBulkUpdating(true);
    setBulkUpdateStatus("Reading file...");
    setBulkUpdateErrorMsg("");

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rows.length < 2) {
          throw new Error("The selected file is empty or missing data rows.");
        }

        setBulkUpdateStatus("Parsing spreadsheet rows...");

        const headers = rows[0].map(h => String(h || "").trim());
        const nameIdx = headers.findIndex(h => h.toLowerCase() === "item name" || h.toLowerCase() === "name");
        const alphaIdx = headers.findIndex(h => h.toLowerCase() === "alpha code" || h.toLowerCase() === "code");
        const numericIdx = headers.findIndex(h => h.toLowerCase() === "numeric code");
        const priceFixedIdx = headers.findIndex(h => h.toLowerCase() === "fixed price");
        const priceGenIdx = headers.findIndex(h => h.toLowerCase() === "general price");
        const priceAcIdx = headers.findIndex(h => h.toLowerCase() === "ac price");

        if (nameIdx === -1 || (alphaIdx === -1 && numericIdx === -1)) {
          throw new Error("Excel must contain 'Item Name' and at least one code column ('Alpha Code' or 'Numeric Code')");
        }

        const parsedItems = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0 || row.every(cell => cell === null || cell === undefined || cell === "")) {
            continue;
          }

          const name = row[nameIdx] ? String(row[nameIdx]).trim() : "";
          if (!name) continue;

          const alphaCode = alphaIdx !== -1 && row[alphaIdx] ? String(row[alphaIdx]).trim().toUpperCase() : null;
          const numericCode = numericIdx !== -1 && row[numericIdx] ? String(row[numericIdx]).trim() : null;

          if (!alphaCode && !numericCode) continue;

          const priceFixed = priceFixedIdx !== -1 && row[priceFixedIdx] ? parseFloat(row[priceFixedIdx]) : 0;
          const priceGeneral = priceGenIdx !== -1 && row[priceGenIdx] ? parseFloat(row[priceGenIdx]) : 0;
          const priceAc = priceAcIdx !== -1 && row[priceAcIdx] ? parseFloat(row[priceAcIdx]) : 0;

          parsedItems.push({
            name,
            alpha_code: alphaCode,
            numeric_code: numericCode,
            price_fixed: isNaN(priceFixed) ? 0 : priceFixed,
            price_general: isNaN(priceGeneral) ? 0 : priceGeneral,
            price_ac: isNaN(priceAc) ? 0 : priceAc
          });
        }

        if (parsedItems.length === 0) {
          throw new Error("No valid items found in the file.");
        }

        setBulkUpdateStatus(`Uploading ${parsedItems.length} items to database...`);
        const res = await bulkUpdateMenuItems(parsedItems);
        
        setBulkUpdateStatus("SUCCESS");
        toast.success(res.message || `Successfully processed ${res.count} items!`);
        load();
        setTimeout(() => {
          setBulkUpdating(false);
        }, 1500);
      } catch (err) {
        console.error("Bulk update parsing error:", err);
        setBulkUpdateStatus("FAILED");
        const errMsg = err?.response?.data?.detail || err?.response?.data?.error || err.message || "Unknown error";
        setBulkUpdateErrorMsg(errMsg);
        alert("Bulk Update Failed: " + errMsg);
      } finally {
        e.target.value = "";
      }
    };

    reader.readAsBinaryString(file);
  };

  const renderBulkUpdateModal = () => {
    if (!bulkUpdating) return null;

    const overlayStyle = {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.75)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2147483647,
      padding: 16,
    };

    const modalStyle = {
      maxWidth: 400,
      width: "100%",
      background: "#1c1c1e",
      border: "1px solid #2a2a2e",
      borderRadius: "0.85rem",
      padding: 24,
      textAlign: "center",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      color: "white"
    };

    const modal = (
      <div style={overlayStyle}>
        <div style={modalStyle} className="space-y-4">
          <h3 className="text-xl font-bold text-white mb-2">📥 Bulk Updating Menu</h3>
          <div className="flex flex-col items-center justify-center space-y-4">
            {bulkUpdateStatus !== "SUCCESS" && bulkUpdateStatus !== "FAILED" ? (
              <>
                <div className="animate-spin text-blue-500 text-3xl">↻</div>
                <p className="text-gray-300 font-semibold">{bulkUpdateStatus}</p>
                <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mt-2">
                  <div className="bg-blue-600 h-full animate-pulse" style={{ width: "80%" }} />
                </div>
              </>
            ) : bulkUpdateStatus === "SUCCESS" ? (
              <>
                <div className="text-green-500 text-4xl font-bold">✓</div>
                <p className="text-green-400 font-bold text-lg">Bulk Update Successful!</p>
              </>
            ) : (
              <>
                <div className="text-red-500 text-4xl font-bold text-center">✗</div>
                <p className="text-red-400 font-bold text-lg">Bulk Update Failed</p>
                <p className="text-sm text-gray-400 max-h-32 overflow-y-auto w-full text-left bg-gray-900 p-2 rounded">{bulkUpdateErrorMsg}</p>
                <Button onClick={() => setBulkUpdating(false)} className="mt-4 bg-red-600 hover:bg-red-700 text-white border-none font-semibold w-full">
                  Close
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );

    return ReactDOM.createPortal(modal, document.body);
  };

  // Filter items based on searchTerm
  const filteredItems = items.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      (item.name || "").toLowerCase().includes(term) ||
      (item.alpha_code || "").toLowerCase().includes(term) ||
      (item.numeric_code || "").toString().includes(term) ||
      (item.category || "").toString().toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Loader2 size={24} className="mb-2" />
          <span>Loading menu...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle>Food Menu ({items.length} items)</CardTitle>
            <div className="mt-2 flex items-center gap-3">
              <Input
                ref={searchInputRef}
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              {mode === "admin-full" && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => document.getElementById("bulk-update-file-input").click()}
                    variant="outline"
                    className="bg-blue-600 hover:bg-blue-700 text-white border-none font-semibold transition-all h-10 px-4 flex items-center gap-2"
                  >
                    📥 Bulk Update (Excel)
                  </Button>
                  <input
                    type="file"
                    id="bulk-update-file-input"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleBulkUpdate}
                    style={{ display: "none" }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mode === "admin-full" && (
          <div className="mb-6">
            {!showAddForm ? (
              <Button onClick={() => setShowAddForm(true)} className="w-full">
                + Add New Item
              </Button>
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-lg">Add New Item</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setValidationErrors({});
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Item Name *</Label>
                    <Input
                      name="name"
                      placeholder="e.g., Dosa Plain"
                      value={newItem.name}
                      onChange={handleNewItemChange}
                      className={validationErrors.name ? "border-red-500" : ""}
                    />
                    {validationErrors.name && (
                      <p className="text-red-500 text-xs mt-1">
                        {validationErrors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Alpha Code</Label>
                    <Input
                      name="alpha_code"
                      placeholder="e.g., DSA"
                      value={newItem.alpha_code}
                      onChange={handleNewItemChange}
                      maxLength={3}
                      className={
                        validationErrors.alpha_code ? "border-red-500" : ""
                      }
                    />
                    {validationErrors.alpha_code && (
                      <p className="text-red-500 text-xs mt-1">
                        {validationErrors.alpha_code}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Numeric Code *</Label>
                    <Input
                      name="numeric_code"
                      placeholder="e.g., 204"
                      value={newItem.numeric_code}
                      onChange={handleNewItemChange}
                      maxLength={3}
                      className={
                        validationErrors.numeric_code ? "border-red-500" : ""
                      }
                    />
                    {validationErrors.numeric_code && (
                      <p className="text-red-500 text-xs mt-1">
                        {validationErrors.numeric_code}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Category</Label>
                    <CategorySelector
                      value={newItem.category}
                      onChange={(val) =>
                        setNewItem((prev) => ({ ...prev, category: val }))
                      }
                      existingCategories={existingCategories}
                    />
                  </div>
                  <div>
                    <Label>Category Qty (optional)</Label>
                    <Input
                      name="quantity"
                      type="number"
                      min="1"
                      placeholder="1"
                      value={newItem.quantity}
                      onChange={handleNewItemChange}
                    />
                    <p className="text-gray-500 text-xs mt-1">Default: 1</p>
                  </div>
                  <div>
                    <Label>Fixed Price</Label>
                    <Input
                      name="price_fixed"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newItem.price_fixed}
                      onChange={handleNewItemChange}
                    />
                  </div>
                  <div>
                    <Label>General Price</Label>
                    <Input
                      name="price_general"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newItem.price_general}
                      onChange={handleNewItemChange}
                    />
                  </div>
                  <div>
                    <Label>AC Price</Label>
                    <Input
                      name="price_ac"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newItem.price_ac}
                      onChange={handleNewItemChange}
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-8">
                    <input
                      type="checkbox"
                      id="is_separate"
                      name="is_separate"
                      checked={newItem.is_separate || false}
                      onChange={handleNewItemChange}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="is_separate">Is Separate?</Label>
                  </div>
                </div>
                <Button onClick={handleAddItem} className="w-full">
                  Add Item
                </Button>
              </div>
            )}
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm
              ? `No items found matching "${searchTerm}"`
              : "No menu items found."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Alpha Code</TableHead>
                <TableHead>Numeric Code</TableHead>
                <TableHead>Fixed Price</TableHead>
                <TableHead>General Price</TableHead>
                <TableHead>AC Price</TableHead>
                <TableHead>Category</TableHead>
                {mode === "admin-full" && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => {
                const safeRender = (val, def = "-") => {
                  if (val === null || val === undefined) return def;
                  if (typeof val === "object") {
                    return val.name || val.item_name || JSON.stringify(val);
                  }
                  return val;
                };

                return (
                  <TableRow key={safeGet(item, "id", Math.random())}>
                    <TableCell>
                      {safeRender(safeGet(item, "name"), "N/A")}
                    </TableCell>
                    <TableCell>
                      {safeRender(safeGet(item, "alpha_code"), "-")}
                    </TableCell>
                    <TableCell>
                      {safeRender(safeGet(item, "numeric_code"), "-")}
                    </TableCell>
                    <TableCell>
                      {Number(safeGet(item, "price_fixed", 0)).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {Number(safeGet(item, "price_general", 0)).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {Number(safeGet(item, "price_ac", 0)).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {getCategoryName(safeGet(item, "category")) || "-"}
                    </TableCell>
                    {mode === "admin-full" && (
                      <TableCell>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingItem({
                                id: safeGet(item, "id"),
                                name: safeGet(item, "name", ""),
                                alpha_code: safeGet(item, "alpha_code", ""),
                                numeric_code: safeGet(item, "numeric_code", ""),
                                price_fixed: safeGet(item, "price_fixed", 0),
                                price_general: safeGet(
                                  item,
                                  "price_general",
                                  0,
                                ),
                                price_ac: safeGet(item, "price_ac", 0),
                                category: getCategoryName(safeGet(item, "category")),
                                is_separate: safeGet(
                                  item,
                                  "is_separate",
                                  false,
                                ),
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              handleDeleteItem(safeGet(item, "id"))
                            }
                          >
                            X
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {renderEditModal()}
        {renderBulkUpdateModal()}
      </CardContent>
    </Card>
  );
}
