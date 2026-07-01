# v3.09 實作記錄 & iframe storage 修復

## v3.09 變更

### wb-boss.js 新增功能

1. **Resume 機制** — `__wbSave/__wbLoad/__wbClearAutoScriptResume`
   - currentIdx 存 chrome.storage.local (key: `wb_auto_script_resume`)
   - 啟動時比對討伐清單 id 陣列，一致則從中斷處繼續
   - 一輪跑完/停止腳本自動清除

2. **HP < MP 攻擊條件** — `__wbCheckHpLessThanMp()`, `__wbGetBossConfigItem()`
   - entering 前檢查：HP>=MP 就不進入，等 5 秒重試
   - attacking 循環檢查：HP>=MP 暫停攻擊，顯示 `[WAIT]`，每 2 秒重試

3. **重生循環**（取代原本 advancing）
   - Boss HP≤0 脫離戰鬥 → 取消 auto checkbox
   - `__wbBossAutoScriptSendCharSelect()` 送選角封包
   - `__wbBossAutoScriptReturnToBoss()` 回世界王分頁→點同張卡片
   - currentIdx 不變（同一隻王重生再打）
   - 可選 `maxRetryPerBoss` 限制重生次數

4. **State 物件更新**：新增 `resumeEnabled`, `retryCount`, `maxRetryPerBoss`

### game-monitor.js 變更

- Boss 進階設定 Modal 新增 checkbox：`□ 僅 HP < MP 時攻擊`
- `__wbSyncAutoConfig()` 讀取 `hpLessThanMp`
- `__wbApplyBossConfigUI()` 恢復 `hpLessThanMp`
- Default config 加入 `hpLessThanMp: false`

## iframe chrome.storage 修復

### 問題
content script 在 iframe 內 `chrome.storage` is undefined，導致 `content.js:31` 一直噴 `Cannot read properties of undefined (reading 'local')`

### 修改

| 檔案 | 變更 |
|------|------|
| `content.js` | 新增 `__gmHasDirectStorage` 檢測 + `__gmStorageGet/Set/Remove` fallback 函數（fallback 走 `chrome.runtime.sendMessage` relay 到 background） |
| `background.js` | 新增 3 個 message handler：`storageGet`, `storageSet`, `storageRemove`，執行實際 `chrome.storage.local` 操作 |
| `storage.js` | 新增 `__gmStorageRemove` 函數 + expose `window.__gmStorageRemove` |
| `content.js` | 新增 `GM_STORAGE_REMOVE` message handler |

## 檔案驗證
全部 JS 語法校驗通過（7 檔案）
