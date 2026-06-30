const fs = require('fs');
const c = fs.readFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js', 'utf8');

// Find all wb function indices with precise end boundaries
const targets = [
  // Name: [startMarker, endMarker search pattern]
  { name: '__wbSubscribeWorldBoss', type: 'fn' },
  { name: '__wbQueryWorldBoss', type: 'fn' },
  { name: '__wbStartWorldBossTimer', type: 'fn' },
  { name: '__wbStopWorldBossTimer', type: 'fn' },
  { name: '__wbParseWorldBossData', type: 'fn' },
  { name: '__wbUpdateWorldBossUI', type: 'fn' },
  { name: '__wbDetectWorldBossEvt', type: 'fn' },
  { name: '__wbBossLoop', type: 'fn' },
  { name: '__wbBossAutoStart', type: 'fn' },
  { name: '__wbBossAutoStop', type: 'fn' },
  { name: '__wbToggleBypass', type: 'fn' },
  { name: '__wbUpdateBossStatus', type: 'fn' },
  { name: '__wbSyncAutoConfig', type: 'fn' },
  { name: '__wbBossStartUpdater', type: 'fn' },
  { name: '__wbLoadHuntList', type: 'fn' },
  { name: '__wbGetHuntList', type: 'fn' },
  { name: '__wbSaveHuntList', type: 'fn' },
  { name: '__wbAddToHuntList', type: 'fn' },
  { name: '__wbRemoveFromHuntList', type: 'fn' },
  { name: '__wbUpdateHuntListUI', type: 'fn' },
  { name: '__wbInitHuntToggle', type: 'fn' },
];

// Also track variable declarations and HTML
const varTargets = [
  'window.__wbWorldBossCache',
  'window.__wbBossEvtSubscribers',
  'window.__wbWorldBossEvtName',
  'window.__wbWorldBossTimer',
  'window.__wbBossAuto',
  'window.__wbBypassCD',
];

// Find each function boundary by brace counting
function findFnBoundary(fromIdx) {
  let brace = 0;
  let started = false;
  let i = fromIdx;
  while (i < c.length) {
    const ch = c[i];
    if (ch === '{') { brace++; started = true; }
    else if (ch === '}') { brace--; }
    if (started && brace === 0) return i + 1; // position after closing }
    i++;
  }
  return -1;
}

console.log('=== Function boundaries ===');
for (const t of targets) {
  const idx = c.indexOf('function ' + t.name + '(');
  if (idx === -1) { console.log(`  ${t.name}: NOT FOUND`); continue; }
  const end = findFnBoundary(idx);
  const code = c.substring(idx, end);
  const lines = code.split('\n');
  const startLine = c.substring(0, idx).split('\n').length;
  console.log(`  ${t.name} at line ${startLine}: ${lines.length} lines (${code.length} bytes) [${idx}..${end})`);
  t._start = idx;
  t._end = end;
}

console.log('\n=== Variable/init boundaries ===');
for (const v of varTargets) {
  const idx = c.indexOf(v);
  if (idx === -1) { console.log(`  ${v}: NOT FOUND`); continue; }
  const line = c.substring(0, idx).split('\n').length;
  console.log(`  ${v} at line ${line}, offset ${idx}`);
  v._idx = idx;
}

// Find socket hook IIFE
const hookIdx = c.indexOf('function installSioHook');
if (hookIdx > 0) console.log(`\ninstallSioHook at offset ${hookIdx}, line ${c.substring(0, hookIdx).split('\n').length}`);

// Find BOSS HTML template
const htmlStart = c.indexOf('__gmp_wb_list');
const htmlEnd = c.indexOf('__gmp_tab_content_monitor');
if (htmlStart > 0 && htmlEnd > 0) {
  console.log(`\nBOSS HTML block: ${htmlStart}..${htmlEnd} (${htmlEnd - htmlStart} bytes)`);
  console.log('BOSS HTML line:', c.substring(0, htmlStart).split('\n').length);
}
