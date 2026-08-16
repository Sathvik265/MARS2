const pool = require('../db');

const TransactionModel = {
    async createTransaction(tableNumber, partyNumber, clerkId, itemId, quantity, price) {
        const result = await pool.query(
            'INSERT INTO transactions (table_number, party_number, clerk_id, item_id, quantity, price) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [tableNumber, partyNumber, clerkId, itemId, quantity, price]
        );
        return result.rows[0];
    },
    async getTransactionsByTableAndParty(tableNumber, partyNumber) {
        const result = await pool.query(
            'SELECT * FROM transactions WHERE table_number = $1 AND party_number = $2',
            [tableNumber, partyNumber]
        );
        return result.rows;
    },
};

module.exports = TransactionModel;