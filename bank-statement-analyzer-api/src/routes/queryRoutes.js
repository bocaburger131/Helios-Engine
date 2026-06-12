import express from 'express';
import queryController from '../controllers/queryController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * /api/query:
 *   post:
 *     summary: Process a query
 *     tags: [Query]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: The query to process
 *     responses:
 *       200:
 *         description: Query processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/query', authenticate, queryController.processQuery);

/**
 * @swagger
 * /api/query/history:
 *   get:
 *     summary: Get query history
 *     tags: [Query]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Query history retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/history', authenticate, queryController.getHistory);

export default router;
