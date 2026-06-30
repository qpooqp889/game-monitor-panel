const c = require('fs').readFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js', 'utf8');
// Find 'case 'boss''
const idx1 = c.indexOf("case 'boss'");
const idx2 = c.indexOf('case "boss"');
const idx = Math.min(idx1 >= 0 ? idx1 : Infinity, idx2 >= 0 ? idx2 : Infinity);
if (idx < Infinity) {
  const line = c.substring(0, idx).split('\n').length;
  console.log('boss case at line', line);
  console.log(c.substring(idx, idx + 3000));
} else {
  console.log('NOT FOUND as switch case. Searching for buildBossTab or boss HTML...');
  // Try buildBoss functions
  ['__gmp_wb_list', '__gmp_wb_count', '__gmp_wb_timer', '__gmp_wb_auto', '__gmp_wb_evt_name'].forEach(id => {
    const p = c.indexOf(id);
    if (p > 0) console.log(`${id} at line ${c.substring(0, p).split('\n').length}`);
  });
}
