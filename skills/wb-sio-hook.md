# 技能：SIO Hook 安裝

> 攔截 Socket.IO 的發送和接收封包

---

## 何時使用

當你需要：
- 除錯網路封包
- 攔截所有 SIO 通訊
- 取得 Socket 實例
- 監聽特定事件

---

## 安裝位置

```javascript
window.io.Socket.prototype
```

這是 Socket.IO 4.x 的標準位置。

---

## Hook 1: SEND 攔截 (`packet`)

```javascript
(function() {
  if (window.__wbSioHooked) return;
  
  var SP = window.io && window.io.Socket && window.io.Socket.prototype;
  if (!SP) {
    setTimeout(arguments.callee, 300);
    return;
  }
  
  window.__wbSioHooked = true;
  
  if (!SP.__wbPkt) {
    SP.__wbPkt = true;
    var _origPkt = SP.packet;
    SP.packet = function(packet) {
      // type 2 = EVENT, type 3 = ACK
      if (packet && (packet.type === 2 || packet.type === 3)) {
        var ev = packet.data && packet.data[0] || null;
        var args = packet.data && packet.data.slice(1) || [];
        window.__wbBossEmitLog.push({
          t: Date.now(),
          dir: 'SEND',
          evt: ev,
          args: JSON.stringify(args).slice(0, 300)
        });
      }
      return _origPkt && _origPkt.call(this, packet);
    };
  }
})();
```

**捕獲的封包類型**:
- `type: 0` CONNECT
- `type: 1` DISCONNECT
- `type: 2` EVENT ⭐
- `type: 3` ACK
- `type: 4` CONNECT_ERROR
- `type: 5` BINARY_EVENT
- `type: 6` BINARY_ACK

---

## Hook 2: RECEIVE 攔截 (`onevent`)

```javascript
if (!SP.__wbOE) {
  SP.__wbOE = true;
  var _oe = SP.onevent;
  SP.onevent = function(p) {
    // 取得 socket 引用
    if (!window.__wbSocket) window.__wbSocket = this;
    
    if (p && p.data && p.data[0]) {
      var evtName = p.data[0];
      
      // 記錄所有事件
      window.__sioPackets.push({
        t: Date.now(),
        dir: 'EVENT',
        evt: evtName,
        args: JSON.stringify(p.data).slice(0, 500)
      });
      
      // 關鍵：解析 state 事件
      if (evtName === 'state' && p.data[1]) {
        window.lastState = p.data[1];
      }
    }
    if (_oe) _oe.call(this, p);
  };
}
```

---

## 取得 Socket 實例

### 方法 1: 從 onevent hook 取得（推薦）

```javascript
window.__wbSocket  // 在 onevent 第一次觸發時自動設定
```

### 方法 2: 手動呼叫

```javascript
var s = window.io();
if (s && s.connected) {
  window.__wbSocket = s;
}
```

### 方法 3: 從 Manager 取得

```javascript
var manager = window.io.managers[Object.keys(window.io.managers)[0]];
if (manager && manager.nsps) {
  var nspName = Object.keys(manager.nsps)[0];
  window.__wbSocket = manager.nsps[nspName];
}
```

---

## Socket 物件 API

```javascript
window.__wbSocket.connected       // bool: 是否已連線
window.__wbSocket.id              // string: socket ID
window.__wbSocket.emit('event', data)  // 發送事件
window.__wbSocket.on('event', cb) // 監聽事件
window.__wbSocket.disconnect()    // 中斷連線
```

---

## 完整 Hook 範例（含自動重連）

```javascript
(function() {
  function installSioHook() {
    if (window.__wbSioHooked) return;
    var SP = window.io && window.io.Socket && window.io.Socket.prototype;
    if (!SP) {
      setTimeout(installSioHook, 300);
      return;
    }
    window.__wbSioHooked = true;
    
    // ... (上方 Hook 1 + Hook 2 代碼) ...
    
    // 嘗試取得現有 socket
    setTimeout(function() {
      try {
        var s = window.io();
        if (s && s.connected) {
          window.__wbSocket = s;
        }
      } catch (e) {}
    }, 1000);
  }
  
  setTimeout(installSioHook, 500);
  
  // 持續監控 socket 狀態
  setInterval(function() {
    if (window.__wbSocket && window.__wbSocket.connected) return;
    try {
      var s = window.io();
      if (s && s.connected) {
        window.__wbSocket = s;
        console.log('[WB] Socket re-acquired');
      }
    } catch (e) {}
  }, 3000);
})();
```

---

## 除錯

### 查看所有攔截的封包

```javascript
console.table(
  window.__sioPackets.slice(-20).map(p => ({
    time: new Date(p.t).toLocaleTimeString(),
    dir: p.dir,
    evt: p.evt
  }))
);
```

### 查看所有發送的封包

```javascript
console.table(
  window.__wbBossEmitLog.slice(-20).map(p => ({
    time: new Date(p.t).toLocaleTimeString(),
    evt: p.evt,
    args: p.args.slice(0, 50) + '...'
  }))
);
```

### 清空記錄

```javascript
window.__sioPackets.length = 0;
window.__wbBossEmitLog.length = 0;
```

---

## 注意事項

1. **重複安裝保護**: 使用 `__wbPkt`、`__wbOE` 標記避免重複
2. **原型鏈修改**: 修改 `Socket.prototype` 會影響所有 socket
3. **記憶體**: `__sioPackets` 和 `__wbBossEmitLog` 會持續增長，記得定期清空
4. **state 事件**: 必須在 onevent hook 中解析，否則 `window.lastState` 會是 null

---

## 相關技能

- `wb-send-packet.md` - 發送封包
- `wb-monitor-state.md` - 監聽 state 事件
