/* Dalgıç: çekirdek. Dünya, dalgıç, istasyonlar, ekonomi, arayüz ve ana döngü.
   Modüller (DG.mon, DG.wpn, DG.boss, DG.fx) js/API.md'deki sözleşmeye göre bağlanır. */
(function () {
'use strict';
const DG = window.DG;
const {WORLD_W, BOAT_X, NL, SHAFT_HALF, LEDGE_HALF, STATION_R, SAFE_R} = DG.C;
const D = DG.data;
const {LAYERS, SHIPS, GEAR, MON, WEAPONS, SKILLS, CONS, TRACKS, TRACK_LABEL, TRACK_W, STEP_COST, KM} = D;

// ---------- yardımcılar ----------
const rand = (a, b) => a + Math.random()*(b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hash = n => { const s = Math.sin(n*127.1)*43758.5453; return s - Math.floor(s); };
const rgb = (c, a) => a == null ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const lerp = (a, b, k) => a + (b - a)*k;
const mix = (c1, c2, k) => c1.map((v, i) => lerp(v, c2[i], k));

// ---------- dünya geometrisi ----------
const LH = i => 4000 + 300*i;
const LTOP = []; let WORLD_H = 0;
for (let i = 0; i < NL; i++) { LTOP.push(WORLD_H); WORLD_H += LH(i); }
const LBOT = i => LTOP[i] + LH(i);
function layerOf(y){ if (y <= 0) return 0; for (let i = NL - 1; i >= 0; i--) if (y >= LTOP[i]) return i; return 0; }
function toM(y){
  if (y <= 0) return 0;
  const L = layerOf(y), f = clamp((y - LTOP[L])/LH(L), 0, 1), ly = LAYERS[L];
  return ly.top + f*(ly.bot - ly.top);
}
function mToY(m){
  for (let i = 0; i < NL; i++) { const ly = LAYERS[i]; if (m <= ly.bot) return LTOP[i] + (m - ly.top)/(ly.bot - ly.top)*LH(i); }
  return WORLD_H;
}
function baseWall(y){
  for (let i = 1; i < NL; i++) { const b = LTOP[i]; if (Math.abs(y - b) < 220) return lerp(LAYERS[i - 1].wall, LAYERS[i].wall, (y - (b - 220))/440); }
  return LAYERS[layerOf(y)].wall;
}
function wallW(y, side){ return baseWall(y) + Math.sin(y*0.011 + side*3)*14 + Math.sin(y*0.037 + side)*8 + Math.sin(y*0.0021 + side*7)*20; }
function ledgeAt(y){
  const L = layerOf(y);
  for (const i of [L, L + 1]) if (i >= 1 && i < NL && Math.abs(y - LTOP[i]) <= LEDGE_HALF) return i;
  return 0;
}
const inLedge = (x, y) => ledgeAt(y) > 0 && Math.abs(x - BOAT_X) > SHAFT_HALF;
function boundsAt(y){ return [wallW(y, 0) + 16, WORLD_W - wallW(y, 1) - 16]; }
function waterAt(y){
  if (y <= 0) return LAYERS[0].water;
  const L = layerOf(y), f = clamp((y - LTOP[L])/LH(L), 0, 1), ly = LAYERS[L];
  return mix(ly.water, ly.waterBot, f);
}
const DARK = [[0,0],[40,0.12],[100,0.45],[150,0.62],[300,0.86],[500,0.93],[1000,0.965],[3000,0.975],[3800,0.985]];
function darkAtM(m){
  for (let i = 1; i < DARK.length; i++) if (m <= DARK[i][0]) { const [m0, a0] = DARK[i - 1], [m1, a1] = DARK[i]; return lerp(a0, a1, (m - m0)/(m1 - m0)); }
  return DARK[DARK.length - 1][1];
}
const stationPos = s => s === 0 ? {x:BOAT_X, y:0} : {x:BOAT_X, y:LTOP[s]};

// ---------- durum ----------
function defaultSave(){
  return {v:3, money:0, tier:0, lv:{tank:0,speed:0,bag:0,light:0,suit:0,armor:0},
    wpn:{spear:0}, curWpn:'spear', skills:{dash:0}, equip:[], inv:{spareTank:0,spareBag:0},
    relics:[], station:0, best:0, dives:0, kills:0, bossDone:false, endSeen:false, muted:false, earned:0, hints:{}};
}
const save = defaultSave();
const diver = {x:BOAT_X, y:0, vx:0, vy:0, ang:0, flip:1, kick:0, inv:0};
const cam = {x:0, y:0};
const S = DG.S = {save, diver, cam, W:0, H:0, DPR:1, t:0, dt:0, items:[], mons:[], playing:false, lifting:false, riding:false,
  input:{fire:false, mx:0, my:0}, worldH:WORLD_H, darkAlpha:0, glowSpots:[], relicHeld:false, bag:[], o2:30, slowT:0, inkT:0};
let mods = null, bagBonus = 0, diving = false, hurtT = 0, shakeT = 0, fullMsgT = 0, overT = 0, curStationZone = -1;
let floaters = [], bubbles = [], bubbleT = 0, lastLayer = -1, lastBestShown = 0;
const keys = new Set();

// ---------- tuval ----------
const $ = id => document.getElementById(id);
const cv = $('sea'), ctx = cv.getContext('2d');
const dk = document.createElement('canvas'), dctx = dk.getContext('2d');
function resize(){
  S.DPR = Math.min(2, window.devicePixelRatio || 1);
  S.W = innerWidth; S.H = innerHeight;
  for (const c of [cv, dk]) { c.width = Math.round(S.W*S.DPR); c.height = Math.round(S.H*S.DPR); }
}
addEventListener('resize', resize);
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- kayıt ve demo ----------
const SAVE_KEY = 'dalgic-save-v3', DEMO_SAVE_KEY = 'dalgic-save-v3-demo', DEMO_FLAG = 'dalgic-demo';
let demo = true;
try { demo = localStorage.getItem(DEMO_FLAG) !== '0'; } catch (e) {}
const saveKey = () => demo ? DEMO_SAVE_KEY : SAVE_KEY;
const canAfford = c => demo || save.money >= c;
const spend = c => { if (!demo) save.money -= c; };
function mergeSave(s){
  const d = defaultSave();
  Object.assign(save, d, s);
  save.lv = Object.assign(d.lv, s.lv || {});
  save.inv = Object.assign(d.inv, s.inv || {});
  save.wpn = Object.assign({spear:0}, s.wpn || {});
  save.skills = Object.assign({dash:0}, s.skills || {});
  save.hints = Object.assign({}, s.hints || {});
  save.equip = Array.isArray(s.equip) ? s.equip.filter(id => SKILLS.some(k => k.id === id) && id !== 'dash').slice(0, 3) : [];
  save.relics = Array.isArray(s.relics) ? s.relics.filter(i => i >= 0 && i < NL) : [];
  save.tier = clamp(save.tier|0, 0, NL - 1);
  save.station = clamp(save.station|0, 0, save.tier);
  for (const k of TRACKS) save.lv[k] = clamp(save.lv[k]|0, 0, 3);
  if (!WEAPONS.some(w => w.id === save.curWpn && save.wpn[w.id] != null)) save.curWpn = 'spear';
}
function load(){
  try { const s = JSON.parse(localStorage.getItem(saveKey()) || 'null'); if (s && s.v === 3) mergeSave(s); } catch (e) {}
}
function persist(){ try { localStorage.setItem(saveKey(), JSON.stringify(save)); } catch (e) {} }

// ---------- türetilmiş değerler ----------
function relicMods(){
  const m = {value:1, air:1, bag:0, dmg:1, light:1, speed:1, wdmg:1};
  for (const i of save.relics) {
    const b = LAYERS[i].relic.bonus;
    if (b.k === 'bag') m.bag += b.v;
    else if (b.k === 'dmg') m.dmg *= (1 - b.v);
    else m[b.k] *= (1 + b.v);
  }
  return m;
}
const speedAt = (t, k) => 150*Math.pow(1.15, t)*KM.speed[k];
function tankAt(t, k){
  const sp = speedAt(t, k), dk2 = 1 + 0.2*t, sf = KM.suit[k];
  const need = (2*sf*LH(t)/sp + 25)*(1 + 0.6*sf*dk2);
  return Math.round(need*(1.35 - 0.02*t));
}
const bagAt = k => KM.bag[k] + save.tier + mods.bag;
const lightAt = k => KM.light[k]*(1 + 0.05*save.tier)*mods.light;
const gTank = () => tankAt(save.tier, save.lv.tank)*mods.air;
const gBag = () => bagAt(save.lv.bag) + bagBonus;
const gLight = () => lightAt(save.lv.light);
const gArmor = () => KM.armor[save.lv.armor];
const limitY = () => LTOP[save.tier] + KM.suit[save.lv.suit]*LH(save.tier);
function gSpeed(){
  let s = speedAt(save.tier, save.lv.speed)*mods.speed;
  if (DG.wpn && DG.wpn.speedMult) s *= DG.wpn.speedMult();
  if (S.slowT > 0) s *= 0.4;
  return s;
}
const valUnit = L => 3*Math.pow(3.5, L);
const priceUnit = t => 15*Math.pow(3.5, t);
function nice(n){ if (n < 100) return Math.max(1, Math.round(n)); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n/p)*p; }
const upCost = (k, lvl) => nice(priceUnit(save.tier)*TRACK_W[k]*STEP_COST[lvl]);
const elevCost = () => nice(2600*Math.pow(3.5, save.tier));
const consPrice = k => nice(priceUnit(save.tier)*CONS[k].price);
const wpnCost = (w, lvl) => nice(priceUnit(w.unlock)*D.WPN_COST[lvl]);
const skillCost = (s, lvl) => nice(priceUnit(s.unlock)*D.SKILL_COST[lvl]);
const refTank = L => tankAt(L, 1);
function fmtMoney(n){
  n = Math.round(n);
  if (n < 100000) return '₺' + n.toLocaleString('tr-TR');
  for (const [d, s] of [[1e12,' Tr'],[1e9,' Mr'],[1e6,' Mn'],[1e3,' B']]) if (n >= d) { const v = n/d; return '₺' + (v >= 100 ? Math.round(v) : v.toFixed(1).replace('.', ',')) + s; }
  return '₺' + n;
}
const fmtM = m => Math.round(m).toLocaleString('tr-TR') + ' m';

// ---------- ses ----------
let actx = null;
function audio(){
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
function tone(freq, dur, type, vol, slide, at){
  if (save.muted) return;
  const a = audio(); if (!a) return;
  try {
    const t0 = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq*slide), t0 + dur);
    g.gain.setValueAtTime(vol || 0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  } catch (e) {}
}
function noise(dur, vol, at, lowpass){
  if (save.muted) return;
  const a = audio(); if (!a) return;
  try {
    const n = Math.floor(a.sampleRate*dur), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random()*2 - 1)*(1 - i/n);
    const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass || 900;
    src.buffer = buf; g.gain.value = vol || 0.15;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start(a.currentTime + (at || 0));
  } catch (e) {}
}
function sfx(k){
  switch (k) {
    case 'pick': tone(660, 0.08, 'triangle', 0.09); tone(990, 0.1, 'triangle', 0.06, 0, 0.06); break;
    case 'sell': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, 0, i*0.07)); break;
    case 'buy': tone(880, 0.06, 'square', 0.04); tone(1320, 0.09, 'square', 0.035, 0, 0.05); break;
    case 'hurt': tone(140, 0.25, 'sawtooth', 0.12, 0.4); noise(0.15, 0.1, 0, 600); break;
    case 'growl': tone(70, 0.6, 'sawtooth', 0.05, 0.7); break;
    case 'shot': tone(900, 0.1, 'square', 0.03, 0.3); noise(0.06, 0.05, 0, 2500); break;
    case 'hit': tone(240, 0.08, 'square', 0.05, 0.6); break;
    case 'kill': tone(300, 0.18, 'triangle', 0.09, 2.2); break;
    case 'boom': noise(0.5, 0.25, 0, 500); tone(80, 0.4, 'sine', 0.15, 0.5); break;
    case 'zap': tone(1200, 0.25, 'sawtooth', 0.04, 0.3); noise(0.2, 0.06, 0, 4000); break;
    case 'net': tone(500, 0.2, 'triangle', 0.06, 0.6); break;
    case 'sonar': tone(1400, 0.5, 'sine', 0.06, 0.98); tone(1400, 0.4, 'sine', 0.03, 0.98, 0.5); break;
    case 'dash': noise(0.25, 0.08, 0, 1500); break;
    case 'flare': tone(400, 0.4, 'sawtooth', 0.04, 2.5); break;
    case 'balloon': tone(220, 0.5, 'sine', 0.08, 3); break;
    case 'roar': tone(55, 1.4, 'sawtooth', 0.12, 0.6); noise(1.2, 0.12, 0, 300); break;
    case 'relic': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'sine', 0.07, 0, i*0.12)); break;
    case 'warn': tone(880, 0.1, 'square', 0.04); break;
    case 'faint': tone(300, 0.9, 'sine', 0.1, 0.25); break;
    case 'elev': tone(180, 0.9, 'triangle', 0.05, 1.8); break;
  }
}
function buzz(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

// ---------- mesajlar ----------
let msgTimer = 0, zoneTimer = 0;
function msg(text, color){
  const el = $('msg'); el.textContent = text; el.style.color = color || 'var(--foam)';
  el.classList.add('on'); clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.remove('on'), 2600);
}
function toast(big, small){
  $('zoneName').textContent = big; $('zoneRange').textContent = small;
  const el = $('zone'); el.classList.add('on'); clearTimeout(zoneTimer); zoneTimer = setTimeout(() => el.classList.remove('on'), 2000);
}
function float(x, y, text, color){ floaters.push({x, y, text, color, t:0}); }
function hint(key, text){ if (save.hints[key]) return; save.hints[key] = 1; persist(); setTimeout(() => msg(text, 'var(--relic)'), 400); }

// ---------- dünya üretimi ----------
function placeRelic(L){
  const r = LAYERS[L].relic;
  if (L === NL - 1) return {def:r, relic:true, L, x:BOAT_X + rand(-220, 220), y:WORLD_H - 52, value:0, ph:0, taken:false};
  const by = LTOP[L + 1], side = Math.random() < 0.5 ? 0 : 1;
  const wall = wallW(by - LEDGE_HALF - 22, side);
  const lo = side === 0 ? wall + 40 : BOAT_X + SHAFT_HALF + 40;
  const hi = side === 0 ? BOAT_X - SHAFT_HALF - 40 : WORLD_W - wall - 40;
  return {def:r, relic:true, L, x:rand(lo, Math.max(lo + 1, hi)), y:by - LEDGE_HALF - 24, value:0, ph:0, taken:false};
}
function isSafe(x, y){
  for (let s = 0; s <= save.tier; s++) { const p = stationPos(s); if (dist(x, y, p.x, p.y) < SAFE_R) return true; }
  return false;
}
function generate(){
  S.items = []; S.mons = []; S.glowSpots = [];
  for (let L = 0; L <= save.tier; L++) {
    const ly = LAYERS[L], V = valUnit(L), top = LTOP[L], h = LH(L);
    for (let y = top + 60; y < top + h - 60; y += rand(22, 40)) {
      const f = (y - top)/h;
      let tier = f < 0.34 ? 0 : f < 0.67 ? 1 : 2;
      if (tier < 2 && Math.random() < 0.07) tier++;
      const [lo, hi] = boundsAt(y); if (hi - lo < 60) continue;
      const x = rand(lo + 14, hi - 14);
      if (inLedge(x, y) || ledgeAt(y)) continue;
      const def = ly.items[tier][Math.random() < 0.6 ? 0 : 1];
      S.items.push({def, tier, L, x, y, value:V*[1,3,8][tier]*(1 + 1.5*f)*rand(0.85, 1.15)*mods.value, ph:rand(0, 6.28), taken:false});
    }
    if (!save.relics.includes(L) && !(S.relicHeld === L)) S.items.push(placeRelic(L));
    if (DG.mon && DG.mon.spawnLayer) {
      for (const m of DG.mon.spawnLayer(L)) if (!isSafe(m.x, m.y) && !inLedge(m.x, m.y)) S.mons.push(m);
    }
    const bot = L === NL - 1 ? WORLD_H : LTOP[L + 1];
    if (ly.decor === 'vents') for (let i = 0; i < 6; i++) S.glowSpots.push({x:120 + i*230 + rand(-30, 30), y:top + h*rand(0.3, 0.95), r:130, c:'255,110,40'});
    if (ly.decor === 'crystal') for (let i = 0; i < 10; i++) { const y = top + h*rand(0.05, 0.95), side = i%2; const x = side ? WORLD_W - wallW(y, 1) - 10 : wallW(y, 0) + 10; S.glowSpots.push({x, y, r:110, c:'140,220,255'}); }
    if (ly.decor === 'atlantis') for (let i = 0; i < 8; i++) S.glowSpots.push({x:180 + i*150, y:bot - 120 - (i%2)*80, r:160, c:'90,220,255'});
    if (ly.decor === 'trench') for (let i = 0; i < 4; i++) S.glowSpots.push({x:WORLD_W/2 + (i - 1.5)*160, y:bot - 40, r:120, c:'80,160,255'});
  }
}

// ---------- modül API'si ----------
function dmgFor(m){ return MON[m.t].dmg*refTank(m.L)*(1 + 0.1*m.L)*(m.size > 1 ? 1.5 : 1); }
function hurt(sec, name, src){
  if (diver.inv > 0 || !S.playing) return 0;
  let dmg = sec*(1 - gArmor())*mods.dmg*(S.lifting ? 0.5 : 1);
  if (DG.wpn && DG.wpn.defenseMult) dmg *= DG.wpn.defenseMult();
  if (dmg <= 0) return 0;
  S.o2 -= dmg; diver.inv = 0.9; hurtT = 0.5; shakeT = 0.3;
  if (src && !S.lifting) { const dx = diver.x - src.x, dy = diver.y - src.y, L = Math.hypot(dx, dy) || 1; diver.vx += dx/L*240; diver.vy += dy/L*240; }
  msg((name || 'Darbe') + '! −' + Math.round(dmg) + ' sn hava', 'var(--danger)');
  sfx('hurt'); buzz(80);
  if (DG.fx && DG.fx.burst) DG.fx.burst(diver.x, diver.y, '#ff5a4e', 10, 160);
  return dmg;
}
function bounty(m){
  const reward = valUnit(m.L)*MON[m.t].bounty*mods.value*(m.size > 1 ? 2 : 1);
  if (!demo) save.money += reward;
  save.earned += reward; save.kills++;
  float(m.x, m.y - 22, MON[m.t].n + ' +' + fmtMoney(reward), '#ffb03a');
  sfx('kill');
  return reward;
}
function reward(amount, x, y, label){ if (!demo) save.money += amount; save.earned += amount; float(x, y, (label ? label + ' ' : '') + '+' + fmtMoney(amount), '#ffb03a'); }
function stationAbove(y){ let best = 0; for (let s = 1; s <= save.tier; s++) if (LTOP[s] < y - 10) best = s; return best; }
function startLift(){
  if (!S.playing || S.lifting || diver.y < 40) return false;
  S.lifting = true; S.liftTo = stationAbove(diver.y); sfx('balloon'); buzz(30);
  msg('Kaldırma balonu şişti! ' + (S.liftTo ? 'İstasyon ' + S.liftTo : 'Tekne') + 'ye çıkıyorsun.', 'var(--amber)');
  return true;
}
function ink(sec){ S.inkT = Math.max(S.inkT, sec); }
function slow(sec){ S.slowT = Math.max(S.slowT, sec); }
function bossHUD(bossFrac, boatFrac, label){
  const b = $('bossBar');
  if (bossFrac == null) { b.hidden = true; return; }
  b.hidden = false;
  $('bossName').textContent = label || 'Derinlerin Efendisi';
  $('bossFill').style.width = clamp(bossFrac, 0, 1)*100 + '%';
  $('boatFill').style.width = clamp(boatFrac, 0, 1)*100 + '%';
}
function bossWon(){
  save.bossDone = true; persist();
  bossHUD(null);
  sfx('relic'); buzz([80, 40, 160]);
  setTimeout(() => {
    S.playing = false;
    $('eDives').textContent = save.dives; $('eMoney').textContent = demo ? '∞' : fmtMoney(save.money); $('eKills').textContent = save.kills;
    $('endCard').hidden = false;
  }, 1800);
}
function bossLost(){
  bossHUD(null); S.playing = false;
  $('bcEyebrow').textContent = 'GEMİ AĞIR YARA ALDI';
  $('bcTitle').textContent = 'Bir daha';
  $('bcText').textContent = 'Canavar tekneyi neredeyse batırdı ve derinlere çekildi. Ama geri gelecek. Silahlarını yükselt, yeteneklerini hazırla.';
  $('bcBtn').textContent = 'Tekrar savaş';
  $('bossCard').hidden = false;
}
DG.U = {rand, clamp, hash, rgb, dist, lerp, mix, layerOf, toM, mToY, LTOP, LH, LBOT, wallW, boundsAt, inLedge, ledgeAt, waterAt, darkAtM, stationPos, isSafe, valUnit};
DG.core = {hurt, dmgFor, bounty, reward, startLift, ink, slow, msg, float, sfx, buzz, bossHUD, bossWon, bossLost, gSpeed, gLight, gTank,
  tier:() => save.tier, wdmg:() => mods.wdmg, demo:() => demo, persist};
DG.sfx = sfx;

// ---------- giriş: joystick + klavye ----------
const joy = {active:false, id:null, ox:0, oy:0, x:0, y:0};
cv.addEventListener('pointerdown', e => {
  if (joy.active) return;
  joy.active = true; joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => { if (joy.active && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const joyEnd = e => { if (joy.active && e.pointerId === joy.id) joy.active = false; };
cv.addEventListener('pointerup', joyEnd); cv.addEventListener('pointercancel', joyEnd);
addEventListener('blur', () => { keys.clear(); joy.active = false; S.input.fire = false; });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.target && e.target.tagName === 'BUTTON' && (k === ' ' || k === 'enter')) return;
  if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '].includes(k)) { keys.add(k); e.preventDefault(); }
  if (k === ' ') S.input.fire = true;
  if (!S.playing) return;
  if (k === 'shift') skillPress('dash');
  if (k === 'q' && DG.wpn && DG.wpn.next) { DG.wpn.next(); }
  if (k === '1' || k === '2' || k === '3') { const id = save.equip[+k - 1]; if (id) skillPress(id); }
  if (k === 'e' && curStationZone >= 0) openElev();
  if (k === 'b' && curStationZone >= 0) openShop();
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === ' ') S.input.fire = false; });
function moveInput(){
  let ax = 0, ay = 0;
  if (keys.has('arrowleft') || keys.has('a')) ax -= 1;
  if (keys.has('arrowright') || keys.has('d')) ax += 1;
  if (keys.has('arrowup') || keys.has('w')) ay -= 1;
  if (keys.has('arrowdown') || keys.has('s')) ay += 1;
  if (joy.active) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, L = Math.hypot(dx, dy);
    if (L > 8) { const k = Math.min(1, (L - 8)/52); ax += dx/L*k; ay += dy/L*k; }
  }
  const al = Math.hypot(ax, ay); if (al > 1) { ax /= al; ay /= al; }
  return [ax, ay];
}
function skillPress(id){ if (S.playing && DG.wpn && DG.wpn.skill) DG.wpn.skill(id); }

// ---------- kontrol düğmeleri ----------
const fireBtn = $('btnFire');
fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); S.input.fire = true; try { fireBtn.setPointerCapture(e.pointerId); } catch (_) {} });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) fireBtn.addEventListener(ev, () => { S.input.fire = false; });
$('btnWpn').addEventListener('pointerdown', e => { e.preventDefault(); if (DG.wpn && DG.wpn.next) DG.wpn.next(); });
$('btnDash').addEventListener('pointerdown', e => { e.preventDefault(); skillPress('dash'); });
for (let i = 0; i < 3; i++) $('btnSk' + i).addEventListener('pointerdown', e => { e.preventDefault(); const id = save.equip[i]; if (id) skillPress(id); });
$('shopBtn').addEventListener('click', () => openShop());
$('elevBtn').addEventListener('click', () => openElev());

// ---------- dükkân ----------
let shopTab = 'gear';
function el(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function pips(n, on){ const p = el('div', 'pips'); for (let i = 1; i <= n; i++) { const d = el('i'); if (i <= on) d.className = 'on'; p.appendChild(d); } return p; }
function row(title, label, sub, extra){
  const r = el('div', 'up'), info = el('div');
  const nm = el('div', 'nm'); if (label) nm.appendChild(el('em', null, label)); nm.appendChild(document.createTextNode(title));
  info.appendChild(nm); if (sub) info.appendChild(el('div', 'st', sub)); if (extra) info.appendChild(extra);
  r.appendChild(info); return r;
}
function btn(text, cls, enabled, fn, id){
  const b = el('button', cls || 'buy', text); b.type = 'button'; if (id) b.id = id; b.disabled = !enabled;
  if (fn) b.addEventListener('click', () => { if (!b.disabled) fn(); });
  return b;
}
function trackText(k, lvl){
  switch (k) {
    case 'tank': return Math.round(tankAt(save.tier, lvl)*mods.air) + ' sn hava';
    case 'speed': return (KM.speed[lvl]*mods.speed).toFixed(2).replace('.', ',') + 'x hız';
    case 'bag': return bagAt(lvl) + ' parça';
    case 'light': return 'menzil ' + Math.round(lightAt(lvl));
    case 'suit': return fmtM(toM(LTOP[save.tier] + KM.suit[lvl]*LH(save.tier))) + '\'ye kadar';
    case 'armor': return '%' + Math.round(KM.armor[lvl]*100) + ' koruma';
  }
  return '';
}
const gearDone = () => TRACKS.every(k => save.lv[k] >= 3);
const relicDone = () => save.relics.includes(save.tier);
const elevReady = () => save.tier < NL - 1 && gearDone() && relicDone() && canAfford(elevCost());
function affordableCount(){
  let n = 0;
  for (const k of TRACKS) { const lv = save.lv[k]; if (lv < 3 && canAfford(upCost(k, lv + 1))) n++; }
  return n;
}
function bought(){ sfx('buy'); persist(); renderShop(); updateCtx(); }
function renderShop(){
  $('shopTitle').firstChild.textContent = SHIPS[save.tier].n;
  $('shopSub').textContent = 'KAT ' + (save.tier + 1) + '/' + NL + ' · ' + LAYERS[save.tier].name.toLocaleUpperCase('tr-TR');
  for (const k of ['gear','wpn','skill','cons','relic']) $('tab-' + k).setAttribute('aria-selected', String(shopTab === k));
  const body = $('shopBody'); body.innerHTML = '';
  const box = el('div', 'ups');
  if (shopTab === 'gear') {
    for (const k of TRACKS) {
      const lv = save.lv[k];
      const r = row(GEAR[k][save.tier], TRACK_LABEL[k], lv < 3 ? trackText(k, lv) + '  →  ' + trackText(k, lv + 1) : trackText(k, lv) + ' · bu katın en iyisi', pips(3, lv));
      if (lv >= 3) r.appendChild(btn('Tamam', 'buy', false));
      else { const c = upCost(k, lv + 1); r.appendChild(btn(fmtMoney(c), 'buy', canAfford(c), () => {
        if (!canAfford(c) || save.lv[k] >= 3) return;
        spend(c); save.lv[k]++; if (k === 'tank') S.o2 = gTank();
        msg(GEAR[k][save.tier] + ' yükseltildi', 'var(--amber)');
        if (gearDone()) msg(relicDone() ? 'Ekipman tamam! Asansörden yeni katı açabilirsin.' : 'Ekipman tamam! Şimdi bu katın dibindeki eseri bul.', 'var(--relic)');
        bought();
      }, 'buy-' + k)); }
      box.appendChild(r);
    }
  } else if (shopTab === 'wpn') {
    for (const w of WEAPONS) {
      const owned = save.wpn[w.id] != null, lv = owned ? save.wpn[w.id] : -1, locked = save.tier < w.unlock;
      const sub = locked ? 'Kat ' + (w.unlock + 1) + '\'de açılır.' : w.d + (owned ? ' · Hasar x' + (1 + 0.5*lv).toFixed(1).replace('.', ',') : '');
      const r = row(w.n, owned && save.curWpn === w.id ? 'ELİNDE' : 'SİLAH', sub, owned ? pips(3, lv) : null);
      if (locked) r.classList.add('locked');
      const col = el('div', 'btncol');
      if (locked) col.appendChild(btn('Kilitli', 'buy', false));
      else if (!owned) { const c = wpnCost(w, 0); col.appendChild(btn(fmtMoney(c), 'buy', canAfford(c), () => { spend(c); save.wpn[w.id] = 0; save.curWpn = w.id; msg(w.n + ' alındı!', 'var(--amber)'); bought(); }, 'wpn-' + w.id)); }
      else {
        if (lv < 3) { const c = wpnCost(w, lv + 1); col.appendChild(btn('▲ ' + fmtMoney(c), 'buy', canAfford(c), () => { spend(c); save.wpn[w.id]++; bought(); }, 'wpn-' + w.id)); }
        else col.appendChild(btn('Tam güç', 'buy', false));
        col.appendChild(btn(save.curWpn === w.id ? 'Elinde' : 'Seç', 'buy alt', save.curWpn !== w.id, () => { save.curWpn = w.id; bought(); }));
      }
      r.appendChild(col); box.appendChild(r);
    }
  } else if (shopTab === 'skill') {
    box.appendChild(el('p', 'note', 'Hız patlaması her zaman takılı. Diğerlerinden en fazla 3 tanesini tuşlara takabilirsin.'));
    for (const s of SKILLS) {
      const owned = save.skills[s.id] != null, lv = owned ? save.skills[s.id] : -1, locked = save.tier < s.unlock;
      const cd = Math.round(s.cd*D.SKILL_CD[Math.max(0, lv)]);
      const r = row(s.n, s.id === 'dash' ? 'HER ZAMAN' : save.equip.includes(s.id) ? 'TAKILI' : 'YETENEK', locked ? 'Kat ' + (s.unlock + 1) + '\'de açılır.' : s.d + ' Bekleme: ' + cd + ' sn', owned ? pips(2, lv) : null);
      if (locked) r.classList.add('locked');
      const col = el('div', 'btncol');
      if (locked) col.appendChild(btn('Kilitli', 'buy', false));
      else if (!owned) { const c = skillCost(s, 0); col.appendChild(btn(fmtMoney(c), 'buy', canAfford(c), () => { spend(c); save.skills[s.id] = 0; if (s.id !== 'dash' && save.equip.length < 3) save.equip.push(s.id); msg(s.n + ' öğrenildi!', 'var(--amber)'); bought(); }, 'sk-' + s.id)); }
      else {
        if (lv < 2) { const c = skillCost(s, lv + 1); col.appendChild(btn('▲ ' + fmtMoney(c), 'buy', canAfford(c), () => { spend(c); save.skills[s.id]++; bought(); }, 'sk-' + s.id)); }
        else col.appendChild(btn('Usta', 'buy', false));
        if (s.id !== 'dash') {
          const on = save.equip.includes(s.id);
          col.appendChild(btn(on ? 'Çıkar' : 'Tak', 'buy alt', on || save.equip.length < 3, () => {
            if (on) save.equip = save.equip.filter(x => x !== s.id); else if (save.equip.length < 3) save.equip.push(s.id);
            bought();
          }));
        }
      }
      r.appendChild(col); box.appendChild(r);
    }
  } else if (shopTab === 'cons') {
    for (const k of Object.keys(CONS)) {
      const c = CONS[k], price = consPrice(k), full = save.inv[k] >= c.max;
      const r = row(c.n, 'MALZEME', c.d + ' Elinde: ' + save.inv[k] + '/' + c.max);
      r.appendChild(full ? btn('Dolu', 'buy', false) : btn(fmtMoney(price), 'buy', canAfford(price), () => { spend(price); save.inv[k] = Math.min(c.max, save.inv[k] + c.pack); bought(); }, 'cons-' + k));
      box.appendChild(r);
    }
  } else {
    const grid = el('div', 'relics');
    LAYERS.forEach((ly, i) => {
      const found = save.relics.includes(i), r = el('div', 'rel' + (found ? ' found' : ''));
      r.appendChild(el('span', null, 'KAT ' + (i + 1) + ' · ' + ly.name));
      r.appendChild(el('b', null, found ? ly.relic.n : '???'));
      if (found) { r.appendChild(el('span', null, ly.relic.lore)); r.appendChild(el('em', null, bonusText(ly.relic.bonus))); }
      grid.appendChild(r);
    });
    box.appendChild(grid);
  }
  body.appendChild(box);
}
function bonusText(b){
  const pct = Math.round(b.v*100);
  switch (b.k) {
    case 'value': return 'Kalıcı: satışlar +%' + pct;
    case 'air': return 'Kalıcı: hava +%' + pct;
    case 'light': return 'Kalıcı: ışık +%' + pct;
    case 'speed': return 'Kalıcı: hız +%' + pct;
    case 'wdmg': return 'Kalıcı: silah hasarı +%' + pct;
    case 'bag': return 'Kalıcı: çanta +' + b.v;
    case 'dmg': return 'Kalıcı: canavar hasarı −%' + pct;
  }
  return '';
}
function openShop(){ if (!S.playing) return; renderShop(); $('elev').hidden = true; $('shop').hidden = false; }
for (const k of ['gear','wpn','skill','cons','relic']) $('tab-' + k).addEventListener('click', () => { shopTab = k; renderShop(); });
$('shopClose').addEventListener('click', () => { $('shop').hidden = true; });

// ---------- asansör ----------
function renderElev(){
  const body = $('elevBody'); body.innerHTML = '';
  const list = el('div', 'ups');
  for (let s = 0; s <= save.tier; s++) {
    const here = curStationZone === s;
    const r = row(s === 0 ? 'Tekne · ' + SHIPS[save.tier].n : 'İstasyon ' + s + ' · ' + LAYERS[s].name, s === 0 ? 'YÜZEY' : fmtM(LAYERS[s].top), s === 0 ? 'Yüzeye çık, havayı tazele.' : 'Buradan ' + LAYERS[s].name + ' katına dalarsın.');
    r.appendChild(btn(here ? 'Buradasın' : 'Git', 'buy', !here, () => rideTo(s), 'go-' + s));
    list.appendChild(r);
  }
  body.appendChild(list);
  const card = el('div', 'shipcard');
  if (save.tier >= NL - 1) {
    card.appendChild(el('h3', null, 'Son kat'));
    card.appendChild(el('p', null, save.bossDone ? 'Atlantis senin. Bütün katlar açık; dalmaya devam edebilirsin.' : 'Atlantis\'in Kalbi bu katın en dibinde. Onu bir istasyona getir.'));
  } else {
    const n = save.tier + 1, cost = elevCost();
    card.appendChild(el('span', 'lbl', 'YENİ KAT'));
    card.appendChild(el('h3', null, LAYERS[n].name));
    card.appendChild(el('p', null, 'Asansör ' + fmtM(LAYERS[n].top) + '\'ye iner, ' + fmtM(LAYERS[n].bot) + '\'ye kadar yeni bir kat açılır. Gemin ' + SHIPS[n].n + ' olur, dükkâna yeni katın ekipmanı gelir.'));
    const ul = el('ul', 'req');
    const done = TRACKS.filter(k => save.lv[k] >= 3).length;
    for (const [txt, ok] of [
      ['Ekipmanı tamamla (' + done + '/' + TRACKS.length + ')', gearDone()],
      ['Bu katın eserini getir: ' + (relicDone() ? LAYERS[save.tier].relic.n : '???'), relicDone()],
      ['Asansör parası: ' + fmtMoney(cost), canAfford(cost)],
    ]) { const li = el('li', ok ? 'ok' : ''); li.appendChild(el('span', null, txt)); li.appendChild(el('b', null, ok ? '✓' : '✗')); ul.appendChild(li); }
    card.appendChild(ul);
    card.appendChild(btn('Asansörü indir', 'bigbuy', elevReady(), buildElevator, 'buildElev'));
  }
  body.appendChild(card);
  if (demo && save.tier < NL - 1) {
    const d = btn('DEMO: bütün katları aç', 'demo', true, () => {
      save.tier = NL - 1; for (let i = 0; i < NL - 1; i++) if (!save.relics.includes(i)) save.relics.push(i);
      for (const k of TRACKS) save.lv[k] = 3;
      mods = relicMods(); generate(); persist(); renderElev(); updateCtx(); msg('Demo: 11 katın hepsi açıldı.', 'var(--amber)');
    }, 'demoAll');
    body.appendChild(d);
  }
}
function buildElevator(){
  if (!elevReady()) return;
  spend(elevCost());
  save.tier++;
  for (const k of TRACKS) save.lv[k] = 0;
  mods = relicMods(); generate(); persist();
  sfx('elev'); buzz([40, 30, 80]);
  renderElev(); updateCtx();
  toast(LAYERS[save.tier].name, 'YENİ KAT AÇILDI · ' + fmtM(LAYERS[save.tier].top));
  msg('Yeni gemin: ' + SHIPS[save.tier].n + '. Dükkâna yeni ekipman geldi.', 'var(--amber)');
}
function openElev(){ if (!S.playing) return; renderElev(); $('shop').hidden = true; $('elev').hidden = false; }
$('elevClose').addEventListener('click', () => { $('elev').hidden = true; });
function rideTo(s){
  if (S.riding) return;
  S.riding = true; S.playing = false; $('elev').hidden = true; $('shop').hidden = true;
  const ride = $('ride'), from = toM(diver.y), to = s === 0 ? 0 : LAYERS[s].top;
  $('rideTo').textContent = s === 0 ? 'Tekne' : 'İstasyon ' + s + ' · ' + LAYERS[s].name;
  ride.hidden = false; requestAnimationFrame(() => ride.classList.add('on'));
  sfx('elev');
  const t0 = performance.now(), dur = 1300;
  const tick = now => {
    const k = clamp((now - t0)/dur, 0, 1);
    $('rideDepth').textContent = fmtM(lerp(from, to, k*k*(3 - 2*k)));
    if (k < 1) requestAnimationFrame(tick);
    else {
      const p = stationPos(s);
      diver.x = p.x; diver.y = s === 0 ? 0 : p.y - 50; diver.vx = diver.vy = 0;
      cam.y = diver.y - S.H*0.45;
      save.station = s; S.o2 = gTank(); persist();
      ride.classList.remove('on');
      setTimeout(() => { ride.hidden = true; S.riding = false; S.playing = true; if (S.onArrive) { const f = S.onArrive; S.onArrive = null; f(); } }, 320);
    }
  };
  requestAnimationFrame(tick);
}

// ---------- kartlar ----------
function relicCard(L){
  const r = LAYERS[L].relic;
  $('rcName').textContent = r.n; $('rcLore').textContent = r.lore; $('rcBonus').textContent = bonusText(r.bonus);
  $('rcNext').textContent = L === NL - 1 ? '' : gearDone() ? 'Ekipman da tamam. Asansörden yeni katı açabilirsin.' : 'Ekipmanı tamamlayınca asansörden yeni katı açabilirsin.';
  S.playing = false; $('relicCard').hidden = false;
  S.afterRelic = L === NL - 1 ? bossIntro : null;
}
function bossIntro(){
  $('bcEyebrow').textContent = 'DERİNLERDEN BİR ŞEY UYANDI';
  $('bcTitle').textContent = 'Ganimetini istiyor';
  $('bcText').textContent = 'Atlantis\'in Kalbi asansörle tekneye çıkarken çukurun dibinde dev bir gölge kıpırdadı. Hazinelerini geri almak için tekneye doğru yükseliyor. Gemiyi koru!';
  $('bcBtn').textContent = 'Tekneye çık ve savaş';
  S.playing = false; $('bossCard').hidden = false;
}
$('rcBtn').addEventListener('click', () => { $('relicCard').hidden = true; const f = S.afterRelic; S.afterRelic = null; if (f) f(); else S.playing = true; });
$('bcBtn').addEventListener('click', () => {
  $('bossCard').hidden = true;
  S.onArrive = () => { if (DG.boss && DG.boss.start) DG.boss.start(); };
  S.playing = true;
  if (curStationZone === 0) { S.playing = true; const f = S.onArrive; S.onArrive = null; f(); } else rideTo(0);
});
$('endBtn').addEventListener('click', () => { $('endCard').hidden = true; save.endSeen = true; persist(); S.playing = true; });
$('muteBtn').addEventListener('click', () => { save.muted = !save.muted; $('muteBtn').textContent = save.muted ? 'SES KAPALI' : 'SES AÇIK'; persist(); if (!save.muted) sfx('buy'); });
function syncDemoBtn(){
  const b = $('demoBtn'); b.setAttribute('aria-pressed', String(demo));
  b.textContent = demo ? 'DEMO AÇIK · sınırsız para' : 'DEMO KAPALI · gerçek oyun';
  $('startBtn').textContent = (save.dives > 0 || save.tier > 0) ? 'Devam et' : 'Dalışa başla';
}
$('demoBtn').addEventListener('click', () => {
  demo = !demo;
  try { localStorage.setItem(DEMO_FLAG, demo ? '1' : '0'); } catch (e) {}
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, defaultSave()); load(); setup(); syncDemoBtn();
});
$('startBtn').addEventListener('click', () => {
  audio(); $('intro').hidden = true; S.playing = true;
  toast(LAYERS[layerOf(diver.y)].name, 'KAT ' + (layerOf(diver.y) + 1) + ' / ' + NL);
  hint('move', 'Ekrana dokun ve sürükle: dalgıç parmağının yönüne yüzer.');
  if (save.relics.includes(NL - 1) && !save.bossDone) setTimeout(bossIntro, 600);
});

// ---------- oyun mantığı ----------
function wakeAtStation(){
  const s = stationAbove(diver.y + 1);
  const p = stationPos(s);
  diver.x = p.x; diver.y = s === 0 ? 0 : p.y - 50; diver.vx = diver.vy = 0;
  save.station = s;
}
function faint(){
  const lost = S.bag.length, hadRelic = S.relicHeld !== false;
  sfx('faint'); buzz(200);
  S.bag = []; bagBonus = 0; S.relicHeld = false; diving = false; S.lifting = false; S.inkT = S.slowT = 0;
  wakeAtStation(); S.o2 = gTank(); generate(); persist();
  msg(hadRelic ? 'Bayıldın! Eser de çanta da derinlere geri döndü.' : lost ? 'Bayıldın! Çantadaki ' + lost + ' parça denizde kaldı.' : 'Bayıldın! İstasyon seni çekti.', 'var(--danger)');
}
function stationZone(){
  if (diver.y < 25 && Math.abs(diver.x - BOAT_X) < 120) return 0;
  for (let s = 1; s <= save.tier; s++) if (dist(diver.x, diver.y, BOAT_X, LTOP[s]) < STATION_R) return s;
  return -1;
}
function arriveAtStation(s){
  diving = false;
  const sum = S.bag.reduce((a, it) => a + it.value, 0);
  if (S.bag.length) {
    if (!demo) save.money += sum;
    save.earned += sum;
    float(diver.x, diver.y - 40, '+' + fmtMoney(sum), '#ffb03a');
    msg(S.bag.length + ' parça satıldı: ' + fmtMoney(sum), 'var(--amber)'); sfx('sell'); buzz(40);
  }
  S.bag = []; bagBonus = 0; save.station = s;
  if (S.relicHeld !== false) {
    const L = S.relicHeld; S.relicHeld = false;
    if (!save.relics.includes(L)) save.relics.push(L);
    mods = relicMods(); sfx('relic'); buzz([60, 40, 120]);
    relicCard(L);
  }
  generate(); persist();
  hint('station', 'İstasyondasın: hava doldu, ganimet satıldı. Dükkân ve Asansör düğmeleri solda.');
}
function update(dt){
  S.t += dt; S.dt = dt;
  const [ax, ay] = S.playing && !S.lifting ? moveInput() : [0, 0];
  const sp = gSpeed();
  if (S.lifting) {
    const p = stationPos(S.liftTo), ty = S.liftTo === 0 ? 0 : p.y - 50;
    const dx = p.x - diver.x, dy = ty - diver.y, L = Math.hypot(dx, dy) || 1, s2 = Math.max(sp, 200)*2.6;
    diver.vx += (dx/L*s2 - diver.vx)*Math.min(1, dt*4); diver.vy += (dy/L*s2 - diver.vy)*Math.min(1, dt*4);
    if (L < 30) S.lifting = false;
  } else {
    const has = ax || ay, f = Math.min(1, dt*(has ? 7 : 2.5));
    diver.vx += (ax*sp - diver.vx)*f; diver.vy += (ay*sp - diver.vy)*f;
  }
  const px = diver.x, py = diver.y;
  diver.x += diver.vx*dt; diver.y += diver.vy*dt;
  if (diver.y < 0) { diver.y = 0; if (diver.vy < 0) diver.vy = 0; }
  if (diver.y > WORLD_H - 16) { diver.y = WORLD_H - 16; if (diver.vy > 0) diver.vy = 0; }
  if (!S.lifting && inLedge(diver.x, diver.y)) {
    const i = ledgeAt(diver.y), bt = LTOP[i] - LEDGE_HALF, bb = LTOP[i] + LEDGE_HALF;
    if (py <= bt) { diver.y = bt - 0.5; diver.vy = Math.min(0, diver.vy); }
    else if (py >= bb) { diver.y = bb + 0.5; diver.vy = Math.max(0, diver.vy); }
    else { diver.x = px; diver.vx = 0; }
  }
  const [lo, hi] = diver.y > 0 ? boundsAt(diver.y) : [30, WORLD_W - 30];
  diver.x = clamp(diver.x, lo, hi);
  diver.kick += dt*(2 + Math.hypot(diver.vx, diver.vy)/25);
  if (diver.inv > 0) diver.inv -= dt;
  if (hurtT > 0) hurtT -= dt;
  if (shakeT > 0) shakeT -= dt;
  if (S.inkT > 0) S.inkT -= dt;
  if (S.slowT > 0) S.slowT -= dt;
  if (diver.vx > 6) diver.flip = 1; else if (diver.vx < -6) diver.flip = -1;
  const spd = Math.hypot(diver.vx, diver.vy);
  const target = spd > 12 ? clamp(Math.atan2(diver.vy, diver.vx*diver.flip), -1.35, 1.35) : 0;
  diver.ang += (target - diver.ang)*Math.min(1, dt*8);

  const m = toM(diver.y), L = layerOf(diver.y), maxO2 = gTank();
  const zone = stationZone(); curStationZone = zone;
  if (S.playing) {
    const over = diver.y > limitY() + 8;
    if (zone >= 0) { S.o2 = Math.min(maxO2, S.o2 + dt*maxO2/1.5); $('warn').hidden = true; }
    else {
      const f = clamp((diver.y - LTOP[L])/LH(L), 0, 1);
      let rate = 1 + f*(1 + 0.2*L);
      if (over) { rate += 0.15*maxO2; overT -= dt; if (overT <= 0) { sfx('warn'); overT = 0.6; } }
      $('warn').hidden = !over;
      S.o2 -= rate*dt;
    }
    if (zone < 0 && !diving) { diving = true; save.dives++; }
    if (zone >= 0 && diving) arriveAtStation(zone);
    if (m > save.best) { if (save.best > 30 && m > lastBestShown + 50) { lastBestShown = m; float(diver.x, diver.y - 44, 'REKOR ' + fmtM(m), '#5ad8ff'); } save.best = m; }
    if (L !== lastLayer) { if (lastLayer >= 0) toast(LAYERS[L].name, 'KAT ' + (L + 1) + ' / ' + NL + ' · ' + fmtM(LAYERS[L].top)); lastLayer = L; }

    for (const it of S.items) {
      if (it.taken || Math.abs(it.y - diver.y) > 40) continue;
      if (dist(it.x, it.y, diver.x, diver.y) < 26) {
        if (it.relic) {
          if (S.relicHeld !== false) continue;
          it.taken = true; S.relicHeld = it.L; sfx('relic'); buzz(60);
          float(it.x, it.y - 24, it.def.n + '!', it.def.c);
          msg(it.def.n + ' elinde! Bir istasyona götür.', 'var(--relic)');
        } else if (S.bag.length < gBag()) {
          it.taken = true; S.bag.push(it); sfx('pick');
          float(it.x, it.y - 18, it.def.n + ' ' + fmtMoney(it.value), it.def.c);
        } else if (save.inv.spareBag > 0) {
          save.inv.spareBag--; const add = Math.ceil(bagAt(save.lv.bag)*0.5); bagBonus += add;
          msg('Yedek çanta açıldı! +' + add + ' yer', 'var(--amber)');
        } else if (S.t - fullMsgT > 2.5) { fullMsgT = S.t; msg('Çanta dolu! Satmak için bir istasyona dön.', 'var(--amber)'); }
      }
    }
    if (S.o2 <= 0) {
      if (save.inv.spareTank > 0 && zone < 0) { save.inv.spareTank--; S.o2 = maxO2*0.6; msg('Yedek tüpe geçildi! Hemen istasyona dön.', 'var(--amber)'); sfx('warn'); buzz(120); }
      else faint();
    }
  }

  if (DG.wpn && DG.wpn.update) DG.wpn.update(dt);
  if (DG.mon && DG.mon.update) {
    const near = Math.max(1500, S.H*2);
    for (const mm of S.mons) if (Math.abs(mm.y - diver.y) < near) DG.mon.update(mm, dt);
  }
  if (S.mons.some(mm => mm.dead)) S.mons = S.mons.filter(mm => !mm.dead);
  if (DG.boss && DG.boss.update) DG.boss.update(dt);
  if (DG.fx && DG.fx.update) DG.fx.update(dt);

  bubbleT -= dt;
  if (diver.y > 4 && bubbleT <= 0) { bubbleT = rand(0.18, 0.4); bubbles.push({x:diver.x + Math.cos(diver.ang)*20*diver.flip, y:diver.y + Math.sin(diver.ang)*20 - 4, r:rand(1.5, 3.5), vy:-rand(30, 55), ph:rand(0, 6.28)}); }
  for (const b of bubbles) { b.y += b.vy*dt; b.ph += dt*4; b.x += Math.sin(b.ph)*0.4; }
  bubbles = bubbles.filter(b => b.y > 0 && b.y > diver.y - 500);
  for (const fl of floaters) { fl.t += dt; fl.y -= 26*dt; }
  floaters = floaters.filter(fl => fl.t < 1.6);

  cam.x = WORLD_W > S.W ? clamp(diver.x - S.W/2, 0, WORLD_W - S.W) : (WORLD_W - S.W)/2;
  cam.y += (Math.max(-S.H*0.3, diver.y - S.H*0.45) - cam.y)*Math.min(1, dt*6);

  updateHUD(m, L, maxO2, zone);
}
function updateHUD(m, L, maxO2, zone){
  $('hDepth').textContent = Math.round(m).toLocaleString('tr-TR');
  $('hAtm').textContent = (1 + m/10).toFixed(m < 1000 ? 1 : 0).replace('.', ',');
  const bagEl = $('hBag');
  bagEl.textContent = S.bag.length + '/' + gBag() + (S.relicHeld !== false ? ' +★' : '');
  bagEl.classList.toggle('bagfull', S.bag.length >= gBag() && S.relicHeld === false);
  bagEl.classList.toggle('relicOn', S.relicHeld !== false);
  const frac = clamp(S.o2/maxO2, 0, 1);
  $('hAir').textContent = Math.round(frac*200);
  $('hAirFill').style.width = (frac*100) + '%';
  $('hAirBox').classList.toggle('low', frac < 0.25 && zone < 0);
  $('hMoney').textContent = demo ? '₺∞ DEMO' : fmtMoney(save.money);
  $('hBest').textContent = Math.round(save.best).toLocaleString('tr-TR');
  $('hStage').textContent = 'KAT ' + (L + 1) + '/' + NL + ' · ' + LAYERS[L].name.toLocaleUpperCase('tr-TR');
  if ((S.t*4|0) !== ((S.t - S.dt)*4|0)) updateCtx();
  updateControls();
}
function updateCtx(){
  const show = S.playing && curStationZone >= 0;
  $('ctx').hidden = !show;
  if (!show) { $('shop').hidden = true; $('elev').hidden = true; }
  const n = affordableCount(), b = $('shopBadge'); b.hidden = n === 0; b.textContent = n;
  $('elevBtn').classList.toggle('ready', elevReady());
}
function updateControls(){
  const show = S.playing && diver.y > 30;
  $('controls').hidden = !show;
  if (!show) return;
  const w = WEAPONS.find(x => x.id === save.curWpn) || WEAPONS[0];
  $('wpnName').textContent = w.n.split(' ')[0].toLocaleUpperCase('tr-TR');
  const fi = DG.wpn && DG.wpn.fireInfo ? DG.wpn.fireInfo() : {frac:0};
  fireBtn.style.setProperty('--p', String(clamp(fi.frac || 0, 0, 1)));
  const dashInfo = DG.wpn && DG.wpn.skillInfo ? DG.wpn.skillInfo('dash') : {frac:0};
  $('btnDash').style.setProperty('--p', String(clamp(dashInfo.frac || 0, 0, 1)));
  for (let i = 0; i < 3; i++) {
    const b = $('btnSk' + i), id = save.equip[i];
    b.hidden = !id; if (!id) continue;
    const s = SKILLS.find(x => x.id === id), info = DG.wpn && DG.wpn.skillInfo ? DG.wpn.skillInfo(id) : {frac:0, active:false};
    b.firstChild.textContent = s.n.split(' ')[0].toLocaleUpperCase('tr-TR');
    b.style.setProperty('--p', String(clamp(info.frac || 0, 0, 1)));
    b.classList.toggle('active', !!info.active);
  }
}

// ---------- çizim ----------
function drawWalls(){
  const yStart = Math.max(0, cam.y - 20), yEnd = cam.y + S.H + 20;
  if (yEnd <= 0) return;
  const midL = layerOf((yStart + yEnd)/2), ly = LAYERS[midL];
  const w = waterAt((yStart + yEnd)/2);
  ctx.fillStyle = rgb(ly.rock.map((v, i) => v*0.6 + w[i]*0.25));
  for (const side of [0, 1]) {
    ctx.beginPath();
    const edge = side === 0 ? -cam.x - 2000 : WORLD_W - cam.x + 2000;
    ctx.moveTo(edge, yStart - cam.y);
    for (let y = yStart; y <= yEnd; y += 14) { const ww = wallW(y, side); ctx.lineTo(side === 0 ? ww - cam.x : WORLD_W - ww - cam.x, y - cam.y); }
    ctx.lineTo(edge, yEnd - cam.y); ctx.closePath(); ctx.fill();
  }
  for (let y = Math.floor(yStart/40)*40; y < yEnd; y += 40) {
    if (y < 40) continue;
    const L = layerOf(y), dec = LAYERS[L].decor, f = (y - LTOP[L])/LH(L);
    for (const side of [0, 1]) {
      const h = hash(y*0.1 + side*91); if (h < 0.5) continue;
      const ww = wallW(y, side), x = side === 0 ? ww - cam.x : WORLD_W - ww - cam.x, sy = y - cam.y, dir = side ? -1 : 1;
      if (dec === 'crystal') { ctx.fillStyle = 'rgba(180,230,255,.55)'; ctx.beginPath(); ctx.moveTo(x, sy - 8); ctx.lineTo(x + dir*(12 + h*26), sy - 2); ctx.lineTo(x, sy + 8); ctx.fill(); }
      else if (L === 0 && f < 0.6) {
        ctx.strokeStyle = 'rgba(70,150,80,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, sy);
        for (let k = 1; k <= 6; k++) ctx.lineTo(x + dir*(k*7) + Math.sin(S.t*1.5 + k*0.7 + y)*5, sy - k*9);
        ctx.stroke();
      } else if (L <= 3) {
        ctx.fillStyle = ['#ff6f7d','#ffa24a','#c66bff','#ff4f9a'][Math.floor(h*40)%4];
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + dir*(4 + k*6), sy - k*5, 6 - k, 0, 7); ctx.fill(); }
      } else if (h > 0.85) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x - dir*4, sy, 10, 14, 0, 0, 7); ctx.fill(); }
    }
  }
}
function drawLedges(){
  for (let i = 1; i < NL; i++) {
    const y = LTOP[i] - cam.y; if (y < -80 || y > S.H + 80) continue;
    const ly = LAYERS[i - 1], c = ly.rock.map(v => v*0.75);
    ctx.fillStyle = rgb(c);
    for (const side of [0, 1]) {
      const x0 = side === 0 ? -cam.x - 2000 : BOAT_X + SHAFT_HALF - cam.x;
      const x1 = side === 0 ? BOAT_X - SHAFT_HALF - cam.x : WORLD_W - cam.x + 2000;
      ctx.beginPath(); ctx.moveTo(x0, y - LEDGE_HALF);
      for (let x = x0; x <= x1; x += 24) ctx.lineTo(x, y - LEDGE_HALF + Math.sin((x + cam.x)*0.05 + i)*4);
      ctx.lineTo(x1, y + LEDGE_HALF); ctx.lineTo(x0, y + LEDGE_HALF); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(Math.max(x0, -10), y - LEDGE_HALF, Math.min(x1, S.W + 10) - Math.max(x0, -10), 3);
      ctx.fillStyle = rgb(c);
    }
  }
  const fy = WORLD_H - cam.y;
  if (fy < S.H + 40) {
    ctx.fillStyle = '#101a30'; ctx.beginPath(); ctx.moveTo(-10, S.H + 10);
    for (let x = -10; x <= S.W + 20; x += 20) { const wx = x + cam.x; ctx.lineTo(x, fy + Math.sin(wx*0.02)*6); }
    ctx.lineTo(S.W + 20, S.H + 10); ctx.closePath(); ctx.fill();
  }
}
function drawDecor(){
  for (let L = 0; L < NL; L++) {
    const by = (L === NL - 1 ? WORLD_H : LTOP[L + 1] - LEDGE_HALF) - cam.y;
    if (by < -260 || by > S.H + 60) continue;
    const dec = LAYERS[L].decor, lx = wallW(by + cam.y, 0) - cam.x, rx = WORLD_W - wallW(by + cam.y, 1) - cam.x;
    const leftMid = (lx + BOAT_X - SHAFT_HALF - cam.x)/2, rightMid = (rx + BOAT_X + SHAFT_HALF - cam.x)/2;
    ctx.save();
    switch (dec) {
      case 'sand': ctx.fillStyle = '#5a3a24'; for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(rightMid - 40 + i*24, by - 8); ctx.rotate(0.3*i - 0.5); ctx.beginPath(); ctx.ellipse(0, 0, 7, 15, 0, 0, 7); ctx.fill(); ctx.restore(); } break;
      case 'cave': ctx.fillStyle = '#1c1916'; for (const mx of [leftMid, rightMid]) for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(mx + i*60 - 26, by); ctx.lineTo(mx + i*60, by - 50 - hash(i + L)*50); ctx.lineTo(mx + i*60 + 26, by); ctx.fill(); } break;
      case 'oldwreck': case 'steelwreck': {
        ctx.fillStyle = dec === 'steelwreck' ? '#0b0e11' : '#1a120a';
        const x = leftMid - 110; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + 20, by - 60); ctx.lineTo(x + 200, by - 76); ctx.lineTo(x + 230, by); ctx.closePath(); ctx.fill();
        ctx.fillRect(x + 100, by - 150, 7, 80); break;
      }
      case 'canyon': ctx.fillStyle = '#4a2418'; for (const mx of [leftMid, rightMid]) { ctx.beginPath(); ctx.arc(mx, by, 50, Math.PI, 0); ctx.fill(); } break;
      case 'plane': ctx.fillStyle = '#20262c'; ctx.fillRect(rightMid - 90, by - 26, 180, 22); ctx.beginPath(); ctx.moveTo(rightMid - 20, by - 22); ctx.lineTo(rightMid - 70, by - 80); ctx.lineTo(rightMid - 44, by - 80); ctx.lineTo(rightMid + 30, by - 22); ctx.fill(); break;
      case 'crystal': ctx.fillStyle = 'rgba(160,220,255,.55)'; for (const mx of [leftMid, rightMid]) for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(mx + i*34 - 10, by); ctx.lineTo(mx + i*34, by - 40 - hash(i + 3)*60); ctx.lineTo(mx + i*34 + 10, by); ctx.fill(); } break;
      case 'vents': for (const mx of [leftMid, rightMid]) {
        ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.moveTo(mx - 22, by); ctx.lineTo(mx - 8, by - 80); ctx.lineTo(mx + 8, by - 80); ctx.lineTo(mx + 22, by); ctx.fill();
        for (let k = 0; k < 5; k++) { const ph = (S.t*0.6 + k*0.2 + mx*0.01) % 1; ctx.fillStyle = `rgba(60,50,50,${0.6*(1 - ph)})`; ctx.beginPath(); ctx.arc(mx + Math.sin(ph*9 + k)*10, by - 86 - ph*180, 9 + ph*24, 0, 7); ctx.fill(); }
      } break;
      case 'liner': ctx.fillStyle = '#0a0c0e'; { const x = leftMid - 150; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + 20, by - 100); ctx.lineTo(x + 300, by - 112); ctx.lineTo(x + 320, by); ctx.closePath(); ctx.fill(); for (let i = 0; i < 3; i++) ctx.fillRect(x + 60 + i*80, by - 180, 34, 70); } break;
      case 'trench': ctx.strokeStyle = 'rgba(80,160,255,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(leftMid - 60, by - 2); ctx.lineTo(leftMid, by + 3); ctx.lineTo(leftMid + 60, by - 2); ctx.stroke(); break;
      case 'atlantis':
        for (let i = 0; i < 9; i++) {
          const x = 120 + i*145 - cam.x, h = 90 + (i%3)*60;
          ctx.fillStyle = '#26365a'; ctx.fillRect(x - 12, by - h, 24, h);
          ctx.fillStyle = '#34507a'; ctx.fillRect(x - 18, by - h - 10, 36, 10);
          ctx.fillStyle = `rgba(90,220,255,${0.5 + 0.3*Math.sin(S.t*2 + i)})`; ctx.fillRect(x - 3, by - h + 20, 6, 30);
        }
        ctx.fillStyle = '#2c4270'; ctx.beginPath(); ctx.arc(BOAT_X - cam.x, by - 40, 150, Math.PI, 0); ctx.fill();
        ctx.fillStyle = `rgba(120,230,255,${0.4 + 0.2*Math.sin(S.t*1.5)})`; ctx.beginPath(); ctx.arc(BOAT_X - cam.x, by - 40, 40, Math.PI, 0); ctx.fill();
        break;
    }
    ctx.restore();
  }
}
function drawShaftAndStations(){
  const deepest = LTOP[save.tier];
  const x = BOAT_X - cam.x;
  if (save.tier > 0 && -cam.y < S.H && deepest - cam.y > 0) {
    ctx.strokeStyle = 'rgba(200,210,220,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 30, Math.max(0, -cam.y)); ctx.lineTo(x - 30, Math.min(S.H, deepest - cam.y)); ctx.moveTo(x + 30, Math.max(0, -cam.y)); ctx.lineTo(x + 30, Math.min(S.H, deepest - cam.y)); ctx.stroke();
  }
  for (let s = 1; s < NL; s++) {
    const y = LTOP[s] - cam.y; if (y < -140 || y > S.H + 80) continue;
    const built = s <= save.tier;
    if (!built) {
      ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(255,90,78,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - SHAFT_HALF, y); ctx.lineTo(x + SHAFT_HALF, y); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    ctx.fillStyle = '#3a434c'; ctx.fillRect(x - SHAFT_HALF, y + LEDGE_HALF - 10, 70, 10); ctx.fillRect(x + SHAFT_HALF - 70, y + LEDGE_HALF - 10, 70, 10);
    ctx.fillStyle = '#ffcf3a'; for (let k = 0; k < 6; k++) { ctx.fillRect(x - SHAFT_HALF + k*12, y + LEDGE_HALF - 10, 6, 3); ctx.fillRect(x + SHAFT_HALF - 70 + k*12, y + LEDGE_HALF - 10, 6, 3); }
    ctx.strokeStyle = '#8a96a3'; ctx.lineWidth = 3; ctx.strokeRect(x - 34, y - 70, 68, 70);
    ctx.fillStyle = 'rgba(30,40,52,.6)'; ctx.fillRect(x - 32, y - 68, 64, 66);
    ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(x, y - 82, 5, 0, 7); ctx.fill();
    ctx.font = '700 11px "Chakra Petch", monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf3a'; ctx.fillText('İSTASYON ' + s, x, y - 96);
    ctx.fillStyle = 'rgba(230,244,247,.8)'; ctx.fillText(fmtM(LAYERS[s].top), x, y - 110);
  }
  const ly = limitY() - cam.y;
  if (S.playing && ly > 0 && ly < S.H && limitY() < WORLD_H - 20) {
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,90,78,.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(S.W, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 10px "Chakra Petch", monospace'; ctx.fillStyle = 'rgba(255,90,78,.85)'; ctx.textAlign = 'left';
    ctx.fillText('BASINÇ SINIRI · ' + fmtM(toM(limitY())), 12, ly - 6);
  }
}

function drawShape(s, c, x, y, time, scale){
  ctx.save(); ctx.translate(x, y); if (scale) ctx.scale(scale, scale);
  ctx.fillStyle = c; ctx.strokeStyle = c;
  switch (s) {
    case 'shell': ctx.beginPath(); ctx.moveTo(0, 6); ctx.arc(0, 6, 10, Math.PI*1.1, Math.PI*1.9); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(80,50,30,.5)'; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(i*4, -3); ctx.stroke(); } break;
    case 'star': ctx.rotate(time*0.2); ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i%2 ? 4 : 10, a = i*Math.PI/5 - Math.PI/2; ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); } ctx.closePath(); ctx.fill(); break;
    case 'pearl': { const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8); g.addColorStop(0, '#fff'); g.addColorStop(1, c); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); break; }
    case 'coin': ctx.beginPath(); ctx.ellipse(0, 0, 8*Math.abs(Math.cos(time*2)) + 1.5, 8, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-1.5, -1.5, 3, 3); break;
    case 'coral': ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, -2); ctx.lineTo(-6, -9); ctx.moveTo(0, 2); ctx.lineTo(7, -6); ctx.moveTo(0, -2); ctx.lineTo(2, -10); ctx.stroke(); break;
    case 'amphora': ctx.beginPath(); ctx.moveTo(-3, -12); ctx.lineTo(3, -12); ctx.lineTo(3, -8); ctx.quadraticCurveTo(10, -4, 6, 6); ctx.lineTo(0, 13); ctx.lineTo(-6, 6); ctx.quadraticCurveTo(-10, -4, -3, -8); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-6, -7, 3, Math.PI*0.5, Math.PI*1.6); ctx.stroke(); ctx.beginPath(); ctx.arc(6, -7, 3, -Math.PI*0.6, Math.PI*0.5); ctx.stroke(); break;
    case 'ingot': ctx.beginPath(); ctx.moveTo(-11, 5); ctx.lineTo(-7, -5); ctx.lineTo(7, -5); ctx.lineTo(11, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-6, -4, 12, 2); break;
    case 'gem': ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, -3); ctx.lineTo(0, 10); ctx.lineTo(-8, -3); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(3, -3); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill(); break;
    case 'diamond': ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(-5, -9); ctx.lineTo(5, -9); ctx.lineTo(10, -3); ctx.lineTo(0, 11); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(10, -3); ctx.moveTo(-3, -9); ctx.lineTo(0, 11); ctx.lineTo(3, -9); ctx.stroke(); break;
    case 'crystal': for (const [dx, h, r] of [[-5, 12, -0.3], [0, 16, 0], [5, 11, 0.3]]) { ctx.save(); ctx.rotate(r); ctx.beginPath(); ctx.moveTo(dx - 3, 6); ctx.lineTo(dx - 3, 6 - h + 4); ctx.lineTo(dx, 6 - h); ctx.lineTo(dx + 3, 6 - h + 4); ctx.lineTo(dx + 3, 6); ctx.closePath(); ctx.fill(); ctx.restore(); } break;
    case 'compass': ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#1b2430'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.rotate(Math.sin(time*1.3)*0.8); ctx.fillStyle = '#ff5a4e'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(2, 0); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e6f4f7'; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(2, 0); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fill(); break;
    case 'watch': ctx.beginPath(); ctx.arc(0, 1, 9, 0, 7); ctx.fill(); ctx.fillRect(-2, -12, 4, 4); ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.arc(0, 1, 6.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(3, -1); ctx.moveTo(0, 1); ctx.lineTo(-1, 5); ctx.stroke(); break;
    case 'statue': ctx.beginPath(); ctx.arc(0, -9, 4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(4, -5); ctx.lineTo(6, 10); ctx.lineTo(-6, 10); ctx.closePath(); ctx.fill(); ctx.fillRect(-8, 10, 16, 3); break;
    case 'tablet': ctx.beginPath(); ctx.moveTo(-8, 11); ctx.lineTo(-8, -6); ctx.quadraticCurveTo(0, -14, 8, -6); ctx.lineTo(8, 11); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-5, -2 + i*4); ctx.lineTo(5, -2 + i*4); ctx.stroke(); } break;
    case 'book': ctx.fillRect(-9, -7, 18, 14); ctx.fillStyle = 'rgba(255,255,240,.7)'; ctx.fillRect(-7, -5, 14, 10); ctx.fillStyle = c; ctx.fillRect(-1, -7, 2, 14); break;
    case 'chest': ctx.fillRect(-11, -3, 22, 12); ctx.beginPath(); ctx.moveTo(-11, -3); ctx.quadraticCurveTo(0, -14, 11, -3); ctx.fill(); ctx.fillStyle = '#ffcf3a'; ctx.fillRect(-2, -3, 4, 6); ctx.fillRect(-11, 1, 22, 1.5); break;
    case 'bottle': ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(-3, -12); ctx.lineTo(3, -12); ctx.lineTo(3, -6); ctx.lineTo(6, -2); ctx.lineTo(6, 11); ctx.lineTo(-6, 11); ctx.lineTo(-6, -2); ctx.lineTo(-3, -6); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#f4e8c8'; ctx.fillRect(-3, 0, 6, 7); break;
    case 'crown': ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(-10, -6); ctx.lineTo(-5, 0); ctx.lineTo(0, -9); ctx.lineTo(5, 0); ctx.lineTo(10, -6); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff5a6e'; ctx.beginPath(); ctx.arc(0, 2, 2, 0, 7); ctx.fill(); break;
    case 'gear': ctx.rotate(time*0.6); ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i*Math.PI/8, r = i%2 ? 8 : 11; ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); } ctx.closePath(); ctx.fill(); ctx.fillStyle = '#1b2430'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fill(); break;
    case 'eye': ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#1a0d00'; ctx.beginPath(); ctx.ellipse(Math.sin(time*0.9)*3, 0, 2.5, 7, 0, 0, 7); ctx.fill(); break;
    case 'spear': ctx.fillRect(-1.5, -2, 3, 14); for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(dx - 2.5, -2); ctx.lineTo(dx, -13 - (dx ? 0 : 3)); ctx.lineTo(dx + 2.5, -2); ctx.fill(); } ctx.fillRect(-7, -3, 14, 2.5); break;
    case 'heart': { const p = 1 + Math.sin(time*3)*0.08; ctx.scale(p*1.6, p*1.6); const g = ctx.createRadialGradient(0, -2, 1, 0, 0, 12); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, c); g.addColorStop(1, c === '#5ad8ff' ? '#1a8fd0' : '#c08020'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 11); ctx.bezierCurveTo(-14, 0, -9, -12, 0, -5); ctx.bezierCurveTo(9, -12, 14, 0, 0, 11); ctx.fill(); break; }
  }
  ctx.restore();
}
DG.U.drawShape = drawShape;
function drawItems(){
  for (const it of S.items) {
    if (it.taken) continue;
    const sy = it.y - cam.y; if (sy < -40 || sy > S.H + 40) continue;
    const sx = it.x - cam.x; if (sx < -40 || sx > S.W + 40) continue;
    drawShape(it.def.s, it.def.c, sx, sy + Math.sin(S.t*2 + it.ph)*2, S.t + it.ph, it.relic ? 1.6 : 1);
  }
}
function diverStyle(){
  const i = save.tier;
  if (i <= 1) return {suit:'#16212d', accent:'#ffb03a', tank:'#ffd04a', tanks:1, helm:'mask', bulk:1};
  if (i <= 3) return {suit:'#1d2f4a', accent:'#5ad8ff', tank:'#ffd04a', tanks:2, helm:'hood', bulk:1.05};
  if (i <= 6) return {suit:'#3a4450', accent:'#ff7a2a', tank:'#c8d0d8', tanks:0, helm:'hood', bulk:1.1, scooter:i >= 5};
  if (i <= 8) return {suit:'#2a2f36', accent:'#ffcf3a', tank:'#6b7783', tanks:0, helm:'dome', bulk:1.25, scooter:true};
  return {suit:'#e0b020', accent:'#3a434c', tank:'#3a434c', tanks:0, helm:'dome', bulk:1.45, scooter:true, ads:true};
}
function rr(x, y, w, h, r){ ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function drawDiver(){
  const x = diver.x - cam.x, y = diver.y - cam.y, st = diverStyle();
  if (S.lifting) {
    ctx.strokeStyle = 'rgba(230,240,245,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y - 46); ctx.stroke();
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.ellipse(x, y - 60, 13, 17, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(x - 4, y - 66, 3, 6, 0, 0, 7); ctx.fill();
  }
  if (DG.wpn && DG.wpn.drawUnder) DG.wpn.drawUnder(ctx);
  ctx.save(); ctx.translate(x, y); ctx.scale(diver.flip*st.bulk, st.bulk); ctx.rotate(diver.ang);
  if (diver.inv > 0 && Math.floor(diver.inv*12)%2) ctx.globalAlpha = 0.45;
  if (DG.wpn && DG.wpn.camoActive && DG.wpn.camoActive()) ctx.globalAlpha = 0.35;
  const kick = Math.sin(diver.kick*3)*0.45;
  if (!st.ads) { ctx.fillStyle = st.accent; for (const s of [-1, 1]) { ctx.save(); ctx.translate(-22, s*2); ctx.rotate(kick*s); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -6); ctx.lineTo(-14, 6); ctx.closePath(); ctx.fill(); ctx.restore(); } }
  ctx.fillStyle = st.suit;
  if (st.ads) { rr(-24, -5, 18, 10, 5); ctx.fill(); ctx.fillStyle = '#3a434c'; for (const k of [-18, -10]) { ctx.beginPath(); ctx.arc(k, 0, 4, 0, 7); ctx.fill(); } ctx.fillStyle = st.suit; }
  else ctx.fillRect(-23, -3.5, 16, 7);
  rr(-9, -6.5, 24, 13, 6); ctx.fill();
  ctx.fillStyle = st.accent; ctx.fillRect(-6, -1, 18, 2);
  if (st.tanks === 1) { ctx.fillStyle = st.tank; rr(-7, -12, 18, 7, 3.5); ctx.fill(); ctx.fillStyle = '#6b7783'; ctx.fillRect(11, -10.5, 3, 4); }
  else if (st.tanks === 2) { ctx.fillStyle = st.tank; rr(-7, -14, 18, 5, 2.5); ctx.fill(); rr(-7, -10, 18, 5, 2.5); ctx.fill(); }
  else { ctx.fillStyle = st.accent; rr(-6, -12, 14, 7, 2); ctx.fill(); ctx.fillStyle = st.tank; rr(-8, -15, 10, 4, 2); ctx.fill(); }
  if (st.scooter) { ctx.fillStyle = '#2b2f36'; rr(16, 2, 18, 9, 4); ctx.fill(); ctx.fillStyle = '#ffcf3a'; ctx.fillRect(32, 3, 3, 7); }
  else { ctx.strokeStyle = st.suit; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(8, 3); ctx.lineTo(18 + Math.sin(diver.kick*2)*2, 7); ctx.stroke(); }
  if (st.helm === 'dome') { ctx.fillStyle = st.ads ? '#c89a10' : '#4a525c'; ctx.beginPath(); ctx.arc(19, -1, 8.5, 0, 7); ctx.fill(); ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.arc(22, -1, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(23, -3, 1.5, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = st.helm === 'hood' ? '#0f1822' : '#22303d'; ctx.beginPath(); ctx.arc(19, -1, 6.5, 0, 7); ctx.fill(); ctx.fillStyle = '#7fe0ff'; rr(20, -5, 6, 5, 2); ctx.fill(); }
  ctx.restore();
  if (S.relicHeld !== false) { const r = LAYERS[S.relicHeld].relic; drawShape(r.s, r.c, x, y - (S.lifting ? 90 : 30), S.t, 0.9); }
}
function drawBoat(){
  const x = BOAT_X - cam.x, y = -cam.y;
  if (y < -160 || y > S.H + 60) return;
  const sh = SHIPS[save.tier], L = sh.len, bob = Math.sin(S.t*1.4)*2;
  ctx.save(); ctx.translate(x, y + bob);
  if (DG.boss && DG.boss.boatTint) DG.boss.boatTint(ctx);
  if (sh.sails) { ctx.fillStyle = '#5a4632'; ctx.fillRect(-20, -110, 3, 92); ctx.fillRect(30, -90, 3, 72); ctx.fillStyle = '#f2ece0'; ctx.beginPath(); ctx.moveTo(-17, -106); ctx.lineTo(24, -26); ctx.lineTo(-17, -26); ctx.fill(); ctx.beginPath(); ctx.moveTo(33, -86); ctx.lineTo(62, -26); ctx.lineTo(33, -26); ctx.fill(); }
  if (sh.mast) { ctx.fillStyle = '#ccc'; ctx.fillRect(18, -70, 3, 50); ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(19.5, -72, 3, 0, 7); ctx.fill(); }
  if (sh.derrick) { ctx.strokeStyle = '#3a434c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-30, -18); ctx.lineTo(-12, -120); ctx.lineTo(6, -18); ctx.moveTo(-26, -50); ctx.lineTo(2, -50); ctx.moveTo(-22, -80); ctx.lineTo(-2, -80); ctx.stroke(); }
  for (let c = 0; c < sh.cabin; c++) { const w = 46 - c*10, cx = -L*0.35 + c*6; ctx.fillStyle = sh.top; ctx.fillRect(cx, -40 - c*16, w, 22); ctx.fillStyle = '#0b3d5c'; for (let k = 0; k < 3; k++) ctx.fillRect(cx + 5 + k*(w - 10)/3, -35 - c*16, 7, 7); }
  if (sh.funnel) { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(10, -76, 16, 40); ctx.fillStyle = '#c0392b'; ctx.fillRect(10, -76, 16, 8); }
  if (sh.radar) { ctx.fillStyle = '#f2ece0'; ctx.beginPath(); ctx.arc(-L*0.25, -82, 9, 0, 7); ctx.fill(); ctx.fillRect(-L*0.25 - 1.5, -74, 3, 18); }
  if (sh.crane || save.tier > 0) {
    ctx.strokeStyle = sh.crane === 2 ? '#ffcf3a' : '#e0662f'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(L*0.1, -18); ctx.lineTo(L*0.1 + 6, -64); ctx.lineTo(-2, -64); ctx.stroke();
  }
  if (sh.heli) { ctx.fillStyle = '#2a3a4a'; ctx.fillRect(L*0.45, -24, 48, 6); ctx.font = '700 9px "Chakra Petch", monospace'; ctx.fillStyle = '#ffcf3a'; ctx.textAlign = 'center'; ctx.fillText('H', L*0.45 + 24, -26); }
  if (sh.flag) { ctx.fillStyle = '#ccc'; ctx.fillRect(L*0.5, -62, 2, 44); ctx.fillStyle = '#d62828'; ctx.fillRect(L*0.5 + 2, -62, 22, 14); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(L*0.5 + 2, -62); ctx.lineTo(L*0.5 + 24, -48); ctx.stroke(); }
  ctx.fillStyle = sh.hull;
  ctx.beginPath(); ctx.moveTo(-L, -18); ctx.lineTo(L*1.05, -18); ctx.lineTo(L*0.82, 8); ctx.lineTo(-L*0.85, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = sh.top; ctx.fillRect(-L + 6, -16, L*2 - 6, 3);
  ctx.font = '700 10px "Chakra Petch", monospace'; ctx.fillStyle = save.tier === 3 || save.tier === 4 ? '#0b3d5c' : '#f2ece0'; ctx.textAlign = 'center';
  ctx.fillText('DALGIÇ', 0, 1);
  ctx.restore();
}
function drawSurfaceLine(){
  const y = -cam.y; if (y < -10 || y > S.H + 10) return;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.moveTo(0, y - 2);
  for (let x = 0; x <= S.W + 10; x += 10) ctx.lineTo(x, y + Math.sin((x + cam.x)*0.05 + S.t*2)*2);
  ctx.lineTo(S.W + 10, y + 3); ctx.lineTo(0, y + 3); ctx.closePath(); ctx.fill();
}
function drawDarkness(){
  const alpha = (DG.boss && DG.boss.active && DG.boss.active()) ? 0 : darkAtM(toM(diver.y));
  S.darkAlpha = alpha;
  if (alpha <= 0.01) return 0;
  const W = S.W, H = S.H;
  dctx.setTransform(S.DPR, 0, 0, S.DPR, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = `rgba(1,4,10,${alpha})`; dctx.fillRect(0, 0, W, H);
  if (cam.y < 0) dctx.clearRect(0, 0, W, -cam.y);
  dctx.globalCompositeOperation = 'destination-out';
  const hole = (cx, cy, rad, k) => {
    if (cy < -rad || cy > H + rad || cx < -rad || cx > W + rad || rad <= 0) return;
    const g = dctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(0.55, `rgba(0,0,0,${k*0.8})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g; dctx.beginPath(); dctx.arc(cx, cy, rad, 0, 7); dctx.fill();
  };
  const r = gLight(), x = diver.x - cam.x, y = diver.y - cam.y;
  hole(x, y, r, 1);
  hole(x + Math.cos(diver.ang)*diver.flip*r*0.7, y + Math.sin(diver.ang)*r*0.7, r*0.85, 0.9);
  for (let s = 1; s <= save.tier; s++) hole(BOAT_X - cam.x, LTOP[s] - 40 - cam.y, 300, 0.9);
  for (const g of S.glowSpots) hole(g.x - cam.x, g.y - cam.y, g.r, 0.75);
  for (const mod of [DG.mon, DG.wpn, DG.boss]) if (mod && mod.lights) for (const l of mod.lights()) hole(l.x - cam.x, l.y - cam.y, l.r, l.k == null ? 0.8 : l.k);
  ctx.drawImage(dk, 0, 0, W, H);
  return alpha;
}
function drawItemGlows(alpha){
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const sonar = DG.wpn && DG.wpn.sonarActive && DG.wpn.sonarActive();
  for (const it of S.items) {
    if (it.taken) continue;
    const sy = it.y - cam.y; if (sy < -40 || sy > S.H + 40) continue;
    const sx = it.x - cam.x; if (sx < -40 || sx > S.W + 40) continue;
    if (it.relic) {
      const tw = 0.5 + 0.5*Math.sin(S.t*3), g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60);
      g.addColorStop(0, `rgba(160,230,255,${0.45 + 0.25*tw})`); g.addColorStop(1, 'rgba(90,216,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, 7); ctx.fill();
    } else if (sonar) {
      ctx.strokeStyle = `rgba(90,216,255,${0.5 + 0.3*Math.sin(S.t*6)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 7); ctx.stroke();
    } else if (it.tier >= 1 && alpha > 0.2) {
      ctx.fillStyle = `rgba(255,235,190,${0.3*(0.5 + 0.5*Math.sin(S.t*3 + it.ph*5))*alpha})`;
      ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, 7); ctx.fill();
    }
  }
  for (const g of S.glowSpots) {
    const sx = g.x - cam.x, sy = g.y - cam.y; if (sy < -200 || sy > S.H + 200) continue;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, g.r);
    gr.addColorStop(0, `rgba(${g.c},${0.22 + 0.08*Math.sin(S.t*2 + g.x)})`); gr.addColorStop(1, `rgba(${g.c},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, g.r, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawBubbles(){
  ctx.strokeStyle = 'rgba(220,245,255,.7)'; ctx.lineWidth = 1;
  for (const b of bubbles) { const sy = b.y - cam.y; if (sy < -10 || sy > S.H + 10) continue; ctx.beginPath(); ctx.arc(b.x - cam.x, sy, b.r, 0, 7); ctx.stroke(); }
}
function drawFloaters(){
  ctx.textAlign = 'center'; ctx.font = '700 13px "Chakra Petch", monospace';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(1.6 - f.t, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(f.text, f.x - cam.x + 1, f.y - cam.y + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x - cam.x, f.y - cam.y);
  }
  ctx.globalAlpha = 1;
}
function drawPointers(){
  ctx.font = '700 12px "Chakra Petch", monospace';
  if (S.playing && diver.y > 60 && curStationZone < 0) {
    const s = stationAbove(diver.y), ty = s === 0 ? 0 : LTOP[s];
    if (ty - cam.y < 0) { ctx.fillStyle = '#ffcf3a'; ctx.textAlign = 'center'; ctx.fillText('▲ ' + (s === 0 ? 'TEKNE' : 'İSTASYON ' + s) + ' · ' + fmtM(toM(diver.y) - toM(ty)), S.W/2, 120); }
  }
  if (diver.y < 60) {
    const bx = BOAT_X - cam.x;
    if (bx < 20 || bx > S.W - 20) { const left = bx < 0; ctx.fillStyle = '#ffb03a'; ctx.textAlign = left ? 'left' : 'right'; ctx.fillText(left ? '◀ TEKNE' : 'TEKNE ▶', left ? 12 : S.W - 12, Math.max(150, -cam.y - 24)); }
  }
  const sonar = DG.wpn && DG.wpn.sonarActive && DG.wpn.sonarActive();
  if (S.playing && S.relicHeld === false) {
    const r = S.items.find(i => i.relic && !i.taken && i.L === layerOf(diver.y));
    if (r && (sonar || dist(r.x, r.y, diver.x, diver.y) < 900)) {
      const sx = r.x - cam.x, sy = r.y - cam.y;
      if (sx < 20 || sx > S.W - 20 || sy < 20 || sy > S.H - 20) {
        const a = Math.atan2(sy - S.H/2, sx - S.W/2), px = S.W/2 + Math.cos(a)*Math.min(S.W, S.H)*0.38, py = S.H/2 + Math.sin(a)*Math.min(S.W, S.H)*0.38;
        ctx.fillStyle = '#5ad8ff'; ctx.textAlign = 'center'; ctx.fillText('ESER', px, py - 10);
        ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
  }
}
function drawJoystick(){
  if (!joy.active || !S.playing) return;
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy, L = Math.hypot(dx, dy), k = L > 60 ? 60/L : 1;
  ctx.save();
  ctx.strokeStyle = 'rgba(230,244,247,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 60, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(230,244,247,.08)'; ctx.fill();
  ctx.fillStyle = 'rgba(255,176,58,.75)'; ctx.beginPath(); ctx.arc(joy.ox + dx*k, joy.oy + dy*k, 22, 0, 7); ctx.fill();
  ctx.restore();
}
function drawVignette(){
  const over = S.playing && diver.y > limitY() + 8, frac = S.o2/gTank();
  let a = 0;
  if (over) a = 0.35 + 0.15*Math.sin(S.t*10);
  if (hurtT > 0) a = Math.max(a, hurtT);
  if (S.playing && frac < 0.25 && curStationZone < 0) a = Math.max(a, (0.25 - frac)*1.6);
  if (a > 0) {
    const g = ctx.createRadialGradient(S.W/2, S.H/2, Math.min(S.W, S.H)*0.3, S.W/2, S.H/2, Math.max(S.W, S.H)*0.75);
    g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, `rgba(255,40,30,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.H);
  }
  if (S.inkT > 0) { ctx.fillStyle = `rgba(4,2,8,${Math.min(0.88, S.inkT/3.5*0.95)})`; ctx.fillRect(0, 0, S.W, S.H); }
}
function drawFallbackBack(){
  const surf = -cam.y;
  if (surf > 0) { const g = ctx.createLinearGradient(0, 0, 0, surf); g.addColorStop(0, '#7cc6e6'); g.addColorStop(1, '#d6eff7'); ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, surf); }
  const y0 = Math.max(0, surf), g = ctx.createLinearGradient(0, y0, 0, S.H);
  g.addColorStop(0, rgb(waterAt(Math.max(0, cam.y)))); g.addColorStop(1, rgb(waterAt(cam.y + S.H)));
  ctx.fillStyle = g; ctx.fillRect(0, y0, S.W, S.H - y0);
}
function render(){
  ctx.setTransform(S.DPR, 0, 0, S.DPR, 0, 0);
  const shake = (shakeT > 0 ? shakeT*15 : 0) + (DG.fx && DG.fx.shakeAmount ? DG.fx.shakeAmount() : 0);
  if (shake > 0 && !reduceMotion) ctx.translate(rand(-1, 1)*shake, rand(-1, 1)*shake);
  if (DG.fx && DG.fx.drawBack) DG.fx.drawBack(ctx); else drawFallbackBack();
  drawWalls();
  drawLedges();
  drawDecor();
  drawShaftAndStations();
  drawItems();
  if (DG.mon && DG.mon.draw) for (const m of S.mons) { const sy = m.y - cam.y; if (sy > -220 && sy < S.H + 220) DG.mon.draw(ctx, m); }
  if (DG.boss && DG.boss.draw) DG.boss.draw(ctx);
  drawBubbles();
  if (DG.wpn && DG.wpn.draw) DG.wpn.draw(ctx);
  drawDiver();
  if (DG.fx && DG.fx.drawMid) DG.fx.drawMid(ctx);
  const alpha = drawDarkness();
  drawItemGlows(alpha);
  if (DG.mon && DG.mon.drawGlow) for (const m of S.mons) { const sy = m.y - cam.y; if (sy > -220 && sy < S.H + 220) DG.mon.drawGlow(ctx, m, alpha); }
  if (DG.wpn && DG.wpn.drawGlow) DG.wpn.drawGlow(ctx, alpha);
  if (DG.boss && DG.boss.drawGlow) DG.boss.drawGlow(ctx, alpha);
  drawBoat();
  drawSurfaceLine();
  if (DG.fx && DG.fx.drawFront) DG.fx.drawFront(ctx);
  drawFloaters();
  drawPointers();
  ctx.setTransform(S.DPR, 0, 0, S.DPR, 0, 0);
  drawVignette();
  if (DG.fx && DG.fx.drawScreen) DG.fx.drawScreen(ctx);
  drawJoystick();
}

// ---------- başlangıç ----------
function setup(){
  mods = relicMods();
  S.bag = []; bagBonus = 0; S.relicHeld = false; diving = false; S.lifting = false;
  const p = stationPos(save.station);
  diver.x = p.x; diver.y = save.station === 0 ? 0 : p.y - 50; diver.vx = diver.vy = 0;
  generate(); S.o2 = gTank();
  cam.y = diver.y - S.H*0.45; lastLayer = layerOf(diver.y);
  $('muteBtn').textContent = save.muted ? 'SES KAPALI' : 'SES AÇIK';
  if (DG.boss && DG.boss.reset) DG.boss.reset();
}
let last = performance.now();
function frame(now){
  const dt = Math.min(0.05, (now - last)/1000); last = now;
  try { update(dt); render(); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
function start(data){
  if (data && data.save && data.save.v === 3) mergeSave(data.save); else load();
  resize(); setup(); syncDemoBtn();
  if (data && data.playing) { $('intro').hidden = true; S.playing = true; }
  requestAnimationFrame(t0 => { last = t0; requestAnimationFrame(frame); });
}
window.claude?.hot?.snapshot?.(() => ({save:JSON.parse(JSON.stringify(save)), playing:S.playing}));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
