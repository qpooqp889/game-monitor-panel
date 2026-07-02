# 排定模式 (Scheduled Mode) 完整流程

> v3.43｜2026-07-02｜wb-boss.js

---

## 入口

`__wbBossAutoScriptLoop()` — 由 `__gmp_boss_auto_script_enable` checkbox 觸發

排定模式 (`mode === 'scheduled'`)：**只看 `currentIdx`**，依 priority list 順序逐一處理。

```
currentIdx → CheckBoss → [存活/死亡/不明] → 不同分支
                              │
                              └→ 打完 → currentIdx++
                                       │
                                       └→ 跑完列表 → Done → currentIdx = 0（鎖回第一位）
```

---

## 主流程

```
Loop 啟動
  │
  └→ __wbEnsureWBTab()  ── 點擊遊戲「狩獵場」→「世界王」頁籤
  │
  └→ __wbBossAutoScriptCheckBoss(target, idx, list)
        │
        ├── [存活 isAlive]
        │     ├─ 檢查 minPlayers 門檻（每項獨立設定）
        │     ├─ 人數不足 → 跳下一隻
        │     └─ 人數達標 → __wbBossAutoScriptTryEnter（3 次重試）
        │           ├─ 成功 → MonitorBossHP（2s 輪詢）
        │           └─ 失敗 → fail_entry 記錄 → currentIdx++
        │
        ├── [死亡 isDead]
        │     ├─ idx===0 && 重生 ≤ 30s → TryEnterSpam 狂點
        │     │     └─ 無重試上限，每 2s 點擊卡片直到進入
        │     └─ 其他 → currentIdx++（直接跳過）
        │
        └── [不明]
              └─ 直接嘗試 TryEnter
```

---

## 進入 BOSS 後

**`__wbBossAutoScriptMonitorBossHP(target, idx, list)`** — 每 2 秒輪詢

```
MonitorBossHP (每 2s)
  │
  ├── bossHp ≤ 0 && mode !== 'bosscombat'
  │     └→ WaitForLoot → HandleDefeat
  │
  ├── mode === 'bosscombat' && bossHp > 0
  │     ├─ 確保自動攻擊 checkbox ON
  │     ├─ 確保 __wbBossAuto.running
  │     │
  │     └─ HP < 20% → 檢查 DOM
  │           └─ 找到 <div style="color:#f87171">⚔ 世界王已被擊敗！</div>
  │                 ├─ 記錄 defeat 歷史
  │                 ├─ selectChar[0] 回村（不關閉自動攻擊）
  │                 ├─ currentIdx++
  │                 └─ 3 秒後 → Loop 檢查下一隻
  │
  └── 繼續輪詢
```

---

## 擊敗處理

**`__wbBossAutoScriptHandleDefeat(target, idx, list)`**

```
HandleDefeat
  ├─ 記錄 defeat 歷史 + leave 歷史
  ├─ selectChar[0] 回村（不關閉自動攻擊）
  ├─ currentIdx++
  └─ 3 秒後 → Loop 檢查下一隻
```

---

## 列表處理完畢

**`__wbBossAutoScriptDone(list)`**

```
Done
  ├─ currentIdx = 0（鎖回第一位）
  ├─ spamCount = 0
  ├─ __wbBossAutoScriptRestoreFarm()（恢復掛機）
  ├─ 計算列表中最早復活時間
  │     ├─ 有合理時間（≤1hr）→ 等復活 + 5s 後醒來
  │     └─ 無 → 每 30s 輪詢
  └─ 等待
```

---

## 關鍵規則速查

| # | 規則 |
|---|------|
| 1 | 排定模式只檢查 currentIdx 指向的 BOSS |
| 2 | 第一位 (idx=0) 死王 + 重生 ≤30s → 狂點進入（無上限） |
| 3 | 第二位起 (idx≥1) 死王 → 直接跳下一位 |
| 4 | BOSS HP < 20% 時，每 2s 掃 DOM 找「世界王已被擊敗」 |
| 5 | 找到 defeat 提示 → 記錄歷史 → selectChar[0] → currentIdx++ → 不關自動攻擊 |
| 6 | 擊敗後 selectChar[0] 回村，3s 後繼續下一隻 |
| 7 | 全部打完 → currentIdx=0 鎖回第一位，等最早復活時間醒來 |
