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
import { updateMenuItem } from "../services/api";
import { API, toast, safeGet, safeArray } from "../utils/helpers";

export default function FoodMenu({ mode }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
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
                <Input
                  value={editingItem.category}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, category: e.target.value })
                  }
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
        <CardTitle>Food Menu ({items.length} items)</CardTitle>
        <div className="mt-2">
          <Input
            ref={searchInputRef}
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
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
                    <Input
                      name="category"
                      placeholder="e.g., South Indian"
                      value={newItem.category}
                      onChange={handleNewItemChange}
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
                      {(() => {
                        const raw = safeGet(item, "category");
                        if (!raw) return "-";

                        let display = String(raw);

                        if (typeof raw === "object") {
                          if (Array.isArray(raw) && raw.length > 0) {
                            display =
                              raw[0].name || raw[0].item_name || display;
                          } else if (!Array.isArray(raw)) {
                            display = raw.name || raw.item_name || display;
                          }
                        } else if (typeof raw === "string") {
                          try {
                            if (
                              raw.trim().startsWith("[") ||
                              raw.trim().startsWith("{")
                            ) {
                              const parsed = JSON.parse(raw);
                              if (Array.isArray(parsed) && parsed.length > 0) {
                                display =
                                  parsed[0].name ||
                                  parsed[0].item_name ||
                                  display;
                              } else if (parsed && typeof parsed === "object") {
                                display =
                                  parsed.name || parsed.item_name || display;
                              }
                            }
                          } catch (e) {
                            const match = raw.match(
                              /["']name["']\s*:\s*["']([^"']+)["']/i,
                            );
                            if (match && match[1]) display = match[1];
                          }
                        }

                        if (
                          display.startsWith("[") &&
                          display.includes("name")
                        ) {
                          const match = display.match(
                            /["']name["']\s*:\s*["']([^"']+)["']/i,
                          );
                          if (match && match[1]) display = match[1];
                        }

                        return display;
                      })()}
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
                                category: safeGet(item, "category", ""),
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
      </CardContent>
    </Card>
  );
}
