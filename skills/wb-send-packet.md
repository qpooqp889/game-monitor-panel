# 技能：發送 Socket.IO 封包

> 透過 GM Panel 統一介面安全地發送遊戲封包

---

## 何時使用

當你需要：
- 傳送到地圖
- 攻擊
- 技能施放
- Boss 按鍵
- 使用藥水

---

## 統一介面 (v2.02+)

### `sendZone(zoneId)` - 傳送到地圖

```javascript
// 優先用 SIO emit，失敗降級到 WebSocket
sendZone('zone_04');   // 艾爾摩激戰地
sendZone('town_elf');  // 妖精森林
```

**底層**:
1. `window.__wbSocket.emit('setZone', zoneId)` ⭐
2. `window.__ws.send('42["setZone","'+zoneId+'"]')` 降級

### `sendCmd(cmd)` - 發送一般指令

```javascript
sendCmd('attack');    // 攻擊
sendCmd('toLobby');   // 返回大廳
sendCmd('viewInv');   // 查看背包
sendCmd('sortInv');   // 排序背包
```

### `__wbSend(action)` - Boss 按鍵

```javascript
__wbSend('pot');         // 補血
__wbSend('atk');         // 攻擊
__wbSend('heal');        // 治癒
__wbSend('convert');     // 屬性轉換
__wbSend('barrier');     // 屏障
__wbSend('holybarrier'); // 神聖屏障
```

### `__wbSendPotion(type)` - 藥水

```javascript
__wbSendPotion('potion_heal');    // 一般治療
__wbSendPotion('potion_strong');  // 強力治療
__wbSendPotion('potion_ult');     // 終極治療
```

### `__wbCastSkill(id, target)` - 技能

```javascript
__wbCastSkill('strike');              // 衝擊之眸
__wbCastSkill('heal');                // 治癒
__wbCastSkill('convert_power');       // 屬性轉換
__wbCastSkill('strike', 2);           // 衝擊 + 目標 2
```

---

## 安全檢查清單

發送前確認：

- [ ] `window.__wbSocket && window.__wbSocket.connected === true`
- [ ] 或 `window.__ws && window.__ws.readyState === 1`
- [ ] **否則不要呼叫 `.send()` 或 `.emit()`！**

---

## 完整範例

```javascript
// 在 Console 中
sendZone('zone_04');     // 傳送到艾爾摩激戰地
setTimeout(() => {
  sendCmd('attack');     // 攻擊
}, 2000);
```

---

## 為什麼不要直接用 `window.__ws.send()`？

因為 WebSocket 在以下情況會被關閉但變數還在：
- 切換頁面時
- 重新連線時
- 網路斷線時

這時呼叫 `.send()` 會**直接跳出遊戲**。

`sendZone()` / `sendCmd()` 內建 `readyState === 1` 保護。
