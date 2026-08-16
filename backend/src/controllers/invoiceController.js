const InvoiceModel = require('../models/invoiceModel');
const TransactionModel = require('../models/transactionModel');

const InvoiceController = {
    async createInvoice(req, res) {
        try {
            const { tableNumber, partyNumber, clerkId } = req.body;

            // Fetch all transactions for the given table and party
            const transactions = await TransactionModel.getTransactionsByTableAndParty(tableNumber, partyNumber);

            if (transactions.length === 0) {
                return res.status(400).json({ error: 'No transactions found for this table and party.' });
            }

            // Calculate the total amount
            const totalAmount = transactions.reduce((sum, transaction) => sum + transaction.price * transaction.quantity, 0);

            // Create the invoice
            const invoice = await InvoiceModel.createInvoice(tableNumber, partyNumber, clerkId, totalAmount);

            res.status(201).json(invoice);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    async getInvoicesByTableAndParty(req, res) {
        try {
            const { tableNumber, partyNumber } = req.query;
            const invoices = await InvoiceModel.getInvoicesByTableAndParty(tableNumber, partyNumber);
            res.status(200).json(invoices);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    async getAllInvoices(req, res) {
        try {
            const invoices = await InvoiceModel.getAllInvoices();
            res.status(200).json(invoices);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
};

module.exports = InvoiceController;