# Game Monitor Panel - 遊戲監控面板

[![GitHub stars](https://img.shields.io/github/stars/qpooqp889/game-monitor-panel)](https://github.com/qpooqp889/game-monitor-panel/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Chrome 擴展插件，即時監控網頁遊戲的狀態數據。

**GitHub**: https://github.com/qpooqp889/game-monitor-panel

## 功能特色

- ⚡ **即時監控** - 攔截 WebSocket 封包，即時顯示遊戲狀態
- 🎮 **角色資訊** - 顯示角色名稱、等级、HP、MP、EXP
- 👾 **怪物列表** - 顯示場上怪物及其血量
- 💰 **金幣顯示** - 顯示當前金幣數量
- 🔧 **可拖動面板** - 自由移動面板位置
- 📐 **縮放控制** - 支援面板放大/縮小
- 📂 **展開/收合** - 一鍵收合面板

## 安裝方式

### 方法一：開發者模式安裝（推薦）

1. 下載此專案
2. 開啟 Chrome，進入 `chrome://extensions/`
3. 開啟右上角「開發人員模式」
4. 點擊「載入未封裝項目」
5. 選擇 `game-monitor-extension` 資料夾

### 方法二：GitHub 下載

1. 到 GitHub Releases 下載最新版本的 ZIP 檔
2. 解壓縮
3. 按上述步驟 2-5 安裝

## 使用說明

1. 安裝完成後，點擊 Chrome 工具列的插件圖示
2. 進入遊戲頁面（如 `linh5web.win`）
3. 點擊 **INJECT MONITOR** 按鈕
4. 等待插件注入成功（按鈕變綠色顯示 ✓）
5. 點擊 **SHOW PANEL** 查看監控面板

## 面板操作

| 按鈕 | 功能 |
|------|------|
| ▼ | 展開/收合面板內容 |
| + | 放大面板 |
| - | 縮小面板 |
| X | 關閉面板 |

## 技術原理

本擴展使用以下技術：

- **Chrome Extension Manifest V3** - 最新擴展 API
- **WebSocket 封包攔截** - Hook WebSocket.prototype.send
- **MAIN World 執行** - 在頁面主上下文執行腳本
- **Content Script 通信** - 通過 chrome.runtime 進行通信

## 支援的遊戲

本擴展針對 Socket.IO 架構的 WebSocket 遊戲設計，測試遊戲：
- linh5web.win

## 隱私說明

- 本擴展不會收集或上傳任何用戶數據
- 所有數據僅在本地瀏覽器中處理
- 僅監控用戶主動訪問的遊戲頁面

## 授權

MIT License

## 更新日誌

### v1.0
- 初始版本
- 支援即時監控面板
- 支援面板拖動、縮放、展開/收合
