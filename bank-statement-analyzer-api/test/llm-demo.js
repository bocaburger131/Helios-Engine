import llmCategorization from '../src/services/llmCategorizationService.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function interactiveDemo() {
  console.log('\n🤖 LLM Categorization Interactive Demo\n');
  console.log('Let\'s categorize some transactions!\n');
  
  // Test transactions
  const demoTransactions = [
    { description: 'STARBUCKS STORE #45678 NEW YORK', amount: -6.50 },
    { description: 'AMAZON.COM*MX7H53KL2 AMZN.COM', amount: -42.99 },
    { description: 'UNITED AIRLINES 0162345678901', amount: -456.00 },
    { description: 'DOORDASH*CHIPOTLE MEXICAN', amount: -18.75 },
    { description: 'SPOTIFY P1234567890', amount: -9.99 }
  ];
  
  // Show initial categorization
  console.log('📊 BEFORE LEARNING - Initial Categorization:\n');
  
  for (const trans of demoTransactions) {
    const result = await llmCategorization.categorizeTransaction(trans);
    console.log(`Transaction: "${trans.description}"`);
    console.log(`Amount: $${Math.abs(trans.amount)}`);
    console.log(`🤔 LLM thinks: ${result.category} (${(result.confidence * 100).toFixed(1)}% confident)`);
    console.log(`Method used: ${result.method}`);
    
    if (result.alternativeCategories.length > 0) {
      console.log(`Other possibilities: ${result.alternativeCategories.map(a => `${a.category}(${(a.confidence * 100).toFixed(1)}%)`).join(', ')}`);
    }
    console.log('---');
  }
  
  // Interactive learning
  console.log('\n\n📚 LEARNING PHASE - Teach the LLM:\n');
  
  const corrections = [
    { trans: demoTransactions[0], correct: 'Dining' },
    { trans: demoTransactions[1], correct: 'Shopping' },
    { trans: demoTransactions[2], correct: 'Transportation' },
    { trans: demoTransactions[3], correct: 'Dining' },
    { trans: demoTransactions[4], correct: 'Entertainment' }
  ];
  
  for (const { trans, correct } of corrections) {
    console.log(`\nTeaching: "${trans.description}" is actually "${correct}"`);
    await llmCategorization.learnFromTransaction(trans, correct);
    console.log(`✅ Learned!`);
  }
  
  // Show improved categorization
  console.log('\n\n🎯 AFTER LEARNING - Improved Categorization:\n');
  
  // Test with similar transactions
  const testSimilar = [
    { description: 'STARBUCKS MOBILE ORDER', amount: -5.25 },
    { description: 'AMAZON PRIME*VIDEO', amount: -14.99 },
    { description: 'UNITED AIRLINES TICKET', amount: -325.00 },
    { description: 'DOORDASH*MCDONALDS', amount: -12.50 },
    { description: 'SPOTIFY FAMILY PLAN', amount: -15.99 }
  ];
  
  for (const trans of testSimilar) {
    const result = await llmCategorization.categorizeTransaction(trans);
    console.log(`\nNEW Transaction: "${trans.description}"`);
    console.log(`🎯 LLM categorizes: ${result.category} (${(result.confidence * 100).toFixed(1)}% confident)`);
    console.log(`✨ Notice the improved confidence!`);
  }
  
  // Show fingerprints
  console.log('\n\n🔐 Privacy-Preserving Fingerprints:\n');
  console.log('Different descriptions, same merchant = same fingerprint:');
  
  const fingerprintExamples = [
    'AMAZON.COM*MX7H53KL2',
    'AMAZON.COM*AB1C23DE4',
    'AMAZON MARKETPLACE'
  ];
  
  for (const desc of fingerprintExamples) {
    const fp = llmCategorization.generateFingerprint(desc);
    console.log(`"${desc}" → ${fp}`);
  }
  
  // Performance metrics
  console.log('\n\n⚡ Performance Metrics:\n');
  const startTime = Date.now();
  
  for (let i = 0; i < 1000; i++) {
    await llmCategorization.categorizeTransaction({
      description: `TEST TRANSACTION ${i}`,
      amount: -50
    });
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`Categorized 1,000 transactions in ${elapsed}ms`);
  console.log(`Speed: ${(1000 / elapsed * 1000).toFixed(0)} transactions/second`);
  
  // Export model stats
  const model = llmCategorization.exportModel();
  console.log('\n📊 Model Statistics:');
  console.log(`Categories learned: ${model.statistics.totalCategories}`);
  console.log(`Unique merchants: ${model.statistics.totalMerchants}`);
  console.log(`Total patterns: ${model.statistics.totalPatterns}`);
  
  rl.close();
}

// Run the demo
console.clear();
interactiveDemo().catch(console.error);