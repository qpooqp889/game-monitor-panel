/**
 * packet-monitor.js v1.0
 * 封包監控載入器 - 自動引入 core + UI 兩個模組
 *
 * 模組化架構：
 *   - packet-monitor-core.js  純邏輯（Hook + 資料）
 *   - packet-monitor-ui.js    純介面（面板 + 控制）
 *   - packet-monitor.js       本檔案：自動載入上面兩個
 *
 * 用法（任選一種）：
 *   A) 把這 3 個檔案放到同目錄，在 HTML 加：
 *      <script src="packet-monitor.js"></script>
 *
 *   B) 透過瀏覽器 console 貼上 packet-monitor.js 內容
 *      （會自動 fetch 同目錄的 core + ui）
 *
 *   C) 透過 CDP 注入：把 3 個檔案依序注入（順序：core → ui）
 *
 * D) 一次貼全部（最簡單）：
 *   透過 CDP 注入一個「載入器」腳本，自動 eval 整段
 *
 * 載入完成後：
 *   window.__pmCore.start()   // 開始
 *   window.__pmCore.stop()    // 停止
 *   window.__pmCore.export()  // 匯出
 *   window.__pmUI.mount()     // 顯示面板
 *   window.__pmUI.unmount()   // 隱藏面板
 *
 * 注意：
 *   - 如果同目錄已有 core/ui 模組被 <script> 載入過，本檔案會跳過
 *   - 注入時請依序執行：core → ui → loader（本檔案）
 */

(function() {
  'use strict';

  // 防止重複執行
  if (window.__pmLoader) {
    console.warn('[PM] Loader already executed');
    return;
  }
  window.__pmLoader = true;

  var VERSION = 'v1.0';

  // 偵測已載入狀態
  var hasCore = typeof window.__pmCore !== 'undefined';
  var hasUI = typeof window.__pmUI !== 'undefined';

  console.log('[PM] Loader v' + VERSION + ' starting...');
  console.log('[PM]   Core loaded:', hasCore);
  console.log('[PM]   UI   loaded:', hasUI);

  if (hasCore && hasUI) {
    // 兩個都已載入，直接掛載
    console.log('[PM] Both modules ready, mounting UI...');
    if (window.__pmUI.mount) window.__pmUI.mount();
    finish();
    return;
  }

  // 嘗試動態載入（如果有 fetch）
  if (typeof fetch === 'function') {
    var baseUrl = getBaseUrl();
    var modules = [];

    if (!hasCore) {
      modules.push(loadModule(baseUrl + 'packet-monitor-core.js', 'Core'));
    }
    if (!hasUI) {
      modules.push(loadModule(baseUrl + 'packet-monitor-ui.js', 'UI'));
    }

    Promise.all(modules).then(function() {
      // 檢查實際載入狀態
      hasCore = typeof window.__pmCore !== 'undefined';
      hasUI = typeof window.__pmUI !== 'undefined';

      if (hasCore && hasUI) {
        console.log('[PM] All modules loaded, mounting UI...');
        window.__pmCore.install();
        if (window.__pmUI.mount) window.__pmUI.mount();
      } else {
        console.error('[PM] Module loading failed');
        console.error('  Core:', hasCore, 'UI:', hasUI);
        console.error('  請手動貼上 packet-monitor-core.js 與 packet-monitor-ui.js');
      }
      finish();
    }).catch(function(err) {
      console.error('[PM] Fetch error:', err);
      console.error('請確認 core/ui 檔案在同一目錄，或手動貼上內容');
      finish();
    });
  } else {
    console.warn('[PM] fetch 不存在，需手動載入模組');
    finish();
  }

  // ============================================
  // 工具
  // ============================================
  function getBaseUrl() {
    // 嘗試從 currentScript 取得 base URL
    try {
      var scripts = document.querySelectorAll('script[src]');
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src;
        if (src.indexOf('packet-monitor') > -1 && src.indexOf('packet-monitor.js') > -1) {
          return src.substring(0, src.lastIndexOf('/') + 1);
        }
      }
    } catch (e) {}
    // 預設同目錄
    return './';
  }

  function loadModule(url, name) {
    return new Promise(function(resolve, reject) {
      console.log('[PM] Fetching', name, 'from', url);
      fetch(url)
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function(code) {
          try {
            // 執行模組代碼
            (new Function(code))();
            console.log('[PM] ' + name + ' loaded');
            resolve();
          } catch (e) {
            console.error('[PM] ' + name + ' eval error:', e);
            reject(e);
          }
        })
        .catch(function(err) {
          console.error('[PM] ' + name + ' fetch error:', err);
          reject(err);
        });
    });
  }

  function finish() {
    console.log('');
    console.log('====================================');
    console.log('Packet Monitor Ready');
    console.log('====================================');
    console.log('命令列 API:');
    if (typeof window.__pmCore !== 'undefined') {
      console.log('  __pmCore.start()    // 開始監控');
      console.log('  __pmCore.stop()     // 停止監控');
      console.log('  __pmCore.export()   // 匯出 .txt');
      console.log('  __pmCore.getPackets()  // 取得所有封包');
      console.log('  __pmCore.on("packet", cb)  // 訂閱每筆封包');
    }
    if (typeof window.__pmUI !== 'undefined') {
      console.log('  __pmUI.mount()      // 顯示面板');
      console.log('  __pmUI.unmount()    // 隱藏面板');
      console.log('  __pmUI.toggle()     // 切換顯示');
    }
    console.log('====================================');
  }
})();
