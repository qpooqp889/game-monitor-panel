# 自動進入世界王 — 邏輯與條件分析

> 檔案：`wb-boss.js`（主要邏輯）+ `game-monitor.js`（UI + Entry 設定）
> 觸發 checkbox id：`__gmp_boss_auto_script`（UI 標籤：🎯 自動進入世界王）

---

## 一、總覽架構

```
[勾選 🎯 自動進入世界王]
        │
        ▼
__wbBossAutoScriptStart()
  ├─ 儲存掛機狀態 → 停止掛機
  ├─ 載入 BOSS 歷史記錄
  ├─ 自動勾選「死亡重進」
  └─ 啟動 __wbBossAutoScriptLoop()
        │
        ▼
  __wbBossAutoScriptLoop() ← 主循環（遞迴 setTimeout）
        │
        ▼
  讀取優先討伐清單 (chrome.storage.local → wb_priority_list)
        │
        ├─ 清單為空 → 恢復掛機 → 10 秒後重試
        ├─ 索引已達清單尾 → 恢復掛機 → 5 秒後從頭開始
        └─ 有下一隻要打的 BOSS → __wbBossAutoScriptCheckBoss()
```

---

## 二、條件判斷流程（__wbBossAutoScriptCheckBoss）

### 步驟 1：切換到世界王分頁

```javascript
__wbEnsureWBTab()
// 點擊 div.tab[data-tab="zone"] → 再點 div.subtab[data-c="special"]
// 等待 2 秒讓 DOM 更新
```

### 步驟 2：從 DOM 讀取世界王卡片

```javascript
document.querySelectorAll('.wb-card[data-boss]')
// 搜尋 .wb-sub[data-boss="{bossId}"] 取得狀態文字
```

### 決策樹

```
                    ┌─ 卡片不在 DOM 中 ──→ 等 3 秒重試 (無限循環直到出現)
                    │
  掃描 DOM 卡片     ├─ 卡片存在，讀子元素文字狀態：
  比對 target.id         │
                    ├─ 存活（文字含「存活」「戰鬥中」「HP」）
                    │     ├─ 檢查人數門檻（見條件 A）
                    │     │     ├─ 人數不足 → 跳過（寫歷史 skip）
                    │     │     └─ 人數足夠 → 進入（寫歷史 enter）
                    │     │           └─ 點擊卡片 → 等 1.5 秒確認進入
                    │     │                 └─ __wbBossAutoScriptMonitorBossHP()
                    │     │                       └─ 啟動自動戰鬥 ⚔️
                    │     └─ 未達門檻 → 跳過 → 下一隻
                    │
                    ├─ 已死（文字含「已被擊敗」「已被征服」）
                    │     ├─ 解析重生時間 (HH:MM)
                    │     ├─ 寫歷史 skip（含重生資訊）
                    │     └─ 跳到下一隻
                    │
                    └─ 狀態不明 → 等 5 秒重試
```

---

## 三、條件 A：人數門檻（最小在場人數）

### UI 控制

- **位置**：優先討伐清單頂部
- **元素**：`#__gmp_hunt_min_players` (dropdown 0~10)
- **標籤**：👥 最小在場人數才進入

### 儲存

```javascript
// 儲存在 chrome.storage.local key: wb_min_players
// 結構: { value: number }
// 載入時快取到: window.__wbCachedMinPlayers
```

### 判斷邏輯（__wbBossAutoScriptCheckBoss 內部）

```javascript
var threshold = window.__wbCachedMinPlayers || 0;
if (threshold > 0) {
  var playersText = subEl.textContent.trim();
  var pcMatch = playersText.match(/(\d+)/);
  var curPlayers = pcMatch ? parseInt(pcMatch[1], 10) : 0;
  if (curPlayers < threshold) {
    // 人數不足 → skip
    // 但特殊狀況: 未解析到人數時 curPlayers=0, 仍會跳過
    return;
  }
}
// 人數足夠或門檻=0 → 繼續進入流程
```

⚠️ **潛在問題**：DOM 文字中的人數純靠正則 `/(\d+)/` 擷取第一個數字，若狀態文字含有其他數字（HP%、時間等），可能取錯值。

---

## 四、進入後的行為（__wbBossAutoScriptMonitorBossHP）

### 進入確認

```javascript
// 等 1.5 秒後檢查
var ls = window.lastState || {};
var mode = ls.mode || '';
var bossHp = (ls.boss || {}).hp || 0;

if (mode === 'bosscombat' && bossHp > 0) {
  // ✅ 確認進入
  // 自動勾選 __gmp_boss_auto_atk + __gmp_boss_auto_enable
  // 進入 __wbBossAutoScriptMonitorBossHP 循環
} else {
  // ⚠️ 可能未成功進入
  // 寫歷史 enter（含 mode 狀態）
  // 但仍繼續 MonitorBossHP（不影響功能？）
}
```

### 戰鬥監控循環（每 2 秒）

```javascript
__wbBossAutoScriptMonitorBossHP(target, idx, list) {
  // 1. 更新 status UI: [ATTACK] BOSS名 HP:xx%
  // 2. 讀取 window.lastState.boss.hp
  // 3. 若 bossHp <= 0 && mode !== 'bosscombat' → BOSS 已死
  //    → __wbBossAutoScriptWaitForLoot()
  // 4. 若仍在 bosscombat → 確保 __gmp_boss_auto_atk 勾選
  //    → 確保 __wbSyncAutoConfig() 同步設定
  //    → 若自動戰鬥未啟動 → __wbBossAutoStart()
  // 5. 2 秒後繼續循環
}
```

### BOSS 擊敗後流程

```javascript
__wbBossAutoScriptHandleDefeat() {
  // 1. 寫歷史 defeat
  // 2. 關閉自動戰鬥 (__gmp_boss_auto_enable + __gmp_boss_auto_atk = false)
  // 3. 檢查死亡重進 checkbox:
  //    ├─ 勾選「死亡重進」→ __wbBossAutoScriptReEnter()
  //    │     ├─ 切回世界王分頁 → 等 2 秒
  //    │     ├─ 檢查 BOSS 是否存活
  //    │     │     ├─ 存活 → 點擊進入（__wbBossAutoScriptVerifyEntry）
  //    │     │     │     ├─ 成功 → 繼續 MonitorBossHP
  //    │     │     │     └─ 3 次重試失敗 → 跳到下一隻
  //    │     │     ├─ 已死 → 跳到下一隻
  //    │     │     └─ 不明 → 等 5 秒重試
  //    │     └─ BOSS 不在 DOM 中 → 跳到下一隻
  //    └─ 未勾選 → currentIdx++ → 下一隻
}
```

---

## 五、死亡重進邏輯（Re-enter）

### UI 控制

- **元素**：`#__gmp_boss_auto_reenter`
- **行為**：腳本啟動時自動勾選（強制啟動）

### 重進流程

```
BOSS 被擊敗 / 角色死亡
        │
        ▼
__wbBossAutoScriptReEnter(target, idx, list)
  ├─ 切回世界王分頁 (__wbEnsureWBTab)
  ├─ 等 2 秒
  └─ __wbBossAutoScriptCheckReEnter()
        │
        ├─ BOSS 卡片不在 DOM → 寫歷史 fail_entry → 跳到下一隻
        ├─ BOSS 存活 → 寫歷史 reenter → 點擊進入
        │     └─ __wbBossAutoScriptVerifyEntry()
        │           ├─ 最多 3 次重試 (每次 2 秒)
        │           ├─ 成功進入 → MonitorBossHP
        │           └─ 失敗 → fail_entry → 下一隻
        ├─ BOSS 已死 → 寫歷史 fail_entry → 跳到下一隻
        └─ 狀態不明 → 等 5 秒重試
```

---

## 六、掉落記錄系統

### UI 控制

- 從 `__gmp_boss_auto_loot` checkbox 控制開關（在 `game-monitor.js` 中）
- 儲存 key：`wb_boss_loot`（最多保留 200 筆）

### 自動擷取流程

```javascript
__wbBossAutoScriptWaitForLoot(target, idx, list)
  // 1. 檢查 loot checkbox 是否勾選
  // 2. 若否 → 直接進入 HandleDefeat
  // 3. 若是 → 每 0.5 秒檢查 .ip-box DOM 元素
  //    最多等 20 秒
  //    找到後 → __wbCaptureBossLoot()
  //    超時 → 直接進入 HandleDefeat
```

---

## 七、恢復掛機邏輯

```javascript
__wbBossAutoScriptRestoreFarm()
  // 檢查 farmWasRunning 旗標
  // 若原本掛機有在跑 → 檢查 __gmp_farm_btn 是否顯示 ▶
  // 是 → 呼叫 window.startFarming()
```

觸發時機：
- 清單為空時
- 清單跑完一輪時（回到 idx=0）

---

## 八、歷史記錄系統

### 儲存

- Key：`wb_boss_history`（最多 500 筆）
- 結構：
```javascript
{
  id: Date.now() + '_' + random,
  t: timestamp,
  bossName: string,
  event: 'enter' | 'defeat' | 'death' | 'reenter' | 'fail_entry' | 'skip' | 'leave',
  details: string,
  bossHp: number,
  nextRespawn: string | null
}
```

---

## 九、儲存的 Chrome Storage Keys 一覽

| Key | 用途 | 寫入時機 |
|-----|------|---------|
| `wb_priority_list` | 優先討伐清單 | 增/刪/排序時 |
| `wb_min_players` | 最小人數門檻 | 儲存清單時同步 |
| `wb_boss_entry_settings` | BOSS 進入設定（技能/藥水） | 手動點儲存按鈕 |
| `wb_boss_history` | BOSS 歷史記錄 | 每次 enter/defeat/death 等 |
| `wb_boss_loot` | BOSS 掉落記錄 | 每次擊敗擷取掉落 |
| `wb_boss_auto_loot` | 掉落記錄開關 | 使用者切換 checkbox 時 |
| `wb_auto_script_state` | 腳本 resume 狀態 | 腳本啟動時 |
| `wb_boss_config` | BOSS 自動戰鬥設定 | 進階設定 Modal 儲存時 |
| `gmSkillSettings` | 技能設定 | 技能 Tab 設定時 |

---

## 十、已知問題 / 注意事項

1. **人數解析不準確**：`subText.match(/(\d+)/)` 擷取第一個數字，若狀態文字像 `存活中 HP:500/1000 人數:3` 會取到 500 而非 3。

2. **進入確認寬鬆**：檢查 `window.lastState.mode === 'bosscombat' && bossHp > 0`，但若 `lastState` 未及時更新，會誤判為未進入（僅寫歷史，不中斷流程）。

3. **重進無次數限制**：死亡重進可能會無限循環（若 BOSS 一直存活但角色一直死）。

4. **掉落等待超時**：20 秒內若 `.ip-box` 未出現，直接略過掉落擷取。

5. **無跳出重進保護**：若角色在 BOSS 戰鬥中被踢出或斷線，腳本不會自動重進（只有擊敗後的重進）。

6. **狀態文字順序依賴**：`存活` 和 `已被擊敗` 判斷使用 `indexOf`，若遊戲更新文字會失效。
