// advanced-farming.js
// 進階掛機規則引擎 - 條件 → 動作
// 資料儲存：chrome.storage.local (取代 IndexedDB)
// 規則評估：每 game-monitor loop tick (1s)
// 通訊介面：window.__gmAdvanced

(function(){
  if(window.__gmAdvancedLoaded){
    console.log('[AdvFarm] Already loaded');
    return;
  }
  window.__gmAdvancedLoaded=true;

  // ====== chrome.storage.local keys ======
  var RULE_KEY='gmAdvancedRules';
  var MONSTER_KEY='gmMonsters';
  var SKILL_KEY='gmSkillSettings';

  // ====== 通用快取輔助 ======
  // 使用 window.__gmStorageSet/Get（game-monitor.js 掛載的 chrome.storage.local relay）
  function storageSet(key,data){return window.__gmStorageSet(key,data)}
  function storageGet(key){return window.__gmStorageGet([key]).then(function(r){return r&&r[key]||null})}

  // ====== 規則資料存取 ======
  var _rulesCache=null;
  function loadRules(){return storageGet(RULE_KEY).then(function(r){_rulesCache=r||[];return _rulesCache})}
  function saveRules(){return storageSet(RULE_KEY,_rulesCache)}
  function nextId(){
    var max=0;
    (_rulesCache||[]).forEach(function(r){if(r.id>max)max=r.id});
    return max+1;
  }

  var AdvDB={
    getAll:function(){
      return loadRules().then(function(a){
        return a.slice().sort(function(x,y){
          return ((x.priority||0)-(y.priority||0))||(x.id-y.id);
        });
      });
    },
    save:function(rule){
      return loadRules().then(function(){
        if(rule.id){
          var idx=-1;
          for(var i=0;i<_rulesCache.length;i++){if(_rulesCache[i].id===rule.id){idx=i;break}}
          if(idx>=0)_rulesCache[idx]=rule;else _rulesCache.push(rule);
        }else{
          rule.id=nextId();
          _rulesCache.push(rule);
        }
        return saveRules();
      });
    },
    delete:function(id){
      return loadRules().then(function(){
        _rulesCache=_rulesCache.filter(function(r){return r.id!==id});
        return saveRules();
      });
    },
    clear:function(){
      return loadRules().then(function(){_rulesCache=[];return saveRules()});
    }
  };

  // ====== 怪物名稱自動收錄 ======
  var __gmMonsterDB={
    addAll:function(names){
      if(!names||!names.length)return Promise.resolve();
      return storageGet(MONSTER_KEY).then(function(existing){
        var set={};
        (existing||[]).forEach(function(n){set[n]=true});
        names.forEach(function(n){if(n)set[n]=true});
        var sorted=Object.keys(set).sort();
        return storageSet(MONSTER_KEY,sorted);
      }).catch(function(e){console.warn('[AdvFarm] monsterDB addAll error:',e)});
    },
    getAllNames:function(){
      return storageGet(MONSTER_KEY).then(function(a){return a||[]}).catch(function(){return[]});
    },
    clear:function(){
      return storageSet(MONSTER_KEY,[]).catch(function(){});
    }
  };

  // ====== 技能設定存取（Skills Tab 寫入） ======
  var __gmSkillDB={
    save:function(charName,skills,skillNames){
      if(!charName)return Promise.resolve();
      return storageGet(SKILL_KEY).then(function(arr){
        arr=arr||[];
        var found=false;
        for(var i=0;i<arr.length;i++){
          if(arr[i].charName===charName){
            arr[i]={charName:charName,updatedAt:Date.now(),skills:skills||{},skillNames:skillNames||arr[i].skillNames||{}};
            found=true;break;
          }
        }
        if(!found)arr.push({charName:charName,updatedAt:Date.now(),skills:skills||{},skillNames:skillNames||{}});
        return storageSet(SKILL_KEY,arr);
      }).catch(function(e){console.warn('[AdvFarm] skillDB save error:',e)});
    },
    getLatest:function(){
      return storageGet(SKILL_KEY).then(function(arr){
        if(!arr||!arr.length)return null;
        return arr.sort(function(x,y){return(y.updatedAt||0)-(x.updatedAt||0)})[0];
      }).catch(function(){return null});
    },
    getAllKeys:function(){
      return storageGet(SKILL_KEY).then(function(arr){
        return(arr||[]).map(function(x){return x.charName;}).filter(Boolean).sort();
      }).catch(function(){return[]});
    },
    clear:function(){
      return storageSet(SKILL_KEY,[]).catch(function(){});
    }
  };

  // ====== 全域匯出/匯入（供 game-monitor.js 呼叫） ======
  var __gmExportAll=function(){
    return Promise.all([
      AdvDB.getAll(),
      __gmMonsterDB.getAllNames(),
      __gmSkillDB.getLatest()
    ]).then(function(results){
      return{
        version:2,
        exportedAt:new Date().toISOString(),
        advanced_rules:results[0],
        monsters:results[1],
        skill_settings:results[2]
      };
    });
  };

  var __gmImportAll=function(data){
    if(!data||!data.version)return Promise.reject(new Error('格式錯誤'));
    var p=Promise.resolve();
    if(data.advanced_rules&&Array.isArray(data.advanced_rules)){
      p=p.then(function(){return AdvDB.clear()});
      data.advanced_rules.forEach(function(r){
        var nr={};
        Object.keys(r).forEach(function(k){if(k!=='id')nr[k]=r[k]});
        p=p.then(function(){return AdvDB.save(nr)});
      });
    }
    if(data.monsters&&Array.isArray(data.monsters)){
      p=p.then(function(){return __gmMonsterDB.clear()});
      p=p.then(function(){return __gmMonsterDB.addAll(data.monsters)});
    }
    if(data.skill_settings){
      p=p.then(function(){return __gmSkillDB.save(data.skill_settings.charName||'imported',data.skill_settings.skills||{})});
    }
    return p;
  };

  // ====== 規則類型定義 ======
  var CONDITION_TYPES={
    'monsterCount':{label:'怪物數量',unit:'隻',extract:function(state){
      return (state&&state.monsters)?state.monsters.filter(function(m){return m&&m.hp>0}).length:0;
    }},
    'monsterName':{label:'怪物名稱',unit:'',extract:function(state){
      // 回傳第一個存活怪物的名稱（供 ==/!= 比對），同時也支援計算數量
      var m=state&&state.monsters;
      if(!m||!m.length)return '';
      var alive=m.filter(function(x){return x&&x.hp>0});
      if(!alive.length)return '';
      return alive.map(function(x){return x.n||'';}).join('|'); // pipe-separated
    }},
    'monsterLevel':{label:'怪物等級',unit:'級',extract:function(state){
      var m=state&&state.monsters;
      if(!m||!m.length)return 0;
      var max=0;m.forEach(function(x){if(x&&x.lv&&x.lv>max)max=x.lv});
      return max;
    }},
    'hpPct':{label:'HP 百分比',unit:'%',extract:function(state){
      var c=state&&state.char;if(!c||!c.maxHp)return 100;
      return Math.round(c.hp/c.maxHp*100);
    }},
    'mpPct':{label:'MP 百分比',unit:'%',extract:function(state){
      var c=state&&state.char;if(!c||!c.maxMp)return 100;
      return Math.round(c.mp/c.maxMp*100);
    }},
    'zone':{label:'目前區域',unit:'',extract:function(state){
      return (state&&(state.zoneId||state.zoneName))||'';
    }},
    'mode':{label:'遊戲模式',unit:'',extract:function(state){
      return (state&&state.mode)||'';
    }},
    'gold':{label:'金幣數量',unit:'',extract:function(state){
      return (state&&state.char&&state.char.gold)||0;
    }}
  };

  var OPERATORS={
    '>':{label:'>',fn:function(a,b){return a>b}},
    '>=':{label:'>=',fn:function(a,b){return a>=b}},
    '<':{label:'<',fn:function(a,b){return a<b}},
    '<=':{label:'<=',fn:function(a,b){return a<=b}},
    '==':{label:'==',fn:function(a,b){return a==b}},
    '!=':{label:'!=',fn:function(a,b){return a!=b}}
  };

  var ACTION_TYPES={
    'castSkill':{label:'攻擊技能',params:['skillId'],hint:'從 gmSkillSettings 取技能，送 setAuto atkSkill'},
    'usePotion':{label:'使用藥水',params:['potionType'],hint:'potion_heal / strong_heal / ult_heal / mana / haste / brave'},
    'equipWeapon':{label:'裝備武器',params:['itemId'],hint:'武器物品 ID'},
    'equipArmor':{label:'裝備防具',params:['itemId'],hint:'防具物品 ID'},
    'attack':{label:'一般攻擊',params:[],hint:''},
    'toLobby':{label:'返回大廳',params:[],hint:''},
    'setTarget':{label:'指定目標',params:['targetValue','targetAll'],hint:'怪物名稱（部分匹配）或索引數字；勾「全部」→同時指定0,1,2'},
    'setAuto':{label:'開怪技能',params:['skillId'],hint:'從 gmSkillSettings 取技能，送 setAuto openSkill'}
  };

  // ====== API (chrome.storage.local 實作, 見上方 preamble) ======

  // ====== 規則評估引擎 ======
  function evalRule(rule,state){
    if(!rule.enabled)return false;
    if(!rule.conditions||!rule.conditions.length)return false;
    for(var i=0;i<rule.conditions.length;i++){
      var c=rule.conditions[i];
      var ctype=CONDITION_TYPES[c.type];
      if(!ctype)return false;
      var actual=ctype.extract(state);
      var op=OPERATORS[c.op];
      if(!op)return false;
      // 字串比對（monsterName 支援 contains / !contains）
      // 其他字串：精確比對；數字：數值比對
      var pass;
      if(c.type==='monsterName'&&(c.op==='=='||c.op==='!=')){
        // actual 是 pipe-separated names，expect 是部分名稱 → contains 語意
        var expect=String(c.value||'').toLowerCase().trim();
        var actualL=(actual||'').toLowerCase();
        pass=c.op==='=='?actualL.indexOf(expect)>-1:actualL.indexOf(expect)===-1;
      }else if(typeof actual==='string'){
        var expect=String(c.value||'');
        if(c.op==='==')pass=actual===expect;
        else if(c.op==='!=')pass=actual!==expect;
        else pass=false;
      }else{
        pass=op.fn(actual,parseFloat(c.value)||0);
      }
      if(!pass)return false;
    }
    return true;
  }

  function executeActions(actions,context){
    if(!window.__wbSocket||!window.__wbSocket.connected){
      console.log('[AdvFarm] socket not connected, skip');
      return;
    }
    actions.forEach(function(a){
      var atype=ACTION_TYPES[a.type];
      if(!atype)return;
      switch(a.type){
        case 'castSkill':
          (function(){
            var skillId=a.skillId||'strike';
            var panel=document.getElementById('panel-scroll');
            var targetSel=null;
            function findAndSet(){
              if(!panel)return;
              // 攻擊技能 → data-k="atkSkill"
              var atkSel=panel.querySelector('[data-k="atkSkill"]');
              if(atkSel){
                var opt=[].find.call(atkSel.options,function(o){return o.value===skillId});
                if(opt){
                  atkSel.value=skillId;
                  atkSel.dispatchEvent(new Event('change',{bubbles:true}));
                  console.log('[AdvFarm] castSkill DOM set atkSkill:',skillId);
                  return true;
                }
              }
              // fallback：找任何有 sk_ 選項的 select
              var sels=panel.querySelectorAll('select');
              for(var i=0;i<sels.length;i++){
                var sel=sels[i];
                if(![].some.call(sel.options,function(o){return/^sk_/.test(o.value)}))continue;
                var opt=[].find.call(sel.options,function(o){return o.value===skillId});
                if(!opt)continue;
                sel.value=skillId;
                sel.dispatchEvent(new Event('change',{bubbles:true}));
                console.log('[AdvFarm] castSkill DOM set (fallback):',skillId,'on',sel.getAttribute('data-k')||sel.className);
                return true;
              }
              return false;
            }
            // 先試當前可見的 DOM
            if(findAndSet())return;
            // 找不到就切到「設定」Tab 再試
            var setTab=document.querySelector('.tab[data-tab="set"]');
            if(setTab){
              setTab.click();
              console.log('[AdvFarm] castSkill: switched to set tab, retrying DOM find');
              setTimeout(function(){
                if(findAndSet())return;
                // 終極：發 socket
                window.__wbSocket.emit('setAuto',[{openSkill:skillId}]);
                console.log('[AdvFarm] castSkill socket fallback:',skillId);
              },300);
            } else {
              window.__wbSocket.emit('setAuto',[{openSkill:skillId}]);
              console.log('[AdvFarm] castSkill socket fallback:',skillId);
            }
          })();
          break;
        case 'usePotion':
          window.__wbSocket.emit('usePotion',{type:a.potionType||'potion_heal'});
          console.log('[AdvFarm] usePotion:',a.potionType);
          break;
        case 'equipWeapon':
          window.__wbSocket.emit('equipItem',{slot:'weapon',itemId:a.itemId});
          console.log('[AdvFarm] equipWeapon:',a.itemId);
          break;
        case 'equipArmor':
          window.__wbSocket.emit('equipItem',{slot:'armor',itemId:a.itemId});
          console.log('[AdvFarm] equipArmor:',a.itemId);
          break;
        case 'attack':
          window.__wbSocket.emit('attack');
          console.log('[AdvFarm] attack');
          break;
        case 'toLobby':
          window.__wbSocket.emit('toLobby');
          console.log('[AdvFarm] toLobby');
          break;
        case 'setTarget':
          (function(){
            var tv=a.targetValue;
            var monsters=(context&&context.state&&context.state.monsters)||[];
            // 找出所有活著的怪物索引
            var alive=monsters.map(function(m,i){return{m:m,i:i}}).filter(function(x){return x.m&&x.m.hp>0});
            // 全部模式：送所有活著的怪物
            if(a.targetAll){
              alive.forEach(function(x){
                window.__wbSocket.emit('setTarget',x.i);
              });
              console.log('[AdvFarm] setTarget ALL:',alive.map(function(x){return x.i+'('+x.m.n+')'}).join(', '));
              return;
            }
            // 單一目標
            var targetIdx=null;
            if(/^\d+$/.test(String(tv).trim())){
              targetIdx=parseInt(tv);
            } else if(tv){
              var name=String(tv).toLowerCase().trim();
              for(var mi=0;mi<alive.length;mi++){
                if(alive[mi].m.n.toLowerCase().indexOf(name)>-1){targetIdx=alive[mi].i;break;}
              }
            }
            if(targetIdx!==null){
              window.__wbSocket.emit('setTarget',targetIdx);
              console.log('[AdvFarm] setTarget:',targetIdx,tv);
            } else {
              console.warn('[AdvFarm] setTarget: no matching monster for "'+tv+'"');
            }
          })();
          break;
        case 'setAuto':
          (function(){
            var skillId=a.skillId||'strike';
            var panel=document.getElementById('panel-scroll');
            var targetSel=null;
            function findAndSet(){
              if(!panel)return;
              // 開怪技能 → data-k="openSkill"
              var openSel=panel.querySelector('[data-k="openSkill"]');
              if(openSel){
                var opt=[].find.call(openSel.options,function(o){return o.value===skillId});
                if(opt){
                  openSel.value=skillId;
                  openSel.dispatchEvent(new Event('change',{bubbles:true}));
                  console.log('[AdvFarm] setAuto DOM set openSkill:',skillId);
                  return true;
                }
              }
              // fallback：找任何有 sk_ 選項的 select
              var sels=panel.querySelectorAll('select');
              for(var i=0;i<sels.length;i++){
                var sel=sels[i];
                if(![].some.call(sel.options,function(o){return/^sk_/.test(o.value)}))continue;
                var opt=[].find.call(sel.options,function(o){return o.value===skillId});
                if(!opt)continue;
                sel.value=skillId;
                sel.dispatchEvent(new Event('change',{bubbles:true}));
                console.log('[AdvFarm] setAuto DOM set (fallback):',skillId,'on',sel.getAttribute('data-k')||sel.className);
                return true;
              }
              return false;
            }
            if(findAndSet())return;
            var setTab=document.querySelector('.tab[data-tab="set"]');
            if(setTab){
              setTab.click();
              console.log('[AdvFarm] setAuto: switched to set tab, retrying DOM find');
              setTimeout(function(){
                if(findAndSet())return;
                window.__wbSocket.emit('setAuto',[{openSkill:skillId}]);
                console.log('[AdvFarm] setAuto socket fallback:',skillId);
              },300);
            } else {
              window.__wbSocket.emit('setAuto',[{openSkill:skillId}]);
              console.log('[AdvFarm] setAuto socket fallback:',skillId);
            }
          })();
          break;
      }
    });
  }

  // ====== 防重複觸發（cooldown per rule） ======
  var _cooldowns={};
  function triggerRule(rule,context){
    var now=Date.now();
    var cd=rule.cooldownMs||3000;
    if(_cooldowns[rule.id]&&(now-_cooldowns[rule.id])<cd)return false;
    _cooldowns[rule.id]=now;
    executeActions(rule.actions,context);
    return true;
  }

  // ====== 對外 API ======
  window.__gmAdvanced={
    version:'1.5',
    CONDITION_TYPES:CONDITION_TYPES,
    OPERATORS:OPERATORS,
    ACTION_TYPES:ACTION_TYPES,
    AdvDB:AdvDB,
    MonsterDB:__gmMonsterDB,
    SkillDB:__gmSkillDB,
    evalRule:evalRule,
    triggerRule:triggerRule,
    exportAll:function(){return __gmExportAll()},
    importAll:function(d){return __gmImportAll(d)},
    refreshMonsterDatalist:refreshMonsterDatalist,
    refreshSkillDatalist:refreshSkillDatalist,
    // 由 game-monitor.js loop() 呼叫
    tick:function(state){
      if(!state)return;
      var self=this;
      // 自動收錄遇到過的怪物名稱（去重）
      var monsters=state&&state.monsters;
      // 儲存當前怪物供 UI 使用
      window.__gmCurrentMonsters=monsters?(monsters.map(function(m,i){return m&&m.hp>0?{i:i,n:m.n||'',hp:m.hp}:null}).filter(function(x){return x})):[];
      // 即時更新 Modal 狀態列
      if(document.getElementById('__gmAdvModal')&&document.getElementById('__gmAdvMonsterBar')){
        updateMonsterBar();
      }
      if(monsters&&monsters.length){
        var names=[];
        monsters.forEach(function(m){
          if(m&&m.n&&m.hp>0&&names.indexOf(m.n)===-1)names.push(m.n);
        });
        if(names.length){
          __gmMonsterDB.addAll(names).then(function(){
            // Modal 開著的話自動刷新下拉（計時器延後，避免每幀都刷新）
            if(!window.__gmAdvDlTimer){
              window.__gmAdvDlTimer=setTimeout(function(){
                window.__gmAdvDlTimer=null;
                refreshMonsterDatalist();
              },2000);
            }
          });
        }
      }
      AdvDB.getAll().then(function(rules){
        rules.forEach(function(rule){
          if(evalRule(rule,state)){
            var triggered=triggerRule(rule,{state:state});
            if(triggered)console.log('[AdvFarm] rule #'+rule.id+' triggered:',rule.name);
          }
        });
      }).catch(function(e){console.warn('[AdvFarm] tick error:',e)});
    },
    openModal:openAdvModal
  };

  // ====== Modal UI ======
  function openAdvModal(){
    if(document.getElementById('__gmAdvModal'))return;
    var m=document.createElement('div');
    m.id='__gmAdvModal';
    m.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Consolas,monospace;';
    m.innerHTML=
      '<div style="background:#0f0f23;border:2px solid #ffd700;border-radius:10px;width:680px;max-height:85vh;display:flex;flex-direction:column;color:#fff;">'+
        '<div style="padding:12px 16px;border-bottom:1px solid #0f3460;display:flex;justify-content:space-between;align-items:center;">'+
          '<div>'+
            '<div style="font-size:14px;font-weight:bold;color:#ffd700;">⚙️ 進階掛機規則</div>'+
            '<div style="font-size:10px;color:#888;margin-top:2px;">條件 → 動作（自動儲存）</div>'+
          '</div>'+
          '<button id="__gmAdvClose" style="background:#e94560;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;">×</button>'+
        '</div>'+
        '<div style="padding:8px 12px;background:#1a1a2e;display:flex;gap:6px;border-bottom:1px solid #0f3460;">'+
          '<button id="__gmAdvAdd" style="padding:5px 10px;background:#4ade80;border:none;color:#0f0f23;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">+ 新增規則</button>'+
          '<button id="__gmAdvExport" style="padding:5px 10px;background:#0f3460;border:1px solid #7bd14a;border-radius:4px;color:#7bd14a;font-size:11px;font-weight:bold;cursor:pointer;">📥 匯出</button>'+
          '<button id="__gmAdvImport" style="padding:5px 10px;background:#0f3460;border:1px solid #7bd14a;border-radius:4px;color:#7bd14a;font-size:11px;font-weight:bold;cursor:pointer;">📤 匯入</button>'+
          '<button id="__gmAdvClearMonsters" style="padding:5px 8px;background:#0f3460;border:1px solid #fbbf24;border-radius:4px;color:#fbbf24;font-size:11px;font-weight:bold;cursor:pointer;">🗑 清除怪物紀錄</button>'+
          '<button id="__gmAdvClear" style="padding:5px 10px;background:#e94560;border:none;color:#fff;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;margin-left:auto;">⚠️ 全部清除</button>'+
        '</div>'+
        // hidden datalist — 供所有 setTarget 下拉使用
        '<datalist id="__gmAdvMonsterList"></datalist>'+
        '<datalist id="__gmAdvSkillList"></datalist>'+
        '<div id="__gmAdvList" style="padding:12px 16px;overflow-y:auto;flex:1;"></div>'+
        '<div id="__gmAdvMonsterBar" style="padding:6px 12px;background:#0a0a18;border-top:1px solid #0f3460;min-height:28px;line-height:1.8;"><span style="font-size:10px;color:#888;">載入中怪物...</span></div>'+
        '<div id="__gmAdvStatus" style="padding:8px 12px;border-top:1px solid #0f3460;font-size:10px;color:#888;text-align:center;"></div>'+
      '</div>';
    document.body.appendChild(m);
    document.getElementById('__gmAdvClose').onclick=function(){m.remove()};
    document.getElementById('__gmAdvAdd').onclick=function(){addNewRule()};
    document.getElementById('__gmAdvExport').onclick=exportRules;
    document.getElementById('__gmAdvImport').onclick=importRules;
    document.getElementById('__gmAdvClear').onclick=function(){
      if(!confirm('確定清除所有規則？'))return;
      AdvDB.clear().then(function(){renderList();showStatus('已清除所有規則','#e94560')});
    };
    document.getElementById('__gmAdvClearMonsters').onclick=function(){
      if(!confirm('清除所有已記錄的怪物名稱？'))return;
      __gmMonsterDB.clear().then(function(){
        refreshMonsterDatalist();
        showStatus('已清除怪物紀錄','#fbbf24');
      });
    };
    m.onclick=function(e){if(e.target===m)m.remove()};
    refreshMonsterDatalist();
    refreshSkillDatalist();
    updateMonsterBar();
    renderList();
  }

  function refreshSkillDatalist(){
    var dl=document.getElementById('__gmAdvSkillList');
    if(!dl)return;
    // 直接從遊戲 DOM 三層掃描：繞過 __pmSkillNames / storage 不穩定的問題
    var found={};
    // 第1層：#panel-scroll 內的 data-k select（自動攻擊設定區）
    document.querySelectorAll('#panel-scroll [data-k]').forEach(function(el){
      if(el.tagName==='SELECT')[].forEach.call(el.options,function(o){
        var v=o.value;if(v&&/^sk_/.test(v)&&!found[v]){
          found[v]=o.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim()||v;
        }
      });
    });
    // 第2層：data-skill checkbox / input
    document.querySelectorAll('[data-skill]').forEach(function(el){
      var v=el.getAttribute('data-skill');if(v&&/^sk_/.test(v)&&!found[v]){
        var lbl=el.closest('label');found[v]=lbl?lbl.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim():v;
      }
    });
    // 第3層：全域 any select 含 sk_ 的 option
    document.querySelectorAll('select').forEach(function(sel){
      [].forEach.call(sel.options,function(o){
        var v=o.value;if(v&&/^sk_/.test(v)&&!found[v]){
          found[v]=o.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim()||v;
        }
      });
    });
    // 同步到 window 供外部使用
    window.__gmSkillMap=found;
    var options=Object.keys(found).sort().map(function(skillId){
      return'<option value="'+escapeHtml(skillId)+'">'+escapeHtml(found[skillId])+' ('+escapeHtml(skillId)+')</option>';
    });
    dl.innerHTML=options.join('');
    console.log('[AdvFarm] refreshSkillDatalist found', Object.keys(found).length, 'skills, first 5:', JSON.stringify(Object.keys(found).slice(0,5)));
  }

  function refreshMonsterDatalist(){
    var dl=document.getElementById('__gmAdvMonsterList');
    if(!dl)return;
    // 優先從 chrome.storage.local（遊戲 loop 收錄的怪物）
    __gmMonsterDB.getAllNames().then(function(names){
      if(names&&names.length){
        dl.innerHTML=names.map(function(n){return'<option value="'+escapeHtml(n)+'">'}).join('');
      } else {
        // fallback：從遊戲 DOM 的戰鬥畫面讀怪物名稱
        var fallback=[];
        document.querySelectorAll('.mob-name,[data-mob],.enemy-name').forEach(function(el){
          var t=el.textContent.trim();if(t&&fallback.indexOf(t)===-1)fallback.push(t);
        });
        if(fallback.length){
          dl.innerHTML=fallback.map(function(n){return'<option value="'+escapeHtml(n)+'">'}).join('');
        }
      }
    });
  }  function updateMonsterBar(){
    var el=document.getElementById('__gmAdvMonsterBar');
    if(!el)return;
    var mobs=window.__gmCurrentMonsters||[];
    if(!mobs.length){
      el.innerHTML='<span style="font-size:10px;color:#888;">無怪物</span>';
      return;
    }
    el.innerHTML=mobs.map(function(m){
      return'<span style="display:inline-block;margin:2px 4px;padding:2px 7px;background:#1a1a2e;border:1px solid #4ade80;border-radius:4px;font-size:10px;color:#4ade80;cursor:default;" title="索引:'+m.i+'">['+m.i+'] '+escapeHtml(m.n||'怪物')+'</span>';
    }).join('');
  }

  function showStatus(msg,color){
    var el=document.getElementById('__gmAdvStatus');
    if(el){el.textContent=msg;el.style.color=color||'#4ade80';}
  }

  function addNewRule(){
    var rule={
      name:'新規則',
      enabled:true,
      priority:10,
      cooldownMs:3000,
      conditions:[{type:'monsterCount',op:'>',value:'0'}],
      actions:[{type:'setTarget',targetValue:'0',targetAll:false}]
    };
    AdvDB.save(rule).then(function(){renderList()});
  }

  function renderList(){
    var list=document.getElementById('__gmAdvList');
    if(!list)return;
    list.innerHTML='<div style="text-align:center;color:#888;padding:20px;">載入中...</div>';
    AdvDB.getAll().then(function(rules){
      if(!rules.length){
        list.innerHTML='<div style="text-align:center;color:#666;padding:30px;">尚無規則<br><br>點「+ 新增規則」開始</div>';
        return;
      }
      var html='';
      rules.forEach(function(r){html+=renderRule(r)});
      list.innerHTML=html;
      attachHandlers();
    }).catch(function(e){
      list.innerHTML='<div style="text-align:center;color:#e94560;padding:20px;">載入失敗: '+e.message+'</div>';
    });
  }

  function renderRule(rule){
    var ctypeOpts='';
    Object.keys(CONDITION_TYPES).forEach(function(k){
      var sel=rule.conditions[0]&&rule.conditions[0].type===k?'selected':'';
      ctypeOpts+='<option value="'+k+'" '+sel+'>'+CONDITION_TYPES[k].label+'</option>';
    });
    var opOpts='';
    Object.keys(OPERATORS).forEach(function(k){
      var sel=rule.conditions[0]&&rule.conditions[0].op===k?'selected':'';
      opOpts+='<option value="'+k+'" '+sel+'>'+OPERATORS[k].label+'</option>';
    });
    var atypeOpts='';
    Object.keys(ACTION_TYPES).forEach(function(k){
      var sel=rule.actions[0]&&rule.actions[0].type===k?'selected':'';
      atypeOpts+='<option value="'+k+'" '+sel+'>'+ACTION_TYPES[k].label+'</option>';
    });
    return '<div data-rule-id="'+rule.id+'" style="background:#1a1a2e;border:1px solid #'+((rule.enabled)?'4ade80':'666')+';border-radius:8px;padding:10px;margin-bottom:8px;">'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">'+
        '<input type="checkbox" data-act="enabled" '+(rule.enabled?'checked':'')+' style="cursor:pointer;">'+
        '<input type="text" data-act="name" value="'+escapeHtml(rule.name)+'" style="flex:1;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:4px;font-size:12px;">'+
        '<span style="font-size:10px;color:#888;">CD:</span>'+
        '<input type="number" data-act="cooldownMs" value="'+(rule.cooldownMs||3000)+'" min="500" step="500" style="width:70px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:4px;font-size:11px;">'+
        '<span style="font-size:10px;color:#888;">ms</span>'+
        '<button data-act="del" style="background:#e94560;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-weight:bold;">×</button>'+
      '</div>'+
      '<div style="margin-bottom:6px;">'+
        '<div style="font-size:10px;color:#7bd14a;margin-bottom:4px;font-weight:bold;">條件（AND 邏輯）：</div>'+
        rule.conditions.map(function(c,i){
          var opts='';
          Object.keys(CONDITION_TYPES).forEach(function(k){
            opts+='<option value="'+k+'" '+(c.type===k?'selected':'')+'>'+CONDITION_TYPES[k].label+'</option>';
          });
          var opo='';
          Object.keys(OPERATORS).forEach(function(k){
            opo+='<option value="'+k+'" '+(c.op===k?'selected':'')+'>'+OPERATORS[k].label+'</option>';
          });
          return '<div data-cond-i="'+i+'" style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">'+
            '<select data-cf="type" style="flex:1;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:3px;font-size:10px;">'+opts+'</select>'+
            '<select data-cf="op" style="width:50px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:3px;font-size:10px;">'+opo+'</select>'+
            '<input data-cf="value" type="text" value="'+escapeHtml(String(c.value||''))+'" placeholder="值" style="flex:1;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:3px;font-size:10px;">'+
            '<button data-cf="del" style="background:#666;border:none;color:#fff;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:11px;">×</button>'+
          '</div>';
        }).join('')+
        '<button data-act="addCond" style="background:#0f3460;border:1px dashed #4ade80;color:#4ade80;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;margin-top:2px;">+ 條件</button>'+
      '</div>'+
      '<div>'+
        '<div style="font-size:10px;color:#fbbf24;margin-bottom:4px;font-weight:bold;">動作（全部執行）：</div>'+
        rule.actions.map(function(a,i){
          var opts='';
          Object.keys(ACTION_TYPES).forEach(function(k){
            opts+='<option value="'+k+'" '+(a.type===k?'selected':'')+'>'+ACTION_TYPES[k].label+'</option>';
          });
          var p1=a.skillId||a.potionType||a.itemId||a.targetValue||'';
          var placeholder=a.type==='setTarget'?'選擇或輸入怪物名稱 / 索引':a.type==='usePotion'?'例: potion_heal':'選擇技能';
          // setTarget / 攻擊技能 / 開怪技能：datalist 下拉（技能中文名）
          var paramInput='';
          if(a.type==='setTarget'){
            paramInput='<input data-af="param" list="__gmAdvMonsterList" type="text" value="'+escapeHtml(p1)+'" placeholder="選擇或輸入怪物名稱 / 索引" autocomplete="off" style="flex:1;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:3px;font-size:10px;">'+
              '<label style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;font-size:10px;color:#fbbf24;cursor:pointer;padding:0 4px;"><input data-af="targetAll" type="checkbox" '+(a.targetAll?'checked':'')+' style="cursor:pointer;">全部</label>';
          } else if(a.type==='castSkill'||a.type==='setAuto'){
            // 攻擊技能(castSkill) → setAuto atkSkill；開怪技能(setAuto) → setAuto openSkill
            paramInput='<input data-af="skillId" list="__gmAdvSkillList" type="text" value="'+escapeHtml(p1)+'" placeholder="'+placeholder+'" autocomplete="off" style="flex:1;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:3px;font-size:10px;">'+
              (a.type==='castSkill'
                ?'<span style="font-size:9px;color:#4ade80;white-space:nowrap;padding:0 3px;">攻</span>'
                :'<span style="font-size:9px;color:#fbbf24;white-space:nowrap;padding:0 3px;">開</span>');
          } else {
            paramInput='<input data-af="param" type="text" value="'+escapeHtml(p1)+'" placeholder="'+placeholder+'" style="flex:1;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:3px;font-size:10px;">';
          }
          return '<div data-act-i="'+i+'" style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">'+
            '<select data-af="type" style="flex:1;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;padding:3px;font-size:10px;">'+opts+'</select>'+
            paramInput+
            '<button data-af="del" style="background:#666;border:none;color:#fff;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:11px;">×</button>'+
          '</div>';
        }).join('')+
        '<button data-act="addAct" style="background:#0f3460;border:1px dashed #fbbf24;color:#fbbf24;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer;margin-top:2px;">+ 動作</button>'+
      '</div>'+
    '</div>';
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function attachHandlers(){
    var list=document.getElementById('__gmAdvList');
    if(!list)return;
    list.querySelectorAll('[data-rule-id]').forEach(function(card){
      var ruleId=parseInt(card.getAttribute('data-rule-id'));
      var rule=null;
      // 用 IDB 取出當前規則
      AdvDB.getAll().then(function(all){
        rule=all.find(function(r){return r.id===ruleId});
        if(!rule)return;

        // 儲存 helper
        var saveAndRefresh=function(){
          // 從 DOM 收集
          rule.name=card.querySelector('[data-act="name"]').value;
          rule.enabled=card.querySelector('[data-act="enabled"]').checked;
          rule.cooldownMs=parseInt(card.querySelector('[data-act="cooldownMs"]').value)||3000;
          rule.conditions=[];
          card.querySelectorAll('[data-cond-i]').forEach(function(row){
            var i=parseInt(row.getAttribute('data-cond-i'));
            rule.conditions.push({
              type:row.querySelector('[data-cf="type"]').value,
              op:row.querySelector('[data-cf="op"]').value,
              value:row.querySelector('[data-cf="value"]').value
            });
          });
          rule.actions=[];
          card.querySelectorAll('[data-act-i]').forEach(function(row){
            var t=row.querySelector('[data-af="type"]').value;
            var pEl=row.querySelector('[data-af="param"]');
            var skEl=row.querySelector('[data-af="skillId"]');
            var atEl=row.querySelector('[data-af="autoType"]');
            var a={type:t};
            if(t==='castSkill')a.skillId=(skEl||pEl).value;
            else if(t==='usePotion')a.potionType=(skEl||pEl).value;
            else if(t==='equipWeapon'||t==='equipArmor')a.itemId=(skEl||pEl).value;
            else if(t==='setTarget'){
              a.targetValue=(skEl||pEl).value;
              var taEl=row.querySelector('[data-af="targetAll"]');
              a.targetAll=taEl?taEl.checked:false;
            } else if(t==='setAuto'){
              a.skillId=(skEl||pEl).value;
            } else a[(skEl||pEl).getAttribute('data-af')==='param'?'potionType':'skillId']=(skEl||pEl).value;
            rule.actions.push(a);
          });
          AdvDB.save(rule).then(function(){
            showStatus('規則 #'+ruleId+' 已儲存');
          });
        };

        // 自動儲存（change 事件）
        card.addEventListener('change',saveAndRefresh);
        card.addEventListener('blur',saveAndRefresh,true);

        // 刪除
        card.querySelector('[data-act="del"]').onclick=function(){
          if(!confirm('刪除規則 #'+ruleId+'？'))return;
          AdvDB.delete(ruleId).then(function(){renderList()});
        };

        // 新增條件
        card.querySelector('[data-act="addCond"]').onclick=function(){
          rule.conditions.push({type:'monsterCount',op:'>',value:'1'});
          AdvDB.save(rule).then(function(){renderList()});
        };

        // 新增動作
        card.querySelector('[data-act="addAct"]').onclick=function(){
          rule.actions.push({type:'setAuto',skillId:'sk_fireball',autoType:'atkSkill'});
          AdvDB.save(rule).then(function(){renderList()});
        };

        // 刪除條件
        card.querySelectorAll('[data-cf="del"]').forEach(function(btn,idx){
          btn.onclick=function(){
            rule.conditions.splice(idx,1);
            if(!rule.conditions.length)rule.conditions.push({type:'monsterCount',op:'>',value:'1'});
            AdvDB.save(rule).then(function(){renderList()});
          };
        });

        // 刪除動作
        card.querySelectorAll('[data-af="del"]').forEach(function(btn,idx){
          btn.onclick=function(){
            rule.actions.splice(idx,1);
            if(!rule.actions.length)rule.actions.push({type:'attack'});
            AdvDB.save(rule).then(function(){renderList()});
          };
        });
      });
    });
  }

  function exportRules(){
    AdvDB.getAll().then(function(rules){
      var json=JSON.stringify(rules,null,2);
      var blob=new Blob([json],{type:'application/json'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');
      a.href=url;
      a.download='進階規則_'+new Date().toISOString().slice(0,10)+'.json';
      a.click();
      URL.revokeObjectURL(url);
      showStatus('已匯出 '+rules.length+' 條規則','#7bd14a');
    });
  }

  function importRules(){
    var input=document.createElement('input');
    input.type='file';
    input.accept='.json';
    input.onchange=function(e){
      var file=e.target.files[0];
      if(!file)return;
      var reader=new FileReader();
      reader.onload=function(ev){
        try{
          var rules=JSON.parse(ev.target.result);
          if(!Array.isArray(rules))throw new Error('格式錯誤');
          AdvDB.clear().then(function(){
            var p=Promise.resolve();
            rules.forEach(function(r){
              delete r.id;
              p=p.then(function(){return AdvDB.save(r)});
            });
            return p;
          }).then(function(){
            renderList();
            showStatus('已匯入 '+rules.length+' 條規則','#4ade80');
          });
        }catch(err){
          alert('匯入失敗: '+err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  console.log('[AdvFarm] Module loaded. Open via window.__gmAdvanced.openModal()');
})();
