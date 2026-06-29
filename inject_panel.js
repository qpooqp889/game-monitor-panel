// inject_panel.js - Injects boss_panel.html into the game page
// This script should be CDP-eval'd into the game page

(function(){
  // First, install the boss hook functions (if not already installed)
  if(!window.__wbBossHookInstalled){
    window.__wbBossHookInstalled=true;
    window.__wbBossEmitLog=[];
    window.__wbBossAuto={running:false,timer:null,config:{pot:true,heal:false,barrier:false,atk:false,hpPct:50,barrierPct:30}};
    
    function __wbInstallSio(){
      var SP=window.io&&window.io.Socket&&window.io.Socket.prototype;
      if(!SP){setTimeout(__wbInstallSio,300);return;}
      if(!SP.__wbPkt){
        SP.__wbPkt=true;
        var _origPkt=SP.packet;
        SP.packet=function(packet){
          var type=packet&&packet.type;
          if(type===2||type===3){
            var ev=packet.data&&packet.data[0]||null;
            var args=packet.data&&packet.data.slice(1)||[];
            window.__wbBossEmitLog.push({t:Date.now(),dir:'SEND',evt:ev,args:JSON.stringify(args).slice(0,300)});
          }
          return _origPkt&&_origPkt.call(this,packet);
        };
      }
      if(!SP.__wbOE){
        SP.__wbOE=true;
        var _oe=SP.onevent;
        SP.onevent=function(p){
          if(!window.__wbSocket)window.__wbSocket=this;
          if(p&&p.data&&p.data[0]){
            window.__sioPackets=window.__sioPackets||[];
            window.__sioPackets.push({t:Date.now(),dir:'EVENT',evt:p.data[0],args:JSON.stringify(p.data).slice(0,300)});
          }
          if(_oe)_oe.call(this,p);
        };
      }
    }
    setTimeout(__wbInstallSio,500);
    
    window.__wbSend=function(action){
      if(!window.__wbSocket||!window.__wbSocket.emit){
        setTimeout(function(){if(window.__wbSocket)window.__wbSocket.emit('bossAction',action);},200);
        return;
      }
      try{window.__wbSocket.emit('bossAction',action);}catch(e){}
    };
    window.__wbSendPotion=function(type){
      if(!window.__wbSocket)return;
      try{window.__wbSocket.emit('usePotion',{type:type||'potion_heal'});}catch(e){}
    };
    window.__wbCastSkill=function(id,target){
      if(!window.__wbSocket)return;
      try{var p={id:id};if(target)p.target=target;window.__wbSocket.emit('castSkill',p);}catch(e){}
    };
    window.__wbSetBossSet=function(s){
      if(!window.__wbSocket)return;
      try{window.__wbSocket.emit('setBossSet',s);}catch(e){}
    };
    function __wbBossLoop(){
      if(!window.__wbBossAuto.running)return;
      var ls=window.lastState||{};var ch=ls.char||{};var boss=ls.boss||{};var cd=boss.cd||{};var cfg=window.__wbBossAuto.config;
      var hpPct=ch.maxHp>0?ch.hp/ch.maxHp:1;
      try{
        if(cfg.pot&&hpPct<(cfg.hpPct/100)&&cd.pot<0.05)window.__wbSend('pot');
        if(cfg.heal&&cd.heal<0.05)window.__wbSend('heal');
        if(cfg.barrier&&boss.hp>0&&boss.maxHp>0&&(boss.hp/boss.maxHp)<(cfg.barrierPct/100)&&cd.barrier<0.05&&boss.barrierHas)window.__wbSend('barrier');
        if(cfg.atk&&ls.mode==='bosscombat'&&cd.atk<0.05)window.__wbSend('atk');
      }catch(e){}
      window.__wbBossAuto.timer=setTimeout(__wbBossLoop,500);
    }
    window.__wbBossAutoStart=function(){window.__wbBossAuto.running=true;__wbBossLoop();};
    window.__wbBossAutoStop=function(){window.__wbBossAuto.running=false;if(window.__wbBossAuto.timer)clearTimeout(window.__wbBossAuto.timer);};
    window.__wbBypassCD=false;
    window.__wbToggleBypass=function(on){
      window.__wbBypassCD=on;
      if(on&&!window.__wbBypassPatched){
        window.__wbBypassPatched=true;
        var _orig=window.updateBossCd;
        if(_orig){
          window.updateBossCd=function(){
            try{_orig.apply(this,arguments);}catch(e){}
            var keys=['pot','atk','heal','convert','barrier','holybarrier'];
            keys.forEach(function(k){var b=document.getElementById('bact-'+k);if(b)b.disabled=false;});
          };
        }
        var _origRBP=window.renderBossPanel;
        if(_origRBP){
          window.renderBossPanel=function(p){
            try{_origRBP.apply(this,arguments);}catch(e){_origRBP(p);}
            setTimeout(function(){
              document.querySelectorAll('.bact-btn[id]').forEach(function(b){
                var k=b.dataset&&b.dataset.k;
                if(k&&!b.__wbBypass){
                  b.__wbBypass=true;
                  b.addEventListener('click',function(){window.__wbSend(k);b.disabled=false;});
                }
              });
            },50);
          };
        }
      }
    };
    window.__wbBossHookInstalled=true;
  }

  // Remove old panel if exists
  var old=document.getElementById('__wbPanel');
  if(old)old.remove();

  // Create panel
  var panel=document.createElement('div');
  panel.className='__wbPanel';
  panel.id='__wbPanel';
  panel.innerHTML=[
    '<style>',
    '*{margin:0;padding:0;box-sizing:border-box;}',
    '.__wbPanel{position:fixed;top:10px;right:10px;z-index:999999;width:290px;background:#0a0e1aee;border-radius:14px;border:1px solid #1a2540;box-shadow:0 8px 32px rgba(0,0,0,0.7);font-size:12px;color:#e0e0e0;overflow:hidden;transition:all 0.3s;}',
    '.__wbPanel.mini{width:150px;}',
    '.__wbHdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0f1a2e;cursor:pointer;border-bottom:1px solid #1a2540;}',
    '.__wbHdrL{display:flex;align-items:center;gap:8px;}',
    '.__wbDot{width:8px;height:8px;border-radius:50%;background:#e94560;}',
    '.__wbTitle{font-size:12px;font-weight:bold;color:#e94560;letter-spacing:0.5px;}',
    '.__wbVer{font-size:9px;color:#4a6080;margin-left:4px;}',
    '.__wbMin{background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:0 4px;}',
    '.__wbClose{background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:0 4px;}',
    '.__wbClose:hover{color:#e94560;}',
    '.__wbBody{padding:10px;display:none;}',
    '.__wbBody.open{display:block;}',
    '.__wbSec{background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px;margin-bottom:8px;}',
    '.__wbSecTit{font-size:10px;color:#607080;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;}',
    '.__wbBossName{font-weight:bold;font-size:13px;color:#e94560;margin-bottom:2px;}',
    '.__wbBossLv{font-size:10px;color:#607080;margin-bottom:6px;}',
    '.__wbHpRow{display:flex;justify-content:space-between;font-size:10px;color:#888;margin-bottom:3px;}',
    '.__wbHpBarBg{background:#2a1010;border-radius:4px;height:12px;}',
    '.__wbHpBar{height:100%;background:#e94560;border-radius:4px;transition:width 0.4s,background 0.4s;}',
    '.__wbHpBar.yel{background:#fbbf24;}',
    '.__wbHpBar.red{background:#dc2626;}',
    '.__wbBuffs{font-size:10px;color:#60a5fa;margin-top:4px;min-height:14px;}',
    '.__wbCDGrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;}',
    '.__wbCDItem{background:rgba(255,255,255,0.04);border-radius:4px;padding:5px 6px;text-align:center;}',
    '.__wbCDItem.ready{background:rgba(74,222,128,0.1);}',
    '.__wbCDItem.cooldown{background:rgba(233,69,96,0.1);}',
    '.__wbCDIcon{font-size:14px;display:block;}',
    '.__wbCDLabel{font-size:9px;color:#607080;display:block;margin-top:1px;}',
    '.__wbCDTime{font-size:10px;font-weight:bold;display:block;margin-top:2px;}',
    '.__wbCDTime.ready{color:#4ade80;}',
    '.__wbCDTime.cooldown{color:#e94560;}',
    '.__wbBtnGrid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}',
    '.__wbBtn{padding:9px 6px;border-radius:8px;border:none;cursor:pointer;font-size:11px;font-weight:bold;transition:all 0.15s;display:flex;flex-direction:column;align-items:center;gap:2px;}',
    '.__wbBtn:hover{filter:brightness(1.3);transform:translateY(-1px);}',
    '.__wbBtn:active{transform:scale(0.95);}',
    '.__wbBtnPot{background:linear-gradient(135deg,#1a3a1a,#0f2a0f);border:1px solid #2a6a2a;color:#4ade80;}',
    '.__wbBtnAtk{background:linear-gradient(135deg,#3a1a1a,#2a0f0f);border:1px solid #7a2a2a;color:#f87171;}',
    '.__wbBtnHeal{background:linear-gradient(135deg,#1a3a2a,#0f2a1a);border:1px solid #2a7a4a;color:#86efac;}',
    '.__wbBtnConvert{background:linear-gradient(135deg,#2a2a4a,#1a1a3a);border:1px solid #4a4a9a;color:#a5b4fc;}',
    '.__wbBtnBarrier{background:linear-gradient(135deg,#2a2a4a,#1a1a3a);border:1px solid #4a4a9a;color:#818cf8;}',
    '.__wbBtnHoly{background:linear-gradient(135deg,#3a2a3a,#2a1a2a);border:1px solid #7a3a7a;color:#d8b4fe;}',
    '.__wbBtnFull{grid-column:1/-1;background:linear-gradient(135deg,#1a2a3a,#0f1f2e);border:1px solid #2a4a7a;color:#60a5fa;font-size:12px;padding:10px;}',
    '.__wbBtnBig{grid-column:1/-1;padding:11px;border-radius:8px;font-size:13px;font-weight:bold;border:none;cursor:pointer;transition:all 0.15s;}',
    '.__wbBtnBig:hover{filter:brightness(1.2);}',
    '.__wbBtnStart{background:linear-gradient(135deg,#0f3460,#1a4a8a);color:#fff;}',
    '.__wbBtnStop{background:linear-gradient(135deg,#e94560,#c73550);color:#fff;}',
    '.__wbRow{display:flex;align-items:center;gap:6px;margin-bottom:5px;}',
    '.__wbRow input[type=checkbox]{width:13px;height:13px;cursor:pointer;accent-color:#e94560;}',
    '.__wbRow label{font-size:10px;color:#aaa;cursor:pointer;}',
    '.__wbRow input[type=number]{width:45px;padding:2px 5px;background:#1a2540;border:1px solid #2a3a5a;border-radius:4px;color:#fff;font-size:10px;text-align:center;}',
    '.__wbBypass{background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.2);border-radius:6px;padding:6px 8px;margin-bottom:8px;}',
    '.__wbBypass input{accent-color:#ffd700;}',
    '.__wbBypass label{color:#ffd700;font-size:11px;}',
    '.__wbBypassTip{font-size:9px;color:#555;margin-top:2px;padding-left:22px;}',
    '.__wbSockRow{display:flex;justify-content:space-between;font-size:10px;color:#607080;padding:2px 0;}',
    '.__wbSockDot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px;}',
    '.__wbSockDot.ok{background:#4ade80;}',
    '.__wbSockDot.bad{background:#e94560;}',
    '.__wbFoot{text-align:center;font-size:9px;color:#304050;padding:4px;border-top:1px solid #1a2540;}',
    '</style>',
    '<div id=\"__wbHdr\" class=\"__wbHdr\">',
      '<div class=\"__wbHdrL\"><div class=\"__wbDot\"></div><span class=\"__wbTitle\">世界王控制</span><span class=\"__wbVer\">v1.31</span></div>',
      '<div><button class=\"__wbMin\" id=\"__wbMin\">-</button><button class=\"__wbClose\" id=\"__wbClose\">x</button></div>',
    '</div>',
    '<div class=\"__wbBody open\" id=\"__wbBody\">',
      '<div class=\"__wbSec\">',
        '<div class=\"__wbSecTit\">世界王狀態</div>',
        '<div class=\"__wbBossName\" id=\"__wb_boss_name\">--</div>',
        '<div class=\"__wbBossLv\" id=\"__wb_boss_lv\">mode: --</div>',
        '<div class=\"__wbHpRow\"><span>BOSS HP</span><span id=\"__wb_boss_hp_text\">--/--</span></div>',
        '<div class=\"__wbHpBarBg\"><div class=\"__wbHpBar\" id=\"__wb_boss_hp_bar\" style=\"width:0%\"></div></div>',
        '<div class=\"__wbBuffs\" id=\"__wb_boss_buffs\"></div>',
      '</div>',
      '<div class=\"__wbSec\">',
        '<div class=\"__wbSecTit\">冷卻計時</div>',
        '<div class=\"__wbCDGrid\" id=\"__wb_cd_grid\">',
          '<div class=\"__wbCDItem ready\" id=\"__wb_cd_pot\"><span class=\"__wbCDIcon\">💊</span><span class=\"__wbCDLabel\">藥水</span><span class=\"__wbCDTime ready\">就緒</span></div>',
          '<div class=\"__wbCDItem ready\" id=\"__wb_cd_atk\"><span class=\"__wbCDIcon\">⚔️</span><span class=\"__wbCDLabel\">攻擊</span><span class=\"__wbCDTime ready\">就緒</span></div>',
          '<div class=\"__wbCDItem ready\" id=\"__wb_cd_heal\"><span class=\"__wbCDLabel\">💚 治療</span><span class=\"__wbCDTime ready\">就緒</span></div>',
          '<div class=\"__wbCDItem ready\" id=\"__wb_cd_convert\"><span class=\"__wbCDIcon\">🔄</span><span class=\"__wbCDLabel\">轉換</span><span class=\"__wbCDTime ready\">就緒</span></div>',
          '<div class=\"__wbCDItem ready\" id=\"__wb_cd_barrier\"><span class=\"__wbCDIcon\">🛡️</span><span class=\"__wbCDLabel\">屏障</span><span class=\"__wbCDTime ready\">就緒</span></div>',
          '<div class=\"__wbCDItem ready\" id=\"__wb_cd_holybarrier\"><span class=\"__wbCDIcon\">✨</span><span class=\"__wbCDLabel\">神聖</span><span class=\"__wbCDTime ready\">就緒</span></div>',
        '</div>',
      '</div>',
      '<div class=\"__wbSec\">',
        '<div class=\"__wbSecTit\">手動指令</div>',
        '<div class=\"__wbBtnGrid\">',
          '<button class=\"__wbBtn __wbBtnPot\" onclick=\"__wbSend(\'pot\')\">💊 藥水</button>',
          '<button class=\"__wbBtn __wbBtnAtk\" onclick=\"__wbSend(\'atk\')\">⚔️ 攻擊</button>',
          '<button class=\"__wbBtn __wbBtnHeal\" onclick=\"__wbSend(\'heal\')\">💚 治療</button>',
          '<button class=\"__wbBtn __wbBtnConvert\" onclick=\"__wbSend(\'convert\')\">🔄 轉換</button>',
          '<button class=\"__wbBtn __wbBtnBarrier\" onclick=\"__wbSend(\'barrier\')\">🛡️ 屏障</button>',
          '<button class=\"__wbBtn __wbBtnHoly\" onclick=\"__wbSend(\'holybarrier\')\">✨ 神聖</button>',
          '<button class=\"__wbBtn __wbBtnFull\" onclick=\"__wbSend(\'atk\');__wbSend(\'atk\');__wbSend(\'atk\')\">⚔️ 狂打攻擊（3連發）</button>',
        '</div>',
      '</div>',
      '<div class=\"__wbBypass\">',
        '<div class=\"__wbRow\">',
          '<input type=\"checkbox\" id=\"__wb_bypass\">',
          '<label for=\"__wb_bypass\">🔓 解除冷卻限制</label>',
        '</div>',
        '<div class=\"__wbBypassTip\">⚠️ 客戶端 bypass，伺服器仍驗證冷卻</div>',
      '</div>',
      '<div class=\"__wbSec\">',
        '<div class=\"__wbSecTit\">自動掛機</div>',
        '<div class=\"__wbRow\">',
          '<input type=\"checkbox\" id=\"__wb_auto_pot\" checked>',
          '<label for=\"__wb_auto_pot\">💊 HP &lt;</label>',
          '<input type=\"number\" id=\"__wb_auto_hp\" value=\"50\" min=\"1\" max=\"100\">',
          '<span style=\"font-size:10px;color:#555;\">%</span>',
        '</div>',
        '<div class=\"__wbRow\">',
          '<input type=\"checkbox\" id=\"__wb_auto_heal\">',
          '<label for=\"__wb_auto_heal\">💚 自動治療</label>',
        '</div>',
        '<div class=\"__wbRow\">',
          '<input type=\"checkbox\" id=\"__wb_auto_barrier\">',
          '<label for=\"__wb_auto_barrier\">🛡️ Boss HP &lt;</label>',
          '<input type=\"number\" id=\"__wb_auto_barrier_pct\" value=\"30\" min=\"1\" max=\"100\">',
          '<span style=\"font-size:10px;color:#555;\">%</span>',
        '</div>',
        '<div class=\"__wbRow\">',
          '<input type=\"checkbox\" id=\"__wb_auto_atk\">',
          '<label for=\"__wb_auto_atk\">⚔️ 自動攻擊</label>',
        '</div>',
        '<div id=\"__wb_auto_status\" style=\"font-size:10px;color:#607080;text-align:center;margin-bottom:6px;\">⏹ 停止中</div>',
        '<button class=\"__wbBtnBig __wbBtnStart\" id=\"__wb_auto_btn\" onclick=\"__wbToggleAuto()\">▶ 啟動自動BOSS</button>',
      '</div>',
      '<div class=\"__wbSec\">',
        '<div class=\"__wbSecTit\">Socket.IO 狀態</div>',
        '<div class=\"__wbSockRow\"><span>連接</span><span><span class=\"__wbSockDot bad\" id=\"__wb_sock_dot\"></span><span id=\"__wb_sock_status\">檢測中...</span></span></div>',
        '<div class=\"__wbSockRow\"><span>已發送</span><span id=\"__wb_sock_sent\" style=\"color:#4ade80;\">0</span></div>',
        '<div class=\"__wbSockRow\"><span>已接收</span><span id=\"__wb_sock_evts\" style=\"color:#00d9ff;\">0</span></div>',
        '<div class=\"__wbSockRow\"><span>角色HP</span><span id=\"__wb_char_hp\" style=\"color:#ffd700;\">--</span></div>',
      '</div>',
      '<div style=\"text-align:center;margin-top:4px;\">',
        '<button style=\"padding:5px 12px;background:#1a2a3a;border:1px solid #2a4a5a;border-radius:6px;color:#607080;font-size:10px;cursor:pointer;margin-right:4px;\" onclick=\"__wbExport()\">📥 匯出</button>',
        '<button style=\"padding:5px 12px;background:#1a2a3a;border:1px solid #2a4a5a;border-radius:6px;color:#607080;font-size:10px;cursor:pointer;\" onclick=\"window.__wbBossEmitLog=[];window.__sioPackets=[];\">🗑 清除</button>',
      '</div>',
    '</div>',
    '<div class=\"__wbFoot\">WB Boss Panel v1.31 | linh5web.win</div>'
  ].join('');

  // Setup event handlers
  var minBtn=panel.querySelector('#__wbMin');
  var closeBtn=panel.querySelector('#__wbClose');
  var bodyEl=panel.querySelector('#__wbBody');
  minBtn.onclick=function(){
    bodyEl.classList.toggle('open');
    minBtn.textContent=bodyEl.classList.contains('open')?'-':'+';
    panel.classList.toggle('mini',!bodyEl.classList.contains('open'));
  };
  closeBtn.onclick=function(){panel.style.display='none';};

  // Auto config sync
  function syncConfig(){
    var cfg=window.__wbBossAuto.config;
    cfg.pot=panel.querySelector('#__wb_auto_pot').checked;
    cfg.heal=panel.querySelector('#__wb_auto_heal').checked;
    cfg.barrier=panel.querySelector('#__wb_auto_barrier').checked;
    cfg.atk=panel.querySelector('#__wb_auto_atk').checked;
    cfg.hpPct=parseInt(panel.querySelector('#__wb_auto_hp').value)||50;
    cfg.barrierPct=parseInt(panel.querySelector('#__wb_auto_barrier_pct').value)||30;
  }
  panel.querySelector('#__wb_auto_pot').addEventListener('change',syncConfig);
  panel.querySelector('#__wb_auto_heal').addEventListener('change',syncConfig);
  panel.querySelector('#__wb_auto_barrier').addEventListener('change',syncConfig);
  panel.querySelector('#__wb_auto_atk').addEventListener('change',syncConfig);
  panel.querySelector('#__wb_auto_hp').addEventListener('input',syncConfig);
  panel.querySelector('#__wb_auto_barrier_pct').addEventListener('input',syncConfig);
  panel.querySelector('#__wb_bypass').addEventListener('change',function(){
    if(window.__wbToggleBypass)window.__wbToggleBypass(this.checked);
  });

  // Auto toggle
  panel.querySelector('#__wb_auto_btn').onclick=function(){
    if(window.__wbBossAuto.running){
      if(window.__wbBossAutoStop)window.__wbBossAutoStop();
      this.textContent='▶ 啟動自動BOSS';
      this.className='__wbBtnBig __wbBtnStart';
      panel.querySelector('#__wb_auto_status').textContent='⏹ 停止中';
      panel.querySelector('#__wb_auto_status').style.color='#607080';
    }else{
      syncConfig();
      if(window.__wbBossAutoStart)window.__wbBossAutoStart();
      this.textContent='■ 停止自動BOSS';
      this.className='__wbBtnBig __wbBtnStop';
      panel.querySelector('#__wb_auto_status').textContent='⚡ 自動BOSS運行中...';
      panel.querySelector('#__wb_auto_status').style.color='#4ade80';
    }
  };

  // Export
  window.__wbExport=function(){
    var all=(window.__wbBossEmitLog||[]).concat(window.__sioPackets||[]);
    var blob=new Blob([JSON.stringify(all,null,2)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='wb_packets_'+Date.now()+'.json';a.click();
  };

  // Update UI loop
  function updateUI(){
    var ls=window.lastState||{};var ch=ls.char||{};var boss=ls.boss||{};var cd=boss.cd||{};
    // Boss name
    var ne=panel.querySelector('#__wb_boss_name');
    if(ne)ne.textContent=boss.name?(boss.name+' (Lv.'+(boss.lv||'?')+')'):'-- 無世界王 --';
    var le=panel.querySelector('#__wb_boss_lv');
    if(le)le.textContent='mode: '+(ls.mode||'--');
    // Boss HP
    var hte=panel.querySelector('#__wb_boss_hp_text');
    if(hte)hte.textContent=boss.hp?(boss.hp+' / '+boss.maxHp):'--/--';
    var hbe=panel.querySelector('#__wb_boss_hp_bar');
    if(hbe){
      var pct=boss.maxHp>0?Math.round(boss.hp/boss.maxHp*100):0;
      hbe.style.width=pct+'%';
      hbe.className='__wbHpBar'+(pct>50?'':(pct>25?' yel':' red'));
    }
    // Buffs
    var be=panel.querySelector('#__wb_boss_buffs');
    if(be){
      var parts=[];
      if(boss.barrierOn)parts.push('🛡️ 屏障ON');
      if(boss.barrierHas)parts.push('📦 有屏障');
      be.textContent=parts.join(' | ');
    }
    // Cooldowns
    ['pot','atk','heal','convert','barrier','holybarrier'].forEach(function(k){
      var el=panel.querySelector('#__wb_cd_'+k);
      if(!el)return;
      var v=cd[k]||0;
      var timeEl=el.querySelector('.__wbCDTime');
      if(v>0.05){
        if(timeEl){timeEl.textContent=v.toFixed(1)+'s';timeEl.className='__wbCDTime cooldown';}
        el.className='__wbCDItem cooldown';
      }else{
        if(timeEl){timeEl.textContent='就緒';timeEl.className='__wbCDTime ready';}
        el.className='__wbCDItem ready';
      }
    });
    // Socket status
    var sokEl=panel.querySelector('#__wb_sock_status');
    var dotEl=panel.querySelector('#__wb_sock_dot');
    if(sokEl){
      var ok=!!(window.__wbSocket&&window.__wbSocket.connected);
      sokEl.textContent=ok?'✅ 已連接':'❌ 未連接';
      sokEl.style.color=ok?'#4ade80':'#e94560';
      if(dotEl)dotEl.className='__wbSockDot '+(ok?'ok':'bad');
    }
    var se=panel.querySelector('#__wb_sock_sent');
    if(se)se.textContent=(window.__wbBossEmitLog||[]).length;
    var ee=panel.querySelector('#__wb_sock_evts');
    if(ee)ee.textContent=(window.__sioPackets||[]).length;
    var ce=panel.querySelector('#__wb_char_hp');
    if(ce)ce.textContent=ch.hp?(ch.hp+'/'+ch.maxHp):'--';
  }

  // Start updater
  var updater=setInterval(updateUI,400);
  updateUI();

  document.body.appendChild(panel);
  console.log('[WB] Boss Panel UI ready');
})();
