// ====== Continue: Farming Logic ======
(function(){
  // Farm button click
  document.getElementById('__gmp_farm_btn').addEventListener('click', function(){
    if(window.__gmFarming.running){
      // Stop farming
      window.__gmFarming.running=false;
      if(window.__gmFarming.timer)clearTimeout(window.__gmFarming.timer);
      this.textContent='▶ 開始掛機';
      this.style.background='linear-gradient(90deg,#0f3460,#533483)';
      document.getElementById('__gmp_farm_status').textContent='已停止';
      document.getElementById('__gmp_farm_status').style.color='#888';
      console.log('[GM] Farming stopped');
    } else {
      // Start farming
      var farmZone=document.getElementById('__gmp_farm_zone').value;
      if(!farmZone){alert('請選擇掛機地圖！');return;}
      
      window.__gmFarming={running:true,timer:null,returning:false,inTown:false};
      this.textContent='■ 停止掛機';
      this.style.background='#e94560';
      document.getElementById('__gmp_farm_status').textContent='傳送中...';
      document.getElementById('__gmp_farm_status').style.color='#fbbf24';
      
      // Immediately teleport to farm zone
      sendZone(farmZone);
      
      // Start loop
      function loop(){
        if(!window.__gmFarming.running)return;
        
        var d=window.lastState;
        if(!d||!d.char){
          console.log('[GM] loop: waiting for state...');
          window.__gmFarming.timer=setTimeout(loop,1000);
          return;
        }
        
        var c=d.char||{};
        var hp=c.hp||0, maxHp=c.maxHp||1;
        var mp=c.mp||0, maxMp=c.maxMp||1;
        var mode=d.mode||'';
        var isInTown=mode==='lobby';
        
        console.log('[GM] loop: mode='+mode+' HP='+Math.round(hp/maxHp*100)+'% MP='+Math.round(mp/maxMp*100)+'%');
        
        // Auto attack (if in combat zone)
        if(mode==='combat'&&!window.__gmFarming.returning){
          sendCmd('attack');
          document.getElementById('__gmp_farm_status').textContent='戰鬥中...';
          document.getElementById('__gmp_farm_status').style.color='#4ade80';
        }
        
        // Check HP < 20%: return to lobby
        if(hp/maxHp<0.2&&!window.__gmFarming.returning){
          window.__gmFarming.returning=true;
          sendCmd('toLobby');
          document.getElementById('__gmp_farm_status').textContent='HP過低！返回大廳...';
          document.getElementById('__gmp_farm_status').style.color='#e94560';
        }
        
        // Check MP < 10%: return to lobby
        if(mp/maxMp<0.1&&!window.__gmFarming.returning){
          window.__gmFarming.returning=true;
          sendCmd('toLobby');
          document.getElementById('__gmp_farm_status').textContent='MP過低！返回大廳...';
          document.getElementById('__gmp_farm_status').style.color='#e94560';
        }
        
        // If in town and HP/MP > 90%: go back to farm
        if(isInTown&&hp/maxHp>0.9&&mp/maxMp>0.9){
          window.__gmFarming.returning=false;
          var farmZone=document.getElementById('__gmp_farm_zone').value;
          sendZone(farmZone);
          document.getElementById('__gmp_farm_status').textContent='HP/MP已回復，返回戰場...';
          document.getElementById('__gmp_farm_status').style.color='#4ade80';
        }
        
        window.__gmFarming.timer=setTimeout(loop,1000);
      }
      
      loop();
      console.log('[GM] Farming started:',farmZone);
    }
  });
  
  // Update status display
  setInterval(function(){
    var d=window.lastState;
    if(!d||!d.char)return;
    var c=d.char;
    
    var hpBar=document.getElementById('__gmp_hp_bar');
    var mpBar=document.getElementById('__gmp_mp_bar');
    var expBar=document.getElementById('__gmp_exp_bar');
    
    if(hpBar)hpBar.style.width=Math.round(c.hp/c.maxHp*100)+'%';
    if(mpBar)mpBar.style.width=Math.round(c.mp/c.maxMp*100)+'%';
    if(expBar)expBar.style.width=Math.round(c.exp/c.expToNext*100)+'%';
    
    document.getElementById('__gmp_hp_text').textContent=c.hp+'/'+c.maxHp;
    document.getElementById('__gmp_mp_text').textContent=c.mp+'/'+c.maxMp;
    document.getElementById('__gmp_exp_text').textContent=Math.round(c.exp/c.expToNext*100)+'%';
    document.getElementById('__gmp_gold').textContent=(c.gold||0).toLocaleString();
    document.getElementById('__gmp_name').textContent=c.name||'?';
    document.getElementById('__gmp_info').textContent='Lv.'+c.level+' | '+(d.zoneName||'');
    
    // Monsters
    var mobsHtml='';
    if(d.monsters){
      d.monsters.forEach(function(m,i){
        if(m){
          var pct=Math.round(m.hp/m.maxHp*100);
          var col=pct>50?'#4ade80':pct>25?'#fbbf24':'#e94560';
          mobsHtml+='<div>['+i+'] '+m.n+' <span style="color:'+col+';">'+m.hp+'/'+m.maxHp+'</span></div>';
        }
      });
    }
    document.getElementById('__gmp_mobs').innerHTML=mobsHtml||'<span style="color:#888;">無</span>';
  },500);
  
  console.log('[GM] Farming logic loaded');
})();
