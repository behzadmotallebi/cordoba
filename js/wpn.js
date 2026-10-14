/* Dalgıç: silahlar ve yetenekler (taslak, ajan tarafından genişletilecek). */
(function () {
'use strict';
const DG = window.DG;
let cd = 0, darts = [], dashT = 0;
const skCd = {};
DG.wpn = {
  flares: [],
  update(dt){
    const S = DG.S, d = S.diver;
    if (cd > 0) cd -= dt; if (dashT > 0) dashT -= dt;
    for (const k in skCd) if (skCd[k] > 0) skCd[k] -= dt;
    if (S.playing && S.input.fire && cd <= 0 && d.y > 30) {
      const dx = Math.cos(d.ang)*d.flip, dy = Math.sin(d.ang);
      darts.push({x:d.x, y:d.y, vx:dx*900, vy:dy*900, life:0.55}); cd = 0.55; DG.core.sfx('shot');
    }
    for (const p of darts) {
      p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt;
      for (const m of S.mons) if (!m.dead && DG.U.dist(m.x, m.y, p.x, p.y) < DG.mon.radius(m) + 8) { DG.mon.damage(m, 1*DG.core.wdmg(), {stun:1}); p.life = 0; break; }
    }
    darts = darts.filter(p => p.life > 0);
  },
  next(){},
  skill(id){ if (id === 'dash' && !(skCd.dash > 0)) { dashT = 0.35; skCd.dash = 4; DG.core.sfx('dash'); } if (id === 'lift' && !(skCd.lift > 0)) { if (DG.core.startLift()) skCd.lift = 40; } },
  skillInfo(id){ return {frac:(skCd[id] || 0) > 0 ? skCd[id]/(id === 'dash' ? 4 : 40) : 0, active:false}; },
  fireInfo(){ return {frac:cd > 0 ? cd/0.55 : 0}; },
  speedMult(){ return dashT > 0 ? 3 : 1; },
  camoActive(){ return false; }, sonarActive(){ return false; }, defenseMult(){ return 1; },
  draw(ctx){ ctx.strokeStyle = '#d7e2ea'; ctx.lineWidth = 2; for (const p of darts) { ctx.beginPath(); ctx.moveTo(p.x - DG.S.cam.x, p.y - DG.S.cam.y); ctx.lineTo(p.x - DG.S.cam.x - p.vx*0.02, p.y - DG.S.cam.y - p.vy*0.02); ctx.stroke(); } },
};
})();
