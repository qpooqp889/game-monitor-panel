const fs = require('fs');
const f = process.argv[2];
let content = fs.readFileSync(f, 'utf8');

const old = `function refreshSkillDatalist(){
    var dl=document.getElementById('__gmAdvSkillList');
    if(!dl)return;
    // 策略：優先讀遊戲 DOM（window.__pmSkillNames），若空白再讀 storage
    var domNames=window.__pmSkillNames||{};
    console.log('[AdvFarm] domNames keys:', JSON.stringify(Object.keys(domNames).slice(0,10)), '| has_sk_:', Object.keys(domNames).some(function(k){return/^sk_/.test(k)}));
    var hasDomData=Object.keys(domNames).some(function(k){return/^sk_/.test(k)});
    if(hasDomData){
      buildFromNames(domNames);
      return;
    }
    // fallback：從 chrome.storage.local 讀
    __gmSkillDB.getLatest().then(function(rec){
      if(rec&&rec.skillNames&&Object.keys(rec.skillNames).length){
        buildFromNames(rec.skillNames);
      } else {
        // 終極 fallback：直接掃遊戲 DOM 的 data-skill / data-k select
        var fallback={};
        document.querySelectorAll('[data-skill]').forEach(function(el){var v=el.getAttribute('data-skill');if(v&&/^sk_/.test(v)){fallback[v]=el.closest('label')?el.closest('label').textContent.trim():v}});
        document.querySelectorAll('[data-k]').forEach(function(el){
          if(el.tagName==='SELECT')[].forEach.call(el.options,function(o){
            var v=o.value;if(v&&/^sk_/.test(v)&&!fallback[v]){var txt=o.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim();fallback[v]=txt||v}
          });
        });
        buildFromNames(fallback);
      }
    });
    function buildFromNames(skillNames){
      var seen={};
      var options=[];
      Object.keys(skillNames).sort().forEach(function(skillId){
        if(!skillId||!/^sk_/.test(skillId))return;
        if(seen[skillId])return;
        seen[skillId]=true;
        var name=skillNames[skillId]||skillId;
        var display=name.replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim();
        options.push('<option value="'+escapeHtml(skillId)+'">'+escapeHtml(display)+' ('+escapeHtml(skillId)+')</option>');
      });
      dl.innerHTML=options.join('');
    }
  }`;

const rep = `function refreshSkillDatalist(){
    var dl=document.getElementById('__gmAdvSkillList');
    if(!dl)return;
    // 策略：直接從遊戲 DOM 三層掃描（繞過 __pmSkillNames 不確定的問題）
    var found={};
    // 第1層：#panel-scroll 內的 data-k select（自動攻擊設定區）
    document.querySelectorAll('#panel-scroll [data-k]').forEach(function(el){
      if(el.tagName==='SELECT')[].forEach.call(el.options,function(o){
        var v=o.value;if(v&&/^sk_/.test(v)&&!found[v]){
          found[v]=o.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim()||v;
        }
      });
    });
    // 第2層：data-skill checkbox / input
    document.querySelectorAll('[data-skill]').forEach(function(el){
      var v=el.getAttribute('data-skill');if(v&&/^sk_/.test(v)&&!found[v]){
        var lbl=el.closest('label');found[v]=lbl?lbl.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim():v;
      }
    });
    // 第3層：整頁任何含 sk_ 的 select option
    document.querySelectorAll('select').forEach(function(sel){
      [].forEach.call(sel.options,function(o){
        var v=o.value;if(v&&/^sk_/.test(v)&&!found[v]){
          found[v]=o.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim()||v;
        }
      });
    });
    // 同步到 window 供外部使用
    window.__gmSkillMap=found;
    var options=Object.keys(found).sort().map(function(skillId){
      return'<option value="'+escapeHtml(skillId)+'">'+escapeHtml(found[skillId])+' ('+escapeHtml(skillId)+')</option>';
    });
    dl.innerHTML=options.join('');
    console.log('[AdvFarm] refreshSkillDatalist found', Object.keys(found).length, 'skills:', JSON.stringify(Object.keys(found).slice(0,5)));
  }`;

if (!content.includes(old)) {
  // Try to find what's actually there
  const idx = content.indexOf('function refreshSkillDatalist()');
  console.error('Pattern not found. Content around fn:');
  console.error(content.substring(idx, idx + 200));
  process.exit(1);
}
content = content.replace(old, rep);
fs.writeFileSync(f, content, 'utf8');
console.log('DONE');
