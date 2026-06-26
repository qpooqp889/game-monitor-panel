// popup.js
var isInjected = false;
var currentTabId = null;

// The injection code (bookmarklet style)
var INJECT_CODE = `
javascript:(function(){
if(window.__gmInjected){console.log('[GM] Already injected');return;}
window.__gmInjected=true;
window.__gmPackets=[];

(function(){
var _send=WebSocket.prototype.send;
WebSocket.prototype.send=function(d){
if(!this.__hooked){this.__hooked=true;var s=this;
this.addEventListener('message',function(e){
console.log('[GM-RX]',e.data.substring(0,100));
window.__gmPackets.push({t:'rx',d:e.data});
try{
var j=JSON.parse(e.data.substring(2));
if(j[0]==='state'){window.__gmState=j[1];}
}catch(err){}
});
}
console.log('[GM-TX]',d.substring(0,100));
window.__gmPackets.push({t:'tx',d:d});
window.__gmWS=this;
return _send.call(this,d);
};
})();

window.gmAtk=function(){window.__gmWS&&window.__gmWS.send('42["attack"]');};
window.gmHp=function(){window.__gmWS&&window.__gmWS.send('42["useItem","potion_heal"]');};
window.gmStop=function(){window.__gmWS&&window.__gmWS.send('42["stop"]');};

setInterval(function(){
if(!window.__gmState||!window.__gmState.char)return;
var c=window.__gmState.char;
var m=window.__gmState.monsters||[];
var el=document.getElementById('__gm_display');
if(!el){
el=document.createElement('div');
el.id='__gm_display';
Object.assign(el.style,{position:'fixed',top:'10px',left:'10px',background:'rgba(0,0,0,0.85)',color:'#fff',padding:'12px',borderRadius:'8px',fontFamily:'monospace',fontSize:'12px',zIndex:99999,minWidth:'200px',border:'1px solid #0f3460'});
document.body.appendChild(el);
}
var tx=window.__gmPackets.filter(function(p){return p.t==='tx';}).length;
var rx=window.__gmPackets.filter(function(p){return p.t==='rx';}).length;
var hpPct=Math.round(c.hp/c.maxHp*100);
var hpCol=hpPct>50?'#4ade80':hpPct>25?'#fbbf24':'#e94560';
var mpPct=Math.round(c.mp/c.maxMp*100);
var mobInfo=m.map(function(x,i){if(x)return'['+i+']'+x.n+' '+x.hp+'/'+x.maxHp;}).filter(Boolean).join('\\n');
el.innerHTML=
'<div style="color:#00d9ff;font-weight:bold;margin-bottom:8px;">GAME MONITOR</div>'+
'<div>'+c.name+' Lv.'+c.level+'</div>'+
'<div style="color:'+hpCol+';">HP: '+c.hp+'/'+c.maxHp+' ('+hpPct+'%)</div>'+
'<div style="color:#00d9ff;">MP: '+c.mp+'/'+c.maxMp+' ('+mpPct+'%)</div>'+
'<div>EXP: '+Math.round(c.exp/c.expToNext*100)+'%</div>'+
'<div>Gold: '+c.gold+'</div>'+
'<div style="color:#ffd700;">'+(window.__gmState.zone||'---')+'</div>'+
'<div style="margin-top:8px;color:#ff6b6b;">MONSTERS:</div>'+
'<div style="color:#888;">'+(mobInfo||'None')+'</div>'+
'<div style="margin-top:8px;color:#888;font-size:10px;">TX:'+tx+' RX:'+rx+'</div>';
},500);

console.log('[GM] Monitor injected! Commands: gmAtk(), gmHp(), gmStop()');
})();
`;

function updateStatus(text) {
  document.getElementById('status').textContent = text;
}

function getCurrentTab(callback) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      callback(tabs[0].id, tabs[0].url);
    } else {
      callback(null, null);
    }
  });
}

function updateInjectButton() {
  var btn = document.getElementById('btnInject');
  if (isInjected) {
    btn.textContent = 'INJECTED ✓';
    btn.classList.add('on');
  } else {
    btn.textContent = 'INJECT MONITOR';
    btn.classList.remove('on');
  }
}

document.getElementById('btnInject').addEventListener('click', function() {
  updateStatus('Injecting...');
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) {
      updateStatus('No tab!');
      return;
    }
    var tab = tabs[0];
    if (!tab.url || !tab.url.includes('linh5web.win')) {
      updateStatus('Not on game page!');
      return;
    }
    
    // Use chrome.scripting.executeScript (MV3 way)
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: ['game-monitor.js']
    }, function(results) {
      if (chrome.runtime.lastError) {
        updateStatus('Error: ' + chrome.runtime.lastError.message.substring(0,60));
      } else {
        isInjected = true;
        updateInjectButton();
        updateStatus('Injected OK!');
      }
    });
  });
});

document.getElementById('btnHp').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        code: 'window.gmHp && window.gmHp();'
      }, function() {
        updateStatus('HP used!');
      });
    }
  });
});

document.getElementById('btnAtk').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        code: 'window.gmAtk && window.gmAtk();'
      }, function() {
        updateStatus('Attack sent!');
      });
    }
  });
});

document.getElementById('btnStop').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        code: 'window.gmStop && window.gmStop();'
      }, function() {
        updateStatus('Stopped!');
      });
    }
  });
});

document.getElementById('btnPanel').addEventListener('click', function() {
  getCurrentTab(function(tabId) {
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {action: 'togglePanel'}, function(response) {
        if (response !== undefined) {
          var btn = document.getElementById('btnPanel');
          if (response) {
            btn.textContent = 'HIDE PANEL';
            btn.classList.add('active');
          } else {
            btn.textContent = 'SHOW PANEL';
            btn.classList.remove('active');
          }
        }
      });
    }
  });
});

// Check if already injected
getCurrentTab(function(tabId) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {action: 'checkInjected'}, function(response) {
      if (response && response.injected) {
        isInjected = true;
        updateInjectButton();
        updateStatus('Already injected!');
      }
    });
  }
});
