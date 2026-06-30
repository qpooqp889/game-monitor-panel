const c = require('fs').readFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js', 'utf8');
const autoIdx = c.indexOf('__gmp_wb_auto');
const line = c.substring(0, autoIdx).split('\n').length;
// Show 200 chars before and 1000 chars after
const before = c.substring(Math.max(0, autoIdx - 200), autoIdx);
const after = c.substring(autoIdx, autoIdx + 1000);
console.log('=== line', line, '=== around __gmp_wb_auto ===');
console.log('BEFORE:', JSON.stringify(before.substring(before.length - 100)));
console.log('AFTER:', JSON.stringify(after.substring(0, 1000)));
