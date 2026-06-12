const IndustryStandards = {
    // Add your industry standards here
    defaultBenchmarks: {
        workingCapitalRatio: 2.0,
        debtServiceCoverage: 1.25,
        leverageRatio: 3.0
    }
};

const standards = {
    IndustryStandards
};

export default standards;

// Add this at the end for CommonJS compatibility
if (typeof module !== 'undefined') {
  module.exports = standards;
}