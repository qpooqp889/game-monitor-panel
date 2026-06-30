const fs = require('fs');
const c = fs.readFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js', 'utf8');
const lines = c.split('\n');

// Find all function declarations
const fns = [];
const re = /function\s+(__wb\w+)\s*\(/g;
let m;
while ((m = re.exec(c)) !== null) {
  // Find line number
  const line = c.substring(0, m.index).split('\n').length;
  const name = m[1];
  fns.push({ name, line, index: m.index });
}

// Print in order
console.log('=== __wb* Functions in order ===');
fns.forEach(f => console.log(`  ${f.name} at line ${f.line}`));
console.log(`\nTotal: ${fns.length} functions`);

// Also find non-__wb but related functions used by world boss
const otherFns = [];
const re2 = /function\s+(__gm(?:Export|Import)\w+)\s*\(/g;
let m2;
while ((m2 = re2.exec(c)) !== null) {
  otherFns.push({ name: m2[1], line: c.substring(0, m2.index).split('\n').length });
}
console.log('\n=== Related export/import functions ===');
otherFns.forEach(f => console.log(`  ${f.name} at line ${f.line}`));
