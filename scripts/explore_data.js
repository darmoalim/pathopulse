const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Moalim\\Desktop\\Cursor Hackthon\\pathopulse\\Data of J&K';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));

for (const file of files) {
  const fp = path.join(dir, file);
  const wb = xlsx.readFile(fp);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n--- ${file} ---`);
  console.log('Headers:', json[0]);
  console.log('Sample row:', json[1]);
  console.log('Total rows:', json.length);
}
