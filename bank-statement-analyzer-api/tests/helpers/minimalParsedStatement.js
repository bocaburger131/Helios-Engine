/** Minimal fields required for validateStatement structural tier in unit tests. */
export function withValidatorContext(stmt = {}) {
  return {
    accountNumber: '1234567890',
    statementDate: new Date('2024-01-15'),
    ...stmt
  };
}

export default { withValidatorContext };
