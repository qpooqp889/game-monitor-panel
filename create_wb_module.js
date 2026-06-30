const fs = require('fs');
const c = fs.readFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js', 'utf8');

function findFnEnd(fromIdx) {
  let brace = 0, started = false, i = fromIdx;
  while (i < c.length) {
    if (c[i] === '{') { brace++; started = true; }
    else if (c[i] === '}') { brace--; }
    if (started && brace === 0) return i + 1;
    i++;
  }
  return c.length;
}

// Target function names in order
const fnNames = [
  '__wbSend', '__wbSendPotion', '__wbCastSkill', '__wbSetBossSet', '__wbEmit',
  '__wbSubscribeWorldBoss', '__wbQueryWorldBoss',
  '__wbStartWorldBossTimer', '__wbStopWorldBossTimer',
  '__wbParseWorldBossData', '__wbUpdateWorldBossUI',
  '__wbDetectWorldBossEvt',
  '__wbBossLoop', '__wbBossAutoStart', '__wbBossAutoStop', '__wbToggleBypass',
  '__wbUpdateBossStatus', '__wbSyncAutoConfig', '__wbBossStartUpdater',
  '__wbLoadHuntList', '__wbGetHuntList', '__wbSaveHuntList',
  '__wbAddToHuntList', '__wbRemoveFromHuntList', '__wbUpdateHuntListUI', '__wbInitHuntToggle',
];

// Find each function, collect with optional preceding comment
const fns = [];
for (const name of fnNames) {
  const idx = c.indexOf('function ' + name + '(');
  if (idx === -1) { console.log('  MISSING: ' + name); continue; }
  const end = findFnEnd(idx);
  // Check for preceding // comment line
  const lineStart = c.lastIndexOf('\n', idx - 1) + 1;
  const commentLine = c.lastIndexOf('\n//', idx);
  const hasComment = commentLine > idx - 80 && commentLine > c.lastIndexOf('\n\n', idx - 2);
  const codeStart = (hasComment && commentLine >= 0) ? commentLine : lineStart;
  const code = c.substring(codeStart, end);
  const line = c.substring(0, codeStart).split('\n').length;
  fns.push({ name, code, line });
  console.log('  ' + name + ' at line ' + line + ', ' + code.length + ' bytes');
}

// Find variable init blocks
function collect(prefix, startSearch) {
  const idx = c.indexOf(prefix, startSearch);
  if (idx === -1) return '';
  const lineEnd = c.indexOf('\n', idx);
  return c.substring(c.lastIndexOf('\n', idx - 1) + 1, lineEnd + 1);
}

// Find the socket hook IIFE
const sioHookStart = c.indexOf('// ====== WB Boss Hook ======');
const sioHookEnd = c.indexOf('function __wbSend(action)');
const sioHookCode = c.substring(sioHookStart, sioHookEnd) + '\n';

// Find the auto-detect setTimeout block
const detectBlockStart = c.indexOf('// 初次啟動偵測', sioHookEnd);
const bossAutoLine = '// ====== Boss Auto ======';
const detectBlockEnd = c.indexOf(bossAutoLine);
const detectBlock = c.substring(detectBlockStart, detectBlockEnd);

// Find var init sections between functions
// Between __wbEmit and __wbSubscribeWorldBoss
const emitEnd = fns.find(f => f.name === '__wbEmit').line;
const subStart = fns.find(f => f.name === '__wbSubscribeWorldBoss').line;
const varBlock1Start = c.indexOf('// ====== World Boss 監控 ======');
const varBlock1End = fns.find(f => f.name === '__wbSubscribeWorldBoss').codeStart - 1;
// Wait, I need the codeStart values... let me fix this

// Better: find the block between __wbEmit() and __wbSubscribeWorldBoss
const emitFnEnd = c.indexOf('\nfunction __wbSubscribeWorldBoss', c.indexOf('function __wbEmit'));
const varBlock = c.substring(emitFnEnd, c.indexOf('\nfunction __wbSubscribeWorldBoss', emitFnEnd));
const varlen = varBlock.length;
console.log('\nVar block: ' + varlen + ' bytes');

// Build wb-boss.js
const parts = [
  '// ====== wb-boss.js - World Boss Module ======',
  '// Extracted from game-monitor.js v2.30',
  '// Encapsulated in IIFE, all functions on window.__wb* namespace',
  '',
  '(function(){',
  '  if(window.__wbModuleLoaded){console.log("[WB] Module already loaded, skip");return;}',
  '  window.__wbModuleLoaded=true;',
  '  console.log("[WB] World Boss module loading...");',
  '',
  '  // === Socket Hook (installSioHook) ===',
  sioHookCode,
  '',
  '  // === Variable/Init ===',
  varBlock,
  '',
  '  // === Function Definitions ===',
  ...fns.map(f => f.code + '\n'),
  '',
  '  // === Auto-detect setTimeout ===',
  detectBlock,
  '',
  '  console.log("[WB] World Boss module loaded");',
  '})();',
].join('\n');

fs.writeFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/wb-boss.js', parts, 'utf8');

// Syntax check
try { new Function(parts); console.log('\nwb-boss.js Syntax: OK'); }
catch(e) { console.error('\nwb-boss.js SYNTAX ERROR:', e.message); process.exit(1); }

console.log('wb-boss.js written: ' + parts.length + ' bytes');
