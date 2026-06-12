import pdfParse from 'pdf-parse';

export async function detectBank(buffer) {
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text.toLowerCase();

    if (text.includes('chase')) return 'Chase';
    if (text.includes('bank of america')) return 'Bank of America';
    
    throw new Error('Unknown bank statement format');
}