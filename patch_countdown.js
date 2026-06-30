const fs = require('fs');
const p = 'C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/game-monitor.js';
let c = fs.readFileSync(p, 'utf8');

// ===== Change 1: replace __wbStartWorldBossTimer =====
// Find the EXACT block (line 183 area)
const t1 = c.indexOf('function __wbStartWorldBossTimer');
const t2 = c.indexOf('function __wbStopWorldBossTimer');
const t3 = c.indexOf('function __wbParseWorldBossData', t2);
const oldTimerBlock = c.substring(t1, t3);

const newTimerBlock =
  "function __wbStartWorldBossTimer(){\r\n" +
  "  if(window.__wbWorldBossTimer)clearInterval(window.__wbWorldBossTimer);\r\n" +
  "  window.__wbWorldBossCountdown=60;\r\n" +
  "  __wbUpdateWorldBossUI(true);\r\n" +
  "  window.__wbWorldBossTimer=setInterval(function(){\r\n" +
  "    window.__wbWorldBossCountdown--;\r\n" +
  "    var timerEl=document.getElementById('__gmp_wb_timer');\r\n" +
  "    if(timerEl)timerEl.textContent=window.__wbWorldBossCountdown+'s/60s';\r\n" +
  "    if(window.__wbWorldBossCountdown<=0){\r\n" +
  "      window.__wbWorldBossCountdown=60;\r\n" +
  "      __wbUpdateWorldBossUI(true);\r\n" +
  "    }\r\n" +
  "  },1000);\r\n" +
  "  console.log('[WB-WorldBoss] DOM timer started, countdown=60s');\r\n" +
  "}\r\n" +
  "function __wbStopWorldBossTimer(){\r\n" +
  "  if(window.__wbWorldBossTimer){clearInterval(window.__wbWorldBossTimer);window.__wbWorldBossTimer=null;}\r\n" +
  "}\r\n";

c = c.substring(0, t1) + newTimerBlock + c.substring(t3);
console.log('1. Timer replaced');

// ===== Change 2: add autoNav param =====
const fnUI = c.indexOf('function __wbUpdateWorldBossUI()');
c = c.substring(0, fnUI) + 'function __wbUpdateWorldBossUI(autoNav){' + c.substring(fnUI + 34);
console.log('2. autoNav param added');

// ===== Change 3: replace timerEl text =====
const oldTS = "timerEl.textContent='每 60s';";
const tsIdx = c.indexOf(oldTS);
const tsEndLine = c.indexOf('\n', tsIdx);
const tsBlock = c.substring(tsIdx, tsEndLine);
// Find the style.color line after it
const scIdx = c.indexOf("timerEl.style.color='#888';", tsIdx);
const scEndLine = c.indexOf('\n', scIdx);
const newTSBlock =
  "    if(timerEl&&window.__wbWorldBossCountdown!==undefined){\r\n" +
  "      timerEl.textContent=window.__wbWorldBossCountdown+'s/60s';\r\n" +
  "    }";
c = c.substring(0, tsIdx) + newTSBlock + c.substring(scEndLine + 1);
console.log('3. Timer display replaced');

// ===== Change 4: add autoNav hint in empty HTML =====
const emEsc = '\\u8bf7\\u5148\\u5207\\u6362\\u5230\\u300c\\u72e9\\u7315\\u573a \\u2192 \\u4e16\\u754c\\u738b\\u300d\\u5206\\u9875</span></div>';
const emIdx = c.indexOf(emEsc);
if (emIdx > 0) {
  const before = c.substring(0, emIdx);
  const after = c.substring(emIdx);
  const closeSpan = '</span></div>';
  const autoHint = "'+ (autoNav?'<br><span style=\"font-size:9px;color:#ffd700;\">\\u81ea\\u52a8\\u5bfc\\u822a\\u4e2d...</span>':'') +'";
  c = before + emEsc.replace(closeSpan, autoHint + closeSpan) + after.substring(emEsc.length);
  console.log('4. autoNav hint added');
} else {
  console.log('4. emptyMsg not found (skip)');
}

// ===== Change 5: auto-nav tab click after __wbUpdateHuntListUI =====
const huiIdx = c.indexOf('__wbUpdateHuntListUI();');
const afterHui = c.substring(huiIdx);
const callbackEnd = afterHui.indexOf('  });'); // the __wbLoadHuntList callback close
const fnClose = afterHui.indexOf('\n}', callbackEnd + 5); // the function close
const autoNavCode =
  "\r\n" +
  "  // === 自動導航 ===\r\n" +
  "  if(autoNav && bossList.length===0){\r\n" +
  "    try{\r\n" +
  "      var zoneTab=document.querySelector('div.tab[data-tab=\"zone\"]');\r\n" +
  "      var wbSub=document.querySelector('div.subtab[data-c=\"special\"]');\r\n" +
  "      if(zoneTab){zoneTab.click();console.log('[WB] clicked \\u72e9\\u7315\\u5834 tab');}\r\n" +
  "      if(wbSub){wbSub.click();console.log('[WB] clicked world boss subtab');}\r\n" +
  "    }catch(e){console.warn('[WB] autoNav error:',e);}\r\n" +
  "  }";

const insertPt = huiIdx + callbackEnd + 5; // after `  });`
c = c.substring(0, insertPt) + autoNavCode + c.substring(insertPt);
console.log('5. autoNav tab click added');

// Verify
try { new Function(c); console.log('6. Syntax: OK'); }
catch(e) { console.error('6. SYNTAX ERROR:', e.message); process.exit(1); }

fs.writeFileSync(p, c, 'utf8');
console.log('7. Saved! Size:', c.length);
