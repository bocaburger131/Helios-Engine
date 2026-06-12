import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import transactionController from '../controllers/transactionController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateUser);

// Transaction routes
router.get('/', transactionController.getAllTransactions);
router.get('/statement/:statementId', transactionController.getTransactionsByStatement);
router.get('/category/:category', transactionController.getTransactionsByCategory);
router.get('/date-range', transactionController.getTransactionsByDateRange);
router.get('/search', transactionController.searchTransactions);
router.get('/analytics', transactionController.getTransactionAnalytics);
router.put('/:id/category', transactionController.updateTransactionCategory);
router.put('/:id/tags', transactionController.updateTransactionTags);
router.delete('/:id', transactionController.deleteTransaction);

export default router;
