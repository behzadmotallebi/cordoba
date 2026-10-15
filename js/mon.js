/* Dalgıç: canavarlar. Yapay zekâ, elle çizilmiş vektör gövdeler, karanlıkta parlayan gözler ve taklitçiler.
   Sözleşme: js/API.md (DG.mon). Gölge/blur yok; ekran dışı çizilmez; ışıltılar önceden çizilmiş sprite ile. */
(function () {
'use strict';
const DG = window.DG = window.DG || {};
const MON = DG.data.MON, LAYERS = DG.data.LAYERS;
const {WORLD_W, BOAT_X, NL, SHAFT_HALF, LEDGE_HALF, SAFE_R} = DG.C;
const TAU = Math.PI*2;

// ---------- küçük yardımcılar ----------
const rnd = (a, b) => a + Math.random()*(b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a)*k;
const hsh = n => { const s = Math.sin(n*127.1 + 311.7)*43758.5453; return s - Math.floor(s); };
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const shade = (c, k) => [c[0]*k, c[1]*k, c[2]*k];
const css = (c, a) => a == null ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const trip = c => `${c[0]|0},${c[1]|0},${c[2]|0}`;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const backOut = k => { const c = 1.9; return 1 + (c + 1)*Math.pow(k - 1, 3) + c*Math.pow(k - 1, 2); };
function wrapA(d){ while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
const angTo = (a, b, max) => a + clamp(wrapA(b - a), -max, max);
const lerpAng = (a, b, k) => a + wrapA(b - a)*k;
function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l2 = dx*dx + dy*dy;
  const k = l2 > 0 ? clamp(((px - ax)*dx + (py - ay)*dy)/l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx*k, py - ay - dy*k);
}

// ---------- tablolar ----------
const CD = {jelly:1.1, eel:1.0, shark:1.5, angler:1.4, viper:0.9, squid:1.6, serpent:1.4, guardian:1.4, mimic:1.3, octopus:1.6, urchin:0.9, mine:0};
const MASS = {serpent:1.9, guardian:1.6, squid:1.4, shark:1.2, octopus:1.5, angler:1.1};
// [en erken kat, şans] dev boy (size > 1)
const GIANT = {jelly:[6, 0.14], shark:[4, 0.10], angler:[5, 0.09], squid:[6, 0.12], serpent:[7, 0.12], octopus:[6, 0.12], guardian:[10, 0.10], eel:[5, 0.07], mimic:[8, 0.10]};
const ANCHORED = {eel:1, octopus:1, urchin:1, mine:1};
const OBST = {urchin:1, mine:1};   // kıpırdamayan engeller: yapay zekâ basit, sersemlemez, itilmez
const VIS = {viper:1.3, guardian:1.12, angler:1.08};   // çizim ve isabet boyu çarpanı

// ---------- tohumlu rastgele: katın canavar listesi her açılışta aynı ----------
function seeded(a){
  return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
}
// Üretimde bütün istasyonlar (açılmamış olanlar da) güvenli sayılır: liste açılan katlara göre değişmesin.
const safeGen = (x, y) => DG.U.isSafeAny ? DG.U.isSafeAny(x, y) : DG.U.isSafe(x, y);

// ---------- kare önbelleği ----------
const F = {t:-1, camo:false, sonar:false, flares:[], boss:false, dSafe:false, hunt:false, light:120, dL:0, near:[]};
let growlT = -9, hintMimic = false, hintOcto = false, hintLure = false;
function refresh(){
  const S = DG.S, D = S.diver, W = DG.wpn;
  F.t = S.t;
  F.camo = !!(W && W.camoActive && W.camoActive());
  F.sonar = !!(W && W.sonarActive && W.sonarActive());
  F.flares = (W && Array.isArray(W.flares)) ? W.flares : [];
  F.boss = !!(DG.boss && DG.boss.active && DG.boss.active());
  F.dSafe = !F.boss && DG.U.isSafe(D.x, D.y);
  F.hunt = !!S.playing && !F.camo && D.y > 24 && !S.riding;
  F.light = DG.core && DG.core.gLight ? DG.core.gLight() : 120;
  F.dL = DG.U.layerOf(D.y);
  // yakındaki yüzücüler (ayrışma için)
  const near = F.near; near.length = 0;
  const lim = Math.max(1500, S.H*2);
  for (const m of S.mons) if (!m.dead && !m.hidden && !ANCHORED[m.t] && Math.abs(m.y - D.y) < lim) near.push(m);
}
const fr = () => { if (F.t !== DG.S.t) refresh(); };

// ---------- ışıltı sprite'ları (gradyan bir kez çizilir) ----------
const sprites = {};
function sprite(rgb){
  let c = sprites[rgb]; if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.22, `rgba(${rgb},.55)`); gr.addColorStop(0.55, `rgba(${rgb},.14)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (sprites[rgb] = c);
}
function glow(ctx, x, y, r, rgb, a){
  if (a <= 0.01 || r <= 0.5) return;
  ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sprite(rgb), x - r, y - r, r*2, r*2); ctx.globalAlpha = 1;
}

// ---------- dönüşüm: her canavarın yerel çizim çerçevesi ----------
// yerel +x = burun yönü, -y = sırt. (fa fb fc fd) = döndür·ölçekle matrisi, köken (ox, oy).
function setXf(m, ang, kx, ky){ const c = Math.cos(ang), s = Math.sin(ang); m.fa = c*kx; m.fb = s*kx; m.fc = -s*ky; m.fd = c*ky; }
function wpt(m, lx, ly){ return [m.ox + m.fa*lx + m.fc*ly, m.oy + m.fb*lx + m.fd*ly]; }
const wob = m => m.stun > 0 ? Math.sin(m.ph*18)*0.14*Math.min(1, m.stun) : 0;
function poseFish(m, dt, faceTo, tiltTo, mul){
  const want = faceTo || (Math.abs(m.vx) > 12 ? (m.vx > 0 ? 1 : -1) : (m.face >= 0 ? 1 : -1));
  m.face += (want - m.face)*Math.min(1, dt*8);
  if (Math.abs(m.face) < 0.12) m.face = m.face < 0 ? -0.12 : 0.12;
  const sp = Math.hypot(m.vx, m.vy);
  const tt = tiltTo != null ? tiltTo : sp > 12 ? clamp(Math.atan2(m.vy, Math.abs(m.vx)), -0.6, 0.6) : 0;
  m.tilt += (tt - m.tilt)*Math.min(1, dt*5);
  const k = m.sc*(mul || 1), sg = m.face >= 0 ? 1 : -1;
  setXf(m, m.tilt*sg + wob(m), m.face*k*(1 + 0.22*m.sq), k*(1 - 0.16*m.sq));
  m.ox = m.x; m.oy = m.y;
}
function poseRot(m, dt){
  const fy = Math.cos(m.ang) >= 0 ? 1 : -1;
  m.fy += (fy - m.fy)*Math.min(1, dt*7);
  if (Math.abs(m.fy) < 0.12) m.fy = m.fy < 0 ? -0.12 : 0.12;
  setXf(m, m.ang + wob(m), m.sc*(1 + 0.22*m.sq), m.sc*m.fy*(1 - 0.16*m.sq));
  m.ox = m.x; m.oy = m.y;
}

// ---------- palet: derinlikle koyulaşır ----------
function palette(t, L, m){
  const k = clamp(L/10, 0, 1), P = {};
  switch (t) {
    case 'jelly': {
      const c = L < 3 ? [255, 178, 216] : L < 7 ? mixc([176, 168, 255], [120, 128, 255], (L - 3)/4) : [178, 34, 66];
      const g = L < 3 ? [255, 150, 220] : L < 7 ? [140, 160, 255] : [90, 150, 255];
      P.bell = css(c, 0.42); P.rim = css(mixc(c, [255, 255, 255], 0.4), 0.85); P.tent = css(mixc(c, [255, 255, 255], 0.25), 0.5);
      P.arm = css(c, 0.5); P.inner = L < 4 ? css(mixc(c, [255, 244, 250], 0.55), 0.85) : css(shade(c, 0.5), 0.9);
      P.glow = trip(g); P.burst = css(mixc(c, [255, 255, 255], 0.3)); P.hi = 'rgba(255,255,255,.35)';
      break;
    }
    case 'eel': {
      const b = mixc([112, 114, 56], [46, 38, 34], k);
      P.body = css(b); P.belly = css(mixc(b, [206, 196, 126], 0.32)); P.line = css(shade(b, 0.45)); P.fin = css(shade(b, 0.72), 0.85);
      P.spot = css(mixc([228, 212, 104], [168, 146, 124], k), 0.85); P.mouth = '#360808'; P.teeth = '#f2ecd2';
      P.eye = k > 0.5 ? '#ffb040' : '#e8e080'; P.eyeG = k > 0.5 ? '255,176,64' : '232,224,128'; P.burst = css(mixc(b, [150, 30, 30], 0.3));
      break;
    }
    case 'shark': {
      const b = mixc([118, 142, 160], [36, 42, 52], k), bl = mixc([228, 234, 238], [112, 116, 124], k);
      P.body = css(b); P.belly = css(bl); P.fin = css(shade(b, 0.9)); P.dark = css(shade(b, 0.66)); P.line = css(shade(b, 0.42));
      P.gill = css(shade(b, 0.55)); P.teeth = '#f6f2e4'; P.mouth = '#4a0c12'; P.scar = css(mixc([238, 232, 222], [206, 180, 172], k), 0.7);
      P.eyeC = k > 0.55 ? '#d8402a' : '#141414'; P.eyeG = k > 0.55 ? '255,70,40' : '246,240,176'; P.hi = 'rgba(255,255,255,.14)';
      P.burst = css(mixc(b, [170, 24, 34], 0.45));
      break;
    }
    case 'angler': {
      const b = mixc([98, 78, 64], [22, 19, 26], k);
      P.body = css(b); P.belly = css(mixc(b, [150, 128, 104], 0.25)); P.fin = css(mixc(b, [150, 172, 196], 0.12 + 0.35*k), 0.9);
      P.line = css(shade(b, 0.5)); P.teeth = '#eef0e2'; P.mouth = '#1a0508'; P.rod = css(mixc(b, [130, 118, 104], 0.45));
      P.spot = css(shade(b, 0.72)); P.eyeC = '#d8f4ff'; P.eyeG = '200,247,255'; P.scar = css([210, 200, 190], 0.55);
      P.lure = L >= 4 ? '#fff' : '#c8fff0'; P.lureG = L >= 4 ? '255,240,220' : '150,255,225'; P.burst = css(mixc(b, [150, 40, 40], 0.4));
      break;
    }
    case 'viper': {
      const b = mixc([44, 62, 86], [12, 14, 22], k);
      P.body = css(b); P.sheen = css(mixc([140, 192, 222], [72, 112, 172], k), 0.6); P.belly = css(mixc(b, [150, 176, 196], 0.35));
      P.line = css(shade(b, 0.45)); P.fin = css(mixc(b, [96, 126, 156], 0.35), 0.85); P.teeth = '#eaf6ff';
      P.eyeC = '#0a0a10'; P.eyeR = css(mixc([120, 180, 230], [90, 140, 255], k)); P.eyeG = '150,205,255'; P.photo = '110,190,255';
      P.burst = css(mixc(b, [120, 170, 220], 0.5));
      break;
    }
    case 'squid': {
      const b = mixc([200, 78, 86], [102, 16, 42], k);
      P.body = css(b); P.dark = css(shade(b, 0.62)); P.line = css(shade(b, 0.42)); P.arm = css(shade(b, 0.84)); P.fin = css(shade(b, 0.8));
      P.spotA = css(shade(b, 0.48)); P.spotB = css(mixc(b, [255, 196, 168], 0.42)); P.sucker = 'rgba(255,224,212,.75)';
      P.eye = '#ffd23a'; P.eyeG = '255,210,58'; P.scar = css([240, 210, 200], 0.6); P.burst = css(mixc(b, [255, 120, 120], 0.2));
      break;
    }
    case 'serpent': {
      const b = mixc([46, 92, 74], [24, 26, 40], k), bl = mixc([178, 188, 132], [112, 78, 70], k);
      P.body = css(b); P.belly = css(bl); P.band = css(shade(b, 0.6)); P.line = css(shade(b, 0.4));
      P.spine = css(mixc(shade(b, 0.5), [120, 20, 30], k*0.65)); P.frill = css(mixc([96, 176, 156], [176, 32, 52], k), 0.6);
      P.horn = css(mixc([206, 196, 166], [96, 86, 86], k)); P.teeth = '#f2ecd8'; P.mouth = '#3a0608';
      P.eyeC = '#ff3b2f'; P.eyeG = '255,59,47'; P.scar = css([230, 220, 200], 0.6); P.burst = css(mixc(b, [180, 40, 40], 0.4));
      break;
    }
    case 'guardian': {
      const st = mixc([58, 80, 120], [40, 54, 90], k*0.5);
      P.body = css(st); P.plate = css(mixc(st, [150, 180, 220], 0.2)); P.dark = css(shade(st, 0.6)); P.line = css(shade(st, 0.4));
      P.trim = '#c99a52'; P.trimHi = '#f0c878'; P.rune = '#7ff4ff'; P.runeG = '90,240,255'; P.eyeG = '90,240,255';
      P.burst = '#7ff4ff';
      break;
    }
    case 'mimic': {
      const c = hex(m.chest);
      P.chest = m.chest; P.chestD = css(shade(c, 0.55)); P.gold = '#ffcf3a'; P.maw = '#2e030a'; P.throat = '#120004';
      P.teeth = '#f4ead0'; P.tongue = '#d4486c'; P.leg = css(mixc(c, [70, 20, 34], 0.55)); P.eyeC = '#ffd060'; P.eyeG = '255,90,58';
      P.weed = 'rgba(86,146,92,.85)'; P.burst = '#ffcf3a';
      break;
    }
    case 'urchin': {
      const c = L < 2 ? [58, 26, 74] : L < 4 ? [70, 22, 30] : [36, 30, 48];
      P.body = css(c); P.spine = css(shade(c, 0.7)); P.tip = css(mixc(c, [255, 200, 240], 0.55)); P.hi = 'rgba(255,255,255,.18)'; P.burst = css(mixc(c, [200, 120, 220], 0.4));
      break;
    }
    case 'mine': P.body = '#3b3630'; P.rust = '#7a4e2c'; P.horn = '#58524a'; P.cap = '#9a8e7a'; P.chain = 'rgba(60,56,50,.85)'; P.burst = '#ffb03a'; break;
    case 'octopus': {
      m.realRGB = mixc([212, 98, 66], [132, 30, 66], k); m.spotRGB = mixc(m.realRGB, [255, 206, 156], 0.38);
      P.eye = '#ffcf3a'; P.eyeG = '255,207,58'; P.sucker = 'rgba(255,226,206,.85)'; P.burst = css(m.realRGB);
      break;
    }
  }
  return P;
}
const FLASH = new Proxy({}, {get: () => '#ffffff'});

// ---------- üretim ----------
function chestColor(L){ for (const tr of LAYERS[L].items) for (const it of tr) if (it.s === 'chest') return it.c; return '#7a4a22'; }
function itemColor(L, s, def){ for (const tr of LAYERS[L].items) for (const it of tr) if (it.s === s) return it.c; return def; }
function makeScars(m, n, x0, x1, y0, y1){
  const out = [];
  for (let i = 0; i < n; i++) {
    const cx = rnd(x0, x1), cy = rnd(y0, y1), a = rnd(-1.1, 1.1) + (Math.random() < 0.5 ? 0 : 0.9), l = rnd(5, 11);
    out.push([cx - Math.cos(a)*l/2, cy - Math.sin(a)*l/2, cx + Math.cos(a)*l/2, cy + Math.sin(a)*l/2]);
  }
  return out;
}
function make(t, L, x, y, o){
  o = o || {};
  L = clamp(L|0, 0, NL - 1);
  let size = o.size || 1;
  if (!o.size && GIANT[t] && L >= GIANT[t][0] && Math.random() < GIANT[t][1]*(1 + 0.25*(L - GIANT[t][0]))) size = t === 'jelly' ? rnd(1.8, 2.3) : rnd(1.4, 1.75);
  const M = MON[t], sav = clamp(L/10, 0, 1);
  const hp = M.hp*(1 + 0.35*L)*(size > 1 ? 1.6 : 1)*(o.hpMul || 1);
  const m = {t, L, x, y, vx:0, vy:0, hp, maxHp:hp, size, dead:false,
    sc:size*(1 + 0.03*L)*(VIS[t] || 1), sav, seed:Math.random(), hx:x, hy:y, ph:rnd(0, TAU), iph:rnd(0, 6.28),
    s:'idle', st:0, cd:0, stun:0, sImm:0, sAcc:0, flash:0, sq:0, hitT:0, mem:0, kx:0, ky:0, lost:0,
    face:Math.random() < 0.5 ? -1 : 1, tilt:0, ang:Math.random() < 0.5 ? 0 : Math.PI, fy:1, jaw:0,
    ox:x, oy:y, fa:1, fb:0, fc:0, fd:1, hidden:false, rv:1, pmx:null, pmy:null,
    keeper:!!o.keeper, ignoreSafe:!!o.ignoreSafe, force:!!o.hunt, dx:0, dy:0, dd:1e9, nT:3 + Math.round(sav*5)};
  if (t === 'mimic') m.chest = o.chest || chestColor(L);
  m.pal = palette(t, L, m);
  const nScar = L >= 3 ? Math.floor(sav*3.2 + hsh(m.seed*7)*1.3 + (size > 1 ? 1 : 0)) : 0;
  switch (t) {
    case 'jelly': m.vx = rnd(-14, 14); m.dvx = m.vx || 8; m.pt = rnd(0, 2); m.pulse = 0; m.nTent = 6 + Math.round(sav*6) + (size > 1 ? 4 : 0); break;
    case 'eel': {
      m.side = o.side != null ? o.side : (x > WORLD_W/2 ? 1 : 0); m.dir = m.side ? -1 : 1;
      m.hx = x; m.hy = y; m.ext = 12; m.aim = 0; m.tgt = 40; m.aimT = 0;
      m.x = m.hx + m.dir*18; m.y = y; m.nT = 4 + Math.round(sav*3);
      m.spots = Array.from({length:7}, () => [Math.random(), rnd(-0.6, 0.6)]);
      break;
    }
    case 'shark': m.torn = L >= 4 && m.seed > 0.45; m.scars = makeScars(m, nScar, -18, 22, -8, 5); m.nT = 6 + Math.round(sav*4); m.pd = m.face; break;
    case 'angler':
      m.scars = makeScars(m, Math.max(0, nScar - 1), -14, 8, -13, 6); m.nT = 4 + Math.round(sav*4);
      m.spk = Array.from({length:7}, () => [rnd(-14, 12), rnd(-12, 8), rnd(0.8, 1.8)]);
      if (L >= 4) { m.lureS = m.seed < 0.5 ? 'pearl' : 'gem'; m.lureC = m.lureS === 'pearl' ? itemColor(L, 'pearl', '#f4f1ff') : itemColor(L, 'gem', '#3fe0a0'); }
      break;
    case 'viper': m.lead = m; m.offx = 0; m.offy = 0; break;
    case 'squid':
      m.inks = []; m.inked = false; m.reach = 0; m.spread = 0; m.jet = 0; m.jt = rnd(0, 2); m.tl = 26; m.tlT = 40;
      m.spk = Array.from({length:9}, () => [rnd(-40, -4), rnd(-7, 7), rnd(1.2, 2.6)]);
      m.scars = makeScars(m, nScar, -36, -8, -6, 6);
      break;
    case 'serpent': {
      const n = 16 + Math.round(sav*8) + (size > 1 ? 4 : 0), gap = 11*m.sc;
      m.ang = Math.random() < 0.5 ? 0 : Math.PI; m.spd = 0; m.gap = gap;
      m.seg = Array.from({length:n}, (_, i) => ({x:x - Math.cos(m.ang)*gap*(i + 1), y:y}));
      m.scars = makeScars(m, nScar, -4, 22, -8, 1); m.nT = 6 + Math.round(sav*4);
      break;
    }
    case 'guardian': m.orbs = []; m.rune = 0.5; m.glyph = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 3); break;
    case 'mimic': m.hidden = !o.hunt; m.rv = m.hidden ? 0 : 1; m.s = m.hidden ? 'hide' : 'hunt'; m.open = m.hidden ? 0 : 0.6; m.walk = 0; m.tw = rnd(3, 8); m.twA = 0; m.nT = 6 + Math.round(sav*3); break;
    case 'urchin': {
      m.anch = o.anchor || 'L'; m.dir = m.anch === 'R' ? -1 : 1;
      m.balls = [];
      const nb = 2 + Math.round(Math.random()*2);
      for (let i = 0; i < nb; i++) m.balls.push([(i === 0 ? 0 : rnd(-12, 12)), (i === 0 ? 0 : rnd(-16, 16)), i === 0 ? 1 : rnd(0.6, 0.85)]);
      if (m.anch !== 'F') for (const b of m.balls) b[0] = Math.abs(b[0])*m.dir;
      else for (const b of m.balls) b[1] = -Math.abs(b[1])*0.5;
      m.hx = x; m.hy = y;
      break;
    }
    case 'mine': m.hx = x; m.hy = y; m.chain = 70 + Math.random()*70; break;
    case 'octopus': {
      m.anch = o.anchor || (x > WORLD_W/2 ? 'R' : 'L'); m.li = o.li || 0;
      if (m.anch === 'F') { m.nx = 0; m.ny = -1; } else if (m.anch === 'L') { m.nx = 1; m.ny = 0; } else { m.nx = -1; m.ny = 0; }
      m.bx = x; m.by = y; m.along = m.anch === 'F' ? x : y; m.home = m.along;
      m.hidden = !o.hunt; m.rv = m.hidden ? 0 : 1; m.s = m.hidden ? 'hide' : 'grab'; m.reach = 0; m.tw = rnd(3, 9); m.twA = 0; m.squeeze = 0;
      m.dla = -Math.PI/2; m.dll = 40; m.cvx = rnd(-8, 8); m.camo = [70, 64, 58];
      m.spk = [];
      for (let i = 0; i < 9; i++) { const fy = rnd(0.12, 0.8), lim = Math.sqrt(1 - fy*fy)*0.85; m.spk.push([rnd(-lim, lim), fy, rnd(1.2, 2.6)]); }
      m.x = m.bx + m.nx*9*m.sc; m.y = m.by + m.ny*9*m.sc;
      break;
    }
  }
  if (!ANCHORED[t]) {
    const b = DG.U.boundsAt(m.y);
    if (b[1] > b[0]) m.x = clamp(m.x, b[0] + 6, b[1] - 6);
  }
  pose0(m);
  return m;
}
function pose0(m){
  m.ox = m.x; m.oy = m.y;
  if (m.t === 'mimic' && m.hidden) setXf(m, 0, 1, 1);
  else if (m.t === 'octopus') { m.ox = m.bx; m.oy = m.by; setXf(m, Math.atan2(m.nx, -m.ny), m.sc, m.sc); }
  else if (m.t === 'eel') setXf(m, m.dir > 0 ? 0 : Math.PI, m.sc, m.sc*m.dir);
  else if (m.t === 'squid' || m.t === 'serpent') setXf(m, m.ang, m.sc, m.sc*(Math.cos(m.ang) >= 0 ? 1 : -1));
  else if (m.t === 'jelly') setXf(m, 0, m.sc, m.sc);
  else setXf(m, 0, m.face*m.sc, m.sc);
}

// ---------- yerleştirme ----------
function blocked(x, y, r){
  if (Math.abs(x - BOAT_X) < SHAFT_HALF - r*0.3) return false;
  const LT = DG.U.LTOP, L = DG.U.layerOf(y);
  for (let i = L; i <= L + 1; i++) if (i >= 1 && i < NL && Math.abs(y - LT[i]) < LEDGE_HALF + r*0.6) return true;
  return false;
}
function stationY(y){
  const tier = DG.S.save.tier, LT = DG.U.LTOP, L = DG.U.layerOf(y);
  let best = 0, bd = Math.abs(y);
  for (let s = Math.max(1, L); s <= Math.min(tier, L + 1); s++) { const d = Math.abs(y - LT[s]); if (d < bd) { bd = d; best = LT[s]; } }
  return best;
}
const ledgeTop = (x, i) => DG.U.LTOP[i] - LEDGE_HALF + Math.sin(x*0.05 + i)*4 + 1;
function openSpot(L, f0, f1, pad){
  const U = DG.U, top = U.LTOP[L], h = U.LH(L);
  for (let k = 0; k < 10; k++) {
    const y = clamp(top + rnd(f0, f1)*h, top + 110, top + h - 110), b = U.boundsAt(y);
    if (b[1] - b[0] < 2*pad + 10) continue;
    const x = rnd(b[0] + pad, b[1] - pad);
    if (!safeGen(x, y) && !blocked(x, y, 30)) return [x, y];
  }
  return null;
}
function placeOcto(L, f0, f1){
  const U = DG.U;
  for (let k = 0; k < 10; k++) {
    if (L + 1 < NL && Math.random() < 0.35) {
      const i = L + 1, side = Math.random() < 0.5 ? 0 : 1, w = U.wallW(U.LTOP[i] - 40, side);
      const lo = side ? BOAT_X + SHAFT_HALF + 50 : w + 50, hi = side ? WORLD_W - w - 50 : BOAT_X - SHAFT_HALF - 50;
      if (hi <= lo) continue;
      const bx = rnd(lo, hi), by = ledgeTop(bx, i);
      if (safeGen(bx, by - 24)) continue;
      return make('octopus', L, bx, by, {anchor:'F', li:i});
    }
    const top = U.LTOP[L], h = U.LH(L), y = clamp(top + rnd(f0, f1)*h, top + 130, top + h - 130), side = Math.random() < 0.5 ? 0 : 1;
    const bx = side ? WORLD_W - U.wallW(y, 1) + 1 : U.wallW(y, 0) - 1;
    if (safeGen(bx + (side ? -20 : 20), y)) continue;
    return make('octopus', L, bx, y, {anchor:side ? 'R' : 'L'});
  }
  return null;
}
function place(t, L, f0, f1){
  const U = DG.U;
  if (t === 'eel') {
    for (let k = 0; k < 10; k++) {
      const top = U.LTOP[L], h = U.LH(L), y = clamp(top + rnd(f0, f1)*h, top + 100, top + h - 100), side = Math.random() < 0.5 ? 0 : 1;
      const hx = side ? WORLD_W - U.wallW(y, 1) + 3 : U.wallW(y, 0) - 3;
      if (!safeGen(hx + (side ? -24 : 24), y)) return make('eel', L, hx, y, {side});
    }
    return null;
  }
  if (t === 'octopus') return placeOcto(L, f0, f1);
  if (t === 'urchin') return placeUrchin(L, f0, f1);
  if (t === 'mine') { const p = openSpot(L, f0, f1, 70); return p && make('mine', L, p[0], p[1]); }
  if (t === 'mimic') { const p = openSpot(L, Math.max(f0, 0.5), Math.max(f1, 0.55), 22) || openSpot(L, f0, f1, 22); return p && make('mimic', L, p[0], p[1]); }
  const p = openSpot(L, f0, f1, 40);
  return p && make(t, L, p[0], p[1]);
}
// Deniz kestanesi kümesi: duvar dibine ya da alttaki rafın üstüne yapışık.
function placeUrchin(L, f0, f1){
  const U = DG.U;
  for (let k = 0; k < 10; k++) {
    if (L + 1 < NL && Math.random() < 0.25) {
      const i = L + 1, side = Math.random() < 0.5 ? 0 : 1, w = U.wallW(U.LTOP[i] - 40, side);
      const lo = side ? BOAT_X + SHAFT_HALF + 40 : w + 40, hi = side ? WORLD_W - w - 40 : BOAT_X - SHAFT_HALF - 40;
      if (hi <= lo) continue;
      const bx = rnd(lo, hi), by = ledgeTop(bx, i) - 9;
      if (safeGen(bx, by - 20)) continue;
      return make('urchin', L, bx, by, {anchor:'F'});
    }
    const top = U.LTOP[L], h = U.LH(L), y = clamp(top + rnd(f0, f1)*h, top + 120, top + h - 120), side = Math.random() < 0.5 ? 0 : 1;
    const bx = side ? WORLD_W - U.wallW(y, 1) - 7 : U.wallW(y, 0) + 7;
    if (safeGen(bx, y) || blocked(bx, y, 30)) continue;
    return make('urchin', L, bx, y, {anchor:side ? 'R' : 'L'});
  }
  return null;
}
// Denizanası perdesi: katı enlemesine kesen, aralıkları dar bir sıra. Aralıklar süzüldükçe açılıp kapanır.
function curtain(L, f0, f1, out){
  const U = DG.U, top = U.LTOP[L], h = U.LH(L);
  for (let k = 0; k < 8; k++) {
    const y = clamp(top + rnd(f0, f1)*h, top + 260, top + h - 260);
    if (safeGen(BOAT_X, y) || safeGen(BOAT_X, y - 120) || safeGen(BOAT_X, y + 120)) continue;
    const b = U.boundsAt(y), lo = b[0] + 36, hi = b[1] - 36;
    if (hi - lo < 200) continue;
    const n = Math.max(4, Math.round((hi - lo)/140)), step = (hi - lo)/(n - 1);
    for (let i = 0; i < n; i++) {
      const m = make('jelly', L, lo + i*step + rnd(-14, 14), y + rnd(-26, 26));
      m.dvx = rnd(-6, 6) || 4; m.curtain = true; out.push(m);
    }
    return;
  }
}
function strongest(L){
  let best = 'shark', bd = -1;
  for (const [t] of LAYERS[L].mons) { if (t === 'jelly' || t === 'eel' || t === 'mimic' || t === 'octopus') continue; if (MON[t].dmg > bd) { bd = MON[t].dmg; best = t; } }
  return best;
}
// Katın eseri yanında bekçiler: ilk katlarda 2 normal boy, sonra biri dev; 5. kattan sonra 3 tane.
// Eserin yeri kata göre sabittir (DG.U.relicPos), bekçiler eser alınmış olsa da listede kalır.
function keepers(L, out){
  const U = DG.U;
  const rel = U.relicPos ? U.relicPos(L) : null;
  if (!rel) return;
  const t = L === NL - 1 ? 'guardian' : strongest(L);
  const n = L < 5 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 10; k++) {
      const x = rel.x + rnd(-170, 170), y = rel.y - rnd(110, 260), b = U.boundsAt(y);
      if (x < b[0] + 30 || x > b[1] - 30 || safeGen(x, y) || blocked(x, y, 40)) continue;
      const giant = L >= 2 && i === 0;
      out.push(make(t, L, x, y, {size:giant ? rnd(1.3, 1.45) : 1, keeper:true, hpMul:L < 2 ? 1.25 : 1}));
      break;
    }
  }
}

// ---------- algı ve hareket ----------
// Hız katla dalgıçla aynı oranda büyür (core speedAt: 1.12^kat).
const spdOf = m => (MON[m.t].spd || 0.6)*140*Math.pow(1.12, m.L)*(1 + 0.03*m.L)*(m.size > 1 ? 1.08 : 1);
// Sezme menzili: genel %20 daha geniş (ilk katlar da tehlikeli olsun), katla hafifçe artar.
const aggroOf = m => (MON[m.t].aggro || 200)*1.2*(1 + 0.04*m.L)*(m.keeper ? 1.3 : 1);
function sense(m){ const D = DG.S.diver; m.dx = D.x - m.x; m.dy = D.y - m.y; m.dd = Math.hypot(m.dx, m.dy) || 1; }
const canHunt = m => F.hunt && (m.ignoreSafe || F.boss || !F.dSafe);
const sameZone = m => F.boss || m.force || DG.U.layerOf(m.y) === F.dL || Math.abs(m.dy) < 140;
// Öfke (mem): vurulan canavar seni daha uzaktan da kovalar ama sonsuza kadar değil.
const wantsHunt = (m, r) => canHunt(m) && sameZone(m) && (m.force || m.dd < r || (m.mem > 0 && m.dd < r*3));
const lost = (m, r) => !canHunt(m) || !sameZone(m) || (!m.force && m.dd > r*1.8 && (m.mem <= 0 || m.dd > r*3)) || (m.keeper && Math.hypot(m.x - m.hx, m.y - m.hy) > 650);
function nearFlare(m){
  for (const f of F.flares) {
    if (!f) continue;
    const dx = m.x - f.x, dy = m.y - f.y, d = Math.hypot(dx, dy);
    if (d < 300) { m.fx = dx/(d || 1); m.fy = dy/(d || 1); return true; }
  }
  return false;
}
function go(m, s, t){ m.s = s; m.st = t || 0; m.pmx = null; }
function steer(m, tx, ty, turn, dt){ const k = Math.min(1, turn*dt); m.vx += (tx - m.vx)*k; m.vy += (ty - m.vy)*k; }
function avoidSafe(m, sp){
  if (m.ignoreSafe || F.boss) return;
  const sy = stationY(m.y), dx = m.x - BOAT_X, dy = m.y - sy, d = Math.hypot(dx, dy) || 1, R = SAFE_R + 120;
  if (d < R) { const k = (R - d)/120*1.6; m.tx += dx/d*sp*k; m.ty += dy/d*sp*k; }
}
function swim(m, tx, ty, turn, dt, sp){ m.tx = tx; m.ty = ty; avoidSafe(m, sp); steer(m, m.tx, m.ty, turn, dt); move(m, dt); }
function move(m, dt){
  const U = DG.U, r = MON[m.t].r*m.sc*0.55;
  m.wallHit = 0; m.ledgeHit = 0;
  let nx = m.x + (m.vx + m.kx)*dt, ny = m.y + (m.vy + m.ky)*dt;
  if (!m.hidden) {
    // sürü içinde üst üste binmesinler
    const r1 = MON[m.t].r*m.sc;
    for (const o of F.near) {
      if (o === m || o.dead) continue;
      const dx = nx - o.x; if (dx > 120 || dx < -120) continue;
      const dy = ny - o.y; if (dy > 120 || dy < -120) continue;
      const R = (r1 + MON[o.t].r*o.sc)*0.8, d2 = dx*dx + dy*dy;
      if (d2 < R*R && d2 > 0.01) { const d = Math.sqrt(d2), k = (R - d)/d*0.22; nx += dx*k; ny += dy*k; }
    }
  }
  ny = clamp(ny, 40, DG.S.worldH - 30);
  const b = U.boundsAt(ny);
  let lo = b[0] + r*0.4, hi = b[1] - r*0.4;
  if (lo > hi) lo = hi = (lo + hi)/2;
  if (nx < lo) { nx = lo; if (m.vx < 0) m.vx *= -0.4; if (m.kx < 0) m.kx = 0; m.wallHit = 1; }
  else if (nx > hi) { nx = hi; if (m.vx > 0) m.vx *= -0.4; if (m.kx > 0) m.kx = 0; m.wallHit = 1; }
  if (blocked(nx, ny, r)) {
    m.ledgeHit = 1;
    if (!blocked(nx, m.y, r)) { ny = m.y; m.vy *= -0.3; m.ky = 0; }
    else if (!blocked(m.x, ny, r)) { nx = m.x; m.vx *= -0.3; m.kx = 0; }
    else { nx = m.x; ny = m.y; }
  }
  if (!m.ignoreSafe && !F.boss) {
    const sy = stationY(ny), dx = nx - BOAT_X, dy = ny - sy, d = Math.hypot(dx, dy), R = SAFE_R + 2;
    if (d < R) {
      const pdx = m.x - BOAT_X, pdy = m.y - sy, pd = Math.hypot(pdx, pdy) || 1;
      if (pd >= R - 1) {
        // dışarıdaydı: sınırda kay, içeri girme
        const ux = dx/(d || 1), uy = dy/(d || 1);
        nx = BOAT_X + ux*R; ny = sy + uy*R;
        const vn = m.vx*ux + m.vy*uy; if (vn < 0) { m.vx -= vn*ux; m.vy -= vn*uy; }
        if (blocked(nx, ny, r)) { nx = m.x; ny = m.y; }
      } else {
        // içerideydi: dışarı kaç
        const sp = Math.max(120, Math.hypot(m.vx, m.vy));
        m.vx = pdx/pd*sp; m.vy = pdy/pd*sp;
      }
    }
  }
  m.x = nx; m.y = ny;
}

// ---------- ısırık ----------
function canBite(m, blind){
  const S = DG.S;
  return S.playing && !S.riding && m.cd <= 0 && m.stun <= 0 && (blind || !F.camo) && (m.ignoreSafe || F.boss || !F.dSafe);
}
function doBite(m, mult){
  const core = DG.core, D = DG.S.diver;
  m.cd = CD[m.t]; m.chomp = 1;
  const dealt = core.hurt(core.dmgFor(m)*(mult || 1), MON[m.t].n, m);
  if (dealt > 0) {
    if (m.t === 'squid') { core.ink(2.6); core.slow(1.8); inkCloud(m); go(m, 'flee', 1.3); }
    else if (m.t === 'octopus') { core.slow(2.4); m.squeeze = 0.6; }
    else if (m.t === 'jelly') { core.slow(0.8); if (DG.fx && DG.fx.spark) DG.fx.spark(D.x, D.y); }
    else if (m.t === 'angler' && m.lureS && DG.S.darkAlpha > 0.5 && !hintLure) { hintLure = true; core.msg('O inci bir yemdi! Karanlıkta parlayan her şey hazine değil.', 'var(--danger)'); }
  }
  return dealt;
}
// Yerel bir noktanın (ağız) önceki kareden bu kareye süpürdüğü çizgi dalgıca değdi mi?
function biteAt(m, lx, ly, rad, mult){
  const D = DG.S.diver;
  const x = m.x + m.fa*lx + m.fc*ly, y = m.y + m.fb*lx + m.fd*ly;
  const px = m.pmx == null ? x : m.pmx, py = m.pmy == null ? y : m.pmy;
  m.pmx = x; m.pmy = y;
  if (!canBite(m)) return false;
  if (segDist(D.x, D.y, px, py, x, y) < rad*m.sc + 11) { doBite(m, mult); return true; }
  return false;
}
function growl(m, force){
  const S = DG.S; if (!force && S.t - growlT < 1.1) return;
  const sy = m.y - S.cam.y; if (sy < -80 || sy > S.H + 80) return;
  growlT = S.t; if (DG.core.sfx) DG.core.sfx('growl');
}

// ---------- yapay zekâ: türlere göre ----------
function aiJelly(m, dt){
  sense(m);
  const sp = spdOf(m);
  m.pt -= dt;
  if (m.pt <= 0) { m.pt = rnd(1.5, 2.5); m.pulse = 1; m.vy -= 30 + 8*m.sav; }
  m.pulse = Math.max(0, m.pulse - dt*1.3);
  let ax = m.dvx;
  if (m.L >= 6 && wantsHunt(m, 240)) ax = Math.sign(m.dx)*sp*0.22;    // derin denizanası avına süzülür
  else if (wantsHunt(m, 170)) { ax = Math.sign(m.dx)*sp*0.25; m.hy += clamp(m.dy, -1, 1)*14*dt; }   // sığdakiler de yakına gelene süzülür
  if (Math.abs(m.x - m.hx) > 240) m.dvx = -Math.sign(m.x - m.hx)*Math.abs(m.dvx);
  m.vx += (ax - m.vx)*Math.min(1, dt*0.9);
  m.vy += (10 + (m.hy - m.y)*0.04)*dt; m.vy *= Math.exp(-dt*0.8);
  m.tx = m.vx; m.ty = m.vy; avoidSafe(m, 40); m.vx = m.tx; m.vy = m.ty;
  move(m, dt); if (m.wallHit) m.dvx = -m.dvx;
  if (canBite(m, true)) {
    const D = DG.S.diver, r = MON.jelly.r*m.sc;
    if (segDist(D.x, D.y, m.x, m.y - r*0.3, m.x, m.y + r*1.7) < r*0.75 + 10) doBite(m, 1);
  }
  setXf(m, clamp(m.vx/80, -0.3, 0.3) + Math.sin(m.ph*1.3)*0.05 + wob(m), m.sc*(1 + 0.2*m.sq), m.sc*(1 - 0.15*m.sq));
  m.ox = m.x; m.oy = m.y;
}

// Deliğine çekilmiş ve dalgıca uzanamayan yılan balığı zararsızdır (silahların otomatik nişanı ona mermi harcamaz).
const eelReach = m => (150 + 9*m.L)*Math.min(1.6, m.sc);
function lurking(m){
  // Mayın hiçbir zaman otomatik hedef olmaz (yakında vurmak dalgıcı da yakar); kestane sadece dibindeyken.
  if (m && m.t === 'mine') return !m.dead;
  if (m && m.t === 'urchin') return !m.dead && !(m.dd < 150);
  if (!m || m.t !== 'eel' || m.dead || (m.s !== 'idle' && m.s !== 'back') || !(m.ext < 32)) return false;
  const D = DG.S.diver, ox = (D.x - m.hx)*m.dir, oy = D.y - m.hy;
  return !(ox > -36 && ox < eelReach(m) + 40 && Math.abs(oy) < 100 + 20*m.sc);
}
function aiEel(m, dt){
  const D = DG.S.diver, dir = m.dir, ox = (D.x - m.hx)*dir, oy = D.y - m.hy;
  m.dx = D.x - m.x; m.dy = D.y - m.y; m.dd = Math.hypot(m.dx, m.dy) || 1;
  const reach = eelReach(m), fl = nearFlare(m);
  m.st -= dt;
  let ext = 14 + Math.sin(m.ph*0.8 + m.seed*9)*4, aim = Math.sin(m.ph*0.6)*0.15, jaw = 0.2 + 0.16*Math.sin(m.ph*2.4), k = 3;
  switch (m.s) {
    case 'idle':
      if (fl) { ext = 0; break; }
      if (canBite(m) && F.hunt && ox > -6 && ox < reach && Math.abs(oy) < 70 + 20*m.sc && sameZone(m)) go(m, 'tell', 0.3 - 0.12*m.sav);
      break;
    case 'tell':
      ext = 2; aim = clamp(Math.atan2(oy, Math.max(10, ox)), -0.75, 0.75); jaw = 0.55; k = 10;
      if (m.st <= 0) { go(m, 'strike', 0.34); m.tgt = clamp(Math.hypot(ox, oy) + 16, 40, reach); m.aimT = aim; }
      break;
    case 'strike':
      ext = m.tgt; aim = m.aimT; jaw = 1; k = 18;
      if (biteAt(m, 13, 1, 9) || m.st <= 0) go(m, 'hold', 0.28);
      break;
    case 'hold': ext = m.tgt; aim = m.aimT; jaw = 0.75; k = 6; if (m.st <= 0) go(m, 'back', 0.7); break;
    case 'back': k = 3.5; jaw = 0.3; if (m.st <= 0) { go(m, 'idle', 0); if (m.cd < 0.5) m.cd = 0.5; } break;
  }
  m.ext += (ext - m.ext)*Math.min(1, dt*k);
  m.aim += (aim - m.aim)*Math.min(1, dt*(k > 8 ? 14 : 4));
  m.jaw += (jaw - m.jaw)*Math.min(1, dt*12);
  m.x = m.hx + dir*Math.cos(m.aim)*(m.ext + 6); m.y = m.hy + Math.sin(m.aim)*(m.ext + 6);
  setXf(m, (dir > 0 ? m.aim : Math.PI - m.aim) + wob(m), m.sc*(1 + 0.2*m.sq), m.sc*dir*(1 - 0.15*m.sq));
  m.ox = m.x; m.oy = m.y;
}

function aiShark(m, dt){
  sense(m);
  const sp = spdOf(m), ag = aggroOf(m), fl = nearFlare(m);
  m.st -= dt;
  if (fl && m.s !== 'flee') go(m, 'flee', 1.5);
  let tx = 0, ty = 0, turn = 2.2, faceTo = 0, tiltTo = null, jaw = 0;
  switch (m.s) {
    case 'flee': tx = m.fx*sp*1.4; ty = m.fy*sp*1.4; if (m.st <= 0 && !fl) go(m, 'idle', 0); break;
    case 'idle':
      if ((m.x - m.hx)*m.pd > 220 || m.wallHit) m.pd = -m.pd;
      tx = m.pd*sp*0.45; ty = (m.hy - m.y)*0.5 + Math.sin(m.ph*0.6 + m.seed*9)*sp*0.12;
      if (wantsHunt(m, ag)) { go(m, 'hunt', rnd(1, 2)*(1 - 0.3*m.sav)); growl(m); }
      break;
    case 'hunt': {
      // yanından dolanarak yaklaş, sonra hücum
      const side = m.seed > 0.5 ? 1 : -1, orb = clamp(m.dd*0.5, 0, 120);
      const gx = m.dx - m.dy/m.dd*orb*side, gy = m.dy + m.dx/m.dd*orb*side, gl = Math.hypot(gx, gy) || 1;
      tx = gx/gl*sp; ty = gy/gl*sp;
      if (m.st <= 0 && m.dd < 300 && m.cd <= 0) go(m, 'tell', 0.5 - 0.15*m.sav);
      if (lost(m, ag)) go(m, 'idle', 0);
      break;
    }
    case 'tell':
      // geri çekilip titrer, çene açılır, göz zarı kapanır: hücum işareti
      tx = -m.dx/m.dd*sp*0.25; ty = -m.dy/m.dd*sp*0.25; turn = 5; faceTo = m.dx >= 0 ? 1 : -1;
      tiltTo = clamp(Math.atan2(m.dy, Math.abs(m.dx)), -0.6, 0.6); jaw = 1;
      if (m.st <= 0) {
        const D = DG.S.diver, lead = 0.15 + 0.2*m.sav, ax = m.dx + D.vx*lead, ay = m.dy + D.vy*lead, al = Math.hypot(ax, ay) || 1;
        m.vx = ax/al*sp*2.7; m.vy = ay/al*sp*2.7;
        go(m, 'charge', clamp(al/(sp*2.7) + 0.25, 0.35, 0.9));
      }
      break;
    case 'charge':
      tx = m.vx; ty = m.vy; turn = 0.5; jaw = 1;
      if (m.st <= 0) go(m, 'recover', 0.7);
      break;
    case 'recover':
      tx = m.vx*0.4; ty = m.vy*0.4; turn = 1.6;
      if (m.st <= 0) go(m, 'hunt', rnd(1.2, 2.4)*(1 - 0.35*m.sav));
      break;
  }
  if (m.s === 'idle' && m.keeper && Math.hypot(m.x - m.hx, m.y - m.hy) > 300) { tx = (m.hx - m.x)*0.8; ty = (m.hy - m.y)*0.8; }
  swim(m, tx, ty, turn, dt, sp);
  m.jaw += (jaw - m.jaw)*Math.min(1, dt*10);
  poseFish(m, dt, faceTo, tiltTo);
  if (m.s === 'charge' && biteAt(m, 34, 5, 13)) { go(m, 'recover', 0.8); m.vx *= 0.5; m.vy *= 0.5; }
}

function lureLocal(m){ return [27 + Math.sin(m.ph*1.7)*2.5, -27 + Math.cos(m.ph*2.1)*2]; }
function aiAngler(m, dt){
  sense(m);
  const sp = spdOf(m), ag = aggroOf(m)*(m.L >= 4 ? 0.6 : 1), fl = nearFlare(m), D = DG.S.diver;
  const ll = lureLocal(m), lp = wpt(m, ll[0], ll[1]), ld = Math.hypot(D.x - lp[0], D.y - lp[1]);
  m.st -= dt;
  if (fl && m.s !== 'flee') go(m, 'flee', 1.6);
  let tx = 0, ty = 0, turn = 1.6, faceTo = 0, jaw = 0.06;
  switch (m.s) {
    case 'flee': tx = m.fx*sp*1.5; ty = m.fy*sp*1.5; if (m.st <= 0 && !fl) go(m, 'idle', 0); break;
    case 'idle':
      tx = Math.sin(m.ph*0.3 + m.seed*7)*sp*0.25 + (m.hx - m.x)*0.15; ty = Math.sin(m.ph*0.45)*sp*0.12 + (m.hy - m.y)*0.2;
      if (wantsHunt(m, ag)) go(m, 'stalk', 0);
      break;
    case 'stalk': {
      // yemi dalgıca doğru tutarak sinsice yaklaş
      faceTo = m.dx >= 0 ? 1 : -1;
      const gx = m.dx - faceTo*34*m.sc, gy = m.dy + 24*m.sc, gl = Math.hypot(gx, gy) || 1;
      const v = Math.min(sp*0.6, gl*2); tx = gx/gl*v; ty = gy/gl*v;
      if ((ld < 64 || m.dd < 80*m.sc) && m.cd <= 0 && canBite(m)) go(m, 'tell', 0.28 - 0.08*m.sav);
      if (lost(m, ag)) go(m, 'idle', 0);
      break;
    }
    case 'tell':
      faceTo = m.dx >= 0 ? 1 : -1; tx = -m.dx/m.dd*sp*0.5; ty = -m.dy/m.dd*sp*0.5; turn = 6; jaw = 1;
      if (m.st <= 0) { m.vx = m.dx/m.dd*sp*4.6; m.vy = m.dy/m.dd*sp*4.6; go(m, 'snap', 0.32); }
      break;
    case 'snap': tx = m.vx; ty = m.vy; turn = 0.4; jaw = 1; if (m.st <= 0) go(m, 'recover', 1.0); break;
    case 'recover': tx = m.vx*0.2; ty = m.vy*0.2; turn = 3; if (m.st <= 0) go(m, wantsHunt(m, ag) ? 'stalk' : 'idle', 0); break;
  }
  swim(m, tx, ty, turn, dt, sp);
  m.jaw += (jaw - m.jaw)*Math.min(1, dt*(jaw > m.jaw ? 16 : 5));
  poseFish(m, dt, faceTo, null);
  if (m.s === 'snap' && biteAt(m, 18, 2, 14)) go(m, 'recover', 1.0);
}

function aiViper(m, dt){
  sense(m);
  const sp = spdOf(m), ag = aggroOf(m), fl = nearFlare(m);
  if (!m.lead || m.lead.dead) m.lead = m;
  const lead = m.lead;
  m.st -= dt;
  if (fl && m.s !== 'flee') go(m, 'flee', 1.3);
  let tx = 0, ty = 0, turn = 4, faceTo = 0, jaw = 0.1;
  const pack = lead !== m && lead.s !== 'idle' && lead.s !== 'flee' && canHunt(m) && sameZone(m);
  switch (m.s) {
    case 'flee': tx = m.fx*sp*1.4; ty = m.fy*sp*1.4; if (m.st <= 0 && !fl) go(m, 'idle', 0); break;
    case 'idle':
      if (lead !== m) {
        const gx = lead.x + m.offx - m.x, gy = lead.y + m.offy - m.y;
        tx = gx*2 + lead.vx; ty = gy*2 + lead.vy;
        const l = Math.hypot(tx, ty); if (l > sp*1.2) { tx *= sp*1.2/l; ty *= sp*1.2/l; }
      } else {
        tx = Math.cos(m.ph*0.4 + m.seed*9)*sp*0.5 + (m.hx - m.x)*0.2; ty = Math.sin(m.ph*0.55 + m.seed*4)*sp*0.2 + (m.hy - m.y)*0.3;
      }
      if (wantsHunt(m, ag) || pack) go(m, 'coil', rnd(0.15, 0.7));
      break;
    case 'coil': {
      // yavaşla, kıvrıl, ağzı aç; sonra fırla
      faceTo = m.dx >= 0 ? 1 : -1; jaw = 0.7;
      const gx = m.dx + m.offx*0.8, gy = m.dy + m.offy*0.8, gl = Math.hypot(gx, gy) || 1;
      tx = gx/gl*sp*0.3; ty = gy/gl*sp*0.3; turn = 5;
      if (m.st <= 0 && m.cd <= 0) {
        const D = DG.S.diver, ax = m.dx + D.vx*0.12, ay = m.dy + D.vy*0.12, al = Math.hypot(ax, ay) || 1;
        m.vx = ax/al*sp*3; m.vy = ay/al*sp*3; go(m, 'dart', 0.26 + Math.min(0.2, m.dd/(sp*6)));
      }
      if (lost(m, ag) && !pack) go(m, 'idle', 0);
      break;
    }
    case 'dart': tx = m.vx; ty = m.vy; turn = 0.3; jaw = 1; if (m.st <= 0) go(m, 'glide', rnd(0.35, 0.6)); break;
    case 'glide': tx = m.vx*0.3; ty = m.vy*0.3; turn = 2.5; if (m.st <= 0) go(m, (wantsHunt(m, ag*1.6) || pack) ? 'coil' : 'idle', rnd(0.3, 0.8)*(1 - 0.3*m.sav)); break;
  }
  swim(m, tx, ty, turn, dt, sp);
  m.jaw += (jaw - m.jaw)*Math.min(1, dt*10);
  poseFish(m, dt, faceTo, null);
  if (m.s === 'dart' && biteAt(m, 13, 1, 7)) go(m, 'glide', 0.5);
}

function inkCloud(m){ m.inks.push({x:m.x, y:m.y, r:8*m.sc, a:0.9, hit:false, sd:Math.random()*9}); if (m.inks.length > 3) m.inks.shift(); }
function aiSquid(m, dt){
  sense(m);
  const sp = spdOf(m), ag = aggroOf(m), fl = nearFlare(m), D = DG.S.diver;
  m.st -= dt; m.jt -= dt; m.jet = Math.max(0, m.jet - dt*2.5);
  if (m.inks.length) {
    for (const c of m.inks) {
      c.r += dt*Math.max(4, 90*m.sc - c.r)*1.4; c.a -= dt*0.26;
      if (!c.hit && DG.S.playing && Math.hypot(D.x - c.x, D.y - c.y) < c.r*0.8) { c.hit = true; DG.core.ink(1.8); }
    }
    if (m.inks[0].a <= 0) m.inks = m.inks.filter(c => c.a > 0);
  }
  if (fl && m.s !== 'flee') go(m, 'flee', 1.4);
  let want = m.ang, imp = 0, ix = 0, iy = 0, drag = 1.4, turn = 5;
  switch (m.s) {
    case 'idle':
      if (m.jt <= 0) { m.jt = rnd(1.6, 2.6); const a = Math.atan2((m.hy - m.y)*0.01 + rnd(-0.6, 0.6), (m.hx - m.x)*0.004 + rnd(-1, 1)); ix = Math.cos(a); iy = Math.sin(a); imp = sp*0.9; }
      if (Math.hypot(m.vx, m.vy) > 10) want = Math.atan2(-m.vy, -m.vx);
      if (wantsHunt(m, ag)) { go(m, 'hunt', 0); m.jt = 0; growl(m); }
      break;
    case 'hunt':
      want = Math.atan2(m.dy, m.dx);
      if (m.jt <= 0) { m.jt = rnd(0.7, 1.0)*(1 - 0.25*m.sav); ix = m.dx/m.dd; iy = m.dy/m.dd; imp = sp*1.5; }
      if (m.dd < 150*m.sc && m.cd <= 0) go(m, 'tell', 0.42 - 0.12*m.sav);
      if (lost(m, ag)) go(m, 'idle', 0);
      break;
    case 'tell': want = Math.atan2(m.dy, m.dx); drag = 4; if (m.st <= 0) { go(m, 'grab', 0.5); m.tlT = clamp(m.dd/m.sc - 6, 40, 150); } break;
    case 'grab': {
      want = Math.atan2(m.dy, m.dx); drag = 4; turn = 1.5;
      if (m.reach > 0.7 && canBite(m)) {
        const a = wpt(m, 12, 0), b = wpt(m, 12 + m.tl, 0);
        if (segDist(D.x, D.y, a[0], a[1], b[0], b[1]) < 12 + 4*m.sc) doBite(m, 1);
      }
      if (m.st <= 0 && m.s === 'grab') go(m, 'recover', 0.8);
      break;
    }
    case 'recover': want = Math.atan2(m.dy, m.dx); drag = 2; if (m.st <= 0) go(m, wantsHunt(m, ag) ? 'hunt' : 'idle', 0); break;
    case 'flee': {
      // manto önde kaç, kollar arkada
      const ax = fl ? m.fx : -m.dx/m.dd, ay = fl ? m.fy : -m.dy/m.dd;
      want = Math.atan2(-ay, -ax);
      if (m.jt <= 0) { m.jt = 0.4; ix = ax; iy = ay; imp = sp*1.8; }
      if (m.st <= 0) go(m, wantsHunt(m, ag) ? 'hunt' : 'idle', 0);
      break;
    }
  }
  if (imp) { m.vx += ix*imp; m.vy += iy*imp; m.jet = 1; }
  m.vx *= Math.exp(-dt*drag); m.vy *= Math.exp(-dt*drag);
  m.tx = m.vx; m.ty = m.vy; avoidSafe(m, sp*0.6); m.vx = m.tx; m.vy = m.ty;
  move(m, dt);
  m.ang = angTo(m.ang, want, dt*turn);
  const grab = m.s === 'grab';
  m.tl += ((grab ? m.tlT : 26) - m.tl)*Math.min(1, dt*(grab ? 14 : 5));
  m.reach += ((grab ? 1 : 0) - m.reach)*Math.min(1, dt*10);
  m.spread += ((m.s === 'tell' || grab) ? 1 - m.spread : -m.spread)*Math.min(1, dt*6);
  poseRot(m, dt);
}

function aiSerpent(m, dt){
  sense(m);
  const sp = spdOf(m), ag = aggroOf(m), fl = nearFlare(m), U = DG.U;
  m.st -= dt;
  if (fl && m.s !== 'flee') go(m, 'flee', 1.8);
  const toD = Math.atan2(m.dy, m.dx);
  let want = m.ang, speed = sp*0.5, rate = 1.6, jaw = 0.08;
  switch (m.s) {
    case 'flee': want = Math.atan2(m.fy, m.fx); speed = sp*1.3; rate = 3; if (m.st <= 0 && !fl) go(m, 'idle', 0); break;
    case 'idle': {
      const px = m.hx + Math.sin(m.ph*0.18 + m.seed*9)*360, py = m.hy + Math.sin(m.ph*0.27 + m.seed*3)*160;
      want = Math.atan2(py - m.y, px - m.x) + Math.sin(m.ph*2)*0.35;
      if (wantsHunt(m, ag)) { go(m, 'hunt', 0); growl(m); }
      break;
    }
    case 'hunt':
      // uzaktan sezer, kıvrılarak yaklaşır
      want = toD + Math.sin(m.ph*3.2)*0.45*(m.dd > 220 ? 1 : 0.35); speed = sp; rate = 2.2 + m.sav;
      if (m.dd < 190*m.sc && Math.abs(wrapA(m.ang - toD)) < 0.6 && m.cd <= 0) go(m, 'tell', 0.42 - 0.12*m.sav);
      if (lost(m, ag)) go(m, 'idle', 0);
      break;
    case 'tell': want = toD; speed = -sp*0.3; rate = 5; jaw = 1; if (m.st <= 0) { go(m, 'strike', 0.42); m.spd = sp*2.8; } break;
    case 'strike': want = toD; speed = sp*2.8; rate = 1.1; jaw = 1; if (m.st <= 0) go(m, 'recover', 0.9); break;
    case 'recover': want = m.ang + (m.seed > 0.5 ? 0.9 : -0.9); speed = sp*0.8; rate = 1.6; if (m.st <= 0) go(m, 'hunt', 0); break;
  }
  if (m.s === 'idle' && m.keeper && Math.hypot(m.x - m.hx, m.y - m.hy) > 320) want = Math.atan2(m.hy - m.y, m.hx - m.x);
  // istasyonlardan ve duvarlardan uzak dur
  if (!m.ignoreSafe && !F.boss) {
    const sy = stationY(m.y), sdx = m.x - BOAT_X, sdy = m.y - sy, sd = Math.hypot(sdx, sdy);
    if (sd < SAFE_R + 150) want = lerpAng(want, Math.atan2(sdy, sdx), clamp((SAFE_R + 150 - sd)/150, 0, 1));
  }
  const b = U.boundsAt(m.y);
  if (m.x - b[0] < 70) want = lerpAng(want, 0, 0.6); else if (b[1] - m.x < 70) want = lerpAng(want, Math.PI, 0.6);
  m.ang = angTo(m.ang, want, rate*dt);
  m.spd += (speed - m.spd)*Math.min(1, dt*4);
  m.vx = Math.cos(m.ang)*m.spd; m.vy = Math.sin(m.ang)*m.spd;
  move(m, dt);
  if (m.wallHit) m.ang = wrapA(Math.PI - m.ang);
  if (m.ledgeHit) m.ang = -m.ang;
  m.jaw += (jaw - m.jaw)*Math.min(1, dt*10);
  // gövde boğumları başı izler
  const gap = m.gap; let px = m.x, py = m.y;
  for (const s of m.seg) {
    const dx = s.x - px, dy = s.y - py, L = Math.hypot(dx, dy) || 1;
    if (L > gap) { s.x = px + dx/L*gap; s.y = py + dy/L*gap; }
    px = s.x; py = s.y;
  }
  poseRot(m, dt);
  if (m.s === 'strike' && biteAt(m, 30, 2, 14)) { go(m, 'recover', 0.9); m.spd *= 0.5; }
}

function aiGuardian(m, dt){
  sense(m);
  const sp = spdOf(m), ag = aggroOf(m), fl = nearFlare(m), D = DG.S.diver;
  m.st -= dt;
  if (m.orbs.length) {
    const S = DG.S;
    for (const o of m.orbs) {
      o.x += o.vx*dt; o.y += o.vy*dt; o.life -= dt;
      const b = DG.U.boundsAt(o.y);
      if (o.x < b[0] - 12 || o.x > b[1] + 12 || blocked(o.x, o.y, 4)) o.life = 0;
      if (o.life > 0 && S.playing && !S.riding && (m.ignoreSafe || F.boss || !F.dSafe) && Math.hypot(D.x - o.x, D.y - o.y) < 18) {
        DG.core.hurt(DG.core.dmgFor(m)*0.6, MON.guardian.n, o); o.life = 0;
        if (DG.fx && DG.fx.burst) DG.fx.burst(o.x, o.y, '#7ff4ff', 10, 180);
      }
    }
    if (m.orbs.some(o => o.life <= 0)) m.orbs = m.orbs.filter(o => o.life > 0);
  }
  if (fl && m.s !== 'flee') go(m, 'flee', 1.2);
  let tx = 0, ty = 0, turn = 2.4, faceTo = 0, rune = 0.5 + 0.12*Math.sin(m.ph*3);
  switch (m.s) {
    case 'flee': tx = m.fx*sp*1.2; ty = m.fy*sp*1.2; if (m.st <= 0 && !fl) go(m, 'idle', 0); break;
    case 'idle': {
      const px = m.hx + Math.sin(m.ph*0.5 + m.seed*6)*140, py = m.hy + Math.sin(m.ph + m.seed*6)*60;
      tx = (px - m.x)*1.2; ty = (py - m.y)*1.2;
      const l = Math.hypot(tx, ty); if (l > sp*0.5) { tx *= sp*0.5/l; ty *= sp*0.5/l; }
      if (wantsHunt(m, ag)) { go(m, 'hunt', rnd(1, 1.8)); growl(m); }
      break;
    }
    case 'hunt': {
      // mesafeyi koru, yörüngede dön
      faceTo = m.dx >= 0 ? 1 : -1;
      const want = 210*Math.min(1.3, m.sc), radial = clamp((m.dd - want)/100, -1, 1), side = m.seed > 0.5 ? 1 : -1;
      tx = m.dx/m.dd*sp*radial - m.dy/m.dd*sp*0.6*side; ty = m.dy/m.dd*sp*radial + m.dx/m.dd*sp*0.6*side;
      if (m.st <= 0 && m.cd <= 0) {
        if (m.dd < 280) go(m, 'tell', 0.6 - 0.15*m.sav);
        else if (m.dd < 440) go(m, 'cast', 0.55);
        else m.st = 0.5;
      }
      if (lost(m, ag)) go(m, 'idle', 0);
      break;
    }
    case 'tell':
      faceTo = m.dx >= 0 ? 1 : -1; tx = 0; ty = 0; turn = 5; rune = 1.6;
      if (m.st <= 0) { m.vx = m.dx/m.dd*sp*3.1; m.vy = m.dy/m.dd*sp*3.1; go(m, 'dash', 0.45); }
      break;
    case 'dash': tx = m.vx; ty = m.vy; turn = 0.4; rune = 1.3; if (m.st <= 0) go(m, 'recover', 0.7); break;
    case 'cast':
      faceTo = m.dx >= 0 ? 1 : -1; tx = m.vx*0.2; ty = m.vy*0.2; turn = 4; rune = 1.25;
      if (m.st <= 0) {
        const p = wpt(m, 34, 0), ov = 230*(1 + 0.04*m.L), ax = D.x + D.vx*0.25 - p[0], ay = D.y + D.vy*0.25 - p[1], al = Math.hypot(ax, ay) || 1;
        m.orbs.push({x:p[0], y:p[1], vx:ax/al*ov, vy:ay/al*ov, life:1.7});
        if (DG.core.sfx) DG.core.sfx('zap');
        go(m, 'hunt', rnd(1.8, 2.8)*(1 - 0.25*m.sav));
      }
      break;
    case 'recover': tx = m.vx*0.3; ty = m.vy*0.3; turn = 2; if (m.st <= 0) go(m, 'hunt', rnd(1.6, 2.6)); break;
  }
  if (m.s === 'idle' && m.keeper && Math.hypot(m.x - m.hx, m.y - m.hy) > 300) { tx = (m.hx - m.x)*0.8; ty = (m.hy - m.y)*0.8; }
  swim(m, tx, ty, turn, dt, sp);
  m.rune += (rune - m.rune)*Math.min(1, dt*6);
  poseFish(m, dt, faceTo, null);
  if (m.s === 'dash' && biteAt(m, 30, 0, 16)) go(m, 'recover', 0.8);
}

function reveal(m){
  if (!m.hidden) return;
  m.hidden = false; go(m, 'pop', m.t === 'mimic' ? 0.4 : 0.5); m.mem = 6; m.lost = 0;
  const core = DG.core;
  if (core.float) core.float(m.x, m.y - 28, 'TUZAK!', '#ff5a3a');
  growl(m, true); if (core.buzz) core.buzz(40);
  if (DG.fx && DG.fx.burst) DG.fx.burst(m.x, m.y, m.t === 'mimic' ? '#ffcf3a' : '#c8b8a0', 8, 140);
  if (m.t === 'mimic' && !hintMimic) { hintMimic = true; core.msg('Sandık değil, taklitçi! Sonar onları kırmızıyla gösterir.', 'var(--danger)'); }
  if (m.t === 'octopus' && !hintOcto) { hintOcto = true; core.msg('Kaya sandığın şey bir ahtapot! Kolları seni yavaşlatır.', 'var(--danger)'); }
}
function aiMimic(m, dt){
  sense(m);
  const sp = spdOf(m), S = DG.S;
  m.st -= dt;
  let tx = 0, ty = 0, turn = 1.6, faceTo = 0, open = 0.7, rv = 1;
  switch (m.s) {
    case 'hide': {
      rv = 0; open = 0;
      m.x = m.hx; m.y = m.hy; m.vx = m.vy = 0;
      m.tw -= dt; if (m.twA > 0) m.twA -= dt;
      if (m.tw <= 0) { m.tw = rnd(5, 9); if (m.dd < 260) m.twA = 0.3; }
      if (canHunt(m) && sameZone(m) && m.dd < 82*(1 + 0.02*m.L)) reveal(m);
      m.rv = 0; m.open = 0;
      m.ox = m.hx; m.oy = m.hy + Math.sin(S.t*2 + m.iph)*2; setXf(m, 0, 1, 1);
      return;
    }
    case 'pop': faceTo = m.dx >= 0 ? 1 : -1; open = 1; tx = m.vx*0.3; ty = -30; if (m.st <= 0) go(m, 'hunt', 0.15); break;
    case 'hunt': {
      faceTo = m.dx >= 0 ? 1 : -1;
      tx = m.dx/m.dd*sp; ty = m.dy/m.dd*sp; turn = 1.4;
      if (m.st <= 0) {
        m.st = rnd(0.55, 0.85)*(1 - 0.25*m.sav);
        if (m.dd < 280) { m.vx = m.dx/m.dd*sp*2.4; m.vy = m.dy/m.dd*sp*2.4 - 30; m.pmx = null; }
      }
      open = m.dd < 130 ? 0.55 + 0.45*Math.sin(m.ph*14) : 0.8;
      if (!canHunt(m) || m.dd > 460 || !sameZone(m)) { m.lost += dt; if (m.lost > 2.5) go(m, 'home', 0); } else m.lost = 0;
      break;
    }
    case 'home': {
      const dx = m.hx - m.x, dy = m.hy - m.y, d = Math.hypot(dx, dy) || 1;
      tx = dx/d*Math.min(sp*0.8, d*3); ty = dy/d*Math.min(sp*0.8, d*3); turn = 3; open = 0.3;
      if (d < 8 || m.st < -8) { if (d >= 8) { m.hx = m.x; m.hy = m.y; } go(m, 'shut', 0.5); }
      if (wantsHunt(m, 150)) go(m, 'hunt', 0.2);
      break;
    }
    case 'shut': {
      rv = 0; open = 0; m.vx *= 0.8; m.vy *= 0.8;
      m.x += (m.hx - m.x)*Math.min(1, dt*8); m.y += (m.hy - m.y)*Math.min(1, dt*8);
      if (m.st <= 0 && m.rv < 0.04) { m.hidden = true; m.rv = 0; go(m, 'hide', 0); m.tw = rnd(5, 9); m.face = 1; }
      break;
    }
  }
  if (m.s !== 'shut') swim(m, tx, ty, turn, dt, sp);
  m.rv += (rv - m.rv)*Math.min(1, dt*(rv > m.rv ? 6 : 4));
  m.open += (open - m.open)*Math.min(1, dt*14);
  m.walk = Math.min(1, Math.hypot(m.vx, m.vy)/120);
  poseFish(m, dt, faceTo, null, lerp(1/m.sc, 1.75, clamp(backOut(clamp(m.rv, 0, 1)), 0, 1.3)));
  if (m.s === 'hunt' && biteAt(m, 10, -3, 12)) { m.vx *= -0.4; m.vy *= -0.4; }
}

function aiOcto(m, dt){
  const D = DG.S.diver, U = DG.U, s = m.sc;
  sense(m);
  m.st -= dt; if (m.squeeze > 0) m.squeeze -= dt;
  const armLen = (62 + 4*m.L)*Math.min(1.5, s), fl = nearFlare(m);
  let slideTo = m.home, rvT = m.rv, reachT = 0;
  switch (m.s) {
    case 'hide':
      rvT = 0; m.tw -= dt; if (m.twA > 0) m.twA -= dt;
      if (m.tw <= 0) { m.tw = rnd(5, 9); if (m.dd < 280) m.twA = 0.35; }
      if (!fl && canHunt(m) && sameZone(m) && m.dd < (125 + 4*m.L)*Math.min(1.4, s)) reveal(m);
      break;
    case 'pop': rvT = 1; if (m.st <= 0) go(m, 'grab', 0); break;
    case 'grab': {
      rvT = 1;
      slideTo = clamp(m.anch === 'F' ? D.x : D.y, m.home - 170, m.home + 170);
      reachT = m.dd < armLen + 50 ? 1 : 0.3;
      if (m.reach > 0.6 && m.dd < armLen*m.reach + 14 && canBite(m)) doBite(m, 1);
      if (fl || !canHunt(m) || m.dd > 340) { m.lost += dt; if (m.lost > 1.6 || fl) go(m, 'back', 0); } else m.lost = 0;
      break;
    }
    case 'back': rvT = 1; if (Math.abs(m.along - m.home) < 4) go(m, 'shut', 0.9); else if (!fl && wantsHunt(m, armLen)) go(m, 'grab', 0); break;
    case 'shut': rvT = 0; if (m.rv < 0.03) { m.rv = 0; m.hidden = true; go(m, 'hide', 0); } break;
  }
  // yüzey boyunca yavaşça kay
  if (!m.hidden && m.stun <= 0) {
    const sp = spdOf(m)*0.6, na = m.along + clamp(slideTo - m.along, -sp*dt, sp*dt);
    let nbx, nby, ok = true;
    if (m.anch === 'F') {
      nbx = na; nby = ledgeTop(na, m.li);
      const w = U.wallW(nby - 30, na < BOAT_X ? 0 : 1);
      if (Math.abs(na - BOAT_X) < SHAFT_HALF + 26 || na < w + 30 || na > WORLD_W - w - 30) ok = false;
    } else {
      nby = na; nbx = m.anch === 'L' ? U.wallW(na, 0) - 1 : WORLD_W - U.wallW(na, 1) + 1;
      if (blocked(nbx + m.nx*30, nby, 40)) ok = false;
    }
    if (ok && !m.ignoreSafe && !F.boss && U.isSafe(nbx + m.nx*24, nby + m.ny*24)) ok = false;
    if (ok) { m.along = na; m.bx = nbx; m.by = nby; }
  }
  m.rv += (rvT - m.rv)*Math.min(1, dt*(rvT > m.rv ? 5 : 1.4));
  m.reach += (reachT - m.reach)*Math.min(1, dt*(reachT > m.reach ? 7 : 3));
  m.x = m.bx + m.nx*(9 + 13*m.rv)*s; m.y = m.by + m.ny*(9 + 13*m.rv)*s;
  // dalgıca doğru eğil, kolların hedefi yerel koordinatta
  const th = Math.atan2(m.nx, -m.ny), wx = D.x - m.bx, wy = D.y - m.by;
  let lean = 0;
  if (m.rv > 0.05) lean = clamp(wrapA(Math.atan2(wy, wx) - (th - Math.PI/2)), -0.5, 0.5)*m.rv*0.8;
  const a = th + lean, c = Math.cos(-a), sn = Math.sin(-a), lx = (wx*c - wy*sn)/s, ly = (wx*sn + wy*c)/s;
  m.dla = Math.atan2(ly + 3, lx); m.dll = Math.hypot(lx, ly + 3);
  setXf(m, a + wob(m), s*(1 + 0.2*m.sq), s*(1 - 0.15*m.sq));
  m.ox = m.bx; m.oy = m.by;
}

function aiUrchin(m, dt){
  sense(m);
  if (canBite(m, true) && m.dd < MON.urchin.r*m.sc + 12) doBite(m, 1);
}
function aiMine(m, dt){
  sense(m);
  m.y = m.hy + Math.sin(m.ph*1.1 + m.seed*6)*4; m.x = m.hx + Math.sin(m.ph*0.7 + m.seed*3)*2;
  m.ox = m.x; m.oy = m.y;
  const S = DG.S;
  if (S.playing && !S.riding && !F.dSafe && m.dd < MON.mine.r*m.sc + 12) { m.touched = true; kill(m); }
}
// Mayın patlaması: dalgıca uzaklığa göre hasar, çevredeki canavarlara (ve mayınlara: zincirleme) da.
function mineBlast(m){
  const S = DG.S, D = S.diver, core = DG.core, R = MON.mine.blast*(1 + 0.02*m.L);
  if (DG.fx) { if (DG.fx.explosion) DG.fx.explosion(m.x, m.y, R); if (DG.fx.shake) DG.fx.shake(7); }
  if (core.sfx) core.sfx('boom'); if (core.buzz) core.buzz(90);
  const d = Math.hypot(D.x - m.x, D.y - m.y);
  if (d < R + 10 && S.playing) core.hurt(core.dmgFor(m)*(1 - 0.55*clamp(d/R, 0, 1)), MON.mine.n, m);
  for (const o of S.mons) {
    if (o === m || o.dead) continue;
    const dx = o.x - m.x, dy = o.y - m.y, dd = Math.hypot(dx, dy);
    if (dd < R) DG.mon.damage(o, 3*(1 + 0.35*m.L)*(1 - 0.4*dd/R), {stun:1.2, kind:'blast', kx:dx/(dd || 1)*320, ky:dy/(dd || 1)*320});
  }
}

const AI = {urchin:aiUrchin, mine:aiMine, jelly:aiJelly, eel:aiEel, shark:aiShark, angler:aiAngler, viper:aiViper, squid:aiSquid, serpent:aiSerpent, guardian:aiGuardian, mimic:aiMimic, octopus:aiOcto};

// ---------- çizim yardımcıları ----------
const TX = new Float32Array(72), TY = new Float32Array(72), TW = new Float32Array(72), FX = new Float32Array(72), FY = new Float32Array(72);
// TX/TY noktaları boyunca incelen bir tüp yolu (dolgu için).
function tube(ctx, n, w0, w1){
  ctx.beginPath();
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < n; j++) {
      const i = pass ? n - 1 - j : j, a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = TX[b] - TX[a], dy = TY[b] - TY[a], l = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, i/(n - 1))*(pass ? -1 : 1);
      ctx.lineTo(TX[i] - dy/l*w, TY[i] + dx/l*w);
    }
  }
  ctx.closePath();
}
function teethPath(ctx, x0, y0, x1, y1, n, len, dir){
  const dx = (x1 - x0)/n, dy = (y1 - y0)/n;
  for (let i = 0; i < n; i++) {
    const ax = x0 + dx*i, ay = y0 + dy*i;
    ctx.moveTo(ax, ay); ctx.lineTo(ax + dx*0.5, ay + dy*0.5 + len*dir*(i%2 ? 0.7 : 1)); ctx.lineTo(ax + dx, ay + dy);
  }
}
function scars(ctx, m, P){
  const s = m.scars; if (!s || !s.length) return;
  ctx.strokeStyle = P.scar; ctx.lineWidth = 0.9; ctx.beginPath();
  for (const c of s) {
    ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]);
    const dx = c[2] - c[0], dy = c[3] - c[1], l = Math.hypot(dx, dy) || 1, nx = -dy/l*1.5, ny = dx/l*1.5;
    for (const f of [0.3, 0.7]) { const x = c[0] + dx*f, y = c[1] + dy*f; ctx.moveTo(x - nx, y - ny); ctx.lineTo(x + nx, y + ny); }
  }
  ctx.stroke();
}
function star4(ctx, x, y, r){
  ctx.moveTo(x, y - r); ctx.lineTo(x + r*0.28, y - r*0.28); ctx.lineTo(x + r, y); ctx.lineTo(x + r*0.28, y + r*0.28);
  ctx.lineTo(x, y + r); ctx.lineTo(x - r*0.28, y + r*0.28); ctx.lineTo(x - r, y); ctx.lineTo(x - r*0.28, y - r*0.28); ctx.closePath();
}
// Kamuflaj rengi: çekirdeğin duvar ve raf boyasıyla aynı formül.
function wallRGB(){
  const S = DG.S, U = DG.U, cam = S.cam, y0 = Math.max(0, cam.y - 20), y1 = cam.y + S.H + 20, mid = (y0 + y1)/2;
  if (U.wallColor) return U.wallColor(mid);
  const ly = LAYERS[U.layerOf(mid)], w = U.waterAt(mid);
  return [ly.rock[0]*0.6 + w[0]*0.25, ly.rock[1]*0.6 + w[1]*0.25, ly.rock[2]*0.6 + w[2]*0.25];
}
const ledgeRGB = i => DG.U.ledgeColor ? DG.U.ledgeColor(i) : shade(LAYERS[Math.max(0, i - 1)].rock, 0.75);

// ---------- gövdeler (yerel çerçevede, burun +x) ----------
function drawJelly(ctx, m, P){
  const c = m.pulse, R = 16, bw = R*(1 - 0.16*c), bh = R*(0.78 + 0.18*c), t = m.ph, k = m.sav;
  const len = R*(2.3 + 1.2*k)*(m.size > 1 ? 1.25 : 1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // ince dokunaçlar
  ctx.strokeStyle = P.tent; ctx.lineWidth = 0.9; ctx.beginPath();
  const n = m.nTent, drag = clamp(-m.vx*0.02, -0.5, 0.5);
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i/(n - 1), x0 = lerp(-bw*0.88, bw*0.88, f), ln = len*(0.7 + 0.3*hsh(i + m.seed*10));
    ctx.moveTo(x0, 3);
    for (let q = 1; q <= 6; q++) { const u = q/6; ctx.lineTo(x0*(1 - u*0.25) + Math.sin(t*2.1 + q*0.9 + i*1.7)*3.4*u + drag*ln*u*u, 3 + u*ln); }
  }
  ctx.stroke();
  // ağız kolları (kıvrımlı kurdeleler)
  ctx.fillStyle = P.arm;
  for (let j = 0; j < 3; j++) {
    const x0 = (j - 1)*bw*0.32;
    for (let q = 0; q < 7; q++) { const u = q/6; TX[q] = x0 + Math.sin(t*1.6 + u*5 + j*2)*4*u + drag*R*1.5*u*u; TY[q] = 2 + u*R*(1.4 + 0.3*(j%2)); }
    tube(ctx, 7, 2.8, 0.5); ctx.fill();
  }
  // çan
  ctx.fillStyle = P.bell; ctx.beginPath(); ctx.moveTo(-bw, 2);
  ctx.bezierCurveTo(-bw, -bh*1.35, bw, -bh*1.35, bw, 2);
  for (let i = 1; i <= 8; i++) { const xa = bw - 2*bw*(i - 0.5)/8, xb = bw - 2*bw*i/8; ctx.quadraticCurveTo(xa, 5.5, xb, 2); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.rim; ctx.lineWidth = 1.2; ctx.stroke();
  if (m.L < 4) {
    // ay denizanası: dört nal halkası
    ctx.strokeStyle = P.inner; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = i*Math.PI/2 + Math.PI/4, x = Math.cos(a)*bw*0.3, y = -bh*0.5 + Math.sin(a)*bh*0.2; ctx.moveTo(x + 2.6, y); ctx.arc(x, y, 2.6, 0, Math.PI*1.6); }
    ctx.stroke();
  } else {
    // derin: koyu mide ve ışınsal kanallar
    ctx.strokeStyle = P.inner; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const x = lerp(-bw*0.85, bw*0.85, i/7); ctx.moveTo(0, -bh*0.45); ctx.quadraticCurveTo(x*0.6, -bh*0.7, x, 1.5); }
    ctx.stroke();
    ctx.fillStyle = P.inner; ctx.beginPath(); ctx.ellipse(0, -bh*0.45, bw*0.36, bh*0.3, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = P.hi; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(-bw*0.2, -bh*0.35, bw*0.55, Math.PI*1.15, Math.PI*1.45); ctx.stroke();
}

function drawEelBody(ctx, m, P, cam){
  const dir = m.dir, s = m.sc, hx = m.hx - cam.x, hy = m.hy - cam.y;
  // duvardaki in
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.ellipse(hx - dir*2, hy, 7*s, 13*s, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3*s; ctx.beginPath(); ctx.ellipse(hx - dir*2, hy, 9.5*s, 15*s, 0, 0, TAU); ctx.stroke();
  // gövde: inden boyuna
  const nb = wpt(m, -8, 0), n = 10, e = m.ext;
  for (let i = 0; i < n; i++) {
    const f = i/(n - 1);
    TX[i] = lerp(m.hx - dir*8, nb[0], f) - cam.x;
    TY[i] = lerp(m.hy, nb[1], f) + Math.sin(m.ph*5 - f*6)*Math.min(14, e*0.08)*Math.sin(f*Math.PI) - cam.y;
  }
  ctx.fillStyle = P.body; tube(ctx, n, 6.4*s, 5.8*s); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.1; ctx.stroke();
  // sırt yüzgeci ve benekler
  ctx.strokeStyle = P.fin; ctx.lineWidth = 2*s; ctx.beginPath();
  for (let i = 1; i < n; i++) { const dx = TX[i] - TX[i - 1], dy = TY[i] - TY[i - 1], l = Math.hypot(dx, dy) || 1; let nx = -dy/l, ny = dx/l; if (ny > 0) { nx = -nx; ny = -ny; } const w = 7*s; i === 1 ? ctx.moveTo(TX[i] + nx*w, TY[i] + ny*w) : ctx.lineTo(TX[i] + nx*w, TY[i] + ny*w); }
  ctx.stroke();
  ctx.fillStyle = P.spot; ctx.beginPath();
  for (const sp of m.spots) {
    const f = 0.15 + sp[0]*0.8, i = Math.min(n - 2, Math.floor(f*(n - 1))), u = f*(n - 1) - i;
    const x = lerp(TX[i], TX[i + 1], u), y = lerp(TY[i], TY[i + 1], u) + sp[1]*5*s;
    ctx.moveTo(x + 1.4*s, y); ctx.arc(x, y, 1.4*s, 0, TAU);
  }
  ctx.fill();
}
function drawEelHead(ctx, m, P){
  const g = m.jaw, k = m.sav;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (g > 0.08) { ctx.fillStyle = P.mouth; ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(14, 0.5); ctx.lineTo(11, 2 + g*8); ctx.closePath(); ctx.fill(); }
  // alt çene
  ctx.save(); ctx.translate(-5, 2); ctx.rotate(g*0.5);
  ctx.fillStyle = P.belly; ctx.beginPath(); ctx.moveTo(0, -1); ctx.quadraticCurveTo(10, 5, 19, 0.5); ctx.lineTo(18, -1.2); ctx.quadraticCurveTo(9, 0.5, 0, -2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 0.9; ctx.stroke();
  if (g > 0.2) { ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, 3, -1.4, 17, -1.2, m.nT, 2.4 + k, -1); ctx.fill(); }
  ctx.restore();
  // baş
  ctx.fillStyle = P.body; ctx.beginPath(); ctx.moveTo(-9, -5.5); ctx.quadraticCurveTo(2, -9.5, 10, -5.5); ctx.quadraticCurveTo(15, -3, 16, 0); ctx.lineTo(-6, 2); ctx.quadraticCurveTo(-10, 0, -9, -5.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke();
  if (g > 0.2) { ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, 15, 0.4, 0, 1.8, m.nT, 2.6 + k, 1); ctx.fill(); }
  // tüp burun delikleri, benekler, göz
  ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(13.5, -3); ctx.lineTo(15, -6); ctx.stroke();
  ctx.fillStyle = P.spot; ctx.beginPath(); ctx.arc(-2, -5, 1.2, 0, TAU); ctx.arc(1.5, -2.5, 1, 0, TAU); ctx.fill();
  ctx.fillStyle = P.eye; ctx.beginPath(); ctx.arc(5.5, -4.2, 2.1, 0, TAU); ctx.fill();
  ctx.fillStyle = '#100a00'; ctx.beginPath(); ctx.arc(6, -4.2, 1.1, 0, TAU); ctx.fill();
  if (k > 0.3) { ctx.strokeStyle = P.line; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(2.5, -7); ctx.lineTo(8.5, -5.6); ctx.stroke(); }
}

function drawShark(ctx, m, P){
  const t = m.ph, ch = m.s === 'charge', j = m.jaw, k = m.sav;
  const sw = Math.sin(t*(ch ? 15 : 6.5))*(ch ? 0.3 : 0.2) + (m.s === 'tell' ? Math.sin(t*40)*0.06 : 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // uzak göğüs yüzgeci
  ctx.fillStyle = P.dark; ctx.beginPath(); ctx.moveTo(14, 5); ctx.quadraticCurveTo(10, 14, 2, 19); ctx.quadraticCurveTo(5, 11, 4, 6); ctx.closePath(); ctx.fill();
  // kuyruk (sallanır)
  ctx.save(); ctx.translate(-26, 0); ctx.rotate(sw);
  ctx.fillStyle = P.fin; ctx.strokeStyle = P.line; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(3, -4); ctx.quadraticCurveTo(-6, -11, -15, -25);
  if (m.torn) { ctx.lineTo(-13, -19); ctx.lineTo(-17, -16); }
  ctx.quadraticCurveTo(-12, -9, -9, -1); ctx.quadraticCurveTo(-12, 6, -15, 14); ctx.quadraticCurveTo(-5, 8, 3, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // gövde + karın gölgelemesi
  const body = () => { ctx.beginPath(); ctx.moveTo(38, 2); ctx.quadraticCurveTo(35, -8, 20, -11); ctx.quadraticCurveTo(-4, -14, -26, -5); ctx.lineTo(-29, -2); ctx.lineTo(-29, 3); ctx.quadraticCurveTo(-6, 13, 16, 10); ctx.quadraticCurveTo(31, 9, 38, 2); ctx.closePath(); };
  ctx.fillStyle = P.body; body(); ctx.fill();
  ctx.fillStyle = P.belly; ctx.beginPath(); ctx.moveTo(37, 3.5); ctx.quadraticCurveTo(30, 8.5, 15, 9.6); ctx.quadraticCurveTo(-6, 12, -27, 2.5); ctx.quadraticCurveTo(-6, 6.5, 12, 4.5); ctx.quadraticCurveTo(28, 3, 37, 3.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.3; body(); ctx.stroke();
  ctx.strokeStyle = P.hi; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(30, -7.5); ctx.quadraticCurveTo(4, -13, -20, -6); ctx.stroke();
  // sırt yüzgeci (derinde yırtık)
  ctx.fillStyle = P.fin; ctx.strokeStyle = P.line; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(9, -11.5); ctx.quadraticCurveTo(1, -19, -6, -29);
  if (m.torn) { ctx.lineTo(-7, -24); ctx.lineTo(-10, -22.5); }
  ctx.quadraticCurveTo(-8, -18, -14, -10.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-17, -7.5); ctx.lineTo(-21, -13); ctx.lineTo(-22, -6.5); ctx.closePath(); ctx.moveTo(-15, 7.5); ctx.lineTo(-20, 12); ctx.lineTo(-21, 6); ctx.closePath(); ctx.fill();
  // yakın göğüs yüzgeci
  ctx.beginPath(); ctx.moveTo(15, 6); ctx.quadraticCurveTo(9, 16, 0, 23); ctx.quadraticCurveTo(4, 13, 3, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  // solungaçlar ve yaralar
  ctx.strokeStyle = P.gill; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 4 + (k > 0.5 ? 1 : 0); i++) { const x = 17 - i*2.6; ctx.moveTo(x, -5.5); ctx.quadraticCurveTo(x - 1.6, 0, x, 5); }
  ctx.stroke();
  scars(ctx, m, P);
  // ağız
  if (j > 0.04) {
    const jy = 11*j;
    ctx.fillStyle = P.mouth; ctx.beginPath(); ctx.moveTo(36, 4); ctx.quadraticCurveTo(27, 5.5, 18, 6.5); ctx.quadraticCurveTo(25, 7 + jy, 33, 6 + jy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, 35, 4.3, 19, 6.3, m.nT, 2.6 + 1.6*k, 1); teethPath(ctx, 32, 5.5 + jy, 20, 7 + jy*0.5, m.nT - 1, 2.4 + 1.4*k, -1); ctx.fill();
    ctx.fillStyle = P.belly; ctx.beginPath(); ctx.moveTo(18, 7.5); ctx.quadraticCurveTo(25, 8 + jy, 34, 6.5 + jy); ctx.quadraticCurveTo(29, 10 + jy, 16, 10.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P.line; ctx.lineWidth = 1; ctx.stroke();
  } else {
    ctx.strokeStyle = P.line; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(34, 5); ctx.quadraticCurveTo(27, 7.5, 20, 7); ctx.stroke();
    if (k > 0.35) { ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, 32, 5.6, 22, 7.1, 3 + (k*3|0), 1.6, 1); ctx.fill(); }
  }
  // göz: hücumda zar kapanır, beyazlaşır
  const white = ch || m.s === 'tell';
  ctx.fillStyle = white ? '#e6ebe6' : P.eyeC; ctx.beginPath(); ctx.arc(24, -3, 2.3, 0, TAU); ctx.fill();
  if (!white) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(24.8, -3.8, 0.75, 0, TAU); ctx.fill(); }
  if (k > 0.3) { ctx.strokeStyle = P.line; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(20, -6.5); ctx.lineTo(27.5, -4.6); ctx.stroke(); }
}

function drawAngler(ctx, m, P){
  const t = m.ph, j = m.jaw, k = m.sav, sway = Math.sin(t*2.2);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // kuyruk yelpazesi
  ctx.fillStyle = P.fin; ctx.beginPath(); ctx.moveTo(-17, -2); ctx.quadraticCurveTo(-28, -13 + sway*2, -35, -11 + sway*3); ctx.quadraticCurveTo(-30, 0, -35, 10 + sway*3); ctx.quadraticCurveTo(-28, 12 + sway*2, -17, 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(-19, 0.5); ctx.lineTo(-33, i*4.5 + sway*2.5); } ctx.stroke();
  // ağız içi
  if (j > 0.04) { ctx.fillStyle = P.mouth; ctx.beginPath(); ctx.ellipse(11, 3 + 5*j, 10, 3 + 9*j, 0, 0, TAU); ctx.fill(); }
  // alçak sırt yüzgeci
  ctx.fillStyle = P.fin; ctx.beginPath(); ctx.moveTo(-6, -16); ctx.quadraticCurveTo(-12, -22 - sway, -18, -12); ctx.lineTo(-14, -10); ctx.closePath(); ctx.fill();
  // baş ve gövde
  const body = () => { ctx.beginPath(); ctx.moveTo(19, -3); ctx.bezierCurveTo(17, -15, 4, -21, -7, -17); ctx.bezierCurveTo(-17, -12, -21, -4, -19, 1); ctx.bezierCurveTo(-17, 9, -8, 13, 1, 11); ctx.lineTo(3, 3); ctx.closePath(); };
  ctx.fillStyle = P.body; body(); ctx.fill();
  ctx.fillStyle = P.spot; ctx.beginPath(); for (const s of m.spk) { ctx.moveTo(s[0] + s[2], s[1]); ctx.arc(s[0], s[1], s[2], 0, TAU); } ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.2; body(); ctx.stroke();
  scars(ctx, m, P);
  // öne fırlamış alt çene ve iğne dişler
  ctx.save(); ctx.translate(2, 4); ctx.rotate(j*0.7);
  ctx.fillStyle = P.belly; ctx.beginPath(); ctx.moveTo(-1, 7); ctx.quadraticCurveTo(14, 12, 23, -4); ctx.lineTo(20, -5.5); ctx.quadraticCurveTo(11, 1, -1, -0.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.strokeStyle = P.teeth; ctx.lineWidth = 1.15; ctx.beginPath();
  for (let i = 0; i < m.nT; i++) { const f = (i + 0.5)/m.nT, x = lerp(4, 20, f), y = lerp(-0.6, -4.8, f), L = (4 + 4.5*k)*(0.6 + 0.4*hsh(i + m.seed*30)); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 1, y - L*0.6, x + 2.5, y - L); }
  ctx.stroke(); ctx.restore();
  ctx.strokeStyle = P.teeth; ctx.lineWidth = 1.05; ctx.beginPath();
  for (let i = 0; i < m.nT - 1; i++) { const f = (i + 0.5)/(m.nT - 1), x = lerp(6, 18, f), y = lerp(2, -2.6, f), L = (3 + 3.5*k)*(0.6 + 0.4*hsh(i*3 + m.seed*20)); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 0.5, y + L*0.6, x + 1.5, y + L); }
  ctx.stroke();
  // olta
  const ll = lureLocal(m);
  ctx.strokeStyle = P.rod; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(3, -17); ctx.quadraticCurveTo(10, -38, ll[0], ll[1]); ctx.stroke();
  // küçük soluk göz
  ctx.fillStyle = P.eyeC; ctx.beginPath(); ctx.arc(7, -9, 2.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#05080a'; ctx.beginPath(); ctx.arc(7.6, -9, 1.2, 0, TAU); ctx.fill();
  // göğüs yüzgeci
  ctx.fillStyle = P.fin; ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-12, 10 + sway*2, -6, 14); ctx.quadraticCurveTo(-3, 9, -2, 5); ctx.closePath(); ctx.fill();
}
// Yem ekran koordinatında çizilir: derin katlarda hazine şekliyle birebir aynı (inci/mücevher).
function drawLure(ctx, m, P, cam){
  const ll = lureLocal(m), p = wpt(m, ll[0], ll[1]), x = p[0] - cam.x, y = p[1] - cam.y;
  if (m.lureS && m.flash <= 0) DG.U.drawShape(m.lureS, m.lureC, x, y, DG.S.t + m.iph, 1);
  else {
    ctx.fillStyle = P.lure; ctx.beginPath(); ctx.arc(x, y, 3.6*Math.min(1.4, m.sc), 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.2, 0, TAU); ctx.fill();
  }
}

function drawViper(ctx, m, P){
  const t = m.ph, j = m.jaw, k = m.sav, sw = Math.sin(t*(m.s === 'dart' ? 22 : 9))*0.25;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(-16, 0); ctx.rotate(sw);
  ctx.fillStyle = P.fin; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(-9, -5.5); ctx.quadraticCurveTo(-6, 0, -9, 5.5); ctx.closePath(); ctx.fill();
  ctx.restore();
  const body = () => { ctx.beginPath(); ctx.moveTo(13, -1.2); ctx.quadraticCurveTo(9, -6, 1, -5); ctx.quadraticCurveTo(-9, -4, -17, -1.3); ctx.lineTo(-17, 1.3); ctx.quadraticCurveTo(-8, 4.2, 2, 4.4); ctx.lineTo(11, 2.6); ctx.closePath(); };
  ctx.fillStyle = P.body; body(); ctx.fill(); ctx.strokeStyle = P.line; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.strokeStyle = P.sheen; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(9, -1.5); ctx.quadraticCurveTo(-3, -2.5, -15, -0.5); ctx.stroke();
  ctx.fillStyle = P.belly; ctx.beginPath(); for (let i = 0; i < 6; i++) { const x = 7 - i*3.8, y = 3.4 - i*0.35; ctx.moveTo(x + 0.9, y); ctx.arc(x, y, 0.9, 0, TAU); } ctx.fill();
  // sırt ışını (ucunda ışık organı)
  ctx.strokeStyle = P.fin; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1, -4.8); ctx.quadraticCurveTo(-5, -16, 5 + Math.sin(t*3)*1.5, -19); ctx.stroke();
  // alt çene: burnun önünden yükselen dev dişler
  const fl = 1 + 0.6*k;
  ctx.save(); ctx.translate(4, 2.5); ctx.rotate(j*0.55);
  ctx.fillStyle = P.body; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(9, 0.5); ctx.lineTo(8, 2.2); ctx.lineTo(-3, 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.teeth; ctx.lineWidth = 1.1; ctx.beginPath();
  ctx.moveTo(8.5, 0.6); ctx.quadraticCurveTo(12, -4*fl, 10.5, -10*fl);
  ctx.moveTo(6, 0.5); ctx.quadraticCurveTo(8.5, -3*fl, 7.5, -6.5*fl);
  if (k > 0.4) { ctx.moveTo(3.5, 0.4); ctx.lineTo(4.5, -3.5*fl); }
  ctx.stroke(); ctx.restore();
  ctx.strokeStyle = P.teeth; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(11.5, 1); ctx.quadraticCurveTo(13.5, 4, 12.5, 6.5*fl); ctx.moveTo(9, 1.8); ctx.lineTo(9.6, 4.6*fl); ctx.stroke();
  ctx.fillStyle = P.eyeC; ctx.beginPath(); ctx.arc(7, -1.6, 2.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = P.eyeR; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(7.7, -2.3, 0.6, 0, TAU); ctx.fill();
}

function drawInk(ctx, m, cam){
  for (const c of m.inks) {
    if (c.a <= 0) continue;
    const x = c.x - cam.x, y = c.y - cam.y;
    ctx.fillStyle = `rgba(12,4,18,${Math.min(0.85, c.a)})`; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = c.sd + i*1.3, rr = c.r*(0.45 + 0.25*hsh(c.sd + i)); ctx.moveTo(x + Math.cos(a)*c.r*0.45 + rr, y + Math.sin(a)*c.r*0.4); ctx.arc(x + Math.cos(a)*c.r*0.45, y + Math.sin(a)*c.r*0.4, rr, 0, TAU); }
    ctx.fill();
  }
}
function drawSquid(ctx, m, P){
  const t = m.ph, c = m.jet, sp = m.spread, rch = m.reach;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // iki uzun avlanma dokunacı
  ctx.strokeStyle = P.arm; ctx.lineWidth = 1.8; ctx.beginPath();
  const tip = [];
  for (const g of [-1, 1]) {
    ctx.moveTo(12, g*2.5);
    let ex = 12, ey = 0;
    for (let i = 1; i <= 8; i++) { const f = i/8; ex = 12 + m.tl*f; ey = g*(2.5 + f*2*(1 - rch)) + Math.sin(t*3.2 + f*5 + g)*4*f*(1 - rch*0.8); ctx.lineTo(ex, ey); }
    tip.push(ex, ey);
  }
  ctx.stroke();
  ctx.fillStyle = P.arm; ctx.beginPath(); ctx.ellipse(tip[0], tip[1], 6, 2.6, 0, 0, TAU); ctx.ellipse(tip[2], tip[3], 6, 2.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = P.sucker; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(tip[0] - 4 + i*2.5 + 0.7, tip[1]); ctx.arc(tip[0] - 4 + i*2.5, tip[1], 0.7, 0, TAU); ctx.moveTo(tip[2] - 4 + i*2.5 + 0.7, tip[3]); ctx.arc(tip[2] - 4 + i*2.5, tip[3], 0.7, 0, TAU); } ctx.fill();
  // sekiz kol
  ctx.fillStyle = P.arm;
  for (let i = 0; i < 8; i++) {
    const f = i/7 - 0.5, base = f*10, len = (22 + 8*hsh(i + m.seed*9))*(1 - 0.15*c), spr = f*(0.5 + 1.0*sp);
    for (let q = 0; q < 7; q++) { const u = q/6; TX[q] = 11 + Math.cos(spr*u)*len*u; TY[q] = base*(1 - u*0.3) + Math.sin(spr*u)*len*u + Math.sin(t*4 + i*0.9 + u*4)*3*u*(1 - sp*0.6); }
    tube(ctx, 7, 2.3, 0.3); ctx.fill();
  }
  // manto ve yüzgeçler
  const w = 1 - 0.16*c, fl = Math.sin(t*5)*3;
  ctx.fillStyle = P.fin; ctx.beginPath();
  ctx.moveTo(-28, -6*w); ctx.quadraticCurveTo(-40, -18 - fl, -51, -4); ctx.lineTo(-44, -2); ctx.closePath();
  ctx.moveTo(-28, 6*w); ctx.quadraticCurveTo(-40, 18 + fl, -51, 4); ctx.lineTo(-44, 2); ctx.closePath(); ctx.fill();
  const mantle = () => { ctx.beginPath(); ctx.moveTo(3, -10*w); ctx.quadraticCurveTo(-22, -14*w, -42, -3.5*w); ctx.lineTo(-47, 0); ctx.lineTo(-42, 3.5*w); ctx.quadraticCurveTo(-22, 14*w, 3, 10*w); ctx.closePath(); };
  ctx.fillStyle = P.body; mantle(); ctx.fill();
  // kromatoforlar: deride dalgalanan renk
  const T = DG.S.t;
  for (let i = 0; i < m.spk.length; i++) {
    const s = m.spk[i], ph = Math.sin(T*4.5 + i*1.3 + s[0]*0.2);
    ctx.fillStyle = ph > 0 ? P.spotA : P.spotB; ctx.globalAlpha = 0.35 + 0.5*Math.abs(ph);
    ctx.beginPath(); ctx.arc(s[0], s[1]*w, s[2], 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  scars(ctx, m, P);
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.2; mantle(); ctx.stroke();
  // baş ve büyük göz
  ctx.fillStyle = P.dark; ctx.beginPath(); ctx.ellipse(7, 0, 9, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = P.eye; ctx.beginPath(); ctx.arc(7, -2.5, 4.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0a0406'; ctx.beginPath(); ctx.ellipse(7.8, -2.5, 1.6, 3.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(8.8, -4, 0.9, 0, TAU); ctx.fill();
}

function drawSerpentBody(ctx, m, P, cam){
  const sg = m.seg, n = sg.length + 1, s = m.sc, face = m.fy >= 0 ? 1 : -1;
  TX[0] = m.x - cam.x; TY[0] = m.y - cam.y;
  for (let i = 0; i < sg.length; i++) { TX[i + 1] = sg[i].x - cam.x; TY[i + 1] = sg[i].y - cam.y; }
  for (let i = 0; i < n; i++) {
    const f = i/(n - 1);
    TW[i] = s*(f < 0.1 ? lerp(8.5, 12.5, f/0.1) : lerp(12.5, 2, Math.pow((f - 0.1)/0.9, 1.15)));
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = TX[a] - TX[b], dy = TY[a] - TY[b], l = Math.hypot(dx, dy) || 1;
    FX[i] = dx/l; FY[i] = dy/l;
  }
  // sırt yönü D = face*(F.y, -F.x)
  const DX = i => face*FY[i], DY = i => -face*FX[i];
  // kuyruk yüzgeci
  const e = n - 1, ex = TX[e], ey = TY[e];
  ctx.fillStyle = P.frill; ctx.beginPath();
  ctx.moveTo(ex + FX[e]*3*s, ey + FY[e]*3*s); ctx.lineTo(ex + DX(e)*9*s - FX[e]*8*s, ey + DY(e)*9*s - FY[e]*8*s);
  ctx.quadraticCurveTo(ex - FX[e]*16*s, ey - FY[e]*16*s, ex - DX(e)*7*s - FX[e]*6*s, ey - DY(e)*7*s - FY[e]*6*s); ctx.closePath(); ctx.fill();
  // sırt dikenleri (gövdenin arkasında)
  ctx.fillStyle = P.spine; ctx.beginPath();
  for (let i = 2; i < n - 2; i += 2) {
    const f = i/(n - 1), w = TW[i], bx = TX[i] + DX(i)*w*0.8, by = TY[i] + DY(i)*w*0.8, h = (5 + 7*(1 - f))*s*(0.8 + 0.4*m.sav);
    ctx.moveTo(bx + FX[i]*3*s, by + FY[i]*3*s); ctx.lineTo(bx + DX(i)*h - FX[i]*4*s, by + DY(i)*h - FY[i]*4*s); ctx.lineTo(bx - FX[i]*3*s, by - FY[i]*3*s); ctx.closePath();
  }
  ctx.fill();
  // gövde
  ctx.fillStyle = P.body; ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(TX[i] + DX(i)*TW[i], TY[i] + DY(i)*TW[i]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(TX[i] - DX(i)*TW[i], TY[i] - DY(i)*TW[i]);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.4; ctx.stroke();
  // karın şeridi
  ctx.fillStyle = P.belly; ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(TX[i] - DX(i)*TW[i]*0.15, TY[i] - DY(i)*TW[i]*0.15);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(TX[i] - DX(i)*TW[i]*0.86, TY[i] - DY(i)*TW[i]*0.86);
  ctx.closePath(); ctx.fill();
  // pul halkaları
  ctx.strokeStyle = P.band; ctx.lineWidth = 2*s; ctx.beginPath();
  for (let i = 2; i < n - 1; i += 2) { ctx.moveTo(TX[i] + DX(i)*TW[i]*0.9, TY[i] + DY(i)*TW[i]*0.9); ctx.quadraticCurveTo(TX[i] - FX[i]*2*s, TY[i] - FY[i]*2*s, TX[i] - DX(i)*TW[i]*0.15, TY[i] - DY(i)*TW[i]*0.15); }
  ctx.stroke();
}
function drawSerpentHead(ctx, m, P){
  const j = m.jaw, k = m.sav, t = m.ph;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // yele zarı
  ctx.fillStyle = P.frill; ctx.beginPath(); ctx.moveTo(-1, -9);
  for (let i = 0; i < 5; i++) { const a = -2.0 - i*0.27 + Math.sin(t*3 + i)*0.07, L = 15 + i*1.6 + 3*k; ctx.lineTo(-5 + Math.cos(a)*L, -6 + Math.sin(a)*L); ctx.lineTo(-7 - i*2.4, -8 + i*0.6); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.spine; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 5; i++) { const a = -2.0 - i*0.27 + Math.sin(t*3 + i)*0.07, L = 15 + i*1.6 + 3*k; ctx.moveTo(-5, -6); ctx.lineTo(-5 + Math.cos(a)*L, -6 + Math.sin(a)*L); }
  ctx.stroke();
  // boynuzlar
  ctx.strokeStyle = P.horn; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(3, -10); ctx.quadraticCurveTo(-7, -18, -17, -19 - 4*k); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, -9.5); ctx.quadraticCurveTo(2, -15, -6, -16.5); ctx.stroke();
  // ağız içi ve alt çene
  if (j > 0.04) { ctx.fillStyle = P.mouth; ctx.beginPath(); ctx.moveTo(31, 2); ctx.lineTo(0, 3); ctx.lineTo(26, 4 + 15*j); ctx.closePath(); ctx.fill(); }
  ctx.save(); ctx.translate(0, 4); ctx.rotate(j*0.55);
  ctx.fillStyle = P.belly; ctx.beginPath(); ctx.moveTo(-4, 6); ctx.quadraticCurveTo(14, 9, 28, 0); ctx.lineTo(26, -1.5); ctx.quadraticCurveTo(12, 0, -2, -1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, 26, -1.4, 4, -0.8, m.nT, 3 + 2.5*k, -1); ctx.fill();
  ctx.restore();
  // üst kafa
  const head = () => { ctx.beginPath(); ctx.moveTo(34, 1); ctx.quadraticCurveTo(32, -6, 20, -8.5); ctx.quadraticCurveTo(8, -12.5, -6, -11); ctx.quadraticCurveTo(-12, -6, -10, 4); ctx.quadraticCurveTo(10, 4.5, 34, 1); ctx.closePath(); };
  ctx.fillStyle = P.body; head(); ctx.fill();
  ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, 32, 1.6, 6, 3.6, m.nT, 3 + 2.5*k, 1); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 1.3; head(); ctx.stroke();
  ctx.strokeStyle = P.band; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(2, -2, -2, 3); ctx.moveTo(2, -9.5); ctx.quadraticCurveTo(7, -3, 4, 3); ctx.stroke();
  scars(ctx, m, P);
  ctx.fillStyle = P.line; ctx.beginPath(); ctx.ellipse(29, -3.2, 1.4, 0.8, -0.3, 0, TAU); ctx.fill();
  // öfkeli göz
  ctx.fillStyle = '#1a0503'; ctx.beginPath(); ctx.ellipse(14, -5, 3.6, 2.6, -0.15, 0, TAU); ctx.fill();
  ctx.fillStyle = P.eyeC; ctx.beginPath(); ctx.ellipse(14, -5, 2.6, 1.9, -0.15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#120202'; ctx.beginPath(); ctx.ellipse(14.4, -5, 0.6, 1.8, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, -9.2); ctx.lineTo(19.5, -7); ctx.stroke();
}

function runePath(ctx, m){
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = -i*8.5, y = 0;
    switch (m.glyph[i]) {
      case 0: ctx.moveTo(x + 2.6, y); ctx.arc(x, y, 2.6, 0, TAU); ctx.moveTo(x + 1, y); ctx.arc(x, y, 1, 0, TAU); break;
      case 1: ctx.moveTo(x - 2.4, y - 2.4); ctx.lineTo(x - 2.4, y); ctx.quadraticCurveTo(x, y + 2.6, x + 2.4, y); ctx.lineTo(x + 2.4, y - 2.4); ctx.moveTo(x, y - 2.8); ctx.lineTo(x, y + 2.8); break;
      case 2: ctx.moveTo(x - 2.6, y - 1.2); ctx.quadraticCurveTo(x - 1.3, y - 2.6, x, y - 1.2); ctx.quadraticCurveTo(x + 1.3, y, x + 2.6, y - 1.2); ctx.moveTo(x - 2.6, y + 1.4); ctx.quadraticCurveTo(x - 1.3, y, x, y + 1.4); ctx.quadraticCurveTo(x + 1.3, y + 2.8, x + 2.6, y + 1.4); break;
      default: ctx.moveTo(x, y - 2.8); ctx.lineTo(x + 2.6, y + 2); ctx.lineTo(x - 2.6, y + 2); ctx.closePath(); ctx.moveTo(x + 0.7, y + 0.4); ctx.arc(x, y + 0.4, 0.7, 0, TAU); break;
    }
  }
}
function drawOrbs(ctx, m, P, cam){
  if (!m.orbs.length) return;
  ctx.fillStyle = '#e8ffff';
  for (const o of m.orbs) { ctx.beginPath(); ctx.arc(o.x - cam.x, o.y - cam.y, 4, 0, TAU); ctx.fill(); }
}
// Ocean Secret bekçisi: orikalkum kenarlı taş plakalardan bir nöbetçi; tek göz, yan bantta runeler.
function drawGuardian(ctx, m, P){
  const t = m.ph, rn = m.rune, fl = Math.sin(t*3)*2, hot = clamp(rn - 0.9, 0, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // uzak yan yüzgeç
  ctx.fillStyle = P.dark; ctx.beginPath(); ctx.moveTo(4, 9); ctx.lineTo(-15, 24 + fl); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
  // kuyruk halkaları, çatal yüzgeç ve kristal
  let ty = 0;
  ctx.strokeStyle = P.trim; ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    const x = -26 - i*7.5; ty = Math.sin(t*4 - i*0.8)*1.6*(i + 1);
    ctx.fillStyle = i%2 ? P.plate : P.body; ctx.beginPath(); ctx.moveTo(x + 4.5, ty - 5 + i); ctx.lineTo(x - 3.5, ty - 2.5 + i*0.5); ctx.lineTo(x - 3.5, ty + 2.5 - i*0.5); ctx.lineTo(x + 4.5, ty + 5 - i); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = P.plate; ctx.beginPath(); ctx.moveTo(-46, ty); ctx.lineTo(-59, ty - 11); ctx.lineTo(-54, ty); ctx.lineTo(-59, ty + 11); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.rune; ctx.beginPath(); ctx.moveTo(-47, ty - 2.6); ctx.lineTo(-52, ty); ctx.lineTo(-47, ty + 2.6); ctx.lineTo(-44.5, ty); ctx.closePath(); ctx.fill();
  // sırt tepeliği: üç orikalkum bıçak
  ctx.fillStyle = P.trim; ctx.beginPath();
  for (let i = 0; i < 3; i++) { const x = 9 - i*9; ctx.moveTo(x, -11.5); ctx.lineTo(x - 10 - i, -25 + i*3.5 - fl*0.5); ctx.lineTo(x - 6.5, -11); ctx.closePath(); }
  ctx.fill();
  // omurga levhası
  ctx.fillStyle = P.dark; ctx.beginPath(); ctx.moveTo(15, 11); ctx.lineTo(0, 18); ctx.lineTo(-15, 10.5); ctx.closePath(); ctx.fill();
  // gövde
  const hull = () => { ctx.beginPath(); ctx.moveTo(30, -2); ctx.lineTo(20, -12); ctx.lineTo(2, -13); ctx.lineTo(-14, -11); ctx.lineTo(-26, -5); ctx.lineTo(-26, 5); ctx.lineTo(-14, 11); ctx.lineTo(2, 13); ctx.lineTo(20, 11); ctx.lineTo(30, 3); ctx.closePath(); };
  ctx.fillStyle = P.body; hull(); ctx.fill();
  // miğfer plakası
  ctx.fillStyle = P.plate; ctx.beginPath(); ctx.moveTo(30, -2); ctx.lineTo(20, -12); ctx.lineTo(8, -12.6); ctx.lineTo(12, 0); ctx.lineTo(8, 12.4); ctx.lineTo(20, 11); ctx.lineTo(30, 3); ctx.closePath(); ctx.fill();
  // rune bandı
  ctx.fillStyle = P.dark; ctx.beginPath(); ctx.moveTo(6, -5.5); ctx.lineTo(-23, -4); ctx.lineTo(-23, 4); ctx.lineTo(6, 5.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(2, -13); ctx.lineTo(2, -5.5); ctx.moveTo(2, 5.5); ctx.lineTo(2, 13); ctx.moveTo(-14, -11); ctx.lineTo(-14, -4.5); ctx.moveTo(-14, 4.5); ctx.lineTo(-14, 11); ctx.stroke();
  ctx.strokeStyle = P.trim; ctx.lineWidth = 1.5; hull(); ctx.stroke();
  ctx.strokeStyle = P.trimHi; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(29, -2.5); ctx.lineTo(20, -11.2); ctx.lineTo(2, -12.2); ctx.stroke();
  // ön çene bıçakları: hücumda uzar
  ctx.fillStyle = hot > 0.2 ? P.trimHi : P.trim; ctx.beginPath();
  ctx.moveTo(26, 3); ctx.lineTo(37 + 4*hot, 8.5); ctx.lineTo(23, 8); ctx.closePath();
  ctx.moveTo(26, -2); ctx.lineTo(36 + 4*hot, -7.5); ctx.lineTo(23, -7); ctx.closePath(); ctx.fill();
  // yakın yüzgeç
  ctx.fillStyle = P.plate; ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(-13, 21 + fl); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.trim; ctx.lineWidth = 1; ctx.stroke();
  // runeler
  ctx.save(); ctx.translate(-1, 0);
  ctx.strokeStyle = P.rune; ctx.lineWidth = 1; ctx.globalAlpha = clamp(0.45 + 0.4*rn, 0, 1); runePath(ctx, m); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
  // tek göz
  ctx.fillStyle = '#081020'; ctx.beginPath(); ctx.ellipse(19, -1, 5.4, 4.6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = P.trimHi; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = P.rune; ctx.beginPath(); ctx.arc(20, -1, 2.3 + 0.4*Math.sin(t*5) + 1.1*hot, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(20.6, -1.7, 0.8, 0, TAU); ctx.fill();
}

function drawMimicHidden(ctx, m, sx, sy){
  DG.U.drawShape('chest', m.chest, sx, sy, DG.S.t + m.iph, 1);
  if (m.twA > 0) {
    // ince bir kıpırtı: kapak aralığında iki diş parlar
    const a = Math.sin(m.twA/0.3*Math.PI);
    ctx.fillStyle = `rgba(20,0,4,${0.85*a})`; ctx.fillRect(sx - 10, sy - 3.8, 20, 1.3);
    ctx.fillStyle = `rgba(255,245,220,${a})`; ctx.fillRect(sx - 5, sy - 3.6, 1, 1.5); ctx.fillRect(sx + 3, sy - 3.6, 1, 1.5);
  }
}
function drawMimic(ctx, m, P){
  const t = m.ph, o = m.open, ang = -o*1.2, k = m.sav, wk = m.walk;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // dokunaç bacaklar
  ctx.strokeStyle = P.leg; ctx.lineWidth = 2.2; ctx.beginPath();
  for (let i = 0; i < 4; i++) { const x0 = -8 + i*5.3, w = Math.sin(t*9 + i*1.7)*2.5*wk; ctx.moveTo(x0, 8); ctx.quadraticCurveTo(x0 + w - 2, 13, x0 + w*1.5 + (i - 1.5)*2.5, 16 + Math.cos(t*9 + i)*1.2*wk); }
  ctx.stroke();
  // ağız içi
  const lx = -11 + Math.cos(ang)*22, ly = -3 + Math.sin(ang)*22;
  ctx.fillStyle = P.maw; ctx.beginPath(); ctx.moveTo(-11, -3); ctx.lineTo(11, -3); ctx.lineTo(lx, ly); ctx.closePath(); ctx.fill();
  ctx.fillStyle = P.throat; ctx.beginPath(); ctx.ellipse(-6, -4 - 3*o, 4, 1 + 3*o, -0.5*o, 0, TAU); ctx.fill();
  // tek büyük göz (ağzın derinliğinde)
  if (o > 0.15) {
    const ex = -5, ey = -3 - 5.5*o, er = 2.9*o;
    ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(ex, ey, er + 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff6a2a'; ctx.beginPath(); ctx.arc(ex, ey, er*0.72, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0000'; ctx.beginPath(); ctx.ellipse(ex + 0.4, ey, 0.55*o + 0.1, er*0.8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(140,10,20,.8)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(ex - er, ey); ctx.lineTo(ex - er*0.5, ey + 0.6); ctx.moveTo(ex + er, ey - 0.3); ctx.lineTo(ex + er*0.55, ey + 0.5); ctx.stroke();
  }
  // dil
  if (o > 0.15) {
    const w = Math.sin(t*6)*2, w2 = Math.cos(t*5)*1.5;
    ctx.fillStyle = P.tongue; ctx.beginPath(); ctx.moveTo(-5, -3.5); ctx.quadraticCurveTo(5, -4 - 4*o, 12, -3);
    ctx.quadraticCurveTo(16 + w, -1, 15 + w, 4 + w2); ctx.quadraticCurveTo(13, 1, 10, -1.6); ctx.quadraticCurveTo(3, -2.2, -5, -2.4); ctx.closePath(); ctx.fill();
  }
  // sandık kutusu
  ctx.fillStyle = P.chest; ctx.fillRect(-11, -3, 22, 12);
  ctx.strokeStyle = P.chestD; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-11, 5); ctx.lineTo(11, 5); ctx.moveTo(-4.5, 2.5); ctx.lineTo(-4.5, 9); ctx.moveTo(5, 2.5); ctx.lineTo(5, 9); ctx.stroke();
  ctx.fillStyle = P.gold; ctx.fillRect(-11, 1, 22, 1.5); ctx.fillRect(-2, -3, 4, 6);
  ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, -9, -3, 11, -3, m.nT, 3.2 + 1.5*k, -1); ctx.fill();
  ctx.strokeStyle = P.chestD; ctx.lineWidth = 1; ctx.strokeRect(-11, -3, 22, 12);
  // menteşeli kapak
  ctx.save(); ctx.translate(-11, -3); ctx.rotate(ang);
  ctx.fillStyle = P.chest; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(11, -11, 22, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = P.chestD; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.fillStyle = P.gold; ctx.fillRect(0, -1.3, 22, 1.3);
  ctx.fillStyle = P.teeth; ctx.beginPath(); teethPath(ctx, 2, 0, 21, 0, m.nT - 1, 3 + 1.5*k, 1); ctx.fill();
  ctx.strokeStyle = P.weed; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(5, -5.2); ctx.quadraticCurveTo(3 + Math.sin(t*2)*2, -10, 5, -14); ctx.moveTo(8, -6.2); ctx.quadraticCurveTo(10, -10, 8 + Math.sin(t*2.4)*2, -12); ctx.stroke();
  ctx.restore();
}

function drawOcto(ctx, m, P){
  const rv = m.rv, t = m.ph, fl = m.flash > 0, camo = m.camo;
  const col = mixc(camo, m.realRGB, rv);
  const cBody = fl ? '#fff' : css(col), cArm = fl ? '#fff' : css(shade(col, 0.88)), cDark = fl ? '#fff' : css(shade(col, 0.62));
  const cSpot = fl ? '#fff' : css(mixc(shade(camo, 0.74), m.spotRGB, rv)), cLine = fl ? '#fff' : css(shade(col, 0.5), 0.3 + 0.5*rv);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // kollar: dıştakiler yüzeyde kıvrılır, içtekiler dalgıca uzanır
  if (rv > 0.03) {
    for (let pass = 0; pass < 2; pass++) for (let i = pass; i < 8; i += 2) {
      const side = i%4 < 2 ? -1 : 1, f = [0, 0.67, 0.33, 1][i%4] , ar = lerp(-0.8, 0.02, f);
      const base0 = side > 0 ? ar : -Math.PI - ar;
      const rw = clamp(m.reach*(1.2 - f*0.9), 0, 1);
      const a0 = lerpAng(base0, m.dla + (i%2 ? 0.1 : -0.1), rw);
      const len = lerp((13 + 26*rv)*(0.8 + 0.2*f) + Math.sin(t*1.3 + i)*2, Math.min(m.dll, 130), rw*0.95);
      const curl = -side*(1.7 + 1.1*f)*(1 - rw*0.85);
      let x = side*(2 + f*7), y = -2;
      const n = 9, sl = len/(n - 1);
      for (let q = 0; q < n; q++) {
        TX[q] = x; TY[q] = y;
        const u = q/(n - 1), a = a0 + curl*u*u*u + Math.sin(t*(2.3 + 2*rw) + i*1.7 - u*4.5)*(0.28 + 0.22*rw)*u + (m.squeeze > 0 ? Math.sin(m.squeeze*25 + i)*0.25*u : 0);
        x += Math.cos(a)*sl; y += Math.sin(a)*sl;
      }
      ctx.fillStyle = pass ? cArm : cDark; tube(ctx, n, (6*(1 - f*0.2))*rv + 0.7, 0.4); ctx.fill();
      if (pass && rv > 0.5 && !fl) {
        ctx.fillStyle = P.sucker; ctx.beginPath();
        for (let q = 1; q < n - 2; q++) {
          const dx = TX[q + 1] - TX[q], dy = TY[q + 1] - TY[q], l = Math.hypot(dx, dy) || 1, w = (6*(1 - f*0.2)*rv)*(1 - q/(n - 1))*0.55;
          const x2 = TX[q] + dy/l*w*side, y2 = TY[q] - dx/l*w*side, r = 0.5 + 0.7*(1 - q/n);
          ctx.moveTo(x2 + r, y2); ctx.arc(x2, y2, r, 0, TAU);
        }
        ctx.fill();
      }
    }
  }
  // manto: gizliyken kaya tümseği
  const bw = lerp(23, 12.5, rv), th = lerp(15, 31, rv), sq = m.squeeze > 0 ? Math.sin(m.squeeze*20)*1.5 : 0;
  const mant = () => { ctx.beginPath(); ctx.moveTo(-bw, 2); ctx.bezierCurveTo(-bw - 3*rv, -th*0.55, -bw*0.75, -th - sq, 0, -th - sq); ctx.bezierCurveTo(bw*0.75, -th - sq, bw + 3*rv, -th*0.55, bw, 2); ctx.closePath(); };
  ctx.fillStyle = cBody; mant(); ctx.fill();
  ctx.fillStyle = cSpot; ctx.beginPath();
  for (const s of m.spk) { const x = s[0]*bw, y = 1 - s[1]*th, r = s[2]*(0.8 + 0.3*rv); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  ctx.fill();
  ctx.strokeStyle = cLine; ctx.lineWidth = 1.2; mant(); ctx.stroke();
  if (rv < 0.6) { ctx.fillStyle = `rgba(0,0,0,${0.32*(1 - rv/0.6)})`; ctx.beginPath(); ctx.ellipse(m.cvx, -th*0.35, 4.5, 2.4, 0.3, 0, TAU); ctx.fill(); }
  if (rv > 0.08) {
    const eo = clamp((rv - 0.08)/0.6, 0, 1), ey = -th*0.42;
    for (const sg of [-1, 1]) {
      ctx.fillStyle = fl ? '#fff' : cDark; ctx.beginPath(); ctx.ellipse(sg*6.8, ey, 4.6, 4.2*eo + 0.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = fl ? '#fff' : P.eye; ctx.beginPath(); ctx.ellipse(sg*6.8, ey, 3.5, 3.3*eo + 0.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a0d00'; ctx.beginPath(); ctx.ellipse(sg*6.8, ey + 0.2, 2.6, 0.75*eo + 0.05, 0, 0, TAU); ctx.fill();
    }
    // çatık kaşlar: kas sırtı
    ctx.strokeStyle = fl ? '#fff' : cDark; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(-11.5, ey - 3.5*eo); ctx.quadraticCurveTo(-6.5, ey - 6.5*eo, -2.5, ey - 2.6*eo);
    ctx.moveTo(11.5, ey - 3.5*eo); ctx.quadraticCurveTo(6.5, ey - 6.5*eo, 2.5, ey - 2.6*eo); ctx.stroke();
  }
  if (m.hidden && m.twA > 0) {
    // gizliyken bir an aralanan göz kapakları
    const a = Math.sin(m.twA/0.35*Math.PI);
    ctx.strokeStyle = `rgba(255,214,90,${0.75*a})`; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(-9, -th*0.42); ctx.lineTo(-4, -th*0.42); ctx.moveTo(4, -th*0.42); ctx.lineTo(9, -th*0.42); ctx.stroke();
  }
}

function drawUrchin(ctx, m, P){
  const t = DG.S.t, n = 14;
  for (const b of m.balls) {
    const r = 7*b[2], cx = b[0], cy = b[1];
    ctx.strokeStyle = P.spine; ctx.lineWidth = 1.3; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = i*TAU/n + b[2]*3 + Math.sin(t*1.6 + i + b[0])*0.06, l = r*(2 + 0.25*Math.sin(i*2.3 + b[1]));
      ctx.moveTo(cx + Math.cos(a)*r*0.8, cy + Math.sin(a)*r*0.8); ctx.lineTo(cx + Math.cos(a)*l, cy + Math.sin(a)*l);
    }
    ctx.stroke();
    ctx.fillStyle = P.body; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = P.hi; ctx.beginPath(); ctx.arc(cx - r*0.3, cy - r*0.35, r*0.35, 0, TAU); ctx.fill();
    ctx.fillStyle = P.tip;
    for (let i = 0; i < n; i += 2) { const a = i*TAU/n + b[2]*3, l = r*2; ctx.fillRect(cx + Math.cos(a)*l - 0.8, cy + Math.sin(a)*l - 0.8, 1.6, 1.6); }
  }
}
function drawMine(ctx, m, P){
  // zincir aşağı sarkar
  ctx.strokeStyle = P.chain; ctx.lineWidth = 1.6; ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(Math.sin(m.ph*0.7)*3, 11 + m.chain); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = P.horn;
  for (let i = 0; i < 8; i++) {
    const a = i*TAU/8 + 0.2;
    ctx.save(); ctx.rotate(a); ctx.fillRect(9, -1.6, 6, 3.2); ctx.fillStyle = P.cap; ctx.fillRect(14, -2.4, 2.4, 4.8); ctx.fillStyle = P.horn; ctx.restore();
  }
  ctx.fillStyle = P.body; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
  ctx.fillStyle = P.rust; ctx.beginPath(); ctx.arc(-3, 3, 5, 0, TAU); ctx.arc(4, -4, 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(-4, -4, 3.5, 0, TAU); ctx.fill();
  const bl = Math.sin(DG.S.t*5 + m.seed*9) > 0.3;
  ctx.fillStyle = bl ? '#ff3b2f' : '#5a1410'; ctx.beginPath(); ctx.arc(0, -11, 2.2, 0, TAU); ctx.fill();
}

const BODY = {urchin:drawUrchin, mine:drawMine, jelly:drawJelly, eel:drawEelHead, shark:drawShark, angler:drawAngler, viper:drawViper, squid:drawSquid, serpent:drawSerpentHead, guardian:drawGuardian, mimic:drawMimic, octopus:drawOcto};

// ---------- karanlık üstü: gözler, biyoışık ----------
function eyeGlow(ctx, m, lx, ly, rgb, a, sz){
  const p = wpt(m, lx, ly), cam = DG.S.cam, x = p[0] - cam.x, y = p[1] - cam.y, s = Math.min(2.2, m.sc)*(sz || 1);
  glow(ctx, x, y, 12*s, rgb, a*0.8);
  ctx.globalAlpha = Math.min(1, a*1.3); ctx.fillStyle = `rgb(${rgb})`; ctx.beginPath(); ctx.arc(x, y, 1.35*s, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = Math.min(1, a*0.9); ctx.beginPath(); ctx.arc(x, y, 0.6*s, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
}
function eyes(ctx, m, a){
  const P = m.pal;
  switch (m.t) {
    case 'eel': eyeGlow(ctx, m, 5.5, -4.2, P.eyeG, a); break;
    case 'shark': if (m.s !== 'charge' && m.s !== 'tell') { eyeGlow(ctx, m, 24, -3, P.eyeG, a); eyeGlow(ctx, m, 27, -5.5, P.eyeG, a*0.45, 0.8); } break;
    case 'angler': eyeGlow(ctx, m, 7, -9, P.eyeG, a*0.6, 0.8); break;
    case 'viper': eyeGlow(ctx, m, 7, -1.6, P.eyeG, a, 0.9); eyeGlow(ctx, m, 9, -3.4, P.eyeG, a*0.45, 0.7); break;
    case 'squid': eyeGlow(ctx, m, 7, -2.5, P.eyeG, a, 1.2); eyeGlow(ctx, m, 9, -6, P.eyeG, a*0.4, 0.9); break;
    case 'serpent': eyeGlow(ctx, m, 14, -5, P.eyeG, a, 1.1); eyeGlow(ctx, m, 17, -8, P.eyeG, a*0.5, 0.9); break;
    case 'guardian': eyeGlow(ctx, m, 20, -1, P.eyeG, Math.max(a, 0.4)*(0.7 + 0.3*m.rune), 1.2); break;
    case 'mimic': if (!m.hidden && m.open > 0.15) eyeGlow(ctx, m, -5, -3 - 5.5*m.open, P.eyeG, a, 0.8); break;
    case 'octopus': if (m.rv > 0.4) { const ey = -lerp(15, 31, m.rv)*0.42; eyeGlow(ctx, m, -6.8, ey, P.eyeG, a*m.rv, 0.8); eyeGlow(ctx, m, 6.8, ey, P.eyeG, a*m.rv, 0.8); } break;
  }
}

// ---------- hasar ----------
function kill(m){
  if (m.dead) return;
  m.dead = true; m.hp = 0;
  try { DG.core.bounty(m); } catch (e) {}
  if (m.t === 'mine') { try { mineBlast(m); } catch (e) { console.error(e); } }
  const fx = DG.fx; if (!fx || !fx.burst) return;
  const big = m.size > 1 || m.t === 'serpent' || m.t === 'squid';
  fx.burst(m.x, m.y, m.pal.burst, big ? 22 : 12, big ? 260 : 180);
  fx.burst(m.x, m.y, '#ffffff', 6, 220);
  if (m.t === 'mimic') fx.burst(m.x, m.y, '#ffcf3a', 16, 240);
  if (m.t === 'squid') fx.burst(m.x, m.y, '#160a20', 18, 120);
  if (m.t === 'guardian') fx.burst(m.x, m.y, '#7ff4ff', 16, 280);
  if (m.t === 'serpent') for (let i = 3; i < m.seg.length; i += 4) fx.burst(m.seg[i].x, m.seg[i].y, m.pal.burst, 5, 140);
  if (m.size > 1 && fx.shake) fx.shake(5);
}

// ---------- dışa açık API ----------
DG.mon = {
  // Katın sabit canavar listesi: kat ve Yeni Sefer+ turuyla tohumlanır, her çağrıda aynı sırayla aynı canavarlar.
  // Her canavara m.rid (liste sırası) verilir; çekirdek öldürülenleri kayıtta tutar ve bir daha yaratmaz.
  spawnLayer(L, seed){
    // Canavar sayısı (engeller ve bekçiler hariç) hedefe göre ölçeklenir: ilk katta ~120, her katta %15 fazla.
    // Kat tablosundaki oranlar (hangi tür, katın neresinde) korunur.
    const out = [], ly = LAYERS[L], dens = 1 + 0.08*L, h = DG.U.LH(L), U = DG.U;
    let base = 0; for (const [t, f0, f1, per] of ly.mons) if (MON[t]) base += per*dens*(f1 - f0)*h/1000;
    const MON_K = base > 0 ? 120*Math.pow(1.15, L)/base : 1;
    const R0 = Math.random;
    Math.random = seeded(seed != null ? seed : L*7919 + 17);
    try {
      for (const [t, f0, f1, per] of ly.mons) {
        if (!MON[t]) continue;
        const n = Math.round(per*dens*MON_K*(f1 - f0)*h/1000);
        if (t === 'viper') {
          // sürüler halinde (her balık ayrı sayılır)
          let left = n;
          while (left > 0) {
            const g = Math.min(left, 3 + (Math.random()*3|0)); left -= g;
            const p = openSpot(L, f0, f1, 60); if (!p) continue;
            const lead = make(t, L, p[0], p[1]); out.push(lead);
            for (let i = 1; i < g; i++) {
              const f = make(t, L, p[0] + rnd(-40, 40), p[1] + rnd(-26, 26));
              f.lead = lead; f.offx = rnd(-46, 46); f.offy = rnd(-28, 28); f.hx = f.x; f.hy = f.y; out.push(f);
            }
          }
          continue;
        }
        for (let i = 0; i < n; i++) { const m = place(t, L, f0, f1); if (m) out.push(m); }
      }
      for (const [t, f0, f1, per] of (ly.obst || [])) {
        if (t === 'vent') continue;   // kırılmaz baca: spawnHazards()
        const n = Math.max(1, Math.round(per*dens*(f1 - f0)*h/1000));
        if (t === 'curtain') { for (let i = 0; i < n; i++) curtain(L, f0, f1, out); continue; }
        if (!MON[t]) continue;
        for (let i = 0; i < n; i++) { const m = place(t, L, f0, f1); if (m) out.push(m); }
      }
      keepers(L, out);
    } finally { Math.random = R0; }
    const list = out.filter(m => !safeGen(m.x, m.y) && (OBST[m.t] || !U.inLedge(m.x, m.y)));
    list.forEach((m, i) => { m.rid = i; });
    return list;
  },
  // Kırılmaz engeller (kızgın bacalar): katın tohumuyla hep aynı yerlerde. Çekirdek listeyi tutar, update/draw çağırır.
  spawnHazards(L, seed){
    const ly = LAYERS[L], out = [], U = DG.U, h = U.LH(L), top = U.LTOP[L], dens = 1 + 0.08*L;
    const R0 = Math.random;
    Math.random = seeded((seed != null ? seed : L*7919 + 17) ^ 0x5bd1e995);
    try {
      for (const [t, f0, f1, per] of (ly.obst || [])) {
        if (t !== 'vent') continue;
        const n = Math.max(1, Math.round(per*dens*(f1 - f0)*h/1000));
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < 8; k++) {
            const y = clamp(top + rnd(f0, f1)*h, top + 200, top + h - 200), side = Math.random() < 0.5 ? 0 : 1;
            const x = side ? WORLD_W - U.wallW(y, 1) + 2 : U.wallW(y, 0) - 2;
            if (safeGen(x + (side ? -60 : 60), y) || blocked(x, y, 60)) continue;
            out.push({t:'vent', L, x, y, dir:side ? -1 : 1, len:220 + 8*L, per:rnd(4.2, 6.2), off:rnd(0, 6), hitC:-1, k:0, st:0});
            break;
          }
        }
      }
    } finally { Math.random = R0; }
    return out;
  },
  // Baca döngüsü: 0..0.55 boşta, 0.55..0.75 hazırlık (kabarcık, kızıl ışık), 0.75..1 fışkırma (fışkırma başına en çok bir hasar).
  updateHazard(hz, dt){
    const S = DG.S, D = S.diver, c = (S.t + hz.off)/hz.per, ph = c - Math.floor(c), cyc = Math.floor(c);
    hz.st = ph < 0.55 ? 0 : ph < 0.75 ? 1 : 2;
    hz.k = hz.st === 2 ? Math.sin((ph - 0.75)/0.25*Math.PI) : hz.st === 1 ? (ph - 0.55)/0.2*0.4 : 0;
    if (hz.st === 2 && hz.k > 0.25 && hz.hitC !== cyc && S.playing && !S.riding && !DG.U.isSafe(D.x, D.y)) {
      const along = (D.x - hz.x)*hz.dir, len = hz.len*Math.min(1, hz.k*1.4), w = 14 + 30*clamp(along/hz.len, 0, 1);
      if (along > -6 && along < len + 10 && Math.abs(D.y - hz.y) < w + 10) {
        hz.hitC = cyc;
        DG.core.hurt(DG.core.dmgFor({t:'vent', L:hz.L, size:1}), MON.vent.n, {x:D.x - hz.dir*60, y:hz.y});
        if (DG.fx && DG.fx.burst) DG.fx.burst(D.x, D.y, '#ffb050', 10, 160);
      }
    }
  },
  drawHazard(ctx, hz, glowPass){
    const S = DG.S, cam = S.cam, x = hz.x - cam.x, y = hz.y - cam.y, d = hz.dir;
    if (y < -120 || y > S.H + 120) return;
    if (!glowPass) {
      // duvardaki kızgın ağız: koyu höyük, içinde çatlak
      ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.moveTo(x - d*4, y - 30); ctx.quadraticCurveTo(x + d*26, y - 18, x + d*30, y); ctx.quadraticCurveTo(x + d*26, y + 18, x - d*4, y + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hz.st ? '#ff7a2a' : '#7a2a14'; ctx.beginPath(); ctx.ellipse(x + d*26, y, 4, 9, 0, 0, TAU); ctx.fill();
      return;
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x + d*28, y, 30 + 30*hz.k, '255,110,40', 0.22 + 0.5*hz.k + (hz.st === 1 ? 0.25 : 0));
    if (hz.st === 1) {
      for (let i = 0; i < 5; i++) { const f = ((S.t*1.6 + i*0.2 + hz.off) % 1); glow(ctx, x + d*(30 + f*70), y + Math.sin(i*2.1 + S.t*6)*8, 5, '255,170,90', 0.7*(1 - f)); }
    } else if (hz.st === 2) {
      const len = hz.len*Math.min(1, hz.k*1.4), g = ctx.createLinearGradient(x + d*28, y, x + d*(28 + len), y);
      g.addColorStop(0, 'rgba(255,230,170,.75)'); g.addColorStop(0.35, 'rgba(255,130,50,.45)'); g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + d*26, y - 8);
      for (let i = 1; i <= 8; i++) { const f = i/8; ctx.lineTo(x + d*(26 + len*f), y - 8 - 34*f + Math.sin(S.t*20 + i)*4*f); }
      for (let i = 8; i >= 1; i--) { const f = i/8; ctx.lineTo(x + d*(26 + len*f), y + 8 + 34*f + Math.sin(S.t*18 + i*1.7)*4*f); }
      ctx.lineTo(x + d*26, y + 8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
  hazardLight(hz){ return hz.k > 0.05 ? {x:hz.x + hz.dir*(40 + hz.len*0.3*hz.k), y:hz.y, r:60 + 90*hz.k, k:0.5*Math.min(1, hz.k)} : null; },
  spawnAt(type, x, y, L, opts){
    if (!MON[type] || !DG.S) return null;
    const o = Object.assign({}, opts || {}), U = DG.U;
    if (o.ignoreSafe == null) o.ignoreSafe = !!(DG.boss && DG.boss.active && DG.boss.active());
    if (o.hunt == null) o.hunt = o.ignoreSafe;
    if (L == null) L = U.layerOf(y);
    let m;
    if (type === 'eel') { const side = x > WORLD_W/2 ? 1 : 0; o.side = side; m = make('eel', L, side ? WORLD_W - U.wallW(y, 1) + 3 : U.wallW(y, 0) - 3, y, o); }
    else if (type === 'octopus') { const side = x > WORLD_W/2 ? 1 : 0; o.anchor = side ? 'R' : 'L'; m = make('octopus', L, side ? WORLD_W - U.wallW(y, 1) + 1 : U.wallW(y, 0) - 1, y, o); }
    else m = make(type, L, x, y, o);
    if (o.vx) m.vx = o.vx; if (o.vy) m.vy = o.vy;
    if (o.hunt) {
      m.force = true; m.mem = 1e6;
      if (type === 'mimic') { m.hidden = false; m.rv = 1; go(m, 'hunt', 0.3); }
      else if (type === 'octopus') { m.hidden = false; m.rv = 1; go(m, 'grab', 0); }
      else if (m.s === 'idle' && type !== 'jelly' && type !== 'eel') go(m, ({shark:'hunt', angler:'stalk', viper:'coil', squid:'hunt', serpent:'hunt', guardian:'hunt'})[type] || 'idle', 0.4);
    }
    pose0(m);
    DG.S.mons.push(m);
    return m;
  },
  update(m, dt){
    if (m.dead) return;
    fr();
    m.ph += dt;
    if (m.cd > 0) m.cd -= dt;
    if (OBST[m.t]) { if (m.flash > 0) m.flash -= dt; if (m.hitT > 0) m.hitT -= dt; if (m.sq > 0) m.sq = Math.max(0, m.sq - dt*7); m.stun = 0; m.kx = m.ky = 0; AI[m.t](m, dt); return; }
    // sersemlik direnci: tek hedefli silahların üst üste sersemletmesi birikir, eşiği aşınca kısa bir bağışıklık başlar
    if (m.sImm > 0) m.sImm -= dt; else if (m.sAcc > 0) m.sAcc = Math.max(0, m.sAcc - dt*0.4);
    if (m.flash > 0) m.flash -= dt;
    if (m.sq > 0) m.sq = Math.max(0, m.sq - dt*7);
    if (m.hitT > 0) m.hitT -= dt;
    if (m.mem > 0) m.mem -= dt;
    if (m.chomp > 0) m.chomp -= dt*3;
    const kd = Math.exp(-dt*6);
    if (m.stun > 0) {
      // sersem: yapay zekâ durur, itme sürer
      m.stun -= dt;
      m.vx *= Math.exp(-dt*3); m.vy *= Math.exp(-dt*3);
      if (!ANCHORED[m.t] && !m.hidden) { move(m, dt); if (m.t === 'serpent') { let px = m.x, py = m.y; for (const s of m.seg) { const dx = s.x - px, dy = s.y - py, L = Math.hypot(dx, dy) || 1; if (L > m.gap) { s.x = px + dx/L*m.gap; s.y = py + dy/L*m.gap; } px = s.x; py = s.y; } } }
      m.kx *= kd; m.ky *= kd;
      if (m.t === 'squid' || m.t === 'serpent') poseRot(m, dt);
      else if (m.t === 'octopus') { setXf(m, Math.atan2(m.nx, -m.ny) + wob(m), m.sc, m.sc); }
      else if (m.t === 'eel') setXf(m, (m.dir > 0 ? m.aim : Math.PI - m.aim) + wob(m), m.sc, m.sc*m.dir);
      else if (m.t === 'jelly') { setXf(m, wob(m), m.sc, m.sc); m.ox = m.x; m.oy = m.y; }
      else if (!(m.t === 'mimic' && m.hidden)) poseFish(m, dt, 0, null, m.t === 'mimic' ? lerp(1/m.sc, 1.75, clamp(backOut(clamp(m.rv, 0, 1)), 0, 1.3)) : 1);
      return;
    }
    AI[m.t](m, dt);
    m.kx *= kd; m.ky *= kd;
  },
  radius(m){
    if (!MON[m.t]) return m.r || 16;
    if (m.t === 'mimic' && m.hidden) return 12;
    if (m.t === 'octopus') return MON.octopus.r*m.sc*(0.75 + 0.25*m.rv);
    return MON[m.t].r*m.sc;
  },
  isHidden(m){ return !!m.hidden; },
  lurking,
  reveal,
  damage(m, amt, o){
    if (!m || m.dead) return;
    o = o || {};
    amt = Math.max(0, +amt || 0);
    const S = DG.S, D = S.diver;
    m.hp -= amt; m.flash = 0.13; m.sq = 1; m.hitT = 2.4; m.mem = Math.max(m.mem, 5);
    if (m.hidden) reveal(m);
    const stun = OBST[m.t] ? 0 : o.stun != null ? o.stun : (o.kind === 'beam' ? 0 : 0.15);
    // Ağ, sonik, patlama, torpido ve kalkan her zaman tam sersemletir; zıpkın/tüfek ve ışın birikir ve bağışıklığa takılır.
    // Yoksa ateş altındaki canavar hiç ısıramıyordu.
    const cc = o.kind !== 'dart' && o.kind !== 'beam';
    if (stun > m.stun && (cc || !(m.sImm > 0))) {
      if (!cc) { m.sAcc = (m.sAcc || 0) + stun; if (m.sAcc > 1.2 - 0.6*m.sav) { m.sImm = 1.1; m.sAcc = 0; } }
      m.stun = stun;
    }
    let kx = o.kx, ky = o.ky;
    if (kx == null && ky == null) { const dx = m.x - D.x, dy = m.y - D.y, l = Math.hypot(dx, dy) || 1; kx = dx/l*140; ky = dy/l*140; if (o.kind === 'beam') { kx *= 0.05; ky *= 0.05; } }
    else { kx = kx || 0; ky = ky || 0; const l = Math.hypot(kx, ky); if (l > 0 && l < 3) { kx *= 220; ky *= 220; } }
    if (!ANCHORED[m.t]) {
      const mass = (MASS[m.t] || 1)*(m.size > 1 ? 1.8 : 1), l = Math.hypot(kx, ky), cap = 650;
      const f = l > cap ? cap/l : 1;
      m.kx += kx*f/mass; m.ky += ky*f/mass;
    }
    if (m.t === 'squid' && !m.inked && m.hp > 0 && m.hp < m.maxHp*0.5) { m.inked = true; inkCloud(m); go(m, 'flee', 1.2); }
    if (m.hp <= 0) kill(m);
  },
  draw(ctx, m){
    if (m.dead) return;
    fr();
    const S = DG.S, cam = S.cam, sx = m.ox - cam.x, sy = m.oy - cam.y;
    const mg = (m.t === 'serpent' ? 30 + m.seg.length*m.gap : 140*m.sc);
    if (sx < -mg || sx > S.W + mg) return;
    const P = m.flash > 0 ? FLASH : m.pal;
    ctx.save();
    switch (m.t) {
      case 'eel': drawEelBody(ctx, m, P, cam); break;
      case 'serpent': drawSerpentBody(ctx, m, P, cam); break;
      case 'squid': if (m.inks.length) drawInk(ctx, m, cam); break;
      case 'guardian': drawOrbs(ctx, m, P, cam); break;
      case 'octopus': m.camo = m.anch === 'F' ? ledgeRGB(m.li) : wallRGB(); break;
      case 'mimic': if (m.hidden && m.flash <= 0) { drawMimicHidden(ctx, m, sx, sy); ctx.restore(); return; } break;
    }
    ctx.translate(sx, sy); ctx.transform(m.fa, m.fb, m.fc, m.fd, 0, 0);
    BODY[m.t](ctx, m, P);
    ctx.restore();
    if (m.t === 'angler') drawLure(ctx, m, P, cam);
  },
  drawGlow(ctx, m, alpha){
    if (m.dead) return;
    fr();
    const S = DG.S, cam = S.cam, D = S.diver, sx = m.x - cam.x, sy = m.y - cam.y;
    const mg = m.t === 'serpent' ? 120 : 120*m.sc;
    if (sx < -mg || sx > S.W + mg) return;
    const P = m.pal, dk = clamp((alpha - 0.3)/0.5, 0, 1);
    const d = Math.hypot(m.x - D.x, m.y - D.y), inLight = d < F.light*0.6;
    const awake = m.s !== 'idle' && m.s !== 'hide';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (dk > 0) eyes(ctx, m, dk*(inLight ? 0.4 : 1)*(awake ? 1 : 0.6));
    switch (m.t) {
      case 'mine': {
        const bl = Math.max(0, Math.sin(S.t*5 + m.seed*9));
        glow(ctx, sx, m.y - 11*m.sc - cam.y, 14, '255,60,40', (0.25 + 0.6*dk)*bl);
      } break;
      case 'urchin': if (dk > 0) glow(ctx, sx, sy, 16*m.sc, '200,140,255', 0.18*dk*(0.7 + 0.3*Math.sin(S.t*2 + m.seed*7))); break;
      case 'jelly': if (dk > 0) {
        const p = wpt(m, 0, -6), pu = 0.75 + 0.25*Math.sin(m.ph*2.6);
        glow(ctx, p[0] - cam.x, p[1] - cam.y, 30*m.sc, P.glow, 0.34*dk*pu);
        if (m.L >= 5) for (let i = 0; i < 8; i++) { const q = wpt(m, lerp(-14, 14, i/7), 3); glow(ctx, q[0] - cam.x, q[1] - cam.y, 4*m.sc, P.glow, 0.7*dk*(0.6 + 0.4*Math.sin(S.t*4 + i))); }
      } break;
      case 'viper': if (dk > 0) {
        for (let i = 0; i < 6; i++) { const q = wpt(m, 7 - i*3.8, 3.4 - i*0.35); glow(ctx, q[0] - cam.x, q[1] - cam.y, 3.4*m.sc, P.photo, 0.75*dk); }
        const q = wpt(m, 5 + Math.sin(m.ph*3)*1.5, -19); glow(ctx, q[0] - cam.x, q[1] - cam.y, 7*m.sc, P.photo, 0.8*dk);
      } break;
      case 'angler': {
        const ll = lureLocal(m), q = wpt(m, ll[0], ll[1]), x = q[0] - cam.x, y = q[1] - cam.y, pu = 0.8 + 0.2*Math.sin(S.t*3 + m.seed*9);
        if (m.lureS) {
          // derin katlarda: hazine gibi parlayan yem
          glow(ctx, x, y, 16, P.lureG, (0.25 + 0.35*dk)*pu);
          if (dk > 0 && !inLight && m.flash <= 0) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.85*dk; DG.U.drawShape(m.lureS, m.lureC, x, y, S.t + m.iph, 1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter'; }
        } else {
          glow(ctx, x, y, 22*Math.min(1.5, m.sc), P.lureG, (0.45 + 0.5*dk)*pu);
          ctx.fillStyle = '#eafff8'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
        }
      } break;
      case 'guardian': {
        const k = Math.max(0.35, dk)*clamp(m.rune, 0, 1.8);
        ctx.save(); ctx.translate(m.ox - cam.x, m.oy - cam.y); ctx.transform(m.fa, m.fb, m.fc, m.fd, 0, 0); ctx.translate(-1, 0);
        ctx.strokeStyle = P.rune; ctx.lineWidth = 1.6; ctx.globalAlpha = Math.min(1, 0.5*k); runePath(ctx, m); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.restore();
        glow(ctx, sx, sy, 34*m.sc, P.runeG, 0.18*k);
        for (const o of m.orbs) { glow(ctx, o.x - cam.x, o.y - cam.y, 18, P.runeG, 0.9); }
      } break;
      case 'mimic': if (m.hidden && alpha > 0.2) {
        // hazine pırıltısının birebir aynısı
        ctx.fillStyle = `rgba(255,235,190,${0.3*(0.5 + 0.5*Math.sin(S.t*3 + m.iph*5))*alpha})`;
        ctx.beginPath(); ctx.arc(m.hx - cam.x, m.hy - cam.y, 2.2, 0, TAU); ctx.fill();
      } break;
      case 'squid': if (m.L >= 5 && dk > 0) for (const c of m.inks) {
        // derin kalamarın mürekkebi ışıldar
        const x = c.x - cam.x, y = c.y - cam.y, a = Math.min(1, c.a)*dk;
        glow(ctx, x, y, c.r*0.9, '70,200,190', 0.22*a);
        for (let i = 0; i < 7; i++) { const an = c.sd + i*2.1 + S.t*0.4, rr = c.r*(0.25 + 0.5*hsh(c.sd + i*3)); glow(ctx, x + Math.cos(an)*rr, y + Math.sin(an)*rr*0.8, 5, '120,255,230', 0.8*a*(0.5 + 0.5*Math.sin(S.t*6 + i))); }
      } break;
      case 'octopus': if (m.hidden && m.twA > 0 && dk > 0) {
        const a = Math.sin(m.twA/0.35*Math.PI)*dk;
        eyeGlow(ctx, m, -6.5, -6.3, P.eyeG, a*0.6, 0.6); eyeGlow(ctx, m, 6.5, -6.3, P.eyeG, a*0.6, 0.6);
      } break;
    }
    ctx.globalCompositeOperation = 'source-over';
    // sonar: kılık değiştirenler kırmızı çerçeveyle belli olur
    if (F.sonar && (m.hidden || (m.t === 'angler' && m.lureS))) {
      const pu = 0.55 + 0.35*Math.sin(S.t*7);
      ctx.strokeStyle = `rgba(255,70,60,${pu})`; ctx.lineWidth = 1.6;
      if (m.t === 'mimic') { const x = m.ox - cam.x, y = m.oy - cam.y; ctx.strokeRect(x - 15, y - 15, 30, 28); ctx.fillStyle = ctx.strokeStyle; ctx.font = '700 11px "Chakra Petch", monospace'; ctx.textAlign = 'center'; ctx.fillText('!', x, y - 19); }
      else if (m.t === 'octopus') { ctx.save(); ctx.translate(m.ox - cam.x, m.oy - cam.y); ctx.transform(m.fa, m.fb, m.fc, m.fd, 0, 0); ctx.lineWidth = 1.6/m.sc; ctx.beginPath(); ctx.moveTo(-27, 3); ctx.bezierCurveTo(-27, -12, -20, -21, 0, -21); ctx.bezierCurveTo(20, -21, 27, -12, 27, 3); ctx.closePath(); ctx.stroke(); ctx.restore(); }
      else { const ll = lureLocal(m), q = wpt(m, ll[0], ll[1]); ctx.beginPath(); ctx.arc(q[0] - cam.x, q[1] - cam.y, 13, 0, TAU); ctx.stroke(); }
    }
    if (!m.hidden) {
      const r = DG.mon.radius(m);
      // sersemlik yıldızları
      if (m.stun > 0.25) {
        const cx = sx, cy = sy - r - 9;
        ctx.fillStyle = '#ffe27a'; ctx.beginPath();
        for (let i = 0; i < 3; i++) { const an = S.t*5 + i*TAU/3; star4(ctx, cx + Math.cos(an)*11, cy + Math.sin(an)*3.5, 3.2); }
        ctx.fill();
      }
      // yaralıysa kısa süre can çubuğu
      if (m.hitT > 0 && m.hp < m.maxHp) {
        const w = clamp(28*m.sc, 22, 64), x = sx - w/2, y = sy - r - (m.stun > 0.25 ? 20 : 12), f = clamp(m.hp/m.maxHp, 0, 1);
        ctx.globalAlpha = Math.min(1, m.hitT*1.5);
        ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
        ctx.fillStyle = f > 0.5 ? '#ffb03a' : '#ff5a4e'; ctx.fillRect(x, y, w*f, 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  },
  lights(){
    const S = DG.S, out = [];
    if (!S || !S.mons || S.darkAlpha < 0.2) return out;
    fr();
    const cam = S.cam;
    for (const m of S.mons) {
      if (m.dead) continue;
      const sy = m.y - cam.y; if (sy < -120 || sy > S.H + 120) continue;
      const sx = m.x - cam.x; if (sx < -120 || sx > S.W + 120) continue;
      if (m.t === 'angler') { const ll = lureLocal(m), p = wpt(m, ll[0], ll[1]); out.push({x:p[0], y:p[1], r:(m.lureS ? 28 : 50)*Math.min(1.5, m.sc), k:0.5}); }
      else if (m.t === 'jelly') out.push({x:m.x, y:m.y, r:30*m.sc, k:0.26});
      else if (m.t === 'mine' && Math.sin(S.t*5 + m.seed*9) > 0.3) out.push({x:m.x, y:m.y - 11, r:34, k:0.35});
      else if (m.t === 'guardian') { out.push({x:m.x, y:m.y, r:54*m.sc, k:clamp(0.22*m.rune, 0.1, 0.4)}); for (const o of m.orbs) out.push({x:o.x, y:o.y, r:46, k:0.6}); }
    }
    return out;
  },
};
})();
