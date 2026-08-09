import { AppError } from '../utils/appError.js';
import { patchStatementTransactionOverride } from '../services/statementTransactionOverrideService.js';

/**
 * PATCH /api/statements/:id/transactions/:txnId
 */
export async function patchStatementTransaction(req, res, next) {
  try {
    const statementId = req.params.id;
    const txnId = req.params.txnId;
    const result = await patchStatementTransactionOverride(statementId, txnId, req.body || {});
    if (!result.ok) {
      throw new AppError(result.error || 'Override failed', result.status || 400);
    }
    res.json({
      success: true,
      data: {
        transaction: result.transaction,
        vitals: result.vitals
      }
    });
  } catch (error) {
    next(error);
  }
}

export default { patchStatementTransaction };
