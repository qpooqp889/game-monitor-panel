const P = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3';
const fs = require('fs');
let wb = fs.readFileSync(P + '/wb-boss.js', 'utf8');
let gm = fs.readFileSync(P + '/game-monitor.js', 'utf8');

// Show current Start function context
var startIdx = wb.indexOf('function __wbBossAutoScriptStart');
var ctx = wb.substring(startIdx, startIdx + 650);
console.log('=== START FN CONTEXT ===');
console.log(ctx);
console.log('\n=== Has resume?', wb.indexOf('__wbLoadAutoScriptResume') > 0);
console.log('Has retryCount?', wb.indexOf('retryCount=0') > 0);

// Show current state after the replacements  
// Check if both versions exist (LF and CRLF)
var version1 = wb.indexOf("currentIdx=0;\n  window.__wbBossAutoScript.phase");
var version2 = wb.indexOf("currentIdx=0;\r\n  window.__wbBossAutoScript.phase");
console.log('\nLF version:', version1, 'CRLF version:', version2);
