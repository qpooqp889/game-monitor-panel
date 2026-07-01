const fs = require("fs");
const wb = fs.readFileSync("C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/wb-boss.js", "utf8");
for (const s of ["Respawn", "defeated", "__wbAddBossScriptLog"]) {
  const i = wb.indexOf(s);
  console.log((i >= 0 ? "found at " + i : "NOT found") + ": " + s);
}
