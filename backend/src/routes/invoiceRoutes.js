const express = require('express');
const InvoiceController = require('../controllers/invoiceController');

const router = express.Router();

// Create a new invoice
router.post('/', InvoiceController.createInvoice);

// Get invoices for a specific table and party
router.get('/by-table-party', InvoiceController.getInvoicesByTableAndParty);

// Get all invoices
router.get('/', InvoiceController.getAllInvoices);

module.exports = router;