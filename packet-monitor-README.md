# packet-monitor.js v1.0 - 手動封包監控工具

## 📌 用途

獨立運作的封包監控工具，**不依賴** game-monitor.js。

適用場景：
- 想知道「按某個按鈕」實際發了什麼封包
- 想知道「伺服器回傳」了什麼資料
- 想要乾淨的封包記錄檔做後續分析

---

## 🚀 使用方式

### 方式 1：直接注入（推薦）

透過 CDP 把檔案注入到遊戲頁面：

```powershell
# 用之前建立的 PowerShell + CDP 工具
powershell -ExecutionPolicy Bypass -File "C:\Users\twric\.qclaw\workspace\inject_fast.ps1"
# （把裡面的 JS 檔案路徑改成 packet-monitor.js）
```

或者用瀏覽器 Console 直接貼上：
1. F12 開啟開發者工具
2. 切到 Console
3. 貼上整個 packet-monitor.js 內容
4. Enter

---

### 方式 2：當作 Chrome Extension content script

複製到現有 extension 的 content script 清單裡。

---

## 🎮 操作流程

### 1. 注入後
頁面右上角會出現「📡 Packet Monitor」面板。

### 2. 開始監控
- 點「▶ 開始監控」
- 狀態變綠「▶ 監控中」

### 3. 手動操作遊戲
- 點地圖按鈕
- 攻擊怪物
- 用技能
- 換裝備
- 開郵件/商店/世界王
- **每個操作都會被記錄**

### 4. 停止
- 點「⏹ 停止監控」
- 狀態變灰「⏸ 停止」

### 5. 匯出
- 點「💾 匯出 .txt」
- 瀏覽器下載 `packet_monitor_<時間戳>.txt`

### 6. 分析
匯出的 .txt 包含：
- 每筆封包的時間、方向、來源、事件名、參數（pretty-printed JSON）
- 結尾有事件統計（哪些事件最常出現）

---

## 🔍 面板功能

| 元件 | 功能 |
|------|------|
| **ALL / SEND / RECV** | 過濾封包方向 |
| **過濾輸入框** | 過濾事件名（例：`state` 只看 state 事件） |
| **× 按鈕** | 隱藏面板（不會停止監控） |
| **拖曳 header** | 移動面板位置 |

統計：
- **SEND**: 發送的封包數
- **RECV**: 接收的封包數
- **ERR**:  解析失敗的封包數
- **Total**: 總計

---

## 💻 命令列 API

不想用 UI？可以在 Console 直接呼叫：

```javascript
// 開始/停止
window.__pmStart();
window.__pmStop();

// 匯出（會觸發瀏覽器下載）
window.__pmExport();

// 清空
window.__pmClear();

// 直接讀取封包陣列（最大 500 條會在 UI 顯示，但這裡是完整陣列）
console.log(window.__pmPackets);
console.log('共', window.__pmPackets.length, '筆');

// 過濾特定事件
window.__pmPackets
  .filter(p => p.evt === 'state')
  .forEach(p => console.log(p.t, p.args));

// 只看 SEND
window.__pmPackets
  .filter(p => p.dir === 'SEND')
  .forEach(p => console.log(p.evt, p.args));

// 統計事件頻率
var cnt = {};
window.__pmPackets.forEach(p => {
  cnt[p.evt] = (cnt[p.evt] || 0) + 1;
});
console.table(cnt);
```

---

## 📄 匯出檔案格式範例

```
========================================
Packet Monitor Export
Version: v1.0
Export Time: 2026-06-28T17:35:21.000Z
Total Packets: 47
  SEND: 12
  RECV: 35
  ERR:  0
========================================

[1] 2026-06-28T17:34:55.123Z | SEND | SIO | viewInv
  Args: []

[2] 2026-06-28T17:34:55.456Z | RECV | SIO | state
  Args: [
    {
      "mode": "combat",
      "char": {...},
      ...
    }
  ]

...

========================================
Statistics by Event Type
========================================
All Events:
  state: 20
  viewInv: 5
  attack: 3
  ...
```

---

## 🆚 與 game-monitor.js 的差別

| 特性 | packet-monitor.js | game-monitor.js |
|------|-------------------|------------------|
| 體積 | 20KB | 58KB |
| 依賴 | 獨立 | 自含 |
| 觸發方式 | 手動按按鈕 | 持續監控 |
| 顯示方式 | 浮動面板 | 浮動面板（5 tabs） |
| 匯出格式 | .txt（純文字） | .log（JSON） |
| 用途 | 臨時觀察 | 完整掛機工具 |

**建議**：日常掛機用 game-monitor.js，研究新功能/協議用 packet-monitor.js。

---

## 🛠️ 技術細節

### 雙通道 Hook
```javascript
// 1. Socket.IO 通道
io.Socket.prototype.packet   // SEND
io.Socket.prototype.onevent  // RECV

// 2. WebSocket 通道
WebSocket.prototype.send     // SEND
WebSocket.addEventListener('message')  // RECV
```

### 過濾規則
- Socket.IO 封包：`packet.type === 2` (event) 或 `3` (ack)
- WebSocket 封包：解析 `42[...]` 格式（Socket.IO Engine.IO 編碼）

### 為什麼有雙通道？
Socket.IO 在主 World 連線時，會把 socket 實例藏在閉包裡。
某些環境下 `window.io` 已經被定義但 socket 還沒創建。
Hook 兩個通道確保**所有**流量都會被捕獲。

---

## ⚠️ 注意事項

1. **首次注入需在 SIO 連線前** — 如果 socket 已建立但 hook 沒裝，`window.io` 會找到但 `io.Socket.prototype` 還是乾淨的，會自動安裝 hook（`tryInstallSio` 會重試）。
2. **不要重複注入** — 第二次注入會移除舊面板再重建。
3. **過多封包會卡 UI** — 列表只顯示最新 500 條，但 `__pmPackets` 保留全部。
4. **匯出 .txt 不會清空記憶體** — 匯出後記得點「🗑 清空」。

---

## 📝 版本

- v1.0 (2026-06-28) — 初版
