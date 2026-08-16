const TransactionModel = require('../models/transactionModel');

const TransactionController = {
    async getTransactionsByTableAndParty(req, res) {
        try {
            const { tableNumber, partyNumber } = req.query;
            const transactions = await TransactionModel.getTransactionsByTableAndParty(tableNumber, partyNumber);
            res.status(200).json(transactions);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    async createTransaction(req, res) {
        try {
            const { tableNumber, partyNumber, clerkId, itemId, quantity, price } = req.body;
            const transaction = await TransactionModel.createTransaction(tableNumber, partyNumber, clerkId, itemId, quantity, price);
            res.status(201).json(transaction);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
};

module.exports = TransactionController;