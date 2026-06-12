import pdfParserService from './src/services/pdfParserService.js';

async function verify() {
  console.log('parsePDF type:', typeof pdfParserService.parsePDF);

  if (typeof pdfParserService.parsePDF !== 'function') {
    throw new Error('parsePDF is not a function on pdfParserService');
  }

  console.log('PDF parser service exposes parsePDF as expected.');
}

verify().catch((err) => {
  console.error('Verification failed:', err.message);
  process.exit(1);node scripts/generateZohoCode.js04dc193c28058bd7b662f0e22bb83319080c180c6c
});
