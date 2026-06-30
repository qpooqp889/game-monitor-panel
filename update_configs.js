const fs = require('fs');
const dir = 'C:/Users/steve/Documents/chrome插件/game-monitor-panel_v3/';

// manifest.json
let m = fs.readFileSync(dir + 'manifest.json', 'utf8');
m = m.replace('"2.26"', '"3.00"');
m = m.replace('"resources": ["game-monitor.js", "advanced-farming.js"]', '"resources": ["game-monitor.js", "advanced-farming.js", "wb-boss.js"]');
fs.writeFileSync(dir + 'manifest.json', m, 'utf8');
console.log('manifest.json updated');

// popup.js
let p = fs.readFileSync(dir + 'popup.js', 'utf8');
p = p.replace("files: ['game-monitor.js', 'advanced-farming.js']", "files: ['game-monitor.js', 'wb-boss.js', 'advanced-farming.js']");
fs.writeFileSync(dir + 'popup.js', p, 'utf8');
console.log('popup.js updated');

// CHANGELOG.md
const changelog = '\n## v3.00 (2026-06-30)\n- World Boss 模組化：wb-boss.js 獨立模組（26 個 __wb* 函數 + Socket hook + 變數初始化）\n- BOSS Tab 新增 60 秒倒數計時顯示\n- BOSS Tab 空列表時自動點擊狩獵場→世界王分頁（autoNav）\n- 目錄：game-monitor-panel_v3\n';
fs.appendFileSync(dir + 'CHANGELOG.md', changelog, 'utf8');
console.log('CHANGELOG.md updated');

console.log('All files updated');
