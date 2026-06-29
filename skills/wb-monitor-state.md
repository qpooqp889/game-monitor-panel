# 技能：監聽 state 事件

> 從 Socket.IO 接收 `state` 事件並解析為 `window.lastState`

---

## 何時使用

當你需要：
- 讀取角色 HP/MP/EXP
- 判斷是否在大廳
- 判斷戰鬥模式
- 取得怪物清單
- 取得 Boss 狀態

---

## 快速開始

### 讀取當前狀態

```javascript
var s = window.lastState;
if (s) {
  console.log('HP:', s.char.hp, '/', s.char.maxHp);
  console.log('MP:', s.char.mp, '/', s.char.maxMp);
  console.log('Mode:', s.mode);            // combat / lobby / bosscombat
  console.log('Zone:', s.zoneName);
}
```

### 判斷大廳

```javascript
function isInLobby() {
  return window.lastState && window.lastState.mode === 'lobby';
}

if (isInLobby()) {
  console.log('在大廳');
}
```

### 判斷戰鬥中

```javascript
function isInCombat() {
  return window.lastState && window.lastState.mode === 'combat';
}
```

### 判斷 Boss 戰

```javascript
function isBossCombat() {
  return window.lastState && window.lastState.mode === 'bosscombat' && window.lastState.boss;
}
```

---

## state 物件完整結構

```javascript
{
  mode: "combat",              // combat | lobby | bosscombat
  char: {
    name: "愛情特派員",
    cls: "knight",             // knight / elf / wizard / prince / ...
    clsName: "騎士",
    level: 48,
    exp: 5869445,
    expToNext: 9912189,
    gold: 2208082,
    hp: 881, maxHp: 1261,
    mp: 5, maxMp: 48,
    str: 18, dex: 12, con: 20, int: 8, wis: 9, cha: 8,
    ac: -45, mr: 4, er: 6,
    buffs: [
      { n: "加速", icon: "..." },
      { n: "神聖武器", icon: "..." }
    ],
    poly: { n: "德雷克", c: "#e5e7eb" }
  },
  zoneId: "zone_25",
  zoneName: "奇岩地監4樓",
  bg: "assets/background/dungeon.jpg",
  monsters: [
    { n: "食人妖精", img: "...", lv: 22, hp: 250, maxHp: 250 },
    { n: "食人妖精王", img: "...", lv: 30, hp: 400, maxHp: 400 }
  ],
  targetIdx: 2,                // 當前攻擊目標索引
  boss: null,                  // Boss 戰時才有
  worldBosses: [...],          // 世界王列表
  log: [                       // 戰鬥 log
    "擊殺 食人妖精王，+1126 經驗 +216 金幣"
  ]
}
```

---

## 戰鬥迴圈範例

```javascript
function combatLoop() {
  if (!window.__gmFarming.running) return;
  var d = window.lastState;
  if (!d || !d.char) {
    setTimeout(combatLoop, 1000);
    return;
  }
  
  // HP/MP 計算
  var hpPct = d.char.hp / d.char.maxHp;
  var mpPct = d.char.mp / d.char.maxMp;
  
  // 自動攻擊
  if (d.mode === 'combat' && hpPct > 0.3) {
    sendCmd('attack');
  }
  
  // 自動補血
  if (hpPct < 0.5) {
    __wbSendPotion('potion_heal');
  }
  
  setTimeout(combatLoop, 1000);
}
combatLoop();
```

---

## 監控所有 SIO 封包

```javascript
// 查看最近 10 筆封包
console.table(
  window.__sioPackets.slice(-10).map(p => ({
    t: new Date(p.t).toLocaleTimeString(),
    dir: p.dir,
    evt: p.evt
  }))
);
```

---

## 故障排除

### lastState 是 null

**原因**: SIO hook 還沒收到 `state` 事件。

**檢查**:
```javascript
console.log('Hook 安裝:', window.__wbSioHooked);  // 應該是 true
console.log('封包數:', window.__sioPackets.length);  // 應該 > 0
```

**手動觸發**:
- 切換地圖（會收到新 state）
- 攻擊一次（會收到 state 更新）
- 重新整理頁面

### state 解析失敗

**原因**: `state` 事件格式可能因版本而異。

**檢查原始封包**:
```javascript
var last = window.__sioPackets.filter(p => p.evt === 'state').pop();
console.log(last.args);
```

---

## 相關技能

- `wb-send-packet.md` - 如何發送封包
- `wb-sio-hook.md` - SIO hook 機制
