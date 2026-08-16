import React, { useState } from 'react';

function ItemEntryForm({ onAddTransaction, tableNumber }) {
  const [itemCode, setItemCode] = useState('');
  const [quantity, setQuantity] = useState(1);

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddTransaction({ tableNumber, itemCode, quantity });
    setItemCode('');
    setQuantity(1);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Item Code:
        <input
          type="text"
          value={itemCode}
          onChange={(e) => setItemCode(e.target.value)}
        />
      </label>
      <label>
        Quantity:
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      <button type="submit">Add Item</button>
    </form>
  );
}

export default ItemEntryForm;
