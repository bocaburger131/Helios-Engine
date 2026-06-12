import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

export async function exportToPDF(statement, analysis) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      
      // Header
      doc.fontSize(20).text('Bank Statement Analysis', 50, 50);
      doc.fontSize(12).text(`Statement ID: ${statement.id}`, 50, 80);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 50, 100);
      
      // Summary
      doc.fontSize(16).text('Summary', 50, 140);
      doc.fontSize(10);
      doc.text(`Period: ${new Date(statement.summary.period.start).toLocaleDateString()} - ${new Date(statement.summary.period.end).toLocaleDateString()}`, 50, 170);
      doc.text(`Opening Balance: $${statement.summary.openingBalance.toFixed(2)}`, 50, 190);
      doc.text(`Closing Balance: $${statement.summary.closingBalance.toFixed(2)}`, 50, 210);
      doc.text(`Total Deposits: $${statement.summary.totalDeposits.toFixed(2)}`, 50, 230);
      doc.text(`Total Withdrawals: $${statement.summary.totalWithdrawals.toFixed(2)}`, 50, 250);
      
      // Category Breakdown
      doc.fontSize(16).text('Category Breakdown', 50, 290);
      doc.fontSize(10);
      let yPos = 320;
      
      Object.entries(analysis.categories || {}).forEach(([category, amount]) => {
        doc.text(`${category}: $${amount.toFixed(2)}`, 50, yPos);
        yPos += 20;
      });
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function exportToExcel(statement, analysis) {
  const workbook = new ExcelJS.Workbook();
  
  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 }
  ];
  
  summarySheet.addRows([
    { metric: 'Statement ID', value: statement.id },
    { metric: 'Upload Date', value: new Date(statement.uploadDate).toLocaleDateString() },
    { metric: 'Period Start', value: new Date(statement.summary.period.start).toLocaleDateString() },
    { metric: 'Period End', value: new Date(statement.summary.period.end).toLocaleDateString() },
    { metric: 'Opening Balance', value: `$${statement.summary.openingBalance.toFixed(2)}` },
    { metric: 'Closing Balance', value: `$${statement.summary.closingBalance.toFixed(2)}` },
    { metric: 'Total Deposits', value: `$${statement.summary.totalDeposits.toFixed(2)}` },
    { metric: 'Total Withdrawals', value: `$${statement.summary.totalWithdrawals.toFixed(2)}` }
  ]);
  
  // Transactions Sheet
  const transactionsSheet = workbook.addWorksheet('Transactions');
  transactionsSheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Balance', key: 'balance', width: 15 },
    { header: 'Category', key: 'category', width: 20 }
  ];
  
  statement.parsedData.transactions.forEach(transaction => {
    transactionsSheet.addRow({
      date: new Date(transaction.date).toLocaleDateString(),
      description: transaction.description,
      amount: transaction.amount,
      balance: transaction.balance,
      category: transaction.category || 'Other'
    });
  });
  
  // Apply number formatting
  transactionsSheet.getColumn('amount').numFmt = '$#,##0.00;[Red]-$#,##0.00';
  transactionsSheet.getColumn('balance').numFmt = '$#,##0.00';
  
  // Style the headers
  [summarySheet, transactionsSheet].forEach(sheet => {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
  });
  
  return await workbook.xlsx.writeBuffer();
}