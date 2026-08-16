const pool = require('../db');

const InvoiceModel = {
    async createInvoice(tableNumber, partyNumber, clerkId, totalAmount) {
        const result = await pool.query(
            'INSERT INTO invoices (table_number, party_number, clerk_id, total_amount) VALUES ($1, $2, $3, $4) RETURNING *',
            [tableNumber, partyNumber, clerkId, totalAmount]
        );
        return result.rows[0];
    },
    async getInvoicesByTableAndParty(tableNumber, partyNumber) {
        const result = await pool.query(
            'SELECT * FROM invoices WHERE table_number = $1 AND party_number = $2',
            [tableNumber, partyNumber]
        );
        return result.rows;
    },
    async getAllInvoices() {
        const result = await pool.query('SELECT * FROM invoices');
        return result.rows;
    },
};

module.exports = InvoiceModel;