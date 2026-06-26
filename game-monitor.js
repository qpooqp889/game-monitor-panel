(function(){
if(window.__gmInjected){console.log('[GM] Already injected');return;}
window.__gmInjected=true;

// Create panel immediately
(function(){
var old=document.getElementById('__gmp');if(old)old.remove();
var isExpanded=true;var zoom=1;
var p=document.createElement('div');p.id='__gmp';
Object.assign(p.style,{position:'fixed',top:'10px',right:'10px',width:'300px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',border:'2px solid #0f3460',borderRadius:'12px',padding:'15px',fontFamily:'Segoe UI',color:'#fff',zIndex:'999999',boxShadow:'0 4px 20px rgba(0,0,0,0.5)',cursor:'move'});
p.innerHTML=
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #0f3460;">'+
'<button id="__gmp_expand" style="background:#0f3460;border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px;margin-right:8px;">▼</button>'+
'<span style="font-weight:bold;font-size:16px;color:#00d9ff;flex:1;">GAME MONITOR</span>'+
'<button id="__gmp_zoom_in" style="background:#333;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;margin-right:4px;">+</button>'+
'<button id="__gmp_zoom_out" style="background:#333;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;margin-right:4px;">-</button>'+
'<button id="__gmp_close" style="background:#e94560;border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;">X</button>'+
'</div>'+
'<div id="__gmp_content">'+
'<div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;margin-bottom:10px;"><div id="__gmp_name" style="font-weight:bold;color:#ffd700;font-size:16px;">Loading...</div><div id="__gmp_info" style="font-size:12px;color:#aaa;">Lv.?</div></div>'+
'<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;"><span style="color:#e94560;">HP</span><span id="__gmp_hp_text" style="color:#e94560;">--/--</span></div><div style="background:#3a1a1a;border-radius:8px;height:20px;"><div id="__gmp_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:8px;"></div></div></div>'+
'<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;"><span style="color:#00d9ff;">MP</span><span id="__gmp_mp_text" style="color:#00d9ff;">--/--</span></div><div style="background:#1a2a3a;border-radius:8px;height:16px;"><div id="__gmp_mp_bar" style="width:0%;background:#00d9ff;height:100%;border-radius:8px;"></div></div></div>'+
'<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;"><span style="color:#ffd700;">EXP</span><span id="__gmp_exp_text" style="color:#ffd700;">--%</span></div><div style="background:#3a3a1a;border-radius:8px;height:12px;"><div id="__gmp_exp_bar" style="width:0%;background:#ffd700;height:100%;border-radius:8px;"></div></div></div>'+
'<div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;margin-bottom:10px;"><span>GOLD: </span><span id="__gmp_gold" style="color:#ffd700;">--</span></div>'+
'<div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;margin-bottom:10px;"><div style="font-weight:bold;margin-bottom:5px;">MONSTERS</div><div id="__gmp_mobs" style="font-size:13px;">...</div></div>'+
'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'+
'<button id="__gmp_btn_hp" style="padding:12px;background:#e94560;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:bold;">HP</button>'+
'<button id="__gmp_btn_atk" style="padding:12px;background:#0f3460;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:bold;">ATK</button>'+
'<button id="__gmp_btn_stop" style="padding:12px;background:#333;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:bold;">STOP</button>'+
'</div>'+
'</div>';
document.body.appendChild(p);
document.getElementById('__gmp_btn_hp').onclick=function(){window.__ws&&window.__ws.send('42["useItem","potion_heal"]');};
document.getElementById('__gmp_btn_atk').onclick=function(){window.__ws&&window.__ws.send('42["attack"]');};
document.getElementById('__gmp_btn_stop').onclick=function(){window.__ws&&window.__ws.send('42["stop"]');};
document.getElementById('__gmp_close').onclick=function(){var panel=document.getElementById('__gmp');if(panel)panel.remove();};
document.getElementById('__gmp_expand').onclick=function(){isExpanded=!isExpanded;document.getElementById('__gmp_content').style.display=isExpanded?'block':'none';this.textContent=isExpanded?'▼':'▶';};
document.getElementById('__gmp_zoom_in').onclick=function(){zoom=Math.min(zoom+0.1,2);p.style.transform='scale('+zoom+')';};
document.getElementById('__gmp_zoom_out').onclick=function(){zoom=Math.max(zoom-0.1,0.5);p.style.transform='scale('+zoom+')';};
var drag=false,ox,oy;
p.addEventListener('mousedown',function(e){if(e.target.tagName!=='BUTTON'){drag=true;ox=e.clientX-p.offsetLeft;oy=e.clientY-p.offsetTop;}});
document.addEventListener('mousemove',function(e){if(drag){p.style.left=(e.clientX-ox)+'px';p.style.top=(e.clientY-oy)+'px';p.style.right='auto';}});
document.addEventListener('mouseup',function(){drag=false;});
})();

// Hook WebSocket
var origSend=WebSocket.prototype.send;
WebSocket.prototype.send=function(data){
window.__ws=this;
window.__ws.addEventListener('message',function(e){
try{var d=JSON.parse(e.data.substring(2));if(d[0]==='state'){window.__gmState=d[1];}}catch(err){}
});
return origSend.call(this,data);
};

// Update function
function upd(){
var c=(window.__gmState||{}).char;
if(!c)return;
document.getElementById('__gmp_name').textContent=c.name;
document.getElementById('__gmp_info').textContent='Lv.'+c.level;
document.getElementById('__gmp_hp_text').textContent=c.hp+'/'+c.maxHp;
document.getElementById('__gmp_hp_bar').style.width=Math.round(c.hp/c.maxHp*100)+'%';
document.getElementById('__gmp_mp_text').textContent=c.mp+'/'+c.maxMp;
document.getElementById('__gmp_mp_bar').style.width=Math.round(c.mp/c.maxMp*100)+'%';
document.getElementById('__gmp_exp_text').textContent=Math.round(c.exp/c.expToNext*100)+'%';
document.getElementById('__gmp_exp_bar').style.width=Math.round(c.exp/c.expToNext*100)+'%';
document.getElementById('__gmp_gold').textContent=c.gold?c.gold.toLocaleString():'--';
var h='';
var d=window.__gmState;
if(d.monsters)d.monsters.forEach(function(m,i){if(m){var pct=Math.round(m.hp/m.maxHp*100);var col=pct>50?'#4ade80':pct>25?'#fbbf24':'#e94560';h+='<div>['+i+'] '+m.n+' <span style="color:'+col+';">'+m.hp+'/'+m.maxHp+'</span></div>';}});
document.getElementById('__gmp_mobs').innerHTML=h||'<span style="color:#888;">none</span>';
}
setInterval(upd,500);
console.log('[GM] Monitor injected with panel!');
})();
