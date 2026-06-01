// ---- DIAGNOSTIC: trap any error and show it on the loading screen ----
function __diag(msg,color){var l=document.getElementById("loading");if(l)l.innerHTML='<div style="max-width:90vw;padding:20px"><div style="font-size:28px">🔧</div><div style="color:'+(color||'#e0574a')+';margin:8px 0;font-weight:700">DIAGNOSTIC</div><div style="color:#ccc;font-size:13px;word-break:break-word;text-align:left;white-space:pre-wrap;font-family:monospace">'+msg+'</div></div>';}
window.onerror=function(m,src,line,col,err){__diag("JS ERROR: "+m+"\n@ "+(src||"")+":"+line+":"+col+"\n"+(err&&err.stack?err.stack:""));return false;};
window.addEventListener("unhandledrejection",function(e){__diag("PROMISE REJECTED: "+(e.reason&&e.reason.message?e.reason.message:e.reason)+"\n"+(e.reason&&e.reason.stack?e.reason.stack:""));});
__diag("Script started OK — defining app…","#6fae5a");
// ============================================================
// Config — same Supabase as the build calculator
// ============================================================
const SB="https://ysxbglavmdngayvinrzk.supabase.co";
const SK="sb_publishable_w9keP2-21tJKR6FcF0YIQA_6q3ykBk-";
const IB=`${SB}/storage/v1/object/public/skill-icons`;
const LW="https://lootandwaifus.com/skills/swordxstaff";
const H={apikey:SK,Authorization:`Bearer ${SK}`,"Content-Type":"application/json"};
const HR={apikey:SK,Authorization:`Bearer ${SK}`}; // read-only: no Content-Type → no CORS preflight

const RIDX={Rare:1,Epic:4,Legendary:8,Mythic:14,Divine:22,Rainbow:33};
const RARITIES=["Rare","Epic","Legendary","Mythic","Divine","Rainbow"];
const ELEMENTS=["Physical","Wind","Water","Fire","Light","Dark"];
const ROUNDS=50;

// stat keys recognized by OCR / shown in editor
const STAT_KEYS=["ATK","DEF","HP","SPD","Resilience","Crit Rate","Crit DMG","Crit RES","Block Rate","Block Efficiency","Accuracy","DMG Boost","DMG RES","Healing Boost","PvP Bonus DMG","PvP DMG RES","PvE Bonus DMG","PvE DMG RES","Effect Hit Rate","Effect RES","Elemental Mastery","Elemental RES","Physical Mastery","Physical RES","Wind Affinity","Water Affinity","Fire Affinity","Light Affinity","Dark Affinity","Wind Aegis","Water Aegis","Fire Aegis","Light Aegis","Dark Aegis"];
const PCT=new Set(["Crit Rate","Crit DMG","Crit RES","Block Rate","Block Efficiency","Accuracy","DMG Boost","DMG RES","Healing Boost","PvP Bonus DMG","PvP DMG RES","PvE Bonus DMG","PvE DMG RES"]);

let ALL_SKILLS=[],SKILL_MAP={};
let boss={name:"Guild Boss",stats:{},rounds:50,id:null};
let roster=[];
let curTab="boss";

// ============================================================
// Value parsing (K/M/B expansion) + OCR label matching
// ============================================================
function parseVal(raw){
  if(raw==null)return null;
  let v=String(raw).trim().replace(/%/g,"").replace(/,/g,"");
  const m=v.match(/^([\d.]+)\s*([KMB])?$/i);
  if(!m)return null;
  const n=parseFloat(m[1]); if(isNaN(n))return null;
  return n*({K:1e3,M:1e6,B:1e9,"":1}[(m[2]||"").toUpperCase()]);
}
function lev(a,b){a=a.toLowerCase();b=b.toLowerCase();const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]}
function matchLabel(t){let best=null,bd=Infinity;for(const k of STAT_KEYS){const d=lev(t,k);if(d<bd){bd=d;best=k}}return bd<=Math.max(2,Math.floor(best.length*0.34))?best:null}
function parseOCR(text){
  const out={};
  text.split("\n").map(l=>l.trim()).filter(Boolean).forEach(line=>{
    const m=line.match(/^(.*?)[\s.:]*([\d.]+\s*[KMB]?%?)\s*$/i);
    if(!m)return;
    const lbl=m[1].replace(/[^A-Za-z\s]/g,"").trim();
    if(!lbl)return;
    const key=matchLabel(lbl); if(!key)return;
    const val=parseVal(m[2]); if(val==null)return;
    if(!(key in out))out[key]=val;
  });
  return out;
}

// ============================================================
// Image preprocessing (2x upscale + grayscale + contrast)
// ============================================================
function preprocess(file){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const s=2,cv=document.createElement("canvas");
      cv.width=img.width*s;cv.height=img.height*s;
      const ctx=cv.getContext("2d");
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(img,0,0,cv.width,cv.height);
      const d=ctx.getImageData(0,0,cv.width,cv.height),p=d.data;
      let mn=255,mx=0;
      for(let i=0;i<p.length;i+=4){const g=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)|0;p[i]=p[i+1]=p[i+2]=g;if(g<mn)mn=g;if(g>mx)mx=g}
      const r=Math.max(1,mx-mn);
      for(let i=0;i<p.length;i+=4){const g=Math.min(255,Math.max(0,(p[i]-mn)/r*255))|0;p[i]=p[i+1]=p[i+2]=g}
      ctx.putImageData(d,0,0);
      res(cv.toDataURL("image/png"));
    };
    img.onerror=rej;
    img.src=URL.createObjectURL(file);
  });
}
function loadTesseract(){
  if(window.Tesseract)return Promise.resolve();
  return new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js";
    s.onload=res; s.onerror=()=>rej(new Error("Tesseract CDN blocked or unreachable"));
    document.head.appendChild(s);
  });
}
let _worker=null;
async function ocrWorker(){if(_worker)return _worker;await loadTesseract();_worker=await Tesseract.createWorker("eng");await _worker.setParameters({tessedit_pageseg_mode:"6",tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.%KMB "});return _worker}
async function runOCR(files,onDone,setStatus){
  const merged={};let raw="";
  try{
    const w=await ocrWorker();
    for(let i=0;i<files.length;i++){
      setStatus(`Reading image ${i+1}/${files.length}…`);
      const url=await preprocess(files[i]);
      const{data}=await w.recognize(url);
      raw+=`--- image ${i+1} ---\n${data.text}\n`;
      Object.entries(parseOCR(data.text)).forEach(([k,v])=>{if(!(k in merged))merged[k]=v});
    }
    onDone(merged,raw);
  }catch(e){
    setStatus("OCR unavailable ("+e.message+"). Enter stats manually below.");
  }
}

// ============================================================
// 乘区 damage model — per single cast of a skill
// ============================================================
function skillCast(member,skill,boss,buffPct){
  const S=member.stats||{}, B=boss.stats||{};
  const atk=S.ATK||0, def=B.DEF||0;
  const defMit=(atk+def)>0?atk/(atk+def):0;
  const critAvg=1+((S["Crit Rate"]||0)/100)*((S["Crit DMG"]||0)/100);
  const dmgBoost=1+((S["DMG Boost"]||0)/100)+ (buffPct||0)/100;   // damage-boost zone (+ active buffs)
  const pve=1+((S["PvE Bonus DMG"]||0)/100);
  const dmgRes=1-((B["DMG RES"]||0)/100);
  // elemental affinity vs aegis (or physical mastery vs res)
  let aff=1;
  if(member.damage_type!=="Physical"){
    const a=S[`${member.damage_type} Affinity`]||0, g=B[`${member.damage_type} Aegis`]||0;
    aff=(a+g)>0?a/(a+g):1;
  }else{
    const ms=S["Physical Mastery"]||0, rs=B["Physical RES"]||0;
    aff=(ms+rs)>0?ms/(ms+rs):1;
  }
  const blockRate=(B["Block Rate"]||0)/100, blockEff=(B["Block Efficiency"]||0)/100;
  const blockMod=1-blockRate*blockEff;
  // skill multiplier from the damage array at member's rarity index
  let mult=1;
  if(skill.damage&&skill.damage.length){const v=skill.damage[RIDX[member.rarity||"Legendary"]];if(v!=null)mult=v/100}
  return Math.max(0, atk*mult*defMit*aff*critAvg*dmgBoost*pve*dmgRes*blockMod);
}

// ============================================================
// 50-round rotation simulator
// Each round: scan technique slots L→R, cast FIRST off-cooldown skill.
// Charms = passive buff sources (their tag "Buff" contributes a flat zone bump).
// ============================================================
const BUFF_PER_CHARM=8; // tunable: each Buff-tagged charm adds this % to dmg-boost zone

function simulateMember(member,boss){
  const skills=(member.technique_ids||[]).map(id=>SKILL_MAP[id]).filter(Boolean);
  if(!skills.length)return{total:0,trace:[],casts:0};
  const cdReady=skills.map(()=>0); // round index when each slot becomes available
  // passive buff from charms tagged "Buff"
  const charms=(member.charm_ids||[]).map(id=>SKILL_MAP[id]).filter(Boolean);
  const buffPct=charms.filter(c=>(c.tags||[]).includes("Buff")).length*BUFF_PER_CHARM;
  let total=0,casts=0;const trace=[];
  for(let r=0;r<boss.rounds;r++){
    const fired=[];let roundDmg=0;
    // cast EVERY off-cooldown technique this round, left→right
    for(let s=0;s<skills.length;s++){
      if(cdReady[s]<=r){
        const sk=skills[s];
        const dmg=skillCast(member,sk,boss,buffPct);
        total+=dmg;roundDmg+=dmg;casts++;
        cdReady[s]=r+1+(sk.cooldown||0); // unavailable for `cd` rounds after this one
        fired.push(`s${s+1} ${sk.name} ${fmt(dmg)}`);
      }
    }
    trace.push(`R${r+1}: ${fired.length?fired.join(" · ")+` = ${fmt(roundDmg)}`:"(all on CD)"}`);
  }
  return{total,trace,casts,buffPct};
}

function simulate(){
  const results=roster.map(m=>{const s=simulateMember(m,boss);return{member:m,...s}});
  const total=results.reduce((a,r)=>a+r.total,0);
  const hp=boss.stats.HP||0;
  const killed=hp>0&&total>=hp;
  const avg=results.length?total/results.length:0;
  const needed=(avg>0&&hp>0)?Math.ceil(hp/avg):null;
  return{results,total,hp,killed,avg,needed};
}

// ============================================================
// Formatting + toast
// ============================================================
function fmt(n){if(n==null||isNaN(n))return"0";if(n>=1e9)return(n/1e9).toFixed(2)+"B";if(n>=1e6)return(n/1e6).toFixed(2)+"M";if(n>=1e3)return(n/1e3).toFixed(1)+"K";return Math.round(n).toString()}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1800)}

// ============================================================
// Boss tab
// ============================================================
function renderBoss(){
  const el=document.getElementById("tab-boss");
  el.innerHTML=`
  <div class="panel">
    <div class="panel-title">Boss Setup</div>
    <input class="input" id="boss-name" value="${boss.name}" oninput="boss.name=this.value">
    <div class="grid2" style="margin-bottom:12px">
      <div class="field"><label>Rounds</label><input type="number" id="boss-rounds" value="${boss.rounds}" onchange="boss.rounds=parseInt(this.value)||50"></div>
    </div>
    <label class="upload-zone" id="boss-up">📷 Upload boss stat screenshots (multiple ok)
      <input type="file" accept="image/*" multiple hidden onchange="onBossOCR(this.files)"></label>
    <div class="ocr-status" id="boss-ocr"></div>
    <div id="boss-raw"></div>
    <div class="statgrid" id="boss-stats"></div>
    <div style="margin-top:16px;display:flex;gap:10px">
      <button class="btn primary" onclick="saveBoss()">Save Boss</button>
    </div>
  </div>`;
  renderStatEditor("boss-stats",boss.stats,(k,v)=>boss.stats[k]=v);
}
function renderStatEditor(containerId,stats,onSet){
  const c=document.getElementById(containerId);if(!c)return;
  c.innerHTML=STAT_KEYS.map(k=>`<div class="field"><label>${k}</label><input value="${stats[k]!=null?stats[k]:""}" oninput="window.__set('${containerId}','${k}',this.value)">${PCT.has(k)?'<span style="color:#666;font-size:12px">%</span>':''}</div>`).join("");
  c.__onSet=onSet;
}
window.__set=(cid,k,v)=>{const c=document.getElementById(cid);const num=v===""?null:(parseVal(v)??parseFloat(v));if(c&&c.__onSet)c.__onSet(k,num)};
async function onBossOCR(files){
  if(!files.length)return;
  const zone=document.getElementById("boss-up");zone.classList.add("busy");
  await runOCR([...files],(merged,raw)=>{
    Object.assign(boss.stats,merged);
    document.getElementById("boss-ocr").textContent=`Extracted ${Object.keys(merged).length} stats — review below.`;
    document.getElementById("boss-raw").innerHTML=`<details><summary style="color:#666;font-size:11px;cursor:pointer">raw OCR</summary><div class="ocr-raw">${raw}</div></details>`;
    renderStatEditor("boss-stats",boss.stats,(k,v)=>boss.stats[k]=v);
    zone.classList.remove("busy");
  },s=>document.getElementById("boss-ocr").textContent=s);
}
async function saveBoss(){
  const body={name:boss.name,stats:boss.stats,rounds:boss.rounds};
  try{
    let r;
    if(boss.id){r=await fetch(`${SB}/rest/v1/bosses?id=eq.${boss.id}`,{method:"PATCH",headers:H,body:JSON.stringify(body)});}
    else{r=await fetch(`${SB}/rest/v1/bosses`,{method:"POST",headers:{...H,Prefer:"return=representation"},body:JSON.stringify(body)});const d=await r.json();if(d[0])boss.id=d[0].id;}
    if(!r.ok)throw new Error("HTTP "+r.status);
    toast("Boss saved");
  }catch(e){toast("Save failed: "+e.message)}
}

// ============================================================
// Roster tab
// ============================================================
function renderRoster(){
  const el=document.getElementById("tab-roster");
  el.innerHTML=roster.map((m,i)=>memberCard(m,i)).join("")+
    `<button class="btn ghost" onclick="addMember()">+ Add Member</button>
     <button class="btn primary" style="width:100%;margin-top:10px" onclick="saveRoster()">💾 Save Roster to Supabase</button>`;
  roster.forEach(m=>renderStatEditor("stats-"+m._k,m.stats,(k,v)=>m.stats[k]=v));
}
function memberCard(m,i){
  const techSlots=[0,1,2,3].map(s=>slotHtml(m,"technique",s)).join("");
  const charmSlots=[0,1,2,3].map(s=>slotHtml(m,"charm",s)).join("");
  return `<div class="member-card">
    <div class="member-head">
      <input class="input" style="margin:0" value="${m.name}" oninput="setMember('${m._k}','name',this.value)">
      <button class="btn danger sm" onclick="removeMember('${m._k}')">Remove</button>
    </div>
    <div class="grid2" style="margin-bottom:10px">
      <div class="field"><label>Damage Type</label><select onchange="setMember('${m._k}','damage_type',this.value)">${ELEMENTS.map(e=>`<option ${m.damage_type===e?"selected":""}>${e}</option>`).join("")}</select></div>
      <div class="field"><label>Skill Rarity</label><select onchange="setMember('${m._k}','rarity',this.value)">${RARITIES.map(rr=>`<option ${m.rarity===rr?"selected":""}>${rr}</option>`).join("")}</select></div>
    </div>
    <div style="font-size:12px;color:var(--tx3);font-weight:700;letter-spacing:1px;margin:6px 0">TECHNIQUES (cast left→right)</div>
    <div class="skill-slots">${techSlots}</div>
    <div style="font-size:12px;color:var(--tx3);font-weight:700;letter-spacing:1px;margin:6px 0">CHARMS (passive)</div>
    <div class="skill-slots">${charmSlots}</div>
    <label class="upload-zone" style="margin-top:10px">📷 OCR character stats
      <input type="file" accept="image/*" multiple hidden onchange="onMemberOCR('${m._k}',this.files)"></label>
    <div class="ocr-status" id="ocr-${m._k}"></div>
    <details><summary style="color:var(--acc);font-size:13px;cursor:pointer;margin:8px 0">edit panel stats</summary>
      <div class="statgrid" id="stats-${m._k}"></div></details>
  </div>`;
}
function slotHtml(m,type,s){
  const ids=type==="technique"?m.technique_ids:m.charm_ids;
  const sk=SKILL_MAP[ids[s]];
  if(!sk)return`<div class="slot empty" onclick="openPicker('${m._k}','${type}',${s})"><span class="slot-num">${s+1}</span> + Add ${type}</div>`;
  const cd=sk.cooldown!=null?`CD ${sk.cooldown}`:"";
  const dmg=sk.damage&&sk.damage.length&&sk.damage[RIDX[m.rarity]]!=null?` · ${sk.damage[RIDX[m.rarity]]}%`:"";
  return`<div class="slot" onclick="openPicker('${m._k}','${type}',${s})">
    <span class="slot-num">${s+1}</span>
    <div class="slot-icon"><img src="${iconUrl(sk)}" onerror="this.onerror=null;this.src='${iconFallback(sk)}'"></div>
    <div class="slot-info"><div class="slot-name">${sk.name}</div><div class="slot-meta">${sk.element||""} ${cd}${dmg}</div></div>
    <button class="slot-rm" onclick="event.stopPropagation();clearSlot('${m._k}','${type}',${s})">×</button>
  </div>`;
}
function iconUrl(s){const n=String(s.id).replace("skill_","");return`${IB}/sprite_skill_${n}.png`}
function iconFallback(s){const n=String(s.id).replace("skill_","");return`${LW}/skill_${n}.webp`}

let _k=1;
function addMember(){roster.push({_k:"m"+(_k++),id:null,name:`Member ${roster.length+1}`,class:"",damage_type:"Physical",rarity:"Legendary",stats:{},technique_ids:[],charm_ids:[]});renderRoster()}
function removeMember(k){const m=roster.find(x=>x._k===k);if(m&&m.id)fetch(`${SB}/rest/v1/roster_members?id=eq.${m.id}`,{method:"DELETE",headers:H});roster=roster.filter(x=>x._k!==k);renderRoster()}
function setMember(k,field,val){const m=roster.find(x=>x._k===k);if(m)m[field]=val}
function clearSlot(k,type,s){const m=roster.find(x=>x._k===k);const ids=type==="technique"?m.technique_ids:m.charm_ids;ids[s]=null;renderRoster()}
async function onMemberOCR(k,files){
  if(!files.length)return;const m=roster.find(x=>x._k===k);
  await runOCR([...files],(merged,raw)=>{
    Object.assign(m.stats,merged);
    document.getElementById("ocr-"+k).textContent=`Extracted ${Object.keys(merged).length} stats.`;
    renderRoster();
  },s=>document.getElementById("ocr-"+k).textContent=s);
}

// Skill picker modal
let pickCtx=null;
function openPicker(k,type,s){
  pickCtx={k,type,s};
  const skType=type==="technique"?"Technique":"Charm";
  document.getElementById("modal-title").textContent=`Select ${skType}`;
  document.getElementById("modal-search").value="";
  renderPicker();
  document.getElementById("modal").classList.add("open");
}
function closeModal(){document.getElementById("modal").classList.remove("open");pickCtx=null}
function renderPicker(){
  if(!pickCtx)return;
  const q=document.getElementById("modal-search").value.toLowerCase();
  const skType=pickCtx.type==="technique"?"Technique":"Charm";
  let list=ALL_SKILLS.filter(s=>s.type===skType&&s.name);
  if(q)list=list.filter(s=>s.name.toLowerCase().includes(q)||(s.description||"").toLowerCase().includes(q));
  list=list.slice(0,200);
  document.getElementById("modal-body").innerHTML=list.length?list.map(s=>{
    const cd=s.cooldown!=null?`CD ${s.cooldown}`:"";
    return`<div class="pick-card" onclick="pickSkill('${s.id}')">
      <div class="slot-icon"><img src="${iconUrl(s)}" onerror="this.onerror=null;this.src='${iconFallback(s)}'"></div>
      <div class="slot-info"><div class="slot-name">${s.name}</div><div class="slot-meta">${s.class} · ${s.element||""} ${cd}</div></div>
    </div>`;
  }).join(""):`<div style="text-align:center;color:#666;padding:40px">No skills</div>`;
}
function pickSkill(id){
  const m=roster.find(x=>x._k===pickCtx.k);
  const ids=pickCtx.type==="technique"?m.technique_ids:m.charm_ids;
  ids[pickCtx.s]=id;
  closeModal();renderRoster();
}

async function saveRoster(){
  try{
    for(const m of roster){
      const body={name:m.name,class:m.class,damage_type:m.damage_type,rarity:m.rarity,stats:m.stats,technique_ids:(m.technique_ids||[]).filter(Boolean),charm_ids:(m.charm_ids||[]).filter(Boolean),sort_order:roster.indexOf(m)};
      if(m.id)await fetch(`${SB}/rest/v1/roster_members?id=eq.${m.id}`,{method:"PATCH",headers:H,body:JSON.stringify(body)});
      else{const r=await fetch(`${SB}/rest/v1/roster_members`,{method:"POST",headers:{...H,Prefer:"return=representation"},body:JSON.stringify(body)});const d=await r.json();if(d[0])m.id=d[0].id}
    }
    toast("Roster saved");
  }catch(e){toast("Save failed: "+e.message)}
}

// ============================================================
// Results tab
// ============================================================
function renderResults(){
  const el=document.getElementById("tab-results");
  const sim=simulate();
  if(!sim.hp){el.innerHTML=`<div class="panel"><div style="color:#666;text-align:center;padding:30px">Enter boss HP on the Boss tab first.</div></div>`;return}
  const pct=Math.min(100,sim.total/sim.hp*100);
  el.innerHTML=`
  <div class="panel">
    <div class="panel-title">Boss HP <span>${fmt(sim.total)} / ${fmt(sim.hp)}</span></div>
    <div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${sim.killed?'var(--ok)':'var(--bad)'}"></div></div>
    <div class="verdict" style="color:${sim.killed?'var(--ok)':'var(--bad)'}">
      ${sim.killed?`✦ DEFEATED at ${pct.toFixed(0)}%`:`✦ SHORT by ${fmt(sim.hp-sim.total)} (${pct.toFixed(0)}%)`}</div>
    ${sim.needed!=null?`<div style="text-align:center;margin-top:10px"><div style="color:#666;font-size:13px">Est. members needed (at current avg)</div><div class="big-num">~${sim.needed}</div><div style="color:#666;font-size:12px">avg ${fmt(sim.avg)} / member over ${boss.rounds} rounds</div></div>`:""}
  </div>
  <div class="panel">
    <div class="panel-title">Per-Member Damage</div>
    ${sim.results.map((r,i)=>`<div class="res-row"><span>${r.member.name} <span style="color:#666">(${r.member.damage_type}${r.buffPct?` · +${r.buffPct}% buff`:""})</span></span><span style="color:var(--acc)">${fmt(r.total)}</span></div>
      <details><summary style="color:#666;font-size:12px;cursor:pointer;padding:4px 0">round trace (${r.casts} casts)</summary><div class="trace">${r.trace.join("<br>")}</div></details>`).join("")}
    <div class="note">Rotation: each round casts every technique that's off cooldown (left→right); a skill goes on cooldown for its CD value in rounds after firing, over ${boss.rounds} rounds. Charms tagged "Buff" add +${BUFF_PER_CHARM}% to the damage-boost zone each (tunable). Damage uses the CN 乘区 model — approximate. Run a real boss fight to calibrate.</div>
  </div>`;
}

// ============================================================
// Tabs + init
// ============================================================
function setTab(t){
  curTab=t;
  ["boss","roster","results"].forEach(x=>{
    document.getElementById("tab-"+x).style.display=x===t?"":"none";
    document.querySelector(`.tab[data-tab="${x}"]`).classList.toggle("active",x===t);
  });
  if(t==="boss")renderBoss();
  if(t==="roster")renderRoster();
  if(t==="results")renderResults();
}
async function init(){
  // Step 1: skills are required. Show any failure on-screen.
  let skillsOk=false;
  try{
    __diag("init() running — fetching skills from Supabase…","#ffd54f");
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),15000);
    const rs=await fetch(`${SB}/rest/v1/skills?select=*&limit=500`,{headers:HR,signal:ctrl.signal});
    clearTimeout(timer);
    __diag("Skills responded: HTTP "+rs.status+" — parsing…","#ffd54f");
    if(!rs.ok){throw new Error(`skills HTTP ${rs.status}`)}
    const data=await rs.json();
    ALL_SKILLS=data.filter(s=>s.name);
    SKILL_MAP=Object.fromEntries(ALL_SKILLS.map(s=>[s.id,s]));
    skillsOk=true;
  }catch(e){
    const msg=e.name==="AbortError"?"Request timed out — the skills request was blocked or stalled (check ad/script blocker extensions for this site)":e.message;
    document.getElementById("loading").innerHTML=`<div><div style="font-size:38px">⚠️</div><div style="color:#e74c3c;margin-bottom:6px">Couldn't load skills</div><div style="color:#888;font-size:13px;max-width:320px;margin:0 auto">${msg}</div></div>`;
    return;
  }
  // Step 2: optional — roster. Never blocks.
  try{
    const rr=await fetch(`${SB}/rest/v1/roster_members?select=*&order=sort_order`,{headers:HR});
    if(rr.ok){const data=await rr.json();roster=data.map(d=>({...d,_k:"m"+(_k++),technique_ids:d.technique_ids||[],charm_ids:d.charm_ids||[],stats:d.stats||{}}))}
  }catch(e){console.warn("roster load skipped:",e.message)}
  // Step 3: optional — boss preset. Never blocks.
  try{
    const br=await fetch(`${SB}/rest/v1/bosses?select=*&order=updated_at.desc&limit=1`,{headers:HR});
    if(br.ok){const bd=await br.json();if(bd[0]){boss={name:bd[0].name,stats:bd[0].stats||{},rounds:bd[0].rounds||50,id:bd[0].id}}}
  }catch(e){console.warn("boss load skipped:",e.message)}
  // Step 4: reveal the app
  if(!roster.length)addMember();
  document.getElementById("loading").style.display="none";
  document.getElementById("app").style.display="";
  document.getElementById("sub").textContent=`${ALL_SKILLS.length} skills · ${roster.length} members`;
  setTab("boss");
}
// add save buttons to roster tab via a floating action
document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
__diag("App defined — calling init()…","#6fae5a");
init();

// expose a global save for roster (called from a button we inject)
window.saveRoster=saveRoster;
