# v3.26 - 修復跨 IIFE 裸函數呼叫 (2026-07-01 20:50~20:55 GMT+8)

## 問題
[+] 按鈕沒有把世界王加到優先討伐清單，即使點了也沒反應。

## 根因：跨 IIFE 作用域問題

專案的兩個腳本各自有自己的 IIFE：
- `game-monitor.js` (IIFE A)
- `wb-boss.js` (IIFE B，注入順序較晚)

wb-boss.js 正確地把內部函數 export 到 `window.` 上供外部使用。但 game-monitor.js 呼叫這些函數時**沒有加 `window.` 前綴**，因此在 IIFE A 的作用域鏈裡找不到它們→ `ReferenceError` 中斷執行。

### 影響的函數（全部定義在 wb-boss.js IIFE 內）

| 函數 | 問題 | 遊戲中現象 |
|------|------|-----------|
| `__wbLoadHuntList(cb)` | ReferenceError → callback 不執行 | 世界王列表畫不出 ✓ 和 [+] |
| `__wbInitHuntToggle()` | ReferenceError → 結束 script | 勾選設定無法連動 |
| `__wbUpdateHuntListUI()` | ReferenceError | 優先列表 UI 不刷新 |
| `__wbClearBossLoot()` | 有 if 保護所以不炸但沒作用 | 清空掉落不生效 |

### 已修復的 6 處程式碼
- `__wbLoadHuntList(...)` → `window.__wbLoadHuntList(...)`
- `{__wbInitHuntToggle()...` → `{window.__wbInitHuntToggle()...`
- `__wbInitHuntToggle();` → `window.__wbInitHuntToggle();` (×2)
- `__wbUpdateHuntListUI();` → `window.__wbUpdateHuntListUI();` (×2)
- `__wbClearBossLoot();` → `window.__wbClearBossLoot();`

## 其他功能不受影響的原因
其他 `__wbXxx` 函數（`__wbSend`、`__wbBossLoop`、`__wbUpdateWorldBossUI` 等）都是**在 game-monitor.js 的 IIFE 內定義**的，所以裸呼叫能正確解析。

## 測試
- `node --check game-monitor.js` ✅
- `node --check wb-boss.js` ✅
- Commit: `b4abb75` (v3.26)

## 升級方式
1. `chrome://extensions/` → 🔄 重新載入
2. ⇧F5 重整遊戲頁面
