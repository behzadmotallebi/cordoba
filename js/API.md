# Dalgıç modül sözleşmesi

Oyun tek sayfa: `dalgic.html` sırayla `js/data.js`, `js/fx.js`, `js/mon.js`, `js/wpn.js`, `js/boss.js`, `js/core.js` yükler.
Hepsi düz `<script>` (modül değil), ortak ad alanı `window.DG`. `core.js` en son yüklenir ve ana döngüyü başlatır.
Her modül dosyası bir IIFE'dir ve sadece kendi nesnesini kurar: `DG.fx`, `DG.mon`, `DG.wpn`, `DG.boss`.
Modüller birbirini doğrudan değil, bu sözleşmedeki fonksiyonlar üzerinden çağırır ve her çağrıdan önce varlığını kontrol eder
(`DG.fx && DG.fx.burst && DG.fx.burst(...)`), çünkü yükleme sırasında diğerleri henüz kurulmamış olabilir.
Kütüphane yok, dış dosya yok, sadece Canvas 2D. Hedef: orta seviye telefonda 60 fps.

## Koordinatlar ve çizim

- Dünya koordinatı: x ∈ [0, 1400], y = 0 deniz yüzeyi, aşağı doğru artar, `DG.S.worldH` (~60.500 px) en dip.
- Ekran = dünya − kamera: `sx = x - DG.S.cam.x`, `sy = y - DG.S.cam.y`. Ekran boyutu `DG.S.W` × `DG.S.H` (CSS px).
- Çizim fonksiyonları `ctx`'i DPR ölçekli (ve bazen sarsıntı ötelemeli) alır. `save()/restore()` ile çalış, transform'u bozma.
- Ekran dışında kalanı çizme (y ile kırp). Gölge/blur (`shadowBlur`, `filter`) kullanma: telefonda pahalı.
- Işık eklemek için `'lighter'` bileşimi serbest; işin bitince eski hale döndür.

## Ortak durum: `DG.S`

`save` (kalıcı kayıt), `diver` {x, y, vx, vy, ang, flip, inv}, `cam` {x, y}, `W`, `H`, `t` (saniye), `dt`,
`items` (hazineler), `mons` (canavarlar dizisi), `playing` (oyun akıyor mu), `lifting` (balonla çıkış),
`input.fire` (ateş basılı mı), `input.aim` ({x, y} birim vektör ya da null: iki parmak modunda sağ başparmağın nişan yönü; doluysa silahlar otomatik nişan yerine bu yöne ateş eder, ±12° içindeki hedefe hafif nişan yardımı serbest), `darkAlpha` (0..1, karanlık), `o2` (kalan hava, sn), `glowSpots`.
`save.tier` = açılmış en derin kat (0..10). `save.wpn` = {silahId: seviye 0..3} (yoksa kilitli), `save.curWpn`,
`save.skills` = {yetenekId: seviye 0..2}, `save.equip` = takılı 3 yetenek id'si (dash her zaman ayrı).

## Yardımcılar: `DG.U`

`rand(a,b)`, `clamp`, `hash(n)`, `rgb([r,g,b], a?)`, `dist`, `lerp`, `mix`,
`layerOf(y)` → kat 0..10, `toM(y)` → metre, `mToY(m)`, `LTOP[i]` kat üst y'si, `LH(i)` kat yüksekliği px, `LBOT(i)`,
`wallW(y, side)` duvar kalınlığı (side 0 sol, 1 sağ), `boundsAt(y)` → [minX, maxX] yüzülebilir aralık,
`inLedge(x, y)` kat rafı içinde mi (raflar her kat sınırında, ortada 520 px'lik asansör açıklığı var),
`waterAt(y)` → [r,g,b] su rengi, `darkAtM(m)`, `stationPos(s)`, `isSafe(x, y)` istasyonun güvenli bölgesi mi,
`valUnit(L)` o katın para birimi, `drawShape(shape, color, sx, sy, time, scale)` hazine şekli çizer (ekran koordinatı;
şekiller: shell star pearl coin coral amphora ingot gem diamond crystal compass watch statue tablet book chest bottle crown gear eye spear heart).

## Çekirdek API: `DG.core`

- `hurt(saniye, isim, kaynak{x,y})` dalgıca hasar (zırh, kalkan ve dokunulmazlık içeride hesaplanır). Dönüş: uygulanan hasar.
- `dmgFor(m)` → canavar `m`'nin bir ısırığının saniye cinsinden hasarı (katına göre ölçekli). Canavarlar bunu kullanır.
- `bounty(m)` canavar öldürülünce ödülü verir, yazı ve ses çıkarır. Öldüren modül çağırır (bkz. `DG.mon.damage`).
- `reward(miktar, x, y, etiket)` doğrudan para.
- `startLift()` kaldırma balonu (yetenek). `ink(sn)` ekranı mürekkeple karartır, `slow(sn)` dalgıcı yavaşlatır.
- `msg(metin, renk)`, `float(x, y, metin, renk)` dünyada yükselen yazı, `sfx(ad)`, `buzz(ms)`.
  Ses adları: pick sell buy hurt growl shot hit kill boom zap net sonar dash flare balloon roar relic warn faint elev.
- `gSpeed()`, `gLight()`, `gTank()`, `tier()`, `wdmg()` (eser kaynaklı silah hasarı çarpanı), `demo()`.
- `bossHUD(bossOran, gemiOran, isim)` üstteki canavar/gemi çubukları; `bossHUD(null)` gizler.
- `bossWon()` final kazanıldı. `bossLost()` gemi battı (tekrar dene ekranı).

## `DG.mon` (js/mon.js) canavarlar

Veri: `DG.data.MON[tip]` = {n, hp, dmg, bounty, r, spd?, aggro?, eye?, mimic?}. Kat listesi: `DG.data.LAYERS[L].mons` = [[tip, f0, f1, 1000px başına yoğunluk]].
Tipler: jelly eel shark angler viper squid serpent guardian mimic octopus.

- `spawnLayer(L)` → o kat için yeni canavar nesneleri dizisi. Her nesnede en az: `t, L, x, y, vx, vy, hp, maxHp, size (1 normal, >1 dev), dead:false`.
  Can katla ölçeklenir: `hp = MON.hp * (1 + 0.35*L) * (size>1 ? 1.6 : 1)`. Yoğunluk katla artar (`1 + 0.12*L`). İstasyon güvenli bölgesine ve raflara koyma
  (çekirdek yine de filtreler). Katın eseri (raf üstünde) yakınına 1-2 güçlü "bekçi" koymak serbest (kat ≥ 2).
- `update(m, dt)` yapay zekâ + temas. Isırınca `DG.core.hurt(DG.core.dmgFor(m), MON.n, m)`. Temastan sonra kısa bekleme.
  `DG.U.isSafe(x,y)` bölgesine girmesin. `DG.wpn.flares` (dizi {x,y,t}) yakınında kaç. `DG.wpn.camoActive()` iken dalgıcı görmesin.
  Duvar ve raflardan geçmesin (`boundsAt`, `inLedge`). Sadece `DG.S.playing` iken saldırsın.
- `damage(m, miktar, {stun, kx, ky, kind})` silahlar çağırır: can düşür, beyaz parlama, sersemletme, geri itme; ölürse `m.dead = true` ve `DG.core.bounty(m)`, efekt.
- `radius(m)` isabet yarıçapı.
- `draw(ctx, m)` ışıkla görünen gövde (karanlık katmandan önce çizilir, karanlıkta kaybolur).
- `drawGlow(ctx, m, darkAlpha)` karanlığın üstüne çizilenler: parlayan gözler, fener balığı ışığı, denizanası ışıltısı, sonar ile açığa çıkan taklitçiler.
- `lights()` → [{x, y, r, k}] karanlıkta delik açan ışıklar (dünya koordinatı).
- Taklitçiler: `mimic` hazine sandığı gibi görünür (çekirdekteki `drawShape('chest', ...)` ile aynı), yaklaşınca ağzını açıp saldırır.
  `octopus` duvar/kaya çıkıntısı gibi kamufle durur, yaklaşınca açılıp yakalar (`DG.core.slow`). `angler` karanlık katlarda yemi inci/mücevher gibi parlar.
  `DG.wpn.sonarActive()` iken taklitçiler kırmızı çerçeveyle belli olur.

## `DG.wpn` (js/wpn.js) silahlar ve yetenekler

Veri: `DG.data.WEAPONS`, `DG.data.SKILLS`. Seviye çarpanı: silah hasarı × (1 + 0.5*seviye) × `DG.core.wdmg()`; yetenek bekleme × `DG.data.SKILL_CD[seviye]`.

- `update(dt)` `DG.S.input.fire` basılıysa seçili silahı ateşler (dolum süresine göre), mermileri/efektleri ilerletir, yetenek sürelerini işler.
  Hedefler: `DG.S.mons` (`DG.mon.radius`, `DG.mon.damage`) + `DG.boss.targets()` (varsa; her biri {x, y, r, hit(miktar, opts)}).
  Otomatik nişan: menzildeki en yakın hedef, yoksa dalgıcın baktığı yön (`diver.ang`, `diver.flip`).
  Sadece `DG.S.playing` iken ateş et. İstasyonda (dalgıç y < 30) ateş etme.
- `next()` sahip olunan bir sonraki silaha geç (`save.curWpn`), kısa mesaj.
- `skill(id)` yeteneği kullan (sahipse, hazırsa). `lift` → `DG.core.startLift()`.
- `skillInfo(id)` → {frac: kalan bekleme 0..1, active: bool}. `fireInfo()` → {frac}.
- `speedMult()` (dash), `defenseMult()` (elektrik kalkanı açıkken hasar azaltma vb.), `camoActive()`, `sonarActive()`, `flares` dizisi.
- `draw(ctx)` mermiler, ağlar, ışın, kalkan halkası; `drawUnder(ctx)` dalgıcın arkasına; `drawGlow(ctx, darkAlpha)` karanlık üstü parıltılar; `lights()`.

## `DG.boss` (js/boss.js) final canavarı

Tetik: oyuncu Atlantis'in Kalbi'ni bir istasyona getirir → çekirdek kartı gösterir → oyuncu tekneye çıkar → `DG.boss.start()`.
Dövüş yüzeyde, teknenin çevresinde (y ≈ 0..900). Karanlık kapalıdır (`active()` true iken).
- `start()` dövüşü (yeniden) başlatır: canavar derinden tekneye doğru yükselir. Gemi canı 100.
- `update(dt)`, `draw(ctx)`, `drawGlow(ctx, a)`, `lights()`, `active()` → bool, `reset()` (sayfa açılışında).
- `targets()` → silahların vurabileceği parçalar [{x, y, r, hit(miktar, opts)}] (zayıf noktalar daha çok hasar alır).
- Her karede `DG.core.bossHUD(canOranı, gemiOranı, 'Derinlerin Efendisi')`. Kazanınca `DG.core.bossWon()`, gemi canı 0 olunca `DG.core.bossLost()`.
- Dalgıca saldırı: `DG.core.hurt(...)`. Gemiye saldırı: kendi gemi canını düşür, `DG.fx.shake`, ses.
- `boatTint(ctx)` (isteğe bağlı) gemi çizilmeden önce çağrılır; hasar görünümü için.

## `DG.fx` (js/fx.js) görsel efektler

- `drawBack(ctx)` gökyüzü + su gradyanı (`DG.U.waterAt`), uzak arka plan siluetleri (paralaks, kata göre), ışık hüzmeleri, yüzeye yakın kostik ışık desenleri, deniz karı.
  Duvarlar ve raflar bunun ÜSTÜNE çekirdek tarafından çizilir. Final dövüşünde (`DG.boss.active()`) fırtınalı gökyüzü ve şimşek.
- `drawMid(ctx)` dalgıçtan sonra, karanlıktan önce: parçacıklar (kıvılcım, kabarcık patlaması, enkaz).
- `drawFront(ctx)` karanlıktan sonra: parlayan parçacıklar, patlama ışıkları, hasar sayıları.
- `drawScreen(ctx)` ekran efektleri (flaş).
- `update(dt)`, `burst(x, y, renk, adet, hız)`, `spark(x, y)`, `explosion(x, y, yarıçap)`, `dmgText(x, y, metin, renk)`, `shake(miktar)`, `shakeAmount()`, `flash(renk, alfa)`.

## Görsel dil

Koyu, derin, tehlikeli; ama okunaklı. Arayüz pirinç (#d9a441, #f4cf7a) ve lacivert. Canavarlar katla daha karanlık ve vahşi.
Işık kaynakları sıcak (fener, fişek turuncu) ya da biyolüminesan (camgöbeği, mor). Kırmızı = tehlike.
