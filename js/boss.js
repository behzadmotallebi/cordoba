/* Dalgıç: final canavarı "Derinlerin Efendisi" (DG.boss).
   Atlantis'in Kalbi tekneye çıkınca çukurdan yükselir: zırhlı baş, üç göz, kızıl yele, otuz boğumlu gövde, dokunaçlar.
   Evre 1: teknenin altında döner, tekneye toslar (gözleri parlarken yeterince vurulursa sersemler), dokunaçla savurur.
   Evre 2 (%66): engerek sürüsü, mürekkep tükürüğü, tekneyi saran dokunaç.
   Evre 3 (%33): öfke. Daha sık toslama, dalgıcı yakalayan dokunaçlar, ısırma hamlesi, kükreme. */
(function () {
'use strict';
const DG = window.DG;
const TAU = Math.PI*2;
const NAME = 'Derinlerin Efendisi';
const MAX_HP = 2300, BOAT_MAX = 100;
const N = 30, SP = 34;                       // gövde boğumu sayısı ve aralığı (px)
// Evre ayarları: [_, evre 1, evre 2, evre 3]
const RAM_GAP  = [0, 11, 9, 6.5];            // iki toslama arası dönüş süresi (sn)
const WIND     = [0, 2.6, 2.2, 1.7];         // toslama öncesi uyarı süresi
const STAG     = [0, 60, 75, 90];            // toslamayı durdurmak için gereken hasar
const RAM_DMG  = [0, 12, 14, 17];            // gemiye toslama hasarı
const RAM_V    = [0, 1250, 1400, 1600];
const ORBIT_V  = [0, 300, 360, 430];
const SWIPE_CD = [0, 2.6, 2.1, 1.6];
const TWIND    = [0, 0.62, 0.52, 0.42];      // dokunaç savurma uyarısı
const SQUEEZE  = [0, 0, 3, 4];               // tekneyi saran dokunaç: gemi hasarı / sn
const STRIKERS = [0, 1, 1, 2];
const TENT_HP  = [0, 45, 55, 60];

const rnd = (a, b) => a + Math.random()*(b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function angDiff(a, b){ let d = (a - b)%TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
const mixc = (a, b, k) => [a[0] + (b[0] - a[0])*k, a[1] + (b[1] - a[1])*k, a[2] + (b[2] - a[2])*k];
const rgba = (c, a) => 'rgba(' + (c[0]|0) + ',' + (c[1]|0) + ',' + (c[2]|0) + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')';
const BX = () => (DG.C && DG.C.BOAT_X) || 700;
const WW = () => (DG.C && DG.C.WORLD_W) || 1400;
const sfx = k => { if (DG.core && DG.core.sfx) DG.core.sfx(k); };
const buzz = ms => { if (DG.core && DG.core.buzz) DG.core.buzz(ms); };
const msg = (t, c) => { if (DG.core && DG.core.msg) DG.core.msg(t, c); };
const float = (x, y, t, c) => { if (DG.core && DG.core.float) DG.core.float(x, y, t, c); };
const shake = a => { if (DG.fx && DG.fx.shake) DG.fx.shake(a); };
const flash = (c, a) => { if (DG.fx && DG.fx.flash) DG.fx.flash(c, a); };
const fxBurst = (x, y, c, n, s) => { if (DG.fx && DG.fx.burst) DG.fx.burst(x, y, c, n, s); };
const fxBoom = (x, y, r) => { if (DG.fx && DG.fx.explosion) DG.fx.explosion(x, y, r); };
const tank = () => (DG.core && DG.core.gTank ? DG.core.gTank() : 120) || 120;
const hurtD = (f, name, src) => (DG.core && DG.core.hurt ? DG.core.hurt(f*tank(), name, src) : 0);
const camo = () => !!(DG.wpn && DG.wpn.camoActive && DG.wpn.camoActive());
const dashing = () => !!(DG.wpn && DG.wpn.speedMult && DG.wpn.speedMult() > 1.6);
function hull(){ const sh = DG.data.SHIPS[(DG.S.save && DG.S.save.tier) || 0]; return sh ? sh.len : 120; }

// Renkler: arduvaz zırh, kemik, kızıl zar, camgöbeği ışık (öfkede kor).
const C = {
  body:'#1a2631', belly:'#434d4a', sheen:'rgba(72,104,124,.22)', seam:'rgba(5,9,13,.8)', rim:'rgba(150,192,212,.42)',
  crest:'rgba(112,16,30,.84)', spine:'#cfc09c', fin:'rgba(118,20,32,.8)', ray:'rgba(214,196,160,.5)',
  skull:'#21303b', crown:'#2d3c48', brow:'#3a4c59', snout:'#2b3b47', cheek:'#141f28', hl:'rgba(165,200,220,.55)',
  jaw:'#1a252d', jawLow:'#3a4341', mouth:'#2b0709', tooth:'#e8dec4',
  tent:'#3a2431', tentRim:'rgba(214,160,170,.28)', sucker:'rgba(186,152,140,.75)', frill:'rgba(138,22,34,.9)', ichor:[12,34,58],
};
const GC0 = [90, 226, 255], GC1 = [255, 98, 40];      // biyolüminesans: camgöbeği, öfkede kor
const EC0 = [255, 186, 52], EC1 = [255, 50, 26];      // gözler: kehribar, öfkede kan kırmızısı
const EYES = [{x:54, y:-33, r:11}, {x:31, y:-41, r:7.5}, {x:12, y:-46, r:5.5}];
// Tekneyi saran dokunaç yolu (tekne yerel koordinatı, x yan ile çarpılır).
const WRAP = [[118, 30], [113, 4], [98, -22], [72, -31], [47, -22], [40, -1], [52, 15]];

// ---------- durum ----------
let on = false, vis = false, away = false;
let st = 'off', stT = 0, once = 0, phase = 1, hp = MAX_HP, boatHp = BOAT_MAX, T = 0, fightT = 0;
let murk = 0, enr = 0, eyeO = 0, gillO = 0, jaw = 0, eyeW = 0, gillW = 0, jawW = 0;
let flashB = 0, flashH = 0, armorT = 0, swipeT = 0, contactCd = 0, warnT = 0, rumbleT = 0;
let ramT = 0, spitT = 0, siegeT = 0, lungeT = 0, roarT = 0, summonT = 0;
let ramX = 0, stagAcc = 0, stagNeed = 1, arc = 1, lungeX = 0, lungeY = 0;
let siegeX = 0, siegeY = 0, siegeSide = 1, siegeTent = null, siegeOn = false, creakT = 0;
let grabTent = null, grabT = 0, grabTick = 0;
let dieT = 0, won = false, lost = false, goneT = 0, burstT = 0, burstI = 0;
let hintWeak = false, hintRam = false, hintSiege = false;
const weakT = {eye:0, gill:0, mouth:0};
const DK = {};
const H = {x:0, y:0, a:0, v:0, vx:0, vy:0, roll:1, rt:1, ca:1, sa:0, rd:1};
const orb = {cx:700, cy:520, th:0, dir:1};
const nodes = [];
for (let i = 0; i < N; i++) nodes.push({x:0, y:0, roll:1, lit:0});
const RAD = new Float32Array(N), PX = new Float32Array(N), PY = new Float32Array(N), NX = new Float32Array(N), NY = new Float32Array(N);
for (let i = 0; i < N; i++) RAD[i] = i < 3 ? 58 + i*3 : 67*(1 - Math.pow((i - 3)/(N - 3), 1.35)*0.87);
const box = {x0:0, y0:0, x1:0, y1:0};
const BT = {rock:0, rv:0, heave:0, hv:0, sink:0, side:1, cracks:[], smokeT:0, px:700, py:0, pa:0};

// ---------- isabet parçaları ----------
const pend = [];
function mkPart(kind, r, tent){
  // ownNums: hasar sayılarını silah modülü değil canavar yazar (çarpanlı, gerçekten işleyen hasar).
  const p = {x:0, y:0, r, weak:false, kind, tent:tent || null, dead:false, fl:0, ownNums:true, na:0, nt:0, nc:'',
    hit(a, o){ if (a > 0 && on && fightable()) pend.push(p, a, (o && o.kind) || ''); }};
  return p;
}
const P_MOUTH = mkPart('mouth', 30), P_EYE = mkPart('eye', 24), P_GILL = mkPart('gill', 24);
const P_CROWN = mkPart('head', 30), P_HEAD = mkPart('head', 52), P_SNOUT = mkPart('head', 40);
const WEAKP = [P_MOUTH, P_EYE, P_GILL];
const BODY_IDX = [3, 8, 13, 18, 23];
const P_BODY = BODY_IDX.map(i => mkPart('body', RAD[i]*0.92));
const TG = [], EMPTY = [], LT = [];

// ---------- dokunaçlar ----------
const TN = [];
function mkTent(lx, ly, n, seg, w, long){
  const t = {lx, ly, n, seg, w, long, len:n*seg, nodes:[], st:'idle', t:0, hp:1, maxHp:1, cd:rnd(0.5, 2), tx:0, ty:0,
    ph:rnd(0, TAU), grow:1, hit:false, stun:0, regrow:0, fl:0, wrap:0, parts:[]};
  for (let k = 0; k < n; k++) t.nodes.push({x:0, y:0});
  if (long) t.parts = [mkPart('tent', 24, t), mkPart('tent', 22, t)];
  return t;
}
TN.push(mkTent(-70, 40, 13, 26, 15, true), mkTent(-48, 46, 13, 26, 15, true), mkTent(-26, 46, 12, 26, 14, true), mkTent(-4, 46, 12, 25, 13, true));
TN.push(mkTent(-86, 30, 8, 17, 9, false), mkTent(10, 50, 7, 16, 8, false));
const LONG = TN.filter(t => t.long);

// ---------- parçacıklar ----------
const K_DROP = 0, K_BUB = 1, K_INK = 2, K_DEB = 3, K_ICH = 4, K_EMB = 5, K_SMOKE = 6, K_RING = 7;
const PT = [], GL = [], DTN = [], RINGS = [], SUM = [];
function add(k, x, y, vx, vy, r, life){
  if (PT.length >= 520) return null;
  const p = {k, x, y, vx, vy, r, life, max:life, a:rnd(0, TAU), va:rnd(-7, 7), g:0, big:false};
  PT.push(p); return p;
}
function compact(arr, keep){ let j = 0; for (let i = 0; i < arr.length; i++) { const p = arr[i]; if (keep(p)) arr[j++] = p; } arr.length = j; }

// ---------- baş dönüşümü ----------
const wx = (lx, ly) => H.x + H.ca*lx - H.sa*ly*H.rd;
const wy = (lx, ly) => H.y + H.sa*lx + H.ca*ly*H.rd;
function steer(tx, ty, spd, turn, dt){
  const want = Math.atan2(ty - H.y, tx - H.x), mx = turn*dt;
  H.a += clamp(angDiff(want, H.a), -mx, mx);
  H.v += (spd - H.v)*Math.min(1, dt*2.6);
  H.x += Math.cos(H.a)*H.v*dt; H.y += Math.sin(H.a)*H.v*dt;
}
function setSt(s){ st = s; stT = 0; once = 0; }
const fightable = () => st !== 'off' && st !== 'lurk' && st !== 'dying' && st !== 'gloat' && st !== 'gone';

// ---------- hasar alma ----------
function mult(p){
  switch (p.kind) {
    case 'mouth': return 2.4;
    case 'eye': return eyeO > 0.5 ? 2 : 0.5;
    case 'gill': return gillO > 0.5 ? 1.6 : 0.7;
    case 'head': return 0.5;
    case 'body': return 0.7;
    case 'tent': return 0.3;
  }
  return 1;
}
function dealt(d){
  const floor = phase === 1 ? MAX_HP*2/3 : phase === 2 ? MAX_HP/3 : 0;
  hp = Math.max(floor, hp - d);
  if (st === 'windup' || st === 'ram') stagAcc += d;
}
const WEAK_LBL = {eye:['GÖZ', '#ffcf3a'], gill:['SOLUNGAÇ', '#7fe8ff'], mouth:['AĞIZ', '#ff8a5a']};
function apply(p, a){
  let m = mult(p);
  if (st === 'stagger') m *= 1.2;
  dealt(a*m);
  num(p, a*m, m > 1.01 ? (WEAK_LBL[p.kind] ? WEAK_LBL[p.kind][1] : '#ffcf3a') : m < 0.7 ? '#9fb0bd' : '#e6f4f7');
  if (st === 'windup' || st === 'ram') DK[p.kind] = (DK[p.kind] || 0) + a*m;
  if (p.kind === 'body') flashB = Math.min(1, flashB + 0.35); else flashH = Math.min(1, flashH + 0.45);
  p.fl = 1;
  if (m > 1.01 && WEAK_LBL[p.kind]) {
    if (T - weakT[p.kind] > 0.45) {
      weakT[p.kind] = T;
      const L = WEAK_LBL[p.kind];
      float(p.x, p.y - p.r - 10, L[0] + ' ×' + m.toFixed(1).replace('.', ','), L[1]);
      fxBurst(p.x, p.y, L[1], 8, 240);
      for (let i = 0; i < 5; i++) add(K_EMB, p.x, p.y, rnd(-220, 220), rnd(-220, 220), rnd(1.5, 3), rnd(0.25, 0.5));
    }
  } else if (m < 0.7 && T - armorT > 3) {
    armorT = T; float(p.x, p.y - p.r - 6, 'ZIRH', '#9fb0bd');
    fxBurst(p.x, p.y, '#c8d4dc', 5, 160);
  }
}
function tentDmg(t, a, k, share){
  if (t.st === 'cut' || t.st === 'grow') return false;
  t.hp -= a; t.fl = 1;
  if (share) dealt(a*0.3);
  if (k === 'net' && t.st !== 'boat') {
    t.stun = 2.5;
    if (t.st === 'grab') release(t, true); else if (t.st === 'wind' || t.st === 'strike') { t.st = 'idle'; t.cd = 1.5; }
  }
  if (t.hp <= 0) sever(t);
  return true;
}
// Hasar sayıları: parça başına 0,18 sn toplanır, sonra tek sayı (silahlarla aynı ×10 ölçek).
const NUMP = [];
function num(p, d, c){
  if (!(d > 0)) return;
  if (p.na <= 0) { p.nt = 0; NUMP.push(p); }
  p.na += d; p.nc = c;
}
function flushNums(dt){
  for (let i = NUMP.length - 1; i >= 0; i--) {
    const p = NUMP[i]; p.nt += dt;
    if (p.nt < 0.18) continue;
    if (DG.fx && DG.fx.dmgText) DG.fx.dmgText(p.x + rnd(-6, 6), p.y - p.r - 8, String(Math.max(1, Math.round(p.na*10))), p.nc || '#e6f4f7');
    p.na = 0; NUMP.splice(i, 1);
  }
}
const SINGLE = {dart:1, '':1};
function resolve(){
  const L = pend.length; if (!L) return;
  const groups = {};
  for (let i = 0; i < L; i += 3) {
    const p = pend[i], a = pend[i + 1], k = pend[i + 2];
    if (SINGLE[k]) { if (p.tent) { if (tentDmg(p.tent, a, k, true)) num(p, a, '#ffb0a0'); } else apply(p, a); continue; }
    (groups[k] || (groups[k] = [])).push(p, a);
  }
  pend.length = 0;
  // Alan silahları (ışın, patlama, sonik, kalkan, ağ) bir karede canavara tek darbe sayılır:
  // en yakın parçayla aynı mesafedeki en değerli parça (zayıf nokta) seçilir. Dokunaçlar kendi canlarından ayrıca yer.
  for (const k in groups) {
    const g = groups[k]; let mx = 0;
    for (let i = 0; i < g.length; i += 2) if (g[i + 1] > mx) mx = g[i + 1];
    let best = null, ba = 0, bv = -1;
    const seen = [];
    for (let i = 0; i < g.length; i += 2) {
      const p = g[i], a = g[i + 1];
      if (p.tent && seen.indexOf(p.tent) < 0) { seen.push(p.tent); if (tentDmg(p.tent, a, k, false)) num(p, a, '#ffb0a0'); }
      if (a < mx*0.85) continue;
      const v = a*mult(p); if (v > bv) { bv = v; best = p; ba = a; }
    }
    if (best) { if (best.tent) dealt(ba*0.3); else apply(best, ba); }
  }
}

// ---------- gemi ----------
function addCrack(){
  if (BT.cracks.length >= 9) return;
  const L = hull(), cx = rnd(-L*0.8, L*0.85), cy = rnd(-12, 2), pts = [], n = 7, s = rnd(0.8, 1.3);
  for (let i = 0; i < n; i++) { const a = i/n*TAU + rnd(-0.25, 0.25), r = (i%2 ? rnd(3, 6) : rnd(8, 14))*s; pts.push(cx + Math.cos(a)*r*1.5, cy + Math.sin(a)*r*0.8); }
  BT.cracks.push({x:cx, y:cy, pts, f:rnd(0, TAU)});
}
function boatDmg(a){
  if (boatHp <= 0 || lost) return;
  const before = boatHp;
  boatHp = Math.max(0, boatHp - a);
  if (Math.floor(before/11) !== Math.floor(boatHp/11)) addCrack();
  if (boatHp <= 0) loseStart();
}
function toBoat(lx, ly, out){
  const c = Math.cos(BT.pa), s = Math.sin(BT.pa);
  out[0] = BT.px + c*lx - s*ly; out[1] = BT.py + s*lx + c*ly;
}
const tmp2 = [0, 0];
function updBoat(dt){
  const S = DG.S, bob = Math.sin(S.t*1.4)*2;
  const swell = on ? Math.sin(T*0.9)*0.045 + Math.sin(T*2.3)*0.012 : 0;
  BT.rv += (-(BT.rock - swell)*14 - BT.rv*3.2)*dt; BT.rock += BT.rv*dt;
  BT.hv += (-BT.heave*18 - BT.hv*4)*dt; BT.heave += BT.hv*dt;
  BT.px = BX(); BT.py = bob + BT.heave + BT.sink*70; BT.pa = BT.rock + boatTilt();
  // duman: hasar arttıkça yoğunlaşır
  const dmgK = 1 - boatHp/BOAT_MAX;
  if ((on || lost) && dmgK > 0.08 && BT.cracks.length) {
    BT.smokeT -= dt*(2 + dmgK*14);
    while (BT.smokeT <= 0) {
      BT.smokeT += 1;
      const c = BT.cracks[(Math.random()*BT.cracks.length)|0];
      toBoat(c.x, -20, tmp2);
      const p = add(K_SMOKE, tmp2[0], tmp2[1], rnd(-14, 14), -rnd(30, 60), rnd(6, 10), rnd(2.2, 3.6));
      if (p) p.g = dmgK;
    }
  }
}
const boatTilt = () => (1 - boatHp/BOAT_MAX)*0.06*BT.side + BT.sink*0.34*BT.side;

// ---------- efektler ----------
function splash(x, k){
  for (let i = 0; i < 34*k; i++) add(K_DROP, x + rnd(-70, 70)*k, -2, rnd(-260, 260)*k, -rnd(260, 720)*k, rnd(1.5, 4), rnd(0.8, 1.4));
  for (let i = 0; i < 16*k; i++) add(K_BUB, x + rnd(-90, 90)*k, rnd(10, 120), rnd(-30, 30), -rnd(40, 120), rnd(2, 6), rnd(0.8, 1.8));
  add(K_RING, x, 2, 260*k, 0, 30, 1.1);
  add(K_RING, x, 2, 160*k, 0, 16, 0.9);
  sfx('boom');
}
function bubbleColumn(x0, y0, x1, y1, n){
  for (let i = 0; i < n; i++) { const k = Math.random(); add(K_BUB, x0 + (x1 - x0)*k + rnd(-40, 40), y0 + (y1 - y0)*k, rnd(-12, 12), -rnd(60, 160), rnd(1.2, 3.2), rnd(0.7, 1.4)); }
}
function inkCloud(x, y, s){
  for (let i = 0; i < 9; i++) {
    const p = add(K_INK, x + rnd(-24, 24)*s, y + rnd(-24, 24)*s, rnd(-50, 50), rnd(-50, 30), rnd(16, 30)*s, rnd(2.8, 4.4));
    if (p) { p.g = rnd(16, 30); p.big = true; }
  }
}
function ichor(x, y, n){
  for (let i = 0; i < n; i++) { const p = add(K_ICH, x, y, rnd(-90, 90), rnd(-90, 60), rnd(5, 11), rnd(1.2, 2.2)); if (p) p.g = rnd(10, 22); }
}

// ---------- canavar çağırma ----------
function spawnMon(t, x, y, vx, vy){
  const S = DG.S, M = DG.mon, L = 10;
  let m = null;
  try { if (M && M.spawnAt) m = M.spawnAt(t, x, y, L, {vx, vy}); } catch (e) { m = null; }
  if (Array.isArray(m)) m = m[0] || null;
  if (!m && M && M.spawnLayer) {
    try { const all = M.spawnLayer(L) || []; m = all.find(o => o.t === t) || null; } catch (e) { m = null; }
    if (m) { const ox = m.x, oy = m.y; m.x = x; m.y = y; if (m.hy === oy) m.hy = y; if (m.hx === ox) m.hx = x; }
  }
  if (!m) { const md = DG.data.MON[t], h = md.hp*(1 + 0.35*L); m = {t, L, x, y, hx:x, hy:y, vx, vy, hp:h, maxHp:h, size:1, cd:0, stun:0, dead:false, ph:rnd(0, TAU)}; }
  if (!(isFinite(m.x) && isFinite(m.y))) { m.x = x; m.y = y; }
  m.dead = false;
  if (S.mons.indexOf(m) < 0) S.mons.push(m);
  return m;
}
function summon(n){
  const S = DG.S, d = S.diver, U = DG.U;
  compact(SUM, m => !m.dead && S.mons.indexOf(m) >= 0);
  n = Math.min(n, 13 - SUM.length); if (n <= 0) return;
  const mx = wx(110, 30), my = wy(110, 30);
  const far = Math.hypot(d.x - mx, d.y - my) > 900;
  for (let i = 0; i < n; i++) {
    const k = far ? 0 : rnd(0.35, 0.6), a = rnd(0, TAU), r = rnd(30, 90);
    let x = mx + (d.x - mx)*k + Math.cos(a)*r, y = Math.max(60, my + (d.y - my)*k + Math.sin(a)*r);
    if (U && U.isSafe && U.isSafe(x, y)) y = Math.max(y, 430);
    if (U && U.boundsAt) { const b = U.boundsAt(y); x = clamp(x, b[0] + 20, b[1] - 20); }
    const L = Math.hypot(d.x - x, d.y - y) || 1;
    SUM.push(spawnMon('viper', x, y, (d.x - x)/L*240, (d.y - y)/L*240));
    bubbleColumn(x, y + 20, x, y - 20, 4);
  }
  for (let i = 0; i < 10; i++) add(K_BUB, mx + rnd(-30, 30), my + rnd(-20, 20), rnd(-80, 80), -rnd(60, 160), rnd(2, 5), rnd(0.6, 1.2));
  msg('Engerek sürüsü! Derinlerin Efendisi yardım çağırdı.', 'var(--danger)');
  sfx('growl');
}
function killSummoned(){
  for (const m of SUM) if (!m.dead) { m.dead = true; bubbleColumn(m.x, m.y, m.x, m.y - 10, 3); }
  SUM.length = 0;
}

// ---------- başlat / sıfırla ----------
function resetTents(){
  for (const t of TN) {
    t.st = 'idle'; t.t = 0; t.cd = rnd(0.5, 2); t.grow = 1; t.stun = 0; t.fl = 0; t.wrap = 0;
    t.maxHp = t.hp = TENT_HP[1];
    const rx = wx(t.lx, t.ly), ry = wy(t.lx, t.ly);
    for (let k = 0; k < t.n; k++) { t.nodes[k].x = rx + rnd(-3, 3); t.nodes[k].y = ry + k*t.seg; }
  }
}
function clearAll(){
  PT.length = 0; GL.length = 0; DTN.length = 0; RINGS.length = 0; pend.length = 0; TG.length = 0; for (const p of NUMP) p.na = 0; NUMP.length = 0;
  grabTent = null; siegeTent = null; siegeOn = false;
}
function resetBoat(){ BT.rock = BT.rv = BT.heave = BT.hv = BT.sink = 0; BT.cracks.length = 0; BT.side = 1; BT.smokeT = 0; }
function start(){
  const S = DG.S, bx = BX();
  killSummoned(); clearAll(); resetBoat();
  on = true; vis = true; away = false; won = false; lost = false;
  setSt('lurk'); phase = 1; hp = MAX_HP; boatHp = BOAT_MAX; fightT = 0; enr = 0;
  eyeO = gillO = jaw = 0; flashB = flashH = 0; contactCd = 0; swipeT = 0; dieT = 0; goneT = 0; burstI = 0;
  ramT = 7; spitT = 99; siegeT = 99; lungeT = 99; roarT = 99; summonT = 99;
  H.x = bx + 140; H.y = 1650; H.a = -Math.PI/2; H.v = 0; H.roll = H.rt = H.rd = 1; H.ca = 0; H.sa = -1;
  for (let i = 0; i < N; i++) { nodes[i].x = H.x + Math.sin(i*0.5)*20; nodes[i].y = H.y + 70 + i*SP; nodes[i].roll = 1; nodes[i].lit = 0; }
  orb.cx = bx; orb.cy = 520; orb.dir = Math.random() < 0.5 ? -1 : 1;
  resetTents();
  if (S && S.diver) S.inkT = 0;
  msg('Derinlerden bir şey yükseliyor... Tekneyi koru!', 'var(--danger)');
  sfx('growl'); shake(4); buzz(60);
  if (DG.core && DG.core.bossHUD) DG.core.bossHUD(1, 1, NAME);
}
function reset(){
  on = false; vis = false; away = false; won = false; lost = false; setSt('off'); murk = 0; enr = 0;
  killSummoned(); clearAll(); resetBoat(); boatHp = BOAT_MAX; hp = MAX_HP;
}
function retreat(){
  on = false; vis = false; away = true; setSt('off');
  killSummoned(); clearAll(); resetBoat(); boatHp = BOAT_MAX;
  if (DG.core && DG.core.bossHUD) DG.core.bossHUD(null);
  msg('Derinlerin Efendisi derine çekildi. Tekneye dönünce yine gelecek.', 'var(--amber)');
}

// ---------- evreler ----------
function enterCircle(){
  setSt('circle');
  orb.th = Math.atan2((H.y - orb.cy)/220, (H.x - orb.cx)/420);
}
function shift(p){
  phase = p; setSt('shift');
  if (grabTent) release(grabTent, false);
  if (siegeOn) endSiege();
  for (const t of LONG) if (t.st !== 'cut' && t.st !== 'grow') { t.maxHp = TENT_HP[p]; t.hp = Math.max(t.hp, t.maxHp*0.6); }
  spitT = 5; siegeT = p === 2 ? 4 : 9; lungeT = 4; roarT = 11; summonT = 24; ramT = p === 3 ? 3 : 9;
  if (p === 2) msg('Derinlerin Efendisi öfkelendi! Gemiyi ve seni birlikte istiyor.', 'var(--danger)');
  else msg('ÇILDIRDI! Dokunaçları seni yakalamak istiyor. Hız patlamasıyla kurtul.', 'var(--danger)');
}
function checkPhase(){
  if (!on || won || lost || st === 'dying') return;
  const ok = st !== 'breach' && st !== 'lurk' && st !== 'rise' && st !== 'shift';
  if (!ok) return;
  if (phase === 1 && hp <= MAX_HP*2/3 + 0.01) shift(2);
  else if (phase === 2 && hp <= MAX_HP/3 + 0.01) shift(3);
  else if (phase === 3 && hp <= 0.01) die();
}
function die(){
  setSt('dying'); dieT = 0; burstT = 0.2; burstI = 0; arc = H.ca >= 0 ? 1 : -1;
  if (grabTent) release(grabTent, false);
  if (siegeOn) endSiege();
  for (const t of TN) if (t.st !== 'cut') { t.st = 'idle'; t.stun = 99; }
  killSummoned();
  GL.length = 0;
  msg('Derinlerin Efendisi yıkılıyor!', 'var(--amber)');
  sfx('roar'); flash('#ffffff', 0.5); shake(14); buzz([80, 40, 160]);
}
function loseStart(){
  lost = true; setSt('gloat');
  BT.side = H.x < BX() ? -1 : 1;
  if (grabTent) release(grabTent, false);
  if (siegeOn) endSiege();
  msg('Gemi batıyor!', 'var(--danger)');
  sfx('boom'); shake(12); buzz([120, 60, 200]);
}

// ---------- saldırılar ----------
function breach(side, ram){
  setSt('breach'); arc = side;
  H.vx = Math.cos(H.a)*H.v; H.vy = Math.sin(H.a)*H.v;
  if (H.vy < -820) { const k = 820/-H.vy; H.vx *= k; H.vy *= k; }
  splash(H.x, 1.4);
  shake(ram ? 10 : 12);
}
function impact(){
  const S = DG.S, d = S.diver, bx = BX(), L = hull();
  if (Math.abs(H.x - bx) < L + 60) {
    const dmg = RAM_DMG[phase];
    BT.side = H.x < bx ? 1 : -1;
    BT.rv += -BT.side*1.0; BT.hv -= 200;
    boatDmg(dmg); addCrack();
    for (let i = 0; i < 14; i++) { const p = add(K_DEB, H.x + rnd(-40, 40), -10, rnd(-260, 260), -rnd(220, 560), rnd(3, 7), rnd(1.8, 2.8)); if (p) p.g = Math.random(); }
    if (!lost) msg(hintRam ? 'Gemi darbe aldı! −' + dmg : 'Gemi darbe aldı! Toslamadan önce parlayan gözlerini vur.', 'var(--danger)');
    hintRam = true;
    sfx('roar'); shake(16); buzz([100, 40, 100]);
    fxBoom(H.x, 0, 90);
  }
  if (S.playing && Math.hypot(d.x - H.x, d.y) < 190) hurtD(0.10, 'Çarpışma', {x:H.x, y:H.y});
}
function stagger(){
  setSt('stagger');
  msg('SERSEMLEDİ! Şimdi vur!', 'var(--amber)');
  float(H.x, H.y - 120, 'SERSEMLEDİ!', '#f4cf7a');
  sfx('growl'); shake(8); buzz(60);
  ichor(wx(34, -39), wy(34, -39), 8);
  for (let i = 0; i < 12; i++) add(K_EMB, wx(34, -39), wy(34, -39), rnd(-300, 300), rnd(-300, 300), rnd(1.5, 3.5), rnd(0.3, 0.6));
}
function launchGlobs(){
  const d = DG.S.diver, mx = wx(150, 20), my = wy(150, 20);
  const base = Math.atan2(d.y - my, d.x - mx), n = phase === 3 ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1)/2)*0.28;
    GL.push({x:mx, y:my, vx:Math.cos(a)*560, vy:Math.sin(a)*560, life:1.6, tr:0});
  }
  sfx('net'); shake(3);
  for (let i = 0; i < 6; i++) { const p = add(K_INK, mx, my, Math.cos(base)*120 + rnd(-40, 40), Math.sin(base)*120 + rnd(-40, 40), rnd(8, 14), rnd(0.8, 1.4)); if (p) p.g = 20; }
}
function doRoar(){
  const d = DG.S.diver, mx = wx(120, 20), my = wy(120, 20);
  sfx('roar'); shake(phase === 3 ? 14 : 10); buzz([60, 40, 120]);
  flash('#ff3a20', 0.18);
  RINGS.push({x:mx, y:my, r:30, v:900, life:0.9, max:0.9});
  RINGS.push({x:mx, y:my, r:10, v:620, life:0.9, max:0.9});
  const dd = Math.hypot(d.x - mx, d.y - my);
  if (dd < 420 && d.y > 2) { const k = (1 - dd/420)*520; d.vx += (d.x - mx)/(dd || 1)*k; d.vy += (d.y - my)/(dd || 1)*k; if (DG.core.slow) DG.core.slow(0.8); }
}
function pickTent(){ for (const t of LONG) if (t.st === 'idle' && t.stun <= 0) return t; for (const t of LONG) if (t.st !== 'cut' && t.st !== 'grow' && t.st !== 'grab') return t; return null; }
function endSiege(){
  if (siegeTent && siegeTent.st === 'boat') { siegeTent.st = 'idle'; siegeTent.cd = 3; siegeTent.wrap = 0; }
  siegeTent = null; siegeOn = false;
  siegeT = phase === 3 ? rnd(15, 18) : rnd(19, 23);
  if (st === 'siege') setSt('recover');
}
function release(t, freed){
  if (t.st === 'grab') { t.st = 'idle'; t.cd = 2.5; }
  if (grabTent === t) {
    grabTent = null;
    if (freed) { msg('Kurtuldun!', 'var(--foam)'); const d = DG.S.diver, L = Math.hypot(d.x - H.x, d.y - H.y) || 1; d.vx += (d.x - H.x)/L*380; d.vy += (d.y - H.y)/L*380; }
  }
}
function sever(t){
  const ns = t.nodes;
  if (t.st === 'grab') release(t, true);
  const wasBoat = t.st === 'boat';
  t.st = 'cut'; t.regrow = phase === 3 ? 10 : 13; t.wrap = 0;
  const pts = [];
  for (let k = 2; k < ns.length; k++) pts.push(ns[k].x, ns[k].y);
  DTN.push({pts, w:t.w*0.8, vx:rnd(-30, 30), vy:40, life:2.6, max:2.6});
  ichor(ns[2].x, ns[2].y, 12);
  float(ns[3].x, ns[3].y - 20, 'Dokunaç koptu!', '#f4cf7a');
  sfx('kill'); buzz(40);
  dealt(12);
  if (wasBoat || t === siegeTent) { msg('Gemi kurtuldu!', 'var(--amber)'); siegeTent = null; endSiege(); }
}

// ---------- beyin ----------
function think(dt, live){
  const S = DG.S, d = S.diver, bx = BX();
  eyeW = 0; jawW = 0.04; gillW = (T%5.2) < 1.9 ? 1 : 0;
  if (!live && st !== 'dying' && st !== 'gloat' && st !== 'gone') {
    steer(H.x + H.ca*200, clamp(H.y, 320, 900), 120, 0.8, dt); return;
  }
  if (contactCd > 0) contactCd -= dt;
  if (swipeT > 0) swipeT -= dt;
  switch (st) {
    case 'lurk': {
      H.v = 0; eyeW = 1;
      rumbleT -= dt; if (rumbleT <= 0) { rumbleT = 0.25; shake(2.5); }
      bubbleColumn(H.x - 160, 520, H.x + 200, 380, 2);
      if (stT > 1.7) { setSt('rise'); H.v = 320; sfx('growl'); }
      break;
    }
    case 'rise': {
      steer(bx + 140, -400, 800, 1.2, dt); eyeW = 1; jawW = 0.5;
      bubbleColumn(H.x - 50, H.y - 60, H.x + 50, H.y - 400, 2);
      if (H.y < 30) {
        breach(-1, false); sfx('roar'); flash('#bfe6ff', 0.25);
        BT.rv += 0.6; BT.hv -= 110;
        if (DG.core && DG.core.msg) msg('DERİNLERİN EFENDİSİ', '#ff8a7a');
      }
      break;
    }
    case 'breach': {
      H.vy += 1500*dt; H.vx += arc*520*dt;
      H.x += H.vx*dt; H.y += H.vy*dt;
      H.a = Math.atan2(H.vy, H.vx); H.v = Math.hypot(H.vx, H.vy);
      eyeW = 1; jawW = 0.85;
      if (H.y < -10 && Math.random() < dt*30) add(K_DROP, H.x + rnd(-40, 40), H.y + rnd(-20, 40), rnd(-60, 60), rnd(-40, 80), rnd(1.5, 3), rnd(0.6, 1));
      if (H.y > 30 && H.vy > 0) {
        splash(H.x, 1.2); H.v = Math.min(H.v, 700);
        setSt('recover');
        if (!hintWeak) { hintWeak = true; setTimeout(() => { if (on) msg('Gözleri ya da solungaçları parlarken vur: zırhı delip geçer.', 'var(--relic)'); }, 2600); }
      }
      break;
    }
    case 'recover': {
      orbitStep(dt, 480);
      if (stT > 1.5) enterCircle();
      break;
    }
    case 'circle': {
      orbitStep(dt, ORBIT_V[phase]);
      H.a += Math.sin(T*1.7)*0.35*dt;
      ramT -= dt; spitT -= dt; siegeT -= dt; lungeT -= dt; roarT -= dt; summonT -= dt;
      const dd = Math.hypot(d.x - H.x, d.y - H.y), facing = Math.abs(angDiff(Math.atan2(d.y - H.y, d.x - H.x), H.a)) < 1.1;
      if (ramT <= 0) { ramX = bx + rnd(-240, 240); setSt('dive'); }
      else if (phase >= 2 && siegeT <= 0 && pickTent()) { siegeSide = H.x < bx ? -1 : 1; siegeX = bx + siegeSide*205; siegeY = 215; siegeOn = false; setSt('siege'); }
      else if (phase >= 2 && spitT <= 0 && dd < 720 && d.y > 30 && !camo()) { setSt('spit'); spitT = rnd(8, 10); }
      else if (phase === 3 && lungeT <= 0 && dd > 170 && dd < 520 && facing && d.y > 30 && !camo()) { setSt('lwind'); lungeT = rnd(5.5, 7.5); }
      else if (phase === 3 && roarT <= 0) setSt('roar');
      if (phase >= 2 && summonT <= 0) { summonT = rnd(22, 26); summon(5); }
      break;
    }
    case 'dive': {
      steer(ramX, 1000, 720, 2.3, dt);
      if (Math.hypot(H.x - ramX, H.y - 1000) < 120 || stT > 3.5) {
        setSt('windup'); stagAcc = 0; stagNeed = STAG[phase]; warnT = 0; for (const k in DK) delete DK[k];
        msg(hintRam ? 'Gemiye hücum ediyor! Gözlerini vur!' : 'GEMİYE HÜCUM! Gözleri parlarken vur, durdur!', 'var(--danger)');
        sfx('growl');
      }
      break;
    }
    case 'windup': {
      steer(bx, -300, 40, 2.6, dt); H.y += 16*dt;
      eyeW = 1; jawW = 0.22 + 0.12*Math.sin(T*11);
      const k = stT/WIND[phase];
      warnT -= dt; if (warnT <= 0) { sfx('warn'); warnT = 0.55 - 0.32*k; }
      rumbleT -= dt; if (rumbleT <= 0) { rumbleT = 0.2; shake(1.5 + 3*k); }
      if (Math.random() < dt*40) bubbleColumn(H.x, H.y - 100, bx, 20, 1);
      if (stagAcc >= stagNeed) stagger();
      else if (stT >= WIND[phase]) { setSt('ram'); H.v = 700; sfx('growl'); }
      break;
    }
    case 'ram': {
      steer(bx, -60, RAM_V[phase], 0.9, dt); eyeW = 1; jawW = 0.6;
      if (Math.random() < dt*30) add(K_BUB, H.x + rnd(-60, 60), H.y + rnd(0, 80), rnd(-20, 20), -rnd(40, 100), rnd(2, 5), rnd(0.6, 1.2));
      if (stagAcc >= stagNeed && H.y > 160) stagger();
      else if (H.y < 30) { impact(); if (!lost) breach(H.x < bx ? 1 : -1, true); }
      else if (stT > 3) setSt('recover');
      if (st !== 'ram' && !lost) ramT = RAM_GAP[phase] + rnd(-1, 1.5);
      break;
    }
    case 'stagger': {
      steer(H.x + Math.sin(stT*3)*80, H.y + 160, 80, 1.2, dt);
      eyeW = Math.sin(T*22) > -0.3 ? 1 : 0.4; gillW = 1; jawW = 0.35;
      if (Math.random() < dt*12) ichor(wx(34, -39), wy(34, -39), 1);
      if (stT > 3.2) { setSt('recover'); ramT = RAM_GAP[phase] + rnd(0, 1.5); }
      break;
    }
    case 'spit': {
      steer(d.x, d.y, 60, 3.0, dt); eyeW = 1; jawW = clamp(stT/0.7, 0, 1)*0.55;
      if (!once && stT > 0.85) { once = 1; launchGlobs(); }
      if (stT > 1.3) enterCircle();
      break;
    }
    case 'siege': {
      if (!siegeOn) {
        steer(siegeX, siegeY, 560, 2.2, dt);
        if (Math.hypot(H.x - siegeX, H.y - siegeY) < 90 || stT > 4) {
          const t = pickTent();
          if (!t) { endSiege(); break; }
          if (t.st === 'grab') release(t, false);
          siegeOn = true; siegeTent = t; t.st = 'boat'; t.t = 0; t.wrap = 0; creakT = 0.6;
          msg(hintSiege ? 'Dokunaç tekneyi sardı!' : 'Dokunaç tekneyi sardı! Su altındaki kolunu kes.', 'var(--danger)');
          hintSiege = true; sfx('growl'); buzz(60);
        }
      } else {
        steer(siegeX + Math.sin(T*0.9)*40, siegeY + Math.cos(T*0.7)*25, 60, 1.4, dt);
        gillW = 1; jawW = 0.2;
        if (!siegeTent || siegeTent.st !== 'boat' || stT > 10) endSiege();
      }
      break;
    }
    case 'lwind': {
      steer(d.x, d.y, 30, 4, dt); eyeW = 1; jawW = 1;
      if (stT > 0.6) {
        const L = Math.hypot(d.x - H.x, d.y - H.y) || 1;
        lungeX = d.x + (d.x - H.x)/L*140; lungeY = Math.max(60, d.y + (d.y - H.y)/L*140);
        setSt('lunge'); H.v = 900; sfx('growl');
      }
      break;
    }
    case 'lunge': {
      steer(lungeX, lungeY, 1550, 1.2, dt); jawW = stT < 0.32 ? 1 : 0; eyeW = 1;
      if (stT > 0.5) setSt('recover');
      break;
    }
    case 'roar': case 'shift': {
      steer(H.x + H.ca*60, H.y - 120, 50, 1.2, dt); jawW = 1; eyeW = 1;
      if (!once && stT > 0.3) { once = 1; doRoar(); if (st === 'shift' && phase === 3) flash('#ff2a10', 0.3); }
      if (st === 'shift' && once === 1 && stT > 1.2) { once = 2; summon(phase === 2 ? 7 : 6); }
      if (stT > (st === 'shift' ? 2.8 : 1.8)) { if (st === 'roar') roarT = rnd(12, 15); enterCircle(); }
      break;
    }
    case 'dying': {
      dieT += dt;
      steer(H.x + arc*140, H.y + 300, 60 + dieT*12, 0.6, dt);
      jawW = 0.75; eyeW = dieT < 3.6 ? (Math.sin(T*30) > 0 ? 1 : 0.15) : 0; gillW = 0;
      H.a += Math.sin(T*9)*dt*(dieT < 4 ? 1.2 : 0.3);
      burstT -= dt;
      if (burstT <= 0 && burstI < 15) {
        burstT = 0.27;
        const i = Math.min(N - 1, Math.round(burstI*2));
        nodes[i].lit = 1;
        fxBoom(PX[i], PY[i], 40 + RAD[i]*0.7);
        ichor(PX[i], PY[i], 6);
        for (let k = 0; k < 8; k++) add(K_EMB, PX[i], PY[i], rnd(-260, 260), rnd(-260, 260), rnd(1.5, 3.5), rnd(0.4, 0.9));
        if (burstI%2 === 0) sfx('boom');
        shake(6); burstI++;
      }
      if (!won && dieT > 4.6) {
        won = true; on = false;
        flash('#fff3d0', 0.6); shake(18); sfx('boom'); buzz([120, 60, 240]);
        for (let i = 1; i < N; i += 4) nodes[i].lit = 1;
        killSummoned();
        if (DG.core && DG.core.bossWon) DG.core.bossWon();
        msg('Zafer! Derinlerin Efendisi çukura gömüldü.', 'var(--amber)');
      }
      if (won) { goneT += dt; if (goneT > 10) { vis = false; resetBoat(); boatHp = BOAT_MAX; } }
      break;
    }
    case 'gloat': {
      BT.sink = Math.min(1, BT.sink + dt/2.8);
      if (stT < 3.4) { steer(bx + 230*BT.side*-1, 120, 300, 1.6, dt); jawW = stT > 0.6 ? 1 : 0.3; eyeW = 1; }
      else steer(H.x, 1800, 420, 1.2, dt);
      if (!once && stT > 0.8) { once = 1; sfx('roar'); shake(10); }
      if (on && stT > 2.8) { on = false; killSummoned(); if (DG.core && DG.core.bossLost) DG.core.bossLost(); }
      if (stT > 9) vis = false;
      break;
    }
  }
  H.x = clamp(H.x, 110, WW() - 110);
  H.y = Math.min(H.y, 1900);
  if (st !== 'breach' && st !== 'rise' && st !== 'ram' && st !== 'gloat' && st !== 'dying') H.y = Math.max(H.y, 70);
  if (live && fightable()) contact();
}
function orbitStep(dt, v){
  const d = DG.S.diver, rx = 420, ry = 220;
  orb.cx += (clamp(d.x, 430, WW() - 430) - orb.cx)*Math.min(1, dt*0.4);
  orb.cy += (clamp(d.y + 60, 360, 720) - orb.cy)*Math.min(1, dt*0.4);
  orb.th += orb.dir*v/330*dt;
  const th = orb.th + orb.dir*0.5;
  const tx = clamp(orb.cx + Math.cos(th)*rx, 160, WW() - 160), ty = clamp(orb.cy + Math.sin(th)*ry, 150, 1150);
  steer(tx, ty, v, 1.7, dt);
}
function contact(){
  const d = DG.S.diver; if (d.y < 0) return;
  const x1 = wx(60, 0), y1 = wy(60, 0), x2 = wx(150, 8), y2 = wy(150, 8);
  const near = (d.x - x1)*(d.x - x1) + (d.y - y1)*(d.y - y1) < 82*82 || (d.x - x2)*(d.x - x2) + (d.y - y2)*(d.y - y2) < 48*48;
  if (!near || contactCd > 0) return;
  if (st === 'ram' || st === 'lunge' || st === 'rise') { hurtD(0.15, NAME, {x:H.x, y:H.y}); contactCd = 0.8; shake(6); }
  else { hurtD(0.05, 'Zırhlı baş', {x:H.x, y:H.y}); contactCd = 1.2; }
}

// ---------- gövde ----------
function moveBody(dt){
  H.ca = Math.cos(H.a); H.sa = Math.sin(H.a);
  if (H.ca > 0.22) H.rt = 1; else if (H.ca < -0.22) H.rt = -1;
  H.roll += clamp(H.rt - H.roll, -dt*5, dt*5);
  H.rd = H.roll >= 0 ? Math.max(0.3, H.roll) : Math.min(-0.3, H.roll);
  const n0 = nodes[0]; n0.x = wx(-66, 4); n0.y = wy(-66, 4); n0.roll = H.roll;
  const rk = Math.min(1, dt*Math.max(2.5, H.v/SP));
  for (let i = 1; i < N; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    b.x = a.x + dx/L*SP; b.y = a.y + dy/L*SP;
    b.roll += (a.roll - b.roll)*rk;
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < N; i++) {
    const a = nodes[i > 0 ? i - 1 : 0], c = nodes[i < N - 1 ? i + 1 : N - 1];
    let fx = a.x - c.x, fy = a.y - c.y;
    const L = Math.hypot(fx, fy) || 1; fx /= L; fy /= L;
    NX[i] = fy; NY[i] = -fx;
    const w = Math.sin(T*3 - i*0.45)*9*(i/N);
    PX[i] = nodes[i].x + NX[i]*w; PY[i] = nodes[i].y + NY[i]*w;
    const r = RAD[i] + 70;
    if (PX[i] - r < x0) x0 = PX[i] - r; if (PX[i] + r > x1) x1 = PX[i] + r;
    if (PY[i] - r < y0) y0 = PY[i] - r; if (PY[i] + r > y1) y1 = PY[i] + r;
  }
  box.x0 = x0 - 60; box.y0 = y0 - 60; box.x1 = x1 + 60; box.y1 = y1 + 60;
}

// ---------- dokunaç fiziği ----------
function solve(t, rx, ry, tx, ty, k, dt, cnt, stretch){
  const ns = t.nodes, n = cnt || ns.length, seg = t.seg*t.grow*(stretch || 1);
  const tip = ns[n - 1], f = Math.min(1, dt*k);
  tip.x += (tx - tip.x)*f; tip.y += (ty - tip.y)*f;
  for (let i = n - 2; i >= 0; i--) { const a = ns[i + 1], b = ns[i], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; b.x = a.x + dx/L*seg; b.y = a.y + dy/L*seg; }
  for (let i = 1; i < n - 1; i++) { const a = ns[i - 1], b = ns[i], c = ns[i + 1]; b.x += ((a.x + c.x)*0.5 - b.x)*0.12; b.y += ((a.y + c.y)*0.5 - b.y)*0.12; }
  ns[0].x = rx; ns[0].y = ry;
  for (let i = 1; i < n; i++) { const a = ns[i - 1], b = ns[i], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; b.x = a.x + dx/L*seg; b.y = a.y + dy/L*seg; }
}
function updTents(dt, live){
  const S = DG.S, d = S.diver;
  let striking = 0;
  for (const t of LONG) if (t.st === 'wind' || t.st === 'strike' || t.st === 'grab') striking++;
  const allow = live && (st === 'circle' || st === 'recover' || st === 'siege' || st === 'spit') && d.y > 25 && !camo();
  for (const t of TN) {
    const ns = t.nodes, n = ns.length, rx = wx(t.lx, t.ly), ry = wy(t.lx, t.ly);
    t.t += dt; if (t.fl > 0) t.fl -= dt*4; if (t.stun > 0) t.stun -= dt; if (t.cd > 0) t.cd -= dt;
    // boşta: geriye ve aşağı süzülür, dalgalanır
    const bxv = -H.ca, byv = -H.sa, wav = Math.sin(T*1.3 + t.ph)*t.len*0.28;
    let tx = rx + bxv*t.len*0.55 - byv*wav, ty = ry + byv*t.len*0.55 + t.len*0.5 + bxv*wav, k = 3;
    if (st === 'dying') { ty += 200; k = 1.5; }
    switch (t.st) {
      case 'cut': t.regrow -= dt; t.grow = 0.2; if (t.regrow <= 0) { t.st = 'grow'; t.t = 0; t.hp = t.maxHp = TENT_HP[phase]; } break;
      case 'grow': t.grow = Math.min(1, 0.2 + t.t/1.6); if (t.grow >= 1) { t.st = 'idle'; t.cd = 1.5; } break;
      case 'idle': {
        t.grow = 1;
        if (allow && t.long && t.cd <= 0 && t.stun <= 0 && swipeT <= 0 && striking < STRIKERS[phase] && Math.hypot(d.x - rx, d.y - ry) < t.len*0.92) {
          t.st = 'wind'; t.t = 0; striking++; swipeT = 0.7;
        }
        break;
      }
      case 'wind': {
        const L = Math.hypot(d.x - rx, d.y - ry) || 1;
        tx = rx - (d.x - rx)/L*t.len*0.35; ty = ry - (d.y - ry)/L*t.len*0.35 - t.len*0.3; k = 5;
        if (!live) { t.st = 'idle'; break; }
        if (t.t > TWIND[phase]) {
          t.st = 'strike'; t.t = 0; t.hit = false;
          t.tx = d.x + d.vx*0.12 + (d.x - rx)/L*80; t.ty = d.y + d.vy*0.12 + (d.y - ry)/L*80;
          sfx('dash');
        }
        break;
      }
      case 'strike': {
        tx = t.tx; ty = t.ty; k = 13;
        if (!t.hit && live) {
          for (let j = n - 5; j < n; j++) {
            const q = ns[j], rr = 22 + t.w*(1 - j/n);
            if ((q.x - d.x)*(q.x - d.x) + (q.y - d.y)*(q.y - d.y) < rr*rr) {
              t.hit = true;
              if (phase === 3 && !grabTent && !camo() && !dashing()) {
                grabTent = t; t.st = 'grab'; t.t = 0; grabT = 0; grabTick = 0.45;
                msg('Dokunaç seni yakaladı! Kes ya da hız patlamasıyla kurtul.', 'var(--danger)'); sfx('growl'); buzz(100);
              } else hurtD(0.09, 'Dokunaç', ns[n - 1]);
              break;
            }
          }
        }
        if (t.st === 'strike' && t.t > 0.42) { t.st = 'idle'; t.cd = SWIPE_CD[phase]; }
        break;
      }
      case 'grab': {
        tx = d.x; ty = d.y; k = 25;
        grabT += dt; grabTick -= dt;
        const mx = wx(130, 40), my = wy(130, 40), dd = Math.hypot(d.x - mx, d.y - my) || 1;
        if (dd > 120) { d.x += (mx - d.x)/dd*150*dt; d.y = Math.max(0, d.y + (my - d.y)/dd*150*dt); }
        if (DG.core.slow) DG.core.slow(0.25);
        if (grabTick <= 0) { grabTick = 0.8; hurtD(0.035, 'Dokunaç sıkıyor', ns[n - 1]); }
        if (grabT > 3.2 || !live) release(t, false);
        else if (dashing()) release(t, true);
        break;
      }
      case 'boat': {
        // ilk düğümler kökten teknenin yanına uzanır, son yedisi gövdeyi sarar
        t.wrap = Math.min(1, t.wrap + dt*1.6);
        const K = WRAP.length, m = n - K + 1, s = siegeSide;
        toBoat(WRAP[0][0]*s, WRAP[0][1], tmp2);
        solve(t, rx, ry, tmp2[0], tmp2[1], 6, dt, m, 1.5);
        const f = Math.min(1, dt*(4 + t.wrap*8));
        for (let j = 1; j < K; j++) {
          toBoat(WRAP[j][0]*s, WRAP[j][1], tmp2);
          const q = ns[m - 1 + j], px = ns[m - 1 + j - 1];
          const ax = px.x + (tmp2[0] - px.x)*t.wrap, ay = px.y + (tmp2[1] - px.y)*t.wrap;
          q.x += (ax - q.x)*f; q.y += (ay - q.y)*f;
        }
        if (t.wrap >= 1 && live) {
          boatDmg(SQUEEZE[phase]*dt);
          BT.rv += Math.sin(T*9)*0.6*dt*s;
          creakT -= dt; if (creakT <= 0) { creakT = 1.6; sfx('growl'); shake(3); }
        }
        if (!live && !siegeOn) t.st = 'idle';
        break;
      }
    }
    if (t.st !== 'boat') {
      if (t.st === 'idle' || t.st === 'cut' || t.st === 'grow') for (let j = 1; j < n; j++) ns[j].y += 18*dt;
      solve(t, rx, ry, tx, ty, k, dt);
    }
    // isabet noktaları
    if (t.long) {
      const a = t.st === 'boat' ? Math.max(2, n - WRAP.length - 1) : Math.floor(n*0.45), b = t.st === 'boat' ? Math.floor((n - WRAP.length)/2) : n - 3;
      t.parts[0].x = ns[a].x; t.parts[0].y = ns[a].y; t.parts[1].x = ns[b].x; t.parts[1].y = ns[b].y;
    }
  }
}

// ---------- parçacık güncelleme ----------
function updParts(dt){
  const d = DG.S.diver;
  let inked = false;
  for (const p of PT) {
    p.life -= dt;
    switch (p.k) {
      case K_DROP: if (p.y < 0) p.vy += 1300*dt; else { p.life = Math.min(p.life, 0.05); } break;
      case K_BUB: p.vy += (-110 - p.vy)*Math.min(1, dt*2); p.a += dt*5; p.x += Math.sin(p.a)*0.5; if (p.y < 2) p.life = 0; break;
      case K_INK: case K_ICH: { const k = Math.exp(-1.4*dt); p.vx *= k; p.vy *= k; p.r += p.g*dt; if (p.y < 4) p.y = 4;
        if (p.big && !inked && p.life > p.max*0.25) { const dx = p.x - d.x, dy = p.y - d.y; if (dx*dx + dy*dy < p.r*p.r*0.5) inked = true; }
        break; }
      case K_DEB: if (p.y < 0) p.vy += 900*dt; else { p.vy += (45 - p.vy)*Math.min(1, dt*2); p.vx *= Math.exp(-1.5*dt); } p.a += p.va*dt; break;
      case K_EMB: { const k = Math.exp(-3*dt); p.vx *= k; p.vy *= k; break; }
      case K_SMOKE: p.vy += (-46 - p.vy)*Math.min(1, dt); p.vx += (-26 - p.vx)*Math.min(1, dt*0.4); p.r += 12*dt; break;
      case K_RING: p.r += p.vx*dt; p.vx *= Math.exp(-1.8*dt); continue;
    }
    p.x += p.vx*dt; p.y += p.vy*dt;
  }
  compact(PT, p => p.life > 0);
  if (inked && on && DG.S.playing && DG.core.ink) DG.core.ink(1.1);
  for (const g of GL) {
    g.life -= dt; g.tr -= dt;
    const a = Math.atan2(g.vy, g.vx), want = Math.atan2(d.y - g.y, d.x - g.x), na = a + clamp(angDiff(want, a), -1.1*dt, 1.1*dt), sp = Math.hypot(g.vx, g.vy);
    g.vx = Math.cos(na)*sp; g.vy = Math.sin(na)*sp;
    g.x += g.vx*dt; g.y += g.vy*dt;
    if (g.tr <= 0) { g.tr = 0.03; const p = add(K_INK, g.x, g.y, rnd(-20, 20), rnd(-20, 20), rnd(5, 9), rnd(0.6, 1)); if (p) p.g = 14; }
    if (on && DG.S.playing && (g.x - d.x)*(g.x - d.x) + (g.y - d.y)*(g.y - d.y) < 30*30) {
      if (DG.core.ink) DG.core.ink(3.2);
      hurtD(0.05, 'Mürekkep', g); inkCloud(g.x, g.y, 1.2); g.life = 0;
    } else if (g.life <= 0 || g.y < 0) { inkCloud(g.x, Math.max(10, g.y), 1); g.life = 0; }
  }
  compact(GL, g => g.life > 0);
  for (const c of DTN) { c.life -= dt; c.vy += (60 - c.vy)*dt; for (let i = 0; i < c.pts.length; i += 2) { c.pts[i] += c.vx*dt + Math.sin(T*3 + i)*6*dt; c.pts[i + 1] += c.vy*dt*(0.6 + i/c.pts.length); } }
  compact(DTN, c => c.life > 0);
  for (const r of RINGS) { r.life -= dt; r.r += r.v*dt; r.v *= Math.exp(-1.5*dt); }
  compact(RINGS, r => r.life > 0);
}

// ---------- hedef listesi ----------
function setP(p, lx, ly){ p.x = wx(lx, ly); p.y = wy(lx, ly); }
function buildTargets(){
  TG.length = 0;
  if (!on || !fightable()) return;
  if (jaw > 0.35) { setP(P_MOUTH, 92, 30); P_MOUTH.weak = true; TG.push(P_MOUTH); }
  setP(P_EYE, 34, -39); P_EYE.weak = eyeO > 0.5; P_EYE.r = P_EYE.weak ? 30 : 22; TG.push(P_EYE);
  setP(P_GILL, -49, 13); P_GILL.weak = gillO > 0.5; TG.push(P_GILL);
  for (const t of LONG) if (t.st !== 'cut' && t.st !== 'grow') { TG.push(t.parts[0], t.parts[1]); }
  setP(P_CROWN, -40, -40); TG.push(P_CROWN);
  setP(P_HEAD, 20, 14); TG.push(P_HEAD);
  setP(P_SNOUT, 130, 2); TG.push(P_SNOUT);
  // toslama hazırlığında gövde derinde kıvrılır: nişan başa (gözlere) kilitlensin
  if (st !== 'windup' && st !== 'ram') for (let i = 0; i < BODY_IDX.length; i++) { const p = P_BODY[i], j = BODY_IDX[i]; p.x = PX[j]; p.y = PY[j]; TG.push(p); }
}

// ---------- ana güncelleme ----------
function update(dt){
  const S = DG.S; if (!S || !S.diver) return;
  if (away) {
    const d = S.diver;
    if (S.playing && !S.riding && d.y < 25 && Math.abs(d.x - BX()) < 140 && !(S.save && S.save.bossDone)) start();
    return;
  }
  if (!vis && BT.sink <= 0) { murk = 0; return; }
  T += dt;
  updBoat(dt);
  if (!vis) return;
  if (on && !won && !lost && S.diver.y > 2600 && !S.riding) { retreat(); return; }
  stT += dt;
  const live = on && S.playing && !S.riding;
  if (live) fightT += dt;
  resolve();
  flushNums(dt);
  think(dt, live);
  moveBody(dt);
  updTents(dt, live);
  const ek = Math.min(1, dt*8);
  eyeO += (eyeW - eyeO)*ek; gillO += (gillW - gillO)*Math.min(1, dt*5); jaw += (jawW - jaw)*Math.min(1, dt*(jawW < jaw ? 12 : 6));
  enr += ((phase === 3 && on ? 1 : 0) - enr)*Math.min(1, dt*1.5);
  if (flashB > 0) flashB = Math.max(0, flashB - dt*5);
  if (flashH > 0) flashH = Math.max(0, flashH - dt*5);
  for (const p of WEAKP) if (p.fl > 0) p.fl = Math.max(0, p.fl - dt*4);
  updParts(dt);
  checkPhase();
  buildTargets();
  murk += (((on || st === 'dying' || st === 'gloat') ? 1 : 0) - murk)*Math.min(1, dt*(on ? 0.7 : 0.35));
  if (on && DG.core && DG.core.bossHUD) DG.core.bossHUD(hp/MAX_HP, boatHp/BOAT_MAX, NAME);
}

// ---------- çizim yardımcıları ----------
let PATH = null, hornG = null, gCtx = null;
function paths(){
  if (PATH) return PATH;
  const p = d => new Path2D(d);
  let tu = '', tl = '', rings = '';
  const UX = [48, 62, 76, 90, 104, 118, 132, 146, 166, 180], UL = [9, 13, 10, 15, 11, 17, 11, 19, 14, 9];
  for (let i = 0; i < UX.length; i++) { const x = UX[i], y = x < 152 ? 17 - (x - 42)*6/110 : 11 + (x - 152)*7/34, l = UL[i], w = 3.2 + l*0.12; tu += 'M' + (x - w) + ' ' + (y - 1) + 'L' + (x + w) + ' ' + (y - 1) + 'L' + (x - 1.5) + ' ' + (y + l) + 'Z'; }
  const LX = [54, 70, 86, 102, 118, 134, 148], LL = [8, 12, 9, 14, 10, 15, 11];
  for (let i = 0; i < LX.length; i++) { const x = LX[i], y = 19 - (x - 42)*6/108, l = LL[i], w = 3 + l*0.12; tl += 'M' + (x - w) + ' ' + (y + 1) + 'L' + (x + w) + ' ' + (y + 1) + 'L' + (x + 1.5) + ' ' + (y - l) + 'Z'; }
  const bz = (p0, p1, p2, p3, t) => { const u = 1 - t; return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3; };
  for (const t of [0.16, 0.3, 0.44, 0.58, 0.72]) {
    const s = 1 - t;
    rings += 'M' + bz(-36, -72, -132, -196, t).toFixed(1) + ' ' + bz(-58, -98, -120, -114, t).toFixed(1) + 'L' + bz(-196, -142, -92, -4, s).toFixed(1) + ' ' + bz(-114, -104, -82, -64, s).toFixed(1);
  }
  PATH = {
    skull: p('M-78-36C-74-62-44-76-10-72C22-68 44-62 64-50C96-36 140-30 172-20C188-15 199-6 197 4L186 18C180 10 170 9 152 11L42 17C14 19-8 23-24 31C-40 46-62 54-82 46C-94 28-92-14-78-36Z'),
    jaw: p('M-30 26L42 19L150 13C160 13 170 17 174 24C162 34 132 44 84 50C44 56 4 58-30 48Z'),
    jawLow: p('M-28 44C4 52 44 50 84 44C120 38 150 31 170 25C162 34 132 44 84 50C44 56 4 58-30 48Z'),
    jawSeam: p('M-6 28C10 34 18 42 22 53M44 22C56 28 62 38 64 50M104 18C112 24 116 32 116 42'),
    crown: p('M-76-36C-70-60-44-72-14-70L-18-48C-40-44-60-34-72-18Z'),
    brow: p('M-14-70C20-66 46-60 68-48C58-40 30-42-10-50Z'),
    snout: p('M70-44C96-36 126-30 168-20L162-10C126-18 98-24 72-32Z'),
    cheek: p('M-6-28C40-24 86-16 130-8L122 6C80 8 32 10-12 8Z'),
    seams: p('M-14-70L-18-48M68-48L72-32M118-31L114-20M146-25L142-15M-6-28C-14-10-16 4-12 8M30-22L28 9M70-15L68 8M-58-56L-52-38M-38-64L-32-46'),
    hl: p('M-74-40C-68-60-44-70-16-69M-10-69C20-65 44-59 64-49M74-43C98-36 128-29 166-20M-4-27C40-23 84-15 126-8'),
    gills: p('M-34-6Q-24 13-34 32M-49-8Q-38 13-49 34M-64-6Q-53 13-64 30'),
    hornA: p('M-36-58C-72-98-132-120-196-114C-142-104-92-82-4-64Z'),
    hornB: p('M-70-24C-108-48-156-58-204-50C-156-40-116-26-74-6Z'),
    hornRings: p(rings),
    frill: p('M-62-44L-150-88Q-145-54-178-58Q-157-32-186-24Q-155-9-172 8Q-138 12-138 34L-74 30Z'),
    frillSp: p('M-64-40L-150-88M-72-26L-178-58M-78-10L-186-24M-78 8L-172 8M-74 24L-138 34'),
    teethU: p(tu), teethL: p(tl),
  };
  return PATH;
}
function hornGrad(ctx){
  if (hornG && gCtx === ctx) return hornG;
  gCtx = ctx; hornG = ctx.createLinearGradient(-20, -60, -200, -100);
  hornG.addColorStop(0, '#24201d'); hornG.addColorStop(0.45, '#6d6352'); hornG.addColorStop(1, '#d6c8a4');
  return hornG;
}
// noktalar arasından yumuşak eğri
function smooth(p, xs, ys, n, move){
  if (move) p.moveTo(xs[0], ys[0]); else p.lineTo(xs[0], ys[0]);
  for (let i = 1; i < n - 1; i++) p.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1])*0.5, (ys[i] + ys[i + 1])*0.5);
  p.lineTo(xs[n - 1], ys[n - 1]);
}
const AX = new Float32Array(64), AY = new Float32Array(64), BXa = new Float32Array(64), BYa = new Float32Array(64);
// yumuşak kenarlı lekeler (duman, mürekkep, kan) için önbellekli radyal sprite
const SPR = {};
function soft(rgb){
  if (SPR[rgb]) return SPR[rgb];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.42, 'rgba(' + rgb + ',.78)'); gr.addColorStop(0.75, 'rgba(' + rgb + ',.28)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (SPR[rgb] = c);
}
// ışık lekesi: renk 16'lık adımlarla önbelleğe alınır, 'lighter' ile çizilir
const GSPR = {};
function glow(ctx, c, x, y, r, a){
  if (a <= 0.004 || r <= 0) return;
  const key = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
  let spr = GSPR[key];
  if (!spr) {
    spr = document.createElement('canvas'); spr.width = spr.height = 64;
    const g = spr.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32), rgb = ((key >> 8) << 4 | 8) + ',' + (((key >> 4) & 15) << 4 | 8) + ',' + ((key & 15) << 4 | 8);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.3, 'rgba(' + rgb + ',.42)'); gr.addColorStop(0.65, 'rgba(' + rgb + ',.1)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    GSPR[key] = spr;
  }
  const ga = ctx.globalAlpha; ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(spr, x - r, y - r, r*2, r*2);
  ctx.globalAlpha = ga;
}
const onScr = (x, y, m) => { const S = DG.S; return x > -m && x < S.W + m && y > -m && y < S.H + m; };

const CQ = [0, 0, 0, 0];
// yele dikeni: uç (0,1) ve taban (2,3); boyun ve kuyruk yanında kısalır
function crestPt(i, ox, oy, out){
  const rl = nodes[i].roll, R = RAD[i], ce = N - 8;
  const h = R*0.85*(i < 5 ? 0.5 + i*0.1 : i > ce - 4 ? Math.max(0.25, (ce - i)/4) : 1);
  out[0] = PX[i] + NX[i]*rl*(R*0.78 + h) + NY[i]*h*0.6 + ox;
  out[1] = PY[i] + NY[i]*rl*(R*0.78 + h) - NX[i]*h*0.6 + oy;
  out[2] = PX[i] + NX[i]*rl*R*0.6 + ox; out[3] = PY[i] + NY[i]*rl*R*0.6 + oy;
}
function spineTri(p, Q){
  const dx = Q[0] - Q[2], dy = Q[1] - Q[3], L = Math.hypot(dx, dy) || 1, w = 2.8;
  p.moveTo(Q[2] - dy/L*w, Q[3] + dx/L*w); p.lineTo(Q[0], Q[1]); p.lineTo(Q[2] + dy/L*w, Q[3] - dx/L*w); p.closePath();
}
function drawBody(ctx, ox, oy){
  const e = N - 1;
  // kuyruk yüzgeci
  {
    const rl = Math.abs(nodes[e].roll)*0.85 + 0.15, bx = NY[e], by = -NX[e], b = e - 3;
    const ex = PX[e] + ox, ey = PY[e] + oy;
    const ux = ex + bx*95 + NX[e]*72*rl, uy = ey + by*95 + NY[e]*72*rl, lx = ex + bx*95 - NX[e]*72*rl, ly = ey + by*95 - NY[e]*72*rl;
    const fp = new Path2D();
    fp.moveTo(PX[b] + NX[b]*RAD[b]*rl + ox, PY[b] + NY[b]*RAD[b]*rl + oy);
    fp.quadraticCurveTo(PX[e - 1] + NX[e - 1]*44*rl + ox, PY[e - 1] + NY[e - 1]*44*rl + oy, ux, uy);
    fp.lineTo(ex + bx*42, ey + by*42); fp.lineTo(lx, ly);
    fp.quadraticCurveTo(PX[e - 1] - NX[e - 1]*44*rl + ox, PY[e - 1] - NY[e - 1]*44*rl + oy, PX[b] - NX[b]*RAD[b]*rl + ox, PY[b] - NY[b]*RAD[b]*rl + oy);
    fp.closePath();
    ctx.fillStyle = C.fin; ctx.fill(fp);
    const rp = new Path2D();
    for (let k = 0; k <= 6; k++) { const f = k/6; rp.moveTo(ex - bx*10, ey - by*10); rp.lineTo(ux + (ex + bx*42 - ux)*f*0.9, uy + (ey + by*42 - uy)*f*0.9); rp.moveTo(ex - bx*10, ey - by*10); rp.lineTo(lx + (ex + bx*42 - lx)*f*0.9, ly + (ey + by*42 - ly)*f*0.9); }
    ctx.strokeStyle = C.ray; ctx.lineWidth = 1.4; ctx.stroke(rp);
  }
  // kızıl sırt yelesi (gövdenin arkasında): dikenler arasında kavisli zar
  const ce = N - 8, cp = new Path2D(), sp = new Path2D(), Q = CQ;
  crestPt(1, ox, oy, Q); cp.moveTo(Q[2], Q[3]); cp.lineTo(Q[0], Q[1]);
  let px = Q[0], py = Q[1];
  spineTri(sp, Q);
  for (let i = 3; i <= ce; i += 2) {
    const j = i - 1, rl = nodes[j].roll, R = RAD[j], bx = PX[j] + NX[j]*rl*R*0.8 + ox, by = PY[j] + NY[j]*rl*R*0.8 + oy;
    crestPt(i, ox, oy, Q);
    cp.quadraticCurveTo((px + Q[0])*0.28 + bx*0.44, (py + Q[1])*0.28 + by*0.44, Q[0], Q[1]);
    spineTri(sp, Q);
    px = Q[0]; py = Q[1];
  }
  for (let i = ce; i >= 1; i--) { const rl = nodes[i].roll, R = RAD[i]; cp.lineTo(PX[i] + NX[i]*rl*R*0.7 + ox, PY[i] + NY[i]*rl*R*0.7 + oy); }
  cp.closePath();
  ctx.fillStyle = C.crest; ctx.fill(cp);
  ctx.fillStyle = C.spine; ctx.fill(sp);
  // gövde kabuğu
  let m = 0;
  for (let i = 0; i < N; i++) { AX[m] = PX[i] + NX[i]*RAD[i] + ox; AY[m] = PY[i] + NY[i]*RAD[i] + oy; m++; }
  AX[m] = PX[e] + NY[e]*16 + ox; AY[m] = PY[e] - NX[e]*16 + oy; m++;
  for (let i = e; i >= 0; i--) { AX[m] = PX[i] - NX[i]*RAD[i] + ox; AY[m] = PY[i] - NY[i]*RAD[i] + oy; m++; }
  const bp = new Path2D(); smooth(bp, AX, AY, m, true); bp.closePath();
  ctx.fillStyle = C.body; ctx.fill(bp);
  // karın plakaları
  let q = 0;
  for (let i = 0; i < e; i++) { const rl = nodes[i].roll, R = RAD[i]; AX[q] = PX[i] - NX[i]*rl*R*0.97 + ox; AY[q] = PY[i] - NY[i]*rl*R*0.97 + oy; BXa[q] = PX[i] - NX[i]*rl*R*0.3 + ox; BYa[q] = PY[i] - NY[i]*rl*R*0.3 + oy; q++; }
  const vp = new Path2D(); smooth(vp, AX, AY, q, true);
  for (let i = q - 1; i >= 0; i--) vp.lineTo(BXa[i], BYa[i]);
  vp.closePath();
  ctx.fillStyle = C.belly; ctx.fill(vp);
  // sırt parlaklığı: hacim hissi
  q = 0;
  for (let i = 0; i < e; i++) { const rl = nodes[i].roll, R = RAD[i]; AX[q] = PX[i] + NX[i]*rl*R*0.9 + ox; AY[q] = PY[i] + NY[i]*rl*R*0.9 + oy; BXa[q] = PX[i] + NX[i]*rl*R*0.22 + ox; BYa[q] = PY[i] + NY[i]*rl*R*0.22 + oy; q++; }
  const dp = new Path2D(); smooth(dp, AX, AY, q, true);
  for (let i = q - 1; i >= 0; i--) dp.lineTo(BXa[i], BYa[i]);
  dp.closePath();
  ctx.fillStyle = C.sheen; ctx.fill(dp);
  // boğum dikişleri ve karın pulları
  const sm = new Path2D();
  for (let i = 1; i < e; i++) {
    const R = RAD[i]*0.97, bx = NY[i], by = -NX[i], x = PX[i] + ox, y = PY[i] + oy;
    sm.moveTo(x + NX[i]*R, y + NY[i]*R);
    sm.quadraticCurveTo(x + bx*R*0.55, y + by*R*0.55, x - NX[i]*R, y - NY[i]*R);
  }
  ctx.strokeStyle = C.seam; ctx.lineWidth = 2.4; ctx.stroke(sm);
  // gökyüzünden gelen kenar ışığı
  const rp = new Path2D(); let pen = false;
  for (let i = 1; i < e; i++) {
    const s = NY[i] < 0 ? 1 : -1, k = Math.abs(NY[i]);
    if (k < 0.35) { pen = false; continue; }
    const x = PX[i] + NX[i]*s*RAD[i]*0.88 + ox, y = PY[i] + NY[i]*s*RAD[i]*0.88 + oy;
    if (!pen) { rp.moveTo(x, y); pen = true; } else rp.lineTo(x, y);
  }
  ctx.strokeStyle = C.rim; ctx.lineWidth = 2.6; ctx.stroke(rp);
  if (flashB > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flashB*0.32).toFixed(3) + ')'; ctx.fill(bp); }
}

function tentShape(xs, ys, n, w0, ox, oy, full, k0, shrink){
  // dokunaç dış hattı (kökten uca incelir)
  let m = 0;
  for (let k = 0; k < n; k++) {
    const a = k > 0 ? k - 1 : 0, c = k < n - 1 ? k + 1 : n - 1;
    let fx = xs[c] - xs[a], fy = ys[c] - ys[a]; const L = Math.hypot(fx, fy) || 1; fx /= L; fy /= L;
    const w = Math.max(1, w0*Math.pow(Math.max(0, 1 - (k + (k0 || 0))/(full || n)), 0.8) + 1.3 - (shrink || 0));
    AX[m] = xs[k] - fy*w + ox; AY[m] = ys[k] + fx*w + oy; BXa[m] = xs[k] + fy*w + ox; BYa[m] = ys[k] - fx*w + oy; m++;
  }
  const p = new Path2D();
  smooth(p, AX, AY, m, true);
  for (let k = m - 1; k >= 0; k--) p.lineTo(BXa[k], BYa[k]);
  p.closePath();
  if (EDGE) { EDGE = new Path2D(); smooth(EDGE, AX, AY, m, true); }
  return p;
}
let EDGE = null;
const TXS = new Float32Array(16), TYS = new Float32Array(16);
function drawTent(ctx, t, ox, oy){
  const ns = t.nodes, n = t.st === 'cut' ? 3 : ns.length;
  const rx = ns[0].x + ox, ry = ns[0].y + oy;
  if (!onScr(rx, ry, t.len + 60)) return;
  for (let k = 0; k < n; k++) { TXS[k] = ns[k].x; TYS[k] = ns[k].y; }
  EDGE = true;
  const p = tentShape(TXS, TYS, n, t.w, ox, oy, ns.length), edge = EDGE; EDGE = null;
  ctx.fillStyle = C.tent; ctx.fill(p);
  ctx.strokeStyle = C.tentRim; ctx.lineWidth = 1.6; ctx.stroke(edge);
  // vantuzlar (alt yüz)
  const sp = new Path2D();
  for (let k = 2; k < n - 1; k++) {
    const fx = ns[k + 1].x - ns[k - 1].x, fy = ns[k + 1].y - ns[k - 1].y, L = Math.hypot(fx, fy) || 1;
    const w = t.w*Math.pow(1 - k/ns.length, 0.8) + 1.3, r = w*0.24;
    const x = ns[k].x + fy/L*w*0.52 + ox, y = ns[k].y - fx/L*w*0.52 + oy;
    sp.moveTo(x + r, y); sp.arc(x, y, r, 0, TAU);
  }
  ctx.fillStyle = C.sucker; ctx.fill(sp);
  if (t.st === 'cut') { ctx.fillStyle = rgba(C.ichor, 0.95); ctx.beginPath(); ctx.arc(ns[2].x + ox, ns[2].y + oy, t.w*0.9, 0, TAU); ctx.fill(); }
  if (t.st === 'wind' || t.st === 'grab') { ctx.strokeStyle = 'rgba(255,70,50,' + (0.55 + 0.4*Math.sin(T*24)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke(p); }
  if (t.fl > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (t.fl*0.5).toFixed(3) + ')'; ctx.fill(p); }
}

function drawEyes(ctx){
  const col = mixc(EC0, EC1, enr), o = eyeO;
  for (const e of EYES) {
    ctx.fillStyle = '#04070a'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r*1.32, e.r*1.06, -0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(mixc([60, 40, 16], col, 0.35 + 0.65*o), 1); ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(mixc(col, [255, 245, 210], 0.5), 0.5 + 0.5*o); ctx.beginPath(); ctx.arc(e.x - e.r*0.15, e.y - e.r*0.1, e.r*0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = '#070303'; ctx.beginPath(); ctx.ellipse(e.x + e.r*0.08, e.y, e.r*(0.16 + 0.12*(1 - o)), e.r*0.86, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(e.x - e.r*0.42, e.y - e.r*0.42, Math.max(1, e.r*0.16), 0, TAU); ctx.fill();
    if (o < 0.97) {
      // zırhlı göz kapağı
      ctx.save(); ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r*1.34, e.r*1.08, -0.25, 0, TAU); ctx.clip();
      const top = e.y - e.r*1.3, yl = e.y - e.r*1.05 + (1 - o)*e.r*1.62;
      ctx.fillStyle = C.crown; ctx.fillRect(e.x - e.r*1.5, top, e.r*3, yl - top);
      ctx.strokeStyle = C.hl; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(e.x - e.r*1.4, yl - 1); ctx.lineTo(e.x + e.r*1.4, yl - 1 - e.r*0.2); ctx.stroke();
      ctx.restore();
    }
  }
}
function drawHead(ctx, ox, oy){
  const P = paths(), hg = hornGrad(ctx);
  ctx.save();
  ctx.translate(H.x + ox, H.y + oy); ctx.rotate(H.a); ctx.scale(1, H.rd);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = C.frill; ctx.fill(P.frill);
  ctx.strokeStyle = C.spine; ctx.lineWidth = 2.6; ctx.stroke(P.frillSp);
  ctx.fillStyle = hg; ctx.fill(P.hornB);
  const ja = jaw*0.62;
  if (jaw > 0.03) {
    const c = Math.cos(ja), s = Math.sin(ja), rx = (x, y) => -22 + (x + 22)*c - (y - 28)*s, ry = (x, y) => 28 + (x + 22)*s + (y - 28)*c;
    ctx.fillStyle = C.mouth; ctx.beginPath(); ctx.moveTo(-24, 30); ctx.lineTo(42, 17); ctx.lineTo(152, 11); ctx.lineTo(184, 18);
    ctx.lineTo(rx(174, 24), ry(174, 24)); ctx.lineTo(rx(150, 13), ry(150, 13)); ctx.lineTo(rx(42, 19), ry(42, 19)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,16,20,.9)'; ctx.lineWidth = 3; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const x = 20 + k*34; ctx.moveTo(x, 17 - k*1.5); ctx.lineTo(rx(x + 6, 19), ry(x + 6, 19)); }
    ctx.stroke();
  }
  ctx.save(); ctx.translate(-22, 28); ctx.rotate(ja); ctx.translate(22, -28);
  ctx.fillStyle = C.jaw; ctx.fill(P.jaw);
  ctx.fillStyle = C.jawLow; ctx.fill(P.jawLow);
  ctx.strokeStyle = C.seam; ctx.lineWidth = 2; ctx.stroke(P.jawSeam);
  ctx.fillStyle = C.tooth; ctx.fill(P.teethL);
  if (flashH > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flashH*0.4).toFixed(3) + ')'; ctx.fill(P.jaw); }
  ctx.restore();
  ctx.fillStyle = C.skull; ctx.fill(P.skull);
  ctx.fillStyle = C.crown; ctx.fill(P.crown);
  ctx.fillStyle = C.snout; ctx.fill(P.snout);
  ctx.fillStyle = C.cheek; ctx.fill(P.cheek);
  ctx.strokeStyle = '#030507'; ctx.lineWidth = 3 + gillO*4; ctx.stroke(P.gills);
  drawEyes(ctx);
  ctx.fillStyle = C.brow; ctx.fill(P.brow);
  ctx.fillStyle = hg; ctx.fill(P.hornA);
  ctx.strokeStyle = 'rgba(28,22,18,.6)'; ctx.lineWidth = 1.6; ctx.stroke(P.hornRings);
  ctx.fillStyle = C.tooth; ctx.fill(P.teethU);
  ctx.strokeStyle = C.seam; ctx.lineWidth = 2; ctx.stroke(P.seams);
  ctx.strokeStyle = C.hl; ctx.lineWidth = 2; ctx.stroke(P.hl);
  if (flashH > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flashH*0.4).toFixed(3) + ')'; ctx.fill(P.skull); }
  ctx.restore();
}
function drawFog(ctx){
  if (murk <= 0.01) return;
  const S = DG.S, sy = -S.cam.y, top = Math.max(-20, sy);
  if (top >= S.H + 20) return;
  const g = ctx.createLinearGradient(0, sy, 0, sy + 1500);
  g.addColorStop(0, 'rgba(4,18,30,' + (0.36*murk).toFixed(3) + ')');
  g.addColorStop(0.3, 'rgba(3,12,24,' + (0.58*murk).toFixed(3) + ')');
  g.addColorStop(0.65, 'rgba(2,7,16,' + (0.76*murk).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(1,3,9,' + (0.9*murk).toFixed(3) + ')');
  ctx.fillStyle = g; ctx.fillRect(-30, top, S.W + 60, S.H - top + 40);
}
function drawParticles(ctx, ox, oy){
  const S = DG.S, W = S.W, Hh = S.H;
  const drops = new Path2D(), bubs = new Path2D();
  let nd = 0, nb = 0;
  for (const p of PT) {
    const x = p.x + ox, y = p.y + oy;
    if (x < -80 || x > W + 80 || y < -80 || y > Hh + 80) continue;
    switch (p.k) {
      case K_DROP: drops.moveTo(x + p.r, y); drops.arc(x, y, p.r, 0, TAU); nd++; break;
      case K_BUB: bubs.moveTo(x + p.r, y); bubs.arc(x, y, p.r, 0, TAU); nb++; break;
      case K_INK: { ctx.globalAlpha = Math.min(1, p.life/p.max*1.6)*(p.big ? 0.92 : 0.8); const r = p.r*1.45; ctx.drawImage(soft('8,3,15'), x - r, y - r, r*2, r*2); ctx.globalAlpha = 1; break; }
      case K_ICH: { ctx.globalAlpha = Math.min(1, p.life/p.max*1.5)*0.85; const r = p.r*1.45; ctx.drawImage(soft('12,34,58'), x - r, y - r, r*2, r*2); ctx.globalAlpha = 1; break; }
      case K_DEB: ctx.save(); ctx.translate(x, y); ctx.rotate(p.a); ctx.fillStyle = p.g > 0.5 ? '#6b4a2e' : '#8a6a44'; ctx.fillRect(-p.r*1.6, -p.r*0.4, p.r*3.2, p.r*0.8); ctx.restore(); break;
      case K_RING: { const a = Math.max(0, p.life/p.max); ctx.strokeStyle = 'rgba(235,248,255,' + (a*0.7).toFixed(3) + ')'; ctx.lineWidth = 2.5*a + 0.5; ctx.beginPath(); ctx.ellipse(x, y, p.r, p.r*0.12, 0, 0, TAU); ctx.stroke(); break; }
    }
  }
  if (nd) { ctx.fillStyle = 'rgba(235,248,255,.85)'; ctx.fill(drops); }
  if (nb) { ctx.strokeStyle = 'rgba(205,238,255,.55)'; ctx.lineWidth = 1.2; ctx.stroke(bubs); }
  for (const c of DTN) {
    const n = c.pts.length/2; if (n < 2) continue;
    for (let k = 0; k < n; k++) { TXS[k] = c.pts[k*2]; TYS[k] = c.pts[k*2 + 1]; }
    ctx.globalAlpha = Math.max(0, c.life/c.max);
    ctx.fillStyle = C.tent; ctx.fill(tentShape(TXS, TYS, n, c.w, ox, oy, n));
    ctx.globalAlpha = 1;
  }
  for (const g of GL) {
    const x = g.x + ox, y = g.y + oy;
    ctx.fillStyle = '#0a0612'; ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,40,120,.55)'; ctx.beginPath(); ctx.arc(x - 4, y - 4, 6, 0, TAU); ctx.fill();
  }
}

// ---------- dışa açık çizim ----------
function draw(ctx){
  if (!vis) return;
  const S = DG.S, ox = -S.cam.x, oy = -S.cam.y;
  const bodyOn = box.x1 + ox > 0 && box.x0 + ox < S.W && box.y1 + oy > 0 && box.y0 + oy < S.H;
  const headOn = onScr(H.x + ox, H.y + oy, 330);
  ctx.save();
  if (bodyOn) drawBody(ctx, ox, oy);
  for (const t of TN) drawTent(ctx, t, ox, oy);
  if (headOn) drawHead(ctx, ox, oy);
  drawParticles(ctx, ox, oy);
  ctx.restore();
  drawFog(ctx);
}
function drawGlow(ctx){
  const S = DG.S, ox = -S.cam.x, oy = -S.cam.y;
  if (vis) drawSmoke(ctx, ox, oy);
  if (!vis) return;
  const gc = mixc(GC0, GC1, enr), ec = mixc(EC0, EC1, enr);
  const dimK = st === 'dying' ? clamp(1 - dieT/5, 0, 1) : st === 'gone' ? 0 : 1;
  const bodyOn = box.x1 + ox > 0 && box.x0 + ox < S.W && box.y1 + oy > 0 && box.y0 + oy < S.H;
  const headOn = onScr(H.x + ox, H.y + oy, 330);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (bodyOn && dimK > 0) {
    const halo = new Path2D(), core = new Path2D(), lat = new Path2D();
    const hcx = wx(50, 4), hcy = wy(50, 4);
    let pen = false;
    for (let i = 2; i < N - 3; i++) {
      // başın altından geçen boğumların ışıkları başın üstüne taşmasın
      if ((PX[i] - hcx)*(PX[i] - hcx) + (PY[i] - hcy)*(PY[i] - hcy) < 150*150) { pen = false; continue; }
      const k = 0.5 + 0.5*Math.sin(T*3.2 - i*0.5), rl = nodes[i].roll, R = RAD[i];
      const x1 = PX[i] - NX[i]*rl*R*0.62 + ox, y1 = PY[i] - NY[i]*rl*R*0.62 + oy, s = 1.1 + R*0.03*(0.6 + 0.7*k);
      core.moveTo(x1 + s, y1); core.arc(x1, y1, s, 0, TAU);
      halo.moveTo(x1 + s*2.4, y1); halo.arc(x1, y1, s*2.4, 0, TAU);
      if (i%2) { const x2 = PX[i] - NX[i]*rl*R*0.84 + ox, y2 = PY[i] - NY[i]*rl*R*0.84 + oy, s2 = s*0.6; core.moveTo(x2 + s2, y2); core.arc(x2, y2, s2, 0, TAU); }
      const lx = PX[i] - NX[i]*rl*R*0.08 + ox, ly = PY[i] - NY[i]*rl*R*0.08 + oy;
      if (!pen) { lat.moveTo(lx, ly); pen = true; } else lat.lineTo(lx, ly);
    }
    ctx.fillStyle = rgba(gc, 0.12*dimK); ctx.fill(halo);
    ctx.fillStyle = rgba(gc, 0.8*dimK); ctx.fill(core);
    ctx.setLineDash([3, 9]); ctx.lineDashOffset = -T*24; ctx.strokeStyle = rgba(gc, 0.32*dimK); ctx.lineWidth = 1.6; ctx.stroke(lat); ctx.setLineDash([]);
    if (enr > 0.05) {
      // öfke: sırt yelesinin kenarı kor gibi yanar
      const ep = new Path2D();
      for (let i = 1; i <= N - 8; i += 2) { crestPt(i, ox, oy, CQ); if (i === 1) ep.moveTo(CQ[0], CQ[1]); else ep.lineTo(CQ[0], CQ[1]); }
      ctx.strokeStyle = rgba([255, 80, 40], (0.35 + 0.2*Math.sin(T*6))*enr*dimK); ctx.lineWidth = 3; ctx.stroke(ep);
    }
  }
  // ölüm: kırılan boğumlardan Atlantis ışığı sızar
  if (st === 'dying' || st === 'gone') {
    const fade = st === 'gone' ? 0 : clamp(1.4 - Math.max(0, dieT - 5)/6, 0, 1);
    for (let i = 0; i < N; i++) {
      if (!nodes[i].lit || fade <= 0) continue;
      const x = PX[i] + ox, y = PY[i] + oy; if (!onScr(x, y, 200)) continue;
      // boğum dikişinden sızan ışık: dar bir yarık ve iki yana uzanan ışınlar
      const fl = 0.75 + 0.25*Math.sin(T*9 + i*1.7), R = RAD[i];
      glow(ctx, [255, 186, 96], x, y, R*1.5 + 26, 0.42*fade*fl);
      ctx.strokeStyle = rgba([255, 236, 190], 0.85*fade*fl); ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x + NX[i]*R*0.9, y + NY[i]*R*0.9); ctx.lineTo(x - NX[i]*R*0.9, y - NY[i]*R*0.9); ctx.stroke();
      ctx.strokeStyle = rgba([255, 222, 160], 0.4*fade*fl); ctx.lineWidth = 1.5; ctx.beginPath();
      for (const s of [-1, 1]) for (const o of [-0.25, 0.25]) { const L = R + 40 + Math.sin(T*13 + i*2 + o*9)*22, bx = NY[i]*o*R, by = -NX[i]*o*R; ctx.moveTo(x + bx + NX[i]*s*R*0.8, y + by + NY[i]*s*R*0.8); ctx.lineTo(x + bx*2.2 + NX[i]*s*L, y + by*2.2 + NY[i]*s*L); }
      ctx.stroke();
    }
  }
  if (headOn && dimK > 0) {
    ctx.save(); ctx.translate(H.x + ox, H.y + oy); ctx.rotate(H.a); ctx.scale(1, H.rd);
    const eo = eyeO*dimK, hitBoost = P_EYE.fl > 0 ? P_EYE.fl : 0;
    for (const e of EYES) {
      glow(ctx, ec, e.x, e.y, e.r*(2.6 + 3.2*eo + hitBoost*2), 0.34 + 0.6*eo + 0.3*hitBoost);
    }
    if (gillO > 0.05) {
      const go = gillO*dimK;
      glow(ctx, gc, -49, 13, 80, 0.45*go);
      ctx.strokeStyle = rgba(gc, 0.85*go); ctx.lineWidth = 1.5 + go*2.5; ctx.lineCap = 'round'; ctx.stroke(paths().gills);
    }
    if (jaw > 0.1) {
      const spit = st === 'spit' ? clamp(stT/0.85, 0, 1) : 0;
      const col = spit > 0 ? [170, 80, 255] : [255, 92, 40];
      glow(ctx, col, 70, 26, 80 + 46*jaw + spit*36, (0.55 + 0.4*spit)*jaw*dimK);
    }
    ctx.restore();
  }
  for (const t of LONG) {
    if (t.st !== 'wind' && t.st !== 'grab') continue;
    const q = t.nodes[t.nodes.length - 1], x = q.x + ox, y = q.y + oy; if (!onScr(x, y, 80)) continue;
    glow(ctx, [255, 64, 36], x, y, 54, 0.7 + 0.3*Math.sin(T*24));
  }
  // toslama uyarısı: teknenin altında kırmızı halka
  const ramWarn = st === 'windup' || (st === 'ram' && stT < 0.6) || st === 'dive';
  if (ramWarn && on) {
    const bx = BX() + ox, by = oy + 4, k = st === 'dive' ? 0.4 : 1, pulse = 0.5 + 0.5*Math.sin(T*14);
    ctx.strokeStyle = 'rgba(255,60,40,' + ((0.35 + 0.4*pulse)*k).toFixed(3) + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(bx, by, hull() + 30 + pulse*16, 20 + pulse*6, 0, 0, TAU); ctx.stroke();
    glow(ctx, [255, 48, 30], bx, by + 30, 240, 0.32*k*(0.6 + 0.4*pulse));
  }
  for (const r of RINGS) {
    const a = r.life/r.max, x = r.x + ox, y = r.y + oy;
    ctx.strokeStyle = rgba(enr > 0.5 ? [255, 120, 80] : [180, 230, 255], a*0.5); ctx.lineWidth = 6*a + 1;
    ctx.beginPath(); ctx.arc(x, y, r.r, 0, TAU); ctx.stroke();
  }
  const em = new Path2D(); let ne = 0;
  for (const p of PT) {
    if (p.k !== K_EMB) continue;
    const x = p.x + ox, y = p.y + oy; if (!onScr(x, y, 20)) continue;
    const r = p.r*(p.life/p.max); em.moveTo(x + r, y); em.arc(x, y, r, 0, TAU); ne++;
  }
  if (ne) { ctx.fillStyle = 'rgba(255,200,120,.85)'; ctx.fill(em); }
  ctx.restore();
  if (on) drawUI(ctx, ox, oy);
}
function drawSmoke(ctx, ox, oy){
  ctx.save();
  for (const p of PT) {
    if (p.k !== K_SMOKE) continue;
    const x = p.x + ox, y = p.y + oy; if (!onScr(x, y, 60)) continue;
    ctx.globalAlpha = Math.min(1, p.life/p.max*1.4)*(0.35 + 0.4*p.g);
    const r = p.r*1.5; ctx.drawImage(soft('30,28,31'), x - r, y - r, r*2, r*2);
  }
  ctx.restore();
}
function drawUI(ctx, ox, oy){
  const S = DG.S, W = S.W, Hh = S.H;
  const hx = wx(60, -10) + ox, hy = wy(60, -10) + oy;
  ctx.save();
  if (st === 'windup' || st === 'ram') {
    // gemiye uzanan kesik çizgi ve durdurma göstergesi
    ctx.setLineDash([14, 10]); ctx.lineDashOffset = -T*80;
    ctx.strokeStyle = 'rgba(255,80,60,' + (0.45 + 0.3*Math.sin(T*12)).toFixed(3) + ')'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(wx(190, 0) + ox, wy(190, 0) + oy); ctx.lineTo(BX() + ox, oy + 10); ctx.stroke();
    ctx.setLineDash([]);
    if (onScr(hx, hy, 0)) {
      const k = clamp(stagAcc/stagNeed, 0, 1), R = 116;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(60,8,8,.55)'; ctx.beginPath(); ctx.arc(hx, hy, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#f4cf7a'; ctx.beginPath(); ctx.arc(hx, hy, R, -Math.PI/2, -Math.PI/2 + TAU*k); ctx.stroke();
      ctx.font = '700 12px "Chakra Petch", monospace'; ctx.textAlign = 'center';
      const tx = clamp(hx, 52, W - 52), ty = clamp(hy + R + 20, 170, Hh - 130);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText('GÖZLERİ VUR', tx + 1, ty + 1);
      ctx.fillStyle = '#ffd27a'; ctx.fillText('GÖZLERİ VUR', tx, ty);
    }
  }
  // ekran dışı gösterge
  const sx = H.x + ox, sy = H.y + oy, m = 26, top = 160, bot = Hh - 120;
  if (sx < -70 || sx > W + 70 || sy < top - 90 || sy > bot + 110) {
    const cx = W/2, cy = (top + bot)/2, a = Math.atan2(sy - cy, sx - cx);
    const kx = Math.abs(Math.cos(a)) > 1e-3 ? (W/2 - m)/Math.abs(Math.cos(a)) : 1e9, ky = Math.abs(Math.sin(a)) > 1e-3 ? ((bot - top)/2)/Math.abs(Math.sin(a)) : 1e9;
    const k = Math.min(kx, ky), px = cx + Math.cos(a)*k, py = cy + Math.sin(a)*k;
    const hot = st === 'windup' || st === 'ram' || st === 'dive', pulse = hot ? 0.6 + 0.4*Math.sin(T*14) : 0.85;
    ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = 'rgba(255,90,70,' + pulse.toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-3, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.rotate(-a);
    ctx.font = '700 10px "Chakra Petch", monospace'; ctx.textAlign = 'center';
    const lbl = hot ? 'HÜCUM!' : 'CANAVAR', ly = Math.sin(a) > 0.5 ? -16 : 22;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(lbl, 1 - Math.cos(a)*18, ly + 1);
    ctx.fillStyle = '#ff8a7a'; ctx.fillText(lbl, -Math.cos(a)*18, ly);
  }
  ctx.restore();
}

// Gemi: core gemiyi çizmeden hemen önce çağırır (ctx gemi merkezine taşınmış).
function boatTint(ctx){
  if (!(on || lost || BT.sink > 0 || BT.cracks.length)) return;
  const S = DG.S, bob = Math.sin(S.t*1.4)*2;
  // batarken su çizgisinin altını kırp
  if (BT.sink > 0.01) { ctx.beginPath(); ctx.rect(-1000, -1000, 2000, 1000 - bob + 10); ctx.clip(); }
  // tekneyi saran dokunaç gövdenin önünde görünsün: oradaki tekne piksellerini çizme
  if (siegeTent && siegeTent.st === 'boat' && siegeTent.wrap > 0.3) {
    const t = siegeTent, ns = t.nodes, n = ns.length, k0 = n - WRAP.length - 1;
    let m = 0;
    for (let k = k0; k < n; k++) { TXS[m] = ns[k].x - BX(); TYS[m] = ns[k].y - bob; m++; }
    const tp = tentShape(TXS, TYS, m, t.w, 0, 0, n, k0, 2.5);
    const cp = new Path2D(); cp.rect(-1000, -1000, 2000, 2000); cp.addPath(tp);
    ctx.clip(cp, 'evenodd');
  }
  ctx.translate(0, BT.heave + BT.sink*70); ctx.rotate(BT.rock + boatTilt());
  if (BT.cracks.length) {
    const dmgK = 1 - boatHp/BOAT_MAX;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < BT.cracks.length; i++) {
      const c = BT.cracks[i], fl = 0.6 + 0.4*Math.sin(T*11 + c.f);
      if (dmgK > 0.35 && i < 4) {
        // güverte yangını (kamaraların arkasında)
        ctx.fillStyle = 'rgba(255,110,30,' + (0.55*fl).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(c.x - 10, -16); ctx.quadraticCurveTo(c.x - 6, -30, c.x + Math.sin(T*9 + c.f)*5, -40 - fl*12); ctx.quadraticCurveTo(c.x + 6, -30, c.x + 10, -16); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,120,' + (0.6*fl).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(c.x - 5, -16); ctx.quadraticCurveTo(c.x - 2, -24, c.x + Math.sin(T*13 + c.f)*3, -28 - fl*6); ctx.quadraticCurveTo(c.x + 3, -24, c.x + 5, -16); ctx.fill();
      }
      glow(ctx, [255, 120, 40], c.x, c.y, 24, 0.7*fl*Math.min(1, dmgK*2));
    }
    ctx.restore();
    // çatlak içleri; sonra çatlakları teknenin çiziminden çıkar
    const hp2 = new Path2D(); hp2.rect(-1000, -1000, 2000, 2000);
    ctx.fillStyle = '#0c0705';
    for (const c of BT.cracks) {
      const q = new Path2D(); q.moveTo(c.pts[0], c.pts[1]); for (let i = 2; i < c.pts.length; i += 2) q.lineTo(c.pts[i], c.pts[i + 1]); q.closePath();
      ctx.fill(q); hp2.addPath(q);
    }
    ctx.clip(hp2, 'evenodd');
  }
}

function lights(){
  LT.length = 0;
  if (!vis) return LT;
  LT.push({x:wx(34, -39), y:wy(34, -39), r:120 + 140*eyeO, k:0.6});
  if (gillO > 0.3) LT.push({x:wx(-49, 13), y:wy(-49, 13), r:110, k:0.5*gillO});
  if (st === 'dying') for (let i = 0; i < N; i += 2) if (nodes[i].lit) LT.push({x:PX[i], y:PY[i], r:180, k:0.7});
  return LT;
}

DG.boss = {
  start, update, draw, drawGlow, lights, reset, boatTint,
  active(){ return on; },
  targets(){ return on && fightable() ? TG.slice() : EMPTY; },
  info(){ return {st, phase, hp:Math.round(hp), maxHp:MAX_HP, boat:Math.round(boatHp*10)/10, t:Math.round(fightT*10)/10, vis, away, on, x:Math.round(H.x), y:Math.round(H.y), a:+H.a.toFixed(2), grab:!!grabTent, siege:siegeOn, side:siegeSide, stag:+(stagAcc/stagNeed).toFixed(2), dk:JSON.stringify(DK, (k, v) => typeof v === 'number' ? Math.round(v) : v), eyeO:+eyeO.toFixed(2), tents:TN.map(t => t.st).join(',')}; },
};
})();
