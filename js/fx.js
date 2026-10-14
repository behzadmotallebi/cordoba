/* Dalgıç: görsel efektler.
   Gökyüzü (sakin gün / final fırtınası), su, katlara özgü uzak siluetler (iki paralaks derinliği),
   ışık hüzmeleri, kostik desen, deniz karı ve plankton, uzak balina/kaplumbağa/balık sürüleri,
   parçacıklar (enkaz, kabarcık, kıvılcım, patlama), hasar sayıları, sarsıntı ve ekran flaşı.
   Statik siluetler ekran dışı tuvallere bir kez çizilir ve önbellekte tutulur. */
(function () {
'use strict';
const DG = window.DG = window.DG || {};

// ---------- yardımcılar ----------
const TAU = Math.PI*2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a)*k;
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c, a) => a == null ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const hash = n => { const s = Math.sin(n*127.1)*43758.5453; return s - Math.floor(s); };
const rnd = (a, b) => a + Math.random()*(b - a);
const wrap = (v, m) => ((v % m) + m) % m;
function rng(seed){
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0)/4294967296; };
}
function mk(w, h){ const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const LAY = () => DG.data.LAYERS;

// ---------- kat paletleri ----------
// Uzak siluet tonları elle seçildi: body = gövde, rim = yukarıdan gelen ışığın yaladığı kenar.
// Sığ katlarda siluet sudan koyu, derin katlarda sudan bir tık açık (karanlıkta fenerle seçilsin).
const SIL = [
  {body:[18,82,110], rim:[118,206,228], weed:[20,96,92],  snow:[226,246,248]},
  {body:[10,48,76],  rim:[92,172,202],  weed:[14,64,72],  snow:[214,238,244]},
  {body:[7,30,46],   rim:[62,122,140],  snow:[200,226,226]},
  {body:[46,20,22],  rim:[150,82,62],   snow:[226,200,190]},
  {body:[32,38,62],  rim:[104,118,156], snow:[200,214,230]},
  {body:[22,32,50],  rim:[86,106,132],  snow:[196,212,226]},
  {body:[20,40,70],  rim:[124,200,246], glow:'150,225,255', snow:[200,232,255]},
  {body:[24,10,9],   rim:[118,46,24],   glow:'255,118,48',  snow:[190,170,160]},
  {body:[18,22,30],  rim:[72,84,102],   glow:'255,206,140', snow:[200,208,214]},
  {body:[14,20,36],  rim:[58,82,126],   glow:'110,185,255', snow:[190,214,240]},
  {body:[18,30,66],  rim:[92,146,226],  glow:'90,225,255',  snow:[180,236,255]},
];
const PLANKTON = ['130,235,255','130,235,255','120,230,240','120,220,255','120,220,255','110,225,255','160,225,255','140,230,255','130,240,220','110,180,255','110,235,255'];
function pal(L){
  const s = SIL[L] || SIL[0];
  return {
    body:css(s.body), rim:css(s.rim), dark:css(s.body.map(v => v*0.55)), mid:css(mixc(s.body, s.rim, 0.35)),
    lite:css(mixc(s.rim, [255, 255, 255], 0.3)), weed:css(s.weed || s.body), glow:s.glow || '150,225,255', B:s.body, R:s.rim,
  };
}

// ---------- çizim yardımcıları (sprite içi) ----------
function smoothClosed(g, pts){
  const n = pts.length;
  g.moveTo((pts[n - 1][0] + pts[0][0])/2, (pts[n - 1][1] + pts[0][1])/2);
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1)%n]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0])/2, (a[1] + b[1])/2); }
  g.closePath();
}
// Sırt profili: soldan sağa üst kenar noktaları (tepe xp'de).
function ridge(r, w, h, peakY, n, rough, xp){
  xp = xp == null ? 0.35 + r()*0.3 : xp;
  const pts = [], a = r()*6, b = r()*6;
  for (let i = 0; i <= n; i++) {
    const u = i/n, uu = u < xp ? u/xp*0.5 : 0.5 + (u - xp)/(1 - xp)*0.5, s = Math.pow(Math.sin(Math.PI*uu), 0.8);
    pts.push([u*w, h - (h - peakY)*s*(1 + rough*(Math.sin(i*1.9 + a)*0.13 + Math.sin(i*3.7 + b)*0.07))]);
  }
  return pts;
}
function topPath(g, pts, h){
  g.moveTo(pts[0][0], h + 6); g.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0])/2, (a[1] + b[1])/2); }
  const z = pts[pts.length - 1]; g.lineTo(z[0], z[1]); g.lineTo(z[0], h + 6); g.closePath();
}
function topY(pts, x){
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return lerp(a[1], b[1], (x - a[0])/((b[0] - a[0]) || 1)); }
  return pts[pts.length - 1][1];
}
// İki tonlu dolgu: önce kenar ışığı, sonra gövde sola-aşağı kaydırılmış (ışık sağ üstten gelir).
function lit(g, P, build, off, body){
  off = off == null ? 3 : off;
  g.fillStyle = P.rim; g.beginPath(); build(g); g.fill();
  g.save(); g.translate(-off*0.45, off); g.fillStyle = body || P.body; g.beginPath(); build(g); g.fill(); g.restore();
}
// İki tonlu çizgi (kaburga, direk, halat).
function litStroke(g, P, build, lw, off){
  off = off == null ? 1.4 : off;
  g.lineWidth = lw; g.strokeStyle = P.rim; g.save(); g.translate(off*0.6, -off); g.beginPath(); build(g); g.stroke(); g.restore();
  g.strokeStyle = P.body; g.beginPath(); build(g); g.stroke();
}
function clipTo(g, build, draw){ g.save(); g.beginPath(); build(g); g.clip(); draw(); g.restore(); }
function strata(g, P, x0, y0, x1, y1, gap, r, a){
  g.strokeStyle = P.dark; g.globalAlpha = a || 0.55; g.lineWidth = 1.6;
  for (let y = y0 + gap*r(); y < y1; y += gap*(0.7 + r()*0.6)) {
    g.beginPath(); g.moveTo(x0, y);
    for (let x = x0; x <= x1; x += 24) g.lineTo(x, y + Math.sin(x*0.03 + y)*2.5);
    g.stroke();
  }
  g.globalAlpha = 1;
}
function seagrass(g, P, r, pts, x0, x1, hMax){
  const blades = [];
  for (let x = x0; x < x1; x += 2.5 + r()*4) {
    const y = topY(pts, x) + 2, n = 2 + (r()*3 | 0), hh = hMax*(0.45 + r()*0.7);
    for (let k = 0; k < n; k++) blades.push([x + k*1.6, y, hh*(0.7 + r()*0.4), 3 + r()*9]);
  }
  g.lineCap = 'round';
  g.strokeStyle = P.weed; g.lineWidth = 1.9;
  g.beginPath();
  for (const [x, y, hh, lean] of blades) { g.moveTo(x, y); g.quadraticCurveTo(x + lean*0.2, y - hh*0.6, x + lean, y - hh); }
  g.stroke();
  g.strokeStyle = P.rim; g.globalAlpha = 0.45; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < blades.length; i += 3) { const [x, y, hh, lean] = blades[i]; g.moveTo(x + 0.8, y - hh*0.3); g.quadraticCurveTo(x + lean*0.2 + 0.8, y - hh*0.6, x + lean + 0.6, y - hh); }
  g.stroke(); g.globalAlpha = 1;
}
// Roma amforası (Dressel tipi): sivri dip, uzun gövde, keskin omuz, uzun boyun, boyuna paralel kulplar.
function amphoraPath(g, x, y, ang, L){
  const c = Math.cos(ang), s = Math.sin(ang);
  const half = [[-0.5, 0], [-0.43, 0.035], [-0.34, 0.07], [-0.18, 0.125], [0, 0.15], [0.11, 0.15], [0.16, 0.115], [0.2, 0.06], [0.42, 0.05], [0.45, 0.07], [0.5, 0.07]];
  const pts = half.concat(half.slice(1).reverse().map(([u, v]) => [u, -v]));
  const tp = pts.map(([u, v]) => [x + c*u*L - s*v*L, y + s*u*L + c*v*L]);
  g.moveTo(tp[0][0], tp[0][1]);
  for (let i = 1; i < tp.length; i++) g.lineTo(tp[i][0], tp[i][1]);
  g.closePath();
}
function amphora(g, P, x, y, ang, L){
  lit(g, P, gg => amphoraPath(gg, x, y, ang, L), 2);
  const c = Math.cos(ang), s = Math.sin(ang), pt = (u, v) => [x + c*u*L - s*v*L, y + s*u*L + c*v*L];
  g.strokeStyle = P.body; g.lineWidth = Math.max(1.4, L*0.03); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  for (const sg of [1, -1]) { const a = pt(0.42, 0.05*sg), b = pt(0.4, 0.115*sg), d = pt(0.2, 0.12*sg), e = pt(0.15, 0.1*sg); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]); g.lineTo(e[0], e[1]); }
  g.stroke();
}
// Sarkıt (dir 1) ya da dikit (dir -1): geniş taban, boğumlu yanlar, yuvarlak uç; hafif eğik.
function drip(g, x, y, len, wd, dir, seed){
  seed = seed == null ? x*0.37 : seed;
  const L = [], R = [], n = 9, lean = Math.sin(seed*3.1)*0.12;
  for (let i = 0; i <= n; i++) {
    const t = i/n, hw = Math.max(1.6, wd*Math.pow(1 - t, 0.85)*(1 + 0.16*Math.sin(t*9 + seed) + 0.08*Math.sin(t*21 + seed*2)));
    const cx = x + lean*t*len + Math.sin(t*5 + seed)*wd*0.12, cy = y + dir*t*len;
    L.push([cx - hw, cy]); R.push([cx + hw*(0.9 + 0.1*Math.sin(seed + t*7)), cy]);
  }
  const tip = L[n], pts = [...L.slice(0, n), [tip[0] + 1.6, tip[1] + dir*2], ...R.slice(0, n).reverse()];
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; g.quadraticCurveTo(a[0], a[1], (a[0] + b[0])/2, (a[1] + b[1])/2); }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.closePath();
}
function fan(g, x, y, ang, len, depth, r){
  if (depth <= 0 || len < 2) return;
  const x2 = x + Math.sin(ang)*len, y2 = y - Math.cos(ang)*len;
  g.moveTo(x, y); g.lineTo(x2, y2);
  const sp = 0.32 + r()*0.25;
  fan(g, x2, y2, ang - sp, len*(0.68 + r()*0.12), depth - 1, r);
  fan(g, x2, y2, ang + sp, len*(0.68 + r()*0.12), depth - 1, r);
}
// Mercan Mağaraları için soluk mercan yelpazeleri (uzaklıkta rengi suya karışır).
function coralFans(g, P, r, pts, w, n){
  const cols = [[200, 84, 96], [214, 128, 70], [168, 92, 190]];
  for (let i = 0; i < n; i++) {
    const x = w*(0.08 + r()*0.84), y = topY(pts, x) + 3, c = cols[(r()*3) | 0];
    g.strokeStyle = css(mixc(P.B, c, 0.42)); g.lineWidth = 1.3; g.beginPath();
    for (let k = -2; k <= 2; k++) fan(g, x, y, k*0.3 + (r() - 0.5)*0.2, 7 + r()*4, 4, r);
    g.stroke();
  }
}
function jagged(r, x0, y0, x1, y1, n, amp){
  const pts = [];
  for (let i = 0; i <= n; i++) { const k = i/n; pts.push([lerp(x0, x1, k) + (i && i < n ? (r() - 0.5)*amp : 0), lerp(y0, y1, k) + (i && i < n ? (r() - 0.5)*amp*0.6 : 0)]); }
  return pts;
}
function polyPath(g, pts){ g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function prism(g, P, x, y, ang, len, wd, meta, gk, crys){
  const s = Math.sin(ang), c = Math.cos(ang), tip = wd*0.85;
  const at = (u, v) => [x + s*v + c*u, y - c*v + s*u];   // u yana, v uzunlamasına
  const A = at(-wd/2, 0), B = at(-wd/2, len - tip), T = at(0, len), C = at(wd/2, len - tip), E = at(wd/2, 0), M0 = at(wd*0.08, 0), M1 = at(wd*0.08, len - tip*0.2);
  g.fillStyle = crys.dark; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(T[0], T[1]); g.lineTo(M1[0], M1[1]); g.lineTo(M0[0], M0[1]); g.closePath(); g.fill();
  g.fillStyle = crys.face; g.beginPath(); g.moveTo(M0[0], M0[1]); g.lineTo(M1[0], M1[1]); g.lineTo(T[0], T[1]); g.lineTo(C[0], C[1]); g.lineTo(E[0], E[1]); g.closePath(); g.fill();
  g.strokeStyle = crys.edge; g.lineWidth = 1.2; g.beginPath(); g.moveTo(M0[0], M0[1]); g.lineTo(M1[0], M1[1]); g.lineTo(T[0], T[1]); g.stroke();
  if (meta && gk) meta.glows.push({x:lerp(M1[0], T[0], 0.4), y:lerp(M1[1], T[1], 0.4), r:wd*1.5*gk, a:0.3, ph:x*0.13, sp:0.6 + (x%7)*0.1});
}
function hullPath(g, x0, x1, deck, keel, bowRake, sternR){
  g.moveTo(x0 + sternR, deck);
  g.lineTo(x1, deck - 6);
  g.quadraticCurveTo(x1 - bowRake*0.3, lerp(deck, keel, 0.6), x1 - bowRake, keel);
  g.lineTo(x0 + sternR*1.4, keel);
  g.quadraticCurveTo(x0 - sternR*0.2, keel - 4, x0, deck + (keel - deck)*0.25);
  g.quadraticCurveTo(x0, deck, x0 + sternR, deck);
  g.closePath();
}
function rivets(g, P, x0, x1, y0, y1, gx, a){
  g.strokeStyle = P.dark; g.globalAlpha = a || 0.6; g.lineWidth = 1;
  g.beginPath();
  for (let y = y0 + (y1 - y0)/3; y < y1 - 2; y += (y1 - y0)/3) { g.moveTo(x0, y); g.lineTo(x1, y); }
  for (let x = x0 + gx; x < x1; x += gx) { g.moveTo(x, y0 + 3); g.lineTo(x, y1 - 3); }
  g.stroke(); g.globalAlpha = 1;
}
function portholes(g, color, x0, x1, y, gap, rad){
  g.fillStyle = color; g.beginPath();
  for (let x = x0; x < x1; x += gap) { g.moveTo(x + rad, y); g.arc(x, y, rad, 0, TAU); }
  g.fill();
}
function propeller(g, P, x, y, R, rot, blades){
  g.fillStyle = P.body;
  for (let i = 0; i < blades; i++) {
    const a = rot + i*TAU/blades;
    g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath(); g.moveTo(0, -R*0.12); g.quadraticCurveTo(R*0.6, -R*0.42, R, -R*0.12); g.quadraticCurveTo(R*0.7, R*0.18, 0, R*0.12); g.closePath(); g.fill();
    g.restore();
  }
  g.fillStyle = P.mid; g.beginPath(); g.arc(x, y, R*0.18, 0, TAU); g.fill();
}

// ---------- siluet tarifleri ----------
// [genişlik, yükseklik, alt solma, üst solma, çizim(g, w, h, P, r, meta)]
const RECIPES = {
  sand: [
    [400, 240, 0.4, 0, (g, w, h, P, r) => {            // posidonia çayırı
      const pts = ridge(r, w, h, h*0.48, 12, 0.7);
      lit(g, P, gg => topPath(gg, pts, h));
      seagrass(g, P, r, pts, 10, w - 10, 30);
      g.fillStyle = P.body; for (let i = 0; i < 4; i++) { const x = w*(0.15 + r()*0.7), y = topY(pts, x); g.beginPath(); g.ellipse(x, y + 2, 7 + r()*8, 5 + r()*4, 0, 0, TAU); g.fill(); }
    }],
    [380, 240, 0.36, 0, (g, w, h, P, r) => {            // amfora yığını
      const pts = ridge(r, w, h, h*0.74, 10, 0.3, 0.5);
      const by = x => topY(pts, x);
      lit(g, P, gg => topPath(gg, pts, h));
      amphora(g, P, w*0.24, by(w*0.24) - 34, -Math.PI/2 + 0.08, 92);
      amphora(g, P, w*0.76, by(w*0.76) - 30, -Math.PI/2 + 0.62, 88);
      amphora(g, P, w*0.36, by(w*0.36) - 9, 0.14, 92);
      amphora(g, P, w*0.6, by(w*0.6) - 8, Math.PI - 0.08, 96);
      amphora(g, P, w*0.48, by(w*0.48) - 30, -0.05, 90);
      g.save(); g.translate(w*0.9, by(w*0.9) - 3); g.rotate(0.5); lit(g, P, gg => { gg.moveTo(-14, 6); gg.quadraticCurveTo(-12, -10, 0, -12); gg.lineTo(2, -18); gg.lineTo(7, -18); gg.lineTo(7, -10); gg.quadraticCurveTo(16, -6, 14, 6); gg.lineTo(6, 2); gg.lineTo(0, 8); gg.closePath(); }, 2); g.restore();
      seagrass(g, P, r, pts, 4, w*0.14, 20); seagrass(g, P, r, pts, w*0.9, w - 4, 24);
    }],
    [260, 340, 0.35, 0, (g, w, h, P, r) => {           // kaya iğnesi, gorgon yelpazesi
      const pts = [];
      for (let i = 0; i <= 10; i++) { const k = i/10; pts.push([w*0.2 + k*w*0.25 + (r() - 0.5)*14, h - k*(h*0.68)]); }
      const top = pts[pts.length - 1];
      for (let i = 1; i <= 10; i++) { const k = i/10; pts.push([top[0] + k*w*0.42 + (r() - 0.5)*14, top[1] + k*(h - top[1])]); }
      pts.push([w*0.95, h + 6], [w*0.1, h + 6]);
      lit(g, P, gg => smoothClosed(gg, pts));
      g.strokeStyle = P.body; g.lineCap = 'round';
      for (const [fx, fy, fa, fl] of [[top[0] + 4, top[1] + 6, 0.35, 15], [top[0] - 22, top[1] + 70, -0.75, 12], [top[0] + 30, top[1] + 96, 0.9, 10]]) {
        g.lineWidth = 1.5; g.beginPath(); for (let k = -2; k <= 2; k++) fan(g, fx, fy, fa + k*0.28, fl, 5, r); g.stroke();
      }
      g.strokeStyle = P.rim; g.globalAlpha = 0.3; g.lineWidth = 0.8; g.beginPath(); for (let k = -1; k <= 1; k++) fan(g, top[0] + 5, top[1] + 5, 0.35 + k*0.3, 15, 4, rng(3 + k)); g.stroke(); g.globalAlpha = 1;
      const base = ridge(r, w, h, h*0.86, 8, 0.4, 0.3);
      seagrass(g, P, r, base, 4, w - 4, 26);
    }],
  ],
  cave: [
    [210, 520, 0.28, 0.28, (g, w, h, P, r) => {         // sarkıt-dikit sütunu
      const cx = w/2, a = r()*6, b = r()*6, L = [], R = [];
      for (let i = 0; i <= 28; i++) {
        const y = i/28*h, k = Math.abs(y/h - 0.5)/0.5, wd = 15 + 64*Math.pow(k, 1.9);
        L.push([cx - wd + Math.sin(i*1.3 + a)*4 + Math.sin(i*0.5 + b)*3, y]); R.unshift([cx + wd*0.92 + Math.sin(i*1.1 + b)*5, y]);
      }
      const pp = [...L, ...R];
      lit(g, P, gg => smoothClosed(gg, pp), 3.5);
      clipTo(g, gg => smoothClosed(gg, pp), () => {
        g.strokeStyle = P.dark; g.globalAlpha = 0.45; g.lineWidth = 1.6;
        for (let i = 0; i < 7; i++) { const x = cx + (r() - 0.5)*50, y0 = h*(0.05 + r()*0.3); g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + 8, y0 + h*0.15, x - 8, y0 + h*0.3, x + (r() - 0.5)*10, y0 + h*(0.35 + r()*0.25)); g.stroke(); }
      });
      g.globalAlpha = 1;
    }],
    [340, 330, 0, 0.36, (g, w, h, P, r) => {            // tavandan sarkıtlar
      const top = [];
      for (let i = 0; i <= 12; i++) top.push([i/12*w, 62 + Math.sin(i*1.7 + r()*2)*16 + r()*10]);
      const list = [];
      for (let i = 0; i < 8; i++) list.push([w*(0.07 + i*0.122) + (r() - 0.5)*16, 40 + r()*(i%3 === 1 ? 200 : 110), 12 + r()*14]);
      list.sort((a, b) => b[1] - a[1]);
      for (const [x, len, wd] of list) lit(g, P, gg => drip(gg, x, topY(top, x) - 8, len, wd, 1), 2.5);
      g.fillStyle = P.body; g.beginPath(); g.moveTo(-6, -6); g.lineTo(w + 6, -6); for (let i = top.length - 1; i >= 0; i--) g.lineTo(top[i][0], top[i][1]); g.closePath(); g.fill();
    }],
    [340, 310, 0.4, 0, (g, w, h, P, r) => {            // dikit kümesi
      const pts = ridge(r, w, h, h*0.8, 8, 0.35);
      const list = [];
      for (let i = 0; i < 6; i++) list.push([w*(0.12 + i*0.155) + (r() - 0.5)*14, (i === 2 ? 210 : 70 + r()*110)*(i === 4 ? 0.5 : 1), 0]);
      for (const it of list) it[2] = 14 + it[1]*0.12 + r()*8;
      list.sort((a, b) => b[1] - a[1]);
      for (const [x, len, wd] of list) lit(g, P, gg => drip(gg, x, topY(pts, x) + 10, len, wd, -1), 3);
      lit(g, P, gg => topPath(gg, pts, h));
      coralFans(g, P, r, pts, w, 5);
    }],
  ],
  oldwreck: [
    [440, 260, 0.36, 0, (g, w, h, P, r) => {            // antik gemi kaburgaları
      const pts = ridge(r, w, h, h*0.8, 10, 0.25, 0.5);
      const x0 = w*0.14, x1 = w*0.82, ky = x => topY(pts, x) + 8;
      // kaburgalar: kumdan çıkan, aynı yöne kıvrılan sivri yaylar; ortada en uzun
      const rib = (gg, x, y, hh, bend, wd) => {
        gg.moveTo(x - wd, y); gg.quadraticCurveTo(x - wd - bend*0.2, y - hh*0.6, x + bend - 1.2, y - hh);
        gg.lineTo(x + bend + 1.2, y - hh + 2); gg.quadraticCurveTo(x + wd - bend*0.15, y - hh*0.55, x + wd, y); gg.closePath();
      };
      const ribs = [];
      for (let i = 0; i <= 10; i++) {
        const u = i/10, x = lerp(x0, x1, u), hh = (40 + 80*Math.sin(Math.PI*(0.1 + u*0.8)))*(i === 3 ? 0.42 : i === 7 ? 0.6 : 1);
        ribs.push([x, ky(x), hh, -hh*0.32 + (u - 0.5)*10]);
      }
      lit(g, P, gg => { for (const [x, y, hh, b] of ribs) rib(gg, x, y, hh, b, 4); }, 2);
      litStroke(g, P, gg => { gg.moveTo(x1 + 4, ky(x1)); gg.bezierCurveTo(x1 + 34, ky(x1) - 24, x1 + 40, ky(x1) - 80, x1 + 26, ky(x1) - 120); }, 7);
      litStroke(g, P, gg => { gg.moveTo(x0 - 4, ky(x0)); gg.quadraticCurveTo(x0 - 26, ky(x0) - 40, x0 - 18, ky(x0) - 76); }, 6);
      const plank = [];
      for (let i = 0; i <= 16; i++) { const x = lerp(x0 - 14, x1 + 12, i/16); plank.push([x, ky(x) - 6 - r()*12]); }
      lit(g, P, gg => { gg.moveTo(x0 - 14, ky(x0) + 10); for (const p of plank) gg.lineTo(p[0], p[1]); gg.lineTo(x1 + 12, ky(x1) + 10); gg.closePath(); }, 2);
      lit(g, P, gg => topPath(gg, pts.map(([x, y]) => [x, y + 12]), h));
      amphora(g, P, w*0.34, ky(w*0.34) + 2, 0.3, 32); amphora(g, P, w*0.6, ky(w*0.6) + 4, -0.15, 30);
    }],
    [320, 340, 0.36, 0, (g, w, h, P, r) => {            // kırık direkli enkaz
      const pts = ridge(r, w, h, h*0.8, 8, 0.3);
      lit(g, P, gg => topPath(gg, pts, h));
      g.save(); g.translate(w*0.5, h*0.78); g.rotate(-0.16);
      lit(g, P, gg => { gg.moveTo(-130, -10); gg.lineTo(120, -30); gg.quadraticCurveTo(110, 10, 80, 26); gg.lineTo(-110, 30); gg.quadraticCurveTo(-140, 20, -130, -10); gg.closePath(); });
      g.strokeStyle = P.dark; g.lineWidth = 1; g.globalAlpha = 0.6; g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(-120, -2 + k*9); g.lineTo(108, -20 + k*11); } g.stroke(); g.globalAlpha = 1;
      litStroke(g, P, gg => { gg.moveTo(-10, -18); gg.lineTo(30, -230); }, 6);
      litStroke(g, P, gg => { gg.moveTo(-50, -190); gg.lineTo(90, -150); }, 3.5);
      g.strokeStyle = P.body; g.lineWidth = 1; g.beginPath(); g.moveTo(28, -220); g.quadraticCurveTo(70, -120, 112, -28); g.moveTo(26, -215); g.quadraticCurveTo(-40, -100, -120, -14); g.moveTo(-48, -186); g.quadraticCurveTo(-60, -130, -66, -80); g.stroke();
      lit(g, P, gg => { gg.moveTo(-44, -184); gg.lineTo(80, -152); gg.lineTo(70, -110); gg.lineTo(52, -122); gg.lineTo(30, -96); gg.lineTo(10, -128); gg.lineTo(-20, -104); gg.lineTo(-30, -150); gg.closePath(); }, 2, P.mid);
      g.restore();
    }],
    [340, 250, 0.4, 0, (g, w, h, P, r) => {            // mahmuzlu antik kadırga
      const pts = ridge(r, w, h, h*0.74, 8, 0.35, 0.45);
      g.save(); g.translate(w*0.5, h*0.62); g.rotate(-0.12);
      g.strokeStyle = P.body; g.lineWidth = 2.6;
      g.beginPath(); for (let k = 0; k < 8; k++) { const x = -96 + k*26, br = k === 2 || k === 5; g.moveTo(x, 8); g.lineTo(x - 18, br ? 30 : 52); } g.stroke();
      lit(g, P, gg => {
        gg.moveTo(-122, -12); gg.lineTo(112, -16); gg.lineTo(128, -4); gg.lineTo(150, 8); gg.lineTo(154, 13); gg.lineTo(130, 17); gg.lineTo(118, 22);
        gg.quadraticCurveTo(0, 30, -112, 22); gg.quadraticCurveTo(-140, 14, -150, -18); gg.quadraticCurveTo(-156, -52, -138, -62); gg.quadraticCurveTo(-128, -64, -132, -54);
        gg.quadraticCurveTo(-142, -40, -134, -22); gg.closePath();
      }, 3);
      g.strokeStyle = P.dark; g.lineWidth = 1; g.globalAlpha = 0.6; g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(-118, -4 + k*8); g.quadraticCurveTo(0, k*8 + 2, 116, -8 + k*9); } g.stroke(); g.globalAlpha = 1;
      litStroke(g, P, gg => { gg.moveTo(-10, -14); gg.lineTo(-4, -96); }, 4.5);
      litStroke(g, P, gg => { gg.moveTo(-50, -84); gg.lineTo(40, -98); }, 2.5);
      g.restore();
      lit(g, P, gg => topPath(gg, pts.map(([x, y]) => [x, y + 16]), h));
    }],
  ],
  canyon: [
    [440, 320, 0.36, 0, (g, w, h, P, r) => {            // kızıl kaya kemeri
      const pts = [];
      for (let i = 0; i <= 18; i++) { const a = Math.PI + i/18*Math.PI, rr = 1 + (r() - 0.5)*0.12; pts.push([w/2 + Math.cos(a)*w*0.47*rr, h*0.95 + Math.sin(a)*h*0.82*rr]); }
      pts.push([w*0.98, h + 6], [w*0.02, h + 6]);
      const build = gg => smoothClosed(gg, pts);
      lit(g, P, build, 4);
      clipTo(g, build, () => strata(g, P, 0, h*0.1, w, h, 15, r, 0.5));
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(w*0.5, h*0.98, w*0.24, h*0.5, 0, Math.PI, TAU); g.fill(); g.restore();
      g.strokeStyle = P.rim; g.globalAlpha = 0.5; g.lineWidth = 2.5; g.beginPath(); g.ellipse(w*0.5 - 1, h*0.98 + 1, w*0.24, h*0.5, 0, Math.PI*1.55, Math.PI*1.98); g.stroke(); g.globalAlpha = 1;
    }],
    [320, 380, 0.34, 0, (g, w, h, P, r) => {            // peri bacaları
      const spires = [[0.26, 0.55, 26], [0.52, 0.85, 32], [0.76, 0.42, 22]];
      const base = ridge(r, w, h, h*0.82, 8, 0.3);
      lit(g, P, gg => topPath(gg, base, h));
      for (const [u, k, wd] of spires) {
        const x = w*u, top = h - h*k, by = topY(base, x) + 8, pts = [];
        for (let i = 0; i <= 8; i++) { const f = i/8, ww = wd*(1.6 - 0.8*f) + Math.sin(i*2.3 + u*9)*4; pts.push([x - ww, lerp(by, top, f)]); }
        for (let i = 8; i >= 0; i--) { const f = i/8, ww = wd*(1.5 - 0.8*f) + Math.sin(i*1.7 + u*5)*4; pts.push([x + ww, lerp(by, top, f)]); }
        const build = gg => smoothClosed(gg, pts);
        lit(g, P, build, 3);
        clipTo(g, build, () => strata(g, P, x - wd*2, top, x + wd*2, by, 12, r, 0.5));
        lit(g, P, gg => gg.ellipse(x + 3, top - 4, wd*1.25, 12, -0.08, 0, TAU), 3);
      }
    }],
    [400, 260, 0.38, 0, (g, w, h, P, r) => {            // basamaklı yalçın tepe
      const pts = [[0, h + 6], [w*0.06, h*0.62], [w*0.18, h*0.5], [w*0.22, h*0.3], [w*0.3, h*0.22], [w*0.62, h*0.2], [w*0.7, h*0.32], [w*0.76, h*0.36], [w*0.8, h*0.55], [w*0.94, h*0.66], [w, h + 6]];
      const fixed = pts.map(([x, y]) => [x + (r() - 0.5)*8, y + (r() - 0.5)*5]);
      const b2 = gg => polyPath(gg, fixed);
      lit(g, P, b2, 4);
      clipTo(g, b2, () => strata(g, P, 0, h*0.24, w, h, 11, r, 0.55));
      g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(w*0.47, h*0.62, 26, 30, 0, Math.PI, TAU); g.rect(w*0.47 - 26, h*0.62, 52, 20); g.fill(); g.restore();
    }],
  ],
  plane: [
    [380, 250, 0.36, 0, (g, w, h, P, r) => {            // kayaya yatmış avcı uçağı (üstten eğik)
      const pts = ridge(r, w, h, h*0.7, 9, 0.4);
      lit(g, P, gg => topPath(gg, pts, h));
      g.save(); g.translate(w*0.52, h*0.56); g.rotate(-0.22); g.scale(1, 0.6);
      lit(g, P, gg => { gg.moveTo(-34, -6); gg.lineTo(-64, -150); gg.lineTo(-44, -156); gg.lineTo(6, -10); gg.lineTo(6, 10); gg.lineTo(-30, 96); gg.lineTo(-38, 104); gg.lineTo(-46, 92); gg.lineTo(-52, 110); gg.lineTo(-62, 96); gg.lineTo(-34, 6); gg.closePath(); }, 4);
      lit(g, P, gg => gg.ellipse(-8, 0, 118, 15, 0, 0, TAU), 4);
      lit(g, P, gg => { gg.moveTo(-112, -4); gg.lineTo(-128, -48); gg.lineTo(-116, -50); gg.lineTo(-96, -4); gg.lineTo(-96, 4); gg.lineTo(-116, 50); gg.lineTo(-128, 48); gg.lineTo(-112, 4); gg.closePath(); }, 3);
      g.fillStyle = P.lite; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(20, -3, 18, 7, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = P.dark; g.lineWidth = 1.4; g.globalAlpha = 0.7; g.beginPath(); for (const x of [-60, -20, 50]) { g.moveTo(x, -13); g.lineTo(x, 13); } g.stroke(); g.globalAlpha = 1;
      g.restore();
      propeller(g, P, w*0.52 + Math.cos(-0.22)*112, h*0.56 + Math.sin(-0.22)*112*0.6, 20, 0.7, 3);
    }],
    [270, 370, 0.3, 0, (g, w, h, P, r) => {            // burnu kuma gömülü uçak (yandan)
      const pts = ridge(r, w, h, h*0.8, 8, 0.3, 0.4);
      g.save(); g.translate(w*0.42, h*0.7); g.rotate(-1.0);
      lit(g, P, gg => { gg.moveTo(-170, -6); gg.lineTo(-150, -9); gg.quadraticCurveTo(-60, -20, 40, -19); gg.quadraticCurveTo(84, -18, 96, -6); gg.lineTo(96, 8); gg.quadraticCurveTo(70, 18, 40, 17); gg.quadraticCurveTo(-60, 14, -150, 5); gg.lineTo(-170, 3); gg.closePath(); }, 4);
      lit(g, P, gg => { gg.moveTo(-150, -8); gg.lineTo(-178, -62); gg.quadraticCurveTo(-170, -68, -158, -64); gg.lineTo(-120, -14); gg.closePath(); }, 3);
      lit(g, P, gg => { gg.moveTo(-150, 0); gg.lineTo(-176, 6); gg.lineTo(-174, 12); gg.lineTo(-124, 8); gg.closePath(); }, 2);
      lit(g, P, gg => { gg.moveTo(-36, 4); gg.quadraticCurveTo(10, -4, 52, 2); gg.quadraticCurveTo(14, 12, -36, 10); gg.closePath(); }, 2);
      lit(g, P, gg => { gg.moveTo(10, -18); gg.quadraticCurveTo(26, -34, 52, -22); gg.lineTo(56, -17); gg.closePath(); }, 2, P.mid);
      g.strokeStyle = P.dark; g.lineWidth = 1.2; g.globalAlpha = 0.6; g.beginPath(); for (const x of [-110, -60, 66]) { g.moveTo(x, -16); g.lineTo(x, 14); } g.stroke(); g.globalAlpha = 1;
      g.restore();
      lit(g, P, gg => topPath(gg, pts, h));
      seagrass(g, P, r, pts, 10, w - 10, 12);
    }],
    [400, 220, 0.38, 0, (g, w, h, P, r) => {            // motorlu kanat parçası
      const pts = ridge(r, w, h, h*0.74, 9, 0.4);
      lit(g, P, gg => topPath(gg, pts, h));
      g.save(); g.translate(w*0.5, h*0.62); g.rotate(0.12);
      lit(g, P, gg => { gg.moveTo(-170, -6); gg.lineTo(150, -24); gg.quadraticCurveTo(166, -16, 160, -2); gg.lineTo(130, 8); gg.lineTo(110, 2); gg.lineTo(96, 14); gg.lineTo(70, 4); gg.lineTo(-160, 14); gg.closePath(); }, 3);
      for (const x of [-80, 40]) {
        lit(g, P, gg => { gg.moveTo(x - 30, -18); gg.quadraticCurveTo(x, -34, x + 56, -26); gg.lineTo(x + 60, -6); gg.lineTo(x - 30, -2); gg.closePath(); }, 3);
        propeller(g, P, x + 62, -16, 22, 1.2 + x*0.01, 3);
      }
      g.strokeStyle = P.dark; g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath(); for (let k = -150; k < 140; k += 22) { g.moveTo(k, -14 - k*0.06); g.lineTo(k + 2, 8 - k*0.03); } g.stroke(); g.globalAlpha = 1;
      g.restore();
    }],
  ],
  steelwreck: [
    [480, 270, 0.36, 0, (g, w, h, P, r) => {            // yan yatmış çelik gövde
      const pts = ridge(r, w, h, h*0.8, 10, 0.3);
      g.save(); g.translate(0, h*0.48); g.rotate(-0.07);
      const x0 = 30, x1 = w - 20;
      lit(g, P, gg => { gg.rect(x0 + 80, -58, 150, 30); gg.rect(x0 + 120, -84, 80, 28); gg.rect(x0 + 260, -42, 60, 16); }, 3, P.mid);
      lit(g, P, gg => { gg.moveTo(x0 + 205, -84); gg.lineTo(x0 + 190, -150); gg.lineTo(x0 + 226, -152); gg.lineTo(x0 + 236, -84); gg.closePath(); }, 3);
      g.fillStyle = P.dark; g.fillRect(x0 + 192, -146, 34, 9);
      litStroke(g, P, gg => { gg.moveTo(x0 + 60, -30); gg.lineTo(x0 + 48, -170); gg.moveTo(x0 + 330, -26); gg.lineTo(x0 + 350, -140); }, 3);
      g.strokeStyle = P.body; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x0 + 48, -168); g.lineTo(x0 + 205, -150); g.lineTo(x0 + 350, -138); g.stroke();
      lit(g, P, gg => hullPath(gg, x0, x1, -28, 56, 46, 22), 4);
      rivets(g, P, x0 + 20, x1 - 40, -24, 52, 26, 0.55);
      portholes(g, P.dark, x0 + 40, x1 - 60, -12, 16, 2.4);
      g.restore();
      lit(g, P, gg => topPath(gg, pts, h));
    }],
    [260, 450, 0.32, 0, (g, w, h, P, r) => {            // dikine yükselen pruva
      const pts = ridge(r, w, h, h*0.86, 6, 0.3);
      g.save(); g.translate(w*0.5, h*0.96); g.rotate(0.2);
      const hull = gg => { gg.moveTo(-62, 0); gg.lineTo(-54, -330); gg.quadraticCurveTo(-30, -392, 6, -410); gg.quadraticCurveTo(14, -300, 40, -170); gg.quadraticCurveTo(62, -70, 70, 0); gg.closePath(); };
      lit(g, P, hull, 4);
      clipTo(g, hull, () => rivets(g, P, -60, 70, -400, 0, 26, 0.42));
      g.fillStyle = P.dark; g.beginPath(); g.ellipse(-12, -318, 6, 8, 0.2, 0, TAU); g.fill();
      g.strokeStyle = P.body; g.lineWidth = 2.4; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(-12, -312); g.quadraticCurveTo(-34, -200, -26, -120); g.stroke(); g.setLineDash([]);
      lit(g, P, gg => { gg.moveTo(-30, -124); gg.lineTo(-22, -124); gg.lineTo(-22, -96); gg.quadraticCurveTo(-8, -98, -4, -110); gg.lineTo(-2, -104); gg.quadraticCurveTo(-12, -86, -26, -86); gg.quadraticCurveTo(-40, -86, -50, -104); gg.lineTo(-48, -110); gg.quadraticCurveTo(-42, -98, -30, -96); gg.closePath(); }, 1.5);
      g.strokeStyle = P.body; g.lineWidth = 1.4; g.beginPath(); for (let k = 0; k < 9; k++) { const y = -320 + k*34; g.moveTo(-54 - k*0.9, y); g.lineTo(-66 - k*0.9, y); } g.moveTo(-66, -320); g.lineTo(-74, -48); g.stroke();
      g.restore();
      lit(g, P, gg => topPath(gg, pts, h));
    }],
    [440, 250, 0.36, 0, (g, w, h, P, r) => {            // ikiye kırılmış gövde
      const pts = ridge(r, w, h, h*0.82, 10, 0.3);
      g.save(); g.translate(0, h*0.5);
      g.save(); g.rotate(0.06);
      const brk = jagged(r, 210, -36, 196, 56, 6, 22);
      lit(g, P, gg => { gg.moveTo(30, -26); gg.lineTo(brk[0][0], brk[0][1]); for (const p of brk) gg.lineTo(p[0], p[1]); gg.lineTo(56, 56); gg.quadraticCurveTo(20, 50, 22, 0); gg.closePath(); }, 4);
      rivets(g, P, 40, 190, -22, 52, 24, 0.5); portholes(g, P.dark, 60, 180, -10, 15, 2.2);
      g.restore();
      g.save(); g.translate(250, 10); g.rotate(-0.12);
      const brk2 = jagged(r, 10, -46, 0, 50, 6, 22);
      lit(g, P, gg => { gg.moveTo(brk2[0][0], brk2[0][1]); gg.lineTo(150, -52); gg.quadraticCurveTo(140, 0, 110, 46); for (let i = brk2.length - 1; i >= 0; i--) gg.lineTo(brk2[i][0], brk2[i][1]); gg.closePath(); }, 4);
      rivets(g, P, 20, 130, -42, 44, 24, 0.5);
      g.strokeStyle = P.body; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < 5; k++) { g.moveTo(-6 - k*3, -40 + k*20); g.lineTo(-24 - k*2, -46 + k*20); } g.stroke();
      g.restore();
      g.restore();
      lit(g, P, gg => topPath(gg, pts, h));
    }],
  ],
  crystal: [
    [300, 380, 0.34, 0, (g, w, h, P, r, meta) => {       // kristal kuleleri
      const crys = crystalPal(P);
      const pts = ridge(r, w, h, h*0.78, 9, 0.5);
      const list = [[0.5, -0.05, 300, 40], [0.36, -0.32, 200, 30], [0.64, 0.28, 220, 32], [0.24, -0.55, 120, 22], [0.78, 0.5, 130, 22], [0.44, 0.2, 140, 22], [0.58, -0.22, 110, 18]];
      list.sort((a, b) => a[2] - b[2]).reverse();
      for (const [u, a, len, wd] of list) prism(g, P, w*u, topY(pts, w*u) + 18, a, len*(0.85 + r()*0.2), wd, meta, 1, crys);
      lit(g, P, gg => topPath(gg, pts, h));
    }],
    [320, 320, 0, 0.32, (g, w, h, P, r, meta) => {       // sarkan kristaller
      const crys = crystalPal(P), top = [];
      for (let i = 0; i <= 10; i++) top.push([i/10*w, 54 + Math.sin(i*1.4 + r()*3)*14]);
      for (let i = 0; i < 8; i++) { const x = w*(0.08 + i*0.12), y = topY(top, x) - 10; prism(g, P, x, y, Math.PI + (r() - 0.5)*0.7, 60 + r()*170, 14 + r()*16, meta, 0.8, crys); }
      g.fillStyle = P.body; g.beginPath(); g.moveTo(-6, -6); g.lineTo(w + 6, -6); for (let i = top.length - 1; i >= 0; i--) g.lineTo(top[i][0], top[i][1]); g.closePath(); g.fill();
    }],
    [340, 300, 0.36, 0, (g, w, h, P, r, meta) => {       // kristal taçlı kaya
      const crys = crystalPal(P), cx = w*0.5, cy = h*0.72;
      const pts = []; for (let i = 0; i < 16; i++) { const a = i/16*TAU, rr = 1 + (r() - 0.5)*0.2; pts.push([cx + Math.cos(a)*w*0.4*rr, cy + Math.sin(a)*h*0.3*rr]); }
      const list = [];
      for (let i = 0; i < 9; i++) { const u = (i + 0.5)/9, a = (u - 0.5)*2.2 + (r() - 0.5)*0.2, x = cx + (u - 0.5)*w*0.6; list.push([x, cy - h*0.2 + Math.abs(u - 0.5)*h*0.2, a, (i === 4 ? 150 : 50 + r()*80)*(1 - Math.abs(u - 0.5)*0.6), i === 4 ? 26 : 12 + r()*10]); }
      list.sort((a, b) => a[3] - b[3]);
      for (const [x, y, a, len, wd] of list) prism(g, P, x, y + 14, a, len, wd, len > 90 ? meta : null, 0.9, crys);
      lit(g, P, gg => smoothClosed(gg, pts), 4);
      g.strokeStyle = P.dark; g.lineWidth = 1.5; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(cx - 60, cy - 10); g.lineTo(cx - 30, cy + 14); g.lineTo(cx - 40, cy + 40); g.moveTo(cx + 50, cy); g.lineTo(cx + 66, cy + 30); g.stroke(); g.globalAlpha = 1;
    }],
  ],
  vents: [
    [200, 420, 0.3, 0, (g, w, h, P, r, meta) => {        // kara baca
      const cx = w*0.48, L = [], R = [], n = 22;
      let lean = 0;
      for (let i = 0; i <= n; i++) {
        const f = i/n, y = h - f*h*0.84, wd = lerp(46, 11, Math.pow(f, 0.75)); lean += (r() - 0.5)*3;
        L.push([cx + lean - wd - r()*7 + (i%4 === 1 ? -6 : 0), y]); R.unshift([cx + lean + wd*0.9 + r()*7 + (i%5 === 2 ? 7 : 0), y]);
      }
      const pp = [...L, ...R], tip = [cx + lean, h*0.16];
      lit(g, P, gg => polyPath(gg, pp), 3);
      for (const f of [0.3, 0.52, 0.7]) { const y = h - f*h*0.84, i = Math.round(f*n), x = (L[i][0] + R[n - i][0])/2, ww = (R[n - i][0] - L[i][0])*0.5 + 14 + r()*10; lit(g, P, gg => { gg.moveTo(x - ww, y + 2); gg.quadraticCurveTo(x, y - 9, x + ww, y); gg.lineTo(x + ww*0.8, y + 6); gg.lineTo(x - ww*0.8, y + 7); gg.closePath(); }, 2); }
      const sx = cx + 62, sy = h*0.52;
      lit(g, P, gg => { gg.moveTo(cx + 18, h*0.7); gg.quadraticCurveTo(sx - 12, sy + 44, sx - 7, sy); gg.lineTo(sx + 7, sy - 2); gg.quadraticCurveTo(sx + 8, sy + 54, cx + 30, h*0.8); gg.closePath(); }, 2);
      meta.plumes.push({x:tip[0], y:tip[1] - 2, s:1}, {x:sx, y:sy - 3, s:0.55});
      meta.glows.push({x:tip[0], y:tip[1] + 2, r:18, a:0.5, ph:1, sp:2.2}, {x:cx, y:h*0.95, r:64, a:0.32, ph:2, sp:0.8}, {x:sx, y:sy, r:11, a:0.45, ph:3, sp:2.6});
      g.strokeStyle = 'rgba(255,120,48,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - 6, h*0.92); g.lineTo(cx - 1, h*0.8); g.lineTo(cx - 8, h*0.68); g.lineTo(cx - 4, h*0.6); g.stroke();
    }],
    [380, 270, 0.36, 0, (g, w, h, P, r, meta) => {       // baca tarlası
      const pts = ridge(r, w, h, h*0.72, 9, 0.4);
      for (const [u, k, ww] of [[0.2, 0.42, 22], [0.42, 0.66, 28], [0.62, 0.36, 18], [0.8, 0.52, 22]]) {
        const x = w*u, by = topY(pts, x) + 10, ty = by - h*k;
        const pp = []; for (let i = 0; i <= 6; i++) { const f = i/6; pp.push([x - ww*(1.2 - 0.6*f) + Math.sin(i*2 + u*9)*4, lerp(by, ty, f)]); } for (let i = 6; i >= 0; i--) { const f = i/6; pp.push([x + ww*(1.1 - 0.6*f) + Math.sin(i*1.6 + u*7)*4, lerp(by, ty, f)]); }
        lit(g, P, gg => smoothClosed(gg, pp), 3);
        meta.plumes.push({x:x, y:ty, s:0.7 + k*0.5});
        meta.glows.push({x:x, y:ty + 4, r:16, a:0.4, ph:u*9, sp:2});
      }
      lit(g, P, gg => topPath(gg, pts, h));
      meta.glows.push({x:w*0.5, y:h*0.92, r:90, a:0.3, ph:0, sp:0.7});
    }],
    [380, 240, 0.4, 0, (g, w, h, P, r, meta) => {        // lav sırtı ve kızıl yarık
      const pts = ridge(r, w, h, h*0.52, 14, 0.9, 0.45);
      const jag = pts.map(([x, y], i) => [x, y + (i%2 ? 8 : -6)*r()]);
      lit(g, P, gg => topPath(gg, jag, h), 4);
      clipTo(g, gg => topPath(gg, jag, h), () => {
        g.strokeStyle = P.dark; g.lineWidth = 1.5; g.globalAlpha = 0.7; g.beginPath();
        for (let i = 0; i < 7; i++) { let x = w*(0.1 + r()*0.8), y = topY(jag, x) + 6; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5)*26; y += 12 + r()*14; g.lineTo(x, y); } }
        g.stroke(); g.globalAlpha = 1;
        g.strokeStyle = 'rgba(255,110,40,.6)'; g.lineWidth = 1.8; g.beginPath();
        let x = w*0.26, y = topY(jag, x) + 14; g.moveTo(x, y);
        for (let i = 0; i < 8; i++) { x += 14 + r()*16; y = topY(jag, x) + 18 + r()*30; g.lineTo(x, y); if (i%2) meta.glows.push({x, y, r:22, a:0.42, ph:i, sp:1.1}); }
        g.stroke();
      });
      meta.plumes.push({x:w*0.62, y:topY(jag, w*0.62) + 4, s:0.45});
    }],
  ],
  liner: [
    [600, 270, 0.34, 0, (g, w, h, P, r, meta) => {       // dev yolcu gemisi
      const pts = ridge(r, w, h, h*0.86, 12, 0.25);
      g.save(); g.translate(0, h*0.52); g.rotate(-0.05);
      const x0 = 20, x1 = w - 16;
      lit(g, P, gg => { gg.rect(x0 + 90, -66, 380, 32); gg.rect(x0 + 120, -86, 300, 22); gg.rect(x0 + 170, -100, 160, 16); }, 3, P.mid);
      for (let i = 0; i < 4; i++) { const fx = x0 + 150 + i*72; lit(g, P, gg => { gg.moveTo(fx, -86); gg.lineTo(fx - 16, -158); gg.lineTo(fx + 16, -160); gg.lineTo(fx + 30, -86); gg.closePath(); }, 3); g.fillStyle = P.dark; g.beginPath(); g.moveTo(fx - 15, -154); g.lineTo(fx + 17, -156); g.lineTo(fx + 19, -146); g.lineTo(fx - 13, -144); g.fill(); }
      litStroke(g, P, gg => { gg.moveTo(x0 + 70, -34); gg.lineTo(x0 + 60, -190); gg.moveTo(x0 + 500, -34); gg.lineTo(x0 + 512, -180); }, 2.5);
      g.strokeStyle = P.body; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x0 + 60, -188); g.lineTo(x0 + 512, -178); g.stroke();
      g.fillStyle = P.body; for (let i = 0; i < 10; i++) { g.beginPath(); g.ellipse(x0 + 110 + i*34, -70, 11, 4, 0, 0, TAU); g.fill(); }
      lit(g, P, gg => hullPath(gg, x0, x1, -34, 66, 60, 30), 4);
      rivets(g, P, x0 + 30, x1 - 60, -30, 62, 34, 0.45);
      portholes(g, P.dark, x0 + 50, x1 - 80, -16, 13, 2.2); portholes(g, P.dark, x0 + 56, x1 - 90, 2, 13, 2);
      g.strokeStyle = P.dark; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0 + 330, -34); g.lineTo(x0 + 318, 0); g.lineTo(x0 + 336, 26); g.lineTo(x0 + 324, 66); g.stroke();
      const ca = Math.cos(-0.05), sa = Math.sin(-0.05), ty = h*0.52;
      for (const [px, py] of [[x0 + 102, -16], [x0 + 219, -16], [x0 + 271, 2], [x0 + 414, -16], [x0 + 154, 2]]) meta.glows.push({x:px*ca - py*sa, y:ty + px*sa + py*ca, r:9, a:0.55, ph:px, sp:0.35});
      g.restore();
      lit(g, P, gg => topPath(gg, pts, h));
    }],
    [300, 480, 0.3, 0, (g, w, h, P, r, meta) => {        // dev pruva, göğe dikilmiş
      g.save(); g.translate(w*0.46, h*0.97); g.rotate(-0.16);
      const hull = gg => { gg.moveTo(-80, 0); gg.lineTo(-72, -360); gg.quadraticCurveTo(-40, -430, 10, -452); gg.quadraticCurveTo(22, -330, 56, -190); gg.quadraticCurveTo(84, -80, 92, 0); gg.closePath(); };
      lit(g, P, hull, 5);
      clipTo(g, hull, () => { rivets(g, P, -80, 92, -440, 0, 28, 0.4); portholes(g, P.dark, -54, 30, -250, 14, 2.4); portholes(g, P.dark, -56, 40, -214, 14, 2.4); });
      g.fillStyle = P.dark; g.beginPath(); g.ellipse(-20, -352, 8, 10, 0.2, 0, TAU); g.fill();
      g.strokeStyle = P.body; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < 11; k++) { const y = -350 + k*32; g.moveTo(-72 - k*0.7, y); g.lineTo(-86 - k*0.7, y); } g.moveTo(-86, -350); g.lineTo(-94, -30); g.stroke();
      litStroke(g, P, gg => { gg.moveTo(-40, -400); gg.lineTo(-86, -470); }, 3);
      g.strokeStyle = P.body; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-86, -468); g.quadraticCurveTo(-30, -380, 6, -446); g.stroke();
      const ca = Math.cos(-0.16), sa = Math.sin(-0.16), tx = w*0.46, ty = h*0.97;
      for (const [px, py] of [[-26, -250], [12, -214]]) meta.glows.push({x:tx + px*ca - py*sa, y:ty + px*sa + py*ca, r:8, a:0.5, ph:px, sp:0.3});
      g.restore();
      const pts = ridge(r, w, h, h*0.88, 6, 0.3);
      lit(g, P, gg => topPath(gg, pts, h));
    }],
    [340, 310, 0.34, 0, (g, w, h, P, r) => {            // kıç ve dev pervaneler
      const pts = ridge(r, w, h, h*0.82, 8, 0.3);
      lit(g, P, gg => { gg.moveTo(w*0.96, h*0.9); gg.lineTo(w*0.92, h*0.12); gg.lineTo(w*0.42, h*0.1); gg.quadraticCurveTo(w*0.26, h*0.12, w*0.24, h*0.32); gg.quadraticCurveTo(w*0.3, h*0.56, w*0.48, h*0.64); gg.lineTo(w*0.56, h*0.9); gg.closePath(); }, 4);
      rivets(g, P, w*0.4, w*0.9, h*0.14, h*0.6, 28, 0.45);
      lit(g, P, gg => { gg.moveTo(w*0.3, h*0.42); gg.lineTo(w*0.16, h*0.46); gg.lineTo(w*0.14, h*0.78); gg.lineTo(w*0.3, h*0.72); gg.closePath(); }, 3);
      litStroke(g, P, gg => { gg.moveTo(w*0.46, h*0.62); gg.lineTo(w*0.36, h*0.66); }, 6);
      propeller(g, P, w*0.34, h*0.66, 48, 0.3, 3); propeller(g, P, w*0.52, h*0.72, 36, 1.4, 3);
      lit(g, P, gg => topPath(gg, pts, h));
    }],
  ],
  trench: [
    [380, 560, 0.25, 0.25, (g, w, h, P, r, meta) => {    // uçurum yüzü
      const pts = [[-10, -10]];
      for (let i = 0; i <= 22; i++) { const y = i/22*h, base = w*(0.55 + Math.sin(i*0.45 + r()*0.5)*0.12); pts.push([base + (r() - 0.5)*44 + (i%5 === 2 ? 50 : 0), y]); }
      pts.push([-10, h + 10]);
      const build = gg => polyPath(gg, pts);
      lit(g, P, build, 5);
      clipTo(g, build, () => {
        g.strokeStyle = P.dark; g.lineWidth = 1.5; g.globalAlpha = 0.7; g.beginPath();
        for (let i = 0; i < 9; i++) { let x = r()*w*0.6, y = r()*h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.3)*20; y += 14 + r()*20; g.lineTo(x, y); } }
        g.stroke(); g.globalAlpha = 1;
      });
      for (let i = 0; i < 11; i++) { const y = h*(0.1 + r()*0.8), x = topXAt(pts, y) - 6 - r()*50; meta.glows.push({x, y, r:5 + r()*6, a:0.75, ph:r()*9, sp:0.6 + r()*1.4, tw:1}); }
    }],
    [190, 520, 0.28, 0.2, (g, w, h, P, r, meta) => {     // abis iğnesi
      const L = [], R = [];
      for (let i = 0; i <= 14; i++) { const f = i/14, wd = lerp(14, 70, Math.pow(f, 1.3)); L.push([w/2 - wd + (r() - 0.5)*16, f*h]); R.unshift([w/2 + wd*0.85 + (r() - 0.5)*16, f*h]); }
      const pp = [...L, ...R], build = gg => polyPath(gg, pp);
      lit(g, P, build, 4);
      for (let i = 0; i < 6; i++) { const y = h*(0.2 + r()*0.7), x = w/2 + (r() - 0.5)*40; meta.glows.push({x, y, r:5 + r()*5, a:0.7, ph:r()*9, sp:0.5 + r()*1.4, tw:1}); }
    }],
    [420, 320, 0.2, 0.35, (g, w, h, P, r, meta) => {     // sarkan kaya saçağı
      const pts = [[-10, -10], [w + 10, -10]];
      for (let i = 0; i <= 14; i++) { const x = w - i/14*(w + 20), y = h*0.32 + Math.sin(i*0.9)*20 + (r() - 0.5)*30 + (i > 9 ? (i - 9)*30 : 0); pts.push([x, y]); }
      lit(g, P, gg => polyPath(gg, pts), 4);
      g.strokeStyle = P.body; g.lineWidth = 1.3; g.beginPath();
      for (let i = 0; i < 26; i++) { const x = r()*w*0.85 + 10, y0 = topY2(pts, x), len = 20 + r()*90; g.moveTo(x, y0 - 2); g.quadraticCurveTo(x + 6, y0 + len*0.5, x + 2, y0 + len); if (r() < 0.3) meta.glows.push({x:x + 2, y:y0 + len, r:4 + r()*3, a:0.8, ph:r()*9, sp:0.8 + r(), tw:1}); }
      g.stroke();
    }],
  ],
  atlantis: [
    [460, 300, 0.32, 0, (g, w, h, P, r, meta) => {       // sütunlu revak
      const by = h*0.84;
      lit(g, P, gg => { gg.rect(10, by, w - 20, 40); gg.rect(26, by - 10, w - 52, 12); gg.rect(42, by - 18, w - 84, 10); }, 3);
      const cols = [[0.14, 1], [0.28, 1], [0.42, 0.55], [0.56, 1], [0.7, 1], [0.84, 0.35]];
      const colH = 170;
      for (const [u, k] of cols) {
        const x = w*u, top = by - 18 - colH*k;
        lit(g, P, gg => { gg.rect(x - 11, top, 22, colH*k); gg.rect(x - 15, by - 26, 30, 8); }, 3);
        g.strokeStyle = P.dark; g.lineWidth = 1; g.globalAlpha = 0.6; g.beginPath(); for (let f = -6; f <= 6; f += 4) { g.moveTo(x + f, top + 4); g.lineTo(x + f, by - 28); } g.stroke(); g.globalAlpha = 1;
        if (k === 1) lit(g, P, gg => { gg.rect(x - 16, top - 9, 32, 9); }, 2);
        else { g.fillStyle = P.body; g.beginPath(); g.moveTo(x - 11, top); g.lineTo(x - 5, top - 9); g.lineTo(x + 2, top - 3); g.lineTo(x + 11, top - 11); g.lineTo(x + 11, top + 2); g.fill(); }
      }
      const archY = by - 18 - colH - 9;
      lit(g, P, gg => { gg.rect(w*0.14 - 18, archY - 20, w*0.14 + 36, 20); gg.rect(w*0.56 - 18, archY - 20, w*0.14 + 36, 20); }, 3);
      lit(g, P, gg => { gg.moveTo(w*0.56 - 18, archY - 20); gg.lineTo(w*0.63, archY - 58); gg.lineTo(w*0.7 + 18, archY - 20); gg.closePath(); }, 3);
      for (let i = 0; i < 4; i++) { const gx = w*0.14 + 6 + i*14; meta.glows.push({x:gx, y:archY - 10, r:7, a:0.7, ph:i*0.7, sp:1.1}); g.fillStyle = P.lite; g.beginPath(); g.arc(gx, archY - 10, 2.6, 0, TAU); g.fill(); }
      meta.glows.push({x:w*0.63, y:archY - 34, r:12, a:0.8, ph:2, sp:0.8});
      g.save(); g.translate(w*0.36, by - 4); g.rotate(-0.08); lit(g, P, gg => { gg.rect(-70, -18, 40, 18); gg.rect(-26, -18, 36, 18); gg.rect(14, -16, 30, 16); }, 2); g.restore();
    }],
    [380, 330, 0.32, 0, (g, w, h, P, r, meta) => {       // kubbeli tapınak
      const cx = w*0.5, by = h*0.86;
      lit(g, P, gg => { gg.rect(30, by, w - 60, 40); gg.rect(50, by - 12, w - 100, 14); }, 3);
      lit(g, P, gg => { gg.rect(cx - 100, by - 100, 200, 90); }, 3);
      lit(g, P, gg => { gg.moveTo(cx - 110, by - 100); gg.bezierCurveTo(cx - 110, by - 210, cx + 110, by - 210, cx + 110, by - 100); gg.closePath(); }, 4);
      g.strokeStyle = P.dark; g.lineWidth = 1.4; g.globalAlpha = 0.7; g.beginPath(); for (let k = -2; k <= 2; k++) { g.moveTo(cx + k*44, by - 100); g.quadraticCurveTo(cx + k*30, by - 170, cx + k*6, by - 182); } g.stroke(); g.globalAlpha = 1;
      g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(cx + 40, by - 182); g.lineTo(cx + 64, by - 150); g.lineTo(cx + 52, by - 140); g.lineTo(cx + 80, by - 110); g.lineTo(cx + 96, by - 112); g.lineTo(cx + 92, by - 170); g.closePath(); g.fill(); g.restore();
      lit(g, P, gg => { gg.rect(cx - 12, by - 206, 24, 22); gg.moveTo(cx - 16, by - 206); gg.lineTo(cx, by - 222); gg.lineTo(cx + 16, by - 206); }, 2);
      for (let k = -2; k <= 2; k++) {
        const x = cx + k*38; g.fillStyle = P.dark; g.beginPath(); g.moveTo(x - 9, by - 18); g.lineTo(x - 9, by - 64); g.arc(x, by - 64, 9, Math.PI, 0); g.lineTo(x + 9, by - 18); g.fill();
        meta.glows.push({x, y:by - 50, r:14, a:0.5, ph:k, sp:0.6});
      }
      meta.glows.push({x:cx, y:by - 196, r:16, a:0.9, ph:0, sp:1.4});
      g.strokeStyle = P.lite; g.globalAlpha = 0.6; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, by - 196, 6, 0, TAU); g.stroke(); g.globalAlpha = 1;
    }],
    [300, 440, 0.3, 0, (g, w, h, P, r, meta) => {        // gliflı dikilitaş ve dev üç dişli
      const cx = w*0.36, by = h*0.88;
      lit(g, P, gg => { gg.rect(cx - 46, by - 18, 92, 18); gg.rect(cx - 38, by - 30, 76, 14); }, 3);
      lit(g, P, gg => { gg.moveTo(cx - 28, by - 30); gg.lineTo(cx - 18, by - 300); gg.lineTo(cx, by - 330); gg.lineTo(cx + 18, by - 300); gg.lineTo(cx + 28, by - 30); gg.closePath(); }, 4);
      g.strokeStyle = P.lite; g.lineWidth = 1.4; g.globalAlpha = 0.75;
      for (let i = 0; i < 6; i++) {
        const y = by - 70 - i*36; g.beginPath();
        switch (i%3) { case 0: g.arc(cx, y, 6, 0, TAU); g.moveTo(cx - 9, y); g.lineTo(cx + 9, y); break; case 1: g.moveTo(cx - 7, y + 6); g.lineTo(cx, y - 7); g.lineTo(cx + 7, y + 6); g.moveTo(cx, y - 1); g.lineTo(cx, y + 8); break; default: g.arc(cx, y, 7, Math.PI*0.2, Math.PI*1.8); g.moveTo(cx + 2, y); g.arc(cx, y, 2, 0, TAU); }
        g.stroke();
        meta.glows.push({x:cx, y, r:15, a:0.6, ph:i*0.9, sp:1.2});
      }
      g.globalAlpha = 1;
      const tx = w*0.78, ty = by - 6, ang = 0.2, ca = Math.cos(ang), sa = Math.sin(ang);
      lit(g, P, gg => gg.rect(tx - 26, ty - 14, 52, 20), 3);
      g.save(); g.translate(tx, ty - 14); g.rotate(ang);
      lit(g, P, gg => {
        gg.rect(-4, -250, 8, 250);
        gg.moveTo(-40, -236); gg.quadraticCurveTo(0, -222, 40, -236); gg.lineTo(40, -228); gg.quadraticCurveTo(0, -214, -40, -228); gg.closePath();
        gg.moveTo(-5, -250); gg.lineTo(0, -320); gg.lineTo(5, -250); gg.closePath();
        gg.moveTo(-6, -300); gg.lineTo(0, -320); gg.lineTo(6, -300); gg.lineTo(0, -308); gg.closePath();
        for (const sg of [-1, 1]) { gg.moveTo(sg*36, -230); gg.quadraticCurveTo(sg*42, -262, sg*34, -294); gg.lineTo(sg*30, -292); gg.quadraticCurveTo(sg*36, -262, sg*30, -232); gg.closePath(); gg.moveTo(sg*38, -282); gg.lineTo(sg*34, -300); gg.lineTo(sg*28, -282); gg.closePath(); }
      }, 3);
      g.restore();
      meta.glows.push({x:tx + 236*sa, y:ty - 14 - 236*ca, r:22, a:0.9, ph:0, sp:1.6});
    }],
  ],
};
function crystalPal(P){
  return {dark:css(mixc(P.B, P.R, 0.35)), face:css(mixc(P.R, [220, 245, 255], 0.2)), edge:css(mixc(P.R, [255, 255, 255], 0.5), 0.8)};
}
function topXAt(pts, y){ // uçurum: verilen y'de sağ kenar x'i
  for (let i = 2; i < pts.length - 1; i++) if (y <= pts[i][1]) { const a = pts[i - 1], b = pts[i]; return lerp(a[0], b[0], (y - a[1])/((b[1] - a[1]) || 1)); }
  return pts[pts.length - 2][0];
}
function topY2(pts, x){ // saçak: verilen x'te alt kenar y'si
  let best = pts[2][1], bd = 1e9;
  for (let i = 2; i < pts.length; i++) { const d = Math.abs(pts[i][0] - x); if (d < bd) { bd = d; best = pts[i][1]; } }
  return best;
}

// ---------- sprite önbelleği ----------
const PAR = [0.3, 0.56];         // paralaks katsayıları: uzak, yakın
const SIZE_K = [0.7, 1];         // uzak siluetler daha küçük
const RES = [0.5, 0.72];         // düşük çözünürlük = doğal yumuşaklık (bulanıklık filtresi yok)
const ALPHA = [0.5, 0.78];
const spriteCache = new Map();
let genBudget = 2;
function fadeEdges(g, w, h, fb, ft){
  g.save(); g.globalCompositeOperation = 'destination-out';
  if (fb > 0) { const gr = g.createLinearGradient(0, h*(1 - fb), 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, h*(1 - fb), w, h*fb + 1); }
  if (ft > 0) { const gr = g.createLinearGradient(0, 0, 0, h*ft); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.4, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, -1, w, h*ft + 1); }
  g.restore();
}
function buildSprite(L, d, v){
  const list = RECIPES[LAY()[L].decor] || RECIPES.sand, rec = list[v%list.length];
  const [w0, h0, fb, ft, draw] = rec, k = SIZE_K[d], res = RES[d];
  const w = Math.ceil(w0*k), h = Math.ceil(h0*k);
  const c = mk(w*res, h*res), g = c.getContext('2d');
  g.setTransform(res*k, 0, 0, res*k, 0, 0);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const meta = {glows:[], plumes:[]};
  try { draw(g, w0, h0, pal(L), rng(L*977 + d*131 + v*29 + 7), meta); } catch (e) { console.warn('fx sprite', e); }
  g.setTransform(res, 0, 0, res, 0, 0); g.globalAlpha = 1;
  fadeEdges(g, w, h, fb, ft);
  for (const o of meta.glows) { o.x *= k; o.y *= k; o.r *= k; }
  for (const o of meta.plumes) { o.x *= k; o.y *= k; o.s *= k; }
  return {c, w, h, glows:meta.glows, plumes:meta.plumes};
}
function getSprite(L, d, v){
  const key = L*100 + d*10 + v;
  let s = spriteCache.get(key);
  if (s) { spriteCache.delete(key); spriteCache.set(key, s); return s; }
  if (genBudget <= 0) return null;
  genBudget--;
  s = buildSprite(L, d, v); s.born = DG.S ? DG.S.t : 0;
  spriteCache.set(key, s);
  if (spriteCache.size > 30) spriteCache.delete(spriteCache.keys().next().value);
  return s;
}

// ---------- kat başına siluet yerleşimi ----------
const propCache = new Map();
function getProps(L, d){
  const key = L*10 + d;
  let ps = propCache.get(key);
  if (ps) return ps;
  const U = DG.U, r = rng(L*313 + d*71 + 11), p = PAR[d];
  const top = U.LTOP[L], bot = U.LBOT(L), step = (d ? 330 : 250)/p;
  const xa = d ? -260 : -380, xb = d ? 1660 : 1780, slots = 3, sw = (xb - xa)/slots;
  ps = [];
  let ay = top + (L === 0 ? (d ? 820 : 1100) : step*0.3*r()), row = 0, lastV = -1;
  while (ay < bot - step*0.15) {
    for (let s = 0; s < slots; s++) {
      if (r() > (d ? 0.62 : 0.7)) continue;
      let v = (r()*3) | 0; if (v === lastV) v = (v + 1)%3; lastV = v;
      ps.push({L, d, v, ax:xa + (s + (row%2 ? 0.55 : 0.1) + r()*0.4)*sw, ay:ay + (r() - 0.5)*step*0.3, flip:r() < 0.5});
    }
    ay += step*(0.75 + r()*0.5); row++;
  }
  propCache.set(key, ps);
  return ps;
}

// ---------- hazır dokular (ışın, parıltı, bulut, sahil, kostik) ----------
let RAY = null, PUFF = null, CLOUDS = null, SCLOUDS = null, COAST = null, CAUS = null;
const GLOW = new Map();
function glowSprite(c){
  let s = GLOW.get(c); if (s) return s;
  s = mk(64, 64); const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.22, `rgba(${c},.55)`); gr.addColorStop(0.55, `rgba(${c},.14)`); gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  if (GLOW.size > 48) GLOW.delete(GLOW.keys().next().value);
  GLOW.set(c, s); return s;
}
function rayTex(){
  if (RAY) return RAY;
  RAY = mk(64, 512); const g = RAY.getContext('2d');
  const gh = g.createLinearGradient(0, 0, 64, 0);
  gh.addColorStop(0, 'rgba(225,248,255,0)'); gh.addColorStop(0.3, 'rgba(225,248,255,.55)'); gh.addColorStop(0.5, 'rgba(235,252,255,1)'); gh.addColorStop(0.7, 'rgba(225,248,255,.55)'); gh.addColorStop(1, 'rgba(225,248,255,0)');
  g.fillStyle = gh; g.fillRect(0, 0, 64, 512);
  g.globalCompositeOperation = 'destination-in';
  const gv = g.createLinearGradient(0, 0, 0, 512);
  gv.addColorStop(0, 'rgba(0,0,0,.9)'); gv.addColorStop(0.08, 'rgba(0,0,0,1)'); gv.addColorStop(0.45, 'rgba(0,0,0,.45)'); gv.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gv; g.fillRect(0, 0, 64, 512);
  return RAY;
}
function puffTex(){
  if (PUFF) return PUFF;
  PUFF = mk(64, 64); const g = PUFF.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(6,4,4,.95)'); gr.addColorStop(0.5, 'rgba(8,6,6,.55)'); gr.addColorStop(1, 'rgba(10,8,8,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return PUFF;
}
function cloudTex(seed, dark){
  const r = rng(seed), w = 220 + r()*120, h = 70 + r()*30, res = 0.5;
  const c = mk(w*res, h*res), g = c.getContext('2d'); g.scale(res, res);
  const base = h*0.8, blobs = [];
  for (let i = 0; i < 9; i++) { const u = 0.12 + i/8*0.76, rr = (Math.sin(Math.PI*u)*0.8 + 0.3)*h*0.42*(0.75 + r()*0.4); blobs.push([u*w, base - rr*0.55 - r()*8, rr]); }
  const top = dark ? '#3c4651' : '#ffffff', bot = dark ? '#1b2129' : '#c9dde8';
  const gr = g.createLinearGradient(0, 0, 0, base); gr.addColorStop(0, top); gr.addColorStop(1, bot);
  g.save(); g.beginPath(); g.rect(0, 0, w, base); g.clip();
  g.fillStyle = gr; g.beginPath(); for (const [x, y, rr] of blobs) { g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU); } g.fill();
  if (!dark) { g.fillStyle = 'rgba(170,200,218,.35)'; g.beginPath(); for (const [x, y, rr] of blobs) { g.moveTo(x + rr, y + rr*0.5); g.arc(x - rr*0.15, y + rr*0.5, rr*0.8, 0, TAU); } g.fill(); }
  g.restore();
  return {c, w, h, base};
}
function coastTex(storm){
  const w = 560, h = 70, res = 1.5, c = mk(w*res, h*res), g = c.getContext('2d'); g.scale(res, res);
  const r = rng(77);
  const back = storm ? '#3a4651' : '#9cc3d2', front = storm ? '#2a333c' : '#7eaabd', house = storm ? '#5a6570' : '#f4f1ea', roof = storm ? '#3a3a3a' : '#c46a4a';
  const hill = (col, amp, base, ph, x0, x1) => { g.fillStyle = col; g.beginPath(); g.moveTo(x0, h); for (let x = x0; x <= x1; x += 8) { const k = Math.sin((x - x0)/(x1 - x0)*Math.PI); g.lineTo(x, base - k*amp*(0.75 + 0.25*Math.sin(x*0.05 + ph)) - Math.sin(x*0.13 + ph)*2); } g.lineTo(x1, h); g.closePath(); g.fill(); };
  hill(back, 46, h, 1, 0, 400);
  hill(front, 30, h, 3, 40, 470);
  for (let i = 0; i < 26; i++) { const x = 120 + r()*230, k = Math.sin((x - 40)/430*Math.PI), y = h - k*30*0.95 + 4 + r()*10; g.fillStyle = house; g.fillRect(x, y - 3.2, 4.4, 3.2); g.fillStyle = roof; g.fillRect(x - 0.3, y - 4.2, 5, 1.2); }
  g.fillStyle = front; g.beginPath(); g.moveTo(440, h); g.lineTo(470, h - 6); g.lineTo(520, h - 5); g.lineTo(536, h); g.fill();
  g.fillStyle = house; g.fillRect(510, h - 25, 5, 20); g.fillStyle = storm ? '#6a2a24' : '#c0392b'; g.fillRect(509, h - 29, 7, 4); g.fillRect(510, h - 17, 5, 3);
  return {c, w, h, lamp:{x:512.5, y:h - 27}};
}
// Kostik dokusu: dikişsiz Voronoi kenar ağı (hücre sınırları parlak). Takılma olmasın diye birkaç kareye bölünerek üretilir.
let causJob = null;
function causticTex(){
  if (CAUS !== null) return CAUS;
  try {
    if (!causJob) {
      const N = 256, r = rng(42), pts = [], wx = new Float32Array(N), wy = new Float32Array(N), wk = TAU/N;
      for (let i = 0; i < 11; i++) pts.push(r()*N, r()*N);
      for (let k = 0; k < N; k++) { wx[k] = Math.sin(k*wk*2 + 1.3)*N*0.035 + Math.sin(k*wk*5)*N*0.012; wy[k] = Math.sin(k*wk*3 + 0.4)*N*0.03; }
      const c = mk(N, N), g = c.getContext('2d');
      causJob = {N, pts, wx, wy, c, g, img:g.createImageData(N, N), row:0};
    }
    const J = causJob, N = J.N, P = J.pts, d = J.img.data, lw = N*0.032, end = Math.min(N, J.row + 64);
    for (let y = J.row; y < end; y++) for (let x = 0; x < N; x++) {
      const ux = x + J.wx[y], uy = y + J.wy[x];
      let f1 = 1e9, f2 = 1e9;
      for (let i = 0; i < P.length; i += 2) {
        let dx = ux - P[i], dy = uy - P[i + 1];
        dx -= N*Math.round(dx/N); dy -= N*Math.round(dy/N);
        const q = dx*dx + dy*dy;
        if (q < f1) { f2 = f1; f1 = q; } else if (q < f2) f2 = q;
      }
      const k = Math.max(0, 1 - (Math.sqrt(f2) - Math.sqrt(f1))/lw), o = (y*N + x)*4;
      d[o] = 225; d[o + 1] = 250; d[o + 2] = 255; d[o + 3] = (k*k*(0.6 + 0.4*k)*255) | 0;
    }
    J.row = end;
    if (J.row < N) return null;
    J.g.putImageData(J.img, 0, 0);
    CAUS = {c:J.c, T:256, RS:N/256, born:DG.S ? DG.S.t : 0}; causJob = null;
  } catch (e) { CAUS = false; }
  return CAUS;
}

// ---------- durum ----------
let shakeV = 0, flashC = '#ffffff', flashA = 0, flashMax = 0;
let storm = 0, boltT = 9, nextBolt = 2.5, bolt = null, thunder = [];
let lastCX = null, lastCY = null, camVX = 0, camVY = 0;
const chunks = [], bubbles = [], glints = [], lights = [], rings = [], texts = [], embers = [], wake = [];
const fauna = [];
let faunaT = 5;
const CAP = {chunks:240, bubbles:220, glints:260, lights:24, rings:16, texts:40, embers:90, wake:80};
function push(arr, cap, o){ if (arr.length >= cap) arr.shift(); arr.push(o); }
function compact(arr, alive){ let j = 0; for (let i = 0; i < arr.length; i++) { const o = arr[i]; if (alive(o)) arr[j++] = o; } arr.length = j; }

// Deniz karı ve plankton havuzları (ekran uzayında, paralaksla kayar).
const SNOW = [];
for (let i = 0; i < 240; i++) SNOW.push({x:Math.random(), y:Math.random(), z:i < 150 ? 0.18 + Math.random()*0.35 : 0.6 + Math.random()*0.5, s:Math.random(), ph:Math.random()*TAU});
const PLK = [];
for (let i = 0; i < 70; i++) PLK.push({x:Math.random(), y:Math.random(), z:0.5 + Math.random()*0.6, ph:Math.random()*TAU, sp:0.4 + Math.random()*1.6, s:Math.random()});

// ---------- gökyüzü ----------
function skyCols(){
  const calmTop = [92, 170, 214], calmBot = [214, 238, 246], stTop = [18, 24, 32], stBot = [58, 70, 80];
  return [mixc(calmTop, stTop, storm), mixc(calmBot, stBot, storm)];
}
function drawSky(ctx, W, H, surf, t, camX){
  const [top, bot] = skyCols();
  const g = ctx.createLinearGradient(0, surf - Math.max(surf, 260), 0, surf);
  g.addColorStop(0, css(top)); g.addColorStop(1, css(bot));
  ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, surf + 30);
  const hy = surf - 16;
  // güneş
  if (storm < 0.98) {
    const sx = W*0.8 - camX*0.03, sy = Math.max(hy - 150, hy*0.45), a = 1 - storm;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6*a;
    ctx.drawImage(glowSprite('255,244,214'), sx - 90, sy - 90, 180, 180);
    ctx.globalAlpha = 0.9*a; ctx.fillStyle = 'rgba(255,250,232,1)'; ctx.beginPath(); ctx.arc(sx, sy, 15, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // bulutlar
  if (!CLOUDS) { CLOUDS = [0, 1, 2, 3, 4].map(i => cloudTex(11 + i*7, false)); SCLOUDS = [0, 1, 2, 3, 4, 5].map(i => cloudTex(91 + i*5, true)); }
  const span = W + 700;
  if (storm < 0.99) {
    ctx.globalAlpha = 0.92*(1 - storm);
    CLOUDS.forEach((cl, i) => { const x = wrap(i*230 + t*(4 + i*1.3) - camX*0.06, span) - 340, y = hy - 70 - (i%3)*44 - cl.base; if (y + cl.h > 0) ctx.drawImage(cl.c, x, y, cl.w, cl.h); });
  }
  if (storm > 0.01) {
    ctx.globalAlpha = storm;
    SCLOUDS.forEach((cl, i) => { const x = wrap(i*170 + t*(16 + i*4) - camX*0.08, span) - 340, y = hy - 40 - (i%3)*50 - cl.base*1.3; if (y + cl.h*1.6 > 0) ctx.drawImage(cl.c, x, y, cl.w*1.5, cl.h*1.6); });
  }
  ctx.globalAlpha = 1;
  // şimşek
  const lv = lightning();
  if (bolt && boltT < 0.4 && lv > 0) {
    const bx = bolt.x*W - camX*0.04;
    ctx.save(); ctx.translate(bx, hy); ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (const [lw, col] of [[7, `rgba(150,170,255,${0.22*lv})`], [2.4, `rgba(220,230,255,${0.9*lv})`]]) {
      ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath();
      for (const br of bolt.paths) { ctx.moveTo(br[0][0], br[0][1]); for (let i = 1; i < br.length; i++) ctx.lineTo(br[i][0], br[i][1]); }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (lv > 0) { ctx.fillStyle = `rgba(200,210,240,${0.35*lv})`; ctx.fillRect(-30, -30, W + 60, surf + 30); }
  // sahil ve uzak deniz bandı
  if (!COAST) COAST = [coastTex(false), coastTex(true)];
  const cx = -120 - camX*0.1;
  if (storm < 0.99) { ctx.globalAlpha = 1 - storm; ctx.drawImage(COAST[0].c, cx, hy - COAST[0].h + 2, COAST[0].w, COAST[0].h); }
  if (storm > 0.01) { ctx.globalAlpha = storm; ctx.drawImage(COAST[1].c, cx, hy - COAST[1].h + 2, COAST[1].w, COAST[1].h); }
  ctx.globalAlpha = 1;
  if (storm > 0.3) {
    // deniz feneri: fırtınada döner ışık
    const ph = (t*0.55)%1, on = Math.max(0, Math.cos(ph*TAU))**6, lx = cx + COAST[1].lamp.x, ly = hy - COAST[1].h + 2 + COAST[1].lamp.y;
    if (on > 0.02) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = on*storm; ctx.drawImage(glowSprite('255,220,140'), lx - 30, ly - 30, 60, 60); ctx.globalAlpha = 0.25*on*storm; ctx.fillStyle = 'rgba(255,226,160,1)'; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 160, ly - 14); ctx.lineTo(lx + 160, ly + 10); ctx.closePath(); ctx.fill(); ctx.restore(); }
  }
  const sb = ctx.createLinearGradient(0, hy, 0, surf);
  sb.addColorStop(0, css(mixc([52, 128, 166], [26, 38, 46], storm))); sb.addColorStop(1, css(mixc([92, 176, 206], [40, 58, 66], storm)));
  ctx.fillStyle = sb; ctx.fillRect(-30, hy, W + 60, surf - hy + 1);
  if (storm < 0.6) {
    // güneş pırıltısı
    const sx = W*0.8 - camX*0.03;
    ctx.fillStyle = `rgba(255,250,225,${0.75*(1 - storm)})`;
    for (let i = 0; i < 14; i++) { const k = hash(i*3.1 + Math.floor(t*2.5 + hash(i)*3)), x = sx + (hash(i*7.7) - 0.5)*120, y = hy + 2 + hash(i*5.3)*12; if (k > 0.45) ctx.fillRect(x, y, 5 + k*8, 1.2); }
    // martılar ve uzak yelkenli
    if (surf > 120 && storm < 0.3) {
      ctx.strokeStyle = 'rgba(40,58,72,.75)'; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const x = wrap(i*190 + t*(10 + i*4), W + 120) - 60, y = hy - 110 - i*26 + Math.sin(t*0.6 + i*2)*8, k = Math.sin(t*5 + i*2.1)*3.5, s = 7 - i;
        ctx.moveTo(x - s, y - k); ctx.quadraticCurveTo(x - s*0.4, y - 3, x, y); ctx.quadraticCurveTo(x + s*0.4, y - 3, x + s, y - k);
      }
      ctx.stroke();
      const bx = wrap(W*0.55 + t*3 - camX*0.12, W + 200) - 100;
      ctx.fillStyle = 'rgba(244,241,234,.85)'; ctx.beginPath(); ctx.moveTo(bx, hy + 2); ctx.lineTo(bx + 1, hy - 13); ctx.lineTo(bx + 8, hy + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(40,52,62,.8)'; ctx.fillRect(bx - 3, hy + 2, 13, 2);
    }
  } else {
    // fırtına dalgaları
    ctx.fillStyle = `rgba(200,212,220,${0.5*storm})`;
    for (let i = 0; i < 30; i++) { const x = wrap(i*41 + t*(30 + (i%3)*8) - camX*0.2, W + 60) - 30, y = hy + 3 + (i%4)*3.4; ctx.fillRect(x, y, 6 + (i%5)*2, 1.3); }
  }
  // uzak yağmur
  if (storm > 0.05) rain(ctx, W, surf, t, 90, 13, 900, 1, 0.22*storm, 3);
}
function rain(ctx, W, surf, t, n, len, sp, lw, a, seed){
  const field = 360;
  ctx.strokeStyle = `rgba(200,212,226,${a})`; ctx.lineWidth = lw; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const yy = wrap(hash(i*1.31 + seed)*field + t*sp, field), y = surf - field + yy;
    if (y < -20 || y > surf) continue;
    const x = wrap(hash(i*2.17 + seed)*(W + 120) - t*sp*0.28, W + 120) - 60;
    ctx.moveTo(x, y); ctx.lineTo(x - len*0.28, y + len);
  }
  ctx.stroke();
}
function lightning(){
  if (!bolt || RM) return 0;
  const t = boltT;
  if (t < 0.06) return 1; if (t < 0.11) return 0.3; if (t < 0.18) return 0.9; if (t < 0.6) return 0.9*(1 - (t - 0.18)/0.42);
  return 0;
}
function strike(){
  const paths = [], main = [[0, -300]];
  let x = 0;
  for (let i = 1; i <= 14; i++) { x += (Math.random() - 0.5)*30; main.push([x, -300 + i*(300/14)]); }
  paths.push(main);
  for (let b = 0; b < 2; b++) {
    const s = main[3 + ((Math.random()*7) | 0)], br = [[s[0], s[1]]]; let bx = s[0], by = s[1], dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < 6; i++) { bx += dir*(6 + Math.random()*12); by += 8 + Math.random()*10; br.push([bx, by]); }
    paths.push(br);
  }
  bolt = {x:0.1 + Math.random()*0.8, paths};
  boltT = 0; nextBolt = 2.2 + Math.random()*4.5;
  thunder.push(0.35 + Math.random()*0.8);
}

// ---------- su, ışık hüzmeleri, kostik ----------
const STORM_W = [16, 30, 38];
function drawWater(ctx, W, H, surf, cam){
  const U = DG.U, y0 = surf > 0 ? surf : -30, yb = H + 30;
  const g = ctx.createLinearGradient(0, y0, 0, yb);
  for (let i = 0; i <= 4; i++) {
    const k = i/4; let c = U.waterAt(cam.y + y0 + (yb - y0)*k);
    if (storm > 0) c = mixc(c, STORM_W, 0.42*storm);
    g.addColorStop(k, css(c));
  }
  ctx.fillStyle = g; ctx.fillRect(-30, y0, W + 60, yb - y0);
  if (surf > -160 && surf < H) {
    const gl = ctx.createLinearGradient(0, surf, 0, surf + 160), a = 0.3*(1 - storm*0.7);
    gl.addColorStop(0, `rgba(230,250,255,${a})`); gl.addColorStop(0.25, `rgba(210,245,255,${a*0.35})`); gl.addColorStop(1, 'rgba(210,245,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(-30, Math.max(surf, -30), W + 60, 160);
  }
}
function drawRays(ctx, W, H, surf, cam, t){
  const vis = clamp(1 - cam.y/2800, 0, 1)*(1 - storm*0.85);
  if (vis <= 0.01 || surf < -2600) return;
  const tex = rayTex(), camCx = cam.x + W/2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const ax = -300 + i*290 + hash(i*3.7)*150;
    const x = W/2 + (ax - camCx)*0.78 + Math.sin(t*0.21 + i*1.7)*24;
    const len = 1500 + hash(i*9.1)*1100, wid = 46 + hash(i*5.3)*96 + Math.sin(t*0.37 + i)*14;
    const a = vis*(0.1 + 0.12*hash(i*2.2))*(0.45 + 0.55*Math.pow(Math.sin(t*0.29 + i*2.1), 2));
    if (x < -len*0.3 - wid || x > W + wid + 40) continue;
    ctx.save(); ctx.translate(x, surf - 8); ctx.rotate(0.21 + Math.sin(t*0.13 + i)*0.025);
    ctx.globalAlpha = a; ctx.drawImage(tex, -wid/2, 0, wid, len);
    ctx.restore();
  }
  ctx.restore();
}
function causticK(m){ const k = clamp(1 - m/150, 0, 1); return k*k*(1 - 0.75*storm); }
// Kostik: her karede bir kez, ekranın yarı çözünürlüğündeki bir tuvale çizilir (iki desen katmanı + derinlik maskesi),
// sonra arka plana ve daha zayıf olarak öndeki her şeyin üstüne büyütülerek eklenir. Tam ekran desen dolgusu pahalı.
const CQ = 0.5;
let causCv = null, causG = null, causPatO = null, causRes = null;
function causticLayer(W, H, surf, cam, t){
  const tex = causticTex(); if (!tex || typeof DOMMatrix !== 'function') return null;
  const U = DG.U, yEnd = Math.min(H + 2, U.mToY(150) - cam.y), yStart = Math.max(surf, 0);
  if (yEnd <= yStart + 2) return null;
  const cw = Math.ceil(W*CQ), ch = Math.ceil((H + 2)*CQ);
  if (!causCv) { causCv = mk(cw, ch); causG = causCv.getContext('2d'); }
  if (causCv.width !== cw || causCv.height !== ch) { causCv.width = cw; causCv.height = ch; causPatO = null; }
  if (!causPatO) { try { causPatO = causG.createPattern(tex.c, 'repeat'); } catch (e) { causPatO = null; } if (!causPatO || !causPatO.setTransform) { CAUS = false; return null; } }
  const g = causG, s0 = 1/tex.RS, pat = causPatO;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, cw, ch);
  g.setTransform(CQ, 0, 0, CQ, 0, 0);
  pat.setTransform(new DOMMatrix().translateSelf(-cam.x*0.9 + t*11, -cam.y*0.9 + t*5).scaleSelf(s0));
  g.fillStyle = pat; g.globalAlpha = 0.55; g.fillRect(0, yStart, W, yEnd - yStart);
  pat.setTransform(new DOMMatrix().translateSelf(-cam.x*0.9 - t*8, -cam.y*0.9 + t*9).rotateSelf(27).scaleSelf(s0*1.43));
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45; g.fillRect(0, yStart, W, yEnd - yStart);
  g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1;
  const gr = g.createLinearGradient(0, yStart, 0, yEnd);
  for (let i = 0; i <= 6; i++) gr.addColorStop(i/6, `rgba(0,0,0,${causticK(U.toM(cam.y + lerp(yStart, yEnd, i/6))).toFixed(3)})`);
  g.fillStyle = gr; g.fillRect(0, yStart, W, yEnd - yStart);
  g.globalCompositeOperation = 'source-over';
  return {y0:yStart, y1:yEnd};
}
function drawCaustics(ctx, W, H, cam, strength, maxM){
  const r = causRes; if (!r || !causCv) return;
  if (CAUS && DG.S) strength *= clamp((DG.S.t - CAUS.born)/1.2, 0, 1);
  const y1 = Math.min(r.y1, DG.U.mToY(maxM) - cam.y);
  if (y1 <= r.y0 + 1) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = strength;
  ctx.drawImage(causCv, 0, r.y0*CQ, causCv.width, (y1 - r.y0)*CQ, 0, r.y0, causCv.width/CQ, y1 - r.y0);
  ctx.restore();
}

// ---------- uzak siluetler ----------
function drawProps(ctx, d, W, H, cam, t, surf){
  const U = DG.U, p = PAR[d], camCx = cam.x + W/2, camCy = cam.y + H/2, NL = DG.C.NL;
  const ayMin = camCy - (H/2 + 320)/p, ayMax = camCy + (H/2 + 320)/p;
  for (let L = 0; L < NL; L++) {
    if (U.LBOT(L) + 400/p < ayMin || U.LTOP[L] - 400/p > ayMax) continue;
    const props = getProps(L, d);
    for (const pr of props) {
      if (pr.ay < ayMin || pr.ay > ayMax) continue;
      const sxc = W/2 + (pr.ax - camCx)*p, syc = H/2 + (pr.ay - camCy)*p;
      if (sxc < -320 || sxc > W + 320 || syc < -340 || syc > H + 340) continue;
      const sp = getSprite(L, d, pr.v); if (!sp) continue;
      const x = sxc - sp.w/2, y = syc - sp.h/2;
      if (x > W || x + sp.w < 0 || y > H || y + sp.h < 0 || y + sp.h < surf) continue;
      const fade = clamp((t - sp.born)/0.6, 0, 1);
      ctx.globalAlpha = ALPHA[d]*fade;
      if (pr.flip) { ctx.save(); ctx.translate(x + sp.w, y); ctx.scale(-1, 1); ctx.drawImage(sp.c, 0, 0, sp.w, sp.h); ctx.restore(); }
      else ctx.drawImage(sp.c, x, y, sp.w, sp.h);
      if (sp.plumes.length) drawPlumes(ctx, sp, pr, x, y, t);
    }
  }
  ctx.globalAlpha = 1;
}
function drawPlumes(ctx, sp, pr, x, y, t){
  const tex = puffTex(), a0 = ALPHA[pr.d]*0.85;
  for (const pl of sp.plumes) {
    const px = pr.flip ? x + sp.w - pl.x : x + pl.x, py = y + pl.y, sd = pr.ax*0.01 + pl.x*0.1;
    for (let k = 0; k < 7; k++) {
      const ph = (t*0.16 + k/7 + sd)%1, rr = (7 + ph*46)*pl.s, yy = py - ph*230*pl.s, xx = px + Math.sin(ph*4 + sd + t*0.3)*10*ph*pl.s + ph*ph*40*pl.s;
      ctx.globalAlpha = a0*(1 - ph)*Math.min(1, ph*6);
      ctx.drawImage(tex, xx - rr, yy - rr, rr*2, rr*2);
    }
  }
  ctx.globalAlpha = 1;
}
// Uzak parıltılar karanlığın üstüne çizilir; duvar ve rafların önüne taşmasın diye maskelenir.
function drawPropGlows(ctx, W, H, cam, t, dark){
  const U = DG.U, NL = DG.C.NL, WW = DG.C.WORLD_W, vis = clamp((dark - 0.25)/0.5, 0, 1);
  if (vis <= 0.01) return;
  let nGlow = 0;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let d = 0; d < 2; d++) {
    const p = PAR[d], camCx = cam.x + W/2, camCy = cam.y + H/2, ayMin = camCy - (H/2 + 320)/p, ayMax = camCy + (H/2 + 320)/p;
    for (let L = 0; L < NL; L++) {
      if (!SIL[L].glow) continue;
      if (U.LBOT(L) + 400/p < ayMin || U.LTOP[L] - 400/p > ayMax) continue;
      const col = SIL[L].glow, spr = glowSprite(col);
      for (const pr of getProps(L, d)) {
        if (pr.ay < ayMin || pr.ay > ayMax) continue;
        const sp = spriteCache.get(L*100 + d*10 + pr.v); if (!sp || !sp.glows.length) continue;
        const x = W/2 + (pr.ax - camCx)*p - sp.w/2, y = H/2 + (pr.ay - camCy)*p - sp.h/2;
        if (x > W + 60 || x + sp.w < -60 || y > H + 60 || y + sp.h < -60) continue;
        const fade = clamp((t - sp.born)/0.6, 0, 1)*vis*(d ? 0.95 : 0.7);
        for (const gl of sp.glows) {
          const gx = pr.flip ? x + sp.w - gl.x : x + gl.x, gy = y + gl.y;
          if (gx < -gl.r*3 || gx > W + gl.r*3 || gy < -gl.r*3 || gy > H + gl.r*3) continue;
          const wy = gy + cam.y, wx = gx + cam.x;
          const pulse = gl.tw ? Math.pow(Math.max(0, Math.sin(t*gl.sp + gl.ph)), 3) : 0.65 + 0.35*Math.sin(t*gl.sp + gl.ph);
          const a = gl.a*pulse*fade;
          if (a < 0.03) continue;
          const lo = U.wallW(wy, 0), hi = WW - U.wallW(wy, 1), rr = gl.r*1.8;
          const m = clamp((wx - lo)/(rr*0.5), 0, 1)*clamp((hi - wx)/(rr*0.5), 0, 1);
          if (m <= 0 || U.inLedge(wx, wy)) continue;
          ctx.globalAlpha = clamp(a*m*1.25, 0, 1);
          ctx.drawImage(spr, gx - rr, gy - rr, rr*2, rr*2);
          if (++nGlow >= 44) { ctx.restore(); return; }
        }
      }
    }
  }
  ctx.restore();
}

// ---------- uzak canlılar (üst katlar) ----------
function spawnFauna(L, W, H, cam, force){
  const p = 0.42, camCx = cam.x + W/2, camCy = cam.y + H/2, dir = Math.random() < 0.5 ? 1 : -1;
  const roll = Math.random();
  let kind = 'school';
  if (L <= 1 && roll < 0.28) kind = 'whale'; else if (L === 0 && roll < 0.45) kind = 'turtle';
  if (force) kind = force;
  const sp = kind === 'whale' ? 26 : kind === 'turtle' ? 20 : 34 + Math.random()*22;
  const y0 = Math.max(H*0.12, -cam.y + 110), y1 = Math.max(y0 + 40, H*0.8), sy = y0 + Math.random()*(y1 - y0);
  const o = {kind, dir, p, t:0, ax:camCx - dir*(W/2 + 360)/p, ay:camCy + (sy - H/2)/p, v:sp/p, seed:Math.random()*100};
  if (kind === 'school') { o.n = 22 + ((Math.random()*16) | 0); o.f = []; for (let i = 0; i < o.n; i++) o.f.push({a:Math.random()*TAU, rx:12 + Math.random()*46, ry:6 + Math.random()*20, w:0.4 + Math.random()*0.6, s:0.75 + Math.random()*0.5}); }
  fauna.push(o);
}
function drawFauna(ctx, W, H, cam, t, L){
  if (!fauna.length) return;
  const sil = SIL[Math.min(L, SIL.length - 1)], col = css(mixc(sil.body, [0, 0, 0], 0.25));
  ctx.fillStyle = col;
  for (const o of fauna) {
    const x = W/2 + (o.ax - cam.x - W/2)*o.p, y = H/2 + (o.ay - cam.y - H/2)*o.p;
    if (x < -360 || x > W + 360 || y < -200 || y > H + 200) continue;
    const fadeIn = clamp(o.t/2, 0, 1)*(1 - storm);
    if (fadeIn <= 0.01) continue;
    if (o.kind === 'whale') { ctx.globalAlpha = 0.34*fadeIn; whale(ctx, x, y, 1, o.dir, t + o.seed); ctx.globalAlpha = 0.3*fadeIn; whale(ctx, x - o.dir*120, y + 46, 0.42, o.dir, t*1.3 + o.seed + 1); }
    else if (o.kind === 'turtle') { ctx.globalAlpha = 0.42*fadeIn; turtle(ctx, x, y, o.dir, t + o.seed); }
    else {
      ctx.globalAlpha = 0.4*fadeIn; ctx.beginPath();
      const br = 1 + 0.25*Math.sin(t*0.35 + o.seed);
      for (const f of o.f) {
        const a = f.a + t*f.w*0.6, fx = x + Math.cos(a)*f.rx*br*1.6, fy = y + Math.sin(a*1.3)*f.ry, s = 4.2*f.s, d = o.dir, wg = Math.sin(t*9 + f.a*3)*1.2;
        ctx.moveTo(fx + s*d, fy); ctx.lineTo(fx - s*0.6*d, fy - s*0.5); ctx.lineTo(fx - s*1.0*d, fy + wg*0.3); ctx.lineTo(fx - s*1.6*d, fy - s*0.55 + wg); ctx.lineTo(fx - s*1.5*d, fy + s*0.55 + wg); ctx.lineTo(fx - s*1.0*d, fy + wg*0.3); ctx.lineTo(fx - s*0.6*d, fy + s*0.5); ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function whale(ctx, x, y, s, dir, t){
  const tail = Math.sin(t*0.8)*0.28, fin = Math.sin(t*0.8 - 1)*0.12;
  ctx.save(); ctx.translate(x, y); ctx.scale(s*dir, s);
  ctx.beginPath();
  ctx.moveTo(124, 6);
  ctx.bezierCurveTo(118, -10, 86, -22, 40, -22);
  ctx.bezierCurveTo(-10, -22, -70, -14, -112, -2 + tail*10);
  ctx.lineTo(-116, 3 + tail*10);
  ctx.bezierCurveTo(-70, 12, -20, 24, 30, 24);
  ctx.bezierCurveTo(80, 24, 112, 20, 124, 6);
  ctx.fill();
  ctx.save(); ctx.translate(-114, 1 + tail*10); ctx.rotate(tail*1.4);
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(-14, -4, -36, -14); ctx.quadraticCurveTo(-28, -2, -32, 2); ctx.quadraticCurveTo(-28, 6, -36, 14); ctx.quadraticCurveTo(-14, 4, 4, 0); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(58, 16); ctx.rotate(0.55 + fin);
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-30, 30, -66, 44); ctx.quadraticCurveTo(-34, 18, 8, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(-58, -12); ctx.lineTo(-48, -22); ctx.lineTo(-40, -15); ctx.fill();
  ctx.restore();
}
function turtle(ctx, x, y, dir, t){
  const st = Math.sin(t*1.6);
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, -0.05, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(26, -2, 8, 6, 0.1, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(10, 4); ctx.rotate(0.5 + st*0.6); ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(-6, 18, -24, 26); ctx.quadraticCurveTo(-4, 12, 4, 3); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(-16, 4); ctx.rotate(0.3 - st*0.3); ctx.beginPath(); ctx.ellipse(-6, 6, 9, 4, 0.6, 0, TAU); ctx.fill(); ctx.restore();
  ctx.restore();
}

// ---------- deniz karı ve plankton ----------
function depthFrac(cam, H){
  const U = DG.U, y = cam.y + H/2; if (y <= 0) return 0;
  const L = U.layerOf(y);
  return clamp((L + clamp((y - U.LTOP[L])/U.LH(L), 0, 1))/10, 0, 1);
}
function drawSnow(ctx, layer, W, H, surf, L, df){
  const tint = (SIL[L] || SIL[0]).snow, fast = Math.abs(camVY) + Math.abs(camVX) > 18;
  const n = layer ? Math.round(16 + 64*df + storm*30) : Math.round(48 + 102*df + storm*40);
  const i0 = layer ? 150 : 0, i1 = Math.min(layer ? 240 : 150, i0 + n);
  const a = layer ? lerp(0.35, 0.62, df) : lerp(0.24, 0.45, df);
  ctx.fillStyle = css(tint, a); ctx.strokeStyle = css(tint, a*0.6); ctx.lineWidth = layer ? 1.5 : 1;
  if (fast) ctx.beginPath();
  for (let i = i0; i < i1; i++) {
    const p = SNOW[i], x = p.x*W, y = p.y*H;
    if (y < surf + 2) continue;
    const sz = (layer ? 1.4 : 0.8) + p.s*(layer ? 1.6 : 1.0);
    if (fast) { ctx.moveTo(x, y); ctx.lineTo(x + camVX*p.z*0.6 + 0.01, y + camVY*p.z*0.6 + 0.01); }
    else ctx.fillRect(x, y, sz, sz);
  }
  if (fast) ctx.stroke();
}
function moveSnow(W, H, dt, t){
  if (W <= 0 || H <= 0) return;
  for (const p of SNOW) {
    p.x = wrap(p.x - (camVX*p.z - Math.sin(t*0.4 + p.ph)*3*dt)/W, 1);
    p.y = wrap(p.y - (camVY*p.z - (4 + 8*p.z)*dt)/H, 1);
  }
  for (const p of PLK) {
    p.x = wrap(p.x - (camVX*p.z - Math.sin(t*0.3 + p.ph)*4*dt)/W, 1);
    p.y = wrap(p.y - (camVY*p.z + 2*dt)/H, 1);
  }
}

// ---------- parçacıklar ----------
function update(dt){
  const S = DG.S;
  if (shakeV > 0) shakeV = Math.max(0, shakeV - dt*(22 + shakeV*3));
  if (flashA > 0) flashA = Math.max(0, flashA - dt*flashMax/(0.2 + flashMax*0.5));
  const on = !!(DG.boss && DG.boss.active && DG.boss.active());
  storm = clamp(storm + (on ? dt/2.2 : -dt/1.6), 0, 1);
  if (bolt) boltT += dt;
  if (storm > 0.55 && S && S.cam.y < 1600) { nextBolt -= dt; if (nextBolt <= 0) strike(); }
  for (let i = thunder.length - 1; i >= 0; i--) { thunder[i] -= dt; if (thunder[i] <= 0) { thunder.splice(i, 1); if (storm > 0.7 && DG.core && DG.core.sfx) DG.core.sfx('thunder'); } }
  const kd = Math.exp(-3.2*dt), kb = Math.exp(-1.6*dt);
  for (const p of chunks) { p.vx *= kd; p.vy = p.vy*kd + p.g*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.r += p.vr*dt; p.life -= dt; }
  compact(chunks, p => p.life > 0);
  for (const b of bubbles) { b.vy = b.vy*kb - 140*dt; if (b.vy < -b.max) b.vy = -b.max; b.vx *= kd; b.ph += dt*6; b.x += (b.vx + Math.sin(b.ph)*14)*dt; b.y += b.vy*dt; b.life -= dt; if (b.r < b.r1) b.r += dt*2.5; }
  compact(bubbles, b => b.life > 0 && b.y > 2);
  for (const p of glints) { p.vx *= kd; p.vy = p.vy*kd + 20*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt; }
  compact(glints, p => p.life > 0);
  for (const p of embers) { p.vx *= kd; p.vy = p.vy*kd - 10*dt; p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt; }
  compact(embers, p => p.life > 0);
  for (const l of lights) l.life -= dt;
  compact(lights, l => l.life > 0);
  for (const r of rings) r.t += dt;
  compact(rings, r => r.t < r.dur);
  for (const x of texts) { x.t += dt; x.y += x.vy*dt; x.vy *= Math.exp(-2.6*dt); }
  compact(texts, x => x.t < x.dur);
  for (const w of wake) { w.x += w.vx*dt; w.y += w.vy*dt; w.vx *= kd; w.vy *= kd; w.life -= dt; }
  compact(wake, w => w.life > 0);
  if (!S || !DG.U) return;
  // biyolüminesan iz: karanlık sularda hızlı yüzen dalgıcın paletlerinden
  const dv = S.diver, sp = Math.hypot(dv.vx, dv.vy);
  if (S.darkAlpha > 0.6 && sp > 80 && S.playing && Math.random() < dt*sp*0.09) {
    const bx = dv.x - Math.cos(dv.ang)*24*dv.flip, by = dv.y - Math.sin(dv.ang)*24;
    push(wake, CAP.wake, {x:bx + rnd(-6, 6), y:by + rnd(-6, 6), vx:-dv.vx*0.12 + rnd(-20, 20), vy:-dv.vy*0.12 + rnd(-20, 20), life:rnd(0.9, 1.6), max:1.6, s:rnd(0.8, 1.8)});
  }
  // uzak canlılar
  const L = DG.U.layerOf(S.cam.y + S.H/2);
  for (const o of fauna) { o.t += dt; o.ax += o.dir*o.v*dt; }
  compact(fauna, o => o.t < 90 && Math.abs((o.ax - S.cam.x - S.W/2)*o.p) < S.W + 900 && Math.abs((o.ay - S.cam.y - S.H/2)*o.p) < S.H*1.5);
  faunaT -= dt;
  if (faunaT <= 0) {
    faunaT = rnd(14, 28);
    if (L <= 2 && storm < 0.2 && fauna.length < 2) spawnFauna(L, S.W, S.H, S.cam);
  }
}
function burst(x, y, color, n, speed){
  n = clamp(n == null ? 10 : n | 0, 1, 40); speed = speed || 160; color = color || '#ffffff';
  for (let i = 0; i < n; i++) {
    const a = Math.random()*TAU, v = speed*rnd(0.25, 1);
    push(chunks, CAP.chunks, {x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, g:rnd(-10, 40), r:Math.random()*TAU, vr:rnd(-8, 8), s:rnd(1.6, 3.8), life:rnd(0.45, 1.0), max:1, c:color});
  }
  const ng = Math.ceil(n/3);
  for (let i = 0; i < ng; i++) { const a = Math.random()*TAU, v = speed*rnd(0.7, 1.5); push(glints, CAP.glints, {x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:rnd(0.18, 0.42), max:0.42, c:color, w:1.4}); }
  const nb = Math.min(6, 1 + (n/5 | 0));
  for (let i = 0; i < nb; i++) bubble(x + rnd(-8, 8), y + rnd(-8, 8), rnd(1.5, 3.5), rnd(-40, 40), rnd(-60, 0));
}
function bubble(x, y, r, vx, vy){ push(bubbles, CAP.bubbles, {x, y, vx:vx || 0, vy:vy || 0, r:r*0.6, r1:r, ph:Math.random()*TAU, life:rnd(1.2, 2.6), max:rnd(90, 150)}); }
function spark(x, y, color){
  const c = color || '#ffe9b0';
  for (let i = 0; i < 9; i++) { const a = Math.random()*TAU, v = rnd(120, 340); push(glints, CAP.glints, {x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:rnd(0.12, 0.3), max:0.3, c, w:1.2}); }
  push(lights, CAP.lights, {x, y, r:34, life:0.14, max:0.14, c:'255,236,190', k:0.35});
}
function explosion(x, y, R){
  R = clamp(R || 80, 20, 400);
  push(lights, CAP.lights, {x, y, r:R*2.1, life:0.5, max:0.5, c:'255,170,90', k:0.85});
  push(lights, CAP.lights, {x, y, r:R*1.1, life:0.16, max:0.16, c:'255,246,226', k:1});
  push(rings, CAP.rings, {x, y, r0:R*0.35, r1:R*1.9, t:0, dur:0.55});
  const nd = Math.round(clamp(R/8, 8, 22));
  for (let i = 0; i < nd; i++) { const a = Math.random()*TAU, v = rnd(0.6, 1.6)*R*2.2; push(chunks, CAP.chunks, {x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, g:rnd(30, 90), r:Math.random()*TAU, vr:rnd(-10, 10), s:rnd(2, 4.6), life:rnd(0.6, 1.3), max:1.3, c:Math.random() < 0.5 ? '#2a2420' : '#4a3a2c'}); }
  const ne = Math.round(clamp(R/6, 10, 30));
  for (let i = 0; i < ne; i++) { const a = Math.random()*TAU, v = rnd(0.5, 1.4)*R*3; push(embers, CAP.embers, {x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:rnd(0.35, 0.9), max:0.9}); }
  const nb = Math.round(clamp(R/5, 10, 28));
  for (let i = 0; i < nb; i++) { const a = Math.random()*TAU, d = Math.random()*R*0.6; bubble(x + Math.cos(a)*d, y + Math.sin(a)*d, rnd(2, 6), Math.cos(a)*rnd(20, 90), Math.sin(a)*rnd(20, 90) - 30); }
  if (R > 110) flash('rgb(255,226,180)', clamp(R/1400, 0.06, 0.18));
}
function dmgText(x, y, text, color){
  text = String(text); color = color || '#e6f4f7';
  const num = /^\d+$/.test(text) ? +text : NaN;
  // Aynı renkte, yakında yeni çıkmış bir sayı varsa onunla birleş: kalabalık dövüşte ekran sayı yağmuruna dönmesin.
  if (num === num) for (const o of texts) {
    if (o.n === o.n && o.c === color && o.t < 0.35 && Math.abs(o.x - x) < 40 && Math.abs(o.y - y) < 30) {
      o.n += num; o.text = String(o.n); o.t = Math.min(o.t, 0.04); o.dur = 0.95; o.sz = o.n >= 100 ? 17 : 14; return;
    }
  }
  for (const o of texts) if (o.t < 0.25 && Math.abs(o.x - x) < 26 && Math.abs(o.y - y) < 16) y = o.y - 16;
  push(texts, CAP.texts, {x, y, vy:-70, t:0, dur:0.95, text, n:num, c:color, sz:num >= 100 ? 17 : 14});
}
function flash(color, alpha){
  let c = color || '#ffffff';
  if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(c)) c = `rgb(${c})`;
  let a = clamp(alpha == null ? 0.35 : +alpha || 0, 0, 1);
  if (RM) a *= 0.35;
  if (a >= flashA) { flashC = c; flashA = a; flashMax = a; }
}
function shake(a){ a = +a || 0; if (a > shakeV) shakeV = Math.min(a, 26); }

// ---------- çizim aşamaları ----------
function drawBack(ctx){
  const S = DG.S, U = DG.U; if (!S || !U || !S.W) return;
  const W = S.W, H = S.H, cam = S.cam, t = S.t;
  genBudget = 2;
  if (lastCX == null || Math.abs(cam.y - lastCY) > H*0.8 || Math.abs(cam.x - lastCX) > W*0.8) { camVX = 0; camVY = 0; }
  else { camVX = cam.x - lastCX; camVY = cam.y - lastCY; }
  lastCX = cam.x; lastCY = cam.y;
  moveSnow(W, H, S.dt || 0, t);
  const surf = -cam.y;
  const O = OFF;
  if (surf > 0 && !O.sky) drawSky(ctx, W, H, surf, t, cam.x);
  if (!O.water) drawWater(ctx, W, H, surf, cam);
  const clip = surf > 0;
  if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(-30, surf, W + 60, H - surf + 30); ctx.clip(); }
  if (!O.p0) drawProps(ctx, 0, W, H, cam, t, surf);
  if (!O.fauna) drawFauna(ctx, W, H, cam, t, U.layerOf(cam.y + H/2));
  if (!O.p1) drawProps(ctx, 1, W, H, cam, t, surf);
  if (!O.rays) drawRays(ctx, W, H, surf, cam, t);
  causRes = cam.y < U.mToY(150) && !O.caus ? causticLayer(W, H, surf, cam, t) : null;
  if (causRes) drawCaustics(ctx, W, H, cam, 0.14, 150);
  if (!O.snow) drawSnow(ctx, 0, W, H, surf, U.layerOf(cam.y + H/2), depthFrac(cam, H));
  if (clip) ctx.restore();
}
function drawMid(ctx){
  const S = DG.S, U = DG.U; if (!S || !U) return;
  const W = S.W, H = S.H, cam = S.cam, t = S.t, surf = -cam.y;
  if (causRes && !OFF.caus2) drawCaustics(ctx, W, H, cam, 0.07, 70);
  // enkaz parçaları
  for (const p of chunks) {
    const x = p.x - cam.x, y = p.y - cam.y; if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const c = Math.cos(p.r)*p.s, s = Math.sin(p.r)*p.s*0.6;
    ctx.globalAlpha = clamp(p.life/(p.max*0.4), 0, 1); ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.moveTo(x + c, y + s); ctx.lineTo(x - s, y + c*0.7); ctx.lineTo(x - c, y - s); ctx.lineTo(x + s*0.5, y - c); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // kabarcıklar
  if (bubbles.length) {
    ctx.strokeStyle = 'rgba(220,245,255,.7)'; ctx.lineWidth = 1; ctx.beginPath();
    const hl = [];
    for (const b of bubbles) {
      const x = b.x - cam.x, y = b.y - cam.y; if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
      ctx.moveTo(x + b.r, y); ctx.arc(x, y, b.r, 0, TAU); if (b.r > 2.4) hl.push(x - b.r*0.35, y - b.r*0.4);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,252,255,.8)';
    for (let i = 0; i < hl.length; i += 2) ctx.fillRect(hl[i] - 0.6, hl[i + 1] - 0.6, 1.3, 1.3);
  }
  drawSnow(ctx, 1, W, H, surf, U.layerOf(cam.y + H/2), depthFrac(cam, H));
}
function drawFront(ctx){
  const S = DG.S, U = DG.U; if (!S || !U) return;
  const W = S.W, H = S.H, cam = S.cam, t = S.t, dark = S.darkAlpha || 0, surf = -cam.y;
  if (!OFF.glows) drawPropGlows(ctx, W, H, cam, t, dark);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // plankton
  if (dark > 0.5 && !OFF.plk) {
    const L = U.layerOf(cam.y + H/2), col = PLANKTON[L] || PLANKTON[0], a = clamp((dark - 0.5)/0.4, 0, 1)*0.85;
    ctx.fillStyle = `rgba(${col},1)`;
    const n = Math.round(24 + 46*depthFrac(cam, H));
    for (let i = 0; i < n; i++) {
      const p = PLK[i], tw = Math.pow(Math.max(0, Math.sin(t*p.sp + p.ph)), 4);
      if (tw < 0.05) continue;
      ctx.globalAlpha = a*tw; const s = 1.2 + p.s*1.4; ctx.fillRect(p.x*W - s/2, p.y*H - s/2, s, s);
    }
    const gs = glowSprite(col);
    for (let i = 0; i < 6; i++) { const p = PLK[i*7], tw = Math.pow(Math.max(0, Math.sin(t*p.sp*0.7 + p.ph)), 6); if (tw < 0.05) continue; ctx.globalAlpha = a*tw*0.5; ctx.drawImage(gs, p.x*W - 9, p.y*H - 9, 18, 18); }
  }
  if (wake.length) {
    const L = U.layerOf(cam.y + H/2), col = PLANKTON[L] || PLANKTON[0];
    ctx.fillStyle = `rgba(${col},1)`;
    for (const w of wake) { const x = w.x - cam.x, y = w.y - cam.y; if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue; ctx.globalAlpha = clamp(w.life/w.max, 0, 1)*0.9*Math.min(1, dark*1.2); ctx.fillRect(x - w.s/2, y - w.s/2, w.s, w.s); }
  }
  // ışıklar (patlama parlaması)
  for (const l of lights) {
    const x = l.x - cam.x, y = l.y - cam.y; if (x < -l.r || x > W + l.r || y < -l.r || y > H + l.r) continue;
    const k = l.life/l.max; ctx.globalAlpha = clamp(k*k*(0.55 + 0.45*dark), 0, 1);
    ctx.drawImage(glowSprite(l.c), x - l.r, y - l.r, l.r*2, l.r*2);
  }
  // korlar
  if (embers.length) {
    for (const e of embers) {
      const x = e.x - cam.x, y = e.y - cam.y; if (x < -6 || x > W + 6 || y < -6 || y > H + 6) continue;
      const k = e.life/e.max; ctx.globalAlpha = clamp(k*1.4, 0, 1);
      ctx.fillStyle = k > 0.6 ? '#fff0c0' : k > 0.3 ? '#ffb050' : '#d0502a';
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
  }
  // kıvılcımlar: hız yönünde kısa çizgi
  if (glints.length) {
    ctx.lineCap = 'round';
    for (const p of glints) {
      const x = p.x - cam.x, y = p.y - cam.y; if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
      ctx.globalAlpha = clamp(p.life/p.max*1.3, 0, 1); ctx.strokeStyle = p.c; ctx.lineWidth = p.w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx*0.03, y - p.vy*0.03); ctx.stroke();
    }
  }
  // şok halkaları
  for (const r of rings) {
    const x = r.x - cam.x, y = r.y - cam.y, k = r.t/r.dur, rr = lerp(r.r0, r.r1, 1 - (1 - k)*(1 - k));
    if (x < -rr || x > W + rr || y < -rr || y > H + rr) continue;
    ctx.globalAlpha = (1 - k)*0.22; ctx.strokeStyle = 'rgba(210,240,255,1)'; ctx.lineWidth = 1.5*(1 - k) + 0.5;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    ctx.globalAlpha = (1 - k)*0.1; ctx.lineWidth = 8*(1 - k) + 1; ctx.beginPath(); ctx.arc(x, y, rr*0.9, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  // fırtına: teknenin önünden geçen dalgalar, yağmur ve yüzeye düşen damlalar
  if (storm > 0.05 && surf > -20 && surf < H + 20) {
    const A = 5.5*storm, wc = mixc(U.waterAt(1), STORM_W, 0.42*storm), base = css(wc), wy = x => surf + 3 + A*Math.sin((x + cam.x)*0.028 + t*2.3) + A*0.55*Math.sin((x + cam.x)*0.067 - t*3.4);
    const gw = ctx.createLinearGradient(0, surf - A - 4, 0, surf + 18);
    gw.addColorStop(0, base); gw.addColorStop(0.5, base); gw.addColorStop(1, css(wc, 0));
    ctx.save(); ctx.globalAlpha = 0.78*storm; ctx.fillStyle = gw; ctx.beginPath(); ctx.moveTo(-30, surf + 18);
    for (let x = -30; x <= W + 30; x += 12) ctx.lineTo(x, wy(x));
    ctx.lineTo(W + 30, surf + 18); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.55*storm; ctx.strokeStyle = 'rgba(228,238,244,1)'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let x = -30; x <= W + 30; x += 12) { const y = wy(x); if (x === -30) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
  }
  if (storm > 0.05 && surf > 0) {
    rain(ctx, W, surf, t, 46, 22, 1250, 1.3, 0.38*storm, 9);
    ctx.strokeStyle = `rgba(220,232,240,${0.5*storm})`; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const cyc = t*1.9 + hash(i*1.7), ph = cyc%1, x = hash(i*7.3 + Math.floor(cyc)*1.1)*W, r = 1 + ph*5;
      ctx.moveTo(x - r, surf - ph*3); ctx.lineTo(x, surf - 1 - (1 - ph)*4); ctx.lineTo(x + r, surf - ph*3);
    }
    ctx.stroke();
  }
  // hasar sayıları
  if (texts.length) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const o of texts) {
      const x = o.x - cam.x, y = o.y - cam.y; if (x < -40 || x > W + 40 || y < -30 || y > H + 30) continue;
      const pop = o.t < 0.1 ? 1.45 - o.t*4.5 : 1, a = o.t > o.dur - 0.3 ? (o.dur - o.t)/0.3 : 1;
      ctx.font = `700 ${Math.round(o.sz*pop)}px "Chakra Petch", ui-monospace, monospace`;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(4,14,26,.9)'; ctx.strokeText(o.text, x, y);
      ctx.fillStyle = o.c; ctx.fillText(o.text, x, y);
    }
    ctx.restore();
  }
}
function drawScreen(ctx){
  const S = DG.S; if (!S) return;
  const W = S.W, H = S.H;
  const lv = lightning();
  if (lv > 0) {
    const depthK = clamp(1 - Math.max(0, S.cam.y)/1400, 0.15, 1);
    ctx.fillStyle = `rgba(206,218,255,${0.2*lv*depthK*storm})`; ctx.fillRect(0, 0, W, H);
  }
  if (flashA > 0.003) { ctx.globalAlpha = flashA; ctx.fillStyle = flashC; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}
const LIGHTS = [], OFF = {};
function getLights(){
  LIGHTS.length = 0;
  for (const l of lights) { const k = l.life/l.max; if (k > 0.05) LIGHTS.push({x:l.x, y:l.y, r:l.r*0.75, k:clamp(l.k*k, 0, 1)}); }
  return LIGHTS;
}

DG.fx = {
  update, drawBack, drawMid, drawFront, drawScreen,
  burst, spark, explosion, dmgText, flash, shake,
  shakeAmount(){ return RM ? 0 : shakeV; },
  bubble(x, y, r){ bubble(x, y, r || 3, 0, 0); },
  lights: getLights,
  storm(){ return storm; },
  _off: OFF,
  _sprite(L, d, v){ return buildSprite(L, d, v); },
  _fauna(kind, sx, sy){ const S = DG.S; spawnFauna(DG.U.layerOf(S.cam.y + S.H/2), S.W, S.H, S.cam, kind); const o = fauna[fauna.length - 1]; o.ax = S.cam.x + S.W/2 + (sx - S.W/2)/o.p; o.ay = S.cam.y + S.H/2 + (sy - S.H/2)/o.p; o.t = 3; },
  _strike(){ strike(); },
};
})();
