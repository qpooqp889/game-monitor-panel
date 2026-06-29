# 異動說明 (CHANGELOG)

## [v2.03] - 2026-06-29

### 🔧 掛機 Tab 版面重構 (Farming Tab UI Redesign)

#### 1️⃣ 開始腳本按鈕移至最上方
- 「▶ 開啟腳本」按鈕從面板底部移至最頂端
- 進腳本後按鈕樣式變更為紅色「■ 停止腳本」

#### 2️⃣ HP / MP 低於閾值加入動作下拉選單
- **HP 觸發動作**：可選擇「選擇角色」或「回大廳」(toLobby)
- **MP 觸發動作**：可選擇「選擇角色」或「回大廳」(toLobby)
- HP／MP 各自獨立判斷，可設定不同的觸發行為
- 選取「回大廳」時發送 `toLobby` 指令；選取「選擇角色」時發送 `selectChar` (原行為)

#### 3️⃣ 移除「MP 低於斷線」功能
- 整個 MP 低於斷線區塊（`mpReconnectEnabled`、`mpReconnectThresh`、`__mpReconnectTriggered`）已從面板與邏輯中刪除

#### 4️⃣ 角色槽位移至面板最下方
- 「角色槽位」下拉選單從 HP/MP 區段移至面板底部、「測試斷線重連」按鈕上方

### 🔒 CSP 相容性修復 (Content Security Policy Fix)

#### 5️⃣ 動態 Script 注入改為 Background 代理
- **問題**：`content.js` 使用 `document.createElement('script')` + `textContent` 注入腳本，違反遊戲頁面的 CSP 規則
- **解決**：改為透過 `chrome.runtime.sendMessage` → `background.js` → `chrome.scripting.executeScript({world: 'MAIN'})` 注入
- **受影響檔案**：
  - `content.js` — GM_LOAD_ADVANCED 處理邏輯改為委託 background
  - `background.js` — 新增 `injectScriptIntoMainWorld()` 和 `injectScript` 訊息處理
- **注入流程**：`game-monitor.js` → postMessage → content.js → runtime.sendMessage → background.js → chrome.scripting.executeScript ✅

### 📁 異動檔案

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `game-monitor.js` | 修改 | 掛機 Tab HTML 重排、HP/MP 動作邏輯更新、移除 MP 斷線 |
| `content.js` | 修改 | 腳本注入改為 background 代理（CSP 修復） |
| `background.js` | 修改 | 新增 `injectScriptIntoMainWorld()` 函數 |
| `manifest.json` | 修改 | 版本號 v2.02 → v2.03 |
| `.gitignore` | 新增 | 排除舊版備份檔案與亂碼檔案 |
| `CHANGELOG.md` | 修改 | 新增本版異動記錄 |

---

## [v2.02] - 2026-06-28

### 異動內容
- 初始建置 Game Monitor Panel Chrome 擴充套件
- 雙通道封包攔截：Socket.IO + WebSocket
- 五個 Tab：狀態、地圖、掛機、世界王、監控
- 掛機功能：地圖選擇、HP/MP 門檻、斷線重連、自動攻擊
- 世界王自動化：血量監控、自動攻擊與道具領取
- IndexedDB LogoutDB 斷線記錄儲存
- webhook 事件通知系統
- Packet Monitor 模組
- BOSS Monster 面板
