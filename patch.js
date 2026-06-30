const fs = require('fs');
const f = process.argv[2];
let content = fs.readFileSync(f, 'utf8');
const old = `    var domNames=window.__pmSkillNames||{};
    var hasDomData=Object.keys(domNames).some(function(k){return/^sk_/.test(k)});`;
const rep = `    var domNames=window.__pmSkillNames||{};
    console.log('[AdvFarm] domNames keys:', JSON.stringify(Object.keys(domNames).slice(0,10)), '| has_sk_:', Object.keys(domNames).some(function(k){return/^sk_/.test(k)}));
    var hasDomData=Object.keys(domNames).some(function(k){return/^sk_/.test(k)});`;
if (!content.includes(old)) { console.error('PATTERN NOT FOUND'); process.exit(1); }
content = content.replace(old, rep);
fs.writeFileSync(f, content, 'utf8');
console.log('DONE');
