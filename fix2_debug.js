const P = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3';
const fs = require('fs');
let wb = fs.readFileSync(P + '/wb-boss.js', 'utf8');
let gm = fs.readFileSync(P + '/game-monitor.js', 'utf8');

// Fix 2: Start function - add retryCount + resume callback
var startIdx = wb.indexOf('function __wbBossAutoScriptStart');
var startEndIdx = startIdx + 700;

// Show the current state of the function
var currentBody = wb.substring(startIdx, startIdx + 700);
console.log('Current Start function body:');
console.log(currentBody);

// Replace: add retryCount=0 and resume call
wb = wb.replace(
  "window.__wbBossAutoScript.running=true;\n  window.__wbBossAutoScript.currentIdx=0;\n  window.__wbBossAutoScript.phase='loading';",
  "window.__wbBossAutoScript.running=true;\n  window.__wbBossAutoScript.retryCount=0;\n  window.__wbBossAutoScript.phase='loading';\n\n  __wbLoadAutoScriptResume(function(idx){\n    window.__wbBossAutoScript.currentIdx=idx||0;\n    var statusEl=document.getElementById('__gmp_boss_script_status');\n    if(statusEl){\n      if(idx>0)statusEl.textContent='\\u21E8 \\u5F9E\\u4E0A\\u6B21\\u9032\\u5EA6\\u7E7C\\u7EED (\\u7B2C'+(idx+1)+'\\u96BB)';\n      else statusEl.textContent='\\u26A1 BOSS\\u811A\\u672C\\u8DD1\\u884C\\u4E2D...';\n    }\n    __wbBossAutoScriptLoop();\n  });"
);

wb = wb.replace(
  "window.__wbBossAutoScript.running=true;\r\n  window.__wbBossAutoScript.currentIdx=0;\r\n  window.__wbBossAutoScript.phase='loading';",
  "window.__wbBossAutoScript.running=true;\r\n  window.__wbBossAutoScript.retryCount=0;\r\n  window.__wbBossAutoScript.phase='loading';\r\n\r\n  __wbLoadAutoScriptResume(function(idx){\r\n    window.__wbBossAutoScript.currentIdx=idx||0;\r\n    var statusEl=document.getElementById('__gmp_boss_script_status');\r\n    if(statusEl){\r\n      if(idx>0)statusEl.textContent='\\u21E8 \\u5F9E\\u4E0A\\u6B21\\u9032\\u5EA6\\u7E7C\\u7EED (\\u7B2C'+(idx+1)+'\\u96BB)';\r\n      else statusEl.textContent='\\u26A1 BOSS\\u811A\\u672C\\u8DD1\\u884C\\u4E2D...';\r\n    }\r\n    __wbBossAutoScriptLoop();\r\n  });"
);

console.log('\nAfter replace, has resume:', wb.indexOf('__wbLoadAutoScriptResume') > 0);

// Check gm modal - find config inputs in boss tab
var configBtn = gm.indexOf('__gmp_boss_auto_config_btn');
if (configBtn > 0) {
  console.log('\ngm config btn at:', configBtn);
  // Find the HTML that builds the modal content - search from this point backward
  // or search for 'modal' in gm
  var modalIdx = gm.indexOf("modal");
  console.log('modal keyword at:', modalIdx);
  if (modalIdx > 0) {
    var ctx = gm.substring(modalIdx, modalIdx + 200);
    console.log('Modal context:', ctx);
  }
}

// Look for any checkbox that gets saved to config in gm
var chkList = gm.indexOf('hpOperators');
console.log('\nhpOperators at:', chkList);
var autoAtkChk = gm.indexOf('__gmp_boss_auto_atk');
console.log('auto_atk in gm:', autoAtkChk);

// Find where the config form reads checkbox values
var checkboxes = gm.indexOf('.checked');
if (checkboxes > 0) {
  var ctx2 = gm.substring(checkboxes - 100, checkboxes + 200);
  console.log('\nCheckbox refs:', ctx2);
}

try { new Function(wb); console.log('\nwb OK: ' + wb.length + 'b'); }
catch(e) { console.log('wb FAIL: ' + e.message); process.exit(1); }
fs.writeFileSync(P + '/wb-boss.js', wb, 'utf8');
try { new Function(gm); } // just validate, don't save yet
