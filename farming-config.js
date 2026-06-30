// ====== Farming Config Module (farming-config.js) ======
// Extracted from game-monitor.js v3.02 - Farm settings save/load via postMessage
(function(){
  if(window.__gmFarmingConfigLoaded) { console.log('[FarmingConfig] Already loaded'); return; }
  window.__gmFarmingConfigLoaded = true;

  // ====== Farm Settings Save ======
  window.__gmSaveFarmSettings = function(){
    var data={
      farmZone: document.getElementById('__gmp_farm_zone').value||'',
      hpThresh: parseInt(document.getElementById('__gmp_farm_hp').value)||20,
      mpThresh: parseInt(document.getElementById('__gmp_farm_mp').value)||10,
      hpEnabled: document.getElementById('__gmp_farm_hp_chk').checked,
      mpEnabled: document.getElementById('__gmp_farm_mp_chk').checked,
      hpGtThresh: parseInt(document.getElementById('__gmp_farm_hp_gt').value)||80,
      mpGtThresh: parseInt(document.getElementById('__gmp_farm_mp_gt').value)||50,
      hpGtEnabled: document.getElementById('__gmp_farm_hp_gt_chk').checked,
      mpGtEnabled: document.getElementById('__gmp_farm_mp_gt_chk').checked,
      logicOp: document.getElementById('__gmp_farm_logic').value||'AND',
      logicEnabled: document.getElementById('__gmp_farm_logic_chk').checked,
      autoAtk: document.getElementById('__gmp_farm_atk').checked,
      charName: document.getElementById('__gmp_farm_char_name').value||'',
      reconnectEnabled: document.getElementById('__gmp_farm_reconnect').checked,
      reconnectInterval: parseInt(document.getElementById('__gmp_farm_reconnect_interval').value)||60,
      charSlot: parseInt(document.getElementById('__gmp_farm_char_slot').value)||0,
      hpAction: document.getElementById('__gmp_farm_hp_action')?document.getElementById('__gmp_farm_hp_action').value:'selectChar',
      mpAction: document.getElementById('__gmp_farm_mp_action')?document.getElementById('__gmp_farm_mp_action').value:'selectChar',
      specifyTarget: document.getElementById('__gmp_farm_specify_target')?document.getElementById('__gmp_farm_specify_target').checked:false,
      targetIndex: document.getElementById('__gmp_farm_target_index')?parseInt(document.getElementById('__gmp_farm_target_index').value)||1:1,
      attackAll: document.getElementById('__gmp_farm_attack_all')?document.getElementById('__gmp_farm_attack_all').checked:false
    };
    window.postMessage({type:'GM_SAVE_SETTINGS',data:data},'*');
  };

  // ====== Farm Settings Load ======
  window.__gmLoadFarmSettings = function(callback){
    window.postMessage({type:'GM_LOAD_SETTINGS'},'*');
    window.__gmLoadCallback=callback;
  };
  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='GM_LOAD_RESPONSE'&&window.__gmLoadCallback){
      window.__gmLoadCallback(e.data.data);
      window.__gmLoadCallback=null;
    }
  });

  console.log('[FarmingConfig] Module loaded');
})();
