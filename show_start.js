const P = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3';
const fs = require('fs');
let wb = fs.readFileSync(P + '/wb-boss.js', 'utf8');
let gm = fs.readFileSync(P + '/game-monitor.js', 'utf8');

// Find the whole Start function
var idx = wb.indexOf('function __wbBossAutoScriptStart');
var brace = 0, started = false, j = wb.indexOf('{', idx), k;
for (k = j; k < wb.length; k++) {
  if (wb[k] === '{') { brace++; started = true; }
  else if (wb[k] === '}') { brace--; }
  if (started && brace === 0) break;
}
console.log('=== FULL START FUNCTION ===');
console.log(wb.substring(idx, k+1));
