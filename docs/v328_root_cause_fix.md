# v3.28 根因分析：世界列表 [+] 無法加入優先討伐清單

**時間**: 2026-07-01 22:21 GMT+8  
**問題**: 點擊世界王列表中的 `[+]` 按鈕無法將 BOSS 加入優先討伐清單

## 根因

`__wbUpdateWorldBossUI` 在兩個檔案中**各有一份獨立定義**，wb-boss.js 後載入覆蓋了 game-monitor.js 的版本。兩個版本渲染 `[+]` 按鈕時使用了**不相容的 HTML data 屬性**：

| 檔案 (載入順序) | `[+]` 按鈕 HTML |
|---|---|
| game-monitor.js (先載入) | `data-wb-add-hunt="id\|name\|lv"` |
| **wb-boss.js (後載入，覆蓋)** | `data-wb-add-id="id" data-wb-add-name="name" data-wb-add-lv="lv"` |

點擊 handler（`game-monitor.js` L1607 的 `document.addEventListener('click', ...)`）只認 `data-wb-add-hunt` 格式，但 DOM 已被 wb-boss.js 版本渲染成 `data-wb-add-id` 屬性 → **永遠匹配不到** → `[+]` 不觸發任何動作。

```js
// game-monitor.js handler（舊版，只認一種格式）
if(t&&t.getAttribute&&t.getAttribute('data-wb-add-hunt')){
  var parts=t.getAttribute('data-wb-add-hunt').split('|');
  ...
}
```

## 修復

**game-monitor.js**：點擊 handler 改為相容兩種格式：

```js
// Support both data-wb-add-hunt (gm) and data-wb-add-id (wb-boss) formats
var huntId=null,huntName=null,huntLv=null;
if(t&&t.getAttribute&&(huntId=t.getAttribute('data-wb-add-hunt')||t.getAttribute('data-wb-add-id'))){
  if(t.getAttribute('data-wb-add-hunt')){
    var parts=huntId.split('|');
    if(parts.length>=3){huntId=parts[0];huntName=parts[1];huntLv=parseInt(parts[2],10);}
    else huntId=null;
  } else {
    huntName=t.getAttribute('data-wb-add-name')||'';
    huntLv=parseInt(t.getAttribute('data-wb-add-lv'))||0;
  }
  if(huntId&&typeof window.__wbAddToHuntList==='function'){
    window.__wbAddToHuntList(huntId,huntName,huntLv);
    __wbUpdateWorldBossUI();
  }
}
```

## 順帶發現的隱患

1. **重複定義**：`__wbUpdateWorldBossUI` 在兩個檔案中各有一份，功能不完全相同（game-monitor.js 版支援 `autoNav` 自動導航、顯示倒數計時器；wb-boss.js 版無 autoNav、只顯示"每 60s"）。後載入的 wb-boss.js 版本會覆蓋前者，可能導致自動導航等進階功能失效。

2. **缺少 delegation handler**：`data-wb-remove`（`[x]` 移除按鈕）和 `data-wb-move`（▲▼ 移動按鈕）在 wb-boss.js 的 `__wbUpdateHuntListUI` 中產生了 HTML 屬性，但**沒有任何 click event delegation 處理它們** —— 移除和移動功能同樣不可用。

## 建議後續

- 統一 `__wbUpdateWorldBossUI` 為一個版本（保留 game-monitor.js 版，從 wb-boss.js 刪除重複定義）
- 補上 `data-wb-remove` 和 `data-wb-move` 的 click delegation handler

## 教訓

跨檔案同名函數覆蓋 + data 屬性格式不同步 = 看似簡單的 bug 花了 8+ 小時排查。**永遠不要再讓同一個 DOM 渲染函數有兩個不同版本。**
