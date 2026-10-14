/* Dalgıç: silahlar ve yetenekler (DG.wpn).
   Silahlar: zıpkın, patlayıcı mızrak, ağ atar, seri tüfek, sonik top, güdümlü torpido, Poseidon'un üç dişlisi.
   Yetenekler: hız patlaması, kaldırma balonu, elektrik kalkanı, işaret fişeği, sonar, kamuflaj.
   Otomatik nişan: menzildeki en yakın görünür hedef; yoksa dalgıcın baktığı yön (iki parmak modunda sağ başparmak). */
(function () {
'use strict';
const DG = window.DG;
const TAU = Math.PI*2;
const rnd = (a, b) => a + Math.random()*(b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { let d = (a - b)%TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const easeOut = k => 1 - (1 - k)*(1 - k);
const easeBack = k => 1 + 2.7*Math.pow(k - 1, 3) + 1.7*Math.pow(k - 1, 2);
const sfx = k => { if (DG.core && DG.core.sfx) DG.core.sfx(k); };
const buzz = ms => { if (DG.core && DG.core.buzz) DG.core.buzz(ms); };

const WPN = {}, SKL = {};
for (const w of DG.data.WEAPONS) WPN[w.id] = w;
for (const s of DG.data.SKILLS) SKL[s.id] = s;

// Görünüm: namlu boyu (yerel px), görsel geri tepme, dalgıca itme (px/s), kıvılcım rengi.
const LOOK = {
  spear:   {len:31, kick:6,   push:45,  col:'215,235,255'},
  bang:    {len:38, kick:0,   push:0,   col:'255,196,120'},
  net:     {len:24, kick:5,   push:60,  col:'236,220,170'},
  aps:     {len:27, kick:2.4, push:12,  col:'255,214,150'},
  sonic:   {len:21, kick:7,   push:110, col:'170,235,255'},
  torpedo: {len:22, kick:8,   push:75,  col:'255,170,80'},
  trident: {len:38, kick:0,   push:0,   col:'150,240,255'},
};
const SHORT = {spear:'ZIPKIN', bang:'MIZRAK', net:'AĞ', aps:'TÜFEK', sonic:'SONİK', torpedo:'TORPİDO', trident:'ÜÇ DİŞLİ'};
const NUM_COL = {dart:'#e6f4f7', bang:'#ffb03a', net:'#f4cf7a', sonic:'#bff4ff', torpedo:'#ffb03a', beam:'#9ff6ff', shock:'#bff4ff'};

// ---------- durum ----------
const cds = {}, cdMax = {}, skCd = {}, skMax = {};
let swapT = 0, kickV = 0, jabT = 0, jabLen = 0, time = 0;
let aimAng = 0, aimTgt = null, aimLock = 0, hitSndT = 0, shotN = 0, camoHint = false;
const darts = [], nets = [], torps = [], rings = [], blasts = [], sparks = [], puffs = [], stuck = [], bolts = [], ghosts = [], flashes = [];
const flares = [];
const beam = {on:false, k:0, a:0, x0:0, y0:0, x1:0, y1:0, tick:0, zap:0, hits:[]};
let dashT = 0, dashDur = 0.35, ghostT = 0, shockT = 0, shockDur = 1.6, shockTick = 0, sonarT = 0, camoT = 0, camoDur = 4.5;
const near = []; let bossT = [];
const nudge = {x:0, y:0};
const shove = (x, y) => { nudge.x += x; nudge.y += y; };
const dmgAcc = new Map();
const lightsOut = [];

// ---------- yardımcılar ----------
function cur(){
  const save = DG.S.save;
  const w = WPN[save.curWpn];
  return w && save.wpn[w.id] != null ? w : WPN.spear;
}
const wd = () => (DG.core && DG.core.wdmg ? DG.core.wdmg() : 1) || 1;
function bulk(){ const i = DG.S.save.tier; return i <= 1 ? 1 : i <= 3 ? 1.05 : i <= 6 ? 1.1 : i <= 8 ? 1.25 : 1.45; }
const wsc = () => 0.82*bulk();
// Dalgıcın eli (çekirdekteki dalgıç çiziminin kol ucu), dünya koordinatı.
function handPos(){
  const d = DG.S.diver, b = bulk(), c = Math.cos(d.ang), s = Math.sin(d.ang), lx = 16, ly = 6;
  return [d.x + d.flip*b*(c*lx - s*ly), d.y + b*(s*lx + c*ly)];
}
function monR(m){
  if (DG.mon && DG.mon.radius) return DG.mon.radius(m);
  const md = DG.data.MON[m.t]; return (md ? md.r : 16)*(m.size || 1);
}
const isBoss = o => bossT.indexOf(o) >= 0;
const tR = o => (isBoss(o) || !DG.data.MON[o.t]) ? (o.r || 30) : monR(o);
function bossOn(){ return !!(DG.boss && DG.boss.active && DG.boss.active()); }
// Katı mı: duvar, kat rafı ya da yüzeyin üstü (final dövüşünde yüzey serbest).
function solid(x, y){
  const U = DG.U;
  if (y < -2) return bossOn() ? y < -420 : true;
  if (y > DG.S.worldH - 8) return true;
  if (U.inLedge(x, y)) return true;
  const b = U.boundsAt(y);
  return x < b[0] - 12 || x > b[1] + 12;
}
function clearLine(x0, y0, x1, y1){
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L/34);
  for (let i = 1; i < n; i++) { const k = i/n; if (solid(x0 + (x1 - x0)*k, y0 + (y1 - y0)*k)) return false; }
  return true;
}
function forT(fn){
  for (let i = 0; i < near.length; i++) { const m = near[i]; if (!m.dead) fn(m, false, monR(m)); }
  for (let i = 0; i < bossT.length; i++) fn(bossT[i], true, bossT[i].r || 30);
}
function findHit(x, y, pad, ignore){
  for (let i = 0; i < near.length; i++) {
    const m = near[i]; if (m.dead || (ignore && ignore.indexOf(m) >= 0)) continue;
    const r = monR(m) + pad, dx = m.x - x, dy = m.y - y;
    if (dx*dx + dy*dy < r*r) return m;
  }
  for (let i = 0; i < bossT.length; i++) {
    const b = bossT[i]; if (ignore && ignore.indexOf(b) >= 0) continue;
    const r = (b.r || 30) + pad, dx = b.x - x, dy = b.y - y;
    if (dx*dx + dy*dy < r*r) return b;
  }
  return null;
}
// Kılık değiştirmiş taklitçiler otomatik nişana girmez (sonar açıkken girer).
function disguised(m, dist){
  if (sonarT > 0) return false;
  if (m.disguised === true || m.hidden === true) return true;
  if (m.disguised === false) return false;
  const md = DG.data.MON[m.t];
  return !!(md && md.mimic && dist > (md.aggro || 100) + 20);
}
function nearFlare(x, y){
  for (const f of flares) { const dx = f.x - x, dy = f.y - y; if (dx*dx + dy*dy < 320*320) return true; }
  return false;
}
function hit(o, amt, opts, numKind){
  if (!o || !(amt >= 0)) return;
  const boss = isBoss(o);
  if (boss) { if (o.hit) o.hit(amt, opts && opts.stun > 1.2 ? Object.assign({}, opts, {stun:1.2}) : opts); }
  else if (DG.mon && DG.mon.damage) DG.mon.damage(o, amt, opts);
  if (amt > 0) {
    let e = dmgAcc.get(o);
    if (!e) { e = {a:0, t:0, x:o.x, y:o.y, r:boss ? (o.r || 30) : monR(o), c:NUM_COL[numKind] || '#e6f4f7'}; dmgAcc.set(o, e); }
    e.a += amt; e.x = o.x; e.y = o.y;
  }
  if (hitSndT <= 0) { sfx('hit'); hitSndT = 0.07; }
}
function flushNums(dt){
  if (!DG.fx || !DG.fx.dmgText) { dmgAcc.clear(); return; }
  for (const [o, e] of dmgAcc) {
    e.t += dt;
    if (e.t >= 0.18) { DG.fx.dmgText(e.x + rnd(-6, 6), e.y - e.r - 8, String(Math.max(1, Math.round(e.a*10))), e.c); dmgAcc.delete(o); }
  }
}
function breakCamo(){
  if (camoT <= 0) return;
  camoT = 0;
  const d = DG.S.diver;
  rings.push({x:d.x, y:d.y, r0:10, r1:70, t:0, dur:0.35, c:'150,255,220', w:2});
  if (DG.core && DG.core.msg) DG.core.msg('Ateş ettin: kamuflaj bozuldu!', 'var(--amber)');
}

// ---------- parçacıklar ----------
function puff(x, y, n, spd, r0, r1, vx0, vy0){
  for (let i = 0; i < n && puffs.length < 240; i++) {
    const a = rnd(0, TAU), v = rnd(0.2, 1)*spd;
    puffs.push({x:x + rnd(-2, 2), y:y + rnd(-2, 2), vx:(vx0 || 0) + Math.cos(a)*v, vy:(vy0 || 0) + Math.sin(a)*v, r:rnd(r0, r1), life:rnd(0.5, 1.2), max:1.2, ph:rnd(0, TAU)});
  }
}
function spark(x, y, n, spd, col, g){
  for (let i = 0; i < n && sparks.length < 180; i++) {
    const a = rnd(0, TAU), v = rnd(0.3, 1)*spd, l = rnd(0.18, 0.42);
    sparks.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:l, max:l, c:col, g:g || 0});
  }
}
function sparkDir(x, y, n, spd, a0, spread, col){
  for (let i = 0; i < n && sparks.length < 180; i++) {
    const a = a0 + rnd(-spread, spread), v = rnd(0.4, 1)*spd, l = rnd(0.14, 0.32);
    sparks.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:l, max:l, c:col, g:0});
  }
}
function muzzle(x, y, a, s, col){ if (flashes.length < 8) flashes.push({x, y, a, t:0, dur:0.07 + 0.04*s, s, c:col}); }
function compact(arr, keep){ let j = 0; for (let i = 0; i < arr.length; i++) { const p = arr[i]; if (keep(p)) arr[j++] = p; } arr.length = j; }

// ---------- nişan ----------
const cand = [];
function visRange(){
  const S = DG.S;
  if (bossOn() || S.darkAlpha < 0.55) return 1e9;
  return Math.max((DG.core.gLight ? DG.core.gLight() : 150)*1.35, 230);
}
function pickTarget(hx, hy, range, dirA, cone){
  const vis = visRange();
  cand.length = 0;
  forT((o, boss, r) => {
    const dx = o.x - hx, dy = o.y - hy;
    if (dx > range + 80 || dx < -range - 80 || dy > range + 80 || dy < -range - 80) return;
    const dd = Math.hypot(dx, dy); if (dd - r > range) return;
    if (!boss) {
      if (disguised(o, dd)) return;
      if (dd > vis && !nearFlare(o.x, o.y)) return;
    }
    const diff = Math.abs(angDiff(Math.atan2(dy, dx), dirA));
    if (cone && diff > cone + Math.asin(Math.min(1, r/Math.max(dd, r, 1)))) return;
    let sc = Math.max(1, dd - r)*(1 + (cone ? diff*2 : diff*0.28));
    if (o === aimTgt) sc *= 0.82;
    if (boss && o.weak) sc *= 0.7;
    cand.push({o, sc});
  });
  if (!cand.length) return null;
  cand.sort((a, b) => a.sc - b.sc);
  for (let i = 0; i < cand.length && i < 4; i++) { const o = cand[i].o; if (clearLine(hx, hy, o.x, o.y)) return o; }
  return null;
}
function leadAngle(o, hx, hy, speed){
  let tx = o.x, ty = o.y;
  if (speed && !isBoss(o)) {
    const t = Math.min(0.8, Math.hypot(tx - hx, ty - hy)/speed);
    tx += (o.vx || 0)*t*0.85; ty += (o.vy || 0)*t*0.85;
  }
  return Math.atan2(ty - hy, tx - hx);
}
function updateAim(w, dt){
  const S = DG.S, d = S.diver, hp = handPos();
  const face = Math.atan2(Math.sin(d.ang), Math.cos(d.ang)*d.flip);
  const range = w.kind === 'melee' ? 210 : w.range;
  const ia = S.input && S.input.aim;
  let want = face, tgt = null;
  if (ia && (ia.x || ia.y)) { want = Math.atan2(ia.y, ia.x); tgt = pickTarget(hp[0], hp[1], range, want, 0.21); }
  else tgt = pickTarget(hp[0], hp[1], range, face, 0);
  if (tgt) want = leadAngle(tgt, hp[0], hp[1], w.kind === 'dart' || w.kind === 'net' ? w.speed : 0);
  if (tgt !== aimTgt) aimLock = 0;
  aimTgt = tgt;
  aimLock = Math.min(1, aimLock + dt*7);
  if (!(beam.k > 0 && w.kind === 'beam')) aimAng += angDiff(want, aimAng)*Math.min(1, dt*16);
  return want;
}

// ---------- ateş ----------
function fire(w, lv, want){
  const look = LOOK[w.id] || LOOK.spear;
  const dmg = w.dmg*(1 + 0.5*lv)*wd();
  aimAng = want;
  const c = Math.cos(want), s = Math.sin(want), hp = handPos(), L = look.len*wsc();
  const mx = hp[0] + c*L, my = hp[1] + s*L;
  let cd = w.cd, push = look.push;
  switch (w.kind) {
    case 'dart': {
      const heavy = !w.spread, a = want + (w.spread ? rnd(-w.spread, w.spread) : 0), life = w.range/w.speed;
      darts.push({x:mx, y:my, vx:Math.cos(a)*w.speed, vy:Math.sin(a)*w.speed, life, max:life, dmg, heavy, pierce:heavy && lv >= 3 ? 1 : 0, hitList:null, trail:0});
      if (heavy) {
        muzzle(mx, my, want, 1, '210,235,255'); puff(mx, my, 6, 70, 1.2, 2.6, c*70, s*70); sfx('shot');
        rings.push({x:mx, y:my, r0:3, r1:16, t:0, dur:0.16, c:'210,235,255', w:1.2});
      } else {
        muzzle(mx, my, a, 0.65, '255,214,150'); puff(mx, my, 1, 40, 1, 2, c*50, s*50);
        if ((shotN++ & 1) === 0) sfx('shot');
      }
      break;
    }
    case 'melee': { const r = melee(w, lv, dmg, hp); cd = r.cd; push = 0; break; }
    case 'net': {
      const life = w.range/w.speed;
      nets.push({x:mx, y:my, vx:c*w.speed, vy:s*w.speed, life, st:0, t:0, R:0, Rmax:w.radius*(1 + 0.08*lv), hold:(w.stun || 4) + 0.5*lv, dmg, held:[], spin:rnd(0, TAU), wob:rnd(0, TAU)});
      muzzle(mx, my, want, 0.8, '236,220,170'); puff(mx, my, 6, 60, 1.2, 2.4, c*60, s*60); sfx('shot');
      break;
    }
    case 'cone': {
      const R = w.range*(1 + 0.1*lv), half = w.angle || 0.6;
      forT((o, boss, r) => {
        const dx = o.x - mx, dy = o.y - my, dd = Math.hypot(dx, dy);
        if (dd - r > R) return;
        const a = Math.atan2(dy, dx);
        if (dd > r && Math.abs(angDiff(a, want)) > half + Math.asin(Math.min(1, r/Math.max(dd, 1)))) return;
        if (!clearLine(mx, my, o.x, o.y)) return;
        const k = 1 - 0.45*clamp(dd/R, 0, 1);
        hit(o, dmg*k, {stun:(w.stun || 2)*(0.6 + 0.4*k), kx:Math.cos(a)*560*k, ky:Math.sin(a)*560*k, kind:'sonic'}, 'sonic');
        sparkDir(o.x, o.y, 4, 160, a, 0.6, '170,235,255');
      });
      for (let i = 0; i < 3; i++) rings.push({x:mx, y:my, r0:8, r1:R*(1 - i*0.12), t:-i*0.07, dur:0.46, a:want, half, c:'170,235,255', w:3.2 - i*0.8, fill:i === 0});
      for (let i = 0; i < 10; i++) { const a = want + rnd(-half, half), v = rnd(120, 320); if (puffs.length < 240) puffs.push({x:mx, y:my, vx:Math.cos(a)*v, vy:Math.sin(a)*v, r:rnd(1, 2.4), life:rnd(0.4, 0.8), max:0.8, ph:rnd(0, TAU)}); }
      muzzle(mx, my, want, 1.2, '170,235,255');
      sfx('sonic'); buzz(20);
      break;
    }
    case 'homing': {
      const life = w.range/w.speed + 0.6;
      torps.push({x:mx, y:my, a:want, v:w.speed*0.35, vmax:w.speed, life, dmg, R:(w.blast || 120)*(1 + 0.1*lv), tgt:aimTgt, trail:0, wob:rnd(0, TAU)});
      muzzle(mx, my, want, 1, '255,170,80'); puff(mx, my, 10, 90, 1.4, 3, c*80, s*80); sfx('dash');
      break;
    }
  }
  cds[w.id] = cd; cdMax[w.id] = cd;
  if (push) shove(-c*push, -s*push);
  kickV = look.kick;
  breakCamo();
}
function melee(w, lv, dmg, hp){
  const reach = w.range;
  let best = null, bd = 1e9, br = 0;
  forT((o, boss, r) => {
    const dd = Math.hypot(o.x - hp[0], o.y - hp[1]) - r;
    if (dd < reach && dd < bd && (dd < 20 || clearLine(hp[0], hp[1], o.x, o.y))) { best = o; bd = dd; br = r; }
  });
  if (!best) {
    jabT = 0.15; jabLen = reach*0.55;
    const c = Math.cos(aimAng), s = Math.sin(aimAng), L = LOOK.bang.len*wsc() + jabLen;
    puff(hp[0] + c*L, hp[1] + s*L, 4, 50, 1, 2.2, c*40, s*40);
    return {cd:0.42};
  }
  const a = Math.atan2(best.y - hp[1], best.x - hp[0]), c = Math.cos(a), s = Math.sin(a);
  aimAng = a; jabT = 0.15; jabLen = clamp(bd, 0, reach);
  const cx = best.x - c*br*0.7, cy = best.y - s*br*0.7;
  explode(cx, cy, 64 + 10*lv, dmg, {primary:best, splash:0.5, stun:1.4, knock:520, kind:'bang'});
  shove(-c*170, -s*170);
  return {cd:w.cd};
}
// Patlama: birincil hedef tam hasar, çevre düşen hasar.
function explode(x, y, R, dmg, o){
  const d = DG.S.diver;
  forT((t, boss, r) => {
    const dx = t.x - x, dy = t.y - y, dd = Math.hypot(dx, dy), e = Math.max(0, dd - r);
    if (e > R && t !== o.primary) return;
    const k = t === o.primary ? 1 : (o.splash != null ? o.splash : 1)*(1 - 0.5*clamp(e/R, 0, 1));
    const L = dd || 1;
    hit(t, dmg*k, {stun:o.stun*(0.5 + 0.5*k), kx:dx/L*o.knock*k, ky:dy/L*o.knock*k, kind:o.kind}, o.kind);
  });
  blasts.push({x, y, R, t:0, dur:0.5});
  rings.push({x, y, r0:R*0.2, r1:R*1.35, t:0, dur:0.42, c:'255,226,180', w:3});
  rings.push({x, y, r0:R*0.1, r1:R*0.9, t:0.04, dur:0.5, c:'255,170,90', w:1.5});
  spark(x, y, 22, 420, '255,190,110', 120);
  puff(x, y, 18, 160, 1.6, 4.2, 0, -30);
  if (DG.fx) {
    if (DG.fx.explosion) DG.fx.explosion(x, y, R);
    if (DG.fx.shake) DG.fx.shake(Math.min(9, R/16));
  }
  sfx('boom'); buzz(35);
  const dd = Math.hypot(d.x - x, d.y - y);
  if (dd < R*1.4) { const L = dd || 1, k = 1 - dd/(R*1.4); shove((d.x - x)/L*150*k, (d.y - y)/L*150*k); }
}

// ---------- mermiler ----------
function updateDarts(dt){
  for (const p of darts) {
    p.life -= dt;
    const drag = Math.exp(-(p.heavy ? 0.45 : 0.7)*dt);
    p.vx *= drag; p.vy *= drag; if (p.heavy) p.vy += 26*dt;
    const sp = Math.hypot(p.vx, p.vy), steps = Math.max(1, Math.ceil(sp*dt/14));
    for (let k = 0; k < steps && p.life > 0; k++) {
      p.x += p.vx*dt/steps; p.y += p.vy*dt/steps;
      if (solid(p.x, p.y)) {
        const a = Math.atan2(p.vy, p.vx);
        sparkDir(p.x, p.y, p.heavy ? 6 : 2, 180, a + Math.PI, 0.9, p.heavy ? '215,235,255' : '255,214,150');
        if (p.heavy && p.y > 0) stuck.push({x:p.x, y:p.y, a, t:1.8, wob:1});
        if (p.y <= 0) puff(p.x, 2, 3, 40, 1, 2);
        p.life = 0; break;
      }
      const o = findHit(p.x, p.y, p.heavy ? 6 : 4, p.hitList);
      if (o) {
        const a = Math.atan2(p.vy, p.vx);
        hit(o, p.dmg, {stun:p.heavy ? 0.6 : 0.12, kx:p.vx*(p.heavy ? 0.25 : 0.06), ky:p.vy*(p.heavy ? 0.25 : 0.06), kind:'dart'}, 'dart');
        sparkDir(p.x, p.y, p.heavy ? 7 : 3, p.heavy ? 260 : 180, a + Math.PI, 0.8, p.heavy ? '215,235,255' : '255,214,150');
        if (p.heavy) puff(p.x, p.y, 3, 50, 1, 2);
        if (p.pierce > 0) { p.pierce--; (p.hitList || (p.hitList = [])).push(o); p.dmg *= 0.7; }
        else { p.life = 0; break; }
      }
    }
    if (p.life > 0) {
      p.trail -= dt;
      if (p.trail <= 0) { p.trail = p.heavy ? 0.016 : 0.05; if (puffs.length < 240) puffs.push({x:p.x - p.vx*0.01, y:p.y - p.vy*0.01, vx:rnd(-12, 12), vy:rnd(-12, 12), r:rnd(0.8, p.heavy ? 2 : 1.4), life:rnd(0.35, 0.7), max:0.7, ph:rnd(0, TAU)}); }
    }
  }
  compact(darts, p => p.life > 0);
}
function openNet(n){
  n.st = 1; n.t = 0; n.vx *= 0.15; n.vy *= 0.15;
  forT((o, boss, r) => {
    const dd = Math.hypot(o.x - n.x, o.y - n.y);
    if (dd - r*0.5 > n.Rmax) return;
    hit(o, n.dmg, {stun:n.hold, kx:0, ky:0, kind:'net'}, 'net');
    if (!boss) n.held.push(o);
  });
  if (n.held.length) { buzz(15); if (DG.core && DG.core.float && n.held.length >= 3) DG.core.float(n.x, n.y - n.Rmax*0.6, n.held.length + ' av ağda!', '#f4cf7a'); }
  sfx('net');
  puff(n.x, n.y, 10, 120, 1, 2.4);
}
function updateNets(dt){
  for (const n of nets) {
    n.t += dt;
    if (n.st === 0) {
      n.life -= dt; n.spin += dt*9;
      const drag = Math.exp(-1.1*dt); n.vx *= drag; n.vy *= drag;
      const nx = n.x + n.vx*dt, ny = n.y + n.vy*dt;
      if (solid(nx, ny)) { openNet(n); continue; }
      n.x = nx; n.y = ny;
      if (n.life <= 0 || findHit(n.x, n.y, 26)) openNet(n);
    } else {
      n.R = n.Rmax*easeBack(Math.min(1, n.t/0.24));
      n.x += n.vx*dt; n.vx *= Math.exp(-4*dt);
      const ny = n.y + 7*dt + n.vy*dt; n.vy *= Math.exp(-4*dt);
      if (!solid(n.x, ny + n.Rmax*0.3)) n.y = ny;
      if (n.t < n.hold) {
        const lim = n.R*0.72;
        for (const m of n.held) {
          if (m.dead) continue;
          const dx = m.x - n.x, dy = m.y - n.y, L = Math.hypot(dx, dy);
          if (L > lim) { m.x = n.x + dx/L*lim; m.y = n.y + dy/L*lim; }
          m.vx = (m.vx || 0)*0.8; m.vy = (m.vy || 0)*0.8;
        }
      }
    }
  }
  compact(nets, n => n.st === 0 || n.t < n.hold + 0.6);
}
function seek(p){
  let best = null, bs = 1e9;
  forT((o, boss, r) => {
    const dx = o.x - p.x, dy = o.y - p.y, dd = Math.hypot(dx, dy);
    if (dd > 520) return;
    if (!boss && disguised(o, Math.hypot(o.x - DG.S.diver.x, o.y - DG.S.diver.y))) return;
    const diff = Math.abs(angDiff(Math.atan2(dy, dx), p.a)); if (diff > 1.25) return;
    const sc = dd*(1 + diff);
    if (sc < bs) { bs = sc; best = o; }
  });
  return best;
}
function updateTorps(dt){
  for (const p of torps) {
    p.life -= dt; p.wob += dt*7;
    if (!p.tgt || p.tgt.dead || (near.indexOf(p.tgt) < 0 && bossT.indexOf(p.tgt) < 0)) p.tgt = seek(p);
    if (p.tgt) { const want = Math.atan2(p.tgt.y - p.y, p.tgt.x - p.x), turn = 4.2*dt; p.a += clamp(angDiff(want, p.a), -turn, turn); }
    else p.a += Math.sin(p.wob)*0.4*dt;
    p.v += (p.vmax - p.v)*Math.min(1, dt*3.2);
    const steps = Math.max(1, Math.ceil(p.v*dt/14)), c = Math.cos(p.a), s = Math.sin(p.a);
    let boom = p.life <= 0;
    for (let k = 0; k < steps && !boom; k++) {
      p.x += c*p.v*dt/steps; p.y += s*p.v*dt/steps;
      if (solid(p.x, p.y) || findHit(p.x, p.y, 8)) boom = true;
    }
    if (boom) { p.life = -1; explode(p.x - c*6, p.y - s*6, p.R, p.dmg, {primary:null, splash:1, stun:1.5, knock:480, kind:'torpedo'}); continue; }
    p.trail -= dt;
    if (p.trail <= 0) { p.trail = 0.018; if (puffs.length < 240) puffs.push({x:p.x - c*16, y:p.y - s*16, vx:-c*40 + rnd(-15, 15), vy:-s*40 + rnd(-15, 15), r:rnd(1, 2.4), life:rnd(0.5, 1), max:1, ph:rnd(0, TAU)}); }
  }
  compact(torps, p => p.life > 0);
}
function updateBeam(dt, want, w, lv, aimA){
  if (want && !beam.on) { beam.a = aimA; beam.tick = 0; beam.zap = 0; sfx('zap'); }
  beam.on = want;
  beam.k = want ? Math.min(1, beam.k + dt*10) : Math.max(0, beam.k - dt*7);
  if (beam.k <= 0) { beam.hits.length = 0; return; }
  if (want) { beam.a += angDiff(aimA, beam.a)*Math.min(1, dt*9); aimAng = beam.a; breakCamo(); }
  const hp = handPos(), L = LOOK.trident.len*wsc(), c = Math.cos(beam.a), s = Math.sin(beam.a);
  beam.x0 = hp[0] + c*L; beam.y0 = hp[1] + s*L;
  const range = WPN.trident ? WPN.trident.range : 460;
  let len = range;
  for (let t = 14; t <= range; t += 14) if (solid(beam.x0 + c*t, beam.y0 + s*t)) { len = t; break; }
  beam.x1 = beam.x0 + c*len; beam.y1 = beam.y0 + s*len;
  if (!want) return;
  beam.tick -= dt; beam.zap -= dt;
  if (beam.zap <= 0) { beam.zap = 0.3; sfx('zap'); }
  if (beam.tick <= 0) {
    beam.tick += 0.1;
    const dmg = w.dmg*(1 + 0.5*lv)*wd()*0.1;
    beam.hits.length = 0;
    forT((o, boss, r) => {
      const dx = o.x - beam.x0, dy = o.y - beam.y0, t = dx*c + dy*s;
      if (t < -r || t > len + r) return;
      const px = dx - c*t, py = dy - s*t;
      if (px*px + py*py > (r + 7)*(r + 7)) return;
      hit(o, dmg, {stun:0.18, kx:c*60, ky:s*60, kind:'beam'}, 'beam');
      const ht = clamp(t, 0, len);
      beam.hits.push(beam.x0 + c*ht, beam.y0 + s*ht);
      sparkDir(beam.x0 + c*ht, beam.y0 + s*ht, 3, 200, beam.a + Math.PI, 1.2, '150,240,255');
    });
  }
  if (Math.random() < dt*30) sparkDir(beam.x1, beam.y1, 1, 160, beam.a + Math.PI, 1.4, '244,207,122');
}

// ---------- yetenekler ----------
function shockLv(){ const v = DG.S.save.skills.shock; return v == null ? 0 : v; }
function updateSkills(dt){
  const S = DG.S, d = S.diver;
  if (dashT > 0) {
    dashT -= dt; ghostT -= dt;
    if (ghostT <= 0) { ghostT = 0.035; ghosts.push({x:d.x, y:d.y, ang:d.ang, flip:d.flip, b:bulk(), t:0}); }
    if (puffs.length < 240) puffs.push({x:d.x - d.vx*0.03 + rnd(-6, 6), y:d.y - d.vy*0.03 + rnd(-6, 6), vx:-d.vx*0.15, vy:-d.vy*0.15, r:rnd(1, 2.6), life:rnd(0.4, 0.8), max:0.8, ph:rnd(0, TAU)});
  }
  for (const g of ghosts) g.t += dt;
  compact(ghosts, g => g.t < 0.28);
  if (shockT > 0) {
    shockT -= dt; shockTick -= dt;
    if (shockTick <= 0) {
      shockTick = 0.2;
      const s = SKL.shock, lv = shockLv(), R = (s.radius || 120) + 10*lv;
      const tier = S.save.tier || 0, dmg = 1.2*(1 + 0.35*tier)*(1 + 0.5*lv)*wd()*0.2;
      let n = 0;
      forT((o, boss, r) => {
        const dx = o.x - d.x, dy = o.y - d.y, dd = Math.hypot(dx, dy);
        if (dd - r > R) return;
        const L = dd || 1;
        hit(o, dmg*(boss ? 0.6 : 1), {stun:0.35, kx:dx/L*420, ky:dy/L*420, kind:'shock'}, 'shock');
        if (n++ < 6) bolts.push({x0:d.x + dx/L*16, y0:d.y + dy/L*16, x1:o.x, y1:o.y, t:0, dur:0.14});
        spark(o.x, o.y, 3, 160, '190,240,255');
      });
      if (n && Math.random() < 0.5) sfx('zap');
    }
  }
  if (sonarT > 0) sonarT -= dt;
  if (camoT > 0) { camoT -= dt; if (camoT <= 0) rings.push({x:d.x, y:d.y, r0:12, r1:60, t:0, dur:0.3, c:'150,255,220', w:1.6}); }
  // fişekler: yavaşça batar, raflara oturur, duvardan seker
  const U = DG.U;
  for (const f of flares) {
    f.t -= dt; f.ig = Math.min(1, f.ig + dt*2.5);
    f.vx *= Math.exp(-2.2*dt);
    f.vy += (18 - f.vy)*Math.min(1, dt*2.2);
    const nx = f.x + f.vx*dt, ny = f.y + f.vy*dt;
    if (ny > 0 && !U.inLedge(nx, ny + 7)) f.y = ny; else { f.vy = 0; f.vx *= 0.6; }
    f.x = nx;
    const b = f.y > 0 ? U.boundsAt(f.y) : [30, DG.C.WORLD_W - 30];
    if (f.x < b[0]) { f.x = b[0]; f.vx = Math.abs(f.vx)*0.3; }
    if (f.x > b[1]) { f.x = b[1]; f.vx = -Math.abs(f.vx)*0.3; }
    if (f.y > S.worldH - 18) { f.y = S.worldH - 18; f.vy = 0; }
    f.ang += (clamp(f.vx*0.006, -0.9, 0.9) + Math.sin(time*2.6 + f.ph)*0.12 - f.ang)*Math.min(1, dt*5);
    const tx = f.x + Math.sin(f.ang)*7, ty = f.y - Math.cos(f.ang)*7;
    if (f.t > 0.3 && sparks.length < 180 && Math.random() < dt*26) sparks.push({x:tx, y:ty, vx:rnd(-40, 40), vy:rnd(-110, -30), life:rnd(0.2, 0.5), max:0.5, c:'255,170,90', g:60});
    if (Math.random() < dt*5 && puffs.length < 240) puffs.push({x:tx, y:ty, vx:rnd(-8, 8), vy:-20, r:rnd(1.2, 2.8), life:rnd(0.8, 1.4), max:1.4, ph:rnd(0, TAU)});
  }
  compact(flares, f => f.t > 0);
}
function throwFlare(){
  const d = DG.S.diver, c = Math.cos(d.ang)*d.flip, s = Math.sin(d.ang), hp = handPos();
  if (flares.length >= 3) flares.shift();
  const dur = SKL.flare.dur || 12;
  flares.push({x:hp[0], y:hp[1], vx:c*270 + d.vx*0.4, vy:s*170 - 25 + d.vy*0.4, t:dur, max:dur, ig:0, ang:0, ph:rnd(0, TAU)});
  sparkDir(hp[0], hp[1], 8, 160, Math.atan2(s, c), 0.5, '255,170,90');
}

// ---------- çizim yardımcıları ----------
function rr(ctx, x, y, w, h, r){ ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function poly(ctx, pts){ ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); }
function jag(ctx, x0, y0, x1, y1, seg, jit){
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, n = Math.max(2, Math.round(L/seg)), nx = -dy/L, ny = dx/L;
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const k = i/n, j = rnd(-jit, jit); ctx.lineTo(x0 + dx*k + nx*j, y0 + dy*k + ny*j); }
  ctx.lineTo(x1, y1);
}
// Ağ ızgarası: kare ızgara daireye eşlenir, 45 derece döner (balıkçı ağı gözü).
const NG = 9, ngp = new Float32Array(NG*NG*2);
function netPts(sx, sy, R, n){
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    const u = i/(NG - 1)*2 - 1, v = j/(NG - 1)*2 - 1;
    const X = u*Math.sqrt(1 - v*v/2), Y = v*Math.sqrt(1 - u*u/2);
    const rx = (X - Y)*0.7071, ry = (X + Y)*0.7071, r2 = rx*rx + ry*ry;
    const w = 1 + Math.sin(time*2.1 + i*1.3 + j*0.9 + n.wob)*0.035;
    ngp[(j*NG + i)*2] = sx + rx*R*w;
    ngp[(j*NG + i)*2 + 1] = sy + ry*R*w + (1 - r2)*R*0.07;
  }
}
// Izgaranın kenarında saat yönünde k. nokta.
function edgeIdx(k, G){
  const e = G - 1;
  if (k < e) return k;
  if (k < 2*e) return (k - e)*G + e;
  if (k < 3*e) return e*G + (e - (k - 2*e));
  return (e - (k - 3*e))*G;
}
const onScr = (sx, sy, m) => sx > -m && sy > -m && sx < DG.S.W + m && sy < DG.S.H + m;

// Elde tutulan silah (yerel: kabza 0,0; namlu +x yönünde).
function drawWeaponShape(ctx, id, ready, p){
  switch (id) {
    case 'spear': {
      ctx.fillStyle = '#1d242c'; poly(ctx, [-4, 1, 1, 1, -1, 7, -5, 7]);
      ctx.fillStyle = '#6b4a2e'; rr(ctx, -11, -2.6, 17, 5.2, 2.2); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,220,.16)'; ctx.fillRect(-10, -2.2, 15, 1);
      ctx.fillStyle = '#4a5662'; ctx.fillRect(5, -1.4, 16, 2.8);
      ctx.fillStyle = '#d9a441'; ctx.fillRect(19, -2.7, 3, 5.4);
      const tip = 6 + 26*p;
      if (p > 0.04) {
        const ga = ctx.globalAlpha; ctx.globalAlpha = ga*Math.min(1, p*2);
        ctx.strokeStyle = '#c9d3da'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(tip - 30, 0); ctx.lineTo(tip, 0); ctx.stroke();
        ctx.fillStyle = '#f4cf7a'; poly(ctx, [tip + 4.5, 0, tip - 1, -2.2, tip - 1, 2.2]);
        ctx.globalAlpha = ga;
      }
      ctx.strokeStyle = '#a8322a'; ctx.lineWidth = 0.9; ctx.beginPath();
      if (ready) { ctx.moveTo(20.5, -2.7); ctx.lineTo(tip - 26, -0.7); ctx.moveTo(20.5, 2.7); ctx.lineTo(tip - 26, 0.7); }
      else { ctx.moveTo(20.5, -2.7); ctx.lineTo(17, -5.5); ctx.moveTo(20.5, 2.7); ctx.lineTo(17, 5.5); }
      ctx.stroke();
      break;
    }
    case 'aps': {
      ctx.fillStyle = '#1d242c'; poly(ctx, [-3, 2, 1, 2, 0, 8, -4, 8]); poly(ctx, [3, 2.5, 8, 2.5, 9.5, 10, 4.5, 10]);
      ctx.fillStyle = '#2b3440'; ctx.fillRect(-13, -2, 5, 4); rr(ctx, -8, -3, 20, 6, 2); ctx.fill();
      ctx.fillStyle = '#4a5662'; ctx.fillRect(-6, -3.9, 16, 1.1);
      ctx.fillStyle = '#8a969f'; ctx.fillRect(12, -1, 12, 2);
      ctx.fillStyle = '#d9a441'; ctx.fillRect(23, -1.9, 3.4, 3.8);
      break;
    }
    case 'bang': {
      ctx.fillStyle = '#6b4a2e'; ctx.fillRect(-12, -1.2, 40, 2.4);
      ctx.fillStyle = '#1d242c'; ctx.fillRect(-12, -1.7, 9, 3.4);
      ctx.fillStyle = '#3a4652'; rr(ctx, 27, -3.4, 10, 6.8, 1.6); ctx.fill();
      ctx.fillStyle = '#d9a441'; ctx.fillRect(29, -3.6, 1.6, 7.2);
      ctx.fillStyle = ready ? '#d8452f' : '#5a2a26'; ctx.beginPath(); ctx.arc(37.4, 0, 2, 0, TAU); ctx.fill();
      break;
    }
    case 'net': {
      ctx.fillStyle = '#1d242c'; poly(ctx, [-3, 3, 1, 3, 0, 9, -4, 9]);
      ctx.fillStyle = '#4a5662'; rr(ctx, -8, -4, 24, 8, 3); ctx.fill();
      ctx.fillStyle = '#d9a441'; ctx.fillRect(-2, -4.2, 1.6, 8.4); ctx.fillRect(8, -4.2, 1.6, 8.4);
      ctx.fillStyle = '#5d6a76'; poly(ctx, [16, -4, 24, -6.5, 24, 6.5, 16, 4]);
      if (ready) {
        ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(22, 0, 3.4, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#8a7a55'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(19.5, -2); ctx.lineTo(24.5, 2); ctx.moveTo(19.5, 2); ctx.lineTo(24.5, -2); ctx.stroke();
        ctx.fillStyle = '#8a969f'; ctx.beginPath(); ctx.arc(24, -6, 1.3, 0, TAU); ctx.arc(24, 6, 1.3, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'sonic': {
      ctx.fillStyle = '#1d242c'; poly(ctx, [-3, 3, 1, 3, 0, 9, -4, 9]);
      ctx.fillStyle = '#2f3a46'; rr(ctx, -9, -3.6, 18, 7.2, 2.4); ctx.fill();
      ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 0.8; ctx.beginPath();
      for (const x of [-4, -1, 2, 5]) { ctx.moveTo(x, -3.6); ctx.lineTo(x, 3.6); }
      ctx.stroke();
      ctx.fillStyle = '#7f97a5'; poly(ctx, [8, -3, 20, -9.5, 20, 9.5, 8, 3]);
      ctx.fillStyle = '#16202a'; ctx.beginPath(); ctx.ellipse(20, 0, 1.8, 9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(230,244,247,.35)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(12, 5); ctx.moveTo(16, -7.2); ctx.lineTo(16, 7.2); ctx.stroke();
      break;
    }
    case 'torpedo': {
      ctx.fillStyle = '#1d242c'; poly(ctx, [-2, 3.5, 2, 3.5, 1, 9.5, -3, 9.5]);
      ctx.fillStyle = '#2b3440'; rr(ctx, -11, -4, 31, 8, 4); ctx.fill();
      ctx.fillStyle = '#d9a441'; ctx.fillRect(-5, -4.2, 1.8, 8.4); ctx.fillRect(10, -4.2, 1.8, 8.4);
      ctx.fillStyle = '#4a5662'; ctx.fillRect(0, -6, 5, 2);
      if (ready) { ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(19.5, 0, 3.4, -Math.PI/2, Math.PI/2); ctx.fill(); }
      break;
    }
    case 'trident': {
      ctx.fillStyle = '#8a5f1c'; ctx.beginPath(); ctx.arc(-14, 0, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d9a441'; ctx.fillRect(-14, -1.2, 42, 2.4);
      ctx.fillStyle = '#f4cf7a'; ctx.fillRect(-14, -1.2, 42, 0.8);
      ctx.fillStyle = '#d9a441'; rr(ctx, 26.5, -7, 3, 14, 1.2); ctx.fill();
      ctx.fillStyle = '#f4cf7a'; poly(ctx, [29, -1.1, 42, 0, 29, 1.1]); poly(ctx, [37, -0.6, 34, -3.2, 35.4, -0.4]); poly(ctx, [37, 0.6, 34, 3.2, 35.4, 0.4]);
      ctx.strokeStyle = '#f4cf7a'; ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.moveTo(28.5, -6); ctx.quadraticCurveTo(33, -6.6, 37.5, -4.4); ctx.moveTo(28.5, 6); ctx.quadraticCurveTo(33, 6.6, 37.5, 4.4); ctx.stroke();
      poly(ctx, [39.5, -3.6, 36.5, -5.6, 36.8, -3.3]); poly(ctx, [39.5, 3.6, 36.5, 5.6, 36.8, 3.3]);
      ctx.fillStyle = '#5af0ff'; ctx.beginPath(); ctx.arc(25.5, 0, 2.2, 0, TAU); ctx.fill();
      break;
    }
  }
}
function heldVisible(){ const S = DG.S; return S.playing && S.diver.y > 30 && !S.riding; }
function heldXform(ctx){
  const S = DG.S, hp = handPos(), s = wsc();
  ctx.translate(hp[0] - S.cam.x, hp[1] - S.cam.y);
  ctx.rotate(aimAng);
  ctx.scale(s, Math.cos(aimAng) < 0 ? -s : s);
  let off = -kickV;
  if (jabT > 0) off += Math.sin((1 - jabT/0.15)*Math.PI)*jabLen/s;
  ctx.translate(off, 0);
}
function drawHeld(ctx){
  const w = cur(), left = cds[w.id] || 0, mx = cdMax[w.id] || w.cd || 1;
  const ready = left <= 0 && swapT <= 0, p = ready ? 1 : clamp(1 - left/mx, 0, 1);
  ctx.save();
  heldXform(ctx);
  if (camoT > 0) ctx.globalAlpha = 0.35;
  drawWeaponShape(ctx, w.id, ready, p);
  ctx.restore();
}
function drawReticle(ctx){
  const S = DG.S, o = aimTgt; if (!o) return;
  const sx = o.x - S.cam.x, sy = o.y - S.cam.y; if (!onScr(sx, sy, 60)) return;
  const w = cur(), r = tR(o) + 8 + 14*(1 - easeOut(aimLock));
  let hot = false;
  if (w.kind === 'melee') { const hp = handPos(); hot = Math.hypot(o.x - hp[0], o.y - hp[1]) - tR(o) < w.range; }
  ctx.strokeStyle = hot ? 'rgba(255,90,78,.9)' : `rgba(244,207,122,${0.35 + 0.4*aimLock})`;
  ctx.lineWidth = 1.6; ctx.beginPath();
  for (let i = 0; i < 4; i++) { const b = time*0.9 + i*Math.PI/2; ctx.moveTo(sx + Math.cos(b - 0.3)*r, sy + Math.sin(b - 0.3)*r); ctx.arc(sx, sy, r, b - 0.3, b + 0.3); }
  ctx.stroke();
}

// ---------- dışa açık arayüz ----------
DG.wpn = {
  flares,
  update(dt){
    const S = DG.S; if (!S || !S.diver || !S.save) return;
    const d = S.diver, save = S.save;
    time += dt;
    near.length = 0;
    const ms = S.mons;
    for (let i = 0; i < ms.length; i++) { const m = ms[i]; if (!m.dead && Math.abs(m.y - d.y) < 1300) near.push(m); }
    bossT = bossOn() && DG.boss.targets ? (DG.boss.targets() || []) : [];
    for (const k in cds) if (cds[k] > 0) cds[k] -= dt;
    for (const k in skCd) if (skCd[k] > 0) skCd[k] -= dt;
    if (swapT > 0) swapT -= dt;
    if (hitSndT > 0) hitSndT -= dt;
    kickV *= Math.exp(-dt*14);
    if (jabT > 0) jabT -= dt;
    if (nudge.x || nudge.y) {
      const nx = d.x + nudge.x*dt, ny = d.y + nudge.y*dt;
      if (ny > 1 && !S.lifting && !solid(nx, ny)) { d.x = nx; d.y = ny; }
      const k = Math.exp(-dt*10); nudge.x *= k; nudge.y *= k;
      if (Math.abs(nudge.x) + Math.abs(nudge.y) < 1) nudge.x = nudge.y = 0;
    }
    const w = cur(), lv = save.wpn[w.id] || 0;
    const want = updateAim(w, dt);
    const canFire = S.playing && d.y >= 30 && !S.riding;
    let beamWant = false;
    if (canFire && S.input && S.input.fire) {
      if (w.kind === 'beam') beamWant = swapT <= 0;
      else if ((cds[w.id] || 0) <= 0 && swapT <= 0) fire(w, lv, want);
    }
    updateBeam(dt, beamWant, w, lv, want);
    updateDarts(dt);
    updateNets(dt);
    updateTorps(dt);
    updateSkills(dt);
    // parçacıklar
    for (const p of puffs) {
      p.life -= dt; p.ph += dt*5;
      p.vx *= Math.exp(-3*dt); p.vy += (-50 - p.vy)*Math.min(1, dt*2.2);
      p.x += p.vx*dt + Math.sin(p.ph)*0.25; p.y += p.vy*dt;
      if (p.y < 2) p.life = 0;
    }
    compact(puffs, p => p.life > 0);
    for (const p of sparks) { p.life -= dt; const k = Math.exp(-4*dt); p.vx *= k; p.vy = p.vy*k + p.g*dt; p.x += p.vx*dt; p.y += p.vy*dt; }
    compact(sparks, p => p.life > 0);
    for (const r of rings) r.t += dt;
    compact(rings, r => r.t < r.dur);
    for (const b of blasts) b.t += dt;
    compact(blasts, b => b.t < b.dur);
    for (const f of flashes) f.t += dt;
    compact(flashes, f => f.t < f.dur);
    for (const s of stuck) { s.t -= dt; s.wob *= Math.exp(-dt*6); }
    compact(stuck, s => s.t > 0);
    for (const b of bolts) b.t += dt;
    compact(bolts, b => b.t < b.dur);
    flushNums(dt);
  },
  next(){
    const S = DG.S, save = S.save;
    const owned = DG.data.WEAPONS.filter(w => save.wpn[w.id] != null);
    if (owned.length < 2) { if (DG.core.msg) DG.core.msg('Tek silahın var. Yenilerini istasyon dükkânından alabilirsin.', 'var(--dim)'); return; }
    const i = owned.findIndex(w => w.id === save.curWpn);
    const w = owned[(i + 1)%owned.length], lv = save.wpn[w.id] || 0;
    save.curWpn = w.id; swapT = 0.2; kickV = -4;
    if (DG.core.msg) DG.core.msg(w.n + ' · Hasar x' + (1 + 0.5*lv).toFixed(1).replace('.', ','), 'var(--brass-hi)');
    sfx('buy'); buzz(10);
    if (DG.core.persist) DG.core.persist();
  },
  skill(id){
    const S = DG.S, d = S.diver, save = S.save, s = SKL[id];
    if (!s || !S.playing || S.riding) return false;
    const lv = save.skills[id];
    if (lv == null) return false;
    if ((skCd[id] || 0) > 0) { buzz(8); return false; }
    if (id !== 'dash' && d.y < 30) return false;
    const cd = s.cd*(DG.data.SKILL_CD[lv] || 1);
    switch (id) {
      case 'dash': {
        dashDur = s.dur || 0.35; dashT = dashDur; ghostT = 0;
        const sp = DG.core.gSpeed ? DG.core.gSpeed() : 450, v = Math.hypot(d.vx, d.vy);
        let ux, uy;
        if (v > 30) { ux = d.vx/v; uy = d.vy/v; } else { ux = Math.cos(d.ang)*d.flip; uy = Math.sin(d.ang); }
        d.vx = ux*sp; d.vy = uy*sp;
        if (S.slowT > 0) S.slowT = 0;
        rings.push({x:d.x, y:d.y, r0:8, r1:46, t:0, dur:0.25, c:'90,216,255', w:2});
        puff(d.x, d.y, 8, 90, 1, 2.6, -ux*60, -uy*60);
        sfx('dash'); buzz(15);
        break;
      }
      case 'lift':
        if (!DG.core.startLift || !DG.core.startLift()) return false;
        break;
      case 'shock': {
        shockDur = s.dur || 1.6; shockT = shockDur; shockTick = 0;
        const R = (s.radius || 120) + 10*lv;
        rings.push({x:d.x, y:d.y, r0:16, r1:R*1.15, t:0, dur:0.32, c:'190,240,255', w:3});
        spark(d.x, d.y, 14, 300, '190,240,255');
        sfx('zap'); buzz(25);
        break;
      }
      case 'flare': throwFlare(); sfx('flare'); break;
      case 'sonar': {
        sonarT = s.dur || 6;
        rings.push({x:d.x, y:d.y, r0:10, r1:1150, t:0, dur:1.6, c:'90,216,255', w:2.2, sonar:true});
        rings.push({x:d.x, y:d.y, r0:10, r1:900, t:-0.25, dur:1.5, c:'90,216,255', w:1.2, sonar:true});
        sfx('sonar');
        break;
      }
      case 'camo': {
        camoDur = s.dur || 4.5; camoT = camoDur;
        rings.push({x:d.x, y:d.y, r0:60, r1:14, t:0, dur:0.35, c:'150,255,220', w:1.6});
        sfx('camo');
        if (!camoHint && DG.core.msg) { camoHint = true; DG.core.msg('Kamuflaj: canavarlar seni göremiyor. Ateş edersen bozulur.', 'var(--relic)'); }
        break;
      }
      default: return false;
    }
    skCd[id] = cd; skMax[id] = cd;
    return true;
  },
  skillInfo(id){
    const s = SKL[id], left = skCd[id] || 0, mx = skMax[id] || (s ? s.cd : 1) || 1;
    let active = false;
    switch (id) {
      case 'dash': active = dashT > 0; break;
      case 'shock': active = shockT > 0; break;
      case 'flare': active = flares.length > 0; break;
      case 'sonar': active = sonarT > 0; break;
      case 'camo': active = camoT > 0; break;
      case 'lift': active = !!(DG.S && DG.S.lifting); break;
    }
    return {frac:left > 0 ? clamp(left/mx, 0, 1) : 0, active};
  },
  fireInfo(){
    if (!DG.S || !DG.S.save) return {frac:0};
    const w = cur();
    if (w.kind === 'beam') return {frac:swapT > 0 ? clamp(swapT/0.2, 0, 1) : 0, active:beam.on};
    const left = Math.max(cds[w.id] || 0, swapT), mx = Math.max(cdMax[w.id] || w.cd || 0.2, swapT > 0 ? 0.2 : 0);
    return {frac:left > 0 ? clamp(left/mx, 0, 1) : 0};
  },
  speedMult(){
    if (dashT <= 0) return 1;
    const tail = dashDur*0.3;
    return dashT > tail ? 3 : 1 + 2*(dashT/tail);
  },
  defenseMult(){ return dashT > 0 ? 0 : shockT > 0 ? 0.5 : 1; },
  camoActive(){ return camoT > 0; },
  sonarActive(){ return sonarT > 0; },
  shockActive(){ return shockT > 0; },
  shortName(id){ return SHORT[id] || (WPN[id] ? WPN[id].n.split(' ')[0].toLocaleUpperCase('tr-TR') : ''); },
  dashActive(){ return dashT > 0; },
  aimTarget(){ return aimTgt; },
  reset(){
    for (const a of [darts, nets, torps, rings, blasts, sparks, puffs, stuck, bolts, ghosts, flashes, flares]) a.length = 0;
    beam.on = false; beam.k = 0; dashT = shockT = sonarT = camoT = 0; aimTgt = null; dmgAcc.clear();
  },

  // Dalgıcın arkasına: hız patlaması izleri.
  drawUnder(ctx){
    if (!ghosts.length) return;
    const S = DG.S, cx = S.cam.x, cy = S.cam.y;
    ctx.save();
    for (const g of ghosts) {
      const k = 1 - g.t/0.28;
      ctx.save(); ctx.translate(g.x - cx, g.y - cy); ctx.scale(g.flip*g.b, g.b); ctx.rotate(g.ang);
      ctx.fillStyle = `rgba(90,216,255,${0.3*k})`;
      rr(ctx, -9, -6.5, 24, 13, 6); ctx.fill(); ctx.fillRect(-23, -3.5, 16, 7);
      ctx.beginPath(); ctx.arc(19, -1, 6.5, 0, TAU); ctx.fill();
      poly(ctx, [-23, 0, -37, -6, -37, 6]);
      ctx.restore();
    }
    ctx.restore();
  },

  // Işıkla görünen gövdeler: oklar, ağlar, torpidolar, fişek çubukları, kabarcıklar.
  draw(ctx){
    const S = DG.S, cx = S.cam.x, cy = S.cam.y;
    ctx.save();
    if (puffs.length) {
      for (let b = 0; b < 3; b++) {
        ctx.strokeStyle = `rgba(220,245,255,${[0.25, 0.5, 0.75][b]})`; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const p of puffs) {
          const k = p.life/p.max, bk = k < 0.33 ? 0 : k < 0.66 ? 1 : 2; if (bk !== b) continue;
          const sx = p.x - cx, sy = p.y - cy; if (!onScr(sx, sy, 10)) continue;
          ctx.moveTo(sx + p.r, sy); ctx.arc(sx, sy, p.r, 0, TAU);
        }
        ctx.stroke();
      }
    }
    for (const s of stuck) {
      const sx = s.x - cx, sy = s.y - cy; if (!onScr(sx, sy, 40)) continue;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.a + Math.sin(time*40)*0.06*s.wob); ctx.globalAlpha = Math.min(1, s.t/0.6);
      ctx.strokeStyle = '#aab6be'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-2, 0); ctx.stroke();
      ctx.strokeStyle = '#6b7783'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-28, -3); ctx.moveTo(-24, 0); ctx.lineTo(-28, 3); ctx.stroke();
      ctx.restore();
    }
    const hp = handPos(), w = cur();
    for (const p of darts) {
      const sx = p.x - cx, sy = p.y - cy; if (!onScr(sx, sy, 60)) continue;
      const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx/sp, uy = p.vy/sp;
      if (p.heavy) {
        const tx = sx - ux*26, ty = sy - uy*26;
        if (w.kind === 'dart' && !w.spread) {
          const L = LOOK.spear.len*wsc(), mx = hp[0] + Math.cos(aimAng)*L - cx, my = hp[1] + Math.sin(aimAng)*L - cy;
          const k = p.life/p.max;
          ctx.strokeStyle = `rgba(230,240,245,${0.28*k})`; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo((mx + tx)/2, (my + ty)/2 + 10*(1 - k), tx, ty); ctx.stroke();
        }
        ctx.strokeStyle = '#c9d3da'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.strokeStyle = '#6b7783'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(tx, ty); ctx.lineTo(tx - ux*4 - uy*3, ty - uy*4 + ux*3); ctx.moveTo(tx, ty); ctx.lineTo(tx - ux*4 + uy*3, ty - uy*4 - ux*3); ctx.stroke();
        ctx.fillStyle = '#f4cf7a'; ctx.beginPath(); ctx.moveTo(sx + ux*5, sy + uy*5); ctx.lineTo(sx - uy*2.4, sy + ux*2.4); ctx.lineTo(sx + uy*2.4, sy - ux*2.4); ctx.closePath(); ctx.fill();
      } else {
        ctx.strokeStyle = '#8f9aa3'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sx - ux*9, sy - uy*9); ctx.lineTo(sx, sy); ctx.stroke();
      }
    }
    for (const n of nets) {
      const sx = n.x - cx, sy = n.y - cy; if (!onScr(sx, sy, 140)) continue;
      if (n.st === 0) {
        ctx.fillStyle = '#b9a77c'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#7d6d48'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx - 4, sy - 2); ctx.lineTo(sx + 4, sy + 2); ctx.moveTo(sx - 2, sy + 4); ctx.lineTo(sx + 2, sy - 4); ctx.stroke();
        ctx.fillStyle = '#8a969f';
        for (let i = 0; i < 4; i++) { const a = n.spin + i*Math.PI/2; ctx.beginPath(); ctx.arc(sx + Math.cos(a)*9, sy + Math.sin(a)*9, 1.6, 0, TAU); ctx.fill(); }
        ctx.strokeStyle = 'rgba(201,180,138,.6)'; ctx.lineWidth = 0.7; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = n.spin + i*Math.PI/2; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a)*9, sy + Math.sin(a)*9); }
        ctx.stroke();
        continue;
      }
      const fade = clamp((n.hold + 0.6 - n.t)/0.6, 0, 1), R = n.R, G = NG;
      ctx.globalAlpha = fade;
      netPts(sx, sy, R, n);
      ctx.strokeStyle = 'rgba(206,188,142,.8)'; ctx.lineWidth = 0.9; ctx.beginPath();
      for (let j = 1; j < G - 1; j++) {
        for (let i = 0; i < G; i++) { const q = (j*G + i)*2; if (i) ctx.lineTo(ngp[q], ngp[q + 1]); else ctx.moveTo(ngp[q], ngp[q + 1]); }
        for (let i = 0; i < G; i++) { const q = (i*G + j)*2; if (i) ctx.lineTo(ngp[q], ngp[q + 1]); else ctx.moveTo(ngp[q], ngp[q + 1]); }
      }
      ctx.stroke();
      // kenar halatı
      ctx.strokeStyle = 'rgba(226,208,160,.95)'; ctx.lineWidth = 1.8; ctx.beginPath();
      for (let k = 0; k <= 4*(G - 1); k++) { const q = edgeIdx(k%(4*(G - 1)), G)*2; if (k) ctx.lineTo(ngp[q], ngp[q + 1]); else ctx.moveTo(ngp[q], ngp[q + 1]); }
      ctx.stroke();
      for (let k = 0; k < 4*(G - 1); k += 2) {
        const q = edgeIdx(k, G)*2, lead = (k/2)%2;
        ctx.fillStyle = lead ? '#7d8890' : '#d9a441';
        ctx.beginPath(); ctx.arc(ngp[q], ngp[q + 1], lead ? 2.1 : 2.7, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const p of torps) {
      const sx = p.x - cx, sy = p.y - cy; if (!onScr(sx, sy, 40)) continue;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.a);
      ctx.fillStyle = '#2b3440'; poly(ctx, [-9, -2.5, -14, -6.5, -12, -2.5]); poly(ctx, [-9, 2.5, -14, 6.5, -12, 2.5]);
      ctx.fillStyle = '#3a4652'; rr(ctx, -12, -3.2, 20, 6.4, 3.2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(-10, -2.6, 16, 1.2);
      ctx.fillStyle = '#d9a441'; ctx.fillRect(-4, -3.3, 2, 6.6);
      ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.arc(7.6, 0, 3.2, -Math.PI/2, Math.PI/2); ctx.fill();
      ctx.fillStyle = '#8a969f'; ctx.beginPath(); ctx.ellipse(-14, 0, 1.1, 1 + 3.6*Math.abs(Math.sin(time*42)), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    for (const f of flares) {
      const sx = f.x - cx, sy = f.y - cy; if (!onScr(sx, sy, 30)) continue;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(f.ang);
      ctx.fillStyle = '#b8352a'; rr(ctx, -1.9, -6, 3.8, 13, 1.2); ctx.fill();
      ctx.fillStyle = '#f2ece0'; ctx.fillRect(-1.9, -1, 3.8, 1.4);
      ctx.fillStyle = '#3a434c'; ctx.fillRect(-1.6, 6, 3.2, 2);
      ctx.restore();
    }
    ctx.restore();
  },

  // Karanlığın üstü: elde silah, nişangâh, ışın, patlama, fişek ateşi, kalkan, sonar.
  drawGlow(ctx, a){
    const S = DG.S, d = S.diver, cx = S.cam.x, cy = S.cam.y, dsx = d.x - cx, dsy = d.y - cy;
    const g = 0.55 + 0.45*(a || 0);
    ctx.save();
    const show = heldVisible();
    if (show) { drawHeld(ctx); drawReticle(ctx); }
    ctx.globalCompositeOperation = 'lighter';
    // patlama ışığı
    for (const b of blasts) {
      const sx = b.x - cx, sy = b.y - cy; if (!onScr(sx, sy, b.R*1.5)) continue;
      const k = b.t/b.dur, r = b.R*(0.35 + 0.8*easeOut(k)), al = Math.pow(1 - k, 1.5);
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(255,250,232,${0.95*al})`); gr.addColorStop(0.28, `rgba(255,206,130,${0.75*al})`);
      gr.addColorStop(0.65, `rgba(255,110,40,${0.32*al})`); gr.addColorStop(1, 'rgba(255,70,20,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
    }
    // fişekler
    for (const f of flares) {
      const sx = f.x - cx, sy = f.y - cy; if (!onScr(sx, sy, 120)) continue;
      const fl = 0.82 + 0.18*Math.sin(time*31 + f.ph)*Math.sin(time*13.7), k = Math.min(1, f.t/1.5)*f.ig;
      const tx = sx + Math.sin(f.ang)*7, ty = sy - Math.cos(f.ang)*7;
      const gr = ctx.createRadialGradient(tx, ty, 0, tx, ty, 95);
      gr.addColorStop(0, `rgba(255,150,90,${0.42*fl*k*g})`); gr.addColorStop(0.4, `rgba(255,90,50,${0.16*fl*k*g})`); gr.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(tx, ty, 95, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,120,70,${0.55*k})`; ctx.beginPath(); ctx.arc(tx, ty, 6.5*fl, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,244,226,${0.95*k})`; ctx.beginPath(); ctx.arc(tx, ty, 2.8*fl, 0, TAU); ctx.fill();
    }
    // torpido kuyruk ışığı
    for (const p of torps) {
      const sx = p.x - cx, sy = p.y - cy; if (!onScr(sx, sy, 40)) continue;
      const c = Math.cos(p.a), s = Math.sin(p.a), tx = sx - c*13, ty = sy - s*13;
      ctx.strokeStyle = `rgba(255,170,80,${0.35*g})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - c*18, ty - s*18); ctx.stroke();
      ctx.fillStyle = `rgba(255,200,130,${0.8*g})`; ctx.beginPath(); ctx.arc(tx, ty, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,90,60,${0.7*g})`; ctx.beginPath(); ctx.arc(sx + c*2, sy + s*2 - 3.4, 1.1, 0, TAU); ctx.fill();
    }
    // seri tüfek izli mermileri, zıpkın ucu parıltısı
    ctx.lineWidth = 1.6;
    for (const p of darts) {
      const sx = p.x - cx, sy = p.y - cy; if (!onScr(sx, sy, 40)) continue;
      if (p.heavy) { ctx.fillStyle = `rgba(220,240,255,${0.45*g})`; ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = `rgba(255,214,150,${0.75*g})`; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx*0.02, sy - p.vy*0.02); ctx.stroke(); }
    }
    // ağ şamandıraları karanlıkta hafifçe parlar
    if (a > 0.3) for (const n of nets) {
      if (n.st !== 1) continue;
      const sx = n.x - cx, sy = n.y - cy; if (!onScr(sx, sy, 140)) continue;
      const fade = clamp((n.hold + 0.6 - n.t)/0.6, 0, 1);
      ctx.fillStyle = `rgba(120,255,220,${0.55*fade*a})`;
      netPts(sx, sy, n.R, n);
      for (let k = 0; k < 4*(NG - 1); k += 4) { const q = edgeIdx(k, NG)*2; ctx.beginPath(); ctx.arc(ngp[q], ngp[q + 1], 2, 0, TAU); ctx.fill(); }
    }
    // halkalar: sonar, sonik dalga, şok dalgası
    for (const r of rings) {
      if (r.t < 0) continue;
      const k = r.t/r.dur, rad = r.r0 + (r.r1 - r.r0)*(r.sonar ? k : easeOut(k)), al = (1 - k)*(r.sonar ? 0.7 : 0.8);
      const sx = r.x - cx, sy = r.y - cy;
      if (sx + rad < 0 || sx - rad > S.W || sy + rad < 0 || sy - rad > S.H) continue;
      const a0 = r.half != null ? r.a - r.half*(0.85 + 0.15*k) : 0, a1 = r.half != null ? r.a + r.half*(0.85 + 0.15*k) : TAU;
      if (r.sonar) { ctx.strokeStyle = `rgba(${r.c},${al*0.18})`; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(sx, sy, rad, a0, a1); ctx.stroke(); }
      if (r.fill && rad > 12) {
        // sonik koni: basınç kaması ve kalın dalga cephesi
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
        gr.addColorStop(0, `rgba(${r.c},0)`); gr.addColorStop(0.6, `rgba(${r.c},${0.07*al*g})`); gr.addColorStop(1, `rgba(${r.c},${0.26*al*g})`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, rad, a0, a1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(${r.c},${0.22*al})`; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(sx, sy, rad - 6, a0, a1); ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${r.c},${al})`; ctx.lineWidth = r.w; ctx.beginPath(); ctx.arc(sx, sy, rad, a0, a1); ctx.stroke();
      if (r.sonar) {
        // sonar yankıları: dalga geçtiği canavarları bir an işaretler
        for (const m of near) {
          const dd = Math.hypot(m.x - r.x, m.y - r.y), e = Math.abs(dd - rad); if (e > 60) continue;
          const mx = m.x - cx, my = m.y - cy; if (!onScr(mx, my, 40)) continue;
          const mr = monR(m) + 7, md = DG.data.MON[m.t], bad = md && md.mimic;
          ctx.strokeStyle = bad ? `rgba(255,90,78,${0.9*(1 - e/60)})` : `rgba(90,216,255,${0.7*(1 - e/60)})`;
          ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.stroke();
        }
      }
    }
    // elektrik kalkanı
    if (shockT > 0) {
      const lv = shockLv(), R = (SKL.shock.radius || 120) + 10*lv, k = Math.min(1, shockT/0.25)*(0.75 + 0.25*Math.random());
      const gr = ctx.createRadialGradient(dsx, dsy, R*0.2, dsx, dsy, R);
      const kd = k*(0.35 + 0.65*(a || 0));
      gr.addColorStop(0, 'rgba(120,210,255,0)'); gr.addColorStop(0.8, `rgba(120,210,255,${0.12*kd})`); gr.addColorStop(1, 'rgba(120,210,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(dsx, dsy, R, 0, TAU); ctx.fill();
      for (let j = 0; j < 2; j++) {
        ctx.strokeStyle = j ? `rgba(120,200,255,${0.5*kd})` : `rgba(215,248,255,${0.85*k*g})`; ctx.lineWidth = j ? 2.6 : 1.3; ctx.beginPath();
        const n = 34, ph = rnd(0, TAU);
        for (let i = 0; i <= n; i++) { const an = ph + i/n*TAU, rr2 = R*(0.9 + Math.random()*0.12); const x = dsx + Math.cos(an)*rr2, y = dsy + Math.sin(an)*rr2; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(200,245,255,${0.6*k})`; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < 3; i++) { const an = rnd(0, TAU), r0 = 14, r1 = R*rnd(0.6, 0.95); jag(ctx, dsx + Math.cos(an)*r0, dsy + Math.sin(an)*r0, dsx + Math.cos(an + rnd(-0.4, 0.4))*r1, dsy + Math.sin(an + rnd(-0.4, 0.4))*r1, 12, 5); }
      ctx.stroke();
    }
    for (const b of bolts) {
      const k = 1 - b.t/b.dur;
      ctx.strokeStyle = `rgba(120,200,255,${0.35*k})`; ctx.lineWidth = 4; ctx.beginPath(); jag(ctx, b.x0 - cx, b.y0 - cy, b.x1 - cx, b.y1 - cy, 14, 7); ctx.stroke();
      ctx.strokeStyle = `rgba(225,250,255,${0.95*k})`; ctx.lineWidth = 1.3; ctx.beginPath(); jag(ctx, b.x0 - cx, b.y0 - cy, b.x1 - cx, b.y1 - cy, 12, 6); ctx.stroke();
    }
    // Poseidon ışını
    if (beam.k > 0) {
      const k = beam.k, x0 = beam.x0 - cx, y0 = beam.y0 - cy, x1 = beam.x1 - cx, y1 = beam.y1 - cy;
      const pulse = 0.85 + 0.15*Math.sin(time*40);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(90,240,255,${0.16*k*pulse})`; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = `rgba(244,207,122,${0.5*k})`; ctx.lineWidth = 4.5*pulse; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,240,${0.9*k})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = `rgba(150,240,255,${0.65*k})`; ctx.lineWidth = 1.1; ctx.beginPath();
      jag(ctx, x0, y0, x1, y1, 22, 6); jag(ctx, x0, y0, x1, y1, 30, 9); ctx.stroke();
      ctx.lineCap = 'butt';
      const er = 22 + 6*Math.sin(time*30);
      let gr = ctx.createRadialGradient(x1, y1, 0, x1, y1, er);
      gr.addColorStop(0, `rgba(255,255,235,${0.85*k})`); gr.addColorStop(0.4, `rgba(150,240,255,${0.45*k})`); gr.addColorStop(1, 'rgba(90,240,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x1, y1, er, 0, TAU); ctx.fill();
      gr = ctx.createRadialGradient(x0, y0, 0, x0, y0, 16);
      gr.addColorStop(0, `rgba(255,250,220,${0.9*k})`); gr.addColorStop(1, 'rgba(244,207,122,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x0, y0, 16, 0, TAU); ctx.fill();
      for (let i = 0; i < beam.hits.length; i += 2) {
        const hx = beam.hits[i] - cx, hy = beam.hits[i + 1] - cy;
        ctx.fillStyle = `rgba(200,250,255,${0.5*k})`; ctx.beginPath(); ctx.arc(hx, hy, 9 + Math.random()*4, 0, TAU); ctx.fill();
      }
    }
    // silah üstü parıltılar
    if (show) {
      const w = cur();
      if (w.id === 'trident' || w.id === 'sonic') {
        ctx.save(); heldXform(ctx);
        const on = w.id === 'trident' ? 0.35 + 0.65*beam.k : ((cds.sonic || 0) <= 0 ? 0.5 : 0.12);
        const gx = w.id === 'trident' ? 25.5 : 19, rr2 = w.id === 'trident' ? 7 : 6;
        const gr = ctx.createRadialGradient(gx, 0, 0, gx, 0, rr2);
        gr.addColorStop(0, `rgba(150,245,255,${0.8*on})`); gr.addColorStop(1, 'rgba(90,240,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, 0, rr2, 0, TAU); ctx.fill();
        if (w.id === 'trident' && beam.k > 0) {
          ctx.strokeStyle = `rgba(255,240,200,${0.6*beam.k})`; ctx.lineWidth = 1.2; ctx.beginPath();
          ctx.moveTo(29, 0); ctx.lineTo(42, 0); ctx.moveTo(28.5, -6); ctx.quadraticCurveTo(33, -6.6, 39, -3.8); ctx.moveTo(28.5, 6); ctx.quadraticCurveTo(33, 6.6, 39, 3.8); ctx.stroke();
        }
        ctx.restore();
      }
    }
    // namlu alevleri (su altında kısa basınç parlaması)
    for (const f of flashes) {
      const sx = f.x - cx, sy = f.y - cy, k = 1 - f.t/f.dur, s = f.s, c = Math.cos(f.a), si = Math.sin(f.a);
      const r = 13*s;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(255,252,240,${0.9*k})`); gr.addColorStop(0.5, `rgba(${f.c},${0.45*k})`); gr.addColorStop(1, `rgba(${f.c},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${f.c},${0.55*k})`; ctx.beginPath();
      ctx.moveTo(sx - si*3*s, sy + c*3*s); ctx.lineTo(sx + c*20*s, sy + si*20*s); ctx.lineTo(sx + si*3*s, sy - c*3*s); ctx.closePath(); ctx.fill();
    }
    // kıvılcımlar
    ctx.lineWidth = 1.3;
    for (const p of sparks) {
      const sx = p.x - cx, sy = p.y - cy; if (!onScr(sx, sy, 20)) continue;
      ctx.strokeStyle = `rgba(${p.c},${clamp(p.life/p.max, 0, 1)})`;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx*0.025, sy - p.vy*0.025); ctx.stroke();
    }
    // hız patlaması çizgileri
    if (dashT > 0) {
      const v = Math.hypot(d.vx, d.vy) || 1, ux = d.vx/v, uy = d.vy/v, k = dashT/dashDur;
      ctx.strokeStyle = `rgba(160,235,255,${0.4*k})`; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = -1; i <= 1; i++) { const ox = -uy*i*8, oy = ux*i*8, l = 40 + 20*Math.random(); ctx.moveTo(dsx + ox - ux*14, dsy + oy - uy*14); ctx.lineTo(dsx + ox - ux*(14 + l), dsy + oy - uy*(14 + l)); }
      ctx.stroke();
    }
    // kamuflaj: suyu büken titrek bir kabuk
    if (camoT > 0) {
      const end = camoT < 0.8 ? (Math.floor(camoT*12)%2 ? 0.4 : 1) : 1, k = Math.min(1, camoT/0.3)*end;
      ctx.strokeStyle = `rgba(150,255,220,${0.22*k})`; ctx.lineWidth = 1.2;
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
          const an = i/28*TAU, rr2 = (26 + j*7)*(1 + 0.08*Math.sin(an*3 + time*(3 + j) + j*2));
          const x = dsx + Math.cos(an)*rr2*1.25, y = dsy + Math.sin(an)*rr2*0.85;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  // Karanlıkta delik açan ışıklar (dünya koordinatı).
  lights(){
    const out = lightsOut; out.length = 0;
    const S = DG.S, d = S.diver;
    for (const f of flares) {
      const fl = 0.9 + 0.1*Math.sin(time*23 + f.ph), k = Math.min(1, f.t/1.5)*f.ig;
      out.push({x:f.x, y:f.y, r:(110 + 230*k)*fl, k:Math.max(0.3, k)});
    }
    for (const b of blasts) { const k = 1 - b.t/b.dur; out.push({x:b.x, y:b.y, r:b.R*2.1*(0.5 + 0.5*k), k:0.95*k}); }
    if (beam.k > 0) {
      const mx = (beam.x0 + beam.x1)/2, my = (beam.y0 + beam.y1)/2;
      out.push({x:beam.x0, y:beam.y0, r:110, k:0.75*beam.k});
      out.push({x:mx, y:my, r:150, k:0.6*beam.k});
      out.push({x:beam.x1, y:beam.y1, r:140, k:0.8*beam.k});
    }
    if (shockT > 0) out.push({x:d.x, y:d.y, r:((SKL.shock.radius || 120) + 10*shockLv())*1.5, k:0.55*Math.min(1, shockT/0.25)});
    for (const p of torps) out.push({x:p.x, y:p.y, r:75, k:0.5});
    for (const f of flashes) out.push({x:f.x, y:f.y, r:70 + 50*f.s, k:0.8*(1 - f.t/f.dur)});
    return out;
  },
};
})();
