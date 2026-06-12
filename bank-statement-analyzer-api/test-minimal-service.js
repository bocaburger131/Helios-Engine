// Test minimal service without logger
const calculateVeritasScore = (analysisResults, transactions) => {
  return {
    score: 85,
    grade: 'B',
    stabilityLevel: 'Good',
    factors: ['Test calculation'],
    calculatedAt: new Date().toISOString(),
    methodology: 'Veritas v2.0 - Test Mode'
  };
};

export default {
  calculateVeritasScore
};
