# BOSS 自動腳本邏輯設計稿

## 目標

當勾選「🎯 自動BOSS腳本」時，自動依優先討伐清單順序，逐一進入世界王戰鬥、打完後自動跳下一隻，最後一輪結束後恢復掛機。

---

## 術語定義

| 名稱 | 說明 |
|------|------|
| 優先討伐清單 | 世界王列表，可拖拽調整順序 |
| 掛機腳本 | farming-config.js 的自動練功循環（startFarming / stopFarming） |
| 自動 BOSS | 世界王 Tab 的「⚔️ 自動BOSS」checkbox + 條件設定 |
| 自動 BOSS **腳本** | 本篇設計的頂層調度器，負責多 Boss 輪询 |
| 掛機中 | 掛機腳本正在運行（window.__gmFarming.running === true）|

---

## 自動腳本狀態機

```
                    ┌─────────────────────────────┐
                    │  idle                       │
                    │  (未啟動)                    │
                    └────────────┬────────────────┘
                                 │ 勾選checkbox
                                 ▼
                    ┌─────────────────────────────┐
                    │ stopping_farm               │
                    │ 停止掛機腳本，記錄farmWasRunning│
                    └────────────┬────────────────┘
                                 │ (同步)
                                 ▼
                    ┌─────────────────────────────┐
                    │ loading                     │
                    │ 讀取討伐清單，導航到WB分頁    │
                    └────────────┬────────────────┘
                                 │ (2000ms後)
                                 ▼
                    ┌─────────────────────────────┐
                    │ checking_boss               │
                    │ 檢查當前目標Boss是否在場      │
                    │ 有血量 + 符合自動攻擊條件?    │
                    └────────────┬────────────────┘
                    ┌────────────┴────────────┐
                    │                         │
                  [是]                       [否]
                    │                         │
                    ▼                         ▼
        ┌───────────────────────┐  ┌───────────────────────────┐
        │ entering              │  │ dead / not_ready           │
        │ 點擊卡片進入戰鬥        │  │ currentIdx++，下一隻       │
        └────────────┬───────────┘  └───────────────────────────┘
                     │ (1500ms後)
                     ▼
        ┌───────────────────────┐
        │ attacking             │
        │ 啟用自動BOSS，監控HP    │
        │ 每2秒檢查一次           │
        └────────────┬───────────┘
          ┌──────────┴──────────┐
        [HP > 0]              [HP = 0 且脫離bosscombat模式]
          │                         │
          │ (持續攻擊)               │ (BOSS擊敗)
          │                         ▼
          │              ┌───────────────────────┐
          │              │ advancing             │
          │              │ currentIdx++           │
          │              │ 下一隻                 │
          │              └────────────┬───────────┘
          │                           │
          │                      [idx >= list.length?]
          │                           │
          │              ┌────────────┴────────────┐
          │              │                         │
          │            [是]                       [否]
          │              │                         │
          │              ▼                         ▼
          │    ┌─────────────────┐   ┌──────────────────────────┐
          │    │ restoring_farm  │   │ (回到 loading)              │
          │    │ 恢復掛機腳本     │   └──────────────────────────┘
          │    │ currentIdx = 0  │
          │    │ 停止腳本        │
          │    └────────┬────────┘
          │             │ (2000ms後)
          │             ▼
          │    ┌─────────────────┐
          └────│ idle            │
               │ (一輪完成)       │
               └─────────────────┘
```

---

## 各狀態詳細行為

### idle（初始 / 停止）
- `running = false`
- `currentIdx = 0`
- 不做任何操作

### stopping_farm
- 同步執行：讀取 `window.__gmFarming.running`，存入 `farmWasRunning`
- 如正在掛機：呼叫 `stopFarming()`
- 進入 loading

### loading
- 讀取優先討伐清單（`__wbGetHuntList`）
- 點擊遊戲分頁：`div.tab[data-tab="zone"]` → `div.subtab[data-c="special"]`
- 等待 2000ms，讓 WB DOM 刷新
- 進入 checking_boss

### checking_boss
- 以 `data-boss` 屬性從 DOM 找目標 Boss
- 讀取 `.wb-sub[data-boss="xxx"]` 文字內容判斷狀態

| 文字關鍵字 | 判定 |
|-----------|------|
| 存活 / 戰鬥中 / HP | 存活（可進入）|
| 已被擊敗 / 已被征服 | 已擊敗，跳下一隻 |
| 匹配 `HH:MM` 時間格式 | 有復活時間，判斷是否臨近 |
| 無匹配 | 狀態不明，等 5 秒重試 |

- 存活 + 符合進入條件 → entering
- 已擊敗或狀態異常 → advancing

### entering
- 點擊 `.wb-card[data-boss="xxx"]` 進入戰鬥
- 等待 1500ms
- 勾選 `__gmp_boss_auto_enable`、`__gmp_boss_auto_atk`
- 呼叫 `__wbBossAutoStart()` 啟動自動 BOSS
- 進入 attacking

### attacking
- 每 2 秒檢查一次：`window.lastState`
- 讀取 `boss.hp`、`boss.maxHp` 計算 HP%
- UI 狀態列顯示：`[ATTACK] {Boss名} HP:XX%`
- 每次檢查都確保 `__gmp_boss_auto_enable` 和 `__gmp_boss_auto_atk` 為勾選狀態
- `boss.hp <= 0` 且 `mode !== 'bosscombat'` → BOSS 擊敗 → advancing

### advancing
- 取消 `__gmp_boss_auto_enable`、`__gmp_boss_auto_atk` 勾選
- `currentIdx++`
- `currentIdx >= list.length`？
  - **是**：清單跑完 → restoring_farm
  - **否**：回到 loading（讀取下一隻）

### restoring_farm
- `currentIdx = 0`（一輪結束）
- `farmWasRunning === true`？
  - **是**：呼叫 `startFarming()` 恢復掛機腳本
  - **否**：不做任何事（原本就沒在掛機）
- 等待 2000ms
- 停止腳本 → idle

---

## UI 顯示

### 狀態文字（`__gmp_boss_script_status`）

| 狀態 | 顯示文字 |
|------|---------|
| idle | `· 閒置中` |
| stopping_farm | `⚡ 停止掛機...` |
| loading | `⚡ 讀取清單...` |
| checking_boss | `[BOSS] {名} (n/m)...` |
| entering | `[BOSS] {名} 進入中...` |
| attacking | `[ATTACK] {名} HP:XX%` |
| dead / not_ready | `[BOSS] {名} 已擊敗，換下一隻...` |
| advancing | `→ 切換下一隻...` |
| restoring_farm | `✅ 恢復掛機...` |

### 討伐清單項目標記
- 當前正在處理的項目：左側邊框變橙色（`border-left: 3px solid #ff9800`）
- 已擊敗的項目：整行變淡（`opacity: 0.5`）

---

## 自動攻擊條件

進入 BOSS 戰鬥後，呼叫 `__wbBossAuto` 模組的條件：
- `window.__wbBossAuto.running === true`
- `autoAttackEnabled === true`（讀取 checkbox）
- 每次 attacking 迴圈都檢查在線人數條件（`onlineOperators`）

條件不滿足時：自動攻擊暫停，但腳本仍在監控；條件恢復後自動重啟。

---

## checkbox 狀態持久化

| Key | 內容 |
|-----|------|
| `wb_auto_script_state` | `{ enabled: bool }` |

- 勾選時寫入，頁面載入時讀取並還原勾選狀態
- 如果 restored enabled === true：自動啟動腳本

---

## 討伐清單移動功能

### `__wbMoveHuntItem(id, dir)`
- dir = -1 → 上移
- dir = 1 → 下移
- 邊界保護：首項不可上移，末項不可下移
- 移動後自動呼叫 `__wbUpdateHuntListUI()` + `__wbUpdateWorldBossUI()`

### UI 按鈕
- ▲（上移）：點擊執行 `__wbMoveHuntItem(id, -1)`
- ▼（下移）：點擊執行 `__wbMoveHuntItem(id, 1)`
- 邊界按鈕顯示灰色 `color:#333`，不可點擊

---

## 記錄當前進度（Resume 機制）

### 儲存 currentIdx 到 chrome.storage.local

腳本每次打 Boss 前（advancing 時）將 `currentIdx` 持久化：

| Key | 內容 |
|-----|------|
| `wb_auto_script_resume` | `{ currentIdx: number, huntListId: string[] }` |

### 啟動時恢復

- 腳本啟動時讀取 `wb_auto_script_resume`
- 比對目前討伐清單的 id 陣列是否一致
  - **一致** → `currentIdx` 從該處繼續
  - **不一致**（清單被修改過）→ 從 0 開始
- 一輪跑完或腳本停止 → 清除 `wb_auto_script_resume`

### 顯示設計

- UI 顯示：`[BOSS] {名} (3/8)` — 表示清單 8 隻，正在打第 3 隻
- 關閉腳本再開啟後，UI 顯示 `→ 從上次進度繼續 (第 3/8 隻)`

## BOSS 擊敗後：送出選角封包 + 返回目前 Boss

### 需求

打敗一隻 Boss 後（偵測到 `boss.hp <= 0 && mode !== 'bosscombat'`）：

1. **取消自動 Boss 狀態**：uncheck `auto_enable`、`auto_atk`
2. **送出選角封包**：
   - 對 Socket 發送 **選角封包**（角色選擇 / 角色切換），讓角色重生
   - 封包格式需確認遊戲協議（待補）
3. **重新導航到該 Boss**：
   - 切回狩獵場→世界王子分頁
   - 點擊同一 Boss 卡片再次進入
4. **重複 HP 監控循環**：回到 attacking 狀態（不是 advancing）

### 流程修改

```
attacking → HP=0 脫離戰鬥 → respawn
    ├─ 取消 auto checkbox
    ├─ 發送選角封包
    ├─ 等待 2000ms（確保重生完成）
    ├─ __wbEnsureWBTab()
    ├─ 等待 2000ms
    ├─ 點擊同一 Boss 卡片
    ├─ 等待 1500ms
    ├─ 重新啟用自動 Boss checkbox
    └─ 回到 attacking（currentIdx 不變）
```

**不換下一隻**，打贏同一隻 Boss 後重生繼續打，直到：
- 玩家手動停止腳本
- 打到某種條件（待定）才換下一隻

### 重生次數限制（可選）

- 設定：每隻 Boss 最大重生挑戰次數（`maxRetryPerBoss`）
- 預設：無限制（一直重生一直打）

## 自動攻擊條件新增：HP < MP

### 設定參數

在 Boss 進階設定 Modal 中新增 checkbox：

| 欄位 | 類型 | 說明 |
|------|------|------|
| `hpLessThanMp` | boolean | 僅當角色 HP < MP 時才進入攻擊 |

### 觸發時機

- **entering 階段**：確認 Boss 存活後，在進入前檢查
  - `hpLessThanMp = true` → 讀取 `window.lastState.hp` 和 `window.lastState.mp`
  - `hp < mp` → 可以進入
  - `hp >= mp` → 不進入，等待 5 秒後重試 checking_boss
- **attacking 循環**：每次檢查時
  - 如果 `hp >= mp` → 暫停攻擊（但不清除 auto checkbox，保持進入狀態）
  - UI 顯示 `[WAIT] {名} HP({hp}) ≥ MP({mp})`
  - 每 2 秒重試，直到 HP < MP 恢復攻擊

### UI 顯示

```
[⚙️ 進階設定 Modal] (新增)
□ 僅 HP < MP 時攻擊
```

## 待確認問題

1. **復活時間**：Boss 擊敗後偵測到復活時間，目前邏輯是直接跳過。是否要加入「等待復活後進入」的選項？（與新選角重生流衝突？）
2. **UI 標記**：當前處理中的清單項目是否要特別標記（橙色邊框）？
3. **失敗處理**：如果點擊卡片後 5 秒內都沒進入 bosscombat 模式，怎麼處理？（重試？跳過？）
4. **farmWasRunning 讀取時機**：`window.__gmFarming` 在 `farming-config.js` 注入後才存在，需確認執行時序
5. **選角封包格式**：需確認發送哪個 Socket 封包才能完成重生效果，需補具體 
6. **重生後 Boss 是否還在**：選角重生後，Boss 可能已被其他人擊殺，需加健壯性檢查
