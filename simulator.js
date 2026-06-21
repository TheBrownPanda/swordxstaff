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

const RARITIES=["Rare","Epic","Legendary","Mythic","Divine","Immortal"];
const RCODE={Rare:'R',Epic:'SR',Legendary:'SSR',Mythic:'UR',Divine:'LR',Immortal:'ER'};
const ELEMENTS=["Physical","Wind","Water","Fire","Light","Dark"];
const ROUNDS=50;
const FPAIR={SkillAttack1:'SkillFixedAttack1',SkillAttack2:'SkillFixedAttack2',SkillAttack3:'SkillFixedAttack3',SkillAttack4:'SkillFixedAttack4',SkillCureByHp:'SkillFixedCure',SkillCureByAttack:'SkillFixedCure',ShieldByDefence:'SkillFixedShield',ShieldByTargetHp:'SkillFixedShield',ShieldByConvertedCurHp:'SkillFixedShield',StatusDmgAddPer:'FixedStatusDmgAdd',AttackScale:'FixedAttack',DefenceScale:'FixedDefence',MaxHpScale:'FixedMaxHp',SpeedScale:'FixedSpeed'};

let CURVES=null;
async function loadCurves(){
  if(CURVES)return;
  try{const r=await fetch('curves.json');CURVES=await r.json();console.log('Curves loaded');}catch(e){console.warn('curves.json not found')}
}

// Compute skill damage at specific rarity/star/level using curves
function getSkillDmgAtLevel(skill, rarity, star, level) {
  // Try dynamic computation with curves
  if (CURVES && skill.entity_values) {
    const ev = skill.entity_values;
    const rc = RCODE[rarity] || 'SSR';
    const rankNo = parseInt(CURVES.rank_table[rc]?.[String(star)] || CURVES.rank_table[rc]?.['0'] || 6);
    const cs = skill.curve_source || 'skill';
    const bucket = cs === 'status' ? 'status_curves' : 'rank_curves';
    const rr = CURVES[bucket]?.[String(skill.rank_prop_id)]?.[String(rankNo)] || {};
    // Level curve
    const subrank = CURVES.rarity_meta[rc]?.subrank || '';
    const cid = CURVES.group_level_map?.[String(skill.group_level_prop_id)]?.[subrank];
    let lr = {};
    if (cid) {
      for (const bk of ['fixed_curves', 'all_fixed_curves']) {
        const b = CURVES[bk]?.[String(cid)];
        if (!b) continue;
        const lvs = Object.keys(b).map(Number).sort((a, b) => a - b);
        let sel = lvs[0] || 0;
        for (const l of lvs) if (l <= level) sel = l;
        lr = b[String(sel)] || {};
        break;
      }
    }
    // Find first damage field
    for (const f of ['SkillAttack1','SkillAttack2','SkillAttack3','SkillAttack4']) {
      const paired = FPAIR[f];
      if (ev[f] != null) {
        const pb = Number(ev[f]), ps = Number(rr[f] || 0);
        const pct = pb && ps ? (pb * ps) / 1e6 : 0;
        const fb = Number(ev[paired] || 0), fr = Number(rr[paired] || 0), fl = Number(lr[paired] || 0);
        const flat = fl && fb && fr ? (fl * fb * fr) / 1e8 : 0;
        if (pct || flat) return { pct: Math.round(pct * 10) / 10, flat: Math.round(flat) };
      }
    }
  }
  // Fallback to precomputed stats_by_rarity (star 0, level 1)
  return getSkillDmg(skill, rarity);
}

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
// Correct formula: (ATK × pct/100 + flat) × defMit × affinity × critAvg × dmgBoost × pve × dmgRes × blockMod
// ============================================================
function getSkillDmg(skill, rarity) {
  // Try stats_by_rarity first (new data with pct + flat)
  const sbr = skill.stats_by_rarity;
  if (sbr && sbr[rarity]) {
    const st = sbr[rarity];
    for (const k of ['SkillAttack1','SkillAttack2','SkillAttack3','SkillAttack4']) {
      if (st[k] && typeof st[k] === 'object') return { pct: st[k].pct || 0, flat: st[k].flat || 0 };
    }
  }
  // Fallback to old damage array
  const RIDX={Rare:1,Epic:4,Legendary:8,Mythic:14,Divine:22,Immortal:33};
  if (skill.damage && skill.damage.length) {
    const v = skill.damage[RIDX[rarity]];
    if (v != null) return { pct: v, flat: 0 };
  }
  return { pct: 0, flat: 0 };
}

function getCharmBuff(skill, rarity) {
  // Try extra_entity_stats (active buffs like Valor Surge)
  if (skill.extra_entity_stats) {
    for (const ex of skill.extra_entity_stats) {
      const est = ex.stats && ex.stats[rarity];
      if (!est) continue;
      for (const [k, v] of Object.entries(est)) {
        if (k === 'StatusDmgAddPer' && typeof v === 'object') return v.pct || 0;
        if (k === 'StatusDmgAddPer' && typeof v === 'number') return v;
      }
    }
  }
  // Try passive_status_stats
  if (skill.passive_status_stats) {
    for (const ps of skill.passive_status_stats) {
      const pst = ps.stats && ps.stats[rarity];
      if (!pst) continue;
      for (const [k, v] of Object.entries(pst)) {
        if (k === 'StatusDmgAddPer' && typeof v === 'object') return v.pct || 0;
        if (k === 'StatusDmgAddPer' && typeof v === 'number') return v;
      }
    }
  }
  // Try passive_factor_stats
  if (skill.passive_factor_stats && skill.passive_factor_stats[rarity]) {
    const pfs = skill.passive_factor_stats[rarity];
    if (pfs.DmgAddPercent) return pfs.DmgAddPercent.pct || pfs.DmgAddPercent.value || 0;
  }
  // Fallback: Buff-tagged charm = flat estimate
  if ((skill.tags || []).includes('Buff')) return 8;
  return 0;
}

function skillCast(member, skill, slotConfig, boss, totalBuffPct) {
  const S = member.stats || {}, B = boss.stats || {};
  const atk = S.ATK || 0, def = B.DEF || 0;
  const defMit = (atk + def) > 0 ? atk / (atk + def) : 0;
  const critAvg = 1 + ((S["Crit Rate"] || 0) / 100) * ((S["Crit DMG"] || 0) / 100);
  const dmgBoost = 1 + ((S["DMG Boost"] || 0) / 100) + (totalBuffPct || 0) / 100;
  const pve = 1 + ((S["PvE Bonus DMG"] || 0) / 100);
  const dmgRes = 1 - ((B["DMG RES"] || 0) / 100);
  // elemental affinity — use element from skill data
  let aff = 1;
  const dmgType = skill.element || "Physical";
  if (dmgType !== "Physical") {
    const a = S[`${dmgType} Affinity`] || 0, g = B[`${dmgType} Aegis`] || 0;
    aff = (a + g) > 0 ? a / (a + g) : 1;
  } else {
    const ms = S["Physical Mastery"] || 0, rs = B["Physical RES"] || 0;
    aff = (ms + rs) > 0 ? ms / (ms + rs) : 1;
  }
  const blockRate = (B["Block Rate"] || 0) / 100, blockEff = (B["Block Efficiency"] || 0) / 100;
  const blockMod = 1 - blockRate * blockEff;
  // skill multiplier at this slot's rarity/star + member level
  const rarity = slotConfig.rarity || "Legendary";
  const star = slotConfig.star || 0;
  const level = member.level || 1;
  const { pct, flat } = getSkillDmgAtLevel(skill, rarity, star, level);
  const baseDmg = atk * (pct / 100) + flat;
  return Math.max(0, baseDmg * defMit * aff * critAvg * dmgBoost * pve * dmgRes * blockMod);
}

// ============================================================
// 50-round rotation simulator
// Each round: cast every off-cooldown technique (left→right).
// Charms contribute their actual DMG boost value from the data.
// ============================================================
function simulateMember(member, boss) {
  const techSlots = (member.technique_slots || []).filter(s => s && s.id && SKILL_MAP[s.id]);
  const skills = techSlots.map(s => SKILL_MAP[s.id]);
  if (!skills.length) return { total: 0, trace: [], casts: 0 };
  const cdReady = skills.map(() => 0);
  // Charm buff: sum actual DMG boost values from charm data
  const charmSlots = (member.charm_slots || []).filter(s => s && s.id && SKILL_MAP[s.id]);
  const buffPct = charmSlots.reduce((sum, s) => {
    const sk = SKILL_MAP[s.id];
    return sum + getCharmBuff(sk, s.rarity || "Legendary");
  }, 0);
  let total = 0, casts = 0; const trace = [];
  for (let r = 0; r < boss.rounds; r++) {
    const fired = []; let roundDmg = 0;
    for (let s = 0; s < skills.length; s++) {
      if (cdReady[s] <= r) {
        const sk = skills[s];
        const dmg = skillCast(member, sk, techSlots[s], boss, buffPct);
        total += dmg; roundDmg += dmg; casts++;
        cdReady[s] = r + 1 + (sk.cooldown || 0);
        fired.push(`s${s + 1} ${sk.name} ${fmt(dmg)}`);
      }
    }
    trace.push(`R${r + 1}: ${fired.length ? fired.join(" · ") + ` = ${fmt(roundDmg)}` : "(all on CD)"}`);
  }
  return { total, trace, casts, buffPct };
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
      <div class="field"><label>Skill Level</label><input type="number" min="1" max="400" value="${m.level||1}" onchange="setMember('${m._k}','level',parseInt(this.value)||1);renderRoster()"></div>
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
  const slots=type==="technique"?(m.technique_slots||(m.technique_slots=[null,null,null,null])):(m.charm_slots||(m.charm_slots=[null,null,null,null]));
  const slot=slots[s];
  const sk=slot&&slot.id?SKILL_MAP[slot.id]:null;
  if(!sk)return`<div class="slot empty" onclick="openPicker('${m._k}','${type}',${s})"><span class="slot-num">${s+1}</span> + Add ${type}</div>`;
  const cd=sk.cooldown!=null?`CD ${sk.cooldown}`:"";
  const rarity=slot.rarity||sk.initial_rarity||"Legendary";
  const star=slot.star||0;
  const d=getSkillDmgAtLevel(sk,rarity,star,m.level||1);
  const dmg=d.pct?` · ${d.pct}%+${d.flat>=1e3?(d.flat/1e3).toFixed(1)+'K':Math.round(d.flat)}`:"";
  const maxStar=CURVES&&CURVES.rarity_meta?parseInt(CURVES.rarity_meta[RCODE[rarity]]?.max_star||3):3;
  return`<div class="slot">
    <span class="slot-num" onclick="openPicker('${m._k}','${type}',${s})" style="cursor:pointer">${s+1}</span>
    <div class="slot-icon" onclick="openPicker('${m._k}','${type}',${s})" style="cursor:pointer"><img src="${iconUrl(sk)}" onerror="this.onerror=null;this.src='${iconFallback(sk)}'"></div>
    <div class="slot-info" onclick="openPicker('${m._k}','${type}',${s})" style="cursor:pointer">
      <div class="slot-name">${sk.name}</div>
      <div class="slot-meta">${sk.element||""} ${cd}${dmg}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
      <select style="background:var(--card2);border:1px solid var(--bdr);color:var(--tx);padding:2px 4px;border-radius:4px;font-size:11px;font-family:inherit" onchange="setSlotProp('${m._k}','${type}',${s},'rarity',this.value)">
        ${RARITIES.map(r=>`<option ${rarity===r?"selected":""}>${r}</option>`).join("")}
      </select>
      <select style="background:var(--card2);border:1px solid var(--bdr);color:var(--tx);padding:2px 4px;border-radius:4px;font-size:11px;font-family:inherit" onchange="setSlotProp('${m._k}','${type}',${s},'star',parseInt(this.value))">
        ${Array.from({length:maxStar+1},(_,i)=>`<option value="${i}" ${star===i?"selected":""}>${i}★</option>`).join("")}
      </select>
    </div>
    <button class="slot-rm" onclick="event.stopPropagation();clearSlot('${m._k}','${type}',${s})">×</button>
  </div>`;
}
function iconUrl(s){const n=String(s.id).replace("skill_","");return`${IB}/skill_${n}.webp`}
function iconFallback(s){const n=String(s.id).replace("skill_","");return`${IB}/sprite_skill_${n}.png`}

let _k=1;
function addMember(){roster.push({_k:"m"+(_k++),id:null,name:`Member ${roster.length+1}`,level:1,stats:{},technique_slots:[null,null,null,null],charm_slots:[null,null,null,null]});renderRoster()}
function removeMember(k){const m=roster.find(x=>x._k===k);if(m&&m.id)fetch(`${SB}/rest/v1/roster_members?id=eq.${m.id}`,{method:"DELETE",headers:H});roster=roster.filter(x=>x._k!==k);renderRoster()}
function setMember(k,field,val){const m=roster.find(x=>x._k===k);if(m)m[field]=val}
function setSlotProp(k,type,s,prop,val){
  const m=roster.find(x=>x._k===k);if(!m)return;
  const slots=type==="technique"?m.technique_slots:m.charm_slots;
  if(slots[s])slots[s][prop]=val;
  renderRoster();
}
function clearSlot(k,type,s){const m=roster.find(x=>x._k===k);const slots=type==="technique"?m.technique_slots:m.charm_slots;slots[s]=null;renderRoster()}
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
  let list=ALL_SKILLS.filter(s=>{
    const t=s.type==="combat"?"Technique":s.type==="arcane"?"Charm":s.type;
    return t===skType&&s.name;
  });
  if(q)list=list.filter(s=>s.name.toLowerCase().includes(q)||(s.description||"").toLowerCase().includes(q));
  list=list.slice(0,200);
  document.getElementById("modal-body").innerHTML=list.length?list.map(s=>{
    const cd=s.cooldown!=null?`CD ${s.cooldown}`:"";
    return`<div class="pick-card" onclick="pickSkill('${s.id}')">
      <div class="slot-icon"><img src="${iconUrl(s)}" onerror="this.onerror=null;this.src='${iconFallback(s)}'"></div>
      <div class="slot-info"><div class="slot-name">${s.name}</div><div class="slot-meta">${s.profession||s.class||""} · ${s.element||""} ${cd}</div></div>
    </div>`;
  }).join(""):`<div style="text-align:center;color:#666;padding:40px">No skills</div>`;
}
function pickSkill(id){
  const m=roster.find(x=>x._k===pickCtx.k);
  const slots=pickCtx.type==="technique"?m.technique_slots:m.charm_slots;
  const sk=SKILL_MAP[id];
  slots[pickCtx.s]={id,rarity:sk?.initial_rarity||"Legendary",star:0};
  closeModal();renderRoster();
}

async function saveRoster(){
  try{
    for(const m of roster){
      const body={name:m.name,class:m.class,level:m.level||1,stats:m.stats,technique_slots:(m.technique_slots||[]),charm_slots:(m.charm_slots||[]),sort_order:roster.indexOf(m)};
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
    ${sim.results.map((r,i)=>`<div class="res-row"><span>${r.member.name} <span style="color:#666">(Lv${r.member.level||1}${r.buffPct?` · +${r.buffPct.toFixed(1)}% buff`:""})</span></span><span style="color:var(--acc)">${fmt(r.total)}</span></div>
      <details><summary style="color:#666;font-size:12px;cursor:pointer;padding:4px 0">round trace (${r.casts} casts)</summary><div class="trace">${r.trace.join("<br>")}</div></details>`).join("")}
    <div class="note">Rotation: each round casts every technique that's off cooldown (left→right); a skill goes on cooldown for its CD value in rounds after firing, over ${boss.rounds} rounds. Charm DMG buffs use actual computed values from skill data. Damage uses the 乘区 model: (ATK × pct% + flat) × DEF mitigation × affinity × crit × DMG boost × PvE × resistance × block.</div>
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
  // Step 2: load curves for dynamic computation
  loadCurves();
  // Step 3: optional — roster. Never blocks.
  try{
    const rr=await fetch(`${SB}/rest/v1/roster_members?select=*&order=sort_order`,{headers:HR});
    if(rr.ok){const data=await rr.json();roster=data.map(d=>{
      // Migrate old format (technique_ids) to new format (technique_slots)
      const techSlots=(d.technique_slots||[]).length?d.technique_slots:(d.technique_ids||[]).map(id=>id?{id,rarity:d.rarity||"Legendary",star:0}:null);
      const charmSlots=(d.charm_slots||[]).length?d.charm_slots:(d.charm_ids||[]).map(id=>id?{id,rarity:d.rarity||"Legendary",star:0}:null);
      while(techSlots.length<4)techSlots.push(null);
      while(charmSlots.length<4)charmSlots.push(null);
      return{...d,_k:"m"+(_k++),level:d.level||1,stats:d.stats||{},technique_slots:techSlots,charm_slots:charmSlots};
    })}
  }catch(e){console.warn("roster load skipped:",e.message)}
  // Step 3: optional — boss preset. Never blocks.
  try{
    const br=await fetch(`${SB}/rest/v1/bosses?select=*&order=updated_at.desc&limit=1`,{headers:HR});
    if(br.ok){const bd=await br.json();if(bd[0]){boss={name:bd[0].name,stats:bd[0].stats||{},rounds:bd[0].rounds||50,id:bd[0].id}}}
  }catch(e){console.warn("boss load skipped:",e.message)}
  // Step 4: check for build import from calculator
  const importParam = new URLSearchParams(window.location.search).get('import');
  if (importParam) {
    try {
      const build = JSON.parse(atob(importParam));
      const name = build.c ? `${build.c} Build` : 'Imported Build';
      const techSlots = (build.t || []).map(s => s ? { id: s.i, rarity: s.r || 'Legendary', star: s.s || 0 } : null);
      const charmSlots = (build.ch || []).map(s => s ? { id: s.i, rarity: s.r || 'Legendary', star: s.s || 0 } : null);
      while (techSlots.length < 4) techSlots.push(null);
      while (charmSlots.length < 4) charmSlots.push(null);
      // Check if this build is already in roster (by matching all technique ids)
      const importIds = techSlots.filter(Boolean).map(s => s.id).sort().join(',');
      const isDupe = roster.some(m => {
        const mIds = (m.technique_slots || []).filter(Boolean).map(s => s.id).sort().join(',');
        return mIds === importIds && importIds.length > 0;
      });
      if (!isDupe) {
        roster.unshift({
          _k: 'm' + (_k++), id: null, name: name,
          class: build.c || '', level: build.l || 1, stats: {},
          technique_slots: techSlots, charm_slots: charmSlots
        });
        toast('Build imported from calculator');
      } else {
        toast('Build already in roster');
      }
      // Clean URL without reloading
      window.history.replaceState({}, '', 'simulator.html');
    } catch (e) { console.warn('Import parse failed:', e); }
  }
  // Step 5: reveal the app
  if(!roster.length)addMember();
  document.getElementById("loading").style.display="none";
  document.getElementById("app").style.display="";
  document.getElementById("sub").textContent=`${ALL_SKILLS.length} skills · ${roster.length} members`;
  setTab(importParam ? "roster" : "boss");
}
// add save buttons to roster tab via a floating action
document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
__diag("App defined — calling init()…","#6fae5a");
init();

// expose a global save for roster (called from a button we inject)
window.saveRoster=saveRoster;
