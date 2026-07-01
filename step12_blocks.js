const fs = require("fs");
const gm = fs.readFileSync("C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/game-monitor.js", "utf8");

// 1. Find auto_script block
const sIdx = gm.indexOf("__gmp_boss_auto_script\"");
console.log("auto_script at", sIdx);

const asIdx = gm.indexOf("background:rgba(76,175,80,0.10)", sIdx - 200);
const divOpenIdx = gm.lastIndexOf("'<div", asIdx);
const closeDivIdx = gm.indexOf("'</div>'", asIdx);
const afterClose = closeDivIdx + 8;
const afterNewlines = gm.indexOf("'<div", afterClose);

if (afterNewlines > 0) {
  const block1 = gm.substring(divOpenIdx, afterNewlines);
  console.log("block1 length:", block1.length);
  const gm2 = gm.substring(0, divOpenIdx) + gm.substring(afterNewlines);
  fs.writeFileSync("C:/Users/steve/DOCUME~1/CHROME~1/gm_step1.txt", gm2, "utf8");
  console.log("OK: Step 1 - auto_script checkbox removed");
} else {
  console.log("FAIL: Step 1");
}

// Re-read the modified version for step 2
const gm1 = fs.readFileSync("C:/Users/steve/DOCUME~1/CHROME~1/gm_step1.txt", "utf8");

// 2. Replace enable row
const enIdx = gm1.indexOf("__gmp_boss_auto_enable\"");
console.log("\nenable at", enIdx);

// The enable row is the open div + checkbox + label + span + spacer + config button
// It starts with: '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(233,69,96,0.12);border-radius:6px;">
// and ends with '</div>' then blank line
const enDiv = gm1.indexOf("background:rgba(233,69,96,0.12)", enIdx - 200);
console.log("enable div background at", enDiv);
const enDivOpen = gm1.lastIndexOf("'<div", enDiv);
const enDivClose = gm1.indexOf("'</div>'", enDiv);
const afterEnDiv = enDivClose + 8;

// Find next content after the enable block
const nextContent = gm1.indexOf("'<div", afterEnDiv);
if (nextContent > 0) {
  const oldBlock = gm1.substring(enDivOpen, nextContent);
  console.log("Enable block length:", oldBlock.length);
  
  const CR = "\r\n";
  const newBlock = 
    "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+" + CR +
    "'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
    "'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F 自動BOSS 自動腳本</label>'+" + CR +
    "'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
    "'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\\u00B7 閒置中</span>'+" + CR +
    "'<div style=\"flex:1;\"></div>'+" + CR +
    "'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 進階設定</button>'+" + CR +
    "'</div>'+" + CR;
  
  const gm3 = gm1.substring(0, enDivOpen) + newBlock + gm1.substring(nextContent);
  fs.writeFileSync("C:/Users/steve/DOCUME~1/CHROME~1/gm_step2.txt", gm3, "utf8");
  console.log("OK: Step 2 - enable row replaced");
} else {
  console.log("FAIL: Step 2 - cannot find next content after enable row");
}
