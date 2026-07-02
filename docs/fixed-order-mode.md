# 固定順序模式 (Fixed Order Mode) 完整流程

> v3.45｜2026-07-02 22:42｜wb-boss.js

---

## 核心邏輯

**永遠從第一位開始掃描，找到第一個「可進入」的 BOSS 就進。打完後回到第一位重新掃描。**

```
Loop 啟動
  │
  └→ 從 idx=0 開始掃描 priority list
         │
         ├→ 存活 (isAlive) → 就是它！進去打
         │
         ├→ 已死 + 有重生時間 → 就是它！等重生後狂點進入
         │
         ├→ 已死 + 無重生資訊 → 跳過，找下一個
         │
         └→ 所有都不可進入 → 回掛機，10 秒後重試
```

---

## 掃描規則

掃描是**順序**的（從 idx=0 往後），找到第一個符合的就停：

| 優先級 | 條件 | 動作 |
|--------|------|------|
| 1 | BOSS 存活 | 直接對這個進 TryEnter |
| 2 | BOSS 已死 + subText 有重生時間 | 等復活後狂點進入 |
| 3 | BOSS 已死 + 無重生時間 | 跳過 |
| — | DOM 中沒有該 BOSS 卡片 | 跳過 |

---

## 擊敗後的處理

不管哪個 BOSS 被擊敗，**一律 `currentIdx = 0`，回 Loop 從頭掃描**：

```
MonitorBossHP
  ├→ HP 歸零 + 不在戰鬥 → WaitForLoot → HandleDefeat
  │                                            └→ currentIdx=0 → Loop
  │
  └→ HP < 20% → 掃到「世界王已被擊敗」
       └→ 記錄 defeat 歷史 → selectChar[0] → currentIdx=0 → Loop
```

---

## 實際範例

假設 priority list: `[A, B, C, D]`

```
Loop（從 0 掃描）
  → A: 存活 → 進 A 打 → 打完 → currentIdx=0

Loop（從 0 掃描）
  → A: 已死+有重生時間 → 等復活 → 狂點進 A → 打完 → currentIdx=0

Loop（從 0 掃描）
  → A: 已死+無重生 → 跳過
  → B: 存活 → 進 B 打 → 打完 → currentIdx=0

Loop（從 0 掃描）
  → A: 存活 → 進 A...
```

## 關鍵改動 (v3.45 vs v3.44)

| v3.44 | v3.45 |
|-------|-------|
| `currentIdx` 指向哪就打哪，打完 ++ | 每次從 0 開始掃描，找第一個可進的 |
| 打完 8/17 → 9/17 一直往前 | 打完回到 1/17 重新找 |
| 死王有重生時間只對 idx=0 狂點 | 任何順位死王有重生時間都等+狂點 |
| `HandleDefeat` 用 `currentIdx++` | `HandleDefeat` 用 `currentIdx=0` |
