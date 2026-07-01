# v3.25 - 修復 [+] 優先討伐清單 + 各項獨立最低人數 (2026-07-01 20:06~20:XX GMT+8)

## 問題 1：世界王列表 [＋] 沒加入優先討伐清單

**Root cause 三層：**
1. `onclick="__wbAddToHuntList(...)"` → 被 CSP (Content Security Policy) 阻擋 inline script → 改用 `data-wb-add-hunt` data attribute
2. Delegation handler 綁在 `#__gmp` 面板元素，但 click 事件可能被面板內其它 handler 攔截或不在同個 DOM 樹 → 改綁 `document`
3. call site 寫 `typeof __wbAddToHuntList`（IIFE 內不可見）→ 改 `typeof window.__wbAddToHuntList`
4. call 本身 `__wbAddToHuntList(...)` → 改 `window.__wbAddToHuntList(...)`

**Fix 4 處：**
- game-monitor.js: `#__gmp` delegation root → `document`
- game-monitor.js: `typeof __wbAddToHuntList` → `typeof window.__wbAddToHuntList`
- game-monitor.js: `__wbAddToHuntList(` → `window.__wbAddToHuntList(`

## 問題 2：最小在場人數改為每項獨立設定

**變更：**
- 移除全域 `__gmp_hunt_min_players` dropdown（game-monitor.js HTML）
- 移除 `wb_min_players` chrome.storage key
- 移除 `__wbCachedMinPlayers` 全域變數
- 優先清單儲存格式新增 `minPlayers: 0` 欄位
- `__wbUpdateHuntListUI` 每項顯示數字輸入框（data-wb-minp）
- document input delegation 監聽變化 → 即時寫入 chrome.storage
- `__wbBossAutoScriptCheckBoss` 改讀 `target.minPlayers` 取代全域門檻

## 檔案
- `game-monitor.js` (modified)
- `wb-boss.js` (modified)
- Commit: `6b98ae6` (v3.25)
