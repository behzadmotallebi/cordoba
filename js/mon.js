/* Dalgıç: canavarlar (taslak, ajan tarafından genişletilecek). */
(function () {
'use strict';
const DG = window.DG;
DG.mon = {
  spawnLayer(L){
    const U = DG.U, out = [], ly = DG.data.LAYERS[L];
    for (const [t, f0, f1, per] of ly.mons) {
      const n = Math.round(per*(1 + 0.12*L)*(f1 - f0)*U.LH(L)/1000);
      for (let i = 0; i < n; i++) {
        const y = U.LTOP[L] + U.rand(f0, f1)*U.LH(L), [lo, hi] = U.boundsAt(y);
        const hp = DG.data.MON[t].hp*(1 + 0.35*L);
        out.push({t, L, x:U.rand(lo + 40, hi - 40), y, hx:0, hy:y, vx:U.rand(-20, 20), vy:0, hp, maxHp:hp, size:1, cd:0, stun:0, dead:false, ph:U.rand(0, 6)});
      }
    }
    return out;
  },
  update(m, dt){
    const S = DG.S, U = DG.U, d = S.diver;
    m.ph += dt; if (m.cd > 0) m.cd -= dt; if (m.stun > 0) { m.stun -= dt; return; }
    m.x += m.vx*dt; m.y = m.hy + Math.sin(m.ph)*20;
    const [lo, hi] = U.boundsAt(m.y); if (m.x < lo + 20 || m.x > hi - 20) m.vx *= -1;
    if (S.playing && m.cd <= 0 && U.dist(m.x, m.y, d.x, d.y) < DG.data.MON[m.t].r + 12) { DG.core.hurt(DG.core.dmgFor(m), DG.data.MON[m.t].n, m); m.cd = 1.5; }
  },
  radius(m){ return DG.data.MON[m.t].r*m.size; },
  damage(m, amt, o){ m.hp -= amt; m.stun = (o && o.stun) || 0.3; if (m.hp <= 0 && !m.dead) { m.dead = true; DG.core.bounty(m); } },
  draw(ctx, m){ ctx.fillStyle = '#c05080'; ctx.beginPath(); ctx.arc(m.x - DG.S.cam.x, m.y - DG.S.cam.y, DG.data.MON[m.t].r*m.size, 0, 7); ctx.fill(); },
};
})();
