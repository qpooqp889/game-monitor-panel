(function(){
var ver='v1.32-final';
if(window.__gmInjected){
  console.log('[GM] Already injected ('+ver+')');
  var el=document.getElementById('__gmp_ver');
  if(el)el.textContent=ver;
  return;
}
window.__gmInjected=true;
window.__gmVer=ver;
window.__battleStatus={packets:[]};
window.__gmOnlineCount=null;
window.__gmFarming={running:false,timer:null,returning:false,waitTimer:null};

// ===== WebSocket Hook =====
var origSend=WebSocket.prototype.send;
WebSocket.prototype.send=function(data){
  window.__battleStatus.packets.push({type:'send',data:data});
  window.__ws=this;
  return origSend.call(this,data);
};

if(window.__ws){
  window.__ws.addEventListener('message',function(e){
    window.__battleStatus.packets.push({type:'receive',data:e.data});
    try{
      var d=JSON.parse(e.data.substring(2));
      if(d[0]==='onlineCount')window.__gmOnlineCount=d[1];
    }catch(err){}
  });
}

// ===== Socket.IO Hook (receive only, NO emit hook) =====
window.__wbBossEmitLog=[];
window.__wbSocket=null;
window.lastState=null;

(function(){
  function installSioHook(){
    if(window.__wbSioHooked)return;
    var io=window.io;
    if(!io||typeof io!=='function'){setTimeout(installSioHook,500);return;}
    var SP=io.Socket&&io.Socket.prototype;
    if(!SP){setTimeout(installSioHook,500);return;}
    window.__wbSioHooked=true;
    console.log('[WB] Installing SIO hook...');
    
    // Hook onevent (receive only)
    if(!SP.__wbOE){
      SP.__wbOE=true;
      var _oe=SP.onevent;
      SP.onevent=function(p){
        try{
          if(!window.__wbSocket||!window.__wbSocket.connected)window.__wbSocket=this;
          if(p&&p.data&&p.data[0]){
            var evtName=p.data[0];
            // 解析 state 事件
            if(evtName==='state'&&p.data[1]){
              window.lastState=p.data[1];
            }
          }
        }catch(e){}
        if(_oe)_oe.call(this,p);
      };
      console.log('[WB] onevent hook installed');
    }
    
    // NO emit hook - we use window.__ws.send() directly!
    console.log('[WB] Hook installed (receive only)');
  }
  
  [100,500,1500,3000].forEach(function(delay){setTimeout(installSioHook,delay)});
})();

// ===== Send Functions (FIXED - use WebSocket string format) =====
function sendZone(zoneId){
  if(window.__ws){
    window.__ws.send('42["setZone","'+zoneId+'"]');
    console.log('[GM] Teleport:',zoneId);
  } else {
    console.log('[GM] ERROR: No WebSocket!');
  }
}

function sendCmd(cmd){
  if(window.__ws){
    window.__ws.send('42["'+cmd+'"]');
    console.log('[GM] Cmd:',cmd);
  }
}

function __wbSend(action){
  if(window.__ws){
    window.__ws.send('42["bossAction","'+action+'"]');
    console.log('[WB] bossAction:',action);
  }
}

function __wbSendPotion(type){
  if(window.__ws){
    var t=type||'potion_heal';
    window.__ws.send('42["usePotion",{"type":"'+t+'"}]');
    console.log('[WB] potion:',t);
  }
}

function __wbCastSkill(id,target){
  if(window.__ws){
    var p='{"id":"'+id+'"'+(target?',"target":"'+target+'"':'')+'}';
    window.__ws.send('42["castSkill",'+p+']');
    console.log('[WB] skill:',id);
  }
}

function __wbSetBossSet(s){
  if(window.__ws){
    window.__ws.send('42["setBossSet","'+s+'"]');
    console.log('[WB] setBossSet:',s);
  }
}

console.log('[GM] Monitor injected '+ver);
})();
