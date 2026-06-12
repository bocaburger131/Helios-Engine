/**
 * T-Value Calculator for statistical analysis
 */

export class TValueCalculator {
  /**
   * Calculate the t-value for a sample compared to a population
   * @param {number[]} sample - Array of values from the sample
   * @param {number} populationMean - Mean value of the population
   * @returns {number} - The calculated t-value
   */
  static calculate(sample, populationMean) {
    if (!Array.isArray(sample) || sample.length === 0) {
      throw new Error('Sample must be a non-empty array');
    }
    
    const sampleMean = sample.reduce((sum, val) => sum + val, 0) / sample.length;
    const sampleStdDev = this.standardDeviation(sample);
    
    if (sampleStdDev === 0) {
      return 0; // Avoid division by zero
    }
    
    const standardError = sampleStdDev / Math.sqrt(sample.length);
    return (sampleMean - populationMean) / standardError;
  }
  
  /**
   * Calculate the standard deviation of a sample
   * @param {number[]} values - Array of values
   * @returns {number} - The standard deviation
   */
  static standardDeviation(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }
  
  /**
   * Calculate the p-value from a t-value (2-tailed)
   * @param {number} tValue - The t-value
   * @param {number} degreesOfFreedom - Degrees of freedom (sample size - 1)
   * @returns {number} - The p-value
   */
  static pValue(tValue, degreesOfFreedom) {
    // This is a simplified approximation of the p-value calculation
    // For testing purposes only
    const absT = Math.abs(tValue);
    return Math.exp(-0.5 * absT * absT) / Math.sqrt(degreesOfFreedom);
  }
}

export default TValueCalculator;