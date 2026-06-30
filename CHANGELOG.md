# 異動說明 (CHANGELOG)

## [2.28] - 2026-06-30
### WorldBoss DOM 讀取重構
- 世界王列表改為讀取遊戲 DOM (.wb-card[data-boss])，放棄 Socket 封包攔截
- 移除 __wbQueryWorldBoss socket 發送邏輯，直接呼叫 __wbUpdateWorldBossUI()
- __wbStartWorldBossTimer 改為每 60 秒直接掃 DOM，移除 socket 重試機制
- __wbUpdateWorldBossUI 完全重寫為 DOM 解析版本
- 刷新按鈕改為即時 DOM 讀取
- 解析 wb-sub[data-boss] 的重生時間

## [2.26] - 2026-06-30
### Fixes
- BOSS Tab 世界王被動偵測：捕到事件時即時更新 UI（事件名 / 數量 / 列表）+ 每 1.5s 重試直到 Socket 就緒
- 刷新按鈕即時回饋：成功=綠色，查詢中=黃色
- __wbUpdateWorldBossUI 無資料時顯示詳細原因（未收到事件 vs 已收到但解析失敗）
- 世界王候選按鈕：顯示所有捕獲事件名稱（而非只看符合 worldBoss 等關鍵字的）
## [v2.25] - 2026-06-30

### 🐛 Fix: Unexpected identifier 'lv'
- `'?'` 後缺少逗號 → 補充 `,`

---

## [v2.24] - 2026-06-30

### 🐛 Fix: SyntaxError (Unexpected token ':')
- `__wbParseWorldBossData` 物件 literal 多了 errant `'+'` → 修復為 `'?',`
- 原因：字串 `'?'` 後多了 `+` 與下一行的 `lv:` 屬性相連，導致 JS 解析失敗

---

## [v2.23] - 2026-06-30

### 🆕 世界王列表監控（每 60 秒自動刷新）

#### Socket.IO Hook 拓寬
- 攔截**所有** RECV 事件寫入 `window.__wbAllEvents`（滾動 buffer，最多 500 筆）
- 被動偵測：事件名含 `respawn`/`worldBoss`/`bossList`/`RefreshBoss`/`getBoss` 或 payload 含 `hp`+`maxHp`+`name` → 自動寫入 `__wbWorldBossCache`
- 每次偵測到世界王事件時，通知所有訂閱者 (`__wbSubscribeWorldBoss` 回調)

#### 主動查詢（每 60 秒一次）
- 嘗試發送常見世界王事件名：`worldBoss`、`getBossInfo`、`bossInfo`、`world_boss`、`bossList`、`getBoss`、`RefreshBoss`、`getBossList`、`wbBoss`
- 第一個成功發出的作為已確認事件名，寫入 `__wbWorldBossEvtName`

#### 世界王列表 UI（Boss Tab 頂端）
- 顯示：名稱 / 等級 / HP+最大HP / 存活條 / 重生倒數 / 狀態（存活/死亡/等待）
- 左側色彩邊框：HP>60% 紅色、>30% 橙色、≤30% 深紅
- 刷新按鈕：手動立即查詢
- 每 60s 自動 checkbox：開/關自動查詢
- 事件名顯示：當前已確認的事件名
- 「事件候選」按鈕：查看自動偵測到的 Top 10 世界王相關事件

#### 通用解析器 (`__wbParseWorldBossData`)
- 支援格式：`[{...}]`、`{list:[...]}`、`{bosses:[...]}`、`{data:[...]}`、`{data:{...}}`
- 標準化欄位：`name`、`lv`、`hp`、`maxHp`、`respawn`、`status`、`index`

#### 整合
- `switchTab('boss')` 時同步刷新世界王 UI
- `__wbUpdateBossStatus()`（戰鬥 BOSS 狀態）不受影響
- `__wbWorldBossDetectTimer`：每 5 秒自動偵測新事件

### 📁 異動檔案

| 檔案 | 變更 |
|------|------|
| `game-monitor.js` | v2.23；Socket hook 拓寬；世界王查詢/UI/計時器 |
| `manifest.json` | v2.22 → v2.23 |

---

## [v2.22] - 2026-06-30

### 🐛 修復：storage fallback + castSkill DOM 瞄準修正

#### storageGet / storageSet fallback
- `window.__gmStorageGet/Set` 未就緒時，直接走 `chrome.storage.local`
- 避免 `renderList()` Promise 鏈燒不掉、Modal 卡在「載入中」

#### castSkill / setAuto 直接改遊戲 DOM
- `castSkill`（攻擊技能）→ 瞄準 `data-k="atkSkill"` select，賦值後觸發 `change` 事件
- `setAuto`（開怪技能）→ 瞄準 `data-k="openSkill"` select
- 找不到時 fallback 先切「設定」Tab 再找，終極 fallback 才發 socket
- socket 封包：`castSkill` → `setAuto openSkill`，`setAuto` → `setAuto openSkill`（已修正）

### 🆕 怪物狀態列（Modal 即時顯示）
- Modal 底部新增 `__gmAdvMonsterBar`，每次 `tick()` 更新
- 顯示所有活著的怪物：`[0] 哥布林  [1] 多眼怪  [2] 史萊姆`
- 綠色標籤，滑鼠移上去顯示「索引:X」

### 🎯 setTarget「全部」模式
- 勾選「全部」→ 對畫面所有存活的怪物同時發送 `setTarget 0`、`setTarget 1`、`setTarget 2`
- `targetAll` 參數寫入規則並持久化

### 📁 異動檔案

| 檔案 | 變更 |
|------|------|
| `advanced-farming.js` | v1.5；storage fallback；DOM 瞄準修正；怪物狀態列；setTarget targetAll |
| `manifest.json` | v2.21 → v2.22 |

---

## [v2.20] - 2026-06-30

### 🐛 修復：castSkill / setAuto 正確發送 socket 封包

- `castSkill`（攻擊技能）→ 發 `setAuto openSkill`（非 `atkSkill`）
- `setAuto`（開怪技能）→ 發 `setAuto openSkill`
- `setAuto` → 改為發 `setAuto openSkill`（原本錯誤發 `atkSkill`）

---

## [v2.19] - 2026-06-30

### 🐛 修復：gmSkillSettings 寫入中文技能名

- 從 `#panel-scroll [data-k]` select 的 option text 建立 `__pmSkillNames`（skillId → 顯示名）
- `gmSkillSettings` 寫入時一併儲存 `skillNames` 欄位
- 供進階規則下拉顯示「燃燒的火球 (sk_fireball)」格式

---

## [v2.18] - 2026-06-30

### 🐛 修復：gmSkillSettings 技能中文名寫入格式

- `__pmSkillNames` 正確建立（從 checkbox key/label、select option text）
- 去除「（MP14）」等 MP 註記，只留技能名

---

## [v2.17] - 2026-06-30

### ⚙️ 進階設定 setAuto 下拉標籤修正

- `ACTION_TYPES.setAuto.hint` 更新：openSkill=開怪技能 / atkSkill=攻擊技能
- `refreshSkillDatalist` 重構：統一 `seen` 邏輯、明確跳過非技能值

---

## [v2.16] - 2026-06-30

### 🆕 掛機 Tab 新增：指定目標 + 攻擊全部

- 「指定目標」：checkbox + 下拉（0-10）+ 按鈕
- 「攻擊全部」：checkbox，一次送出 `setTarget 0,1,2`
- `saveFarmSettings` / `loadFarmSettings` 對應擴充

---

## [v2.15] - 2026-06-30

### 🐛 修復：怪物收錄 + 技能下拉中文名

- `tick()` 中 `tick(d)` 自 `if(!d||!d.char)` 短路區塊移出，`gmMonsters` 開始正常收錄
- Skills Tab 擷取 `select option` 建立 `__pmSkillNames` 映射，存入 `gmSkillSettings.skillNames`
- `refreshSkillDatalist` 優先顯示中文名稱

---

## [v2.14] - 2026-06-29

### ⚙️ popup.js 單次注入兩個腳本

- `advanced-farming.js` 注入鏈過長（postMessage→content→background→executeScript），容易失敗
- 改為 `popup.js` 直接一次 `executeScript({files:['game-monitor.js','advanced-farming.js']})`

---

## [v2.13] - 2026-06-29

### 🐛 修復：匯出 / 匯入補上 LogoutDB

- `__gmExportAll` / `__gmImportAll` 補上 `logout_history` 欄位
- 支援完整 IDB 資料匯出 / 匯入

---

## [v2.12] - 2026-06-29

### 🐛 修復：gmSkillSettings 寫入路徑

- `__gmAdvanced.SkillDB` 依賴鏈鬆動，改為 `game-monitor.js` 直接寫 `chrome.storage.local`
- `__gmStorageSet('gmSkillSettings', arr)` 繞過 `window.__gmAdvanced` 依賴

---

## [v2.11] - 2026-06-29

### 🐛 修復：__gmStorageSet/Get 掛到 window

- `__gmStorageGet` / `__gmStorageSet` 定義在 `game-monitor.js` IIFE 內，`advanced-farming.js` 存取不到
- 改為直接掛到 `window` 物件

---

## [v2.09] - 2026-06-29

### ♻️ 全面從 IndexedDB 遷移到 chrome.storage.local

- `LogoutDB`（game-monitor.js）→ `chrome.storage.local`
- `gm-panel-db/advanced_rules`（advanced-farming.js）→ `chrome.storage.local`
- `gm-panel-db/monsters` → `gmMonsters`（chrome.storage.local）
- `GM_Panel_DB/skill_settings`（game-monitor.js skills tab）→ `chromeSkillSettings`（chrome.storage.local）
- 匯出 / 匯入改為 JSON 格式，統一用 `__gmExportAll` / `__gmImportAll`

---

## [v2.08] - 2026-06-29

### 🔧 HTML innerHTML 結構校正

- Monitor Tab syntax error：結尾 `</div>'>` 修復
- Farm Tab `__gmp_content` wrapper 正確關閉（三個 `</div>` 全部在字串內）
- 縮排統一

---

## [v2.07] - 2026-06-29

### ⚡ Skills Tab → IndexedDB 同步

#### 讀取設定時自動寫入 IDB
- `__pmReadFromGame()` 讀取遊戲技能面板後，自動寫入 `gm-panel-db` → `skill_settings` store
- Key：`charName`（角色名稱），含 `updatedAt` 時間戳
- 供進階模組下拉使用（從 IndexedDB 讀取，不再依賴 DOM）

#### 怪物 + 技能雙重 datalist
- `setTarget`（指定目標）→ 怪物名稱下拉（自動收錄 + 清除）
- `setAuto`（設定自動技能）→ **技能 ID 下拉**（Skills Tab 讀取後可用）

### 📥 全域匯出 / 匯入（狀態 Tab）

按鈕位置：狀態 Tab → Socket.IO 狀態區塊下方

| 按鈕 | 功能 |
|------|------|
| 📥 匯出設定 | 下載 `gm-panel-settings-YYYY-MM-DD.json`，包含：advanced_rules、monsters、skill_settings |
| 📤 匯入設定 | 選擇 JSON 檔案，完整寫入 IndexedDB |

匯入成功後自動刷新怪物與技能下拉。

### 🛠 進階設定按鈕 → 有意義提示

點擊「進階設定」時：

- **從未讀取過技能** → 顯示引導提示：
  > 請依序操作：
  > 1️⃣ 進入遊戲，切換到「設定」頁面
  > 2️⃣ 點擊上方「⚡技能」Tab
  > 3️⃣ 點「讀取設定」按鈕

- **模組未完全載入** → 提示「請稍候再試（可嘗試重新整理頁面）」

### 🆕 新動作：`setAuto`（設定自動技能）

```javascript
// emit: setAuto [{openSkill: 'sk_fireball'}]  // 開怪技能
// emit: setAuto [{atkSkill: 'sk_fireball'}]   // 攻擊技能
```

參數：
- **技能 ID**：可直接打字或從下拉選擇（Skills Tab 讀取後可用）
- **類型**：「開怪」（openSkill）或「攻擊」（atkSkill）下拉切換

### 📁 異動檔案

| 檔案 | 變更 |
|------|------|
| `game-monitor.js` | v2.06→v2.07；Skills Tab 讀取後存 IDB；新增匯出/匯入按鈕及事件；進階設定按鈕提示優化 |
| `advanced-farming.js` | v1.4→v1.5；DB v3 新增 skill_settings store；`__gmSkillDB`；`__gmExportAll`/`__gmImportAll`；`setAuto` 動作類型；`setAuto` datalist 下拉；`setAuto` 事件解析 |
| `manifest.json` | v2.06→v2.07 |
| `CHANGELOG.md` | 新增本版 |

---

## [v2.06] - 2026-06-29

### 🎯 怪物下拉自動收錄（Monster Datalist）

#### 1️⃣ IndexedDB 新增 `monsters` Store（v2 schema）
- 新 store `monsters`，以怪物名稱（`name`）為 keyPath，去重儲存
- 升級時自動 migration，不影響既有的 `advanced_rules` 資料

#### 2️⃣ 自動收錄怪物名稱
- `tick()` 每次被呼叫時（遊戲 loop 每秒），掃描 `state.monsters`
- 所有存活的怪物（`m.hp > 0`）名稱自動寫入 `monsters` store
- 同一場戰鬥中遇到的新怪物，2 秒後自動出現在下拉選項裡

#### 3️⃣ 指定目標下拉改為可搜尋 datalist
- `setTarget` 參數 input 掛上 `list="__gmAdvMonsterList"`（HTML5 datalist）
- 支援**直接打字搜尋**（打字時自動過濾）
- 支援**直接輸入數字索引**（仍可正常運作）
- Modal 開啟時自動從 IndexedDB 載入所有已記錄的怪物名稱

#### 4️⃣ 清除怪物紀錄按鈕
- Modal 工具列新增「🗑 清除怪物紀錄」按鈕
- 可選擇性清除怪物名稱庫，不影響規則設定

### 📁 異動檔案

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `advanced-farming.js` | 修改 | v1.2 → v1.3；DB schema v2；`__gmMonsterDB` API；datalist 下拉；tick 自動收錄 |
| `game-monitor.js` | 修改 | 版本 v2.05 → v2.06 |
| `manifest.json` | 修改 | 版本 v2.05 → v2.06 |
| `CHANGELOG.md` | 修改 | 新增本版異動記錄 |

---

## [v2.05] - 2026-06-29

### ⚙️ 進階規則引擎強化 (Advanced Rules Engine Enhancement)

#### 1️⃣ 新增「怪物名稱」條件 (`monsterName`)
- 從 `d.monsters` 讀取所有存活怪物名稱
- 支援「包含」比對（`==` → 名稱包含輸入文字即通過，`!=` → 不包含才通過）
- 可搭配「怪物數量」做 AND 邏輯（例如：怪物數量 > 0 AND 怪物名稱包含「惡魔」）

#### 2️⃣ 新增「指定目標」動作 (`setTarget`)
- 參數：怪物名稱（部分匹配）或索引數字
- 數字 → 直接用數字作為 monster index 發送 `setTarget [idx]`
- 文字 → 在 `d.monsters` 中找第一個名稱包含該文字的怪物，發送對應索引
- 若找不到匹配怪物，顯示警告但不會錯誤崩潰

#### 3️⃣ Modal UI 優化
- `setTarget` 動作的參數輸入框 placeholder 改為「怪物名稱（部分匹配）或索引」
- 技能／藥水／武器等各類動作各自有專屬 placeholder 提示

### 📁 異動檔案

| 檔案 | 變更類型 | 說明 |
|------|---------|------|
| `advanced-farming.js` | 修改 | 新增 monsterName 條件、setTarget 動作、substring 比對邏輯 |
| `game-monitor.js` | 修改 | 版本 v2.04 → v2.05 |
| `manifest.json` | 修改 | 版本 v2.04 → v2.05 |
| `CHANGELOG.md` | 修改 | 新增本版異動記錄 |

---

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
