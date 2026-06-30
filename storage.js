// ====== Storage Module (storage.js) ======
// Extracted from game-monitor.js v3.00 - handles chrome.storage.local via content.js relay
(function(){
  if(window.__gmStorageLoaded) { console.log('[Storage] Already loaded'); return; }
  window.__gmStorageLoaded = true;

  // ========== Storage Helper (chrome.storage.local via content.js relay) ==========
  var __gmStorageSeq=0;
  var __gmStorageCbs={};
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='GM_STORAGE_RESPONSE'&&e.data.seq!==undefined&&__gmStorageCbs[e.data.seq]){
      __gmStorageCbs[e.data.seq](e.data.data||e.data);
      delete __gmStorageCbs[e.data.seq];
    }
  });
  // 儲存單一 key（掛到 window 供 advanced-farming.js 使用）
  function __gmStorageSet(key,data){
    return new Promise(function(resolve){
      var seq=++__gmStorageSeq;
      __gmStorageCbs[seq]=function(){resolve()};
      window.postMessage({type:'GM_STORAGE_SET',key:key,data:data,seq:seq},'*');
    });
  }
  // 讀取 key(s)，傳入單一字串回傳值，傳入陣列回傳物件
  function __gmStorageGet(keys){
    return new Promise(function(resolve){
      var seq=++__gmStorageSeq;
      __gmStorageCbs[seq]=function(resp){resolve(resp)};
      window.postMessage({type:'GM_STORAGE_GET',keys:Array.isArray(keys)?keys:[keys],seq:seq},'*');
    });
  }
  // 暴露到 window 讓其他腳本也能使用
  window.__gmStorageSet=__gmStorageSet;
  window.__gmStorageGet=__gmStorageGet;
  // ========== End Storage Helper ==========

  // ====== LogoutDB (chrome.storage.local) ======
  var LogoutDB=(function(){
    var KEY='gmLogoutHistory';
    var _cache=null;_cacheLoaded=false;
    function ensureLoaded(){
      if(_cacheLoaded)return Promise.resolve();
      return __gmStorageGet([KEY]).then(function(r){
        _cache=r&&r[KEY]||[];
        _cacheLoaded=true;
      });
    }
    function saveCache(){
      return __gmStorageSet(KEY,_cache);
    }
    function genId(){return Date.now()+'_'+Math.random().toString(36).slice(2,8)}
    return {
      add:function(ts,mode){
        return ensureLoaded().then(function(){
          _cache.push({id:genId(),ts:ts||Date.now(),mode:mode||'unknown'});
          return saveCache();
        });
      },
      getAll:function(){
        return ensureLoaded().then(function(){
          return _cache.slice().sort(function(x,y){return y.ts-x.ts});
        });
      },
      getBefore:function(b){
        var ts=b instanceof Date?b.getTime():b;
        return this.getAll().then(function(a){return a.filter(function(r){return r.ts<ts})});
      },
      getAfter:function(a){
        var ts=a instanceof Date?a.getTime():a;
        return this.getAll().then(function(a){return a.filter(function(r){return r.ts>=ts})});
      },
      getToday:function(){
        var now=new Date();
        var start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
        return this.getAll().then(function(a){return a.filter(function(r){return r.ts>=start})});
      },
      getByDayOffset:function(offset){
        var now=new Date();
        var base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
        base.setDate(base.getDate()-offset);
        var start=base.getTime();
        var end=start+86400000;
        return this.getAll().then(function(a){return a.filter(function(r){return r.ts>=start&&r.ts<end})});
      },
      clearAll:function(){return ensureLoaded().then(function(){_cache=[];return saveCache()})},
      clearBefore:function(b){
        var ts=b instanceof Date?b.getTime():b;
        var self=this;
        return self.getBefore(ts).then(function(old){
          var ids={};
          old.forEach(function(r){ids[r.id]=true});
          _cache=_cache.filter(function(r){return!ids[r.id]});
          return saveCache().then(function(){return old.length});
        });
      },
      count:function(){return ensureLoaded().then(function(){return _cache.length})},
      last:function(){return ensureLoaded().then(function(){return _cache.length?_cache[_cache.length-1]:null})},
      exportCache:function(){return ensureLoaded().then(function(){return JSON.parse(JSON.stringify(_cache))})},
      importCache:function(arr){_cache=Array.isArray(arr)?arr.slice():[];return saveCache()}
    };
  })();
  window.LogoutDB=LogoutDB;
  console.log('[LogoutDB] Storage local store loaded');
  
  // ====== Core Export/Import Functions ======
  window.__gmStorageExportAll = function(){
    return Promise.all([
      __gmStorageGet(['gmFarmSettings','gmSkillSettings','gmMonsters','gmAdvancedRules']),
      LogoutDB.exportCache()
    ]).then(function(results){
      var data = results[0] || {};
      data.logout_history = results[1];
      return data;
    });
  };
  window.__gmStorageImportAll = function(data){
    var promises = [];
    if (data.gmFarmSettings) promises.push(__gmStorageSet('gmFarmSettings', data.gmFarmSettings));
    if (data.gmSkillSettings) promises.push(__gmStorageSet('gmSkillSettings', data.gmSkillSettings));
    if (data.gmMonsters) promises.push(__gmStorageSet('gmMonsters', data.gmMonsters));
    if (data.gmAdvancedRules) promises.push(__gmStorageSet('gmAdvancedRules', data.gmAdvancedRules));
    if (data.logout_history && Array.isArray(data.logout_history)) {
      promises.push(LogoutDB.importCache(data.logout_history));
    }
    return Promise.all(promises);
  };
  console.log('[Storage] Module loaded');
})();
