import React, { useState, useEffect } from 'react';
import { fetchInvoicesByTableAndParty, createInvoice } from '../services/api';

function InvoiceScreen() {
  const [tableNumber, setTableNumber] = useState(1);
  const [partyNumber, setPartyNumber] = useState(1);
  const [invoices, setInvoices] = useState([]);
  const [clerkId, setClerkId] = useState(1); // Replace with actual Clerk ID from authentication

  useEffect(() => {
    loadInvoices();
  }, [tableNumber, partyNumber]);

  const loadInvoices = async () => {
    const data = await fetchInvoicesByTableAndParty(tableNumber, partyNumber);
    setInvoices(data);
  };

  const handleCreateInvoice = async () => {
    try {
      const newInvoice = await createInvoice(tableNumber, partyNumber, clerkId);
      alert(`Invoice created successfully! Invoice ID: ${newInvoice.id}`);
      loadInvoices();
    } catch (error) {
      alert('Error creating invoice: ' + error.message);
    }
  };

  return (
    <div>
      <h1>Invoice Screen</h1>
      <label>
        Table Number:
        <input
          type="number"
          value={tableNumber}
          onChange={(e) => setTableNumber(e.target.value)}
        />
      </label>
      <label>
        Party Number:
        <input
          type="number"
          value={partyNumber}
          onChange={(e) => setPartyNumber(e.target.value)}
        />
      </label>
      <button onClick={handleCreateInvoice}>Generate Invoice</button>
      <h2>Invoices</h2>
      <ul>
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            Invoice ID: {invoice.id}, Total Amount: ${invoice.total_amount}, Created At: {new Date(invoice.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default InvoiceScreen;