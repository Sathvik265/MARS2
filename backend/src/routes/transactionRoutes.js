const express = require('express');
const TransactionController = require('../controllers/transactionController');

const router = express.Router();

router.get('/', TransactionController.getTransactionsByTableAndParty);
router.post('/', TransactionController.createTransaction);

module.exports = router;