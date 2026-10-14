/* Dalgıç: final canavarı (taslak, ajan tarafından genişletilecek). */
(function () {
'use strict';
const DG = window.DG;
let on = false;
DG.boss = {
  start(){ on = true; DG.core.msg('Canavar geliyor!', 'var(--danger)'); setTimeout(() => { on = false; DG.core.bossWon(); }, 3000); },
  active(){ return on; }, reset(){ on = false; }, targets(){ return []; },
};
})();
