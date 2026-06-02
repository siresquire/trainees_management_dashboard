const XLSX = require('./node_modules/xlsx/xlsx.js');

function readAllSheets(path) {
  const wb = XLSX.readFile(path);
  const result = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    result[name] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }
  return result;
}

const uni = readAllSheets('C:/Users/AminuMohammedTwumasi/Downloads/All KCs & Labs (Learners) - Uni.xlsx');
const ext = readAllSheets('C:/Users/AminuMohammedTwumasi/Downloads/All KCs & Labs (Learners) - Ext.xlsx');

console.log('=== UNI per week ===');
for (const [sheet, rows] of Object.entries(uni)) {
  if (sheet === 'All') continue;
  const data = rows.filter(r => r.some(c => String(c).trim()));
  if (data.length) {
    console.log(`\n-- ${sheet} --`);
    data.forEach(r => console.log(JSON.stringify(r)));
  }
}

console.log('\n=== EXT per week ===');
for (const [sheet, rows] of Object.entries(ext)) {
  if (sheet === 'All') continue;
  const data = rows.filter(r => r.some(c => String(c).trim()));
  if (data.length) {
    console.log(`\n-- ${sheet} --`);
    data.forEach(r => console.log(JSON.stringify(r)));
  }
}
