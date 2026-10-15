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
// Kat yüksekliği (px): oran 1 / 1,5 / 2, sonra her kat +0,25 (20 m, 30 m, 40 m, 45 m, 50 m ... gibi). Kat 1: 3.900, kat 11: 15.600.
const LH = i => Math.round(3900*(i < 3 ? 1 + 0.5*i : 2 + 0.25*(i - 2)));
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
// Duvar ve raf boyası (taklitçi ahtapot kamuflajı da bunu kullanır).
const wallColor = y => { const ly = LAYERS[layerOf(y)], w = waterAt(y); return ly.rock.map((v, i) => v*0.6 + w[i]*0.25); };
const ledgeColor = i => LAYERS[Math.max(0, i - 1)].rock.map(v => v*0.75);
const stationPos = s => s === 0 ? {x:BOAT_X, y:0} : {x:BOAT_X, y:LTOP[s]};
// Tohumlu rastgele (eser yeri ve canavar listeleri her açılışta aynı olsun).
function seeded(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }

// ---------- durum ----------
function defaultSave(){
  return {v:3, money:0, tier:0, lv:{tank:0,speed:0,bag:0,light:0,suit:0,armor:0},
    wpn:{spear:0}, curWpn:'spear', skills:{dash:0}, equip:[], inv:{spareTank:0,spareBag:0},
    relics:[], station:0, best:0, dives:0, kills:0, bossDone:false, endSeen:false, muted:false, earned:0, hints:{}, ctrl:1, ng:0,
    killed:{}, cleared:[],   // killed[kat] = öldürülen liste sırası (m.rid) dizisi; cleared = temizlenen katlar
    taken:{},                // taken[kat] = satılmış hazinelerin sıra numaraları (bir daha çıkmaz)
    secrets:[],              // gizemi bulunan katlar
    playT:0,                 // toplam oynama süresi (sn)
    signal:false, doorOpened:false, teaserSeen:false};   // finalden sonra dipteki gizli kapı: sinyal, açıldı mı, fragman izlendi mi
}
const save = defaultSave();
const diver = {x:BOAT_X, y:0, vx:0, vy:0, ang:0, flip:1, kick:0, inv:0};
const cam = {x:0, y:0};
const S = DG.S = {save, diver, cam, W:0, H:0, DPR:1, t:0, dt:0, items:[], mons:[], playing:false, lifting:false, riding:false,
  input:{fire:false, mx:0, my:0}, worldH:WORLD_H, hazards:[], darkAlpha:0, glowSpots:[], relicHeld:false, bag:[], o2:30, slowT:0, inkT:0};
let rosterN = [], killDirty = false, lastSaveT = 0;
let mods = null, bagBonus = 0, diving = false, hurtT = 0, shakeT = 0, fullMsgT = 0, overT = 0, curStationZone = -1, retWarned = false, shownMoney = 0;
// Kamera ofsetleri: hareket yönüne bakış (camL*) ve final hücumunda canavarın kafasına yaslanma (lean*).
let camLX = 0, camLY = 0, leanX = 0, leanY = 0;
let floaters = [], bubbles = [], bubbleT = 0, lastLayer = -1, lastBestShown = 0, hudBottom = 120;
const keys = new Set();

// ---------- tuval ----------
const elc = {};
const $ = id => { let e = elc[id]; if (!e || !e.isConnected) e = elc[id] = document.getElementById(id); return e; };
// Her karede değişmeyen DOM'a yazma: telefonda gereksiz stil/yerleşim hesabı demek.
const domMemo = new Map();
const memo = (key, v) => domMemo.get(key) === v ? false : (domMemo.set(key, v), true);
const setTxt = (el, v) => { v = String(v); if (memo(el.id + ':t', v)) el.textContent = v; };
const setHid = (el, h) => { if (!memo(el.id + ':h', h)) return false; el.hidden = h; return true; };
const setSty = (el, prop, v) => { if (memo(el.id + ':' + prop, v)) el.style.setProperty(prop, v); };
document.documentElement.lang = 'tr';
const cv = $('sea'), ctx = cv.getContext('2d');
// Karanlık katmanı yumuşak degradelerden oluşur: yarım çözünürlükte çizip büyütmek görünmez ama dolum maliyetini 1/16'ya indirir.
const DK_SCALE = 0.5;
const dk = document.createElement('canvas'), dctx = dk.getContext('2d');
function resize(){
  S.DPR = Math.min(2, window.devicePixelRatio || 1);
  S.W = innerWidth; S.H = innerHeight;
  cv.width = Math.round(S.W*S.DPR); cv.height = Math.round(S.H*S.DPR);
  dk.width = Math.ceil(S.W*DK_SCALE); dk.height = Math.ceil(S.H*DK_SCALE);
}
addEventListener('resize', () => { resize(); hudBottom = $('hud').getBoundingClientRect().bottom; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { persist(); for (const e of [mus.cur, ...mus.old]) if (e) e.pause(); if (actx && actx.suspend) actx.suspend().catch(() => {}); }
  else { if (mus.cur && mus.key) mus.cur.play().catch(() => {}); if (actx && actx.resume) actx.resume().catch(() => {}); }
});
addEventListener('pagehide', () => persist());
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- kayıt, kaptanlar (profiller) ve demo ----------
// Her kaptanın kendi kaydı: dalgic3.p.<id> (gerçek oyun) ve dalgic3.p.<id>.demo (kendi demo kaydı). Dizin dalgic3.profiles
// ([{id, name, tier, money, best, won, door, last}]; liste ekranı kayıtları açmadan bunu okur), etkin kaptan dalgic3.active.
// Eski tek kayıt (dalgic-save-v3 ve -demo) ilk oluşturulan kaptana bir kez aktarılır (dalgic3.migrated); eski anahtarlar yedek kalır.
const LEGACY_KEY = 'dalgic-save-v3', LEGACY_DEMO_KEY = 'dalgic-save-v3-demo', DEMO_FLAG = 'dalgic-demo';
const P_INDEX = 'dalgic3.profiles', P_ACTIVE = 'dalgic3.active', P_MIGRATED = 'dalgic3.migrated', pKey = id => 'dalgic3.p.' + id;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
// Cihaz ayarları (bütün kaptanlar için ortak): müzik ve efekt seviyesi, titreşim. Ses aç/kapa kaptanın kaydında (save.muted).
const SET_KEY = 'dalgic3.settings', SET = {music:0.8, sfx:1, vib:true};
try { const o = JSON.parse(lsGet(SET_KEY) || '{}'); if (o && typeof o === 'object') { if (o.music >= 0 && o.music <= 1) SET.music = +o.music; if (o.sfx >= 0 && o.sfx <= 1) SET.sfx = +o.sfx; if (typeof o.vib === 'boolean') SET.vib = o.vib; } } catch (e) {}
const saveSet = () => lsSet(SET_KEY, JSON.stringify(SET));
let profiles = [];
try { const a = JSON.parse(lsGet(P_INDEX) || '[]'); if (Array.isArray(a)) profiles = a.filter(p => p && typeof p.id === 'string' && /^[a-z0-9]{1,24}$/.test(p.id) && typeof p.name === 'string' && p.name); } catch (e) {}
const byRecent = () => [...profiles].sort((a, b) => (b.last || 0) - (a.last || 0));
let activeId = lsGet(P_ACTIVE);
if (!profiles.some(p => p.id === activeId)) activeId = profiles.length ? byRecent()[0].id : null;
const prof = () => profiles.find(p => p.id === activeId) || null;
const persistIndex = () => lsSet(P_INDEX, JSON.stringify(profiles));
// Sınırsız para (demo) sadece geliştirici modunda: adresin sonuna #dev eklenince. Oyuncu hep gerçek ekonomiyle oynar.
const DEV = location.hash === '#dev';
// Gizli kod: "gmbehzad" adlı kaptan sınırsız parayla oynar (kendi ayrı kaydı).
const gm = () => { const p = prof(); return !!p && p.name.toLocaleLowerCase('tr-TR') === 'gmbehzad'; };
const calcDemo = () => (DEV && lsGet(DEMO_FLAG) === '1') || gm();
let demo = calcDemo();
// Kaptan yokken (ilk açılış) aktarılmamış eski kayıt okunur ki giriş "Devam et" desin; ama hiçbir şey yazılmaz.
const saveKey = () => activeId ? pKey(activeId) + (demo ? '.demo' : '') : lsGet(P_MIGRATED) ? null : (demo ? LEGACY_DEMO_KEY : LEGACY_KEY);
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
  save.relics = Array.isArray(s.relics) ? [...new Set(s.relics.filter(i => Number.isInteger(i) && i >= 0 && i < NL))] : [];
  for (const k of ['money', 'best', 'dives', 'kills', 'earned']) save[k] = Math.max(0, +save[k] || 0);
  for (const k in save.wpn) { if (!WEAPONS.some(w => w.id === k)) delete save.wpn[k]; else save.wpn[k] = clamp(save.wpn[k]|0, 0, 3); }
  for (const k in save.skills) { if (!SKILLS.some(w => w.id === k)) delete save.skills[k]; else save.skills[k] = clamp(save.skills[k]|0, 0, 2); }
  for (const k of Object.keys(CONS)) save.inv[k] = clamp(save.inv[k]|0, 0, CONS[k].max);
  save.tier = clamp(save.tier|0, 0, NL - 1);
  save.station = clamp(save.station|0, 0, save.tier);
  for (const k of TRACKS) save.lv[k] = clamp(save.lv[k]|0, 0, 3);
  save.ctrl = save.ctrl === 2 ? 2 : 1;
  save.ng = Math.max(0, save.ng|0);
  // Eski kayıtlarda canavar listesi yok: hepsi dolu başlar.
  save.killed = {};
  if (s.killed && typeof s.killed === 'object') for (const k in s.killed) { const L = k|0, a = s.killed[k]; if (L >= 0 && L < NL && Array.isArray(a)) save.killed[L] = [...new Set(a.filter(n => Number.isInteger(n) && n >= 0))]; }
  save.cleared = Array.isArray(s.cleared) ? [...new Set(s.cleared.filter(i => i >= 0 && i < NL))] : [];
  save.secrets = Array.isArray(s.secrets) ? [...new Set(s.secrets.filter(i => Number.isInteger(i) && i >= 0 && i < NL))] : [];
  save.playT = Math.max(0, +s.playT || 0);
  save.taken = {};
  if (s.taken && typeof s.taken === 'object') for (const k in s.taken) { const L = k|0, a = s.taken[k]; if (L >= 0 && L < NL && Array.isArray(a)) save.taken[L] = [...new Set(a.filter(n => Number.isInteger(n) && n >= 0))]; }
  if (!WEAPONS.some(w => w.id === save.curWpn && save.wpn[w.id] != null)) save.curWpn = 'spear';
  // Kapıdan önceki kayıtlar: finali yenmiş olan sinyali hemen alır.
  if (s.signal == null && save.bossDone) save.signal = true;
  save.signal = !!save.signal; save.doorOpened = !!save.doorOpened; save.teaserSeen = !!save.teaserSeen;
}
function load(){
  const k = saveKey(); if (!k) return;
  try { const s = JSON.parse(lsGet(k) || 'null'); if (s && s.v === 3) mergeSave(s); } catch (e) {}
}
function persist(){
  if (!activeId) return;
  lsSet(saveKey(), JSON.stringify(save));
  const p = prof(); if (!p) return;
  let ch = false;
  if (!demo) {
    const t = save.tier, m = Math.floor(save.money), b = Math.round(save.best);
    if (p.tier !== t || p.money !== m || p.best !== b) { p.tier = t; p.money = m; p.best = b; ch = true; }
    if (save.bossDone && !p.won) { p.won = true; ch = true; }
  }
  if (save.teaserSeen && !p.door) { p.door = true; ch = true; }
  if (S.playing && Date.now() - (p.last || 0) > 30000) { p.last = Date.now(); ch = true; }
  if (ch) persistIndex();
}
// ---------- kaptan işlemleri ----------
const cleanName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
const nameKey = s => s.toLocaleLowerCase('tr-TR');
// Yeni kaptan sıfırdan başlar; ilk kaptan eski tek kaydı devralır. Dönüş {p} ya da {err}.
function createProfile(raw, fallback){
  const name = cleanName(raw) || fallback || '';
  if (!name) return {err:'Bir ad yaz.'};
  if (profiles.some(p => nameKey(p.name) === nameKey(name))) return {err:'“' + name + '” adında bir kaptan zaten var.'};
  let id; do id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); while (profiles.some(p => p.id === id));
  const p = {id, name, tier:0, money:0, best:0, won:false, door:false, last:Date.now()};
  if (!lsGet(P_MIGRATED)) {
    const a = lsGet(LEGACY_KEY), b = lsGet(LEGACY_DEMO_KEY);
    if (a) lsSet(pKey(id), a);
    if (b) lsSet(pKey(id) + '.demo', b);
    try { const s = JSON.parse(a || 'null'); if (s && s.v === 3) { p.tier = clamp(s.tier|0, 0, NL - 1); p.money = Math.floor(+s.money || 0); p.best = Math.round(+s.best || 0); p.won = !!s.bossDone; } } catch (e) {}
    lsSet(P_MIGRATED, '1');
  }
  profiles.push(p); persistIndex();
  return {p};
}
// Kaydı yerinde baştan kurar (demo düğmesiyle aynı yol): dünya, canavar listeleri, tema (art.js her karede), HUD, dükkân.
function reloadSave(){
  demo = calcDemo();
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, defaultSave()); load();
  if (DG.wpn && DG.wpn.reset) DG.wpn.reset();
  killDirty = false; S.playing = false; setup(); shownMoney = save.money; syncDemoBtn();
}
function switchProfile(id){
  if (!id || id === activeId) return;
  persist();
  activeId = id; lsSet(P_ACTIVE, id);
  reloadSave();
}
function deleteProfile(id){
  lsDel(pKey(id)); lsDel(pKey(id) + '.demo');
  profiles = profiles.filter(p => p.id !== id); persistIndex();
  if (id !== activeId) return;
  const n = byRecent()[0];
  activeId = n ? n.id : null;
  if (activeId) lsSet(P_ACTIVE, activeId); else lsDel(P_ACTIVE);
  reloadSave();
}

// ---------- türetilmiş değerler ----------
function relicMods(){
  const m = {value:1, air:1, bag:0, dmg:1, light:1, speed:1, wdmg:1};
  for (const i of save.relics) {
    const b = LAYERS[i].relic.bonus;
    if (b.k === 'bag') m.bag += b.v;
    else if (b.k === 'dmg') m.dmg *= (1 - b.v);
    else m[b.k] *= (1 + b.v);
  }
  // Yeni Sefer+: her turda canavarlar %50 daha sert, hazineler %25 daha değerli.
  m.dmg *= 1 + 0.5*save.ng; m.value *= 1 + 0.25*save.ng;
  // Temizlenen her kat: satışlar kalıcı +%3.
  m.value *= 1 + CLEAR_VALUE*save.cleared.length;
  return m;
}
const CLEAR_VALUE = 0.03;
// Hız katla 1.12^kat büyür (canavarlar da aynı oranda: mon.js spdOf). Katlar uzun olduğu için eskiden 1.15'ti.
const speedAt = (t, k) => 150*Math.pow(1.12, t)*KM.speed[k];
function tankAt(t, k){
  const sp = speedAt(t, k), dk2 = 1 + 0.2*t, sf = KM.suit[k];
  const need = (2*sf*LH(t)/sp + 25)*(1 + 0.6*sf*dk2);
  return Math.round(need*(1.35 - 0.02*t));
}
const bagAt = k => KM.bag[k] + save.tier + mods.bag;
// Işık katla büyümez: derin katları karanlık yapan DARK tablosu olsun, fener her katta aynı havuzu açar.
const lightAt = k => KM.light[k]*mods.light;
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
const priceUnit = t => 15*Math.pow(3.5, t)*(1 + 0.25*t);
function nice(n){ if (n < 100) return Math.max(1, Math.round(n)); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n/p)*p; }
const upCost = (k, lvl) => nice(priceUnit(save.tier)*TRACK_W[k]*STEP_COST[lvl]);
const elevCostAt = t => nice(2600*Math.pow(3.5, t)*(1 + 0.25*t));
const ngCost = () => nice(2600*Math.pow(3.5, NL - 1)*(1 + 0.25*(NL - 1))*(1 + save.ng));
const consPrice = k => nice(priceUnit(save.tier)*CONS[k].price);
const wpnCost = (w, lvl) => nice(priceUnit(w.unlock)*D.WPN_COST[lvl]);
// Kombo en pahalı yetenek: normal yeteneğin 4 katı.
const skillCost = (s, lvl) => nice(priceUnit(s.unlock)*D.SKILL_COST[lvl]*(s.id === 'combo' ? 4 : 1));
const refTank = L => tankAt(L, 1);
function fmtMoney(n){
  n = Math.round(n);
  if (n < 100000) return '₺' + n.toLocaleString('tr-TR');
  for (const [d, s] of [[1e12,' Tr'],[1e9,' Mr'],[1e6,' Mn'],[1e3,' B']]) if (n >= d*0.9995) { const v = n/d; return '₺' + (v >= 99.95 ? Math.round(v) : v.toFixed(1).replace('.', ',')) + s; }
  return '₺' + n;
}
const fmtM = m => Math.round(m).toLocaleString('tr-TR') + ' m';
// Rakamdan sonra Türkçe ek (yönelme / bulunma), n % 10 ile seçilir (0 = 10 'on').
const DAT = ["'a","'e","'ye","'e","'e","'e","'ya","'ye","'e","'a"], LOC = ["'da","'de","'de","'te","'te","'te","'da","'de","'de","'da"];

// ---------- ses ----------
let actx = null;
function audio(){
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
function tone(freq, dur, type, vol, slide, at){
  if (save.muted || SET.sfx <= 0) return;
  vol = (vol || 0.1)*SET.sfx;
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
  if (save.muted || SET.sfx <= 0) return;
  vol = (vol || 0.15)*SET.sfx;
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
    case 'sonic': tone(95, 0.35, 'sine', 0.16, 0.45); noise(0.3, 0.1, 0.02, 1400); break;
    case 'camo': [1320, 990, 740].forEach((f, i) => tone(f, 0.22, 'sine', 0.035, 0.85, i*0.06)); break;
    case 'thunder': noise(1.6, 0.22, 0, 260); tone(48, 1.2, 'sine', 0.12, 0.7, 0.05); break;
  }
}
function buzz(ms){ if (!SET.vib) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

// ---------- müzik ----------
// Giriş ekranında kendi teması, her katın kendi parçası (k01..k11), final dövüşünde ayrı parça.
// Parça değişince ve parça sonuna XF sn kala (aynı parça baştan) çapraz geçiş. Ses kapalıyken ve fragmanda susar.
// Tarayıcılar sesi ilk dokunuştan önce açmaz: ilk dokunuşta (giriş ekranında da) müzik başlar.
const MUSIC = {intro:'assets/music/intro.mp3', boss:'assets/music/boss.mp3'};
for (let i = 1; i <= 11; i++) MUSIC['k' + String(i).padStart(2, '0')] = 'assets/music/k' + String(i).padStart(2, '0') + '.mp3';
const MUS_VOL = 0.38, XF = 3;
const mus = {on:false, key:null, cur:null, old:[]};
addEventListener('pointerdown', () => { mus.on = true; }, {once:true});
addEventListener('keydown', () => { mus.on = true; }, {once:true});
function musPlay(src){ const e = new Audio(src); e.volume = 0; e.play().catch(() => {}); return e; }
function musTarget(){
  if (!mus.on || S.cine || document.hidden || save.muted || SET.music <= 0) return null;
  if (!$('intro').hidden) return 'intro';
  if (bossOn()) return 'boss';
  return 'k' + String(layerOf(diver.y) + 1).padStart(2, '0');
}
function musTick(dt){
  const key = musTarget();
  if (key !== mus.key) {
    if (mus.cur) mus.old.push(mus.cur);
    mus.key = key; mus.cur = key ? musPlay(MUSIC[key]) : null;
  }
  const c = mus.cur;
  if (c && isFinite(c.duration) && c.duration > XF*3 && c.currentTime > c.duration - XF) { mus.old.push(c); mus.cur = musPlay(MUSIC[mus.key]); }
  const k = Math.min(1, dt/XF)*MUS_VOL;
  const top = MUS_VOL*SET.music;
  if (mus.cur) mus.cur.volume = mus.cur.volume < top ? Math.min(top, mus.cur.volume + k) : top;
  for (const e of mus.old) e.volume = Math.max(0, e.volume - k);
  mus.old = mus.old.filter(e => { if (e.volume > 0.001) return true; e.pause(); e.removeAttribute('src'); return false; });
}

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
// Eserin yeri kata (ve Yeni Sefer+ turuna) göre sabit: bekçiler (mon.js keepers) de buna göre yerleşir.
function relicPos(L){
  const r = seeded(L*131 + 7 + save.ng*977);
  if (L === NL - 1) return {x:BOAT_X + (r()*2 - 1)*220, y:WORLD_H - 52};
  const by = LTOP[L + 1], side = r() < 0.5 ? 0 : 1;
  const wall = wallW(by - LEDGE_HALF - 22, side);
  const lo = side === 0 ? wall + 40 : BOAT_X + SHAFT_HALF + 40;
  const hi = side === 0 ? BOAT_X - SHAFT_HALF - 40 : WORLD_W - wall - 40;
  return {x:lo + r()*Math.max(1, hi - lo), y:by - LEDGE_HALF - 24};
}
function placeRelic(L){ const p = relicPos(L); return {def:LAYERS[L].relic, relic:true, L, x:p.x, y:p.y, value:0, ph:0, taken:false}; }
function isSafe(x, y){
  for (let s = 0; s <= save.tier; s++) { const p = stationPos(s); if (dist(x, y, p.x, p.y) < SAFE_R) return true; }
  return false;
}
// Bütün istasyonlar (henüz açılmamışlar da): canavar listeleri açılan kata göre değişmesin.
function isSafeAny(x, y){
  if (dist(x, y, BOAT_X, 0) < SAFE_R) return true;
  if (Math.abs(x - BOAT_X) > SAFE_R) return false;
  for (let s = 1; s < NL; s++) if (dist(x, y, BOAT_X, LTOP[s]) < SAFE_R) return true;
  return false;
}
// Bir katın dükkân toplamı: 6 ekipmanın 3 seviyesi + o katta açılan silah ve yeteneklerin tam fiyatı (başlangıçta verilenler hariç).
function shopTotal(L){
  const u = priceUnit(L);
  let t = 0;
  for (const k of TRACKS) t += u*TRACK_W[k]*(STEP_COST[1] + STEP_COST[2] + STEP_COST[3]);
  for (const w of WEAPONS) if (w.unlock === L && w.id !== 'spear') t += priceUnit(w.unlock)*D.WPN_COST.reduce((a, b) => a + b, 0);
  for (const sk of SKILLS) if (sk.unlock === L && sk.id !== 'dash') t += priceUnit(sk.unlock)*D.SKILL_COST.reduce((a, b) => a + b, 0)*(sk.id === 'combo' ? 4 : 1);
  return t;
}
// Katın hazinelerinin toplam değeri = dükkân toplamı x 2,2 (canavar ödülleri ayrıca); gizem: dükkân toplamı kadar, tek seferde.
const LOOT_K = 2.2, SECRET_K = 1.0;
// Hazinelerin listesi (sayı, tür, değer) kat tohumuyla sabit, yerleri her dalışta rastgele. Satılan bir daha çıkmaz (save.taken);
// bayılınca çantadakiler satılmadığı için denize geri döner. Canavarlar da yeniden doğmaz (spawnMons).
function generate(){
  S.items = []; S.glowSpots = [];
  for (let L = 0; L <= save.tier; L++) {
    const ly = LAYERS[L], top = LTOP[L], h = LH(L), gk = h/4000, r = seeded(L*7907 + 31 + save.ng*1031);
    // Liste (kaç parça, tür, değer) ve her parçanın yeri kat tohumuyla sabit: asansör, tekne ya da bayılma hiçbir şeyi yenilemez.
    const rr = (a, b) => a + r()*(b - a), list = [], BAND = [[0, 0.34], [0.34, 0.67], [0.67, 1]];
    for (let y = top + 60; y < top + h - 60; y += rr(22, 40)) {
      const f = (y - top)/h;
      let tier = f < 0.34 ? 0 : f < 0.67 ? 1 : 2;
      if (tier < 2 && r() < 0.07) tier++;
      list.push({def:ly.items[tier][r() < 0.6 ? 0 : 1], tier, w:[1,3,8][tier]*(1 + 1.5*f)*rr(0.85, 1.15)});
    }
    const sum = list.reduce((a, it) => a + it.w, 0) || 1, k = LOOT_K*shopTotal(L)/sum;
    const gone = new Set(Array.isArray(save.taken[L]) ? save.taken[L] : []);
    list.forEach((it, i) => {
      if (gone.has(i)) return;
      const [b0, b1] = BAND[it.tier], pr = seeded(L*7907 + 31 + save.ng*1031 + 101*(i + 1));
      for (let tr = 0; tr < 8; tr++) {
        const y = clamp(top + h*(b0 + pr()*(b1 - b0)), top + 60, top + h - 60), [lo, hi] = boundsAt(y), x = lo + 14 + pr()*(hi - lo - 28);
        if (hi - lo < 60 || inLedge(x, y) || ledgeAt(y)) continue;
        S.items.push({def:it.def, tier:it.tier, L, id:i, x, y, value:it.w*k*mods.value, ph:pr()*6.28, taken:false});
        break;
      }
    });
    // Gizem: katta tek, duvara gizlenmiş, çok değerli, yeri sabit. Yakına gelince ya da sonarla görünür.
    const sr = seeded(L*4241 + 77 + save.ng*1031);
    if (!save.secrets.includes(L)) for (let tr = 0; tr < 12; tr++) {
      const y = top + h*(0.12 + sr()*0.8), side = sr() < 0.5 ? 0 : 1, x = side ? WORLD_W - wallW(y, 1) - 16 : wallW(y, 0) + 16;
      if (ledgeAt(y) || isSafeAny(x, y)) continue;
      S.items.push({secret:true, L, x, y, value:nice(SECRET_K*shopTotal(L)*mods.value), ph:rand(0, 6.28), taken:false});
      break;
    }
    if (!save.relics.includes(L) && !(S.relicHeld === L)) S.items.push(placeRelic(L));
    const bot = L === NL - 1 ? WORLD_H : LTOP[L + 1];
    if (ly.decor === 'vents') for (let i = 0; i < Math.round(6*gk); i++) S.glowSpots.push({x:120 + (i%6)*230 + rand(-30, 30), y:top + h*rand(0.1, 0.95), r:130, c:'255,110,40'});
    if (ly.decor === 'crystal') for (let i = 0; i < Math.round(10*gk); i++) { const y = top + h*rand(0.05, 0.95), side = i%2; const x = side ? WORLD_W - wallW(y, 1) - 10 : wallW(y, 0) + 10; S.glowSpots.push({x, y, r:110, c:'140,220,255'}); }
    if (ly.decor === 'atlantis') for (let i = 0; i < 8; i++) S.glowSpots.push({x:180 + i*150, y:bot - 120 - (i%2)*80, r:160, c:'90,220,255'});
    if (ly.decor === 'trench') for (let i = 0; i < 4; i++) S.glowSpots.push({x:WORLD_W/2 + (i - 1.5)*160, y:bot - 40, r:120, c:'80,160,255'});
  }
}
// ---------- kat canavar listeleri (sabit, yeniden doğmaz) ----------
const rosterSeed = L => L*7919 + 17 + save.ng*104729;
const killedOf = L => Array.isArray(save.killed[L]) ? save.killed[L] : [];
const leftN = L => Math.max(0, (rosterN[L] || 0) - killedOf(L).length);
function addLayerMons(L){
  if (!(DG.mon && DG.mon.spawnLayer)) return;
  const list = DG.mon.spawnLayer(L, rosterSeed(L));
  rosterN[L] = list.length;
  const ks = new Set(killedOf(L));
  for (const m of list) if (!ks.has(m.rid)) S.mons.push(m);
  if (DG.mon.spawnHazards) for (const hz of DG.mon.spawnHazards(L, rosterSeed(L))) S.hazards.push(hz);
  // liste küçüldüyse (eski kayıt) ya da hepsi ölmüşse temizlendi say
  if (rosterN[L] && killedOf(L).length >= rosterN[L] && !save.cleared.includes(L)) save.cleared.push(L);
}
function spawnMons(){
  S.mons = []; S.hazards = []; rosterN = [];
  for (let L = 0; L <= save.tier; L++) addLayerMons(L);
}
function recordKill(m){
  if (m.rid == null || m.L == null || m.L > save.tier) return;
  const a = save.killed[m.L] || (save.killed[m.L] = []);
  if (a.includes(m.rid)) return;
  a.push(m.rid); killDirty = true;
  if (rosterN[m.L] && a.length >= rosterN[m.L] && !save.cleared.includes(m.L)) layerCleared(m.L);
}
function layerCleared(L){
  save.cleared.push(L);
  const bonus = nice(0.12*elevCostAt(L)*(1 + 0.25*save.ng));
  if (!demo) save.money += bonus;
  save.earned += bonus;
  mods = relicMods();
  persist(); killDirty = false;
  sfx('relic'); buzz([60, 40, 120]);
  toast('Kat temizlendi', LAYERS[L].name.toLocaleUpperCase('tr-TR') + ' · +' + fmtMoney(bonus));
  msg('Bütün canavarlar ve engeller yok! Ödül ' + fmtMoney(bonus) + ', satışlar kalıcı +%' + Math.round(CLEAR_VALUE*100) + '.', 'var(--relic)');
}

// ---------- modül API'si ----------
const bossOn = () => !!(DG.boss && DG.boss.active && DG.boss.active());
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
const BOUNTY_K = 0.25;   // canavar ödülü çarpanı (hazine ve dükkân dengesine göre)
function bounty(m){
  // Listede olmayan (boss'un çağırdığı) canavarlar para vermez: yoksa sonsuz para kaynağı olurdu.
  const reward = m.rid == null ? 0 : BOUNTY_K*valUnit(m.L)*MON[m.t].bounty*mods.value*(m.size > 1 ? 2 : 1);
  if (!demo) save.money += reward;
  save.earned += reward; save.kills++;
  if (reward > 0) float(m.x, m.y - 22, MON[m.t].n + ' +' + fmtMoney(reward), '#ffb03a');
  recordKill(m);
  sfx('kill');
  return reward;
}
function reward(amount, x, y, label){ if (!demo) save.money += amount; save.earned += amount; float(x, y, (label ? label + ' ' : '') + '+' + fmtMoney(amount), '#ffb03a'); }
function stationAbove(y){ let best = 0; for (let s = 1; s <= save.tier; s++) if (LTOP[s] < y - 10) best = s; return best; }
function startLift(){
  if (!S.playing || S.lifting || diver.y < 40) return false;
  S.lifting = true; S.liftTo = stationAbove(diver.y); sfx('balloon'); buzz(30);
  msg('Kaldırma balonu şişti! ' + (S.liftTo ? 'İstasyon ' + S.liftTo + DAT[S.liftTo % 10] : 'Tekneye') + ' çıkıyorsun.', 'var(--amber)');
  return true;
}
function ink(sec){ S.inkT = Math.max(S.inkT, sec); }
function slow(sec){ S.slowT = Math.max(S.slowT, sec); }
function bossHUD(bossFrac, boatFrac, label){
  const b = $('bossBar');
  const on = bossFrac != null;
  if (document.body.classList.contains('boss') !== on) { document.body.classList.toggle('boss', on); hudBottom = $('hud').getBoundingClientRect().bottom; }
  if (bossFrac == null) { b.hidden = true; return; }
  b.hidden = false;
  $('bossName').textContent = label || 'Derinlerin Efendisi';
  $('bossFill').style.width = clamp(bossFrac, 0, 1)*100 + '%';
  $('boatFill').style.width = clamp(boatFrac, 0, 1)*100 + '%';
}
// Final kazanıldı: zafer anı, ardından derinlerden sinyal. Bitiş kartı kapı açılıp fragman bitince gelir.
function bossWon(){
  save.bossDone = true; save.signal = true; save.doorOpened = false; persist();
  bossHUD(null);
  sfx('relic'); buzz([80, 40, 160]);
  toast('Zafer!', 'DERİNLERİN EFENDİSİ YENİLDİ');
  setTimeout(signalEvent, 3400);
}
function signalEvent(){
  if (!save.signal || save.doorOpened) return;
  sfx('roar'); setTimeout(() => sfx('sonar'), 700); buzz([200, 80, 200]);
  if (DG.fx && DG.fx.shake) DG.fx.shake(6);
  msg('Derinlerden bir sinyal geliyor...', 'var(--relic)');
  setTimeout(() => toast('Bir sinyal', 'OCEAN SECRET\'İN DİBİ · PUSULAYI İZLE'), 2700);
  const el = $('sig'); el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping');
}
function fillEnd(){
  const p = prof();
  $('eName').textContent = 'Tebrikler, ' + (p ? p.name : 'dalgıç') + '!';
  $('eDives').textContent = save.dives; $('eMoney').textContent = demo ? '∞' : fmtMoney(save.money); $('eKills').textContent = save.kills;
  const mins = Math.floor(save.playT/60);
  $('eTime').textContent = Math.floor(mins/60) + ':' + String(mins%60).padStart(2, '0');
  $('eBest').textContent = fmtM(save.best); $('eEarned').textContent = fmtMoney(save.earned);
  $('eSecrets').textContent = save.secrets.length + '/' + NL;
  $('eTeaser').hidden = !save.teaserSeen;
}
function bossLost(){
  bossHUD(null); S.playing = false;
  $('bcEyebrow').textContent = 'GEMİ AĞIR YARA ALDI';
  $('bcTitle').textContent = 'Bir daha';
  $('bcText').textContent = 'Canavar tekneyi neredeyse batırdı ve derinlere çekildi. Ama geri gelecek. Silahlarını yükselt, yeteneklerini hazırla.';
  $('bcBtn').textContent = 'Tekrar savaş';
  $('bossCard').hidden = false;
}
DG.U = {rand, clamp, hash, rgb, dist, lerp, mix, layerOf, toM, mToY, LTOP, LH, LBOT, wallW, boundsAt, inLedge, ledgeAt, waterAt, darkAtM, stationPos, isSafe, isSafeAny, relicPos, valUnit, wallColor, ledgeColor};
DG.core = {hurt, dmgFor, bounty, reward, startLift, ink, slow, msg, float, sfx, buzz, bossHUD, bossWon, bossLost, gSpeed, gLight, gTank,
  tier:() => save.tier, wdmg:() => mods.wdmg, demo:() => demo, persist,
  roster:L => ({total:rosterN[L] || 0, left:leftN(L), cleared:save.cleared.includes(L)})};
DG.sfx = sfx;

// ---------- giriş: joystick + klavye ----------
// Tek parmak: ekranın her yeri yüzme çubuğu. İki parmak: sol yarı yüzme, sağ yarı nişan + sürekli ateş.
const joy = {active:false, id:null, ox:0, oy:0, x:0, y:0};
// Çubuk yarıçapı: telefonda daha küçük halka (ekranı daha az kapatsın).
const JR = () => S.W < 600 ? 46 : 60;
const aim = {active:false, id:null, ox:0, oy:0, x:0, y:0};
function setAim(){
  if (!aim.active) { S.input.aim = null; return; }
  const dx = aim.x - aim.ox, dy = aim.y - aim.oy, L = Math.hypot(dx, dy);
  S.input.aim = L > 12 ? {x:dx/L, y:dy/L} : null;
}
cv.addEventListener('pointerdown', e => {
  const twin = save.ctrl === 2 && S.playing;
  const st = twin && e.clientX > S.W/2 ? aim : joy;
  if (st.active) return;
  st.active = true; st.id = e.pointerId; st.x = e.clientX; st.y = e.clientY;
  // Yüzme çubuğunun merkezi kenarlardan 60 px içeride: kenara yakın dokununca da her yöne tam hız alınır.
  const r = JR(); st.ox = st === joy ? clamp(st.x, r, S.W - r) : st.x; st.oy = st === joy ? clamp(st.y, r, S.H - r) : st.y;
  if (st === aim) { S.input.fire = true; setAim(); }
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (joy.active && e.pointerId === joy.id) {
    joy.x = e.clientX; joy.y = e.clientY;
    // Tasmalı merkez: taban başparmağı izler, yön değiştirince dalgıç hemen döner.
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, L = Math.hypot(dx, dy);
    const r = JR(); if (L > r) { joy.ox = joy.x - dx/L*r; joy.oy = joy.y - dy/L*r; }
  }
  if (aim.active && e.pointerId === aim.id) { aim.x = e.clientX; aim.y = e.clientY; setAim(); }
});
const stickEnd = e => {
  if (joy.active && e.pointerId === joy.id) joy.active = false;
  if (aim.active && e.pointerId === aim.id) { aim.active = false; S.input.fire = false; setAim(); }
};
cv.addEventListener('pointerup', stickEnd); cv.addEventListener('pointercancel', stickEnd);
addEventListener('blur', () => { keys.clear(); joy.active = false; aim.active = false; S.input.fire = false; S.input.aim = null; });
function setCtrl(n){
  save.ctrl = n; persist();
  aim.active = false; S.input.aim = null; S.input.fire = false;
  // İki parmak modunda düğme kümesi sağ alta toplanır: sol yarı yüzmeye kalır.
  $('controls').classList.toggle('twin', n === 2);
  // HUD düğmesi kısa etiket taşır (dar panelde tek satır kalsın), girişteki düğme uzun olanı.
  const t = n === 2 ? '2 PARMAK' : '1 PARMAK';
  $('ctrlBtn').textContent = t; $('ctrlIntro').textContent = 'KONTROL: ' + t;
  $('ctrlIntro').setAttribute('aria-pressed', String(n === 2));
}
$('ctrlBtn').addEventListener('click', e => { e.currentTarget.blur(); setCtrl(save.ctrl === 2 ? 1 : 2); msg(save.ctrl === 2 ? 'İki parmak: sol yarı yüz, sağ yarı nişan al ve ateş et.' : 'Tek parmak: her yerden yüz, ATEŞ düğmesiyle ateş et.', 'var(--relic)'); });
$('ctrlIntro').addEventListener('click', () => setCtrl(save.ctrl === 2 ? 1 : 2));
// Sağ panel açılır-kapanır (telefonda kapalı başlar); seçim bu tarayıcıda hatırlanır.
const HUD_MIN = 'dalgic3.hudMin';
let hudMin = lsGet(HUD_MIN); hudMin = hudMin == null ? innerWidth < 600 : hudMin === '1';
function setHudMin(v){
  hudMin = v; document.querySelector('#hud .cash').classList.toggle('min', v);
  $('cashTog').setAttribute('aria-expanded', String(!v));
  hudBottom = $('hud').getBoundingClientRect().bottom;
  if (!$('sig').hidden) placeSig();
}
$('cashTog').addEventListener('click', e => { e.currentTarget.blur(); setHudMin(!hudMin); lsSet(HUD_MIN, hudMin ? '1' : '0'); });
setHudMin(hudMin);
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('teaser').hidden) { closeTeaser(); return; }
    if (!$('profSheet').hidden) { closeProfiles(); return; }
  }
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (!$('teaser').hidden) return;
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
    if (L > 8) { const k = Math.min(1, (L - 8)/(JR() - 8)); ax += dx/L*k; ay += dy/L*k; }
  }
  const al = Math.hypot(ax, ay); if (al > 1) { ax /= al; ay /= al; }
  return [ax, ay];
}
function skillPress(id){ if (S.playing && DG.wpn && DG.wpn.skill) DG.wpn.skill(id); }

// ---------- kontrol düğmeleri ----------
const fireBtn = $('btnFire');
fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); S.input.fire = true; try { fireBtn.setPointerCapture(e.pointerId); } catch (_) {} });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) fireBtn.addEventListener(ev, () => { S.input.fire = false; });
// SİLAH: sahip olunan silahların listesini açar, tek dokunuşla seçilir (Q tuşu sırayla dolaşır).
let pickT = 0;
function closePick(){ $('wpnPick').hidden = true; pickT = 0; }
function openPick(){
  const box = $('wpnPick'), owned = WEAPONS.filter(w => save.wpn[w.id] != null);
  if (owned.length < 2) { if (DG.wpn && DG.wpn.next) DG.wpn.next(); return; }
  box.innerHTML = '';
  for (const w of owned) {
    const b = el('button', null, DG.wpn && DG.wpn.shortName ? DG.wpn.shortName(w.id) : w.n); b.type = 'button';
    b.setAttribute('aria-pressed', String(save.curWpn === w.id));
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (DG.wpn && DG.wpn.select) DG.wpn.select(w.id); else save.curWpn = w.id; closePick(); });
    box.appendChild(b);
  }
  box.hidden = false; pickT = 4;
}
$('btnWpn').addEventListener('pointerdown', e => { e.preventDefault(); if ($('wpnPick').hidden) openPick(); else closePick(); });
$('btnDash').addEventListener('pointerdown', e => { e.preventDefault(); skillPress('dash'); });
for (let i = 0; i < 3; i++) $('btnSk' + i).addEventListener('pointerdown', e => { e.preventDefault(); const id = save.equip[i]; if (id) skillPress(id); });
$('shopBtn').addEventListener('click', () => openShop());
$('elevBtn').addEventListener('click', () => openElev());

// ---------- dükkân ----------
let shopTab = 'gear';
function el(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function pips(n, on){ const p = el('div', 'pips'); for (let i = 1; i <= n; i++) { const d = el('i'); if (i <= on) d.className = 'on'; p.appendChild(d); } return p; }
function btn(text, cls, enabled, fn, id){
  const b = el('button', cls || 'buy', text); b.type = 'button'; if (id) b.id = id; b.disabled = !enabled;
  if (fn) b.addEventListener('click', () => { if (!b.disabled) fn(); });
  return b;
}
// Fiyat düğmesi: alınabiliyorsa fiyat, değilse ne kadar eksik olduğu.
function priceBtn(c, fn, id, prefix){
  const ok = canAfford(c);
  const b = btn('', 'buy', ok, fn, id);
  if (ok) b.appendChild(el('b', null, (prefix || '') + fmtMoney(c)));
  else { b.appendChild(el('b', null, fmtMoney(c))); b.appendChild(el('small', null, fmtMoney(c - save.money) + ' eksik')); }
  return b;
}
// Küçük çizgi ikonlar (sprite yoksa). 24x24, currentColor ile.
const GLYPH = {
  tank:'<rect x="7.5" y="6" width="9" height="15" rx="4.5"/><path d="M10 6V3.5h4V6M12 3.5V2M14 3.5h3"/><path d="M9.5 11h5" opacity=".6"/>',
  speed:'<path d="M3 17c5 0 9-3 11-9l2.5 1.2C15 15.5 10.5 20 3.5 20.5z"/><path d="M15 6l5-2-1 5"/>',
  bag:'<path d="M5 9h14l-1.6 11.5H6.6z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9"/><path d="M8.5 13.5h7" opacity=".6"/>',
  light:'<path d="M3 9.5h6v5H3z"/><path d="M9 8.5l4-2v11l-4-2"/><path d="M15.5 8l5-2.5M15.5 12h6M15.5 16l5 2.5"/>',
  suit:'<circle cx="12" cy="10.5" r="7"/><rect x="8.5" y="8" width="7" height="5" rx="2"/><path d="M6.5 17.5h11V21h-11z"/>',
  armor:'<path d="M12 2.8l7.5 3V11c0 5-3.3 8.4-7.5 10.2C7.8 19.4 4.5 16 4.5 11V5.8z"/><path d="M12 7v10M8 11h8" opacity=".6"/>',
  spear:'<path d="M2 12h15"/><path d="M17 8.5L22 12l-5 3.5z"/><path d="M5 9.5l-2 2.5 2 2.5"/>',
  bang:'<path d="M2 12h11"/><path d="M13 9l4 3-4 3z"/><path d="M19.5 7.5l.5 2.5 2.3-1-1.3 2.2 2 .8-2.4.7.9 2.3-2.1-1.4-.9 2.4" />',
  net:'<circle cx="13" cy="12" r="8"/><path d="M5 12h16M13 4v16M7.5 6.5l11 11M18.5 6.5l-11 11" opacity=".7"/>',
  aps:'<path d="M2 10.5h15v3H7l-1 4H3l1-4H2z"/><path d="M17 11.5h5" /><path d="M9 13.5v3" opacity=".6"/>',
  sonic:'<path d="M4 9v6"/><path d="M8 6.5a8 8 0 0 1 0 11M12 4.5a11 11 0 0 1 0 15M16 3a14 14 0 0 1 0 18"/>',
  torpedo:'<path d="M3 12c0-2 1.5-3 3-3h11l4 3-4 3H6c-1.5 0-3-1-3-3z"/><path d="M6 9L4 6.5M6 15l-2 2.5"/>',
  trident:'<path d="M2 12h13"/><path d="M15 12h7M15 7.5h5M15 16.5h5M15 7.5v9"/>',
  dash:'<path d="M13 2L5 13h6l-1.5 9L19 10h-6z"/>',
  lift:'<ellipse cx="12" cy="8.5" rx="6" ry="6.5"/><path d="M12 15v6M10 21h4"/>',
  shock:'<circle cx="12" cy="12" r="9" opacity=".6"/><path d="M13 5l-5 8h4l-1 6 5-8h-4z"/>',
  flare:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/><circle cx="12" cy="12" r="2.5"/>',
  sonar:'<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15"/>',
  camo:'<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20L20 4"/>',
  combo:'<path d="M3 8h11M3 12h14M3 16h11"/><path d="M14 5l7 7-7 7"/>',
  spareTank:'<rect x="5" y="6" width="8" height="15" rx="4"/><path d="M7.5 6V3.5h3V6M18 6v8M14 10h8"/>',
  spareBag:'<path d="M3 10h12l-1.4 10H4.4z"/><path d="M6.5 10V8a2.5 2.5 0 0 1 5 0v2M19 4v8M15 8h8"/>',
};
function glyph(k){ const s = el('span', 'glyph'); s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (GLYPH[k] || GLYPH.spear) + '</svg>'; return s; }
// İkon yuvası: manifestte sprite varsa onu (DG.art.src), yoksa çizgi ikon.
function iconSlot(sprite, gk, cls){
  const box = el('div', 'ico' + (cls ? ' ' + cls : ''));
  const src = DG.art && DG.art.src ? DG.art.src(sprite) : null;
  if (src) { const im = el('img'); im.alt = ''; im.src = src; box.appendChild(im); box.classList.add('art'); }
  else box.appendChild(glyph(gk));
  return box;
}
// "şimdi → sonra" değer çifti (sayı + birim).
function statOf(k, lvl){
  switch (k) {
    case 'tank': return [Math.round(tankAt(save.tier, lvl)*mods.air), 'sn'];
    case 'speed': return [(KM.speed[lvl]*mods.speed).toFixed(2).replace('.', ','), 'x'];
    case 'bag': return [bagAt(lvl), 'parça'];
    case 'light': return [Math.round(lightAt(lvl)), 'menzil'];
    case 'suit': return [Math.round(toM(LTOP[save.tier] + KM.suit[lvl]*LH(save.tier))).toLocaleString('tr-TR'), 'm'];
    case 'armor': return ['%' + Math.round(KM.armor[lvl]*100), ''];
  }
  return ['', ''];
}
function trackText(k, lvl){ const [v, u] = statOf(k, lvl); return (v + ' ' + u).trim(); }
function statLine(k, lv, max){
  const d = el('div', 'stat');
  d.appendChild(el('span', 'k', TRACK_LABEL[k]));
  const [v0, u0] = statOf(k, lv);
  d.appendChild(el('span', 'v', v0 + (u0 === 'x' || !u0 ? u0 : ' ' + u0)));
  if (lv < max) { d.appendChild(el('span', 'arr', '→')); const [v1, u1] = statOf(k, lv + 1); d.appendChild(el('span', 'v nx', v1 + (u1 === 'x' || !u1 ? u1 : ' ' + u1))); }
  return d;
}
const gearDone = () => TRACKS.every(k => save.lv[k] >= 3);
const relicDone = () => save.relics.includes(save.tier);
// Yeni kat ücretsiz: şartlar ekipman ve eser. (elevCostAt kat temizleme ödülünün ölçüsü olarak kalır.)
const elevReady = () => save.tier < NL - 1 && gearDone() && relicDone();
function affordableCount(){
  let n = 0;
  for (const k of TRACKS) { const lv = save.lv[k]; if (lv < 3 && canAfford(upCost(k, lv + 1))) n++; }
  return n;
}
function bought(){ sfx('buy'); persist(); renderShop(); updateCtx(); }
// Dükkânın üstündeki hedef şeridi: yeni kat için iki şart (ekipman, eser) tek bakışta.
function goalStrip(){
  const box = el('div', 'goalstrip');
  if (save.tier >= NL - 1) {
    box.appendChild(el('span', 'gl', save.bossDone ? 'Yeni Sefer+ için:' : 'Son kat:'));
    if (save.bossDone) { const c = ngCost(); box.appendChild(chip('Bilet ' + fmtMoney(c), canAfford(c))); }
    else { box.appendChild(chip('Ocean Secret\'in Kalbi', save.relics.includes(NL - 1))); box.appendChild(chip('Final', false)); }
    return box;
  }
  const done = TRACKS.filter(k => save.lv[k] >= 3).length;
  box.appendChild(el('span', 'gl', 'Yeni kat için:'));
  box.appendChild(chip('Ekipman ' + done + '/' + TRACKS.length, done === TRACKS.length));
  box.appendChild(chip('Eser', relicDone()));
  return box;
}
function chip(txt, ok){ const c = el('span', 'chip' + (ok ? ' ok' : '')); c.appendChild(el('i', null, ok ? '✓' : '✗')); c.appendChild(document.createTextNode(txt)); return c; }
const fmt1 = n => (Math.round(n*10)/10).toString().replace('.', ',');
function bar(label, val, f){
  const r = el('div', 'mbar'); r.appendChild(el('span', 'k', label));
  const b = el('span', 'tr'), i = el('i'); i.style.width = Math.round(clamp(f, 0.04, 1)*100) + '%'; b.appendChild(i); r.appendChild(b);
  r.appendChild(el('span', 'v', val)); return r;
}
function card(cls){ const c = el('div', 'gcard' + (cls ? ' ' + cls : '')); return c; }
function renderShop(){
  $('shopTitle').firstChild.textContent = SHIPS[save.tier].n;
  $('shopSub').textContent = 'KAT ' + (save.tier + 1) + '/' + NL + ' · ' + LAYERS[save.tier].name.toLocaleUpperCase('tr-TR') + ' · ' + (demo ? 'DEMO' : fmtMoney(save.money));
  for (const k of ['gear','wpn','skill','cons','relic']) $('tab-' + k).setAttribute('aria-selected', String(shopTab === k));
  const body = $('shopBody'); body.innerHTML = '';
  body.appendChild(goalStrip());
  const box = el('div', 'ups');
  if (shopTab === 'gear') {
    for (const k of TRACKS) {
      const lv = save.lv[k], r = card(lv >= 3 ? 'max' : '');
      r.appendChild(iconSlot('gear_' + k + '_' + save.tier, k));
      const info = el('div', 'inf');
      info.appendChild(el('div', 'nm', GEAR[k][save.tier]));
      info.appendChild(statLine(k, lv, 3));
      info.appendChild(pips(3, lv));
      r.appendChild(info);
      if (lv >= 3) r.appendChild(btn('Tamam ✓', 'buy done', false));
      else { const c = upCost(k, lv + 1); r.appendChild(priceBtn(c, () => {
        if (!canAfford(c) || save.lv[k] >= 3) return;
        spend(c); save.lv[k]++; if (k === 'tank') S.o2 = gTank();
        msg(GEAR[k][save.tier] + ' yükseltildi', 'var(--amber)');
        if (gearDone()) msg(relicDone() ? 'Ekipman tamam! Asansörden yeni katı açabilirsin.' : 'Ekipman tamam! Şimdi bu katın dibindeki eseri bul.', 'var(--relic)');
        bought();
      }, 'buy-' + k, '▲ ')); }
      box.appendChild(r);
    }
  } else if (shopTab === 'wpn') {
    for (const w of WEAPONS) {
      const owned = save.wpn[w.id] != null, lv = owned ? save.wpn[w.id] : 0, locked = !owned && save.tier < w.unlock, held = owned && save.curWpn === w.id;
      const r = card('w' + (locked ? ' locked' : '') + (held ? ' held' : ''));
      r.appendChild(iconSlot('wpn_' + w.id, w.id, 'wide'));
      const info = el('div', 'inf');
      const nm = el('div', 'nm', w.n); if (held) nm.appendChild(el('em', 'tag', 'ELİNDE')); info.appendChild(nm);
      info.appendChild(el('div', 'st', locked ? 'Kat ' + (w.unlock + 1) + LOC[(w.unlock + 1) % 10] + ' açılır.' : w.d));
      const dmg = w.dmg*(1 + 0.5*lv)*(mods.wdmg || 1), rate = w.cd > 0 ? 1/w.cd : 0;
      info.appendChild(bar('HASAR', fmt1(dmg) + (w.kind === 'beam' ? '/sn' : ''), Math.sqrt(dmg/30)));
      info.appendChild(bar('ATIŞ', rate ? fmt1(rate) + '/sn' : 'sürekli', rate ? Math.sqrt(rate/9) : 1));
      if (owned) info.appendChild(pips(3, lv));
      r.appendChild(info);
      const col = el('div', 'btncol');
      if (locked) col.appendChild(btn('Kilitli', 'buy', false));
      else if (!owned) { const c = wpnCost(w, 0); col.appendChild(priceBtn(c, () => { spend(c); save.wpn[w.id] = 0; save.curWpn = w.id; msg(w.n + ' alındı!', 'var(--amber)'); bought(); }, 'wpn-' + w.id)); }
      else {
        if (lv < 3) { const c = wpnCost(w, lv + 1); col.appendChild(priceBtn(c, () => { spend(c); save.wpn[w.id]++; bought(); }, 'wpn-' + w.id, '▲ ')); }
        else col.appendChild(btn('Tam güç', 'buy done', false));
        col.appendChild(btn(held ? 'Elinde' : 'Seç', 'buy alt', !held, () => { save.curWpn = w.id; bought(); }));
      }
      r.appendChild(col); box.appendChild(r);
    }
  } else if (shopTab === 'skill') {
    box.appendChild(el('p', 'note', 'Hız patlaması her zaman takılı. Diğerlerinden en fazla 3 tanesini tuşlara takabilirsin (' + save.equip.length + '/3 takılı).'));
    for (const s of SKILLS) {
      const owned = save.skills[s.id] != null, lv = owned ? save.skills[s.id] : -1, locked = !owned && save.tier < s.unlock, on = save.equip.includes(s.id);
      const cd = Math.round(s.cd*D.SKILL_CD[Math.max(0, lv)]);
      const r = card((locked ? 'locked' : '') + (on || (owned && s.id === 'dash') ? ' held' : ''));
      r.appendChild(iconSlot('skill_' + s.id, s.id));
      const info = el('div', 'inf');
      const nm = el('div', 'nm', s.n);
      if (s.id === 'dash') nm.appendChild(el('em', 'tag', 'HER ZAMAN')); else if (on) nm.appendChild(el('em', 'tag', 'TAKILI'));
      info.appendChild(nm);
      info.appendChild(el('div', 'st', locked ? 'Kat ' + (s.unlock + 1) + LOC[(s.unlock + 1) % 10] + ' açılır.' : s.d));
      if (!locked) {
        const d = el('div', 'stat'); d.appendChild(el('span', 'k', 'BEKLEME')); d.appendChild(el('span', 'v', cd + ' sn'));
        if (owned && lv < 2) { d.appendChild(el('span', 'arr', '→')); d.appendChild(el('span', 'v nx', Math.round(s.cd*D.SKILL_CD[lv + 1]) + ' sn')); }
        info.appendChild(d);
      }
      if (owned) info.appendChild(pips(2, lv));
      r.appendChild(info);
      const col = el('div', 'btncol');
      if (locked) col.appendChild(btn('Kilitli', 'buy', false));
      else if (!owned) { const c = skillCost(s, 0); col.appendChild(priceBtn(c, () => { spend(c); save.skills[s.id] = 0; if (s.id !== 'dash' && save.equip.length < 3) save.equip.push(s.id); msg(s.n + ' öğrenildi!', 'var(--amber)'); bought(); }, 'sk-' + s.id)); }
      else {
        if (lv < 2) { const c = skillCost(s, lv + 1); col.appendChild(priceBtn(c, () => { spend(c); save.skills[s.id]++; bought(); }, 'sk-' + s.id, '▲ ')); }
        else col.appendChild(btn('Usta', 'buy done', false));
        if (s.id !== 'dash') {
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
      const r = card();
      r.appendChild(iconSlot('cons_' + k, k));
      const info = el('div', 'inf');
      info.appendChild(el('div', 'nm', c.n));
      info.appendChild(el('div', 'st', c.d));
      const d = el('div', 'stat'); d.appendChild(el('span', 'k', 'ELİNDE')); d.appendChild(el('span', 'v', save.inv[k] + '/' + c.max)); info.appendChild(d);
      info.appendChild(pips(c.max, save.inv[k]));
      r.appendChild(info);
      r.appendChild(full ? btn('Dolu', 'buy done', false) : priceBtn(price, () => { spend(price); save.inv[k] = Math.min(c.max, save.inv[k] + c.pack); bought(); }, 'cons-' + k));
      box.appendChild(r);
    }
  } else {
    const nCl = save.cleared.length;
    box.appendChild(el('p', 'note', 'Eserler kalıcı güç verir. Temizlenen her kat satışlara kalıcı +%' + Math.round(CLEAR_VALUE*100) + ' ekler' + (nCl ? ' (şu an ' + nCl + ' kat: +%' + Math.round(CLEAR_VALUE*100*nCl) + ').' : '.')));
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
function openShop(){ if (!S.playing) return; renderShop(); $('elev').hidden = true; $('shop').hidden = false; $('shop').scrollTop = 0; }
for (const k of ['gear','wpn','skill','cons','relic']) $('tab-' + k).addEventListener('click', () => { shopTab = k; renderShop(); });
$('shopClose').addEventListener('click', () => { $('shop').hidden = true; });
// Alttan açılan pencereler aşağı sürüklenerek kapanır (en üstteyken). Kısa çekişte yerine döner.
function sheetSwipe(el, close){
  let sx = 0, sy = 0, st = 0, dy = 0, on = false, track = false, block = false;
  const set = (y, anim) => { el.style.transition = anim ? 'transform .22s ease' : 'none'; el.style.transform = y ? 'translateY(' + y + 'px)' : ''; };
  const begin = (x, y) => { sx = x; sy = y; st = performance.now(); dy = 0; on = false; track = true; };
  const move = (x, y) => {
    if (!track) return false;
    const d = y - sy, ax = Math.abs(x - sx);
    if (!on) {
      if (el.scrollTop > 0 || d < -6 || (ax > 14 && ax > d)) { track = false; return false; }
      if (d < 8) return false;
      on = true;
    }
    dy = Math.max(0, d); set(dy); return true;
  };
  const end = () => {
    track = false; if (!on) return; on = false;
    block = true; setTimeout(() => { block = false; }, 60);
    const v = dy/Math.max(1, performance.now() - st);
    if (dy > 110 || (v > 0.5 && dy > 40)) { set(el.offsetHeight, true); setTimeout(() => { close(); set(0); }, 220); }
    else set(0, true);
  };
  el.addEventListener('touchstart', e => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY); else track = false; }, {passive:true});
  el.addEventListener('touchmove', e => { if (move(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); }, {passive:false});
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  el.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) begin(e.clientX, e.clientY); });
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e.clientX, e.clientY); });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse') end(); });
  el.addEventListener('click', e => { if (block) { e.stopPropagation(); e.preventDefault(); } }, true);
}
sheetSwipe($('shop'), () => { $('shop').hidden = true; });
sheetSwipe($('elev'), () => { $('elev').hidden = true; });
sheetSwipe($('profSheet'), () => closeProfiles());
sheetSwipe($('setSheet'), () => closeSettings());
sheetSwipe($('legalSheet'), () => closeLegal());
// Dükkân sekmeleri sağa/sola kaydırarak değişir.
{
  const ORDER = ['gear','wpn','skill','cons','relic'], body = $('shopBody');
  let sx = 0, sy = 0, on = false;
  body.addEventListener('touchstart', e => { on = e.touches.length === 1; if (on) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, {passive:true});
  body.addEventListener('touchend', e => {
    if (!on) return; on = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)*1.5) return;
    const j = ORDER.indexOf(shopTab) + (dx < 0 ? 1 : -1);
    if (j < 0 || j >= ORDER.length) return;
    shopTab = ORDER[j]; renderShop(); $('shop').scrollTop = 0;
    body.classList.remove('shL', 'shR'); void body.offsetWidth; body.classList.add(dx < 0 ? 'shL' : 'shR');
    const tb = $('tab-' + shopTab); if (tb && tb.scrollIntoView) tb.scrollIntoView({block:'nearest', inline:'center'});
  }, {passive:true});
}

// ---------- asansör ----------
// Dikey kuyu haritası: tekne en üstte, 11 kat sırayla. Açık istasyona tek dokunuşla gidilir;
// sıradaki kilitli kat büyük bir kartla, açmak için gereken iki şartı gösterir.
function rosterTxt(L){
  if (L > save.tier || !rosterN[L]) return null;
  return save.cleared.includes(L) ? 'Temizlendi' : leftN(L) + '/' + rosterN[L];
}
function needCard(){
  const n = save.tier + 1, card = el('div', 'needcard');
  card.appendChild(el('span', 'lbl', 'SIRADAKİ KAT · ' + fmtM(LAYERS[n].top) + '–' + fmtM(LAYERS[n].bot)));
  card.appendChild(el('h3', null, LAYERS[n].name));
  card.appendChild(el('p', null, 'Açınca asansör ' + fmtM(LAYERS[n].top) + '\'ye iner, gemin ' + SHIPS[n].n + ' olur ve dükkâna yeni ekipman gelir. Ekipman seviyeleri yeni katta baştan başlar.'));
  const ul = el('ul', 'req');
  const done = TRACKS.filter(k => save.lv[k] >= 3).length;
  // 1) ekipman: altı mini çubuk
  const g = el('li', gearDone() ? 'ok' : '');
  const gt = el('div', 'rq'); gt.appendChild(el('i', 'mk', gearDone() ? '✓' : '1')); gt.appendChild(el('span', null, 'Ekipmanı tamamla')); gt.appendChild(el('b', null, done + '/' + TRACKS.length)); g.appendChild(gt);
  const mb = el('div', 'minis');
  for (const k of TRACKS) { const m = el('span', 'mini' + (save.lv[k] >= 3 ? ' ok' : '')); const f = el('i'); f.style.width = Math.round(save.lv[k]/3*100) + '%'; m.appendChild(f); m.appendChild(el('em', null, TRACK_LABEL[k])); mb.appendChild(m); }
  g.appendChild(mb); ul.appendChild(g);
  // 2) eser
  const r = el('li', relicDone() ? 'ok' : ''), rt = el('div', 'rq');
  rt.appendChild(el('i', 'mk', relicDone() ? '✓' : '2')); rt.appendChild(el('span', null, relicDone() ? 'Eser getirildi: ' + LAYERS[save.tier].relic.n : 'Bu katın eserini bir istasyona getir')); rt.appendChild(el('b', null, relicDone() ? '✓' : fmtM(LAYERS[save.tier].bot)));
  r.appendChild(rt);
  if (!relicDone()) r.appendChild(el('small', null, 'Eser ' + LAYERS[save.tier].name + ' katının en dibinde, bir rafın üstünde parlıyor. Yanında bekçiler var.'));
  ul.appendChild(r);
  card.appendChild(ul);
  card.appendChild(btn('Asansörü indir', 'bigbuy', elevReady(), buildElevator, 'buildElev'));
  return card;
}
function renderElev(){
  const body = $('elevBody'); body.innerHTML = '';
  body.appendChild(el('p', 'helper', 'Açtığın istasyonlar arasında anında git. Yeni kat ücretsiz: ekipmanı tamamla ve katın eserini getir.'));
  const shaft = el('div', 'shaft');
  // tekne
  const here0 = curStationZone === 0;
  const b0 = el('div', 'srow boat' + (here0 ? ' here' : ''));
  b0.appendChild(el('span', 'node'));
  const i0 = el('div', 'sinf'); i0.appendChild(el('b', null, 'Tekne · ' + SHIPS[save.tier].n)); i0.appendChild(el('span', 'dep', 'Yüzey · 0 m · Kat 1\'e giriş'));
  if (here0) i0.appendChild(el('em', 'here', 'BURADASIN'));
  b0.appendChild(i0);
  if (!here0) b0.appendChild(btn('Çık', 'sgo', true, () => rideTo(0), 'go-0'));
  shaft.appendChild(b0);
  for (let L = 0; L < NL; L++) {
    const ly = LAYERS[L], open = L <= save.tier, next = L === save.tier + 1, here = curStationZone === L && L > 0;
    const inLayer = curStationZone < 0 && layerOf(diver.y) === L;
    const r = el('div', 'srow' + (open ? ' open' : ' locked') + (next ? ' next' : '') + (here ? ' here' : '') + (save.cleared.includes(L) ? ' clr' : ''));
    r.appendChild(el('span', 'node', String(L + 1)));
    const inf = el('div', 'sinf');
    const nm = el('b', null, ly.name); inf.appendChild(nm);
    inf.appendChild(el('span', 'dep', fmtM(ly.top) + '–' + fmtM(ly.bot)));
    const tags = el('div', 'tags');
    if (here || inLayer) tags.appendChild(el('em', 'here', 'BURADASIN'));
    if (open) {
      if (save.relics.includes(L)) tags.appendChild(el('span', 't relic', '★ Eser'));
      const rt = rosterTxt(L); if (rt) tags.appendChild(el('span', 't' + (rt === 'Temizlendi' ? ' clr' : ''), rt === 'Temizlendi' ? '✓ Temizlendi' : 'Canavar ' + rt));
    } else tags.appendChild(el('span', 't lock', next ? 'Sıradaki' : 'Kilitli'));
    inf.appendChild(tags);
    r.appendChild(inf);
    if (open && L > 0 && !here) r.appendChild(btn('Git', 'sgo', true, () => rideTo(L), 'go-' + L));
    else if (open && L === 0) r.appendChild(el('span', 'goN', 'Tekneden'));
    shaft.appendChild(r);
    if (next) shaft.appendChild(needCard());
  }
  body.appendChild(shaft);
  if (save.tier >= NL - 1) {
    const card = el('div', 'needcard');
    if (save.bossDone) {
      const c = ngCost();
      card.appendChild(el('span', 'lbl', 'YENİ SEFER+ ' + (save.ng + 1)));
      card.appendChild(el('h3', null, 'Denize yeniden aç'));
      card.appendChild(el('p', null, 'Sığ Koy\'dan yeniden başlarsın. Silahların, yeteneklerin ve paran seninle kalır; katlar, eserler ve canavar listeleri sıfırlanır. Canavarlar %50 daha sert, hazineler %25 daha değerli.'));
      const ul = el('ul', 'req'); const li = el('li', canAfford(c) ? 'ok' : ''); const rq = el('div', 'rq'); rq.appendChild(el('i', 'mk', canAfford(c) ? '✓' : '1')); rq.appendChild(el('span', null, 'Sefer bileti')); rq.appendChild(el('b', null, fmtMoney(c))); li.appendChild(rq); ul.appendChild(li); card.appendChild(ul);
      card.appendChild(btn('Yeni Sefer+ başlat', 'bigbuy', canAfford(c), newGamePlus, 'ngPlus'));
    } else {
      card.appendChild(el('span', 'lbl', 'SON KAT'));
      card.appendChild(el('h3', null, 'Ocean Secret'));
      card.appendChild(el('p', null, save.relics.includes(NL - 1) ? 'Ocean Secret\'in Kalbi elinde. Tekneye çık ve canavarla savaş.' : 'Ocean Secret\'in Kalbi bu katın en dibinde. Onu bir istasyona getir.'));
    }
    body.appendChild(card);
  }
  if (demo && save.tier < NL - 1) {
    const d = btn('DEMO: bütün katları aç', 'demo', true, () => {
      save.tier = NL - 1; for (let i = 0; i < NL - 1; i++) if (!save.relics.includes(i)) save.relics.push(i);
      for (const k of TRACKS) save.lv[k] = 3;
      mods = relicMods(); generate(); spawnMons(); persist(); renderElev(); updateCtx(); msg('Demo: 11 katın hepsi açıldı.', 'var(--amber)');
    }, 'demoAll');
    body.appendChild(d);
  }
  // bulunduğun satır görünür olsun
  requestAnimationFrame(() => { const h = body.querySelector('.srow.here') || body.querySelector('.needcard'); if (h && h.scrollIntoView) h.scrollIntoView({block:'center'}); });
}
function newGamePlus(){
  const c = ngCost();
  if (!save.bossDone || !canAfford(c)) return;
  spend(c);
  save.ng++; save.tier = 0; save.relics = []; save.bossDone = false; save.endSeen = false; save.station = 0;
  save.signal = false; save.doorOpened = false;   // teaserSeen kalır (girişten tekrar izlenebilir)
  save.killed = {}; save.cleared = []; save.taken = {}; save.secrets = [];
  if (DG.wpn && DG.wpn.reset) DG.wpn.reset();
  for (const k of TRACKS) save.lv[k] = 0;
  $('elev').hidden = true;
  setup(); persist();
  sfx('elev'); buzz([40, 30, 80]);
  toast('Yeni Sefer+ ' + save.ng, 'SIĞ KOY · DENİZ DAHA TEHLİKELİ');
}
function buildElevator(){
  if (!elevReady()) return;
  save.tier++;
  for (const k of TRACKS) save.lv[k] = 0;
  mods = relicMods(); generate(); addLayerMons(save.tier); persist();
  sfx('elev'); buzz([40, 30, 80]);
  renderElev(); updateCtx();
  toast(LAYERS[save.tier].name, 'YENİ KAT AÇILDI · ' + fmtM(LAYERS[save.tier].top));
  msg('Yeni gemin: ' + SHIPS[save.tier].n + '. Dükkâna yeni ekipman geldi.', 'var(--amber)');
}
function openElev(){ if (!S.playing) return; renderElev(); $('shop').hidden = true; $('elev').hidden = false; }
$('elevClose').addEventListener('click', () => { $('elev').hidden = true; });
// Yolculuk: nereden → nereye, derinlik sayacı ve kuyu boyunca kayan istasyon adları.
const RIDE_ROW = 54;
// Kuyu konumu (istasyon sırası, kesirli) -> metre: sayaç ile kayan adlar aynı yerde dursun.
const topM = i => i <= 0 ? 0 : i >= NL ? LAYERS[NL - 1].bot : LAYERS[i].top;
const mAtP = p => { const i = Math.floor(p); return lerp(topM(i), topM(i + 1), p - i); };
function rideStrip(){
  const st = $('rideStrip'); st.innerHTML = '';
  for (let s = 0; s < NL; s++) {
    const r = el('div', 'rs' + (s > save.tier ? ' off' : ''));
    r.style.top = (s*RIDE_ROW) + 'px';
    r.appendChild(el('b', null, s === 0 ? 'TEKNE' : 'İST. ' + s));
    r.appendChild(el('span', null, (s === 0 ? 'Yüzey' : LAYERS[s].name) + ' · ' + fmtM(s === 0 ? 0 : LAYERS[s].top)));
    st.appendChild(r);
  }
}
function rideTo(s){
  if (S.riding) return;
  S.riding = true; S.playing = false; $('elev').hidden = true; $('shop').hidden = true;
  const ride = $('ride'), from = toM(diver.y), to = s === 0 ? 0 : LAYERS[s].top;
  const z = curStationZone >= 0 ? curStationZone : stationAbove(diver.y + 1);
  const p0 = curStationZone >= 0 ? z : clamp(layerOf(diver.y) + (diver.y - LTOP[layerOf(diver.y)])/LH(layerOf(diver.y)), 0, NL - 1), p1 = s;
  $('rideFrom').textContent = curStationZone === 0 ? 'Tekne' : curStationZone > 0 ? 'İstasyon ' + curStationZone : fmtM(from);
  $('rideTo').textContent = s === 0 ? 'Tekne' : 'İstasyon ' + s + ' · ' + LAYERS[s].name;
  $('rideDir').textContent = to >= from ? '▼ İNİYOR' : '▲ ÇIKIYOR';
  rideStrip();
  ride.hidden = false; requestAnimationFrame(() => ride.classList.add('on'));
  sfx('elev');
  const t0 = performance.now(), dur = Math.min(3200, 1100 + 260*Math.abs(p1 - p0));
  const strip = $('rideStrip'), rows = strip.children;
  const tick = now => {
    const k = clamp((now - t0)/dur, 0, 1), e = k*k*(3 - 2*k), p = lerp(p0, p1, e);
    $('rideDepth').textContent = fmtM(mAtP(p));
    strip.style.transform = 'translateY(' + (-p*RIDE_ROW) + 'px)';
    const ci = Math.round(p);
    for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('cur', i === ci);
    if (k < 1) requestAnimationFrame(tick);
    else {
      const ps = stationPos(s);
      diver.x = ps.x; diver.y = s === 0 ? 0 : ps.y - 50; diver.vx = diver.vy = 0;
      cam.y = diver.y - S.H*0.45; camLX = camLY = leanX = leanY = 0;
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
  $('rcNext').textContent = L === NL - 1 ? '' : !gearDone() ? 'Ekipmanı tamamlayınca asansörden yeni katı açabilirsin.' : 'Ekipman da tamam. Asansörden yeni katı açabilirsin.';
  S.playing = false; $('relicCard').hidden = false;
  S.afterRelic = L === NL - 1 ? bossIntro : null;
}
function bossIntro(){
  $('bcEyebrow').textContent = 'DERİNLERDEN BİR ŞEY UYANDI';
  $('bcTitle').textContent = 'Ganimetini istiyor';
  $('bcText').textContent = 'Ocean Secret\'in Kalbi asansörle tekneye çıkarken çukurun dibinde dev bir gölge kıpırdadı. Hazinelerini geri almak için tekneye doğru yükseliyor. Gemiyi koru!';
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
$('eTeaser').addEventListener('click', () => { $('endCard').hidden = true; playTeaser(() => { $('endCard').hidden = false; }); });
$('muteBtn').addEventListener('click', e => { e.currentTarget.blur(); openSettings(); });
$('setIntro').addEventListener('click', () => openSettings());

// ---------- ayarlar ----------
function syncSettings(){
  const on = (b, v, t, f) => { b.setAttribute('aria-pressed', String(v)); b.textContent = v ? t : f; };
  on($('setSound'), !save.muted, 'AÇIK', 'KAPALI'); on($('setVib'), SET.vib, 'AÇIK', 'KAPALI');
  on($('setCtrl'), save.ctrl === 2, '2 PARMAK', '1 PARMAK');
  $('setMusic').value = Math.round(SET.music*100); $('setMusicV').textContent = Math.round(SET.music*100) + '%';
  $('setSfx').value = Math.round(SET.sfx*100); $('setSfxV').textContent = Math.round(SET.sfx*100) + '%';
}
function openSettings(){ syncSettings(); $('setSheet').hidden = false; $('setSheet').scrollTop = 0; }
function closeSettings(){ $('setSheet').hidden = true; }
$('setClose').addEventListener('click', closeSettings);
$('setSound').addEventListener('click', () => { save.muted = !save.muted; persist(); syncSettings(); if (!save.muted) sfx('buy'); });
$('setVib').addEventListener('click', () => { SET.vib = !SET.vib; saveSet(); syncSettings(); buzz(30); });
$('setCtrl').addEventListener('click', () => { setCtrl(save.ctrl === 2 ? 1 : 2); syncSettings(); });
$('setMusic').addEventListener('input', e => { SET.music = (+e.target.value || 0)/100; saveSet(); syncSettings(); });
$('setSfx').addEventListener('input', e => { SET.sfx = (+e.target.value || 0)/100; saveSet(); syncSettings(); });
$('setSfx').addEventListener('change', () => sfx('pick'));

// ---------- gizlilik, kullanım şartları, hakkında ----------
const CONTACT = 'İLETİŞİM_EPOSTASI';
const LEGAL = {
  priv:['Gizlilik Politikası', `<p>Son güncelleme: 15 Ekim 2026</p>
<h3>KISACA</h3><p>Dalgıç hiçbir kişisel verini toplamaz, saklamaz ya da kimseyle paylaşmaz.</p>
<h3>CİHAZINDA TUTULANLAR</h3><ul><li>Kaptan adın, oyun ilerlemen ve ayarların yalnızca bu cihazda (uygulamanın ya da tarayıcının kendi deposunda) saklanır.</li><li>Bu bilgiler bize ya da başka bir sunucuya gönderilmez.</li><li>Uygulamayı silersen ya da tarayıcı verilerini temizlersen hepsi silinir. Saklamak istersen Kaptanlar penceresindeki yedek kodunu kullanabilirsin.</li></ul>
<h3>TOPLAMADIKLARIMIZ</h3><ul><li>Hesap, e-posta, telefon, konum, kişiler, fotoğraf ya da cihaz kimliği istemiyoruz.</li><li>Reklam, analiz ya da takip aracı kullanmıyoruz.</li></ul>
<h3>SATIN ALIMLAR</h3><p>Oyunda uygulama içi satın alım sunulursa bu işlemler yalnızca Google Play ya da App Store üzerinden yapılır. Ödeme bilgilerin bize ulaşmaz; o mağazanın gizlilik politikası geçerlidir.</p>
<h3>ÇOCUKLAR</h3><p>Hiç kimseden, çocuklar dahil, kişisel veri toplamıyoruz.</p>
<h3>DEĞİŞİKLİKLER</h3><p>Bu politika değişirse güncel hali burada yayınlanır.</p>
<h3>İLETİŞİM</h3><p>Sorun ve sorular için: ${CONTACT}</p>`],
  terms:['Kullanım Şartları', `<p>Son güncelleme: 15 Ekim 2026</p>
<h3>OYUN</h3><p>Dalgıç eğlence amaçlı bir oyundur ve "olduğu gibi" sunulur. Hatasız ya da kesintisiz çalışacağı garanti edilmez.</p>
<h3>OYUN İÇİ PARA</h3><ul><li>Oyundaki para (₺) ve varsa satın alınan koin paketleri sanaldır; gerçek parayla değiştirilemez, devredilemez ve oyun dışında değeri yoktur.</li><li>İade talepleri satın aldığın mağazanın (Google Play, App Store) kurallarına tabidir.</li><li>Kayıtlar cihazında tutulduğu için uygulamayı silmek ya da cihaz değiştirmek ilerlemeni ve sanal paranı kaybettirebilir. Yedek kodunu saklamak senin sorumluluğundadır.</li></ul>
<h3>ADİL KULLANIM</h3><p>Oyunu değiştirerek, hile yazılımıyla ya da açıklardan yararlanarak avantaj sağlamak yasaktır.</p>
<h3>TELİF HAKLARI</h3><p>Oyunun kodu, görselleri, müzikleri, karakterleri ve "Dalgıç" ile "Ocean Secret" adları yapımcısına aittir. İzinsiz kopyalanamaz, çoğaltılamaz ya da satılamaz.</p>
<h3>İLETİŞİM</h3><p>${CONTACT}</p>`],
  about:['Hakkında', `<h3>DALGIÇ</h3><p>Sürüm 1.0 · Tek bir deniz, 11 kat ve en dipte Ocean Secret.</p>
<h3>YAPIM</h3><p>Fikir ve yapım: Behzad</p>
<h3>KAYNAKLAR</h3><ul><li>Müzikler: Suno (Pro lisansı ile üretildi)</li><li>Görseller ve fragman: Google Flow ile üretildi</li><li>Yazı tipleri: Chakra Petch, Saira Stencil One (SIL Open Font License)</li></ul>
<h3>İLETİŞİM</h3><p>${CONTACT}</p>`],
};
function openLegal(k){ const d = LEGAL[k]; $('legalTitle').textContent = d[0]; $('legalBody').innerHTML = d[1]; $('legalSheet').hidden = false; $('legalSheet').scrollTop = 0; }
const closeLegal = () => { $('legalSheet').hidden = true; };
$('legalClose').addEventListener('click', closeLegal);
for (const [b, k] of [['lnkPriv','priv'],['lnkTerms','terms'],['lnkAbout','about'],['setPriv','priv'],['setTerms','terms'],['setAbout','about']]) $(b).addEventListener('click', () => openLegal(k));
function syncDemoBtn(){
  const b = $('demoBtn'); b.hidden = !DEV; b.setAttribute('aria-pressed', String(demo));
  b.textContent = demo ? 'DEMO AÇIK · sınırsız para' : 'DEMO KAPALI · gerçek oyun';
  $('startBtn').textContent = (save.dives > 0 || save.tier > 0) ? 'Devam et' : 'Dalışa başla';
  syncProfile();
}
$('demoBtn').addEventListener('click', () => {
  persist();
  demo = !demo;
  lsSet(DEMO_FLAG, demo ? '1' : '0');
  reloadSave();
});

// ---------- kaptanlar: giriş kartı ve seçim penceresi ----------
function fmtDay(t){
  if (!t) return '—';
  const d = new Date(t), n = new Date(), hm = d.toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
  if (d.toDateString() === n.toDateString()) return 'bugün ' + hm;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'dün ' + hm;
  return d.toLocaleDateString('tr-TR', d.getFullYear() === n.getFullYear() ? {day:'numeric', month:'short'} : {day:'numeric', month:'short', year:'numeric'});
}
function syncProfile(){
  const p = prof();
  $('profCur').hidden = !p; $('profFirst').hidden = !!p;
  if (p) $('profName').textContent = p.name;
  else {
    const old = !lsGet(P_MIGRATED) && (lsGet(LEGACY_KEY) || lsGet(LEGACY_DEMO_KEY));
    $('profFirstNote').textContent = old ? 'Kayıtlı ilerlemen bu ada aktarılacak.' : '';
    $('profFirstErr').textContent = '';
  }
  $('hName').textContent = p ? p.name.toLocaleUpperCase('tr-TR') : '';
  $('hName').hidden = !p;
  $('teaserIntro').hidden = !(save.teaserSeen || (p && p.door));
}
let profDel = null;
function openProfiles(){
  profDel = null; renderProfiles();
  $('profErr').textContent = ''; $('profIn').value = '';
  $('profSheet').hidden = false;
}
function closeProfiles(){
  $('profSheet').hidden = true; profDel = null;
  const b = prof() ? $('profBtn') : $('profFirstIn');
  try { b.focus({preventScroll:true}); } catch (e) {}
}
function pbtn(label, cls, fn){ const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.addEventListener('click', fn); return b; }
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>';
function renderProfiles(){
  const box = $('profList'); box.textContent = '';
  for (const p of byRecent()) {
    const cur = p.id === activeId, del = profDel === p.id;
    const row = document.createElement('div'); row.className = 'prow' + (cur ? ' cur' : '') + (del ? ' del' : '');
    const inf = document.createElement('div'); inf.className = 'pinf';
    const nm = document.createElement('b'); nm.textContent = del ? p.name + ' silinsin mi?' : p.name;
    const st = document.createElement('span'); st.className = 'pst';
    st.textContent = del ? 'Bütün ilerlemesi silinir. Geri alınamaz.'
      : 'KAT ' + ((p.tier|0) + 1) + '/' + NL + ' · ' + fmtMoney(p.money || 0) + ' · ' + fmtDay(p.last);
    inf.append(nm);
    if (cur && !del) { const t = document.createElement('em'); t.className = 'here'; t.textContent = 'ŞU AN'; inf.append(t); }
    inf.append(st);
    if (p.won && !del) { const t = document.createElement('span'); t.className = 'pwon'; t.textContent = p.door ? 'OCEAN SECRET · KAPI AÇILDI' : 'OCEAN SECRET FETHEDİLDİ'; inf.append(t); }
    const acts = document.createElement('div'); acts.className = 'pacts';
    if (del) {
      acts.append(pbtn('Vazgeç', 'pbtn', () => { profDel = null; renderProfiles(); }),
        pbtn('Sil', 'pbtn red', () => { deleteProfile(p.id); profDel = null; if (!profiles.length) closeProfiles(); else renderProfiles(); }));
    } else {
      if (!cur) acts.append(pbtn('Seç', 'pbtn pick', () => { switchProfile(p.id); closeProfiles(); }));
      const d = pbtn('', 'pbtn icon', () => { profDel = p.id; renderProfiles(); });
      d.innerHTML = TRASH_SVG; d.setAttribute('aria-label', p.name + ' kaptanını sil');
      acts.append(d);
    }
    row.append(inf, acts); box.append(row);
  }
  $('profCount').textContent = profiles.length + ' KAPTAN';
}
$('profBtn').addEventListener('click', openProfiles);
$('profClose').addEventListener('click', closeProfiles);
$('profForm').addEventListener('submit', e => {
  e.preventDefault();
  const r = createProfile($('profIn').value);
  if (r.err) { $('profErr').textContent = r.err; $('profIn').focus(); return; }
  switchProfile(r.p.id); closeProfiles();
});
$('profIn').addEventListener('input', () => { $('profErr').textContent = ''; });
$('profFirst').addEventListener('submit', e => { e.preventDefault(); $('startBtn').click(); });
$('profFirstIn').addEventListener('input', () => { $('profFirstErr').textContent = ''; });
$('teaserIntro').addEventListener('click', () => playTeaser(null));

// ---------- kayıt yedeği (telefon değişince ya da silmeden önce) ----------
const bkMsg = t => { $('bkMsg').textContent = t; };
$('bkCopy').addEventListener('click', () => {
  const p = prof(); if (!p) { bkMsg('Önce bir kaptan seç.'); return; }
  persist();
  const code = 'DLG1:' + btoa(unescape(encodeURIComponent(JSON.stringify({v:1, n:p.name, s:lsGet(saveKey())}))));
  const fallback = () => { const i = $('bkIn'); i.value = code; i.focus(); i.select(); bkMsg('Kod kutuya yazıldı: seçip kopyala ve bir yere kaydet.'); };
  try { navigator.clipboard.writeText(code).then(() => bkMsg('Yedek kodu kopyalandı. Notlara ya da kendine mesaj olarak kaydet.'), fallback); } catch (e) { fallback(); }
});
$('bkLoad').addEventListener('click', () => {
  const v = $('bkIn').value.trim();
  let d = null;
  try { if (v.startsWith('DLG1:')) d = JSON.parse(decodeURIComponent(escape(atob(v.slice(5))))); } catch (e) { d = null; }
  let sv = null; try { sv = d && JSON.parse(d.s); } catch (e) { sv = null; }
  if (!sv || sv.v !== 3) { bkMsg('Bu kod okunamadı. Kodun tamamını yapıştırdığından emin ol.'); return; }
  let name = cleanName(d.n) || 'Dalgıç', base = name, n = 2;
  while (profiles.some(p => nameKey(p.name) === nameKey(name))) name = (base.slice(0, 13) + ' ' + n++).trim();
  const r = createProfile(name); if (r.err) { bkMsg(r.err); return; }
  lsSet(pKey(r.p.id), d.s);
  r.p.tier = clamp(sv.tier|0, 0, NL - 1); r.p.money = Math.floor(+sv.money || 0); r.p.best = Math.round(+sv.best || 0); r.p.won = !!sv.bossDone; persistIndex();
  $('bkIn').value = ''; switchProfile(r.p.id); renderProfiles();
  bkMsg('Yedek geri yüklendi: ' + name);
});

// ---------- Android geri tuşu ----------
// Sıra: açık pencere/kart kapanır; oyundaysan menüye döner; menüde iki kez basınca çıkar.
let backT = 0;
const capApp = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
function onBack(){
  if (!$('fadeBlack').hidden) return;
  if (!$('teaser').hidden) { closeTeaser(); return; }
  if (!$('legalSheet').hidden) { closeLegal(); return; }
  if (!$('setSheet').hidden) { closeSettings(); return; }
  if (!$('profSheet').hidden) { closeProfiles(); return; }
  if (!$('wpnPick').hidden) { closePick(); return; }
  if (!$('shop').hidden) { $('shop').hidden = true; return; }
  if (!$('elev').hidden) { $('elev').hidden = true; return; }
  if (!$('relicCard').hidden) { $('rcBtn').click(); return; }
  if (!$('endCard').hidden) { $('endBtn').click(); return; }
  if (!$('bossCard').hidden || S.riding) return;
  if ($('intro').hidden) { S.playing = false; persist(); syncDemoBtn(); $('startBtn').textContent = 'Devam et'; $('intro').hidden = false; return; }
  if (Date.now() - backT < 2000) { const a = capApp(); if (a && a.exitApp) a.exitApp(); return; }
  backT = Date.now();
  const h = $('backHint'); h.hidden = false; clearTimeout(onBack.t); onBack.t = setTimeout(() => { h.hidden = true; }, 2000);
}
{ const a = capApp(); if (a && a.addListener) a.addListener('backButton', onBack); }

$('startBtn').addEventListener('click', () => {
  if (!activeId) {
    const r = createProfile($('profFirstIn').value, 'Dalgıç');
    if (r.err) { $('profFirstErr').textContent = r.err; $('profFirstIn').focus(); return; }
    switchProfile(r.p.id);
  }
  const p = prof(); if (p) { p.last = Date.now(); persistIndex(); }
  audio(); mus.on = true; $('intro').hidden = true; S.playing = true;
  const z0 = stationZone(), L0 = z0 > 0 ? z0 : layerOf(diver.y);
  toast(LAYERS[L0].name, 'KAT ' + (L0 + 1) + ' / ' + NL);
  hint('move', 'Ekrana dokun ve sürükle: dalgıç parmağının yönüne yüzer.');
  if (save.relics.includes(NL - 1) && !save.bossDone && !bossOn()) setTimeout(bossIntro, 600);
  else if (save.signal && !save.doorOpened) setTimeout(() => msg('Sinyal hâlâ geliyor: pusulayı izle, Ocean Secret\'in dibine in.', 'var(--relic)'), 900);
});

// ---------- gizli kapı (finalden sonra, Ocean Secret'in dibi) ----------
const DOOR_R = 104, DOOR = {x:BOAT_X, y:WORLD_H - DOOR_R - 14};
const doorOn = () => !!save.signal;
function doorTick(){
  if (!doorOn()) return;
  // Fragmanı kapıya ~1500 m kala indir (açılışta 5 MB yükleme yok).
  if (!save.doorOpened && toM(DOOR.y) - toM(diver.y) < 1500) teaserPreload();
  if (save.doorOpened || !S.playing || S.lifting || bossOn()) return;
  if (dist(diver.x, diver.y, DOOR.x, DOOR.y) < DOOR_R + 18) openDoor();
}
function openDoor(){
  save.doorOpened = true; persist();
  S.playing = false; S.input.fire = false; keys.clear(); diver.vx = diver.vy = 0;
  joy.active = false; aim.active = false; S.input.aim = null;
  sfx('relic'); setTimeout(() => sfx('elev'), 400); buzz([60, 40, 200]);
  msg('Kalp yuvasına oturdu... kapı açılıyor.', 'var(--brass-hi)');
  teaserPreload();
  const f = $('fadeBlack'); f.hidden = false; void f.offsetWidth; f.classList.add('on');
  setTimeout(() => {
    playTeaser(() => { fillEnd(); $('endCard').hidden = false; });
    f.classList.remove('on'); f.hidden = true;
  }, reduceMotion ? 300 : 1500);
}
// Altın kapı: önce gövde (karanlıktan önce), sonra parıltı (karanlığın üstüne, 'lighter').
const RUNES = [[0,-1,0,1],[-1,-1,1,1,-1,1],[-1,0,1,0,0,-1,0,1],[-1,-1,0,1,1,-1],[-1,1,0,-1,1,1,1,-1],[0,-1,1,0,0,1,-1,0,0,-1],[-1,-1,1,-1,0,1],[-1,0,0,-1,1,0,0,1]];
function heartPath(c, x, y, s){
  c.beginPath(); c.moveTo(x, y + s*0.9);
  c.bezierCurveTo(x - s*1.4, y + s*0.05, x - s*0.95, y - s*1.05, x, y - s*0.35);
  c.bezierCurveTo(x + s*0.95, y - s*1.05, x + s*1.4, y + s*0.05, x, y + s*0.9); c.closePath();
}
function drawRunes(c, x, y, R, col, lw){
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 0; i < 16; i++) {
    const a = i/16*Math.PI*2 - Math.PI/2, rx = x + Math.cos(a)*R*0.7, ry = y + Math.sin(a)*R*0.7, g = RUNES[(i*5 + 3) % RUNES.length], s = R*0.055;
    c.save(); c.translate(rx, ry); c.rotate(a + Math.PI/2); c.beginPath();
    for (let k = 0; k < g.length; k += 2) { if (k) c.lineTo(g[k]*s, g[k + 1]*s*1.4); else c.moveTo(g[k]*s, g[k + 1]*s*1.4); }
    c.stroke(); c.restore();
  }
}
function drawDoor(){
  if (!doorOn()) return;
  const sx = DOOR.x - cam.x, sy = DOOR.y - cam.y, R = DOOR_R;
  if (sy < -R*2 || sy > S.H + R*2 || sx < -R*2 || sx > S.W + R*2) return;
  ctx.save();
  // taş niş
  ctx.fillStyle = '#0b1220'; ctx.beginPath(); ctx.arc(sx, sy, R*1.2, Math.PI, 0); ctx.lineTo(sx + R*1.2, sy + R + 14); ctx.lineTo(sx - R*1.2, sy + R + 14); ctx.closePath(); ctx.fill();
  if (DG.art && DG.art.sprite && DG.art.sprite(ctx, 'secret_door', sx, sy, R*2.3)) {
    if (save.doorOpened) { ctx.fillStyle = '#ff4f6a'; heartPath(ctx, sx, sy + 1, R*0.15); ctx.fill(); }
    ctx.restore(); return;
  }
  const g = ctx.createRadialGradient(sx - R*0.3, sy - R*0.35, R*0.1, sx, sy, R);
  g.addColorStop(0, '#ffe9a6'); g.addColorStop(0.45, '#e0aa45'); g.addColorStop(0.85, '#9a6619'); g.addColorStop(1, '#5c3a0c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = '#4a2e08'; ctx.lineWidth = 4; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(74,46,8,.85)';
  for (const k of [0.86, 0.54]) { ctx.beginPath(); ctx.arc(sx, sy, R*k, 0, 7); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,236,170,.35)'; ctx.lineWidth = 1.5;
  for (const k of [0.88, 0.56]) { ctx.beginPath(); ctx.arc(sx, sy, R*k, Math.PI*1.05, Math.PI*1.7); ctx.stroke(); }
  // kasa kolları
  ctx.strokeStyle = 'rgba(74,46,8,.7)'; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) { const a = i/8*Math.PI*2 + Math.PI/8; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a)*R*0.3, sy + Math.sin(a)*R*0.3); ctx.lineTo(sx + Math.cos(a)*R*0.5, sy + Math.sin(a)*R*0.5); ctx.stroke(); }
  drawRunes(ctx, sx, sy, R, 'rgba(40,24,4,.8)', 3);
  // kalp yuvası
  ctx.fillStyle = '#2a1804'; heartPath(ctx, sx, sy, R*0.2); ctx.fill();
  ctx.strokeStyle = '#ffe9a6'; ctx.lineWidth = 1.5; ctx.stroke();
  if (save.doorOpened) { ctx.fillStyle = '#ff4f6a'; heartPath(ctx, sx, sy + 1, R*0.15); ctx.fill(); }
  ctx.restore();
}
function drawDoorGlow(){
  if (!doorOn()) return;
  const sx = DOOR.x - cam.x, sy = DOOR.y - cam.y, R = DOOR_R;
  if (sy < -R*3 || sy > S.H + R*3) return;
  const p = 0.5 + 0.5*Math.sin(S.t*2.2), k = save.doorOpened ? 0.45 : 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // hale yalnız kapının dışında (altın yüzeyi beyaza yakmasın)
  let g = ctx.createRadialGradient(sx, sy, R*0.9, sx, sy, R*2.1);
  g.addColorStop(0, 'rgba(79,230,255,0)'); g.addColorStop(0.1, `rgba(79,230,255,${(0.2 + 0.14*p)*k})`); g.addColorStop(1, 'rgba(79,230,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R*2.1, 0, 7); ctx.fill();
  if (!(DG.art && DG.art.has && DG.art.has('secret_door'))) drawRunes(ctx, sx, sy, R, `rgba(120,240,255,${(0.55 + 0.4*p)*k})`, 2.2);
  g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R*0.42);
  g.addColorStop(0, save.doorOpened ? `rgba(255,120,140,${0.5 + 0.3*p})` : `rgba(140,245,255,${0.4 + 0.35*p})`); g.addColorStop(1, 'rgba(79,230,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R*0.42, 0, 7); ctx.fill();
  ctx.restore();
}
// Pusula: dalgıçtan kapıya yön ve derinlik farkı. Sinyal varken ve kapı kapalıyken görünür.
function updateSignal(){
  const on = doorOn() && !save.doorOpened && !bossOn() && !S.riding;
  const el = $('sig');
  if ((setHid(el, !on) || memo('sig:t', S.t|0)) && on) placeSig();
  if (!on) return;
  const dm = toM(DOOR.y) - toM(diver.y), d = dist(diver.x, diver.y, DOOR.x, DOOR.y), near = d < 400;
  const a = Math.atan2(DOOR.y - diver.y, DOOR.x - diver.x)*180/Math.PI - 90;
  setSty($('sigArrow'), 'transform', 'rotate(' + a.toFixed(0) + 'deg)');
  setTxt($('sigDist'), near ? 'KAPI BURADA' : (dm >= 0 ? '↓ ' : '↑ ') + fmtM(Math.abs(dm)));
  if (memo('sig:near', near)) el.classList.toggle('near', near);
}
// Dar ekranda dalış bilgisayarı panelinin altına (sağdaki para paneli uzayabiliyor), genişte üst ortada, mesaj şeridinin altında.
let sigBot = 0;   // pusulanın alt kenarı: "▲ TEKNE" göstergesi onun altına iner
function placeSig(){
  const el = $('sig'), dc = document.querySelector('#hud .dc');
  const side = S.W < 600 && dc;
  let top;
  if (side) { const r = dc.getBoundingClientRect(); top = r.bottom + 10; el.style.left = r.left + 'px'; }
  else { top = Math.max(hudBottom + 30, S.H > 500 ? 236 : 0); el.style.left = ''; }   // #msg (184 px) ile #warn'ın altında
  el.style.top = top + 'px';
  el.classList.toggle('side', !!side);
  sigBot = top + (el.offsetHeight || 54);
}
addEventListener('resize', () => { if (!$('sig').hidden) placeSig(); });

// ---------- DALGIÇ 2 fragmanı ----------
// Kapı açılınca (ve bitiş kartından / girişten tekrar) tam ekran video; bitince son kare + başlık ~3 sn, sonra Devam.
// Süre videodan gelir ('ended'); yüklenemezse doğrudan son kare + başlık. Sesli oynatmayı dener, olmazsa sessiz + ses düğmesi.
const TZ_SRC = 'assets/video/teaser.mp4', TZ_POSTER = 'assets/video/teaser_poster.jpg', TZ_END = 'assets/video/teaser_end.jpg';
const tz = {phase:'off', onDone:null, timers:[]};
function teaserPreload(){
  const im = $('tzEnd'); if (!im.getAttribute('src')) im.src = TZ_END;
  const v = $('tzVid'); if (v.getAttribute('src')) return;
  v.poster = TZ_POSTER; v.preload = 'auto'; v.src = TZ_SRC;
  try { v.load(); } catch (e) {}
}
const tzLater = (f, ms) => tz.timers.push(setTimeout(f, ms));
function tzClear(){ for (const t of tz.timers) clearTimeout(t); tz.timers = []; }
function playTeaser(onDone){
  teaserPreload(); tzClear();
  tz.onDone = onDone || null; tz.phase = 'vid'; S.cine = true;
  S.input.fire = false; keys.clear();
  const el = $('teaser'), v = $('tzVid');
  el.classList.remove('title'); el.hidden = false;
  $('tzNext').hidden = true; $('tzSkip').hidden = false;
  const sound = () => { $('tzSound').hidden = !(tz.phase === 'vid' && v.muted); };
  const fail = () => { if (tz.phase === 'vid') teaserTitle(); };
  v.onended = fail;
  v.onerror = fail;
  v.onloadedmetadata = () => { if (tz.phase === 'vid' && isFinite(v.duration)) tzLater(fail, (v.duration + 6)*1000); };
  if (v.error) { fail(); return; }
  try { v.currentTime = 0; } catch (e) {}
  v.muted = !!save.muted; sound();
  const pr = v.play();
  if (pr && pr.catch) pr.catch(err => {
    if (tz.phase !== 'vid') return;
    if (err && err.name === 'NotAllowedError' && !v.muted) { v.muted = true; sound(); v.play().catch(fail); }
    else fail();
  });
  // ağ takılırsa: 8 sn'de hiç ilerlemediyse kapanış karesine geç; süre bilinmiyorsa en çok 40 sn
  tzLater(() => { if (!(v.currentTime > 0.2)) fail(); }, 8000);
  if (isFinite(v.duration) && v.duration > 0) tzLater(fail, (v.duration + 6)*1000); else tzLater(fail, 40000);
}
function teaserTitle(){
  if (tz.phase !== 'vid') return;
  tz.phase = 'title'; tzClear();
  try { $('tzVid').pause(); } catch (e) {}
  $('tzSound').hidden = true;
  save.teaserSeen = true; persist(); syncProfile();
  $('teaser').classList.add('title');
  tzLater(() => {
    if (tz.phase !== 'title') return;
    $('tzNext').hidden = false; $('tzSkip').hidden = true;
    try { $('tzNext').focus({preventScroll:true}); } catch (e) {}
  }, reduceMotion ? 1200 : 3000);
}
function closeTeaser(){
  if (tz.phase === 'off') return;
  if (tz.phase === 'vid') { save.teaserSeen = true; persist(); syncProfile(); }
  tz.phase = 'off'; tzClear();
  const v = $('tzVid'); try { v.pause(); } catch (e) {}
  $('teaser').hidden = true; $('teaser').classList.remove('title'); S.cine = false;
  const f = tz.onDone; tz.onDone = null; if (f) f();
}
$('tzSkip').addEventListener('click', closeTeaser);
$('tzNext').addEventListener('click', closeTeaser);
$('tzSound').addEventListener('click', () => {
  const v = $('tzVid'); v.muted = false; $('tzSound').hidden = true;
  if (v.paused && tz.phase === 'vid') v.play().catch(() => {});
});
$('tzEnd').addEventListener('error', () => $('tzEnd').classList.add('bad'));
$('tzEnd').addEventListener('load', () => $('tzEnd').classList.remove('bad'));

// ---------- oyun mantığı ----------
function wakeAtStation(){
  const s = stationAbove(diver.y + 1);
  const p = stationPos(s);
  diver.x = p.x; diver.y = s === 0 ? 0 : p.y - 50; diver.vx = diver.vy = 0; camLX = camLY = leanX = leanY = 0;
  save.station = s;
}
function faint(){
  const lost = S.bag.length, hadRelic = S.relicHeld !== false;
  sfx('faint'); buzz(200);
  S.bag = []; bagBonus = 0; S.relicHeld = false; diving = false; S.lifting = false; S.inkT = S.slowT = 0;
  wakeAtStation(); S.o2 = gTank(); if (!bossOn()) { generate(); S.mons = S.mons.filter(m => m.rid != null); } persist();
  msg(hadRelic ? 'Bayıldın! Eser de çanta da derinlere geri döndü.' : lost ? 'Bayıldın! Çantadaki ' + lost + ' parça denizde kaldı.' : 'Bayıldın! İstasyon seni çekti.', 'var(--danger)');
}
const boatHalf = () => Math.max(120, SHIPS[save.tier].len*1.05 + 12);
function stationZone(pad){
  pad = pad || 0;
  if (diver.y < 25 + pad && Math.abs(diver.x - BOAT_X) < boatHalf() + pad) return 0;
  for (let s = 1; s <= save.tier; s++) if (dist(diver.x, diver.y, BOAT_X, LTOP[s]) < STATION_R + pad) return s;
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
  // satılan hazineler bir daha çıkmaz
  for (const it of S.bag) if (it.id != null) { const a = save.taken[it.L] || (save.taken[it.L] = []); if (!a.includes(it.id)) a.push(it.id); }
  S.bag = []; bagBonus = 0; save.station = s;
  if (S.relicHeld !== false) {
    const L = S.relicHeld; S.relicHeld = false;
    if (!save.relics.includes(L)) save.relics.push(L);
    mods = relicMods(); sfx('relic'); buzz([60, 40, 120]);
    relicCard(L);
  }
  // Hazineler yenilenir; canavarlar yerinde kalır (öldürülenler geri gelmez). Finalden kalan geçici canavarlar temizlenir.
  if (!bossOn()) { generate(); S.mons = S.mons.filter(m => m.rid != null); }
  persist();
  hint('station', 'İstasyondasın: hava doldu, ganimet satıldı. Dükkân ve Asansör düğmeleri solda.');
}
function startDive(){ diving = true; save.dives++; retWarned = false; }
function update(dt){
  S.t += dt; S.dt = dt;
  const [ax, ay] = S.playing && !S.lifting ? moveInput() : [0, 0];
  const sp = gSpeed();
  if (S.lifting) {
    const p = stationPos(S.liftTo), li = layerOf(diver.y);
    let ty = S.liftTo === 0 ? 0 : p.y - 50;
    // Raf altındaysan önce boşluğa yanaş: yoksa balon kayayı delip geçiyordu.
    if (li > 0 && Math.abs(diver.x - BOAT_X) > SHAFT_HALF - 40) ty = Math.max(ty, LTOP[li] + LEDGE_HALF + 40);
    // Hedefe yaklaşınca yavaşla, varınca dur: yoksa hız istasyonun ötesine fırlatıyordu.
    const dx = p.x - diver.x, dy = ty - diver.y, L = Math.hypot(dx, dy) || 1, s2 = Math.min(Math.max(sp, 200)*2.6, L*4 + 60);
    diver.vx += (dx/L*s2 - diver.vx)*Math.min(1, dt*6); diver.vy += (dy/L*s2 - diver.vy)*Math.min(1, dt*6);
    if (L < 30) { S.lifting = false; diver.vx *= 0.15; diver.vy *= 0.15; }
  } else {
    // Sıkı tutuş: parmak kalkınca dalgıç kısa sürede durur. Hız patlamasında eski süzülme korunur ki atılış boyu kısalmasın.
    const dashing = !!(DG.wpn && DG.wpn.dashActive && DG.wpn.dashActive());
    const has = ax || ay, f = Math.min(1, dt*(has ? 9 : dashing ? 2.5 : 6));
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

  const zone = stationZone(); curStationZone = zone;
  // Derin istasyon kendi katının başı sayılır (dalgıç rafın 50 px üstünde, yani bir üst katta durur).
  const m = toM(diver.y), L = zone > 0 ? zone : layerOf(diver.y), maxO2 = gTank();
  if (S.playing) {
    save.playT += dt;
    const over = diver.y > limitY() + 8;
    if (zone >= 0) { S.o2 = Math.min(maxO2, S.o2 + dt*maxO2/1.5); setHid($('warn'), true); }
    else {
      const f = clamp((diver.y - LTOP[L])/LH(L), 0, 1);
      let rate = 1 + f*(1 + 0.2*L);
      if (over) { rate += 0.15*maxO2; overT -= dt; if (overT <= 0) { sfx('warn'); overT = 0.6; } }
      setHid($('warn'), !over);
      S.o2 -= rate*dt;
    }
    if (!diving && stationZone(70) < 0) startDive();
    if (zone >= 0 && diving) arriveAtStation(zone);
    if (m > save.best) { if (save.best > 30 && m > lastBestShown + 50) { lastBestShown = m; float(diver.x, diver.y - 44, 'REKOR ' + fmtM(m), '#5ad8ff'); } save.best = m; }
    if (L !== lastLayer) { if (lastLayer >= 0) toast(LAYERS[L].name, 'KAT ' + (L + 1) + ' / ' + NL + ' · ' + fmtM(LAYERS[L].top)); lastLayer = L; }

    for (const it of S.items) {
      if (it.taken || Math.abs(it.y - diver.y) > 40) continue;
      if (dist(it.x, it.y, diver.x, diver.y) < 26) {
        if (it.secret) {
          it.taken = true; save.secrets.push(it.L);
          reward(it.value, it.x, it.y - 24, 'GİZEM');
          sfx('relic'); buzz([60, 40, 160]); if (DG.fx && DG.fx.burst) DG.fx.burst(it.x, it.y, '#ff7af2', 24, 260);
          toast('Gizem bulundu!', LAYERS[it.L].name.toLocaleUpperCase('tr-TR') + ' · +' + fmtMoney(it.value));
          persist(); continue;
        }
        if (it.relic) {
          if (S.relicHeld !== false) continue;
          it.taken = true; S.relicHeld = it.L; sfx('relic'); buzz(60);
          float(it.x, it.y - 24, it.def.n + '!', it.def.c);
          msg(it.def.n + ' elinde! Bir istasyona götür.', 'var(--relic)');
        } else if (S.bag.length < gBag()) {
          if (!diving) startDive();
          it.taken = true; S.bag.push(it); sfx('pick');
          float(it.x, it.y - 18, it.def.n + ' ' + fmtMoney(it.value), it.def.c);
        } else if (save.inv.spareBag > 0) {
          // Çanta dolu: önce yedek çanta açılır; parça bir sonraki karede alınır.
          save.inv.spareBag--; const add = Math.ceil(bagAt(save.lv.bag)*0.5); bagBonus += add; persist();
          msg('Yedek çanta açıldı! +' + add + ' yer', 'var(--amber)');
        } else {
          // Yedek çanta yok: daha değerli bir parça en ucuzla yer değiştirir.
          let lo = 0;
          for (let i = 1; i < S.bag.length; i++) if (S.bag[i].value < S.bag[lo].value) lo = i;
          if (S.bag.length && it.value > S.bag[lo].value*1.15) {
            S.bag[lo] = it; it.taken = true; sfx('pick');
            float(it.x, it.y - 18, 'Takas: ' + it.def.n + ' ' + fmtMoney(it.value), it.def.c);
          } else if (S.t - fullMsgT > 2.5) { fullMsgT = S.t; msg('Çanta dolu! Daha değerli parçalar ucuzlarla yer değiştirir. Satmak için istasyona dön.', 'var(--amber)'); }
        }
      }
    }
    if (S.o2 <= 0) {
      if (save.inv.spareTank > 0 && zone < 0) { save.inv.spareTank--; S.o2 = maxO2*0.6; persist(); msg('Yedek tüpe geçildi! Hemen istasyona dön.', 'var(--amber)'); sfx('warn'); buzz(120); }
      else faint();
    }
  }

  if (DG.wpn && DG.wpn.update) DG.wpn.update(dt);
  if (DG.mon && DG.mon.update) {
    const near = Math.max(1500, S.H*2);
    for (const mm of S.mons) if (Math.abs(mm.y - diver.y) < near) DG.mon.update(mm, dt);
  }
  if (DG.mon && DG.mon.updateHazard) { const near = Math.max(1500, S.H*2); for (const hz of S.hazards) if (Math.abs(hz.y - diver.y) < near) DG.mon.updateHazard(hz, dt); }
  if (S.mons.some(mm => mm.dead)) S.mons = S.mons.filter(mm => !mm.dead);
  if (killDirty && S.t - lastSaveT > 2) { killDirty = false; lastSaveT = S.t; persist(); }
  if (DG.boss && DG.boss.update) DG.boss.update(dt);
  if (DG.fx && DG.fx.update) DG.fx.update(dt);

  bubbleT -= dt;
  if (diver.y > 4 && bubbleT <= 0) { bubbleT = rand(0.18, 0.4); bubbles.push({x:diver.x + Math.cos(diver.ang)*20*diver.flip, y:diver.y + Math.sin(diver.ang)*20 - 4, r:rand(1.5, 3.5), vy:-rand(30, 55), ph:rand(0, 6.28)}); }
  for (const b of bubbles) { b.y += b.vy*dt; b.ph += dt*4; b.x += Math.sin(b.ph)*0.4; }
  bubbles = bubbles.filter(b => b.y > 0 && b.y > diver.y - 500);
  for (const fl of floaters) { fl.t += dt; fl.y -= 26*dt; }
  floaters = floaters.filter(fl => fl.t < 1.6);

  // Kamera gidilen yöne bakar: hızlı dalışta da önden geleni görürsün.
  camLX += (clamp(diver.vx*0.22, -S.W*0.22, S.W*0.22) - camLX)*Math.min(1, dt*3);
  camLY += (clamp(diver.vy*0.3, -S.H*0.25, S.H*0.25) - camLY)*Math.min(1, dt*3);
  // Hücum hazırlığında kamera canavarın kafasına doğru kayar (gözler ekranda kalsın).
  const bf = bossOn() && DG.boss.focus ? DG.boss.focus() : null;
  const lx = bf ? clamp(bf.x - diver.x, -S.W*0.7, S.W*0.7)*0.4 : 0, ly = bf ? clamp(bf.y - diver.y, -S.H*0.5, S.H*0.5)*0.3 : 0;
  leanX += (lx - leanX)*Math.min(1, dt*3); leanY += (ly - leanY)*Math.min(1, dt*3);
  cam.x = WORLD_W > S.W ? clamp(diver.x + camLX + leanX - S.W/2, 0, WORLD_W - S.W) : (WORLD_W - S.W)/2;
  // Final dövüşünde tekne ve gökyüzü daha çok görünsün.
  cam.y += (Math.max(-S.H*(bossOn() ? 0.38 : 0.3), diver.y - S.H*0.45 + camLY + leanY) - cam.y)*Math.min(1, dt*8);

  doorTick();
  updateHUD(m, L, maxO2, zone);
}
function updateHUD(m, L, maxO2, zone){
  setTxt($('hDepth'), Math.round(m).toLocaleString('tr-TR'));
  setTxt($('hAtm'), (1 + m/10).toFixed(m < 1000 ? 1 : 0).replace('.', ','));
  const bagEl = $('hBag');
  setTxt(bagEl, S.bag.length + '/' + gBag() + (S.relicHeld !== false ? ' +★' : ''));
  bagEl.classList.toggle('bagfull', S.bag.length >= gBag() && S.relicHeld === false);
  bagEl.classList.toggle('relicOn', S.relicHeld !== false);
  const frac = clamp(S.o2/maxO2, 0, 1);
  setTxt($('hAir'), Math.max(0, Math.ceil(S.o2)));
  setSty($('hAirFill'), 'width', (frac*100).toFixed(1) + '%');
  // Dönüş işareti: bir üstteki istasyona varmak için gereken hava (pay ile).
  let rf = 0;
  if (zone < 0) {
    const st = stationPos(stationAbove(diver.y));
    const secs = dist(diver.x, diver.y, st.x, st.y)/(speedAt(save.tier, save.lv.speed)*mods.speed);
    const f = clamp((diver.y - LTOP[L])/LH(L), 0, 1);
    rf = clamp(secs*(1 + f*(1 + 0.2*L))*1.25/maxO2, 0, 1);
  }
  const ret = $('hAirRet'); setHid(ret, zone >= 0 || rf < 0.02); setSty(ret, 'left', (rf*100).toFixed(1) + '%');
  const late = S.playing && zone < 0 && rf > 0.02 && frac < rf + 0.06;
  if (late && !retWarned) { retWarned = true; msg('DÖN! Havan istasyona ancak yeter.', 'var(--danger)'); sfx('warn'); buzz(100); }
  $('hAirBox').classList.toggle('low', zone < 0 && (frac < 0.25 || late));
  if (save.money < shownMoney || Math.abs(save.money - shownMoney) < 1) shownMoney = save.money;
  else shownMoney += (save.money - shownMoney)*Math.min(1, S.dt*5);
  setTxt($('hMoney'), demo ? '₺∞ DEMO' : fmtMoney(shownMoney));
  let carry = 0; for (const it of S.bag) carry += it.value;
  setHid($('hCarry'), !S.bag.length); setHid($('hBestBox'), !!S.bag.length);
  if (S.bag.length) setTxt($('hCarryV'), fmtMoney(carry));
  setTxt($('hBest'), Math.round(save.best).toLocaleString('tr-TR'));
  setTxt($('hStage'), 'KAT ' + (L + 1) + '/' + NL + (S.W > 430 ? ' · ' + LAYERS[L].name.toLocaleUpperCase('tr-TR') : '') + (save.ng ? ' · S+' + save.ng : ''));
  const rEl = $('hRoster'), rOk = L <= save.tier && rosterN[L] > 0;
  setHid(rEl, !rOk);
  if (rOk) { const cl = save.cleared.includes(L); setTxt(rEl, cl ? 'TEMİZLENDİ ✓' : 'CANAVAR ' + leftN(L) + '/' + rosterN[L]); if (memo('hRoster:c', cl)) rEl.classList.toggle('clr', cl); }
  // İstasyon bölgesine girip çıkınca Dükkân/Asansör ile düğme kümesi aynı karede yer değiştirir.
  if (memo('core:zone', zone) || (S.t*4|0) !== ((S.t - S.dt)*4|0)) updateCtx();
  updateControls();
  updateSignal();
}
function nextGoal(){
  if (save.bossDone) { const c = ngCost(); return {txt:'HEDEF: YENİ SEFER+ ' + fmtMoney(c), f:demo ? 1 : save.money/c}; }
  if (!gearDone()) {
    // Önce geliri hemen artıran ekipman. Sığ sınırda karanlık yokken ışık yükseltmesi fark edilmez, sona kalır.
    const PRI = ['suit','bag','tank','speed','armor','light'];
    const dim = darkAtM(toM(limitY())) < 0.4;
    let best = null;
    for (const k of PRI) { const lv = save.lv[k]; if (lv < 3) { const c = upCost(k, lv + 1), e = c*(k === 'light' && dim ? 3 : 1); if (!best || e < best.e*0.75) best = {k, c, e}; } }
    return {txt:'SIRADAKİ: ' + TRACK_LABEL[best.k] + ' ' + fmtMoney(best.c), f:demo ? 1 : save.money/best.c};
  }
  if (!relicDone()) return {txt:save.tier === NL - 1 ? 'HEDEF: OCEAN SECRET\'İN KALBİ' : 'HEDEF: KATIN ESERİ · ' + fmtM(LAYERS[save.tier].bot), f:clamp(save.best/LAYERS[save.tier].bot, 0, 1)};
  if (save.tier < NL - 1) return {txt:'HEDEF: ASANSÖRLE YENİ KAT', f:1};
  return {txt:'HEDEF: FİNAL CANAVARI', f:1};
}
function updateGoal(){
  const g = nextGoal(), f = clamp(g.f, 0, 1);
  $('hGoal').hidden = !S.playing;
  $('hGoalTxt').textContent = g.txt;
  $('hGoalFill').style.width = (f*100) + '%';
  $('hGoal').classList.toggle('ok', f >= 1);
}
function updateCtx(){
  updateGoal();
  const show = S.playing && curStationZone >= 0 && !bossOn();
  setHid($('ctx'), !show);
  if (setHid($('opts'), S.playing && (curStationZone < 0 || bossOn()))) hudBottom = $('hud').getBoundingClientRect().bottom;
  if (!show) { $('shop').hidden = true; $('elev').hidden = true; }
  const n = affordableCount(), b = $('shopBadge'); b.hidden = n === 0; b.textContent = n;
  $('elevBtn').classList.toggle('ready', elevReady());
}
const SK_SHORT = {lift:'BALON', shock:'ŞOK', flare:'FİŞEK', sonar:'SONAR', camo:'KAMUFLAJ', combo:'KOMBO'};
function updateControls(){
  if (pickT > 0) { pickT -= S.dt; if (pickT <= 0) closePick(); }
  // İstasyonda düğme kümesi gizlenir: altında kalan Dükkân/Asansör düğmelerine basılabilsin.
  const show = S.playing && diver.y > 30 && (curStationZone < 0 || bossOn());
  setHid($('controls'), !show);
  if (!show) { if (!$('wpnPick').hidden) closePick(); return; }
  setHid(fireBtn, save.ctrl === 2);
  const w = WEAPONS.find(x => x.id === save.curWpn) || WEAPONS[0];
  setTxt($('wpnName'), DG.wpn && DG.wpn.shortName ? DG.wpn.shortName(w.id) : w.n.split(' ')[0].toLocaleUpperCase('tr-TR'));
  const fi = DG.wpn && DG.wpn.fireInfo ? DG.wpn.fireInfo() : {frac:0};
  setSty(fireBtn, '--p', clamp(fi.frac || 0, 0, 1).toFixed(3));
  const dashInfo = DG.wpn && DG.wpn.skillInfo ? DG.wpn.skillInfo('dash') : {frac:0};
  setSty($('btnDash'), '--p', clamp(dashInfo.frac || 0, 0, 1).toFixed(3));
  for (let i = 0; i < 3; i++) {
    const b = $('btnSk' + i), id = save.equip[i];
    setHid(b, !id); if (!id) continue;
    const s = SKILLS.find(x => x.id === id), info = DG.wpn && DG.wpn.skillInfo ? DG.wpn.skillInfo(id) : {frac:0, active:false};
    const t = SK_SHORT[id] || s.n.split(' ')[0].toLocaleUpperCase('tr-TR');
    if (memo(b.id + ':t', t)) b.firstChild.textContent = t;
    setSty(b, '--p', clamp(info.frac || 0, 0, 1).toFixed(3));
    b.classList.toggle('active', !!info.active);
  }
}

// ---------- çizim ----------
function drawWalls(){
  const yStart = Math.max(0, cam.y - 20), yEnd = cam.y + S.H + 20;
  if (yEnd <= 0) return;
  ctx.fillStyle = rgb(wallColor((yStart + yEnd)/2));
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
    const c = ledgeColor(i);
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
        for (let k = 0; k < 5; k++) { const ph = (((S.t*0.6 + k*0.2 + mx*0.01) % 1) + 1) % 1; ctx.fillStyle = `rgba(60,50,50,${0.6*(1 - ph)})`; ctx.beginPath(); ctx.arc(mx + Math.sin(ph*9 + k)*10, by - 86 - ph*180, 9 + ph*24, 0, 7); ctx.fill(); }
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
// Asansör halatı: koyu çelik gövde, ince parlak kenar, aralıklı kelepçeler (kaydıkça derinlik hissi verir).
function drawCable(x, y0, y1){
  if (y1 <= y0) return;
  ctx.strokeStyle = 'rgba(12,18,24,.8)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  ctx.strokeStyle = 'rgba(190,206,216,.32)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 0.8, y0); ctx.lineTo(x - 0.8, y1); ctx.stroke();
  for (let wy = Math.ceil((y0 + cam.y)/360)*360; wy - cam.y < y1; wy += 360) {
    const sy = wy - cam.y;
    ctx.fillStyle = '#4a545e'; ctx.fillRect(x - 4, sy - 3, 8, 6);
    ctx.fillStyle = 'rgba(210,222,230,.35)'; ctx.fillRect(x - 4, sy - 3, 8, 1);
  }
}
function drawStation(x, y, s){
  const w = 50, top = y - 98, bot = y + 2;
  // arka cam ve içeriden gelen sıcak ışık
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, 'rgba(255,190,105,.26)'); g.addColorStop(0.45, 'rgba(38,50,62,.6)'); g.addColorStop(1, 'rgba(14,22,30,.8)');
  ctx.fillStyle = g; ctx.fillRect(x - w, top, w*2, bot - top);
  ctx.strokeStyle = 'rgba(78,92,106,.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - w, top + 8); ctx.lineTo(x + w, bot - 8); ctx.moveTo(x + w, top + 8); ctx.lineTo(x - w, bot - 8); ctx.stroke();
  // hava tüpleri ve kontrol paneli
  for (let k = 0; k < 2; k++) {
    const tx = x - w + 8 + k*12;
    ctx.fillStyle = '#e2ad2a'; rr(tx, bot - 36, 9, 32, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(tx + 1.5, bot - 32, 2, 24);
    ctx.fillStyle = '#9aa6b2'; ctx.fillRect(tx + 3, bot - 40, 3, 5);
  }
  ctx.fillStyle = '#0c1813'; ctx.fillRect(x + w - 24, top + 26, 16, 20);
  ctx.fillStyle = 'rgba(95,214,164,.85)';
  for (let k = 0; k < 3; k++) ctx.fillRect(x + w - 22, top + 30 + k*5, 6 + ((S.t*3 + k*1.7 + s)%1)*6, 2);
  // çerçeve: dikmeler, kirişler, güverte
  ctx.fillStyle = '#28313b';
  ctx.fillRect(x - w - 5, top - 4, 7, bot - top + 4); ctx.fillRect(x + w - 2, top - 4, 7, bot - top + 4);
  ctx.fillRect(x - w - 8, top - 10, w*2 + 16, 8);
  ctx.fillStyle = '#343e49'; ctx.fillRect(x - w - 12, bot - 2, w*2 + 24, 9);
  ctx.fillStyle = 'rgba(205,218,228,.32)';
  ctx.fillRect(x - w - 8, top - 10, w*2 + 16, 1.5); ctx.fillRect(x - w - 5, top - 2, 1.2, bot - top); ctx.fillRect(x + w - 2, top - 2, 1.2, bot - top);
  ctx.save(); ctx.beginPath(); ctx.rect(x - w - 12, bot + 2, w*2 + 24, 5); ctx.clip();
  ctx.fillStyle = '#e8b830'; for (let k = -2; k < 16; k++) { const sx = x - w - 12 + k*9; ctx.beginPath(); ctx.moveTo(sx, bot + 7); ctx.lineTo(sx + 5, bot + 2); ctx.lineTo(sx + 9, bot + 2); ctx.lineTo(sx + 4, bot + 7); ctx.fill(); }
  ctx.restore();
  // vinç gövdesi ve uyarı ışığı
  ctx.fillStyle = '#3a444e'; ctx.beginPath(); ctx.moveTo(x - 36, top - 10); ctx.lineTo(x - 24, top - 26); ctx.lineTo(x + 24, top - 26); ctx.lineTo(x + 36, top - 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(205,218,228,.28)'; ctx.fillRect(x - 24, top - 26, 48, 1.2);
  ctx.fillStyle = '#1a2129'; ctx.beginPath(); ctx.arc(x, top - 18, 5, 0, 7); ctx.fill();
  const bl = 0.5 + 0.5*Math.sin(S.t*4 + s);
  ctx.fillStyle = `rgba(255,186,70,${0.45 + 0.55*bl})`; ctx.beginPath(); ctx.arc(x, top - 30, 3.5, 0, 7); ctx.fill();
  // pirinç levha
  ctx.font = '700 10px "Chakra Petch", monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#8a5f1c'; rr(x - 45, top - 58, 90, 19, 4); ctx.fill();
  ctx.fillStyle = '#d9a441'; rr(x - 44, top - 57, 88, 17, 3); ctx.fill();
  ctx.fillStyle = '#1b1205'; ctx.fillText('İSTASYON ' + s, x, top - 45);
  ctx.fillStyle = 'rgba(230,244,247,.8)'; ctx.fillText(fmtM(LAYERS[s].top), x, top - 64);
}
function drawShaftAndStations(){
  const deepest = LTOP[save.tier];
  const x = BOAT_X - cam.x;
  if (save.tier > 0 && -cam.y < S.H && deepest - cam.y > 0) {
    const y0 = Math.max(0, -cam.y), y1 = Math.min(S.H, deepest - 108 - cam.y);
    drawCable(x - 30, y0, y1); drawCable(x + 30, y0, y1);
  }
  for (let s = 1; s < NL; s++) {
    const y = LTOP[s] - cam.y; if (y < -140 || y > S.H + 180) continue;
    const built = s <= save.tier;
    if (!built) {
      ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(255,90,78,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - SHAFT_HALF, y); ctx.lineTo(x + SHAFT_HALF, y); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    ctx.fillStyle = '#3a434c'; ctx.fillRect(x - SHAFT_HALF, y + LEDGE_HALF - 10, 70, 10); ctx.fillRect(x + SHAFT_HALF - 70, y + LEDGE_HALF - 10, 70, 10);
    ctx.fillStyle = '#ffcf3a'; for (let k = 0; k < 6; k++) { ctx.fillRect(x - SHAFT_HALF + k*12, y + LEDGE_HALF - 10, 6, 3); ctx.fillRect(x + SHAFT_HALF - 70 + k*12, y + LEDGE_HALF - 10, 6, 3); }
    drawStation(x, y, s);
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
  if (DG.art && DG.art.shape(ctx, s, c, x, y, time, scale)) return;
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
// Gizem: yakında (130 px) ya da sonarla belirgin; uzaktan arada bir zayıf bir pırıltı.
function secretVis(it){
  if (DG.wpn && DG.wpn.sonarActive && DG.wpn.sonarActive()) return 1;
  return clamp(1 - (dist(it.x, it.y, diver.x, diver.y) - 70)/60, 0, 1);
}
function drawSecret(it, sx, sy){
  const v = secretVis(it), tw = Math.pow(Math.max(0, Math.sin(S.t*0.9 + it.ph)), 24);
  const a = Math.max(v, 0.35*tw);
  if (a < 0.02) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.translate(sx, sy); ctx.rotate(S.t*0.8);
  ctx.fillStyle = '#ff7af2'; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const r = i%2 ? 4 : 11, an = i*Math.PI/4; ctx.lineTo(Math.cos(an)*r, Math.sin(an)*r); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 7); ctx.fill();
  ctx.restore();
}
function drawItems(){
  for (const it of S.items) {
    if (it.taken) continue;
    const sy = it.y - cam.y; if (sy < -40 || sy > S.H + 40) continue;
    const sx = it.x - cam.x; if (sx < -40 || sx > S.W + 40) continue;
    const by = sy + Math.sin(S.t*2 + it.ph)*2;
    if (it.secret) { drawSecret(it, sx, by); continue; }
    if (!(it.relic && DG.art && DG.art.relic(ctx, it.L, sx, by, S.t + it.ph, 1.6))) drawShape(it.def.s, it.def.c, sx, by, S.t + it.ph, it.relic ? 1.6 : 1);
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
  if (!(DG.art && DG.art.diver(ctx, x, y, st.bulk, save.tier))) {
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
  }
  if (S.relicHeld !== false) { const r = LAYERS[S.relicHeld].relic, ry = y - (S.lifting ? 90 : 30); if (!(DG.art && DG.art.relic(ctx, S.relicHeld, x, ry, S.t, 0.9))) drawShape(r.s, r.c, x, ry, S.t, 0.9); }
}
function drawBoat(){
  const x = BOAT_X - cam.x, y = -cam.y;
  if (y < -160 || y > S.H + 60) return;
  const sh = SHIPS[save.tier], L = sh.len, bob = Math.sin(S.t*1.4)*2;
  ctx.save(); ctx.translate(x, y + bob);
  if (DG.boss && DG.boss.boatTint) DG.boss.boatTint(ctx);
  if (DG.art && DG.art.ship(ctx, save.tier, L)) { ctx.restore(); return; }
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
  ctx.fillStyle = (DG.fx && DG.fx.storm && DG.fx.storm() > 0.5) ? 'rgba(205,220,228,.45)' : 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.moveTo(0, y - 2);
  for (let x = 0; x <= S.W + 10; x += 10) ctx.lineTo(x, y + Math.sin((x + cam.x)*0.05 + S.t*2)*2);
  ctx.lineTo(S.W + 10, y + 3); ctx.lineTo(0, y + 3); ctx.closePath(); ctx.fill();
}
function drawDarkness(){
  const alpha = (DG.boss && DG.boss.active && DG.boss.active()) ? 0 : darkAtM(toM(diver.y));
  S.darkAlpha = alpha;
  if (alpha <= 0.01) return 0;
  const W = S.W, H = S.H;
  dctx.setTransform(DK_SCALE, 0, 0, DK_SCALE, 0, 0);
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
  if (doorOn()) hole(DOOR.x - cam.x, DOOR.y - cam.y, DOOR_R*2.6, save.doorOpened ? 0.6 : 0.85);
  if (DG.mon && DG.mon.hazardLight) for (const hz of S.hazards) { const l = hz.k > 0.05 && Math.abs(hz.y - diver.y) < H ? DG.mon.hazardLight(hz) : null; if (l) hole(l.x - cam.x, l.y - cam.y, l.r, l.k); }
  for (const mod of [DG.mon, DG.wpn, DG.boss, DG.fx]) if (mod && mod.lights) for (const l of mod.lights()) hole(l.x - cam.x, l.y - cam.y, l.r, l.k == null ? 0.8 : l.k);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(dk, 0, 0, dk.width, dk.height, 0, 0, dk.width/DK_SCALE, dk.height/DK_SCALE);
  return alpha;
}
function drawItemGlows(alpha){
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const sonar = DG.wpn && DG.wpn.sonarActive && DG.wpn.sonarActive();
  for (const it of S.items) {
    if (it.taken) continue;
    const sy = it.y - cam.y; if (sy < -40 || sy > S.H + 40) continue;
    const sx = it.x - cam.x; if (sx < -40 || sx > S.W + 40) continue;
    if (it.secret) {
      const v = secretVis(it); if (v < 0.05) continue;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 50);
      g.addColorStop(0, `rgba(255,120,240,${0.55*v})`); g.addColorStop(1, 'rgba(255,120,240,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 50, 0, 7); ctx.fill();
    } else if (it.relic) {
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
  // istasyonların uyarı ışığı
  for (let s = 1; s <= save.tier; s++) {
    const sx = BOAT_X - cam.x, sy = LTOP[s] - 128 - cam.y; if (sy < -60 || sy > S.H + 60) continue;
    const bl = 0.5 + 0.5*Math.sin(S.t*4 + s), gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 38);
    gr.addColorStop(0, `rgba(255,170,60,${0.12 + 0.3*bl})`); gr.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, 38, 0, 7); ctx.fill();
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
    if (ty - cam.y < 0) { ctx.fillStyle = '#ffcf3a'; ctx.textAlign = 'center'; ctx.fillText('▲ ' + (s === 0 ? 'TEKNE' : 'İSTASYON ' + s) + ' · ' + fmtM(toM(diver.y) - toM(ty)), S.W/2, $('sig').hidden ? hudBottom + 18 : Math.max(hudBottom + 18, sigBot + 18)); }
  }
  if (diver.y < 60) {
    const bx = BOAT_X - cam.x;
    if (bx < 20 || bx > S.W - 20) { const left = bx < 0; ctx.fillStyle = '#ffb03a'; ctx.textAlign = left ? 'left' : 'right'; ctx.fillText(left ? '◀ TEKNE' : 'TEKNE ▶', left ? 12 : S.W - 12, Math.max(hudBottom + 34, -cam.y - 24)); }
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
  if (!S.playing) return;
  if (aim.active) {
    const R = JR(), dx = aim.x - aim.ox, dy = aim.y - aim.oy, L = Math.hypot(dx, dy), k = L > R ? R/L : 1;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,90,78,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(aim.ox, aim.oy, R, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,90,78,.08)'; ctx.fill();
    ctx.fillStyle = 'rgba(255,90,78,.6)'; ctx.beginPath(); ctx.arc(aim.ox + dx*k, aim.oy + dy*k, R*0.33, 0, 7); ctx.fill();
    if (S.input.aim) {
      const px = diver.x - cam.x, py = diver.y - cam.y;
      ctx.setLineDash([4, 8]); ctx.strokeStyle = 'rgba(255,120,100,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px + S.input.aim.x*26, py + S.input.aim.y*26); ctx.lineTo(px + S.input.aim.x*220, py + S.input.aim.y*220); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }
  if (!joy.active) return;
  const R = JR(), dx = joy.x - joy.ox, dy = joy.y - joy.oy, L = Math.hypot(dx, dy), k = L > R ? R/L : 1;
  ctx.save();
  ctx.strokeStyle = 'rgba(230,244,247,.22)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, R, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(230,244,247,.05)'; ctx.fill();
  ctx.fillStyle = 'rgba(255,176,58,.5)'; ctx.beginPath(); ctx.arc(joy.ox + dx*k, joy.oy + dy*k, R*0.33, 0, 7); ctx.fill();
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
  if (DG.art) DG.art.drawBack(ctx);
  drawWalls();
  drawLedges();
  drawDecor();
  drawShaftAndStations();
  drawItems();
  drawDoor();
  if (DG.mon && DG.mon.drawHazard) for (const hz of S.hazards) DG.mon.drawHazard(ctx, hz, false);
  if (DG.mon && DG.mon.draw) for (const m of S.mons) { const sy = m.y - cam.y; if (sy > -220 && sy < S.H + 220) DG.mon.draw(ctx, m); }
  if (DG.boss && DG.boss.draw) DG.boss.draw(ctx);
  drawBubbles();
  if (DG.wpn && DG.wpn.draw) DG.wpn.draw(ctx);
  // Yüzeyde dalgıç teknenin gövdesinin arkasında kalmasın: tekneden sonra çizilir.
  const atSurface = diver.y < 30;
  if (!atSurface) drawDiver();
  if (DG.fx && DG.fx.drawMid) DG.fx.drawMid(ctx);
  const alpha = drawDarkness();
  drawItemGlows(alpha);
  if (DG.mon && DG.mon.drawHazard) for (const hz of S.hazards) DG.mon.drawHazard(ctx, hz, true);
  if (DG.mon && DG.mon.drawGlow) for (const m of S.mons) { const sy = m.y - cam.y; if (sy > -220 && sy < S.H + 220) DG.mon.drawGlow(ctx, m, alpha); }
  if (DG.wpn && DG.wpn.drawGlow) DG.wpn.drawGlow(ctx, alpha);
  if (DG.boss && DG.boss.drawGlow) DG.boss.drawGlow(ctx, alpha);
  drawDoorGlow();
  drawBoat();
  if (atSurface) drawDiver();
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
  generate(); spawnMons(); S.o2 = gTank();
  cam.y = diver.y - S.H*0.45; camLX = camLY = leanX = leanY = 0; lastLayer = save.station > 0 ? save.station : layerOf(diver.y);
  setCtrl(save.ctrl === 2 ? 2 : 1);
  if (DG.boss && DG.boss.reset) DG.boss.reset();
}
let last = performance.now();
function frame(now){
  const dt = Math.min(0.05, (now - last)/1000); last = now;
  // Fragman açıkken oyun durur ve çizilmez (telefonda video akıcı kalsın).
  try { musTick(dt); } catch (e) {}
  if (!S.cine) try { update(dt); render(); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
function start(data){
  if (data && data.save && data.save.v === 3) mergeSave(data.save); else load();
  resize(); setup(); syncDemoBtn(); shownMoney = save.money; hudBottom = $('hud').getBoundingClientRect().bottom;
  if (data && data.playing) { $('intro').hidden = true; S.playing = true; }
  requestAnimationFrame(t0 => { last = t0; requestAnimationFrame(frame); });
}
window.claude?.hot?.snapshot?.(() => ({save:JSON.parse(JSON.stringify(save)), playing:S.playing}));
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
