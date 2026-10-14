/* Dalgıç: görsel efektler (taslak, ajan tarafından genişletilecek). */
(function () {
'use strict';
const DG = window.DG;
let shake = 0;
DG.fx = {
  update(dt){ if (shake > 0) shake = Math.max(0, shake - dt*30); },
  shake(a){ shake = Math.max(shake, a); },
  shakeAmount(){ return shake; },
};
})();
