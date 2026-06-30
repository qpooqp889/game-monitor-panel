const fs = require('fs');
const p = 'C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js';
let c = fs.readFileSync(p, 'utf8');

// ==============================
// PASS 1: Extract all WB code
// ==============================

// Helper to find function end (brace counting)
function findFnEnd(fromIdx) {
  let brace = 0, started = false, i = fromIdx;
  while (i < c.length) {
    if (c[i] === '{') { brace++; started = true; }
    else if (c[i] === '}') { brace--; }
    if (started && brace === 0) return i + 1;
    i++;
  }
  return -1;
}

// Collect all WB extractions: [{ name, code, start, end }]
const extractions = [];

// Group 1: var/init blocks
const varBlocks = [
  { key: 'window.__wbWorldBossCache', end: null },
  { key: 'window.__wbBossEvtSubscribers', end: null },
  { key: 'window.__wbWorldBossEvtName', end: null },
  { key: 'window.__wbWorldBossTimer', end: null },
  { key: 'window.__wbBossAuto', end: null },
  { key: 'window.__wbBypassCD', end: null },
];

// Find WB variable init block - from first WB var to the comment before subscribe
const firstVarIdx = c.indexOf('window.__wbWorldBossCache');
// Find the line start and extend to the comment before __wbSubscribeWorldBoss
const beforeSubscribe = c.lastIndexOf('// 訂閱特定世界王事件', firstVarIdx);
const varBlockStart = c.lastIndexOf('\n', beforeSubscribe - 2) + 1;
const varBlockEnd = c.indexOf('function __wbSubscribeWorldBoss');
// The var block + comment lines
const varBlockCode = c.substring(varBlockStart, varBlockEnd);
const varBlockLine = c.substring(0, varBlockStart).split('\n').length;
console.log(`Var/init block: line ${varBlockLine}, ${varBlockCode.length} bytes [${varBlockStart}..${varBlockEnd})`);

// Group 2: All function definitions
const fnNames = [
  '__wbSubscribeWorldBoss', '__wbQueryWorldBoss',
  '__wbStartWorldBossTimer', '__wbStopWorldBossTimer',
  '__wbParseWorldBossData', '__wbUpdateWorldBossUI',
  '__wbDetectWorldBossEvt',
  '__wbBossLoop', '__wbBossAutoStart', '__wbBossAutoStop', '__wbToggleBypass',
  '__wbUpdateBossStatus', '__wbSyncAutoConfig', '__wbBossStartUpdater',
  '__wbLoadHuntList', '__wbGetHuntList', '__wbSaveHuntList',
  '__wbAddToHuntList', '__wbRemoveFromHuntList', '__wbUpdateHuntListUI', '__wbInitHuntToggle',
];

const fns = [];
for (const name of fnNames) {
  const idx = c.indexOf('function ' + name + '(');
  if (idx === -1) { console.log(`  SKIP ${name}: not found`); continue; }
  const end = findFnEnd(idx);
  // Also grab preceding comment
  const commentStart = c.lastIndexOf('\n//', idx);
  const codeStart = (commentStart > idx - 200 && commentStart > 0) ? commentStart : idx;
  const code = c.substring(codeStart, end);
  const line = c.substring(0, codeStart).split('\n').length;
  fns.push({ name, code, start: codeStart, end, line });
  console.log(`  ${name}: line ${line}, ${code.length} bytes [${codeStart}..${end})`);
}

// Also grab the setTimeout auto-detect block (lines ~315-331)
const detectBlockStart = c.indexOf('// 初次啟動偵測', varBlockEnd);
const detectBlockEnd = c.indexOf('// ====== Boss Auto ======', varBlockStart);
const detectBlock = c.substring(detectBlockStart, detectBlockEnd);
const detectBlockLine = c.substring(0, detectBlockStart).split('\n').length;
console.log(`\nDetect block: line ${detectBlockLine}, ${detectBlock.length} bytes [${detectBlockStart}..${detectBlockEnd})`);

// Also grab the 5 helper functions near the top
const helpersStart = c.indexOf('function __wbSend(action)', varBlockEnd);
const helpersEnd = c.indexOf('// ====== World Boss 監控 ======', varBlockStart);
const helpersCode = c.substring(helpersStart, helpersEnd);
console.log(`Helpers: ${helpersCode.length} bytes [${helpersStart}..${helpersEnd})`);

// The socket hook IIFE
const hookStart = c.indexOf('// ====== WB Boss Hook ======');
const hookEnd = c.indexOf('function __wbSend(action)', hookStart);
const hookCode = c.substring(hookStart, hookEnd);
console.log(`Socket hook: ${hookCode.length} bytes [${hookStart}..${hookEnd})`);

// ==============================
// PASS 2: Build wb-boss.js
// ==============================
const wbBossParts = [
  '// ====== wb-boss.js - World Boss Module (extracted from game-monitor.js v2.30) ======',
  '',
  '(function(){',
  'if(window.__wbModuleLoaded){console.log("[WB] Module already loaded");return;}',
  'window.__wbModuleLoaded=true;',
  '',
  '// === Socket Hook (需先於 helper functions 執行) ===',
  hookCode,
  '',
  '// === Helper Functions ===',
  helpersCode,
  '',
  '// === Variable/Init Block ===',
  varBlockCode,
  '',
  '// === Function Definitions (Group 1: UI, Timer, Boss Auto) ===',
  ...fns.filter(f =>
    !['__wbUpdateBossStatus', '__wbSyncAutoConfig', '__wbBossStartUpdater',
      '__wbLoadHuntList', '__wbGetHuntList', '__wbSaveHuntList',
      '__wbAddToHuntList', '__wbRemoveFromHuntList', '__wbUpdateHuntListUI', '__wbInitHuntToggle']
    .includes(f.name)
  ).map(f => f.code + '\n'),
  '',
  '// === Detect Block ===',
  detectBlock,
  '',
  '// === Function Definitions (Group 2: Boss Status Updaters) ===',
  ...fns.filter(f =>
    ['__wbUpdateBossStatus', '__wbSyncAutoConfig', '__wbBossStartUpdater'].includes(f.name)
  ).map(f => f.code + '\n'),
  '',
  '// === Function Definitions (Group 3: Hunt List) ===',
  ...fns.filter(f =>
    ['__wbLoadHuntList', '__wbGetHuntList', '__wbSaveHuntList',
      '__wbAddToHuntList', '__wbRemoveFromHuntList', '__wbUpdateHuntListUI', '__wbInitHuntToggle'].includes(f.name)
  ).map(f => f.code + '\n'),
  '',
  'console.log("[WB] World Boss module loaded (' + fns.length + ' functions)");',
  '})();',
].join('\n');

fs.writeFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/wb-boss.js', wbBossParts, 'utf8');
console.log('\n--- wb-boss.js written: ' + wbBossParts.length + ' bytes (expected ~' +
  (hookCode.length + helpersCode.length + varBlockCode.length +
    fns.reduce((s, f) => s + f.code.length, 0) + detectBlock.length) + ')');

// ==============================
// PASS 3: Strip WB from game-monitor.js
// ==============================

// Collect all regions to remove, sorted descending
const removals = [
  // Function definitions
  ...fns.map(f => ({ start: f.start, end: f.end })),
  // Var/init block
  { start: varBlockStart, end: varBlockEnd },
  // Detect block
  { start: detectBlockStart, end: detectBlockEnd },
  // Helper functions
  { start: helpersStart, end: helpersEnd },
  // Socket hook
  { start: hookStart, end: hookEnd },
  // Also remove the auto-detect setTimeout at bottom (lines ~315-331 is already captured in detectBlock)
  // Remove the console.log + return at top (wb module guard)
];

// Sort by start position descending for clean removal
removals.sort((a, b) => b.start - a.start);

// Remove overlapping regions (if a region is inside another)
const clean = [removals[0]];
for (let i = 1; i < removals.length; i++) {
  const cur = removals[i];
  const prev = clean[clean.length - 1];
  // If current is inside previous, skip
  if (cur.start >= prev.start && cur.end <= prev.end) continue;
  clean.push(cur);
}
clean.sort((a, b) => b.start - a.start);
console.log(`\nRemoving ${clean.length} regions from game-monitor.js...`);
let removedCount = 0;
for (const r of clean) {
  const snippet = c.substring(r.start, r.end);
  c = c.substring(0, r.start) + c.substring(r.end);
  removedCount += snippet.length;
  console.log(`  removed ${snippet.length} bytes at ${r.start}`);
}

console.log(`\nTotal removed: ${removedCount} bytes`);
console.log(`New size: ${c.length} bytes`);

// Fix: add a stub hook in game-monitor.js that loads wb-boss.js
// Find the IIFE start and add module load
// Actually, since popup.js handles injection, we can just leave game-monitor.js
// cleaner without adding loader code here. The wb-boss.js will be injected separately.

// Remove trailing empty comments
c = c.replace(/\n{3,}/g, '\n\n');

// Syntax check
try { new Function(c); console.log('Syntax: OK'); }
catch(e) { console.error('SYNTAX ERROR:', e.message); process.exit(1); }

fs.writeFileSync(p, c, 'utf8');
console.log('game-monitor.js saved!');
