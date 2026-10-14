/* Dalgıç: sanat hattı (DG.art).
   assets/manifest.json'daki boyalı sprite'ları yükler; dosya yoksa (ya da file:// ile açıldıysa) hiçbir şey yapmaz,
   oyun tamamen prosedürel çizimle devam eder. Sprite geldikçe kendiliğinden devreye girer.
   Tek görüntüden ucuz "iskelet": sprite dikey (ya da yatay) şeritlere bölünür, şeritler yürüyen sinüs dalgasıyla
   kaydırılır (kuyruk tarafı daha çok). Yılan ve murena, gövde zincirleri boyunca şerit şerit kaplanır.
   Her sprite gereken cihaz pikseli boyutunda önceden küçültülüp önbelleğe alınır; shadowBlur/filter yok. */
(function () {
'use strict';
const DG = window.DG = window.DG || {};
const TAU = Math.PI*2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- yükleme ----------
let BASE = 'assets/';
try { const q = new URLSearchParams(location.search).get('art'); if (q) BASE = q.endsWith('/') ? q : q + '/'; } catch (e) {}
const SPR = Object.create(null);   // ad -> kayıt (sadece yüklenince)
const BGS = [];                    // kat -> kayıt
let nBg = 0, manifest = null;

function rec(def, img){
  return {img, iw:img.naturalWidth, ih:img.naturalHeight, w:+def.w || img.naturalWidth, h:+def.h || img.naturalHeight,
    ax:def.ax != null ? +def.ax : 0.5, ay:def.ay != null ? +def.ay : 0.5, fit:def.fit || null, cache:[], white:[]};
}
function loadOne(def, done){
  if (!def || !def.src) return;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const fin = () => { if (img.naturalWidth > 0) done(rec(def, img)); };
    if (img.decode) img.decode().then(fin, fin); else fin();
  };
  img.onerror = () => {};
  img.src = /^([a-z]+:|\/)/i.test(def.src) ? def.src : BASE + def.src;
}
// Yatay aynalı kopya (ör. kalamar: çizimde manto sağda, oyunda kollar +x'te).
function mirror(r){
  const c = document.createElement('canvas'); c.width = r.iw; c.height = r.ih;
  const g = c.getContext('2d'); g.translate(r.iw, 0); g.scale(-1, 1); g.drawImage(r.img, 0, 0);
  r.img = c; r.cache.length = 0; r.white.length = 0;
}
const MIRROR = {mon_squid:true};
function onSprite(name, r){
  const fl = r.fit && r.fit.flip != null ? r.fit.flip : MIRROR[name];
  if (fl) mirror(r);
  SPR[name] = r;
  if (name === 'logo') showLogo(r);
  if (name.startsWith('relic_')) { syncRelicCard(); relicIcons(); }
}
function boot(){
  if (!window.fetch) return;
  let p;
  try { p = fetch(BASE + 'manifest.json', {cache:'no-cache'}); } catch (e) { return; }
  p.then(r => r.ok ? r.json() : null).then(m => {
    if (!m || typeof m !== 'object') return;
    manifest = m;
    const sp = m.sprites || {};
    for (const name in sp) loadOne(sp[name], r => onSprite(name, r));
    // arka planlar büyük: sprite'lardan sonra sırayla
    const bg = m.bg || {}, keys = Object.keys(bg);
    let i = 0;
    const next = () => { if (i >= keys.length) return; const k = keys[i++]; loadOne(bg[k], r => { BGS[k|0] = r; nBg++; }); setTimeout(next, 120); };
    setTimeout(next, 400);
  }).catch(() => {});
}

// ---------- önceden küçültülmüş bitmap önbelleği ----------
// pw: istenen genişlik (cihaz pikseli). 2^(1/4) adımlı kovalar; görüntüden büyükse orijinal kullanılır.
function bitmap(r, pw, white){
  let b = Math.pow(2, Math.ceil(Math.log2(Math.max(8, pw))*4)/4);
  const list = white ? r.white : r.cache;
  if (b >= r.iw*0.85) {
    if (!white) return r.img;
    b = r.iw;
  }
  b = Math.round(b);
  for (let i = 0; i < list.length; i++) if (list[i].width === b) return list[i];
  const h = Math.max(1, Math.round(b*r.ih/r.iw));
  // büyük küçültmeleri yarıya yarıya yap (daha temiz kenar)
  let src = r.img, sw = r.iw, sh = r.ih;
  while (sw > b*2.2) {
    const c = document.createElement('canvas'); c.width = Math.round(sw/2); c.height = Math.round(sh/2);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height;
  }
  const c = document.createElement('canvas'); c.width = b; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, b, h);
  if (white) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, b, h); }
  list.push(c); if (list.length > 6) list.shift();
  return c;
}
// ctx'in o anki ölçeği (DPR dahil)
function curScale(ctx){ const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; }

// ---------- şerit deformasyonu ----------
// Dikey şeritler (sütunlar): u=0 sol (kuyruk), u=1 sağ (baş). Ofset y yönünde.
// amp: genlik (yerel birim), ph: faz, k: gövde boyunca dalga (rad), rig: sabit kalan oran,
// side: 0 kuyruk (sol) sallanır, 1 baş tarafı (sağ) sallanır (kalamar kolları).
function cols(ctx, bm, x0, y0, w, h, n, amp, ph, k, rig, side){
  const bw = bm.width, bh = bm.height, sw = bw/n, dw = w/n, ex = dw/sw;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5)/n, t = side ? u : 1 - u, f = t > rig ? Math.pow((t - rig)/(1 - rig), 1.6) : 0;
    const dy = amp ? amp*f*Math.sin(ph + t*k) : 0, sx = i*sw, s2 = Math.min(sw + 1, bw - sx);
    ctx.drawImage(bm, sx, 0, s2, bh, x0 + i*dw, y0 + dy, s2*ex, h);
  }
}
// Yatay şeritler (satırlar): v=0 üst, v=1 alt. Ofset x yönünde; alttan (dokunaçlar) itibaren artar.
function rows(ctx, bm, x0, y0, w, h, n, amp, ph, k, rig, lean){
  const bw = bm.width, bh = bm.height, sh = bh/n, dh = h/n, ey = dh/sh;
  for (let i = 0; i < n; i++) {
    const v = (i + 0.5)/n, f = v > rig ? Math.pow((v - rig)/(1 - rig), 1.4) : 0;
    const dx = f*(amp*Math.sin(ph + v*k) + lean), sy = i*sh, s2 = Math.min(sh + 1, bh - sy);
    ctx.drawImage(bm, 0, sy, bw, s2, x0 + dx, y0 + i*dh, w, s2*ey);
  }
}
// Zincir: (xs, ys) kuyruktan başa çoklu çizgi (ekran koordinatı). Sprite u0..1 aralığı yay uzunluğuyla eşlenir.
const CL = new Float32Array(72);
function chain(ctx, bm, xs, ys, n, u0, thick, flip, lift){
  let T = 0; CL[0] = 0;
  for (let i = 1; i < n; i++) { T += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); CL[i] = T; }
  if (T < 1) return;
  const bw = bm.width, bh = bm.height, base = ctx.getTransform(), ov = Math.min(thick*0.22, 4);
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i], L = Math.hypot(dx, dy);
    if (L < 0.01) continue;
    const ua = u0 + (1 - u0)*CL[i]/T, ub = u0 + (1 - u0)*CL[i + 1]/T, sx = ua*bw, sw = Math.max(0.5, (ub - ua)*bw);
    ctx.setTransform(base); ctx.translate(xs[i], ys[i]); ctx.rotate(Math.atan2(dy, dx)); if (flip) ctx.scale(1, -1);
    // dirseklerde boşluk kalmasın: her şerit biraz taşar
    const extra = i < n - 2 ? ov : 0, s2 = Math.min(sw*(1 + extra/L), bw - sx);
    if (s2 > 0) ctx.drawImage(bm, sx, 0, s2, bh, 0, -thick*(0.5 + (lift || 0)), s2*L/sw, thick);
  }
  ctx.setTransform(base);
}
const stripsFor = pw => pw < 50 ? 5 : pw < 120 ? 9 : pw < 260 ? 13 : 16;

// ---------- canavarlar ----------
// Yerel çerçeve (mon.js BODY): burun +x, m.fa..fd dönüşümü m.sc ölçeğini ve yönü içerir.
// x0/w: sprite'ın yerel x aralığı; cy: dikey merkez. Sprite oranı korunur. Manifestte "fit" ile ezilebilir.
const CFG = {
  shark:   {x0:-44, w:83, cy:-3, amp:4.5, fr:6.5, k:2.4, rig:0.35},
  angler:  {x0:-28, w:60, cy:-12, amp:2.4, fr:2.2, k:2.0, rig:0.45},   // çizimdeki yem ~ (27,-27)
  viper:   {x0:-26, w:42, cy:-3, amp:2.2, fr:9,   k:2.6, rig:0.35},
  guardian:{x0:-38, w:66, cy:9,  amp:1.6, fr:4,   k:2.0, rig:0.5},   // insansı zırh: baş ~ göz parıltısı (20,-1)
  squid:   {x0:-40, w:104, cy:0},    // aynalanır: manto solda, kollar sağda (+x); çizimdeki göz ~ (7,-2.5)
  mimic:   {x0:-17, w:34, cy:0},
  jelly:   {w:54, top:-24},          // dik: çan üstte
  octopus: {w:50, top:-36},          // dik: manto yukarıda (duvardan dışarı), kollar duvara sarkar
  eel:     {len:90},                 // gövde zinciri boyunca
  serpent: {minAspect:3, tip:26, lift:0.1},  // kıvrık çizim (en/boy < 3) prosedürel kalır; tip: burun ucu (yerel x), lift: çizimi sırta kaydır (göz ~ (14,-5))
};
function fitOf(r, t){ const c = CFG[t], f = r.fit; return f ? Object.assign({}, c, f) : c; }
function speedK(m){ return clamp(Math.hypot(m.vx || 0, m.vy || 0)/90, 0.3, 1.4); }
const css = c => Array.isArray(c) ? 'rgb(' + (c[0]|0) + ',' + (c[1]|0) + ',' + (c[2]|0) + ')' : c;
const hsh = n => { const s = Math.sin(n*127.1 + 311.7)*43758.5453; return s - Math.floor(s); };

function drawInk(ctx, m, cam){
  for (const c of m.inks) {
    if (c.a <= 0) continue;
    const x = c.x - cam.x, y = c.y - cam.y;
    ctx.fillStyle = 'rgba(12,4,18,' + Math.min(0.85, c.a) + ')'; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = c.sd + i*1.3, rr = c.r*(0.45 + 0.25*hsh(c.sd + i)); ctx.moveTo(x + Math.cos(a)*c.r*0.45 + rr, y + Math.sin(a)*c.r*0.4); ctx.arc(x + Math.cos(a)*c.r*0.45, y + Math.sin(a)*c.r*0.4, rr, 0, TAU); }
    ctx.fill();
  }
}
function wpt(m, lx, ly){ return [m.ox + m.fa*lx + m.fc*ly, m.oy + m.fb*lx + m.fd*ly]; }
const flipOf = m => (m.fa*m.fd - m.fb*m.fc) < 0;

// Sprite'la çizer; çizemezse false döner (orijinal prosedürel çizim çalışır).
function drawMon(ctx, m){
  const r = SPR['mon_' + m.t];
  if (!r || m.fa == null || !CFG[m.t]) return false;
  if (m.t === 'mimic' && m.hidden) return false;                     // sandık kılığı hazineyle birebir aynı kalmalı
  if (m.t === 'octopus' && (m.hidden || !(m.rv >= 0.5))) return false; // kaya kamuflajı prosedürel
  const S = DG.S, cam = S.cam, white = m.flash > 0;
  const sx = m.ox - cam.x, sy = m.oy - cam.y;
  const mg = m.t === 'serpent' ? 30 + m.seg.length*m.gap : 140*m.sc;
  if (sx < -mg || sx > S.W + mg) return true;

  if (m.t === 'eel' || m.t === 'serpent') {
    const c = fitOf(r, m.t);
    if (c.minAspect && r.w/r.h < c.minAspect) return false;
    return drawChainMon(ctx, m, r, white, cam);
  }

  const c = fitOf(r, m.t);
  ctx.save();
  if (m.t === 'squid' && m.inks && m.inks.length) drawInk(ctx, m, cam);
  if (m.t === 'guardian' && m.orbs && m.orbs.length) { ctx.fillStyle = '#e8ffff'; for (const o of m.orbs) { ctx.beginPath(); ctx.arc(o.x - cam.x, o.y - cam.y, 4, 0, TAU); ctx.fill(); } }
  if (m.t === 'octopus' && m.rv < 0.85) ctx.globalAlpha = clamp((m.rv - 0.5)/0.35, 0, 1);
  ctx.translate(sx, sy); ctx.transform(m.fa, m.fb, m.fc, m.fd, 0, 0);
  const w = c.w, h = w*r.h/r.w, k = curScale(ctx), bm = bitmap(r, w*k, white), n = stripsFor(w*k), ph = m.ph || 0;
  switch (m.t) {
    case 'jelly': {
      const p = m.pulse || 0;
      ctx.translate(0, c.top); ctx.scale(1 - 0.16*p, 1 + 0.2*p);
      rows(ctx, bm, -w/2, 0, w, h, n, 3.2, ph*2.1, 4, 0.3, clamp(-(m.vx || 0)*0.02, -0.5, 0.5)*h*0.25);
      break;
    }
    case 'squid': {
      if (m.reach > 0.05 && m.tl > 30) {
        // avlanma dokunaçları uzar: sprite'ın önüne iki ince kol (isabet mon.js'de aynı hatla)
        ctx.strokeStyle = white ? '#fff' : (m.pal && m.pal.arm) || '#c87a6a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath();
        for (const g of [-1, 1]) { ctx.moveTo(12, g*2.5); for (let i = 1; i <= 8; i++) { const f = i/8; ctx.lineTo(12 + m.tl*f, g*(2.5 + f*2*(1 - m.reach)) + Math.sin(ph*3.2 + f*5 + g)*4*f*(1 - m.reach*0.8)); } }
        ctx.stroke();
      }
      const j = m.jet || 0;
      ctx.scale(1 + 0.1*j, 1 - 0.16*j);
      cols(ctx, bm, c.x0, c.cy - h/2, w, h, n, 3*(1 - 0.6*(m.spread || 0)), ph*4, 6, 0.55, 1);
      break;
    }
    case 'mimic': {
      const o = m.open || 0;
      ctx.translate(0, c.cy); ctx.scale(1, 1 + 0.18*o); ctx.translate(0, -c.cy);
      rows(ctx, bm, c.x0, c.cy - h/2, w, h, n, 1.8*(m.walk || 0), ph*9, 3, 0.65, 0);
      break;
    }
    case 'octopus': {
      if (m.reach > 0.05) {
        // yakalamaya uzanan iki kol
        const len = Math.min(m.dll || 40, 130)*m.reach, a = m.dla != null ? m.dla : -Math.PI/2;
        ctx.fillStyle = white ? '#fff' : css(m.realRGB || [150, 70, 60]);
        for (const s of [-1, 1]) {
          const bx = s*4, by = -2, a2 = a + s*0.12, ex = bx + Math.cos(a2)*len, ey = by + Math.sin(a2)*len, nx = -Math.sin(a2), ny = Math.cos(a2);
          ctx.beginPath(); ctx.moveTo(bx + nx*5, by + ny*5); ctx.quadraticCurveTo((bx + ex)/2 + Math.sin(ph*3 + s)*6, (by + ey)/2, ex, ey); ctx.lineTo(bx - nx*5, by - ny*5); ctx.closePath(); ctx.fill();
        }
      }
      rows(ctx, bm, -w/2, c.top, w, h, n, 2.6, ph*2.3, 4.5, 0.4, 0);
      break;
    }
    default: {
      let fr = c.fr, amp = c.amp*speedK(m);
      if (m.t === 'shark' && m.s === 'charge') { fr = 15; amp = c.amp*1.4; }
      if (m.t === 'viper' && m.s === 'dart') fr = 22;
      const shiv = m.s === 'tell' ? Math.sin(ph*40)*0.6 : 0;
      cols(ctx, bm, c.x0, c.cy - h/2 + shiv, w, h, n, amp, ph*fr, c.k, c.rig, 0);
    }
  }
  ctx.restore();
  // yem çizimde var; sadece derin katlardaki hazine kılığı (lureS) ve vuruş parlaması ayrıca çizilir
  if (m.t === 'angler' && (m.lureS || white)) drawLure(ctx, m, cam, white);
  return true;
}
// mon.js'deki yem çiziminin aynısı (yemin ışığı ve parıltısı yine mon.js drawGlow'da)
function drawLure(ctx, m, cam, white){
  const ph = m.ph || 0, p = wpt(m, 27 + Math.sin(ph*1.7)*2.5, -27 + Math.cos(ph*2.1)*2), x = p[0] - cam.x, y = p[1] - cam.y;
  if (m.lureS && !white) { if (DG.U && DG.U.drawShape) DG.U.drawShape(m.lureS, m.lureC, x, y, DG.S.t + (m.iph || 0), 1); }
  else {
    ctx.fillStyle = white ? '#fff' : (m.pal && m.pal.lure) || '#eafff8'; ctx.beginPath(); ctx.arc(x, y, 3.6*Math.min(1.4, m.sc), 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.2, 0, TAU); ctx.fill();
  }
}
const CX = new Float32Array(72), CY = new Float32Array(72);
function drawChainMon(ctx, m, r, white, cam){
  const s = m.sc, k = curScale(ctx), c = fitOf(r, m.t);
  let n = 0;
  ctx.save();
  if (m.t === 'eel') {
    const dir = m.dir, hx = m.hx - cam.x, hy = m.hy - cam.y;
    // duvardaki in
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.ellipse(hx - dir*2, hy, 7*s, 13*s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3*s; ctx.beginPath(); ctx.ellipse(hx - dir*2, hy, 9.5*s, 15*s, 0, 0, TAU); ctx.stroke();
    const nb = wpt(m, -8, 0), e = m.ext || 0, ax = m.hx - dir*8;
    for (let i = 0; i < 10; i++) {
      const f = i/9;
      CX[n] = ax + (nb[0] - ax)*f - cam.x;
      CY[n] = m.hy + (nb[1] - m.hy)*f + Math.sin((m.ph || 0)*5 - f*6)*Math.min(14, e*0.08)*Math.sin(f*Math.PI) - cam.y; n++;
    }
    for (const lx of [4, 17]) { const p = wpt(m, lx, 0); CX[n] = p[0] - cam.x; CY[n] = p[1] - cam.y; n++; }
    // sprite'ın tam boyu: dışarıdaki kısım kısaysa kuyruk inde kalır, uzunsa sprite boyca gerilir
    let T = 0; for (let i = 1; i < n; i++) T += Math.hypot(CX[i] - CX[i - 1], CY[i] - CY[i - 1]);
    const Ls = Math.max(T, c.len*s), thick = clamp(c.len*s*r.h/r.w, 9*s, 24*s);
    chain(ctx, bitmap(r, Ls*k, white), CX, CY, n, 1 - T/Ls, thick, flipOf(m));
  } else {
    const sg = m.seg;
    for (let i = Math.min(sg.length, 68) - 1; i >= 0; i--) { CX[n] = sg[i].x - cam.x; CY[n] = sg[i].y - cam.y; n++; }
    CX[n] = m.x - cam.x; CY[n] = m.y - cam.y; n++;
    const p = wpt(m, c.tip, 0); CX[n] = p[0] - cam.x; CY[n] = p[1] - cam.y; n++;
    let T = 0; for (let i = 1; i < n; i++) T += Math.hypot(CX[i] - CX[i - 1], CY[i] - CY[i - 1]);
    const thick = clamp(T*r.h/r.w, 14*s, 44*s);
    chain(ctx, bitmap(r, T*k, white), CX, CY, n, 0, thick, flipOf(m), c.lift);
  }
  ctx.restore();
  return true;
}

// DG.mon.draw sarmalayıcı: sprite yoksa ya da özel durumda orijinal çalışır.
let wrapped = null;
function ensureWrap(){
  const M = DG.mon;
  if (!M || !M.draw || M.draw === wrapped) return;
  const o = M.draw;
  wrapped = M.draw = function (ctx, m){
    if (m && !m.dead && SPR['mon_' + m.t]) { try { if (drawMon(ctx, m)) return; } catch (e) { console.error(e); } }
    return o.call(this, ctx, m);
  };
}

// ---------- dalgıç ----------
const diverName = t => t <= 3 ? 'diver_0' : t <= 7 ? 'diver_1' : 'diver_2';
// Prosedürel dalgıcın ayak izi (bulk öncesi): yerel x -37..27 (palet ucu .. kask), dikey merkez -1. Baş +x.
const DIVER = {x0:-40, w:72, cy:-2};
function diver(ctx, x, y, bulk, tier){
  const nm = diverName(tier|0);
  let r = SPR[nm];
  if (!r) return false;
  // Elde boyalı silah sprite'ı varsa ve dalgıcın silahsız çizimi de varsa onu kullan (yoksa silah üstüne bindirilir).
  const cw = DG.S && DG.S.save && DG.S.save.curWpn;
  if (cw && SPR['wpn_' + cw] && SPR[nm + '_nogun']) r = SPR[nm + '_nogun'];
  const D = DG.S.diver, c = r.fit ? Object.assign({}, DIVER, r.fit) : DIVER;
  ctx.save(); ctx.translate(x, y); ctx.scale(D.flip*bulk, bulk); ctx.rotate(D.ang);
  if (D.inv > 0 && Math.floor(D.inv*12)%2) ctx.globalAlpha = 0.45;
  if (DG.wpn && DG.wpn.camoActive && DG.wpn.camoActive()) ctx.globalAlpha = 0.35;
  const w = c.w, h = w*r.h/r.w, k = curScale(ctx), bm = bitmap(r, w*k, false);
  const sp = clamp(Math.hypot(D.vx || 0, D.vy || 0)/110, 0.25, 1);
  cols(ctx, bm, c.x0, c.cy - h/2, w, h, stripsFor(w*k), 3.2*sp, (D.kick || 0)*3, 3.2, 0.5, 0);
  ctx.restore();
  return true;
}

// ---------- elde silah ----------
// wpn.js drawHeld'in yerel çerçevesi: kabza (0,0), namlu +x, birim = wsc() öncesi px; nişan sola dönünce y aynalanır.
// Prosedürel zıpkın tüfeği yaklaşık x -11..42 arasında. Manifestte "fit": {"x0", "w", "cy"} ile ezilebilir.
const WFIT = {x0:-14, w:50, cy:0};
function weapon(ctx, id){
  const r = SPR['wpn_' + id];
  if (!r) return false;
  const c = r.fit ? Object.assign({}, WFIT, r.fit) : WFIT;
  const w = c.w, h = w*r.h/r.w, k = curScale(ctx);
  ctx.drawImage(bitmap(r, w*k, false), c.x0, c.cy - h/2, w, h);
  return true;
}
// Arayüz için görüntü adresi (dükkân ikonları): yoksa null.
const srcCache = Object.create(null);
function src(name){
  const r = SPR[name];
  if (!r) return null;
  if (srcCache[name]) return srcCache[name];
  let u = r.img && r.img.src;
  if (!u && r.img && r.img.toDataURL) { try { u = r.img.toDataURL(); } catch (e) { u = null; } }
  return (srcCache[name] = u || null);
}

// ---------- hazineler, eserler ----------
const ISZ = {heart:34, chest:26, eye:26, ingot:25, amphora:24, statue:24, tablet:24, spear:26, crown:24};
function drawIcon(ctx, r, x, y, size, rot, sxk){
  const big = Math.max(r.w, r.h), w = size*r.w/big, h = size*r.h/big, bm = bitmap(r, w*curScale(ctx), false);
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sxk != null) ctx.scale(sxk, 1);
  ctx.drawImage(bm, -w*r.ax, -h*r.ay, w, h);
  ctx.restore();
}
function shape(ctx, s, c, x, y, time, scale){
  const r = SPR['item_' + s];
  if (!r) return false;
  const t = time || 0;
  let rot = Math.sin(t*1.1)*0.08, sxk = null, size = (ISZ[s] || 22)*(scale || 1);
  if (s === 'star') rot = t*0.2;
  else if (s === 'gear') rot = t*0.6;
  else if (s === 'coin') { rot = 0; sxk = Math.max(0.12, Math.abs(Math.cos(t*2))); }
  else if (s === 'heart') size *= 1 + Math.sin(t*3)*0.08;
  drawIcon(ctx, r, x, y, size, rot, sxk);
  return true;
}
// Genel tekil sprite (ör. secret_door): uzun kenarı `size` olacak şekilde çapaya göre çizer. Yoksa false.
function sprite(ctx, name, x, y, size, rot){
  const r = SPR[name];
  if (!r) return false;
  drawIcon(ctx, r, x, y, size, rot || 0, null);
  return true;
}
function relic(ctx, L, x, y, time, scale){
  const r = SPR['relic_' + L];
  if (!r) return false;
  const t = time || 0;
  drawIcon(ctx, r, x, y, 26*(scale || 1)*(1 + Math.sin(t*3)*0.04), Math.sin(t*1.2)*0.05, null);
  return true;
}

// ---------- tekne ----------
function ship(ctx, tier, L){
  const r = SPR['ship_' + tier];
  if (!r) return false;
  const w = 2.05*L, h = w*r.h/r.w;
  // ay: su çizgisi (y = 0). Prosedürel gövdenin merkezi x = 0.025*L.
  ctx.drawImage(bitmap(r, w*curScale(ctx), false), 0.025*L - w*r.ax, -h*r.ay, w, h);
  return true;
}

// ---------- arka plan ----------
const BG_ALPHA = [0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.4, 0.4, 0.4, 0.42];
// Arka plan dünya genişliğine oturtulur (ekrana değil): çizimdeki kaya kenarları gerçek duvarların yakınında kalır,
// dar telefon ekranında yüzülebilir suyun ortasında sahte "duvar" görünmez. Yatay paralaks 0.9, dikey: kat boyunca bir kez kayar.
function paintBg(ctx, r, a, f){
  const S = DG.S, W = S.W, H = S.H, WW = (DG.C && DG.C.WORLD_W) || 1400;
  let tw = Math.max(WW*1.06, W*1.1), th = tw*r.h/r.w;
  if (th < H*1.18) { th = H*1.18; tw = th*r.w/r.h; }
  const cx = W/2 + (WW/2 - (S.cam.x + W/2))*0.9;
  ctx.globalAlpha = a;
  ctx.drawImage(bitmap(r, tw*curScale(ctx), false), cx - tw/2, -(th - H)*f, tw, th);
}
let lastTier = -1;
function syncTier(){
  const t = DG.S && DG.S.save ? DG.S.save.tier|0 : 0;
  if (t !== lastTier && document.body) { lastTier = t; document.body.dataset.tier = t; }
}
// core render(): DG.fx.drawBack'ten hemen sonra. Karanlıktan önce çizilir.
function drawBack(ctx){
  ensureWrap(); syncTier();
  if (!nBg) return;
  const S = DG.S, U = DG.U, cam = S.cam;
  if (!U || !U.LTOP || !U.layerOf) return;
  const surf = -cam.y; if (surf >= S.H) return;
  const cy = Math.max(1, cam.y + S.H*0.5), L = U.layerOf(cy), top = U.LTOP[L], LHf = U.LH ? U.LH(L) : 4000;
  const f = clamp((cy - top)/LHf, 0, 1), FADE = 700, NLm = U.LTOP.length - 1;
  let L2 = -1, k2 = 0;
  if (L < NLm && U.LTOP[L + 1] - cy < FADE) { L2 = L + 1; k2 = 0.5*(1 - (U.LTOP[L + 1] - cy)/FADE); }
  else if (L > 0 && cy - top < FADE) { L2 = L - 1; k2 = 0.5*(1 - (cy - top)/FADE); }
  const r1 = BGS[L], r2 = L2 >= 0 ? BGS[L2] : null;
  if (!r1 && !r2) return;
  ctx.save();
  if (surf > 0) { ctx.beginPath(); ctx.rect(0, surf, S.W, S.H - surf); ctx.clip(); }
  const a = BG_ALPHA[L] != null ? BG_ALPHA[L] : 0.45;
  if (r1) paintBg(ctx, r1, a*(r2 ? 1 - k2 : 1), f);
  if (r2) paintBg(ctx, r2, a*k2, L2 > L ? 0 : 1);
  ctx.restore();
}

// ---------- final canavarı (boss.js'den çağrılır) ----------
// B = boss.js'nin bossArt() durumu: {H, nodes, PX, PY, NX, NY, RAD, N, jaw, eyeO, gillO, flashB, flashH}.
// Baş: boss_head yerel çerçevede (boss.js drawHead ile aynı dönüşüm). Çizim, isabet noktalarına göre yerleştirildi:
// göz kümesi (çizimde ~300,127 px) -> göz hedefi yakını (40,-33); x 0.47, y 0.56 yerel birim/px.
// Böylece solungaç (çizim 86,230) ~(-61,25) [hedef -49,13 r24], ağız (375,205) ~(75,11) [hedef 92,30 r30].
// Çizimin burnu prosedürel kafadan kısa: gözden (split px) öndeki kısım front/sx kadar yatay gerilir ki ağız ve burun
// hedefleri (92,30) ve (130,2) çizimin üstüne düşsün. Değerler 457x379 çizim içindir; manifestte boss_head.fit ile ezilebilir.
const BH = {x0:-101, y0:-104, sx:0.47, sy:0.56, split:330, front:0.62, hinge:[250, 195], tipY:185,
  eyes:[[328, 131, 9], [277, 119, 6], [213, 131, 7]]};
const BOSS_EYES = BH.eyes.map((e, i) => ({x:BH.x0 + e[0]*BH.sx, y:BH.y0 + e[1]*BH.sy, r:[11, 5.5, 7.5][i]}));
const BSEG = {tube:240/356, mid:230/356};   // boss_seg: gövde tüpünün yükseklik oranı ve merkezi (üstte dikenler)
const TAIL0 = 20;                           // boss_tail bu boğumdan kuyruk ucuna
const BX_ = new Float32Array(16), BY_ = new Float32Array(16);
function bossReady(){ return !!(SPR.boss_head && SPR.boss_seg); }
function bossBody(ctx, B, ox, oy){
  const rs = SPR.boss_seg, rt = SPR.boss_tail;
  if (!rs || !SPR.boss_head) return false;
  const N = B.N, PX = B.PX, PY = B.PY, NX = B.NX, nodes = B.nodes, RAD = B.RAD, k = curScale(ctx);
  const passes = B.flashB > 0 ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    const white = pass === 1;
    ctx.save();
    if (white) ctx.globalAlpha = Math.min(1, B.flashB*0.6);
    let segEnd = N - 1;
    if (rt) {
      // kuyruk: kalın uç TAIL0'da, yüzgeç ucu son boğumda
      let n = 0;
      for (let i = TAIL0; i < N; i++) { BX_[n] = PX[i] + ox; BY_[n] = PY[i] + oy; n++; }
      let T = 0; for (let i = 1; i < n; i++) T += Math.hypot(BX_[i] - BX_[i - 1], BY_[i] - BY_[i - 1]);
      chain(ctx, bitmap(rt, T*k, white), BX_, BY_, n, 0, T*rt.h/rt.w, nodes[TAIL0 + 4].roll > 0);
      segEnd = TAIL0 + 1;
    }
    // gövde boğumları: boss_seg kaplaması, baştan uzaklaştıkça incelir; baş tarafı en üstte kalsın diye kuyruktan başa
    const bm = bitmap(rs, 2*RAD[3]/BSEG.tube*k*rs.w/rs.h, white), bw = bm.width, bh = bm.height;
    const base = ctx.getTransform();
    let acc = 0;
    for (let i = segEnd - 1; i >= 0; i--) {
      const ax = PX[i] + ox, ay = PY[i] + oy, dx = PX[i + 1] - PX[i], dy = PY[i + 1] - PY[i], L = Math.hypot(dx, dy);
      if (L < 0.01) continue;
      const R = (RAD[i] + RAD[i + 1])*0.5, Hh = 2*R/BSEG.tube, tile = Hh*rs.w/rs.h, ov = Math.min(10, R*0.3);
      let sw = bw*(L + ov)/tile, sx = acc;
      acc = (acc + bw*L/tile)%bw;
      ctx.setTransform(base); ctx.translate(ax, ay); ctx.rotate(Math.atan2(dy, dx)); if (nodes[i].roll > 0) ctx.scale(1, -1);
      // kaplama tekrarı: kaynak sona taşarsa iki parça
      let dxo = 0;
      while (sw > 0.5) {
        const s2 = Math.min(sw, bw - sx), dw = s2*tile/bw;
        ctx.drawImage(bm, sx, 0, s2, bh, dxo, -Hh*BSEG.mid, dw, Hh);
        dxo += dw; sw -= s2; sx = 0;
      }
    }
    ctx.setTransform(base);
    ctx.restore();
  }
  return true;
}
let headWarp = null;
function warpHead(r){
  // ön kısmı gerilmiş kopya (bir kez)
  if (headWarp && headWarp.src === r) return headWarp.rec;
  if (r.fit) Object.assign(BH, r.fit);
  const sp = Math.min(BH.split, r.iw), fw = Math.round((r.iw - sp)*BH.front/BH.sx), W = sp + fw;
  const c = document.createElement('canvas'); c.width = W; c.height = r.ih;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(r.img, 0, 0, sp, r.ih, 0, 0, sp, r.ih);
  g.drawImage(r.img, sp, 0, r.iw - sp, r.ih, sp, 0, fw, r.ih);
  const rec = {img:c, iw:W, ih:r.ih, w:W, h:r.ih, cache:[], white:[]};
  headWarp = {src:r, rec};
  return rec;
}
function bossHead(ctx, B, ox, oy){
  const r0 = SPR.boss_head;
  if (!r0 || !SPR.boss_seg) return false;
  const r = warpHead(r0), H = B.H;
  ctx.save();
  ctx.translate(H.x + ox, H.y + oy); ctx.rotate(H.a); ctx.scale(1, H.rd);
  ctx.translate(BH.x0, BH.y0); ctx.scale(BH.sx, BH.sy);   // artık çizim pikseli koordinatı
  const bm = bitmap(r, r.iw*BH.sx*curScale(ctx)/BH.sx, false), W = r.iw, Hh = r.ih;
  const hx = BH.hinge[0], hy = BH.hinge[1], ty = BH.tipY;
  const paint = img => {
    // alt çene: menteşe çevresinde döner (çizim ~%55 açık)
    ctx.save(); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(W, ty); ctx.lineTo(W, Hh); ctx.lineTo(hx, Hh); ctx.closePath(); ctx.clip();
    ctx.translate(hx, hy); ctx.rotate((clamp(B.jaw, 0, 1) - 0.55)*0.5); ctx.translate(-hx, -hy);
    ctx.drawImage(img, 0, 0, W, Hh); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, ty); ctx.lineTo(hx, hy); ctx.lineTo(hx, Hh); ctx.lineTo(0, Hh); ctx.closePath(); ctx.clip();
    ctx.drawImage(img, 0, 0, W, Hh); ctx.restore();
  };
  paint(bm);
  // zırhlı göz kapakları: gözler kapalıyken koyulaşır
  const lid = clamp(1 - B.eyeO, 0, 1);
  if (lid > 0.03) {
    ctx.fillStyle = 'rgba(18,40,44,' + (0.88*lid).toFixed(3) + ')';
    for (const e of BH.eyes) { ctx.beginPath(); ctx.ellipse(e[0], e[1], e[2]*1.5, e[2]*1.2, 0, 0, TAU); ctx.fill(); }
  }
  if (B.flashH > 0) { ctx.globalAlpha = Math.min(1, B.flashH*0.7); paint(bitmap(r, r.iw*curScale(ctx), true)); }
  ctx.restore();
  return true;
}

// ---------- arayüz: logo, eser kartı ----------
function showLogo(r){
  const h1 = document.querySelector('#intro h1');
  if (!h1 || h1.querySelector('img')) return;
  const img = document.createElement('img');
  img.alt = 'DALGIÇ'; img.className = 'logoImg';
  img.onload = () => h1.classList.add('hasLogo');
  img.src = r.img.src;
  h1.insertBefore(img, h1.firstChild);
}
function syncRelicCard(){
  const card = document.getElementById('relicCard'), img = document.getElementById('rcImg'), nm = document.getElementById('rcName');
  if (!card || !img || !nm || card.hidden) return;
  const LAY = DG.data && DG.data.LAYERS;
  let L = -1;
  if (LAY) for (let i = 0; i < LAY.length; i++) if (LAY[i].relic && LAY[i].relic.n === nm.textContent) { L = i; break; }
  const r = L >= 0 ? SPR['relic_' + L] : null;
  if (r) { img.src = r.img.src; img.hidden = false; card.classList.add('hasArt'); }
  else { img.hidden = true; img.removeAttribute('src'); card.classList.remove('hasArt'); }
}
// Dükkân > Eserler: bulunan eserlerin kartına ikon (kartlar kat sırasıyla çizilir)
function relicIcons(){
  const grid = document.querySelector('#shopBody .relics');
  if (!grid) return;
  const cards = grid.children;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i], r = SPR['relic_' + i];
    if (!r || !c.classList.contains('found') || c.querySelector('.relIcon')) continue;
    const img = document.createElement('img'); img.className = 'relIcon'; img.alt = ''; img.src = r.img.src;
    c.insertBefore(img, c.firstChild);
  }
}
function watchCards(){
  if (!window.MutationObserver) return;
  const card = document.getElementById('relicCard'), shop = document.getElementById('shopBody');
  if (card) new MutationObserver(syncRelicCard).observe(card, {attributes:true, attributeFilter:['hidden']});
  if (shop) new MutationObserver(relicIcons).observe(shop, {childList:true});
}

DG.art = {
  drawBack, diver, ship, shape, relic, weapon, src, sprite,
  boss: {ready:bossReady, body:bossBody, head:bossHead, eyes:BOSS_EYES},
  has: name => !!SPR[name],
  ready: name => !!SPR[name],
  info: () => ({base:BASE, manifest:!!manifest, sprites:Object.keys(SPR), bg:BGS.map((b, i) => b ? i : -1).filter(i => i >= 0)}),
};
ensureWrap();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchCards); else watchCards();
boot();
})();
