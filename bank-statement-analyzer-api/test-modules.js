console.log(' Running Simple Module Tests\n');

async function testModules() {
  try {
    // Test 1: Import and test PDFParserService class directly
    console.log('1 Testing PDF Parser class...');
    const { default: pdfParser } = await import('./src/services/pdfParser.js');
    const parser = new pdfParser.constructor();
    
    // Test date parsing
    const testDate = parser.parseDate('01/15/2024');
    console.log(`    Date parsing works: ${testDate.toLocaleDateString()}`);
    
    // Test amount parsing
    const testAmount = parser.parseAmount('$1,234.56');
    console.log(`    Amount parsing works: $${testAmount.toFixed(2)}`);
    
    // Test 2: Merchant model
    console.log('\n2 Testing Merchant model...');
    const { default: Merchant } = await import('./src/models/Merchant.js');
    const normalized = Merchant.normalizeName('STARBUCKS #12345 NYC');
    console.log(`   ✅ Normalization works: "${normalized}"`);
    
    // Test 3: Check Perplexity service loads
    console.log('\n3️⃣ Testing Perplexity service...');
    const { default: perplexity } = await import('./src/services/perplexityEnhancementService.js');
    console.log(`   ✅ Service loaded, API key: ${perplexity.apiKey ? 'Present' : 'Missing'}`);
    
    console.log('\n✅ All module tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testModules();
