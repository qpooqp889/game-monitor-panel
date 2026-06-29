# GM Panel 技能包 (Skills)

> Game Monitor Panel 擴充套件的技術技能集

---

## 📚 技能列表

| 技能 | 用途 | 優先級 |
|------|------|--------|
| [wb-sio-hook.md](./wb-sio-hook.md) | 安裝 SIO Hook 攔截封包 | 🥇 核心 |
| [wb-monitor-state.md](./wb-monitor-state.md) | 監聽 state 事件 | 🥇 核心 |
| [wb-send-packet.md](./wb-send-packet.md) | 統一發送封包介面 | 🥇 核心 |

---

## 🎯 使用順序

### 1. 安裝 Hook (一次性)
→ `wb-sio-hook.md`

### 2. 讀取狀態
→ `wb-monitor-state.md`

### 3. 發送指令
→ `wb-send-packet.md`

---

## 🔗 全域變數速查

| 變數 | 來源 | 說明 |
|------|------|------|
| `window.__wbSioHooked` | sio-hook | Hook 是否已安裝 |
| `window.__wbSocket` | sio-hook | Socket 實例 |
| `window.__wbBossEmitLog` | sio-hook | SEND 封包記錄 |
| `window.__sioPackets` | sio-hook | RECV 封包記錄 |
| `window.lastState` | monitor-state | 最新 state 事件 |
| `sendZone()` | send-packet | 傳送地圖 |
| `sendCmd()` | send-packet | 發送指令 |
| `__wbSend()` | send-packet | Boss 按鍵 |
| `__wbSendPotion()` | send-packet | 藥水 |
| `__wbCastSkill()` | send-packet | 技能 |

---

## 📋 完整範例

```javascript
// 1. 確認 Hook 已安裝
if (!window.__wbSioHooked) {
  console.error('請先安裝 SIO hook');
}

// 2. 檢查當前狀態
var s = window.lastState;
if (!s) {
  console.error('尚未收到 state 事件');
  return;
}

console.log('當前位置:', s.zoneName);
console.log('HP:', s.char.hp, '/', s.char.maxHp);
console.log('模式:', s.mode);

// 3. 根據狀態執行對應動作
if (s.mode === 'lobby' && s.char.hp / s.char.maxHp > 0.9) {
  // 在大廳且 HP 滿 → 傳送到掛機地圖
  sendZone('zone_04');
} else if (s.mode === 'combat' && s.char.hp / s.char.maxHp < 0.3) {
  // HP 過低 → 補血
  __wbSendPotion('potion_heal');
}
```

---

## 🛠️ 故障排除

| 問題 | 原因 | 解法 |
|------|------|------|
| `__wbSocket` 為 null | Hook 沒抓到 socket | 重新整理頁面 |
| `lastState` 為 null | 沒收到 state 事件 | 切換地圖或攻擊 |
| 點地圖跳出遊戲 | WebSocket 已關閉 | 使用 `sendZone()` |
| 封包沒被攔截 | Hook 沒安裝 | 確認 `__wbSioHooked` |

---

## 📂 相關文件

- `../封包相關.md` - 完整封包技術文件
- `../CHANGELOG.md` - 版本歷史
- `../README.md` - 擴充套件說明
