// ============================================================
// Sword × Staff DPS Calculator — single-character damage model
// ============================================================
const SB = "https://ysxbglavmdngayvinrzk.supabase.co";
const SK = "sb_publishable_w9keP2-21tJKR6FcF0YIQA_6q3ykBk-";
const IB = `${SB}/storage/v1/object/public/skill-icons`;
const LW = "https://lootandwaifus.com/skills/swordxstaff";
const HR = { apikey: SK, Authorization: `Bearer ${SK}` };
const HW = { ...HR, "Content-Type": "application/json" };

const RARITIES = ["Rare", "Epic", "Legendary", "Mythic", "Divine", "Immortal"];
const RCODE = { Rare: "R", Epic: "SR", Legendary: "SSR", Mythic: "UR", Divine: "LR", Immortal: "ER" };
const RCOL = { Rare: "#5f9aff", Epic: "#9660c4", Legendary: "#e68a23", Mythic: "#ebed63", Divine: "#e05252", Immortal: "#e884e8" };
const ELEMENTS = ["Physical", "Wind", "Water", "Fire", "Light", "Dark"];
const ECOL = { Physical: "#b0a89a", Fire: "#e8703a", Water: "#3aa5e8", Wind: "#5ec98a", Light: "#ecd25a", Dark: "#a06cd0" };

const FPAIR = {
  SkillAttack1: "SkillFixedAttack1", SkillAttack2: "SkillFixedAttack2",
  SkillAttack3: "SkillFixedAttack3", SkillAttack4: "SkillFixedAttack4",
  SkillCureByHp: "SkillFixedCure", SkillCureByAttack: "SkillFixedCure",
  ShieldByDefence: "SkillFixedShield", ShieldByTargetHp: "SkillFixedShield",
  StatusDmgAddPer: "FixedStatusDmgAdd", AttackScale: "FixedAttack",
  DefenceScale: "FixedDefence", MaxHpScale: "FixedMaxHp", SpeedScale: "FixedSpeed"
};

// Player stats — grouped by formula zone, using DISPLAYED percentages from in-game stats page
const PLAYER_STATS = [
  { group: "Zone 3 · Base", keys: [
    { k: "ATK", pct: false, tip: "Your total ATK" },
  ]},
  { group: "Zone 1 · DMG Boost", keys: [
    { k: "DMG Boost", pct: true, tip: "伤害加成" },
    { k: "PvE Bonus DMG", pct: true, tip: "对怪物伤害增加" },
  ]},
  { group: "Zone 2 · Mastery / Affinity (displayed %)", keys: [
    { k: "Phys DMG Increase", pct: true, tip: "Physical mastery → displayed % increase" },
    { k: "Elem DMG Increase", pct: true, tip: "Elemental mastery+affinity → displayed % increase" },
  ]},
  { group: "Zone 5 · Crit / Accuracy", keys: [
    { k: "Crit Rate", pct: true },
    { k: "Crit DMG", pct: true, tip: "Bonus above 100% (e.g. 150% crit = enter 50)" },
    { k: "Accuracy", pct: false },
  ]},
  { group: "Zone 4 · Skill DMG Increase (from buffs/gear)", keys: [
    { k: "General Skill DMG Up", pct: true, tip: "一般伤害提升 — gear affixes, Mantra, pet, etc." },
    { k: "Special Skill DMG Up", pct: true, tip: "特殊伤害提升 — Water Momentum, Revenge, etc." },
  ]},
];

// Boss stats — grouped by formula zone
const BOSS_STATS = [
  { group: "Zone 3 · Defense", keys: [
    { k: "DEF", pct: false },
    { k: "HP", pct: false },
  ]},
  { group: "Zone 1 · Boss DMG RES", keys: [
    { k: "DMG RES", pct: true, tip: "伤害抵抗" },
    { k: "PvE DMG RES", pct: true, tip: "对玩家伤害抵抗 (usually 0 for dummy)" },
  ]},
  { group: "Zone 2 · Boss Resistance (displayed %)", keys: [
    { k: "Phys RES Decrease", pct: true, tip: "Physical resistance → displayed % decrease" },
    { k: "Elem RES Decrease", pct: true, tip: "Elemental resistance+aegis → displayed % decrease" },
  ]},
  { group: "Zone 5 · Boss Block / Crit RES", keys: [
    { k: "Crit RES", pct: true },
    { k: "Block Rate", pct: true },
    { k: "Block DMG Resist", pct: true, tip: "格挡伤害抵抗 (min 50%)" },
  ]},
  { group: "Zone 4 · Boss DMG Reduction", keys: [
    { k: "DMG Reduction", pct: true, tip: "伤害减免 (max 50%)" },
  ]},
];

// ============================================================
// OCR — stat recognition from screenshots
// ============================================================
const ALL_STAT_KEYS = ["ATK", "DEF", "HP", "SPD", "Resilience", "Crit Rate", "Crit DMG", "Crit RES", "Block Rate", "Block Efficiency", "Accuracy", "DMG Boost", "DMG RES", "Healing Boost", "PvP Bonus DMG", "PvP DMG RES", "PvE Bonus DMG", "PvE DMG RES", "Effect Hit Rate", "Effect RES", "Elemental Mastery", "Elemental RES", "Physical Mastery", "Physical RES", "Wind Affinity", "Water Affinity", "Fire Affinity", "Light Affinity", "Dark Affinity", "Wind Aegis", "Water Aegis", "Fire Aegis", "Light Aegis", "Dark Aegis"];

function parseVal(raw) {
  if (raw == null) return null;
  let v = String(raw).trim().replace(/%/g, "").replace(/,/g, "");
  const m = v.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]); if (isNaN(n)) return null;
  return n * ({ K: 1e3, M: 1e6, B: 1e9, "": 1 }[(m[2] || "").toUpperCase()]);
}
function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function matchLabel(t) {
  let best = null, bd = Infinity;
  for (const k of ALL_STAT_KEYS) { const d = lev(t, k); if (d < bd) { bd = d; best = k; } }
  return bd <= Math.max(2, Math.floor(best.length * 0.34)) ? best : null;
}
function parseOCR(text) {
  const out = {};
  text.split("\n").map(l => l.trim()).filter(Boolean).forEach(line => {
    const m = line.match(/^(.*?)[\s.:]*([\d.]+\s*[KMB]?%?)\s*$/i);
    if (!m) return;
    const lbl = m[1].replace(/[^A-Za-z\s]/g, "").trim();
    if (!lbl) return;
    const key = matchLabel(lbl); if (!key) return;
    const val = parseVal(m[2]); if (val == null) return;
    if (!(key in out)) out[key] = val;
  });
  return out;
}

function preprocess(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = 2, cv = document.createElement("canvas");
      cv.width = img.width * s; cv.height = img.height * s;
      const ctx = cv.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const d = ctx.getImageData(0, 0, cv.width, cv.height), p = d.data;
      let mn = 255, mx = 0;
      for (let i = 0; i < p.length; i += 4) { const g = (p[i] * .299 + p[i + 1] * .587 + p[i + 2] * .114) | 0; p[i] = p[i + 1] = p[i + 2] = g; if (g < mn) mn = g; if (g > mx) mx = g; }
      const r = Math.max(1, mx - mn);
      for (let i = 0; i < p.length; i += 4) { const g = Math.min(255, Math.max(0, (p[i] - mn) / r * 255)) | 0; p[i] = p[i + 1] = p[i + 2] = g; }
      ctx.putImageData(d, 0, 0);
      res(cv.toDataURL("image/png"));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js";
    s.onload = res; s.onerror = () => rej(new Error("Tesseract CDN blocked"));
    document.head.appendChild(s);
  });
}
let _worker = null;
async function ocrWorker() {
  if (_worker) return _worker;
  await loadTesseract();
  _worker = await Tesseract.createWorker("eng");
  await _worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.%KMB " });
  return _worker;
}
async function runOCR(files, onDone, setStatus) {
  const merged = {}; let raw = "";
  try {
    const w = await ocrWorker();
    for (let i = 0; i < files.length; i++) {
      setStatus(`Reading image ${i + 1}/${files.length}…`);
      const url = await preprocess(files[i]);
      const { data } = await w.recognize(url);
      raw += `--- image ${i + 1} ---\n${data.text}\n`;
      Object.entries(parseOCR(data.text)).forEach(([k, v]) => { if (!(k in merged)) merged[k] = v; });
    }
    onDone(merged, raw);
  } catch (e) {
    setStatus("OCR failed: " + e.message + ". Enter stats manually.");
  }
}

// ============================================================
// State
// ============================================================
let ALL_SKILLS = [], SKILL_MAP = {}, CURVES = null;
let build = { level: 1, techniques: [null, null, null, null], charms: [null, null, null, null] };
let player = {};
let boss = { name: "Training Dummy", stats: {}, rounds: 50, id: null };
let playerOpen = true, bossOpen = false;
let playerOcrMsg = "", playerOcrRaw = "";
let bossOcrMsg = "", bossOcrRaw = "";
let pickCtx = null; // { type: "technique"|"charm", slot: 0-3 }
let pickFilter = "all";

// ============================================================
// Curves + damage computation (shared with build calculator)
// ============================================================
async function loadCurves() {
  try {
    const r = await fetch("curves.json");
    CURVES = await r.json();
  } catch (e) { console.warn("curves.json not found"); }
}

function getSkillDmg(skill, rarity) {
  const sbr = skill.stats_by_rarity;
  if (sbr && sbr[rarity]) {
    const st = sbr[rarity];
    for (const k of ["SkillAttack1", "SkillAttack2", "SkillAttack3", "SkillAttack4"]) {
      if (st[k] && typeof st[k] === "object") return { pct: st[k].pct || 0, flat: st[k].flat || 0 };
    }
  }
  const RIDX = { Rare: 1, Epic: 4, Legendary: 8, Mythic: 14, Divine: 22, Immortal: 33 };
  if (skill.damage && skill.damage.length) {
    const v = skill.damage[RIDX[rarity]];
    if (v != null) return { pct: v, flat: 0 };
  }
  return { pct: 0, flat: 0 };
}

function getSkillDmgAtLevel(skill, rarity, star, level) {
  const groups = getAllHitGroups(skill, rarity, star, level);
  return groups.length ? groups[0] : { pct: 0, flat: 0 };
}

// Returns ALL hit groups from a skill — each SkillAttack1-4 that has a value
function getAllHitGroups(skill, rarity, star, level) {
  const groups = [];
  if (CURVES && skill.entity_values) {
    const ev = skill.entity_values;
    const rc = RCODE[rarity] || "SSR";
    const rankNo = parseInt(CURVES.rank_table[rc]?.[String(star)] || CURVES.rank_table[rc]?.["0"] || 6);
    const cs = skill.curve_source || "skill";
    const bucket = cs === "status" ? "status_curves" : "rank_curves";
    const rr = CURVES[bucket]?.[String(skill.rank_prop_id)]?.[String(rankNo)] || {};
    const subrank = CURVES.rarity_meta[rc]?.subrank || "";
    const cid = CURVES.group_level_map?.[String(skill.group_level_prop_id)]?.[subrank];
    let lr = {};
    if (cid) {
      for (const bk of ["fixed_curves", "all_fixed_curves"]) {
        const b = CURVES[bk]?.[String(cid)];
        if (!b) continue;
        const lvs = Object.keys(b).map(Number).sort((a, b) => a - b);
        let sel = lvs[0] || 0;
        for (const l of lvs) if (l <= level) sel = l;
        lr = b[String(sel)] || {};
        break;
      }
    }
    for (const f of ["SkillAttack1", "SkillAttack2", "SkillAttack3", "SkillAttack4"]) {
      const paired = FPAIR[f];
      if (ev[f] != null) {
        const pb = Number(ev[f]), ps = Number(rr[f] || 0);
        const pct = pb && ps ? (pb * ps) / 1e6 : 0;
        const fb = Number(ev[paired] || 0), fr = Number(rr[paired] || 0), fl = Number(lr[paired] || 0);
        const flat = fl && fb && fr ? (fl * fb * fr) / 1e8 : 0;
        if (pct || flat) groups.push({ pct: Math.round(pct * 10) / 10, flat: Math.round(flat), key: f });
      }
    }
  }
  // Fallback: stats_by_rarity
  if (!groups.length) {
    const sbr = skill.stats_by_rarity;
    if (sbr && sbr[rarity]) {
      const st = sbr[rarity];
      for (const k of ["SkillAttack1", "SkillAttack2", "SkillAttack3", "SkillAttack4"]) {
        if (st[k] && typeof st[k] === "object" && (st[k].pct || st[k].flat)) {
          groups.push({ pct: st[k].pct || 0, flat: st[k].flat || 0, key: k });
        }
      }
    }
  }
  // Fallback: damage array
  if (!groups.length && skill.damage && skill.damage.length) {
    const RIDX = { Rare: 1, Epic: 4, Legendary: 8, Mythic: 14, Divine: 22, Immortal: 33 };
    const v = skill.damage[RIDX[rarity]];
    if (v != null) groups.push({ pct: v, flat: 0, key: "SkillAttack1" });
  }
  return groups;
}

function getMaxStar(rarity) {
  if (!CURVES || !CURVES.rarity_meta) return 3;
  const rc = RCODE[rarity] || "SSR";
  return parseInt(CURVES.rarity_meta[rc]?.max_star || 3);
}

// ============================================================
// Charm buff aggregation — scans all charm slots for buffs
// Returns { dmgBoost, atkScale, details: [{name, key, value}] }
// ============================================================
function computeCharmBuffs() {
  const buffs = { dmgBoost: 0, atkScale: 0, details: [] };
  for (const slot of build.charms) {
    if (!slot || !slot.id) continue;
    const sk = SKILL_MAP[slot.id];
    if (!sk) continue;
    const rarity = slot.rarity || "Legendary";

    // Collect all stat sources for this charm
    const sources = [];
    if (sk.extra_entity_stats) {
      for (const ex of sk.extra_entity_stats) {
        if (ex.stats?.[rarity]) sources.push(ex.stats[rarity]);
      }
    }
    if (sk.passive_status_stats) {
      for (const ps of sk.passive_status_stats) {
        if (ps.stats?.[rarity]) sources.push(ps.stats[rarity]);
      }
    }
    if (sk.passive_factor_stats?.[rarity]) {
      sources.push(sk.passive_factor_stats[rarity]);
    }

    for (const src of sources) {
      for (const [k, v] of Object.entries(src)) {
        const val = typeof v === "object" ? (v.pct || v.value || 0) : (typeof v === "number" ? v : 0);
        if (!val) continue;
        if (k === "StatusDmgAddPer" || k === "DmgAddPercent") {
          buffs.dmgBoost += val;
          buffs.details.push({ name: sk.name, key: "DMG Boost", value: val });
        } else if (k === "AttackScale") {
          buffs.atkScale += val;
          buffs.details.push({ name: sk.name, key: "ATK Scale", value: val });
        }
      }
    }

    // Fallback: if this charm has a "Buff" tag but no recognized stat
    if (!sources.length && (sk.tags || []).includes("Buff")) {
      buffs.dmgBoost += 8;
      buffs.details.push({ name: sk.name, key: "DMG Boost (est.)", value: 8 });
    }
  }
  return buffs;
}

// ============================================================
// Per-skill damage calculation — matches TapTap formula diagram exactly
// 伤害 = 技能面板 × Zone1 × Zone2 × Zone3 × Zone4 × Zone5 × Zone6
// ============================================================
function calcSkillDamage(skill, slotCfg, playerStats, bossStats, charmBuffs) {
  const atk = (playerStats.ATK || 0) * (1 + (charmBuffs.atkScale || 0) / 100);
  const def = bossStats.DEF || 0;
  const rarity = slotCfg.rarity || "Legendary";
  const star = slotCfg.star || 0;
  const elem = skill.element || "Physical";

  // Get ALL hit groups (SkillAttack1, SkillAttack2, etc.)
  const hitGroups = getAllHitGroups(skill, rarity, star, build.level);
  const hitsArr = slotCfg.hits || [1]; // array of hit counts per group

  // Skill Panel = sum of (ATK × coeff% + flat) × hits for each group
  let skillPanel = 0;
  const groupDetails = [];
  hitGroups.forEach((g, i) => {
    const h = hitsArr[i] || (i === 0 ? 1 : 0); // default: 1 for first group, 0 for others (user sets)
    const groupDmg = (atk * (g.pct / 100) + g.flat) * h;
    skillPanel += groupDmg;
    groupDetails.push({ pct: g.pct, flat: g.flat, hits: h, dmg: groupDmg, key: g.key });
  });

  // Zone 1: DMG Boost / DMG RES
  // (1 + 伤害加成 + PvE增伤) / (1 + 伤害抵抗 + PvE抵抗)
  const z1_num = 1 + ((playerStats["DMG Boost"] || 0) + (playerStats["PvE Bonus DMG"] || 0) + (charmBuffs.dmgBoost || 0)) / 100;
  const z1_den = 1 + ((bossStats["DMG RES"] || 0) + (bossStats["PvE DMG RES"] || 0)) / 100;
  const zone1 = z1_num / z1_den;

  // Zone 2: Mastery+Affinity / Resistance+Aegis (using DISPLAYED percentages)
  // (1 + 精通增伤 + 亲和增伤) / (1 + 抗性减伤 + 庇护减伤)
  const isPhys = (elem === "Physical");
  const z2_num = 1 + (isPhys ? (playerStats["Phys DMG Increase"] || 0) : (playerStats["Elem DMG Increase"] || 0)) / 100;
  const z2_den = 1 + (isPhys ? (bossStats["Phys RES Decrease"] || 0) : (bossStats["Elem RES Decrease"] || 0)) / 100;
  const zone2 = z2_num / z2_den;

  // Zone 3: DEF mitigation
  // 攻击力 / (攻击力 + 防御力)
  const zone3 = (atk + def) > 0 ? atk / (atk + def) : 0;

  // Zone 4: Skill DMG increase (two separate multiplicative sub-zones) / DMG reduction
  // ((1 + 一般伤害提升) × (1 + 特殊伤害提升)) / (1 + 伤害减免)
  const z4_general = 1 + (playerStats["General Skill DMG Up"] || 0) / 100;
  const z4_special = 1 + (playerStats["Special Skill DMG Up"] || 0) / 100;
  const z4_reduction = 1 + Math.min(50, bossStats["DMG Reduction"] || 0) / 100; // capped at 50%
  const zone4 = (z4_general * z4_special) / z4_reduction;

  // Zone 5: Crit / Block (probability-weighted expected value)
  // Block has priority over crit. If blocked: damage ÷ (1 + block_resist - accuracy)
  // If not blocked and crit: damage × (1 + crit_dmg - crit_res)
  // Crit DMG zone minimum = 1.3, Block resist zone minimum = 1.5
  const critDmgBonus = Math.max(0.3, ((playerStats["Crit DMG"] || 0) - (bossStats["Crit RES"] || 0)) / 100);
  const critMult = 1 + critDmgBonus; // minimum 1.3
  const critRate = Math.min(1, Math.max(0, (playerStats["Crit Rate"] || 0) / 100));
  const blockRate = Math.min(1, Math.max(0, (bossStats["Block Rate"] || 0) / 100));
  const blockResist = Math.max(0.5, (bossStats["Block DMG Resist"] || 50) / 100); // minimum 50%
  const accuracy = (playerStats["Accuracy"] || 0) / 100;
  const effBlockRate = Math.max(0, blockRate - accuracy);
  // Expected value: block chance × (1/block_mult) + no-block × [crit chance × crit_mult + no-crit × 1]
  const blockMult = 1 / (1 + blockResist); // damage multiplier when blocked
  const nonBlock = 1 - effBlockRate;
  const zone5 = effBlockRate * blockMult + nonBlock * (critRate * critMult + (1 - critRate) * 1);

  // Zone 6: Self damage reduction (usually 0 for offensive calc)
  const zone6 = 1;

  const total = Math.max(0, skillPanel * zone1 * zone2 * zone3 * zone4 * zone5 * zone6);

  return {
    total, skillPanel, groupDetails, zone1, zone2, zone3, zone4, zone5, zone6,
    z1_num, z1_den, z2_num, z2_den, z4_general, z4_special, z4_reduction,
    critMult, critRate, effBlockRate, blockMult,
    elem, atk, def
  };
}

// ============================================================
// Multi-round simulation
// ============================================================
function simulate() {
  const techSlots = build.techniques.filter(s => s && s.id && SKILL_MAP[s.id]);
  const skills = techSlots.map(s => ({ skill: SKILL_MAP[s.id], cfg: s }));
  if (!skills.length) return null;

  const charmBuffs = computeCharmBuffs();
  const cdReady = skills.map(() => 0);
  const rounds = boss.rounds || 50;
  let totalDmg = 0, totalCasts = 0;
  const perSkill = skills.map(() => ({ dmg: 0, casts: 0 }));
  const trace = [];

  for (let r = 0; r < rounds; r++) {
    const fired = [];
    let roundDmg = 0;
    for (let s = 0; s < skills.length; s++) {
      if (cdReady[s] <= r) {
        const { skill, cfg } = skills[s];
        const result = calcSkillDamage(skill, cfg, player, boss.stats, charmBuffs);
        totalDmg += result.total;
        roundDmg += result.total;
        totalCasts++;
        perSkill[s].dmg += result.total;
        perSkill[s].casts++;
        cdReady[s] = r + 1 + normCD(skill.cooldown);
        fired.push({ name: skill.name, dmg: result.total, elem: result.elem });
      }
    }
    trace.push({ round: r + 1, fired, total: roundDmg });
  }

  return {
    totalDmg, totalCasts, rounds, charmBuffs,
    perSkill: skills.map((s, i) => ({
      name: s.skill.name, elem: s.skill.element || "Physical",
      cd: normCD(s.skill.cooldown), rarity: s.cfg.rarity,
      ...perSkill[i]
    })),
    trace,
    dpr: totalDmg / rounds,
  };
}

// ============================================================
// Formatting + helpers
// ============================================================
function fmt(n) {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}
function fmtFlat(v) { return v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : Math.round(v); }
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); }
function iconUrl(sk) { const n = String(sk.id).replace("skill_", ""); return `${IB}/skill_${n}.webp`; }
function iconFB(sk) { const n = String(sk.id).replace("skill_", ""); return `${IB}/sprite_skill_${n}.png`; }
function sType(s) { return s.type === "combat" || s.type === "Technique" ? "technique" : "charm"; }
// Normalize cooldown: game uses 0-3, but some data has values ×10 (10→1, 20→2, 30→3)
function normCD(cd) { return (cd != null && cd >= 10) ? Math.round(cd / 10) : (cd || 0); }

// ============================================================
// Persistence (localStorage for build + player, Supabase for boss)
// ============================================================
function saveBuild() {
  try { localStorage.setItem("sxs_build", JSON.stringify(build)); } catch (e) {}
}
function loadBuild() {
  try {
    const d = JSON.parse(localStorage.getItem("sxs_build"));
    if (d) {
      build.level = d.level || 1;
      build.techniques = (d.techniques || [null, null, null, null]).slice(0, 4);
      build.charms = (d.charms || [null, null, null, null]).slice(0, 4);
      while (build.techniques.length < 4) build.techniques.push(null);
      while (build.charms.length < 4) build.charms.push(null);
      // Migrate old hits format (number → array)
      build.techniques.forEach(s => {
        if (s && s.hits != null && !Array.isArray(s.hits)) s.hits = [s.hits];
      });
    }
  } catch (e) {}
}
function savePlayer() {
  try { localStorage.setItem("sxs_player", JSON.stringify(player)); toast("Stats saved"); } catch (e) {}
}
function loadPlayer() {
  try { const d = JSON.parse(localStorage.getItem("sxs_player")); if (d) player = d; } catch (e) {}
}
async function saveBoss() {
  const body = { name: boss.name, stats: boss.stats, rounds: boss.rounds };
  try {
    if (boss.id) {
      await fetch(`${SB}/rest/v1/bosses?id=eq.${boss.id}`, { method: "PATCH", headers: HW, body: JSON.stringify(body) });
    } else {
      const r = await fetch(`${SB}/rest/v1/bosses`, { method: "POST", headers: { ...HW, Prefer: "return=representation" }, body: JSON.stringify(body) });
      const d = await r.json(); if (d[0]) boss.id = d[0].id;
    }
    toast("Boss saved");
  } catch (e) { toast("Save failed: " + e.message); }
}
async function loadBoss() {
  try {
    const r = await fetch(`${SB}/rest/v1/bosses?select=*&order=updated_at.desc&limit=1`, { headers: HR });
    if (r.ok) {
      const d = await r.json();
      if (d[0]) { boss = { name: d[0].name, stats: d[0].stats || {}, rounds: d[0].rounds || 50, id: d[0].id }; }
    }
  } catch (e) { console.warn("boss load skipped"); }
}

// ============================================================
// Import from build calculator (?import=BASE64)
// ============================================================
function handleImport() {
  const p = new URLSearchParams(window.location.search).get("import");
  if (!p) return false;
  try {
    const d = JSON.parse(atob(p));
    build.level = d.l || 1;
    build.techniques = (d.t || []).map(s => s ? { id: s.i, rarity: s.r || "Legendary", star: s.s || 0, hits: Array.isArray(s.h) ? s.h : [s.h || 1] } : null);
    build.charms = (d.ch || []).map(s => s ? { id: s.i, rarity: s.r || "Legendary", star: s.s || 0 } : null);
    while (build.techniques.length < 4) build.techniques.push(null);
    while (build.charms.length < 4) build.charms.push(null);
    saveBuild();
    window.history.replaceState({}, "", "simulator.html");
    return true;
  } catch (e) { console.warn("Import failed:", e); return false; }
}

// ============================================================
// Render: Build panel
// ============================================================
function renderBuild() {
  const el = document.getElementById("build-panel");
  const charmBuffs = computeCharmBuffs();
  let h = `<div class="panel-title">Build</div>`;
  h += `<div class="level-row"><label>Skill Level</label><input type="number" min="1" max="400" value="${build.level}" onchange="build.level=parseInt(this.value)||1;saveBuild();renderBuild()"></div>`;

  // Techniques
  h += `<div style="font-size:11px;color:var(--tx3);font-weight:700;letter-spacing:1px;margin:8px 0 4px">TECHNIQUES</div>`;
  h += `<div class="skill-slots">`;
  build.techniques.forEach((slot, i) => { h += slotHtml("technique", i, slot); });
  h += `</div>`;

  // Charms
  h += `<div style="font-size:11px;color:var(--tx3);font-weight:700;letter-spacing:1px;margin:10px 0 4px">CHARMS</div>`;
  h += `<div class="skill-slots">`;
  build.charms.forEach((slot, i) => { h += slotHtml("charm", i, slot); });
  h += `</div>`;

  // Charm buff summary
  if (charmBuffs.details.length) {
    h += `<div class="buff-list"><div style="font-size:11px;color:var(--tx3);font-weight:700;letter-spacing:1px;margin:8px 0 4px">CHARM BUFFS</div>`;
    charmBuffs.details.forEach(b => {
      h += `<div>${b.name}: <span>+${b.value}%</span> ${b.key}</div>`;
    });
    if (charmBuffs.dmgBoost) h += `<div style="margin-top:4px;font-weight:600">Total DMG Boost from charms: <span>+${charmBuffs.dmgBoost.toFixed(1)}%</span></div>`;
    if (charmBuffs.atkScale) h += `<div style="font-weight:600">Total ATK Scale from charms: <span>+${charmBuffs.atkScale.toFixed(1)}%</span></div>`;
    h += `</div>`;
  }

  // Rounds setting
  h += `<div class="rounds-row"><label>Rounds</label><input type="number" min="1" max="200" value="${boss.rounds}" onchange="boss.rounds=parseInt(this.value)||50"></div>`;
  el.innerHTML = h;
}

function slotHtml(type, i, slot) {
  const sk = slot && slot.id ? SKILL_MAP[slot.id] : null;
  if (!sk) return `<div class="slot empty" onclick="openPicker('${type}',${i})"><span class="slot-num">${i + 1}</span> + Add ${type}</div>`;

  const rarity = slot.rarity || sk.initial_rarity || "Legendary";
  const star = slot.star || 0;
  const maxStar = getMaxStar(rarity);
  const cd = sk.cooldown != null ? `CD ${normCD(sk.cooldown)}` : "";
  const elem = sk.element || "";

  // Get all hit groups for this skill
  const hitGroups = type === "technique" ? getAllHitGroups(sk, rarity, star, build.level) : [];
  const hitsArr = slot.hits || [1];
  // Ensure hits array matches group count
  while (hitsArr.length < hitGroups.length) hitsArr.push(0);

  let dmgHtml = "";
  if (type === "technique" && hitGroups.length) {
    dmgHtml = `<div style="display:flex;flex-direction:column;gap:1px;margin-top:2px">`;
    hitGroups.forEach((g, gi) => {
      const h = hitsArr[gi] || 0;
      dmgHtml += `<div style="display:flex;align-items:center;gap:3px;font-size:10px">
        <span style="color:var(--tx3)">${g.pct}%+${fmtFlat(g.flat)}</span>
        <span style="color:var(--tx3)">×</span>
        <input type="number" min="0" max="20" value="${h}"
          style="width:30px;background:var(--bg);border:1px solid var(--bdr2);color:var(--acc);border-radius:3px;font-size:10px;text-align:center;padding:1px;font-family:inherit"
          onchange="setSlotHits('${type}',${i},${gi},parseInt(this.value)||0)" title="Hits for group ${gi + 1}">
      </div>`;
    });
    dmgHtml += `</div>`;
  }

  return `<div class="slot">
    <span class="slot-num">${i + 1}</span>
    <div class="slot-icon" onclick="openPicker('${type}',${i})" style="cursor:pointer"><img src="${iconUrl(sk)}" onerror="this.onerror=null;this.src='${iconFB(sk)}'"></div>
    <div class="slot-info" onclick="openPicker('${type}',${i})" style="cursor:pointer">
      <div class="slot-name">${sk.name}</div>
      <div class="slot-meta">${elem ? `<span style="color:${ECOL[elem] || '#888'}">${elem}</span> · ` : ""}${cd}</div>
    </div>
    <div class="slot-controls">
      <select onchange="setSlot('${type}',${i},'rarity',this.value)">
        ${RARITIES.map(r => `<option ${rarity === r ? "selected" : ""} style="color:${RCOL[r]}">${r}</option>`).join("")}
      </select>
      <select onchange="setSlot('${type}',${i},'star',parseInt(this.value))">
        ${Array.from({ length: maxStar + 1 }, (_, n) => `<option value="${n}" ${star === n ? "selected" : ""}>${n}\u2605</option>`).join("")}
      </select>
      ${dmgHtml}
    </div>
    <button class="slot-rm" onclick="clearSlot('${type}',${i})">\u00d7</button>
  </div>`;
}

function setSlotHits(type, slotIdx, groupIdx, val) {
  const slots = type === "technique" ? build.techniques : build.charms;
  if (!slots[slotIdx]) return;
  if (!slots[slotIdx].hits) slots[slotIdx].hits = [1];
  while (slots[slotIdx].hits.length <= groupIdx) slots[slotIdx].hits.push(0);
  slots[slotIdx].hits[groupIdx] = val;
  saveBuild(); renderBuild();
}

function setSlot(type, i, prop, val) {
  const slots = type === "technique" ? build.techniques : build.charms;
  if (slots[i]) { slots[i][prop] = val; saveBuild(); renderBuild(); }
}
function clearSlot(type, i) {
  const slots = type === "technique" ? build.techniques : build.charms;
  slots[i] = null; saveBuild(); renderBuild();
}

// ============================================================
// Render: Player stats
// ============================================================
function renderPlayer() {
  const el = document.getElementById("player-panel");
  let h = `<button class="section-toggle ${playerOpen ? "open" : ""}" onclick="playerOpen=!playerOpen;renderPlayer()">
    <span class="arrow">\u25B6</span> Your Stats
    <span style="flex:1"></span>
    <button class="btn sm" onclick="event.stopPropagation();savePlayer()" style="margin-left:8px">Save</button>
  </button>`;
  h += `<div class="section-body ${playerOpen ? "open" : ""}">`;
  h += `<label class="upload-zone" id="player-up">Upload stat screenshots<input type="file" accept="image/*" multiple hidden onchange="onPlayerOCR(this.files)"></label>`;
  if (playerOcrMsg) h += `<div class="ocr-status">${playerOcrMsg}</div>`;
  if (playerOcrRaw) h += `<details><summary style="color:var(--tx3);font-size:10px;cursor:pointer">raw OCR</summary><div class="ocr-raw">${playerOcrRaw}</div></details>`;
  for (const g of PLAYER_STATS) {
    h += `<div class="stat-group"><div class="stat-group-label">${g.group}</div><div class="statgrid">`;
    for (const s of g.keys) {
      const tip = s.tip ? ` title="${s.tip}"` : "";
      h += `<div class="field"${tip}><label>${s.k}</label><input value="${player[s.k] != null ? player[s.k] : ""}" oninput="player['${s.k}']=this.value===''?null:parseFloat(this.value)">${s.pct ? '<span class="pct-mark">%</span>' : ""}</div>`;
    }
    h += `</div></div>`;
  }
  h += `</div>`;
  el.innerHTML = h;
}

async function onPlayerOCR(files) {
  if (!files.length) return;
  const zone = document.getElementById("player-up");
  zone.classList.add("busy");
  playerOcrMsg = "Reading…";
  await runOCR([...files], (merged, raw) => {
    Object.assign(player, merged);
    playerOcrMsg = `Extracted ${Object.keys(merged).length} stats — review below.`;
    playerOcrRaw = raw;
    playerOpen = true;
    renderPlayer();
  }, s => { playerOcrMsg = s; renderPlayer(); });
}

// ============================================================
// Render: Boss stats
// ============================================================
function renderBoss() {
  const el = document.getElementById("boss-panel");
  let h = `<button class="section-toggle ${bossOpen ? "open" : ""}" onclick="bossOpen=!bossOpen;renderBoss()">
    <span class="arrow">\u25B6</span> Boss: ${boss.name || "Training Dummy"}
    <span style="flex:1"></span>
    <button class="btn sm" onclick="event.stopPropagation();saveBoss()" style="margin-left:8px">Save</button>
  </button>`;
  h += `<div class="section-body ${bossOpen ? "open" : ""}">`;
  h += `<div class="field" style="margin-bottom:8px"><label>Boss Name</label><input value="${boss.name}" oninput="boss.name=this.value" style="width:160px;text-align:left"></div>`;
  h += `<label class="upload-zone" id="boss-up">Upload boss stat screenshots<input type="file" accept="image/*" multiple hidden onchange="onBossOCR(this.files)"></label>`;
  if (bossOcrMsg) h += `<div class="ocr-status">${bossOcrMsg}</div>`;
  if (bossOcrRaw) h += `<details><summary style="color:var(--tx3);font-size:10px;cursor:pointer">raw OCR</summary><div class="ocr-raw">${bossOcrRaw}</div></details>`;
  for (const g of BOSS_STATS) {
    h += `<div class="stat-group"><div class="stat-group-label">${g.group}</div><div class="statgrid">`;
    for (const s of g.keys) {
      const tip = s.tip ? ` title="${s.tip}"` : "";
      h += `<div class="field"${tip}><label>${s.k}</label><input value="${boss.stats[s.k] != null ? boss.stats[s.k] : ""}" oninput="boss.stats['${s.k}']=this.value===''?null:parseFloat(this.value)">${s.pct ? '<span class="pct-mark">%</span>' : ""}</div>`;
    }
    h += `</div></div>`;
  }
  h += `</div>`;
  el.innerHTML = h;
}

async function onBossOCR(files) {
  if (!files.length) return;
  const zone = document.getElementById("boss-up");
  zone.classList.add("busy");
  bossOcrMsg = "Reading…";
  await runOCR([...files], (merged, raw) => {
    Object.assign(boss.stats, merged);
    bossOcrMsg = `Extracted ${Object.keys(merged).length} stats — review below.`;
    bossOcrRaw = raw;
    bossOpen = true;
    renderBoss();
  }, s => { bossOcrMsg = s; renderBoss(); });
}

// ============================================================
// Render: Results
// ============================================================
function calculate() {
  const sim = simulate();
  const el = document.getElementById("results");
  if (!sim) {
    el.innerHTML = `<div class="panel" style="text-align:center;color:var(--tx3);padding:30px">Add at least one technique to calculate damage.</div>`;
    return;
  }

  let h = `<div class="panel">`;
  h += `<div class="panel-title">Damage Results — ${sim.rounds} Rounds</div>`;

  // Summary cards
  h += `<div class="result-summary">
    <div class="result-card"><div class="val">${fmt(sim.totalDmg)}</div><div class="label">Total Damage</div></div>
    <div class="result-card"><div class="val">${fmt(sim.dpr)}</div><div class="label">Avg / Round</div></div>
    <div class="result-card"><div class="val">${sim.totalCasts}</div><div class="label">Total Casts</div></div>
    <div class="result-card"><div class="val">${sim.perSkill.length}</div><div class="label">Skills Used</div></div>
  </div>`;

  // Boss HP progress (if HP is set)
  if (boss.stats.HP && boss.stats.HP > 0) {
    const pct = Math.min(100, sim.totalDmg / boss.stats.HP * 100);
    const killed = sim.totalDmg >= boss.stats.HP;
    h += `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--tx3);margin-bottom:4px">
        <span>Boss HP: ${fmt(boss.stats.HP)}</span>
        <span style="color:${killed ? 'var(--ok)' : 'var(--bad)'}">${pct.toFixed(1)}%</span>
      </div>
      <div style="height:12px;background:var(--bg);border-radius:6px;overflow:hidden;border:1px solid var(--bdr)">
        <div style="height:100%;width:${pct}%;background:${killed ? 'var(--ok)' : 'var(--bad)'};border-radius:6px;transition:width .3s"></div>
      </div>
      ${killed ? `<div style="text-align:center;color:var(--ok);font-weight:700;margin-top:6px;font-size:14px">DEFEATED</div>` :
        `<div style="text-align:center;color:var(--bad);font-weight:700;margin-top:6px;font-size:14px">SHORT by ${fmt(boss.stats.HP - sim.totalDmg)}</div>`}
    </div>`;
  }

  // Per-skill breakdown
  h += `<div class="skill-breakdown"><div style="font-size:11px;color:var(--tx3);font-weight:700;letter-spacing:1px;margin-bottom:8px">SKILL BREAKDOWN</div>`;
  const maxDmg = Math.max(...sim.perSkill.map(s => s.dmg), 1);
  sim.perSkill.forEach(s => {
    const pct = sim.totalDmg > 0 ? (s.dmg / sim.totalDmg * 100) : 0;
    const col = ECOL[s.elem] || "#888";
    h += `<div class="skill-row">
      <span style="width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${col}">${s.name}</span>
      <span style="font-size:10px;color:var(--tx3);width:50px">${s.casts} casts</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${s.dmg / maxDmg * 100}%;background:${col}"></div></div>
      <span class="total">${fmt(s.dmg)}</span>
      <span class="pct">${pct.toFixed(1)}%</span>
    </div>`;
  });
  h += `</div>`;

  // Charm buffs applied
  if (sim.charmBuffs.details.length) {
    h += `<div style="font-size:11px;color:var(--tx3);font-weight:700;letter-spacing:1px;margin:8px 0 4px">BUFFS APPLIED</div>`;
    h += `<div style="font-size:12px;color:var(--tx2);margin-bottom:8px">`;
    sim.charmBuffs.details.forEach(b => {
      h += `${b.name}: <span style="color:var(--acc)">+${b.value}%</span> ${b.key} · `;
    });
    h += `</div>`;
  }

  // First-skill formula breakdown — shows all 6 zones
  if (sim.perSkill.length > 0) {
    const firstSlot = build.techniques.find(s => s && s.id);
    if (firstSlot) {
      const sk = SKILL_MAP[firstSlot.id];
      const chBuffs = computeCharmBuffs();
      const r = calcSkillDamage(sk, firstSlot, player, boss.stats, chBuffs);
      const groupLines = r.groupDetails.map(g => `${g.pct}%+${fmtFlat(g.flat)} ×${g.hits} = ${fmt(g.dmg)}`).join(' + ');
      h += `<div class="formula-note">
        <strong>Formula (${sk.name}, 1 cast)</strong><br><br>
        <strong>Skill Panel</strong> = ${groupLines} = ${fmt(r.skillPanel)}<br><br>
        <strong>Z1 DMG Boost</strong> = ${r.z1_num.toFixed(3)} / ${r.z1_den.toFixed(3)} = ×${r.zone1.toFixed(3)}<br>
        <strong>Z2 Mastery</strong> = ${r.z2_num.toFixed(3)} / ${r.z2_den.toFixed(3)} = ×${r.zone2.toFixed(3)}<br>
        <strong>Z3 DEF</strong> = ${fmt(r.atk)} / (${fmt(r.atk)}+${fmt(r.def)}) = ×${r.zone3.toFixed(4)}<br>
        <strong>Z4 Skill DMG</strong> = (${r.z4_general.toFixed(2)} × ${r.z4_special.toFixed(2)}) / ${r.z4_reduction.toFixed(2)} = ×${r.zone4.toFixed(3)}<br>
        <strong>Z5 Crit/Block</strong> = E[${(r.critRate*100).toFixed(0)}% crit ×${r.critMult.toFixed(2)}, ${(r.effBlockRate*100).toFixed(0)}% block ×${r.blockMult.toFixed(2)}] = ×${r.zone5.toFixed(3)}<br><br>
        <strong>Total</strong> = ${fmt(r.skillPanel)} × ${r.zone1.toFixed(2)} × ${r.zone2.toFixed(2)} × ${r.zone3.toFixed(3)} × ${r.zone4.toFixed(2)} × ${r.zone5.toFixed(2)} = <strong>${fmt(r.total)}</strong>
      </div>`;
    }
  }

  // Per-round trace (collapsible)
  h += `<details style="margin-top:10px"><summary style="color:var(--acc);font-size:12px;cursor:pointer;font-weight:600">Per-round trace (${sim.rounds} rounds)</summary>`;
  h += `<div class="round-trace">`;
  sim.trace.forEach(r => {
    if (r.fired.length) {
      const skills = r.fired.map(f => `${f.name} <span class="r-dmg">${fmt(f.dmg)}</span>`).join(" · ");
      h += `<span class="r-num">R${r.round}</span> ${skills} = <span class="r-dmg">${fmt(r.total)}</span><br>`;
    } else {
      h += `<span class="r-num">R${r.round}</span> <span style="color:#444">(all on CD)</span><br>`;
    }
  });
  h += `</div></details>`;

  h += `</div>`;
  el.innerHTML = h;
}

// ============================================================
// Skill picker modal
// ============================================================
function openPicker(type, slot) {
  pickCtx = { type, slot };
  pickFilter = "all";
  document.getElementById("modal-title").textContent = `Select ${type === "technique" ? "Technique" : "Charm"}`;
  document.getElementById("modal-search").value = "";
  renderFilterRow();
  renderPicker();
  document.getElementById("modal").classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  document.getElementById("modal").classList.remove("open");
  document.body.style.overflow = "";
  pickCtx = null;
}
function renderFilterRow() {
  const skType = pickCtx.type === "technique" ? "technique" : "charm";
  const cls = [...new Set(ALL_SKILLS.filter(s => sType(s) === skType && s.name).map(s => s.profession || s.class))];
  const CL = [
    { id: "Warrior", c: "#e05252" }, { id: "Knight", c: "#5b8dd9" }, { id: "Duelist", c: "#e8943a" },
    { id: "Paladin", c: "#4a7bc8" }, { id: "Berserker", c: "#cc4422" }, { id: "Guardian", c: "#3a6ab5" },
    { id: "Conqueror", c: "#b33318" }, { id: "Templar", c: "#2d5a9e" }, { id: "Ravager", c: "#992210" },
    { id: "Mage", c: "#9b59b6" }, { id: "Sorcerer", c: "#8e44ad" }, { id: "Sage", c: "#27ae60" },
    { id: "Archmage", c: "#7d3c98" }, { id: "Arcanist", c: "#1e8449" }, { id: "Destroyer", c: "#6c3483" },
    { id: "Dominator", c: "#196f3d" }, { id: "Magister", c: "#5b2c6f" }, { id: "Prophet", c: "#145a32" },
  ];
  const ord = CL.filter(c => cls.includes(c.id));
  let h = `<button class="fbtn${pickFilter === "all" ? " active" : ""}" onclick="pickFilter='all';renderFilterRow();renderPicker()">All</button>`;
  ord.forEach(c => {
    h += `<button class="fbtn${pickFilter === c.id ? " active" : ""}" style="${pickFilter === c.id ? `color:${c.c};border-color:${c.c}` : ""}" onclick="pickFilter='${c.id}';renderFilterRow();renderPicker()">${c.id}</button>`;
  });
  document.getElementById("filter-row").innerHTML = h;
}
function renderPicker() {
  if (!pickCtx) return;
  const q = document.getElementById("modal-search").value.toLowerCase();
  const skType = pickCtx.type;
  const eq = new Set([...build.techniques, ...build.charms].filter(Boolean).map(s => s.id));
  let list = ALL_SKILLS.filter(s => sType(s) === skType && s.name && !eq.has(s.id));
  if (pickFilter !== "all") list = list.filter(s => (s.profession || s.class) === pickFilter);
  if (q) list = list.filter(s => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
  list = list.slice(0, 150);

  const body = document.getElementById("modal-body");
  if (!list.length) { body.innerHTML = `<div class="no-results">No matching skills</div>`; return; }
  body.innerHTML = list.map(s => {
    const cd = s.cooldown != null && normCD(s.cooldown) > 0 ? `CD ${normCD(s.cooldown)}` : s.cooldown === 0 ? "No CD" : "";
    const elem = s.element || "";
    const col = ECOL[elem] || "#888";
    return `<div class="pick-card" onclick="pickSkill('${s.id}')">
      <div class="slot-icon"><img src="${iconUrl(s)}" onerror="this.onerror=null;this.src='${iconFB(s)}'"></div>
      <div class="slot-info">
        <div class="slot-name">${s.name}</div>
        <div class="slot-meta">${s.profession || s.class || ""} ${elem ? `· <span style="color:${col}">${elem}</span>` : ""} ${cd ? `· ${cd}` : ""}</div>
      </div>
    </div>`;
  }).join("");
}
function pickSkill(id) {
  const sk = SKILL_MAP[id];
  if (!sk || !pickCtx) return;
  const slots = pickCtx.type === "technique" ? build.techniques : build.charms;
  const initRarity = sk.initial_rarity || "Legendary";
  const hitGroups = getAllHitGroups(sk, initRarity, 0, build.level);
  const defaultHits = hitGroups.map((_, i) => i === 0 ? 1 : 0); // first group=1, rest=0 (user sets from description)
  slots[pickCtx.slot] = { id, rarity: initRarity, star: 0, hits: defaultHits };
  saveBuild();
  closeModal();
  renderBuild();
}

// ============================================================
// Init
// ============================================================
async function init() {
  try {
    const rs = await fetch(`${SB}/rest/v1/skills?select=*&limit=500`, { headers: HR });
    if (!rs.ok) throw new Error(`HTTP ${rs.status}`);
    ALL_SKILLS = (await rs.json()).filter(s => s.name);
    SKILL_MAP = Object.fromEntries(ALL_SKILLS.map(s => [s.id, s]));
  } catch (e) {
    document.getElementById("loading").innerHTML = `<div><div style="font-size:38px">\u26a0\ufe0f</div><div style="color:#e74c3c">Failed to load skills</div><div style="color:#888;font-size:13px">${e.message}</div></div>`;
    return;
  }

  loadCurves();
  const imported = handleImport();
  if (!imported) loadBuild();
  loadPlayer();
  await loadBoss();

  // If player stats exist, collapse the section
  if (Object.keys(player).length > 2) playerOpen = false;
  // If boss stats exist, collapse
  if (Object.keys(boss.stats).length > 2) bossOpen = false;

  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "";
  document.getElementById("sub").textContent = `${ALL_SKILLS.length} skills loaded`;

  renderBuild();
  renderPlayer();
  renderBoss();

  // Auto-calculate if we have a build and stats
  if (build.techniques.some(Boolean) && player.ATK) {
    calculate();
  }

  if (imported) toast("Build imported from calculator");
}

document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
init();
