const fs = require('fs');

// Use short 8.3 path to avoid encoding issues  
const P = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3';
let wb = fs.readFileSync(P + '/wb-boss.js', 'utf8');
let gm = fs.readFileSync(P + '/game-monitor.js', 'utf8');

// Helper: find function body
function getFn(s, fn) {
  var idx = s.indexOf('function ' + fn + '(');
  if (idx === -1) return null;
  var j = s.indexOf('{', idx), brace = 0, started = false, k;
  for (k = j; k < s.length; k++) {
    if (s[k] === '{') { brace++; started = true; }
    else if (s[k] === '}') { brace--; }
    if (started && brace === 0) return { start: idx, end: k + 1, body: s.substring(idx, k + 1) };
  }
  return null;
}

// 1. State object
wb = wb.replace(
  'window.__wbBossAutoScript={running:false,timer:null,currentIdx:0,phase:\'idle\',farmWasRunning:false}',
  'window.__wbBossAutoScript={running:false,timer:null,currentIdx:0,phase:\'idle\',farmWasRunning:false,resumeEnabled:true,retryCount:0,maxRetryPerBoss:0}'
);
console.log('1. State updated');

// 2. Start function - add resume
var fn = getFn(wb, '__wbBossAutoScriptStart');
if (fn) {
  var s = fn.body;
  var afterPhase = s.indexOf("phase='loading';\n  var statusEl=document.getElementById('__gmp_boss_script_status');\n  if(statusEl)statusEl.textContent='\\u26A1 BOSS\\u811A\\u672C\\u8DD1\\u884C\\u4E2D...';\n\n  __wbBossAutoScriptLoop();");
  if (afterPhase > 0) {
    var newCall = "phase='loading';\n\n  __wbLoadAutoScriptResume(function(idx){\n    window.__wbBossAutoScript.currentIdx=idx||0;\n    var statusEl=document.getElementById('__gmp_boss_script_status');\n    if(statusEl){\n      if(idx>0)statusEl.textContent='\\u21E8 \\u5F9E\\u4E0A\\u6B21\\u9032\\u5EA6\\u7E7C\\u7EED (\\u7B2C'+(idx+1)+'\\u96BB)';\n      else statusEl.textContent='\\u26A1 BOSS\\u811A\\u672C\\u8DD1\\u884C\\u4E2D...';\n    }\n    __wbBossAutoScriptLoop();\n  });";
    s = s.replace("currentIdx=0;", "retryCount=0;").replace(
      "phase='loading';\r\n  var statusEl=document.getElementById('__gmp_boss_script_status');\r\n  if(statusEl)statusEl.textContent='\\u26A1 BOSS\\u811A\\u672C\\u8DD1\\u884C\\u4E2D...';\r\n\r\n  __wbBossAutoScriptLoop();",
      "phase='loading';\r\n\r\n  __wbLoadAutoScriptResume(function(idx){\r\n    window.__wbBossAutoScript.currentIdx=idx||0;\r\n    var statusEl=document.getElementById('__gmp_boss_script_status');\r\n    if(statusEl){\r\n      if(idx>0)statusEl.textContent='\\u21E8 \\u5F9E\\u4E0A\\u6B21\\u9032\\u5EA6\\u7E7C\\u7EED (\\u7B2C'+(idx+1)+'\\u96BB)';\r\n      else statusEl.textContent='\\u26A1 BOSS\\u811A\\u672C\\u8DD1\\u884C\\u4E2D...';\r\n    }\r\n    __wbBossAutoScriptLoop();\r\n  });"
    );
    wb = wb.substring(0, fn.start) + s + wb.substring(fn.end);
    console.log('2. Start updated');
  }
} else process.exit(1);

// 3. Stop - add resume clear + retry reset
fn = getFn(wb, '__wbBossAutoScriptStop');
if (fn) {
  var s = fn.body;
  s = s.replace(
    "window.__wbBossAutoScript.currentIdx=0;\r\n  window.__wbBossAutoScript.phase='idle';",
    "window.__wbClearAutoScriptResume();\r\n  window.__wbBossAutoScript.currentIdx=0;\r\n  window.__wbBossAutoScript.retryCount=0;\r\n  window.__wbBossAutoScript.phase='idle';"
  );
  wb = wb.substring(0, fn.start) + s + wb.substring(fn.end);
  console.log('3. Stop updated');
} else process.exit(1);

// 4. Insert HP<MP helpers before Start
fn = getFn(wb, '__wbBossAutoScriptStart');
if (fn) {
  var hpFns =
    "\r\nfunction __wbCheckHpLessThanMp(){\r\n" +
    "  if(typeof window.__gmStorageGet==='undefined')return Promise.resolve(true);\r\n" +
    "  return window.__gmStorageGet(['wb_boss_config']).then(function(r){\r\n" +
    "    var cfg=r&&r.wb_boss_config||{};\r\n" +
    "    if(!cfg.hpLessThanMp)return true;\r\n" +
    "    var ls=window.lastState||{};\r\n" +
    "    var hp=ls.hp||0,mp=ls.mp||1;\r\n" +
    "    if(mp<=0)mp=1;\r\n" +
    "    return hp < mp;\r\n" +
    "  }).catch(function(){return true;});\r\n" +
    "}\r\n" +
    "function __wbGetBossConfigItem(key,defVal){\r\n" +
    "  if(typeof window.__gmStorageGet==='undefined')return Promise.resolve(defVal);\r\n" +
    "  return window.__gmStorageGet(['wb_boss_config']).then(function(r){\r\n" +
    "    var cfg=r&&r.wb_boss_config||{};\r\n" +
    "    return cfg[key]!==undefined?cfg[key]:defVal;\r\n" +
    "  }).catch(function(){return defVal;});\r\n" +
    "}\r\n";
  wb = wb.substring(0, fn.start) + hpFns + wb.substring(fn.start);
  console.log('4. HP<MP helpers inserted');
} else process.exit(1);

// 5. Resume functions after __wbGetHuntIds
fn = getFn(wb, '__wbGetHuntIds');
if (fn) {
  var resumeFns =
    "\r\nfunction __wbSaveAutoScriptResume(){\r\n" +
    "  if(typeof window.__gmStorageSet==='undefined')return;\r\n" +
    "  __wbGetHuntIds(function(ids){\r\n" +
    "    window.__gmStorageSet('wb_auto_script_resume',{\r\n" +
    "      currentIdx:window.__wbBossAutoScript.currentIdx||0,\r\n" +
    "      huntListIds:ids,savedAt:Date.now()\r\n" +
    "    }).catch(function(){});\r\n" +
    "  });\r\n" +
    "}\r\n" +
    "function __wbLoadAutoScriptResume(callback){\r\n" +
    "  if(typeof window.__gmStorageGet==='undefined'||!callback){if(callback)callback(0);return;}\r\n" +
    "  window.__gmStorageGet(['wb_auto_script_resume','wb_priority_list']).then(function(r){\r\n" +
    "    var resume=r&&r.wb_auto_script_resume||null;\r\n" +
    "    if(!resume||typeof resume.currentIdx==='undefined'){callback(0);return;}\r\n" +
    "    var curList=r&&r.wb_priority_list||[];\r\n" +
    "    var curIds=curList.map(function(i){return i.id;});\r\n" +
    "    var savedIds=resume.huntListIds||[];\r\n" +
    "    var sameList=curIds.length===savedIds.length&&curIds.every(function(id,i){return id===savedIds[i];});\r\n" +
    "    if(!sameList){callback(0);return;}\r\n" +
    "    var idx=resume.currentIdx||0;\r\n" +
    "    if(idx<0||idx>=curIds.length)idx=0;\r\n" +
    "    window.__wbBossAutoScript.currentIdx=idx;\r\n" +
    "    callback(idx);\r\n" +
    "  }).catch(function(){callback(0);});\r\n" +
    "}\r\n" +
    "function __wbClearAutoScriptResume(){\r\n" +
    "  if(typeof window.__gmStorageRemove==='undefined')return;\r\n" +
    "  window.__gmStorageRemove('wb_auto_script_resume').catch(function(){});\r\n" +
    "}\r\n";

  var next = wb.indexOf('\nfunction __wbMoveHuntItem(', fn.end);
  if (next < 0) next = fn.end;
  wb = wb.substring(0, fn.end) + resumeFns + wb.substring(fn.end);
  console.log('5. Resume functions inserted');
} else process.exit(1);

// 6a. Loop empty save
wb = wb.replace(
  "if(!list||!list.length){\r\n      window.__wbBossAutoScript.phase='idle';\r\n      __wbBossAutoScriptRestoreFarm();\r\n      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,10000);\r\n      return;\r\n    }",
  "if(!list||!list.length){\r\n      window.__wbBossAutoScript.phase='idle';\r\n      __wbSaveAutoScriptResume();\r\n      __wbBossAutoScriptRestoreFarm();\r\n      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,10000);\r\n      return;\r\n    }"
);
console.log('6a. Loop empty save added');

// 6b. Loop end clear resume
wb = wb.replace(
  "// Reached end of hunt list \\u2192 restore farm\r\n      console.log('[WB-AutoScript] Completed hunt list, restoring farm');\r\n      window.__wbBossAutoScript.currentIdx=0;\r\n      __wbBossAutoScriptRestoreFarm();",
  "// Reached end of hunt list \\u2192 clear resume, restore farm\r\n      console.log('[WB-AutoScript] Completed hunt list, restoring farm');\r\n      window.__wbBossAutoScript.currentIdx=0;\r\n      __wbClearAutoScriptResume();\r\n      __wbBossAutoScriptRestoreFarm();"
);
console.log('6b. Loop end clear resume added');

// 7. Replace MonitorBossHP
fn = getFn(wb, '__wbBossAutoScriptMonitorBossHP');
if (fn) {
  var newMon =
    "function __wbBossAutoScriptMonitorBossHP(target,idx,list){\r\n" +
    "  if(!window.__wbBossAutoScript.running)return;\r\n" +
    "  var ls=window.lastState||{};\r\n" +
    "  var boss=ls.boss||{};\r\n" +
    "  var mode=ls.mode||'';\r\n" +
    "  var bossHp=boss.hp||0;\r\n" +
    "  var bossMax=boss.maxHp||1;\r\n" +
    "  var hp=ls.hp||0,mp=ls.mp||1; if(mp<=0)mp=1;\r\n" +
    "  var statusEl=document.getElementById('__gmp_boss_script_status');\r\n" +
    "  if(statusEl)statusEl.textContent='[ATTACK] '+target.name+' HP:'+Math.round(bossHp/bossMax*100)+'%';\r\n" +
    "  __wbGetBossConfigItem('hpLessThanMp',false).then(function(hpLessThanMp){\r\n" +
    "    if(hpLessThanMp && hp >= mp && mode==='bosscombat'){\r\n" +
    "      if(statusEl)statusEl.textContent='[WAIT] '+target.name+' HP('+hp+')\\u2265MP('+mp+')';\r\n" +
    "      window.__wbBossAutoScript.timer=setTimeout(function(){__wbBossAutoScriptMonitorBossHP(target,idx,list);},2000);\r\n" +
    "      return;\r\n" +
    "    }\r\n" +
    "    if(bossHp<=0&&mode!=='bosscombat'){\r\n" +
    "      console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');\r\n" +
    "      var e1=document.getElementById('__gmp_boss_auto_enable');if(e1)e1.checked=false;\r\n" +
    "      var e2=document.getElementById('__gmp_boss_auto_atk');if(e2)e2.checked=false;\r\n" +
    "      if(statusEl)statusEl.textContent='\\u21BA '+target.name+' \\u5DF2\\u64CA\\u6557\\uFF0C\\u91CD\\u751F\\u4E2D...';\r\n" +
    "      if(window.__wbBossAutoScript.maxRetryPerBoss>0&&window.__wbBossAutoScript.retryCount>=window.__wbBossAutoScript.maxRetryPerBoss){\r\n" +
    "        console.log('[WB-AutoScript] Retry limit reached, advancing');\r\n" +
    "        window.__wbBossAutoScript.retryCount=0;\r\n" +
    "        window.__wbBossAutoScript.currentIdx++;\r\n" +
    "        if(window.__wbBossAutoScript.timer)clearTimeout(window.__wbBossAutoScript.timer);\r\n" +
    "        window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,1000); return;\r\n" +
    "      }\r\n" +
    "      __wbBossAutoScriptRespawn(target,idx,list); return;\r\n" +
    "    }\r\n" +
    "    if(mode==='bosscombat'&&bossHp>0){\r\n" +
    "      var a1=document.getElementById('__gmp_boss_auto_atk');if(a1&&!a1.checked)a1.checked=true;\r\n" +
    "      var a2=document.getElementById('__gmp_boss_auto_enable');if(a2&&!a2.checked)a2.checked=true;\r\n" +
    "      if(window.__wbSyncAutoConfig)__wbSyncAutoConfig();\r\n" +
    "      if(window.__wbBossAuto&&!window.__wbBossAuto.running&&window.__wbBossAutoStart)__wbBossAutoStart();\r\n" +
    "    }\r\n" +
    "    window.__wbBossAutoScript.timer=setTimeout(function(){__wbBossAutoScriptMonitorBossHP(target,idx,list);},2000);\r\n" +
    "  });\r\n" +
    "}";
  wb = wb.substring(0, fn.start) + newMon + wb.substring(fn.end);
  console.log('7. MonitorHP updated');
} else process.exit(1);

// 8. Respawn functions
fn = getFn(wb, '__wbBossAutoScriptRestoreFarm');
if (fn) {
  var respawnFns =
    "\r\nfunction __wbBossAutoScriptRespawn(target,idx,list){\r\n" +
    "  if(!window.__wbBossAutoScript.running)return;\r\n" +
    "  var statusEl=document.getElementById('__gmp_boss_script_status');\r\n" +
    "  if(statusEl)statusEl.textContent='\\u21BA '+target.name+' \\u91CD\\u751F\\u4E2D (\\u7B2C'+(window.__wbBossAutoScript.retryCount+1)+'\\u6B21)...';\r\n" +
    "  __wbBossAutoScriptSendCharSelect();\r\n" +
    "  window.__wbBossAutoScript.retryCount++;\r\n" +
    "  window.__wbBossAutoScript.timer=setTimeout(function(){__wbBossAutoScriptReturnToBoss(target,idx,list);},3000);\r\n" +
    "}\r\n" +
    "function __wbBossAutoScriptSendCharSelect(){\r\n" +
    "  if(window.__gmSocket&&window.__gmSocket.send){\r\n" +
    "    try{\r\n" +
    "      window.__gmSocket.send('[1]\\\\x00\\\\x00\\\\x00\\\\x00');\r\n" +
    "      console.log('[WB-AutoScript] Sent char select packet');\r\n" +
    "    }catch(e){console.log('[WB-AutoScript] Char select send failed:',e);}\r\n" +
    "  }\r\n" +
    "}\r\n" +
    "function __wbBossAutoScriptReturnToBoss(target,idx,list){\r\n" +
    "  if(!window.__wbBossAutoScript.running)return;\r\n" +
    "  var statusEl=document.getElementById('__gmp_boss_script_status');\r\n" +
    "  if(statusEl)statusEl.textContent='\\u21BA '+target.name+' \\u8FD4\\u56DE\\u4E16\\u754C\\u738B...';\r\n" +
    "  try{__wbEnsureWBTab();}catch(e){}\r\n" +
    "  window.__wbBossAutoScript.timer=setTimeout(function(){\r\n" +
    "    if(!window.__wbBossAutoScript.running)return;\r\n" +
    "    var cards=document.querySelectorAll('.wb-card[data-boss]');\r\n" +
    "    var foundBoss=null;\r\n" +
    "    cards.forEach(function(card){var id=card.getAttribute('data-boss');if(id===target.id)foundBoss=card;});\r\n" +
    "    if(!foundBoss){\r\n" +
    "      console.log('[WB-AutoScript] '+target.name+' not found after respawn');\r\n" +
    "      window.__wbBossAutoScript.timer=setTimeout(function(){__wbBossAutoScriptReturnToBoss(target,idx,list);},5000); return;\r\n" +
    "    }\r\n" +
    "    __wbCheckHpLessThanMp().then(function(ok){\r\n" +
    "      if(!ok){\r\n" +
    "        console.log('[WB-AutoScript] HP>=MP, waiting...');\r\n" +
    "        window.__wbBossAutoScript.timer=setTimeout(function(){__wbBossAutoScriptReturnToBoss(target,idx,list);},3000); return;\r\n" +
    "      }\r\n" +
    "      try{foundBoss.click();}catch(e){}\r\n" +
    "      window.__wbBossAutoScript.phase='attacking';\r\n" +
    "      window.__wbBossAutoScript.timer=setTimeout(function(){\r\n" +
    "        var a1=document.getElementById('__gmp_boss_auto_atk');if(a1)a1.checked=true;\r\n" +
    "        var a2=document.getElementById('__gmp_boss_auto_enable');if(a2)a2.checked=true;\r\n" +
    "        __wbBossAutoScriptMonitorBossHP(target,idx,list);\r\n" +
    "      },1500);\r\n" +
    "    });\r\n" +
    "  },2000);\r\n" +
    "}\r\n";

  var exportIdx = wb.indexOf('\r\n// Export');
  var nextFn = wb.indexOf('\r\nfunction ', fn.end);
  var insertAt = (exportIdx > 0 && (nextFn < 0 || exportIdx < nextFn)) ? exportIdx : (nextFn > 0 ? nextFn : fn.end);
  wb = wb.substring(0, insertAt) + respawnFns + wb.substring(insertAt);
  console.log('8. Respawn functions inserted');
} else process.exit(1);

// 9. CheckBoss entering with HP<MP
var enterOld = "if(isAlive){\r\n    console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\r\n    window.__wbBossAutoScript.phase='entering';\r\n    try{foundBoss.click();}catch(e){}\r\n\r\n    // Wait for boss battle then start auto-attack\r\n    window.__wbBossAutoScript.timer=setTimeout(function(){\r\n      var atkChk=document.getElementById('__gmp_boss_auto_atk');\r\n      if(atkChk)atkChk.checked=true;\r\n      var enableChk=document.getElementById('__gmp_boss_auto_enable');\r\n      if(enableChk)enableChk.checked=true;\r\n      __wbBossAutoScript.phase='attacking';\r\n      __wbBossAutoScriptMonitorBossHP(target,idx,list);\r\n    },1500);"

var enterNew = "if(isAlive){\r\n    __wbCheckHpLessThanMp().then(function(canEnter){\r\n      if(!canEnter){\r\n        console.log('[WB-AutoScript] '+target.name+' alive but HP>=MP, waiting...');\r\n        window.__wbBossAutoScript.phase='waiting_boss';\r\n        window.__wbBossAutoScript.timer=setTimeout(function(){__wbBossAutoScriptCheckBoss(target,idx,list);},5000);\r\n        return;\r\n      }\r\n      console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\r\n      window.__wbBossAutoScript.phase='entering';\r\n      try{foundBoss.click();}catch(e){}\r\n      window.__wbBossAutoScript.timer=setTimeout(function(){\r\n        var a1=document.getElementById('__gmp_boss_auto_atk');if(a1)a1.checked=true;\r\n        var a2=document.getElementById('__gmp_boss_auto_enable');if(a2)a2.checked=true;\r\n        __wbBossAutoScript.phase='attacking';\r\n        __wbBossAutoScriptMonitorBossHP(target,idx,list);\r\n      },1500);\r\n    });"

if (wb.indexOf(enterOld) >= 0) {
  wb = wb.replace(enterOld, enterNew);
  console.log('9. CheckBoss entering HP<MP check added');
} else console.log('9. CheckBoss entering NOT FOUND (already replaced?)');

// Validate wb
try { new Function(wb); } catch(e) { console.log('XX wb FAIL: ' + e.message); process.exit(1); }
fs.writeFileSync(P + '/wb-boss.js', wb, 'utf8');
console.log('wb-boss.js OK: ' + wb.length + 'b');

// ====== 10-12. game-monitor.js changes ======
var hpMpRow = "'<div style=\"display:flex;align-items:center;gap:4px;margin-bottom:4px;\">'+\\r\\n'<input type=\"checkbox\" id=\"__gmp_boss_hp_lt_mp\" style=\"width:14px;height:14px;cursor:pointer;\">'+\\r\\n'<label for=\"__gmp_boss_hp_lt_mp\" style=\"font-size:10px;color:#ccc;cursor:pointer;\">\\u4EC5 HP < MP \\u6642\\u653B\\u64CA</label>'+\\r\\n'</div>'+\\r\\n";

var opsIdx = gm.indexOf('onlineOperators');
if (opsIdx > 0) {
  var closeDiv = gm.indexOf("'</div>'", opsIdx + 50);
  var nextRow = gm.indexOf("'<div style=\"display:flex;align", closeDiv + 20);
  if (nextRow > 0) {
    gm = gm.substring(0, nextRow) + hpMpRow + gm.substring(nextRow);
    console.log('10. HP<MP checkbox added to modal');
  } else console.log('10. nextRow not found');
} else console.log('10. onlineOperators not found');

// 11. Config save
var saveIdx = gm.indexOf('function __wbSaveBossConfig(cfg)');
if (saveIdx > 0) {
  var readOps = gm.indexOf('setOperatorReadTextarea', saveIdx);
  if (readOps > 0) {
    var ip = gm.lastIndexOf('\\r\\n  ', readOps);
    if (ip > 0) {
      var hpRead = "cfg.hpLessThanMp = document.getElementById('__gmp_boss_hp_lt_mp').checked;\\r\\n  ";
      gm = gm.substring(0, ip + 4) + hpRead + gm.substring(ip + 4);
      console.log('11. Save hpLessThanMp added');
    }
  }
}

// 12. Config load
var loadIdx = gm.indexOf('var saved=r&&r.wb_boss_config||null');
if (loadIdx > 0) {
  var setAuto = gm.indexOf('setOperatorCheckbox', loadIdx);
  if (setAuto > 0) {
    var ip = gm.lastIndexOf('\\r\\n    ', setAuto);
    if (ip > 0) {
      var hpRest = "var hpLtMp=document.getElementById('__gmp_boss_hp_lt_mp');if(hpLtMp)hpLtMp.checked=!!(saved.hpLessThanMp);\\r\\n    ";
      gm = gm.substring(0, ip + 6) + hpRest + gm.substring(ip + 6);
      console.log('12. Load hpLessThanMp added');
    }
  }
}

try { new Function(gm); } catch(e) { console.log('XX gm FAIL: ' + e.message); process.exit(1); }
fs.writeFileSync(P + '/game-monitor.js', gm, 'utf8');
console.log('game-monitor.js OK: ' + gm.length + 'b');
console.log('\n=== ALL DONE ===');
