const fs = require('fs');
const c = fs.readFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js', 'utf8');
const replaced = c.replace(/ver='v2\.\d+'/, "ver='v3.00'");
if (c === replaced) { console.log('No change - version regex no match'); process.exit(1); }
fs.writeFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js', replaced, 'utf8');
try { new Function(replaced); console.log('Version -> v3.00, Syntax OK, size:', replaced.length); }
catch(e) { console.log('FAIL:', e.message); process.exit(1); }
