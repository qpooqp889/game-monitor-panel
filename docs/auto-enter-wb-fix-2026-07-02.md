# 自動進入世界王 Bug 修復 (2026-07-02)

## Bug 1: 兩個 checkbox 共用 ID `__gmp_boss_auto_enable`

**根因**：HTML 模板中有兩個 checkbox 都叫 `id="__gmp_boss_auto_enable"`：
- 自動戰鬥 checkbox（⚔️） → 用法正確
- 自動進入世界王 checkbox（🎯） → `getElementById` 永遠抓到第一個，永遠沒綁到 handler

**修復**：
1. 第二個 checkbox ID → `__gmp_boss_auto_script_enable`，對應 `for` 同步改
2. Handler 2 (`158xxx` 附近) 改抓新 ID
3. 刪除重複的 Handler 3（完全相同程式碼）
4. wb-boss.js: `__wbBossAutoScriptStart/Loop` 中兩處 `getElementById` 改抓新 ID

## Bug 2: 進入 BOSS 失敗無重試

**根因**：進入後 1.5 秒的驗證不管成功失敗都啟動 MonitorBossHP（假裝在攻擊）
+ 進入失敗直接跳過該 BOSS，沒有重試

**修復**：新增 `__wbBossAutoScriptTryEnter()`：
- 點擊卡片觸發 joinBoss 封包
- 3 秒後驗證 `lastState.mode === 'bosscombat'`
- 失敗 → 再點擊 + 等 3 秒重試，最多 3 次
- 3 次都失敗 → 記錄 `fail_entry` 歷史，skip 下一隻
- 成功 → 啟動自動攻擊 + HP 監控

## 保留不變

- wb-boss.js 中 `CheckBoss/CheckReEnter/VerifyEntry/UpdateWorldBossUI` 的 6 處 `__gmp_boss_auto_enable` 引用（操作的是自動攻擊 checkbox，正確）
- game-monitor.js Handler 1（自動戰鬥按鈕，保持不變）
