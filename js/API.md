# Dalgıç modül sözleşmesi

Oyun tek sayfa: `dalgic.html` sırayla `js/data.js`, `js/fx.js`, `js/mon.js`, `js/wpn.js`, `js/boss.js`, `js/art.js`, `js/core.js` yükler.
Hepsi düz `<script>` (modül değil), ortak ad alanı `window.DG`. `core.js` en son yüklenir ve ana döngüyü başlatır.
Her modül dosyası bir IIFE'dir ve sadece kendi nesnesini kurar: `DG.fx`, `DG.mon`, `DG.wpn`, `DG.boss`.
Modüller birbirini doğrudan değil, bu sözleşmedeki fonksiyonlar üzerinden çağırır ve her çağrıdan önce varlığını kontrol eder
(`DG.fx && DG.fx.burst && DG.fx.burst(...)`), çünkü yükleme sırasında diğerleri henüz kurulmamış olabilir.
Kütüphane yok, dış dosya yok, sadece Canvas 2D. Hedef: orta seviye telefonda 60 fps.

## Koordinatlar ve çizim

- Dünya koordinatı: x ∈ [0, 1400], y = 0 deniz yüzeyi, aşağı doğru artar, `DG.S.worldH` (~253.000 px) en dip.
  Kat yüksekliği `LH(i) = 13000 + 2000*i` px (kat 0: 13.000, kat 10: 33.000). Metreler (`LAYERS[i].top/bot`) değişmedi; karanlık metreye göre.
  Dalgıç hızı `150*1.12^kat*KM.speed` (canavarlar da `1.12^kat`): tam ekipmanla bir katı baştan dibe inmek ~45-55 sn, toplayarak ve dövüşerek 60-90 sn.
- Karanlık katmanı yarım çözünürlükte çizilip büyütülür (yumuşak degrade, dolum maliyeti düşük); `lights()` delikleri de öyle.
- Ekran = dünya − kamera: `sx = x - DG.S.cam.x`, `sy = y - DG.S.cam.y`. Ekran boyutu `DG.S.W` × `DG.S.H` (CSS px).
- Çizim fonksiyonları `ctx`'i DPR ölçekli (ve bazen sarsıntı ötelemeli) alır. `save()/restore()` ile çalış, transform'u bozma.
- Ekran dışında kalanı çizme (y ile kırp). Gölge/blur (`shadowBlur`, `filter`) kullanma: telefonda pahalı.
- Işık eklemek için `'lighter'` bileşimi serbest; işin bitince eski hale döndür.

## Ortak durum: `DG.S`

`save` (kalıcı kayıt), `diver` {x, y, vx, vy, ang, flip, inv}, `cam` {x, y}, `W`, `H`, `t` (saniye), `dt`,
`items` (hazineler), `mons` (canavarlar dizisi), `playing` (oyun akıyor mu), `lifting` (balonla çıkış),
`input.fire` (ateş basılı mı), `input.aim` ({x, y} birim vektör ya da null: iki parmak modunda sağ başparmağın nişan yönü; doluysa silahlar otomatik nişan yerine bu yöne ateş eder, ±12° içindeki hedefe hafif nişan yardımı serbest), `darkAlpha` (0..1, karanlık), `o2` (kalan hava, sn), `glowSpots`.
`hazards` (kırılmaz engeller, bkz. `DG.mon.spawnHazards`).
`save.killed` = {kat: [öldürülen liste sırası (m.rid)...]}, `save.cleared` = temizlenen katlar (eski kayıtta yoksa boş: listeler dolu başlar).
`save.tier` = açılmış en derin kat (0..10). `save.wpn` = {silahId: seviye 0..3} (yoksa kilitli), `save.curWpn`,
`save.skills` = {yetenekId: seviye 0..2}, `save.equip` = takılı 3 yetenek id'si (dash her zaman ayrı).

## Yardımcılar: `DG.U`

`rand(a,b)`, `clamp`, `hash(n)`, `rgb([r,g,b], a?)`, `dist`, `lerp`, `mix`,
`layerOf(y)` → kat 0..10, `toM(y)` → metre, `mToY(m)`, `LTOP[i]` kat üst y'si, `LH(i)` kat yüksekliği px, `LBOT(i)`,
`wallW(y, side)` duvar kalınlığı (side 0 sol, 1 sağ), `boundsAt(y)` → [minX, maxX] yüzülebilir aralık,
`isSafeAny(x, y)` açılmamışlar dahil herhangi bir istasyonun güvenli bölgesi mi (canavar listesi üretimi bunu kullanır),
`relicPos(L)` → {x, y} katın eserinin sabit yeri (kat + Yeni Sefer+ turuyla tohumlu; bekçiler buna göre yerleşir),
`inLedge(x, y)` kat rafı içinde mi (raflar her kat sınırında, ortada 520 px'lik asansör açıklığı var),
`waterAt(y)` → [r,g,b] su rengi, `wallColor(y)` → [r,g,b] duvar boyası (ekran ortasındaki y için), `ledgeColor(i)` → i. kat rafının boyası (taklitçi ahtapot kamuflajı bunlarla eşleşir), `darkAtM(m)`, `stationPos(s)`, `isSafe(x, y)` istasyonun güvenli bölgesi mi,
`valUnit(L)` o katın para birimi, `drawShape(shape, color, sx, sy, time, scale)` hazine şekli çizer (ekran koordinatı;
şekiller: shell star pearl coin coral amphora ingot gem diamond crystal compass watch statue tablet book chest bottle crown gear eye spear heart).

## Çekirdek API: `DG.core`

- `hurt(saniye, isim, kaynak{x,y})` dalgıca hasar (zırh, kalkan ve dokunulmazlık içeride hesaplanır). Dönüş: uygulanan hasar.
- `dmgFor(m)` → canavar `m`'nin bir ısırığının saniye cinsinden hasarı (katına göre ölçekli). Canavarlar bunu kullanır.
- `bounty(m)` canavar öldürülünce ödülü verir, yazı ve ses çıkarır. Öldüren modül çağırır (bkz. `DG.mon.damage`).
- `reward(miktar, x, y, etiket)` doğrudan para.
- `startLift()` kaldırma balonu (yetenek). `ink(sn)` ekranı mürekkeple karartır, `slow(sn)` dalgıcı yavaşlatır.
- `msg(metin, renk)`, `float(x, y, metin, renk)` dünyada yükselen yazı, `sfx(ad)`, `buzz(ms)`.
  Ses adları: pick sell buy hurt growl shot hit kill boom zap net sonar dash flare balloon roar relic warn faint elev sonic camo thunder.
- `gSpeed()`, `gLight()`, `gTank()`, `tier()`, `wdmg()` (eser kaynaklı silah hasarı çarpanı), `demo()`.
- `roster(L)` → {total, left, cleared}: katın sabit canavar listesi ve kalanlar (HUD "CANAVAR 12/40", asansör listesi).
  `bounty(m)` öldürülen canavarın `m.rid`'ini `save.killed[m.L]`'ye yazar (2 sn'de bir kaydedilir). Liste bitince kat "temizlendi":
  bir kerelik ödül (o katın asansör fiyatının %12'si) ve satışlara kalıcı +%3 (`relicMods`). Yeni Sefer+ listeleri ve temizlenenleri sıfırlar.
- `bossHUD(bossOran, gemiOran, isim)` üstteki canavar/gemi çubukları; `bossHUD(null)` gizler. Çubuk açıkken `body.boss` sınıfı konur:
  para paneli gizlenir, çubuk onun yerine üste çıkar, kamera tekneyi göstermek için biraz daha yukarı bakar.
- `bossWon()` final kazanıldı: zafer yazısı, ~3 sn sonra "Derinlerden bir sinyal geliyor..." (gürleme + sonar), `save.signal = true`.
  Oyun durmaz; bitiş kartı gizli kapı açılıp fragman bitince gelir (bkz. aşağıda). `bossLost()` gemi battı (tekrar dene ekranı).
- `S.cine` true iken (fragman açık) ana döngü `update/render` çağırmaz.

### Kaptanlar (profiller) ve kayıt

- localStorage, hepsi try/catch'li (`lsGet/lsSet/lsDel`): `dalgic3.profiles` dizin `[{id, name, tier, money, best, won, door, last}]`
  (liste ekranı kayıtları açmadan bunu okur; `persist()` gerçek oyunda tazeler), `dalgic3.active` etkin kaptan id'si,
  `dalgic3.p.<id>` gerçek kayıt, `dalgic3.p.<id>.demo` o kaptanın demo kaydı. `dalgic-demo` demo bayrağı (ortak).
- İlk açılış (kaptan yok): girişte "Adın ne, dalgıç?" (boşsa "Dalgıç"); kaptan yokken `persist()` hiçbir şey yazmaz.
  Eski tek kayıt (`dalgic-save-v3`, `-demo`) ilk oluşturulan kaptana bir kez kopyalanır (`dalgic3.migrated`), eski anahtarlar silinmez.
- Ad: en çok 16 karakter, kırpılır, büyük/küçük harf duyarsız (tr-TR) tekil. Yeni kaptan `defaultSave()` ile sıfırdan başlar.
- Kaptan değiştirme / demo düğmesi: `reloadSave()` kaydı yerinde baştan kurar (`load`, `DG.wpn.reset`, `setup()`: dünya, canavar listeleri;
  tema art.js'te her karede). Silme sayfa içi onaylı; etkin kaptan silinirse en son oynanana, hiç kalmazsa ilk açılışa döner.
- HUD para panelinde `#hName`, bitiş kartında "Tebrikler, <ad>!".

### Gizli kapı ve DALGIÇ 2 fragmanı

- Kayıt: `save.signal` (finalden sonra), `save.doorOpened`, `save.teaserSeen` (Yeni Sefer+ ilk ikisini sıfırlar, üçüncüsü kalır).
  Eski kayıtta `bossDone` varsa sinyal hemen açılır.
- Kapı: son katın dibinde, `{x: BOAT_X, y: WORLD_H - 118}`, yarıçap 104. `secret_door` sprite'ı varsa `DG.art.sprite` ile (uzun kenar 2.3R),
  yoksa prosedürel (altın disk, rün halkası, kalp yuvası). Karanlıkta kendi ışık deliği ve camgöbeği hale. Sinyal varken çizilir.
- Pusula `#sig`: kapı açılana kadar; ok dalgıçtan kapıya döner, metin derinlik farkı (`↓ 6.480 m`, 400 px içinde "KAPI BURADA").
  Dar ekranda dalış bilgisayarı panelinin altında, genişte üst ortada.
- Fragman kapıya ~1500 m kala indirilir (açılışta yüklenmez). Dalgıç kapıya değince: kontrol donar, karartma, `assets/video/teaser.mp4`
  tam ekran (telefonda cover, genişte 9:16 çerçeve). Süre `ended` olayından; sesli dener, engellenirse sessiz + "SESİ AÇ".
  Video bitince `teaser_end.jpg` + "DALGIÇ 2 / YAKINDA" + lore ~3 sn, sonra Devam → bitiş kartı. "ATLA" her an, Esc de.
  Yüklenemezse doğrudan son kare + başlık. Tekrar: bitiş kartında "Fragmanı tekrar izle", girişte `teaserSeen` (ya da kaptanın `door`) varsa.

## `DG.mon` (js/mon.js) canavarlar

Veri: `DG.data.MON[tip]` = {n, hp, dmg, bounty, r, spd?, aggro?, eye?, mimic?, obst?, blast?}. Kat listesi: `DG.data.LAYERS[L].mons` = [[tip, f0, f1, 1000px başına yoğunluk]],
`LAYERS[L].obst` = engeller, aynı biçim: `urchin` (deniz kestanesi kümesi, duvar/raf dibinde, değince batar), `mine` (eski mayın: değince ya da vurulunca
patlar, 115 px içinde dalgıca ve canavarlara hasar, zincirleme), `curtain` (denizanası perdesi: katı enlemesine kesen dar aralıklı sıra; 1000 px başına perde),
`vent` (kızgın baca: kırılmaz, kat listesine sayılmaz). Kestane ve mayın canavar gibi `S.mons`'tadır ve listeye sayılır.
Tipler: jelly eel shark angler viper squid serpent guardian mimic octopus urchin mine (+ `vent` yalnız `hazards`).

- `spawnLayer(L, seed)` → o katın SABİT listesi: aynı tohumla her çağrıda aynı canavarlar aynı sırayla (üretim sırasında `Math.random` tohumlu
  bir üreteçle değiştirilir). Her nesneye `m.rid` (liste sırası) verilir; çekirdek öldürülenleri atlar. Yerleşim açılmamış istasyonları da güvenli sayar
  (`isSafeAny`) ki liste açılan kata göre değişmesin. Yoğunluk `1 + 0.08*L`. Bekçiler: eserin (`relicPos`) yanında, kat 0-4'te 2, sonra 3 (kat ≥ 2'de biri dev).
- `spawnHazards(L, seed)` → kırılmaz bacalar; `updateHazard(hz, dt)`, `drawHazard(ctx, hz, glowPass)` (önce gövde, karanlıktan sonra ışık/fışkırma),
  `hazardLight(hz)` → karanlıkta delik ya da null. Döngü: boşta → 1 sn kızıl ışık ve kabarcık (uyarı) → ~1.3 sn fışkırma (fışkırma başına bir hasar).
- Canavar nesnelerinde en az: `t, L, rid, x, y, vx, vy, hp, maxHp, size (1 normal, >1 dev), dead:false`.
  Can katla ölçeklenir: `hp = MON.hp * (1 + 0.35*L) * (size>1 ? 1.6 : 1)`. İstasyon güvenli bölgesine ve raflara konmaz.
  Sezme menzili `aggro*1.2*(1 + 0.04*L)`; sığ denizanaları 170 px içinde dalgıca doğru süzülür.
- `update(m, dt)` yapay zekâ + temas. Isırınca `DG.core.hurt(DG.core.dmgFor(m), MON.n, m)`. Temastan sonra kısa bekleme.
  `DG.U.isSafe(x,y)` bölgesine girmesin. `DG.wpn.flares` (dizi {x,y,t}) yakınında kaç. `DG.wpn.camoActive()` iken dalgıcı görmesin.
  Duvar ve raflardan geçmesin (`boundsAt`, `inLedge`). Sadece `DG.S.playing` iken saldırsın.
- `damage(m, miktar, {stun, kx, ky, kind})` silahlar çağırır: can düşür, beyaz parlama, sersemletme, geri itme; ölürse `m.dead = true` ve `DG.core.bounty(m)`, efekt.
  Sersemletme: ağ, sonik, patlama, torpido, şok ve `kind` vermeyen çağrılar her zaman tam sersemletir. `kind: 'dart'` (zıpkın, tüfek) ve `'beam'` (üç dişli)
  sersemletmesi `m.sAcc`'ta birikir; eşik aşılınca canavar 1,1 sn bu ikisine bağışık olur (`m.sImm`). Böylece tek hedefli seri ateş canavarı sürekli kilitleyemez.
- `radius(m)` isabet yarıçapı.
- `spawnAt(tip, x, y, L, {size, hunt, ignoreSafe, keeper, hpMul, vx, vy})` canavar yaratıp `DG.S.mons`'a ekler ve döndürür (final çağırır).
  `hunt` hemen kovalatır; `DG.boss.active()` iken `hunt` ve `ignoreSafe` varsayılan olarak açıktır.
- `m.hidden` / `isHidden(m)`: kılık değiştirmiş taklitçi ya da ahtapot (silahlar otomatik nişanda atlar, sonar gösterir). `reveal(m)` açığa çıkarır.
- `lurking(m)` → bool: deliğine çekilmiş ve dalgıca uzanamayan murena; mayın her zaman, kestane dalgıç 150 px'ten uzaktayken (otomatik nişan engellere mermi harcamasın). Otomatik nişan, torpido ve patlayıcı mızrak onu atlar; ona doğru giden mermi yine vurur.
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
- `skillInfo(id)` → {frac: kalan bekleme 0..1, active: bool}. `fireInfo()` → {frac}. `shortName(id)` silahın HUD etiketi (ZIPKIN, TÜFEK…),
  `aimTarget()` o anki hedef, `shockActive()`, `dashActive()`, `reset()`.
- Hasar sayıları `DG.fx.dmgText` ile hedef başına 0,18 sn toplanıp yazılır (×10 tam sayı).
- `speedMult()` (dash), `defenseMult()` (elektrik kalkanı açıkken hasar azaltma vb.), `camoActive()`, `sonarActive()`, `flares` dizisi.
- `draw(ctx)` mermiler, ağlar, ışın, kalkan halkası; `drawUnder(ctx)` dalgıcın arkasına; `drawGlow(ctx, darkAlpha)` karanlık üstü parıltılar; `lights()`.

## `DG.boss` (js/boss.js) final canavarı

Tetik: oyuncu Atlantis'in Kalbi'ni bir istasyona getirir → çekirdek kartı gösterir → oyuncu tekneye çıkar → `DG.boss.start()`.
Dövüş yüzeyde, teknenin çevresinde (y ≈ 0..900). Karanlık kapalıdır (`active()` true iken).
- `start()` dövüşü (yeniden) başlatır: canavar derinden tekneye doğru yükselir. Gemi canı 100.
- `update(dt)`, `draw(ctx)`, `drawGlow(ctx, a)`, `lights()`, `active()` → bool, `reset()` (sayfa açılışında).
- `targets()` → silahların vurabileceği parçalar [{x, y, r, hit(miktar, opts)}] (zayıf noktalar daha çok hasar alır).
  `weak:true` otomatik nişanda önceliklidir. `ownNums:true` olan parçanın hasar sayısını silah modülü yazmaz; final, çarpanı
  uygulanmış gerçek hasarı kendisi yazar (alan silahları karede tek parçaya sayıldığı için). Sersemletme parçaya en çok 1,2 sn gelir.
- `focus()` → {x, y} ya da null: sadece hücum hazırlığında (windup) kafanın konumu. Çekirdek kamerayı oraya doğru kaydırır ki gözler ekranda kalsın.
  Her karede aynı nesne döner (ayırma yok).
- `info()` test ve hata ayıklama için anlık durum.
- Her karede `DG.core.bossHUD(canOranı, gemiOranı, 'Derinlerin Efendisi')`. Kazanınca `DG.core.bossWon()`, gemi canı 0 olunca `DG.core.bossLost()`.
- Dalgıca saldırı: `DG.core.hurt(...)`. Gemiye saldırı: kendi gemi canını düşür, `DG.fx.shake`, ses.
- `boatTint(ctx)` (isteğe bağlı) gemi çizilmeden önce çağrılır; hasar görünümü için.

## `DG.fx` (js/fx.js) görsel efektler

- `drawBack(ctx)` gökyüzü + su gradyanı (`DG.U.waterAt`), uzak arka plan siluetleri (paralaks, kata göre), ışık hüzmeleri, yüzeye yakın kostik ışık desenleri, deniz karı.
  Duvarlar ve raflar bunun ÜSTÜNE çekirdek tarafından çizilir. Final dövüşünde (`DG.boss.active()`) fırtınalı gökyüzü ve şimşek.
- `drawMid(ctx)` dalgıçtan sonra, karanlıktan önce: parçacıklar (kıvılcım, kabarcık patlaması, enkaz).
- `drawFront(ctx)` karanlıktan sonra: parlayan parçacıklar, patlama ışıkları, hasar sayıları.
- `drawScreen(ctx)` ekran efektleri (flaş).
- `update(dt)`, `burst(x, y, renk, adet, hız)`, `spark(x, y, renk?)`, `explosion(x, y, yarıçap)`, `dmgText(x, y, metin, renk)`, `shake(miktar)`, `shakeAmount()`, `flash(renk, alfa)`.
- `lights()` patlama ve kıvılcım ışıkları (çekirdek karanlıkta bunlara da delik açar), `bubble(x, y, r?)`, `storm()` → 0..1 fırtına karışımı.

## `DG.art` (js/art.js) boyalı sprite hattı

`boss.js`'den sonra, `core.js`'den önce yüklenir. `assets/manifest.json` yoksa (ya da sayfa `file://` ile açıldıysa) sessizce hiçbir şey yapmaz:
oyun birebir prosedürel çizimle akar. Sprite'lar indikçe kendiliğinden devreye girer (Image + decode, açılışı bekletmez).
Test için başka bir klasör: `dalgic.html?art=http://127.0.0.1:5174/` (manifest o adresten okunur, CORS gerekir).

- `drawBack(ctx)` core `render()` içinde `DG.fx.drawBack`'ten hemen sonra: kameranın altındaki katın `bg_<kat>` görüntüsünü
  düşük alfa (~0.42–0.5) ve yavaş paralaksla çizer, kat sınırına 700 px kala komşu katla karışır. Her karede ayrıca
  `document.body.dataset.tier = save.tier` (arayüz teması) ve `DG.mon.draw` sarmalayıcısını tazeler.
- `diver(ctx, x, y, bulk, tier)`, `ship(ctx, tier, L)`, `shape(ctx, s, c, x, y, t, scale)`, `relic(ctx, L, x, y, t, scale)`:
  sprite varsa çizip `true` döner; çekirdek `false` dönerse prosedürel çizer. `has(ad)`, `info()` (yüklenenler).
- `weapon(ctx, silahId)`: `wpn.js drawHeld` çağırır (yerel çerçeve: kabza 0,0, namlu +x, nişan sola dönünce y aynalı). `wpn_<id>` varsa çizer, `true` döner;
  yoksa prosedürel silah. Varsayılan yerleşim `{x0:-14, w:50, cy:0}` (yerel birim, `wsc()` öncesi); manifestte `fit` ile ezilir.
  `diver_<n>_nogun` varsa VE elde boyalı silah varsa dalgıç onunla çizilir (boyalı silah gizlenir); yoksa silah dalgıcın üstüne bindirilir.
- `sprite(ctx, ad, x, y, boy, dönüş?)` genel tekil sprite (ör. `secret_door`), uzun kenar `boy`, çapaya göre; yoksa `false`.
- `src(ad)` → arayüz için görüntü adresi ya da null. Dükkân ikon yuvaları: `gear_<iz>_<kat>`, `wpn_<id>`, `skill_<id>`, `cons_<id>`; yoksa çizgi ikon (SVG).
- `DG.mon.draw` sarmalanır: `mon_<tip>` varsa sprite (aynı `m.ox/m.oy` + `m.fa..fd` dönüşümü), yoksa ve özel durumlarda
  (gizli taklitçi sandık, kamufle ahtapot) orijinal. `m.flash` beyaz siluetle. `drawGlow` dokunulmadan üstte çalışır.
- Animasyon: sprite dikey şeritlere bölünüp yürüyen sinüsle kaydırılır (kuyruk tarafı); denizanası/ahtapot yatay şerit,
  kalamar jet sıkışması; murena ve deniz yılanı gövde zinciri boyunca şerit şerit kaplanır. Bitmap'ler cihaz pikseli
  boyutunda önbelleğe küçültülür.
- Final canavarı: `boss.js` `draw` içinde `DG.art.boss.body/head(ctx, bossArt(), ox, oy)` dener (yoksa prosedürel).
  `boss_seg` 30 boğumlu zincir boyunca döşenir, `boss_tail` 20. boğumdan uca, `boss_head` baş dönüşümüyle; alt çene `jaw` ile döner,
  göz kapakları `eyeO` ile kararır. Çizim isabet noktalarına (göz/solungaç/ağız) göre yerleştirildi; hedefler değişmedi.
  `drawGlow` göz parıltılarını `DG.art.boss.eyes` konumlarında çizer.

### Varlık sözleşmesi (`assets/`)

```json
{"sprites": {"mon_shark": {"src":"sprites/mon_shark.webp", "w":1024, "h":400, "ax":0.5, "ay":0.5}},
 "bg": {"0": {"src":"bg/bg_0.webp", "w":1080, "h":1920}}}
```
- Hepsi sıkı kırpılmış, saydam arka planlı (bg hariç: opak, 9:16). `ax/ay` normalize çapa (gemi için `ay` = su çizgisi).
- İsteğe bağlı `"fit": {"x0":-44, "w":83, "cy":-3}`: canavar/dalgıç sprite'ının prosedürel yerel çerçevedeki yeri
  (burun +x, birim = m.sc öncesi px). Gözler `drawGlow`'da prosedürel yerlerde parlar; sprite'ın gözü kayarsa `fit` ile hizala.
- Ekipman/silah: `gear_<iz>_<kat>` (iz: tank speed bag light suit armor; kat 0..10 = `GEAR[iz][kat]` adı) kare ikon;
  `wpn_<id>` (spear bang net aps sonic torpedo trident) yandan, namlu SAĞDA, sıkı kırpılmış (elde ve dükkânda);
  isteğe bağlı `diver_<n>_nogun` (aynı çerçevede silahsız dalgıç), `skill_<id>`, `cons_<id>` ikonları. Hepsi yoksa oyun aynen çalışır.
- Adlar: `diver_0` (kat 0–3), `diver_1` (4–7), `diver_2` (8–10), yandan, baş SAĞDA (+x).
  `mon_jelly mon_eel mon_shark mon_angler mon_viper mon_squid mon_serpent mon_guardian mon_mimic mon_octopus` baş SAĞDA;
  `mon_jelly` ve `mon_octopus` dik çizilir (çan/manto yukarıda). Kalamar: manto solda, kollar sağda.
  Murena/yılan: kuyruk solda, baş sağda, uzun ince şerit (gövde zincirine gerilir).
  Kalamar çizimi manto SAĞDA çizildi; oyunda aynalanır (kollar +x). Yılan çizimi düz değilse (en/boy < 3) prosedürel kalır.
  `boss_head` (yandan, baş sağda, boyun solda), `boss_seg` (tekrarlanır, dikenler üstte), `boss_tail` (kalın uç solda).
  `ship_0..10` yandan, pruva SAĞDA. `relic_0..10` kare ikon. `item_<şekil>` (drawShape şekilleri). `logo`. `bg_0..10`. `secret_door` (önden, yuvarlak altın kapı, kalp yuvası ortada).
- Varsayılan yerel kutular (x0, genişlik): köpekbalığı -44/83, fener -36/60, engerek -26/42, bekçi -60/98,
  kalamar -52/94, taklitçi -15/30, denizanası 36 geniş (üst -24), ahtapot 56 geniş (taban +5), dalgıç -37/64.
  Murena: tam boy 90 px; yılan: zincir boyu. Gemi: 2.05×`SHIPS[t].len` uzunluk.

## Görsel dil

Koyu, derin, tehlikeli; ama okunaklı. Arayüz pirinç (#d9a441, #f4cf7a) ve lacivert. Canavarlar katla daha karanlık ve vahşi.
Işık kaynakları sıcak (fener, fişek turuncu) ya da biyolüminesan (camgöbeği, mor). Kırmızı = tehlike.
