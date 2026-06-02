const XLSX = require('./node_modules/xlsx/xlsx.js');

function readFile(path) {
  const wb = XLSX.readFile(path);
  console.log('Sheets:', wb.SheetNames);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

const uni = readFile('C:/Users/AminuMohammedTwumasi/Downloads/All KCs & Labs (Learners) - Uni.xlsx');
const ext = readFile('C:/Users/AminuMohammedTwumasi/Downloads/All KCs & Labs (Learners) - Ext.xlsx');
console.log('=== UNI ===');
uni.forEach((r,i) => { if(r.some(c=>String(c).trim())) console.log(i, JSON.stringify(r)); });
console.log('=== EXT ===');
ext.forEach((r,i) => { if(r.some(c=>String(c).trim())) console.log(i, JSON.stringify(r)); });
