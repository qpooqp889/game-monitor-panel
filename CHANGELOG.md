# 異動說明 (CHANGELOG)

## [v1.32] - 2026-06-27

### 修正 (Fixed)

#### BOSS Tab 狀態偵測修正
- **問題**：`window.lastState` 為 `null`，導致 BOSS Tab 無法顯示 BOSS 血量、角色狀態和冷卻計時。
- **原因**：遊戲的 `lastState` 是局部變數，非全域變數。Socket.IO 的 `state` 事件被捕獲但未解析。
- **解決**：修改 `onevent` hook，解析 `state` 事件並更新 `window.lastState`。

#### 異動檔案
- `game-monitor.js`

#### 異動內容

**新增 (第 17 行)**：
```javascript
window.lastState=null;  // 初始化全域 lastState
```

**修改 (第 31-44 行)**：
```javascript
// 修正前
SP.onevent=function(p){
  if(!window.__wbSocket)window.__wbSocket=this;
  if(p&&p.data&&p.data[0]){
    window.__sioPackets=window.__sioPackets||[];
    window.__sioPackets.push({t:Date.now(),dir:'EVENT',evt:p.data[0],args:JSON.stringify(p.data).slice(0,300)});
  }
  if(_oe)_oe.call(this,p);
};

// 修正後
SP.onevent=function(p){
  if(!window.__wbSocket)window.__wbSocket=this;
  if(p&&p.data&&p.data[0]){
    var evtName=p.data[0];
    window.__sioPackets=window.__sioPackets||[];
    window.__sioPackets.push({t:Date.now(),dir:'EVENT',evt:evtName,args:JSON.stringify(p.data).slice(0,500)});
    // 解析 state 事件並更新 window.lastState
    if(evtName==='state'&&p.data[1]){
      window.lastState=p.data[1];
    }
  }
  if(_oe)_oe.call(this,p);
};
```

### 影響功能

修正後，以下功能可正常運作：

| 功能 | 狀態 |
|------|------|
| BOSS 血量顯示 | ✅ 從 `lastState.boss` 讀取 |
| 角色狀態顯示 | ✅ 從 `lastState.char` 讀取 |
| 冷卻計時顯示 | ✅ 從 `lastState.boss.cd` 讀取 |
| 自動掛機 | ✅ `__wbBossLoop()` 使用 `lastState` |
| 按鈕邏輯 | ✅ `__wbSend()` 正確綁定 |

### 使用方式

1. 重新載入遊戲頁面（F5）
2. 點擊擴充功能 → INJECT MONITOR
3. 點擊 SHOW PANEL
4. 切換到 BOSS Tab

### 技術細節

- **Socket.IO Hook**：透過 `io.Socket.prototype.onevent` 劫持接收事件
- **State 事件**：Server 每秒推送多次 `state` 事件，包含 `mode`、`boss`、`char` 等狀態
- **冷卻驗證**：Server 端控制，Client 無法繞過

---

## [v1.31] - 之前版本

### 功能
- GM Panel 基礎架構
- 狀態、地圖、掛機、BOSS Tab
- Socket.IO Hook 捕獲封包
- 自動掛機邏輯
- 冷卻 Bypass 開關
