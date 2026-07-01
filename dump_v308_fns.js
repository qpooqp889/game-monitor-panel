const fs = require('fs');
let wb = fs.readFileSync('C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/wb-boss.js', 'utf8');

// Find all auto-script functions
var funcs = [
  '__wbBossAutoScriptStart',
  '__wbBossAutoScriptStop',
  '__wbBossAutoScriptLoop',
  '__wbEnsureWBTab',
  '__wbBossAutoScriptCheckBoss',
  '__wbBossAutoScriptMonitorBossHP',
  '__wbBossAutoScriptRestoreFarm'
];

funcs.forEach(function(fn) {
  var idx = wb.indexOf('function ' + fn);
  if(idx === -1) idx = wb.indexOf(fn + '=function');
  if(idx === -1) { console.log('XX ' + fn + ' NOT FOUND'); return; }
  
  var brace=0, started=false, j=wb.indexOf('{', idx);
  for(var k=j; k<wb.length; k++) {
    if(wb[k]==='{'){brace++;started=true;}
    else if(wb[k]==='}'){brace--;}
    if(started&&brace===0) {
      console.log('\n' + fn + ' (' + (k+1-idx) + 'b):');
      console.log(wb.substring(idx, k+1));
      break;
    }
  }
});

// Also check the __gmBossAutoConfig object for hpLessThanMp
var cfg = wb.indexOf('hpLessThanMp');
if(cfg === -1) cfg = wb.indexOf('wb_boss_config');
if(cfg > -1) {
  // Find what config looks like
  var brace=0, started=false;
  var cfgObj = wb.indexOf('{', cfg);
  for(var k=cfgObj; k<cfg.length; k++) {
    if(wb[k]==='{'){brace++;started=true;}
    else if(wb[k]==='}'){brace--;}
    if(started&&brace===0) {
      console.log('\nConfig section @' + cfg + ':' + wb.substring(Math.max(0,cfg-30), k+1));
      break;
    }
  }
}

// Find the auto script state area
var state = wb.indexOf('window.__wbBossAutoScript');
if(state > -1) console.log('\nState definition @' + state + ': ' + wb.substring(state, state+200));
