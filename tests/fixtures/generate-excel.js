/**
 * generate-excel.js
 * Generates a test Excel file with realistic Israeli transaction data.
 * Usage: node tests/fixtures/generate-excel.js
 */

const path = require('path');

// Load xlsx from node_modules relative to project root
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));

const OUTPUT_PATH = path.join(__dirname, 'test-transactions.xlsx');

// Sheet name (Hebrew)
const SHEET_NAME = 'עסקאות במועד החיוב';

// Headers
const HEADERS = ['תאריך עסקה', 'שם בית העסק', 'קטגוריה', 'סכום חיוב'];

// Sample transaction rows
const ROWS = [
  ['01.01.25', 'רמי לוי',        'מזון וצריכה',           450.90],
  ['03.01.25', 'פרטנר',          'שירותי תקשורת',         89.00],
  ['05.01.25', 'סונול',          'תחבורה',                230.00],
  ['07.01.25', 'נטפליקס',        'בידור',                 53.00],
  ['10.01.25', 'כספומט',         '',                      500.00],
  ['12.01.25', 'קפה ארומה',      'מסעדות, קפה וברים',     45.00],
  ['15.01.25', 'חברת חשמל',      'שירותים',               380.00],
  ['20.01.25', 'ביגוד פוקס',     'אופנה',                 299.00],
];

function generate() {
  const wb = XLSX.utils.book_new();

  // Build worksheet data: headers + rows
  const wsData = [HEADERS, ...ROWS];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths for readability
  ws['!cols'] = [
    { wch: 14 }, // תאריך עסקה
    { wch: 20 }, // שם בית העסק
    { wch: 24 }, // קטגוריה
    { wch: 14 }, // סכום חיוב
  ];

  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

  XLSX.writeFile(wb, OUTPUT_PATH);

  console.log('');
  console.log('=== Excel Test Fixture Generated ===');
  console.log(`Output : ${OUTPUT_PATH}`);
  console.log(`Sheet  : ${SHEET_NAME}`);
  console.log(`Rows   : ${ROWS.length} transactions`);
  console.log('');
  console.log('Transactions:');
  ROWS.forEach((row, i) => {
    console.log(`  ${i + 1}. [${row[0]}] ${row[1].padEnd(16)} ${row[2].padEnd(24)} ₪${row[3]}`);
  });
  console.log('');
  console.log('Done!');
}

generate();
