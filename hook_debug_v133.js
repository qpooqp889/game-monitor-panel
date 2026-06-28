// game-monitor-hook-debug.js v1.33
// 在遊戲頁面的 Console 直接執行此腳本

(function(){
  console.log('%c[Hook-v1.33] 開始安裝...', 'color:#4ade80;font-weight:bold;');
  
  if(window.__wbHookV133)return console.log('%c[Hook-v1.33] 已安裝過', 'color:#f59e0b;');
  window.__wbHookV133=true;
  
  // 除錯：列出 window.io 的所有屬性
  function debugIO(io){
    if(!io)return;
    console.log('%c[Hook-v1.33] window.io 資訊:', 'color:#4fc3f7;');
    console.log('  - 類型:', typeof io);
    console.log('  - 所有屬性:', Object.keys(io).join(', '));
    
    try{
      var s=io();
      console.log('  - io() 返回值:', s);
      if(s){
        console.log('    - connected:', s.connected);
        console.log('    - id:', s.id);
        console.log('    - 所有屬性:', Object.keys(s).join(', '));
      }
    }catch(e){console.log('  - io() 錯誤:',e.message);}
  }
  
  function findAndHook(){
    var io=window.io;
    
    if(!io||typeof io!=='function'){
      console.log('%c[Hook-v1.33] ⏳ window.io 尚未載入，0.5 秒後重試...', 'color:#888;');
      setTimeout(findAndHook,500);
      return;
    }
    
    // 除錯資訊
    debugIO(io);
    
    // 方法 1: 直接呼叫 io()
    try{
      var s=io();
      if(s&&s.connected){
        console.log('%c[Hook-v1.33] ✅ 方法 1 成功: io()', 'color:#4ade80;font-weight:bold;');
        hookSocket(s);
        return;
      }
    }catch(e){console.log('%c[Hook-v1.33] 方法 1 失敗: '+e.message, 'color:#e94560;');}
    
    // 方法 2: 檢查 io.Socket
    try{
      if(io.Socket&&io.Socket.prototype){
        console.log('%c[Hook-v1.33] 找到 io.Socket.prototype', 'color:#4fc3f7;');
        // 檢查是否有現有的 socket 實例
        var proto=io.Socket.prototype;
        console.log('  - prototype 屬性:', Object.keys(proto).join(', '));
      }
    }catch(e){}
    
    // 方法 3: 從 Manager 找
    try{
      var managers=io.managers||{};
      var mkeys=Object.keys(managers);
      console.log('%c[Hook-v1.33] io.managers 數量: '+mkeys.length, 'color:#4fc3f7;');
      
      for(var i=0;i<mkeys.length;i++){
        var m=managers[mkeys[i]];
        if(m&&m.nsps){
          var nsps=Object.keys(m.nsps);
          console.log('  - Manager['+mkeys[i]+'] namespaces: '+nsps.join(', '));
          for(var j=0;j<nsps.length;j++){
            var sock=m.nsps[nsps[j]];
            if(sock&&sock.connected){
              console.log('%c[Hook-v1.33] ✅ 方法 3 成功: Manager.nsps', 'color:#4ade80;font-weight:bold;');
              hookSocket(sock);
              return;
            }
          }
        }
      }
    }catch(e){console.log('%c[Hook-v1.33] 方法 3 失敗: '+e.message, 'color:#e94560;');}
    
    // 方法 4: 搜尋 window 中所有 socket 實例
    console.log('%c[Hook-v1.33] 🔍 搜尋 window 中的 socket...', 'color:#f59e0b;');
    var found=false;
    for(var key in window){
      try{
        var obj=window[key];
        if(obj&&typeof obj==='object'&&obj.connected!==undefined){
          console.log('  - window.'+key+': connected='+obj.connected);
          if(obj.connected){hookSocket(obj);found=true;break;}
        }
      }catch(e){}
    }
    if(found)return;
    
    console.log('%c[Hook-v1.33] ⏳ 尚未找到連接的 socket，1 秒後重試...', 'color:#888;');
    setTimeout(findAndHook,1000);
  }
  
  function hookSocket(s){
    console.log('%c[Hook-v1.33] 🎯 開始 Hook socket!', 'color:#4ade80;font-weight:bold;');
    window.__wbSocket=s;
    
    // Hook onevent
    if(!s.__hookedV133){
      s.__hookedV133=true;
      var _oe=s.onevent;
      s.onevent=function(p){
        try{
          if(p&&p.data&&p.data[0]){
            var evtName=p.data[0];
            // 解析 state 事件
            if(evtName==='state'&&p.data[1]){
              window.lastState=p.data[1];
              window.__wbLatestState=p.data[1];
              console.log('%c[Hook-v1.33] ✅ state 事件捕獲! mode='+p.data[1].mode+' HP='+(p.data[1].char?p.data[1].char.hp:'?'), 'color:#4ade80;');
              // 觸發技能選單更新
              if(window.__gmBuildSkillOptions)window.__gmBuildSkillOptions(p.data[1]);
            }
          }
        }catch(e){console.log('[Hook-v1.33] onevent 錯誤:',e.message);}
        if(_oe)_oe.call(this,p);
      };
      console.log('%c[Hook-v1.33] ✅ onevent hook 安裝完成', 'color:#4ade80;');
    }
    
    // Hook emit
    if(!s.__emitHookedV133){
      s.__emitHookedV133=true;
      var _emit=s.emit;
      s.emit=function(){
        try{
          console.log('%c[Hook-v1.33] [SEND] '+arguments[0]+' '+JSON.stringify(Array.prototype.slice.call(arguments,1)).slice(0,100), 'color:#f59e0b;');
        }catch(e){}
        return _emit.apply(this,arguments);
      };
      console.log('%c[Hook-v1.33] ✅ emit hook 安裝完成', 'color:#4ade80;');
    }
    
    console.log('%c[Hook-v1.33] ✅✅✅ Hook 安裝完成！', 'color:#4ade80;font-weight:bold;font-size:14px;');
  }
  
  // 開始執行
  findAndHook();
  
  // 持續監控（每 5 秒檢查一次）
  setInterval(function(){
    if(window.__wbSocket&&window.__wbSocket.connected){
      // 正常，不做任何事
    }else{
      console.log('%c[Hook-v1.33] ⚠️ socket 斷線或遺失，重新尋找...', 'color:#f59e0b;');
      window.__wbSocket=null;
      findAndHook();
    }
  },5000);
})();
