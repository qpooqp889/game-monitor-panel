# packet-monitor v1.0 - 模組化封包監控工具

## 📐 模組化架構

```
game-monitor-panel/
├── packet-monitor.js          (4.7KB) 載入器
├── packet-monitor-core.js     (12KB)  核心邏輯（Hook + 資料）
├── packet-monitor-ui.js       (14KB)  介面（面板 + 控制）
└── packet-monitor-README.md            本文件
```

| 模組 | 職責 | 依賴 |
|------|------|------|
| `packet-monitor-core.js` | SIO/WS Hook、封包記錄、匯出 | 無 |
| `packet-monitor-ui.js` | 浮動面板、列表、控制項 | core |
| `packet-monitor.js` | 自動載入器（偵測 + fetch + mount） | core + ui |

**好處**：
- 想要無頭模式（無 UI）？只用 core
- 想換 UI？自己寫一個，訂閱 core 事件
- 想嵌入現有 UI？載入 core，呼叫 `__pmCore.on('packet', ...)` 即可

---

## 🚀 使用方式

### 方式 1：HTML 載入（最標準）

```html
<script src="packet-monitor.js"></script>
```

載入器會自動偵測同目錄的 core/ui 模組並載入。

### 方式 2：CDP 注入（最常用）

**單檔注入（最簡單）** - 把 `packet-monitor.js` 的內容當作腳本注入。
注入後會**失敗**（fetch 被 CORS 阻擋），但**不會壞掉**：
```
[PM] Fetch error: TypeError: Failed to fetch
```

**雙檔注入** - 依序注入：
1. `packet-monitor-core.js`
2. `packet-monitor-ui.js`

兩者都注入後，UI 會**自動 mount**。

**三檔注入** - 完整流程：
1. core（先，因為 ui 依賴它）
2. ui
3. loader（本檔案，會偵測前兩個已載入 → 自動 mount）

### 方式 3：手動呼叫（最彈性）

```javascript
// 1. 載入 core（必要）
// 2. 載入 ui（選用）
// 3. 然後：

window.__pmCore.install();   // 安裝 hook
window.__pmCore.start();     // 開始監控
// window.__pmUI.mount();    // （如果 ui 已載入，自動 mount）
```

---

## 💻 Core API（純邏輯）

### 控制
```javascript
window.__pmCore.install();   // 安裝 SIO/WS hook（必須先呼叫）
window.__pmCore.start();     // 開始記錄
window.__pmCore.stop();      // 停止記錄
window.__pmCore.clear();     // 清空所有資料
window.__pmCore.isRunning(); // 是否監控中
```

### 讀取
```javascript
window.__pmCore.getPackets();    // 所有封包（陣列複本）
window.__pmCore.count();         // 封包數量
window.__pmCore.getStats();      // { send, recv, errors, total }
```

### 匯出
```javascript
// 匯出 .txt（觸發瀏覽器下載）
window.__pmCore.export();

// 匯出 .txt（自訂檔名 + 不含統計）
window.__pmCore.export({
  filename: 'my_test.txt',
  includeStats: false
});

// 匯出 JSON（純字串，給程式處理）
window.__pmCore.exportJson();
```

### 事件訂閱
```javascript
// 訂閱啟動/停止
window.__pmCore.on('start', function(data) {
  console.log('Started at', new Date(data.time));
});

window.__pmCore.on('stop', function(data) {
  console.log('Stopped, total:', data.total);
});

// 訂閱每筆封包（即時）
window.__pmCore.on('packet', function(pkt) {
  // pkt = { t, dir, src, evt, args }
  console.log(pkt.dir, pkt.evt, pkt.args);
});

// 訂閱清空
window.__pmCore.on('clear', function(data) {
  console.log('Cleared', data.cleared, 'packets');
});

// 訂閱匯出
window.__pmCore.on('export', function(data) {
  console.log('Exported', data.count, 'packets');
});

// 取消訂閱
var unsub = window.__pmCore.on('packet', handler);
unsub();  // 之後不會再收到
```

---

## 🎨 UI API（介面層）

```javascript
window.__pmUI.mount();      // 顯示面板
window.__pmUI.unmount();    // 隱藏面板（核心仍在運行）
window.__pmUI.toggle();     // 切換顯示
window.__pmUI.isMounted();  // 是否顯示中

// 設定
window.__pmUI.setOption('maxDisplay', 1000);  // 列表最多顯示幾筆
window.__pmUI.setOption('updateInterval', 50); // UI 更新節流（ms）
```

---

## 📊 封包格式

```javascript
{
  t: 1719568521123,          // timestamp (ms)
  dir: 'SEND' | 'RECV' | 'ERR',
  src: 'SIO' | 'WS',         // 來源通道
  evt: 'state',              // 事件名
  args: [...]                // 事件參數
}
```

範例：
```javascript
{ t: 1719568521123, dir: 'SEND', src: 'SIO', evt: 'setZone', args: ['zone_04'] }
{ t: 1719568521456, dir: 'RECV', src: 'SIO', evt: 'state', args: [{ mode: 'combat', char: {...} }] }
{ t: 1719568521789, dir: 'SEND', src: 'WS', evt: 'attack', args: [] }
```

---

## 🔧 進階用法

### 無頭模式（純資料收集）

只載入 core，不掛 UI：

```javascript
// 載入 core
// ... (貼上或注入 packet-monitor-core.js)

window.__pmCore.install();
window.__pmCore.start();

// 自訂收集
var collected = [];
window.__pmCore.on('packet', function(pkt) {
  if (pkt.evt === 'state') {
    collected.push(pkt.args[0]);  // 只存 state 資料
  }
});

// 停止後
window.__pmCore.stop();
console.log('Collected', collected.length, 'state events');
```

### 嵌入現有面板

```javascript
// 載入 core
window.__pmCore.install();
window.__pmCore.start();

// 自己的 UI
window.__pmCore.on('packet', function(pkt) {
  document.getElementById('my-log').innerHTML +=
    `<div>[${pkt.dir}] ${pkt.evt} ${JSON.stringify(pkt.args).substring(0, 100)}</div>`;
});

// 自己控制開始/停止
document.getElementById('my-start-btn').onclick = function() {
  window.__pmCore.start();
};
```

### 批次匯出多個時段

```javascript
// 監控時段 1
window.__pmCore.start();
// ... 玩遊戲 ...
window.__pmCore.stop();
var session1 = window.__pmCore.export({ filename: 'session1.txt' });
window.__pmCore.clear();

// 監控時段 2
window.__pmCore.start();
// ... 玩遊戲 ...
window.__pmCore.stop();
var session2 = window.__pmCore.export({ filename: 'session2.txt' });
```

---

## 🛠️ 技術細節

### Hook 機制

```javascript
// Socket.IO 通道
io.Socket.prototype.packet   // SEND (type 2=event, 3=ack)
io.Socket.prototype.onevent  // RECV (data[0]=event name)

// WebSocket 通道
WebSocket.prototype.send     // SEND
window.__ws.addEventListener('message')  // RECV
```

### 為什麼需要雙通道？

Socket.IO 在主 World 連線時，會把 socket 實例藏在閉包裡。
某些環境下 `window.io` 還沒初始化，但 `window.__ws` 已經存在。
Hook 兩個通道確保**所有**流量都會被捕獲。

### 事件系統

Core 內部用簡單的 pub/sub：
```javascript
var _listeners = { start: [], stop: [], packet: [], clear: [], export: [] };

function on(event, callback) {
  _listeners[event].push(callback);
  return function unsubscribe() { ... };
}
```

每筆封包 → `emit('packet', pkt)` → 所有訂閱者收到。

### UI 更新節流

每 100ms 才更新一次 DOM（避免高頻封包卡 UI）：
```javascript
window.__pmCore.on('packet', function() {
  if (_updateTimer) return;
  _updateTimer = setTimeout(updateUI, 100);
});
```

---

## 🆚 與 game-monitor.js 的差異

| 特性 | packet-monitor | game-monitor.js |
|------|----------------|------------------|
| 架構 | 模組化（core + ui + loader） | 單檔 |
| 體積 | 30KB（分 3 檔） | 58KB |
| 觸發 | 手動按鈕 | 持續監控 |
| 匯出格式 | .txt（純文字） | .log（JSON） |
| 可嵌入 | ✅ core 事件可訂閱 | ❌ 自含 |
| 無頭模式 | ✅ 不用 UI | ❌ |

**建議**：
- 研究新協議/按鈕 → packet-monitor（資料乾淨、模組化）
- 日常掛機 → game-monitor（功能完整、整合度高）

---

## ⚠️ 注意事項

1. **CDP 注入需要依序**：先 core，再 ui（ui 載入時會檢查 core）
2. **fetch 注入不可靠**：CDP 注入時 `fetch()` 會被 CORS 阻擋，請用雙檔/三檔注入
3. **單一 window.__pmCore**：整個頁面只有一個 core，重複注入會警告
4. **不影響 game-monitor.js**：兩者並存無衝突（都是基於同一 hook 機制）
5. **大量封包會吃記憶體**：UI 只顯示最新 500 筆，但 core 保留全部，記得定期 `clear()`

---

## 📝 版本

- v1.0 (2026-06-28) — 初版，模組化架構
