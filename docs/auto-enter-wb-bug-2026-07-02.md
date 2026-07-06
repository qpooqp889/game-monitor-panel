=== 自動進入世界王 Bug 診斷報告 ===

**根因：兩個 checkbox 共用同一個 ID `__gmp_boss_auto_enable`**

game-monitor.js HTML 模板中有兩個 checkbox 都叫 `id="__gmp_boss_auto_enable"`：

| # | 位置 | Label | 用途 |
|---|----------|-------|------|
| 1 | ~54648 | ⚔️ 自動戰鬥 | BOSS 自動攻擊 |
| 2 | ~56042 | 🎯 自動進入世界王 | BOSS 自動腳本（討伐清單） |

由於 `document.getElementById()` 永遠只回傳第一個匹配的元素，
第二個 checkbox（自動進入世界王）完全沒被綁到任何 handler。

**Handler 重複覆蓋鏈：**

1. Handler 1 (~131849): 綁 checkbox 1 → 呼叫 `__wbBossAutoStart()` ✅
2. Handler 2 (~158212): 綁 `getElementById` → 又拿到 checkbox 1，覆蓋 Handler 1 → 呼叫 `__wbBossAutoScriptStart()` ❌
3. Handler 3 (~159411): 又綁 `getElementById` → 再次覆蓋 → 同樣呼叫 `__wbBossAutoScriptStart()` ❌（重複程式碼）

結果：checkbox 1 的 `onchange` 最終被覆蓋成呼叫 `__wbBossAutoScriptStart`（自動腳本）
checkbox 2（自動進入世界王）完全無 handler，永遠不會觸發。

**wb-boss.js 內也全抓到 checkbox 1：**
- `__wbBossAutoScriptStart()` → `getElementById('__gmp_boss_auto_enable')` → 檢查自動戰鬥的 checkbox
- `__wbBossAutoScriptLoop()` → 同上
- `__wbBossAutoStart/Stop()` → 同上

**修復方案：**
1. checkbox 2 改 ID 為 `__gmp_boss_auto_script_enable`
2. 對應 label 的 `for` 也改
3. Handler 2+3 改抓新 ID（並合併重複的 Handler 3）
4. wb-boss.js 中 `__wbBossAutoScriptStart/Loop` 改抓新 ID
5. Handler 1 保持抓 `__gmp_boss_auto_enable`（自動戰鬥）
