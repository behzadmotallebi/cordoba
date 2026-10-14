/* Dalgıç: oyun verisi. Davranış yok, sadece tablolar. */
(function () {
'use strict';
const DG = window.DG = window.DG || {};
const I = (n, s, c) => ({n, s, c});

DG.C = {
  WORLD_W: 1400,
  BOAT_X: 700,
  NL: 11,            // kat sayısı
  SHAFT_HALF: 260,   // kat raflarındaki asansör açıklığının yarı genişliği (px)
  LEDGE_HALF: 26,    // kat rafının yarı kalınlığı (px)
  STATION_R: 150,    // istasyon etki yarıçapı (px)
  SAFE_R: 380,       // istasyonun canavarsız güvenli yarıçapı (px)
};

const LAYERS = [
  {name:'Sığ Koy', top:0, bot:150, wall:46, rock:[52,46,38], water:[70,190,220], waterBot:[14,80,125], decor:'sand',
    mons:[['jelly',0.02,1,2.3],['jelly',0.02,0.35,2.8],['eel',0.03,1,1.5],['eel',0.03,0.35,1.8]],   // ilk ekipmanın indiği sığ kısım daha kalabalık
    obst:[['urchin',0.04,1,0.9],['curtain',0.12,0.95,0.14]],
    items:[[I('Deniz kabuğu','shell','#f2c9a8'),I('Deniz yıldızı','star','#ff8a5c')],[I('Bakır sikke','coin','#d98a4b'),I('Kırık amfora','amphora','#c9774a')],[I('Bronz külçe','ingot','#c98b4a'),I('İnci','pearl','#f4f1ff')]],
    relic:{n:'Derinlerin Kalbi', s:'heart', c:'#5ad8ff', lore:'Balıkçıların masallarındaki mavi taş. İçinde parlayan çizgiler bir harita gibi: aşağıyı, mercan mağaralarını gösteriyor.', bonus:{k:'value', v:0.1}}},
  {name:'Mercan Mağaraları', top:150, bot:300, wall:120, rock:[70,62,58], waterBot:[8,52,92], decor:'cave',
    mons:[['jelly',0,1,1.8],['eel',0,1,1.8],['shark',0,1,0.5]],
    obst:[['urchin',0,1,0.7],['curtain',0.35,0.95,0.09]],
    items:[[I('Doğal sünger','coral','#e8c45a'),I('Mor deniz yıldızı','star','#b07ae0')],[I('Bizans sikkesi','coin','#ffcf3a'),I('Kandil','amphora','#b98a5a')],[I('Bronz heykel başı','statue','#9fb38e'),I('Mermer kabartma','tablet','#e6e1d3')]],
    relic:{n:'Bronz Dişli Düzenek', s:'gear', c:'#d9a94f', lore:'İki bin yıllık bir hesap makinesi. Dişlileri hâlâ dönüyor ve hep aynı yeri gösteriyor: daha aşağıda yatan batıkları.', bonus:{k:'air', v:0.1}}},
  {name:'Batık Gemiler Koyu', top:300, bot:500, wall:60, rock:[30,40,38], waterBot:[6,36,62], decor:'oldwreck',
    mons:[['eel',0,1,1.4],['shark',0,1,0.9],['mimic',0.3,1,0.5],['angler',0.5,1,0.6]],
    obst:[['mine',0.08,1,0.8],['urchin',0,0.6,0.4]],
    items:[[I('Ceneviz düğmesi','coin','#c0c8d0'),I('Kehribar','gem','#ffaa33')],[I('Gümüş kadeh','amphora','#d7e2ea'),I('Ceneviz dukası','coin','#ffd24a')],[I('Mühürlü sandık','chest','#8a5a2b'),I('Altın kolye','pearl','#ffcf3a')]],
    relic:{n:'Bin Yıllık Kaptan Defteri', s:'book', c:'#c9a46a', lore:'Tuzlu su onu bin yıl çürütmeden saklamış. Son sayfada tek bir cümle var: "Mühür, kızıl kanyonun dibinde."', bonus:{k:'bag', v:1}}},
  {name:'Kızıl Kanyon', top:500, bot:750, wall:200, rock:[96,52,40], waterBot:[26,20,38], decor:'canyon',
    mons:[['eel',0,1,1.6],['viper',0.2,1,0.5],['shark',0,1,0.8],['octopus',0.2,1,0.6]],
    obst:[['urchin',0,1,0.6]],
    items:[[I('Kırmızı mercan','coral','#ff5a6e'),I('Kauri kabuğu','shell','#f5e6c8')],[I('Firavun boncuğu','gem','#3fc7e0'),I('Bakır ayna','coin','#e09a5b')],[I('Altın bok böceği','statue','#ffcf3a'),I('Lapis tablet','tablet','#3d5fc0')]],
    relic:{n:'Firavun Mührü', s:'tablet', c:'#ffd24a', lore:'Mührün üstüne aşağıya bakan bir göz kazınmış. Gözün altında yazı: "Işığın bittiği yerde pusula yolunu şaşırır."', bonus:{k:'value', v:0.1}}},
  {name:'Alacakaranlık Uçurumu', top:750, bot:1000, wall:70, rock:[40,48,58], waterBot:[6,16,34], decor:'plane',
    mons:[['viper',0,1,0.6],['shark',0,1,0.9],['angler',0.2,1,0.9],['squid',0.5,1,0.4],['mimic',0,1,0.3]],
    obst:[['mine',0,1,0.35]],
    items:[[I('Fosforlu kabuk','shell','#7fffd0'),I('Pas tutmuş künye','tablet','#a08a70')],[I('İspanyol dublonu','coin','#ffcf3a'),I('Mesaj şişesi','bottle','#7fd8a0')],[I('Korsan sandığı','chest','#6b3f1f'),I('Zümrüt kolye','gem','#3fe0a0')]],
    relic:{n:'Kayıp Filo Pusulası', s:'compass', c:'#e0b060', lore:'İğnesi kuzeyi değil, aşağıyı gösteriyor. Gece bölgesinde bir noktada çıldırıyor.', bonus:{k:'dmg', v:0.1}}},
  {name:'Gece Bölgesi', top:1000, bot:1500, wall:80, rock:[34,40,48], waterBot:[3,9,22], decor:'steelwreck',
    mons:[['viper',0,1,0.7],['shark',0,1,1.0],['angler',0,1,0.9],['squid',0.3,1,0.6],['mimic',0,1,0.4]],
    obst:[['mine',0,1,0.45]],
    items:[[I('Balina dişi','ingot','#efe8d8'),I('Pirinç lomboz','compass','#e0b060')],[I('Viking gümüşü','coin','#d7e2ea'),I('Gemi çanı','amphora','#d0a050')],[I('Viking sandığı','chest','#5b3a22'),I('Viking bileziği','crown','#ffd24a')]],
    relic:{n:'Kraken Gözü', s:'eye', c:'#ffcc33', lore:'Avuç kadar bir göz taşı. Karanlıkta ona bakınca sana geri bakıyor ve kristallerle dolu mağaraları gösteriyor.', bonus:{k:'light', v:0.15}}},
  {name:'Kristal Mağaralar', top:1500, bot:2200, wall:110, rock:[110,140,170], waterBot:[8,22,42], decor:'crystal',
    mons:[['jelly',0,1,1.2],['viper',0,1,0.8],['squid',0,1,0.7],['octopus',0,1,0.5],['serpent',0.5,1,0.3]],
    obst:[['curtain',0.2,0.95,0.07]],
    items:[[I('Kuvars kristali','crystal','#bfe9ff'),I('Kutup yıldızı','star','#ff6f9a')],[I('Kaşif madalyası','coin','#d7e2ea'),I('Su geçirmez günlük','book','#8a7a6a')],[I('Mavi elmas','diamond','#7fd0ff'),I('Platin külçe','ingot','#e4e8ec')]],
    relic:{n:'Sonsuz Kristal', s:'diamond', c:'#bff4ff', lore:'Hiç sönmeyen bir kristal. İçinde ateş saçan bacaların haritası donmuş.', bonus:{k:'speed', v:0.1}}},
  {name:'Volkanik Bacalar', top:2200, bot:3000, wall:90, rock:[40,26,24], waterBot:[26,8,6], decor:'vents',
    mons:[['viper',0,1,1.0],['angler',0,1,1.0],['squid',0,1,0.7],['serpent',0.3,1,0.45]],
    obst:[['vent',0.05,0.97,0.4]],
    items:[[I('Kükürt kristali','crystal','#f0e050'),I('Lav incisi','pearl','#ff7040')],[I('Obsidyen bıçak','gem','#2c2c38'),I('Manganez yumrusu','pearl','#5a4a44')],[I('Altın damarı','ingot','#ffcf3a'),I('Ateş opali','diamond','#ff8040')]],
    relic:{n:'Poseidon\'un Mızrak Ucu', s:'spear', c:'#ffd24a', lore:'Üç uçlu, sıcak, titreşen bir metal. Kırık ucunda batık bir yolcu gemisinin adı kazılı.', bonus:{k:'wdmg', v:0.5}}},
  {name:'Kayıp Gemiler Mezarlığı', top:3000, bot:3800, wall:70, rock:[30,34,40], waterBot:[3,6,12], decor:'liner',
    mons:[['jelly',0,1,1.0],['shark',0,1,1.1],['squid',0,1,0.8],['serpent',0.3,1,0.55],['mimic',0,1,0.5]],
    obst:[['mine',0,1,0.35],['curtain',0.3,0.95,0.05]],
    items:[[I('Porselen fincan','amphora','#f4f1ea'),I('Yolcu bileti','tablet','#e6d7b8')],[I('Altın cep saati','watch','#ffcf3a'),I('Gümüş servis','coin','#d7e2ea')],[I('Mücevher kutusu','chest','#8a1f2b'),I('Elmas kolye','diamond','#e8f6ff')]],
    relic:{n:'Kayıp Geminin Cep Saati', s:'watch', c:'#ffd86a', lore:'Saat 02.20\'de durmuş. Kapağının içine kazınmış: "Kalbin yolu en derin çukurdan geçer."', bonus:{k:'air', v:0.1}}},
  {name:'Kalipso Çukuru', top:3800, bot:5267, wall:300, rock:[22,24,30], waterBot:[1,2,6], decor:'trench',
    mons:[['viper',0,1,1.0],['angler',0,1,1.0],['squid',0,1,0.9],['serpent',0.2,1,0.65],['octopus',0,1,0.5]],
    obst:[['vent',0.3,0.97,0.15]],
    items:[[I('Cam süngeri','coral','#d8f0ff'),I('Işıklı kabuk','shell','#60ffd0')],[I('Meteor parçası','ingot','#4a4a55'),I('Yıldız tozu','crystal','#b08aff')],[I('Siyah elmas','diamond','#55556a'),I('Garip küre','pearl','#c28aff')]],
    relic:{n:'Kalipso İncisi', s:'pearl', c:'#f2f6ff', lore:'Akdeniz\'in en derin noktasından. İncinin içinde bir kapı çizili; çukurun dibindeki çatlaktan mavi bir ışık sızıyor. Atlantis gerçek.', bonus:{k:'value', v:0.2}}},
  {name:'Atlantis', top:5267, bot:6500, wall:140, rock:[30,40,70], waterBot:[8,18,60], decor:'atlantis',
    mons:[['viper',0,1,1.0],['squid',0,1,0.8],['serpent',0,1,0.6],['guardian',0.2,1,0.9],['mimic',0,1,0.4]],
    items:[[I('Orikalkum sikke','coin','#ff9a4a'),I('Kristal kiremit','crystal','#7fe8ff')],[I('Atlantis tableti','tablet','#4aa0ff'),I('Tapınak kandili','amphora','#ffd24a')],[I('Hazine sandığı','chest','#3a5a8a'),I('Kraliyet tacı','crown','#ffd24a')]],
    relic:{n:'Atlantis\'in Kalbi', s:'heart', c:'#ffd86a', lore:'Derinlerin Kalbi\'nin büyük kardeşi. Avucunda atıyor. Onu aldığın an, çukurun dibinde bir şey gözlerini açtı.', bonus:{k:'value', v:0.5}}},
];
// Her katın üst rengi bir üstteki katın alt rengidir: deniz kesintisiz görünür.
for (let i = 1; i < LAYERS.length; i++) LAYERS[i].water = LAYERS[i - 1].waterBot;

const SHIPS = [
  {n:'Ahşap kayık',               hull:'#8a5a34', top:'#c8945e', len:52,  cabin:0},
  {n:'Balıkçı teknesi',           hull:'#2f6fa8', top:'#f2ece0', len:66,  cabin:1, mast:1},
  {n:'Gulet',                     hull:'#7a4a28', top:'#e8d2a8', len:84,  cabin:1, sails:1},
  {n:'Dalış teknesi',             hull:'#f2ece0', top:'#0b3d5c', len:90,  cabin:1, flag:1},
  {n:'Araştırma yatı',            hull:'#e9eef2', top:'#22313f', len:100, cabin:2},
  {n:'Kurtarma gemisi',           hull:'#e0662f', top:'#f2ece0', len:112, cabin:2, crane:1},
  {n:'Okyanus araştırma gemisi',  hull:'#1f4f8a', top:'#f2ece0', len:124, cabin:2, crane:1, radar:1},
  {n:'Vinçli destek gemisi',      hull:'#3a434c', top:'#ffcf3a', len:134, cabin:2, crane:2},
  {n:'Buzkıran',                  hull:'#c0392b', top:'#f2ece0', len:140, cabin:3, funnel:1},
  {n:'Derin deniz platformu',     hull:'#ffcf3a', top:'#3a434c', len:150, cabin:2, derrick:1},
  {n:'Amiral gemisi DALGIÇ',      hull:'#14243a', top:'#e8c060', len:164, cabin:3, heli:1, radar:1, crane:1},
];

const GEAR = {
  tank:  ['Alüminyum tüp','Çelik tüp','Çift tüp seti','Nitroks seti','Trimiks seti','Yarı kapalı devre','Kapalı devre rebreather','Askeri rebreather','Heliox sistemi','Yaşam destek modülü','Atlantis solungacı'],
  speed: ['Plastik palet','Uzun palet','Jet palet','Monopalet','Bilek iticisi','Su altı scooter\'ı','Çift motorlu scooter','Turbo scooter','Sırt hidrojeti','Manyetik itici','Yunus kanatları'],
  bag:   ['File çanta','Brandalı çanta','Kaldırma ağı','Numune sepeti','Hidrolik kasa','Vakum toplayıcı','Robot kollu kasa','Basınçlı kargo modülü','Manyetik kasa','Mini kargo denizaltısı','Kristal hazne'],
  light: ['El feneri','Kafa lambası','LED projektör','Çift HID lamba','Sinema ışığı','Sonar gözlük','Gece görüş maskesi','Termal kamera','Lazer tarayıcı','Biyoışık kapsülü','Atlantis kristali'],
  suit:  ['3 mm neopren','7 mm neopren','Kuru giysi','Isıtmalı kuru giysi','Kompozit giysi','Doygunluk giysisi','Basınç zırhı','Titanyum zırh','Atmosferik dalış giysisi','Abis dış iskeleti','Mercan zırh'],
  armor: ['Dalış eldiveni','Kevlar kolluk','Zincir örgü zırh','Elektrikli kalkan yeleği','Sonik kovucu','Karbon kask','Plazma kalkan','Titanyum kabuk','Ses dalgası kalkanı','Kuvvet alanı','Poseidon kalkanı'],
};

// Canavarlar. dmg: o katın referans tüpünün kesri (sn hava). hp: temel can, katla büyür.
// Kat başına: mons = [[tip, f0, f1, 1000 px başına yoğunluk]], obst = engeller (urchin, mine, vent, curtain: denizanası perdesi, 1000 px başına perde).
const MON = {
  jelly:   {n:'Denizanası',        hp:1, dmg:0.07, bounty:2,  r:16},
  eel:     {n:'Murena',            hp:2, dmg:0.10, bounty:4,  r:12},
  shark:   {n:'Köpekbalığı',       hp:3, dmg:0.16, bounty:10, r:24, spd:0.9,  aggro:300, eye:'#f6f0b0'},
  angler:  {n:'Fener balığı',      hp:2, dmg:0.14, bounty:8,  r:20, spd:0.45, aggro:260, eye:'#c8f7ff'},
  viper:   {n:'Engerek balığı',    hp:1, dmg:0.06, bounty:3,  r:9,  spd:1.25, aggro:240, eye:'#99ccff'},
  squid:   {n:'Dev kalamar',       hp:5, dmg:0.18, bounty:20, r:30, spd:0.7,  aggro:340, eye:'#ffd23a'},
  serpent: {n:'Deniz yılanı',      hp:8, dmg:0.25, bounty:40, r:20, spd:1.08, aggro:480, eye:'#ff3b2f'},
  guardian:{n:'Atlantis bekçisi',  hp:6, dmg:0.22, bounty:30, r:24, spd:1.0,  aggro:360, eye:'#5af0ff'},
  mimic:   {n:'Sandık taklitçisi', hp:4, dmg:0.18, bounty:14, r:18, spd:0.9,  aggro:90,  eye:'#ff5a3a', mimic:true},
  octopus: {n:'Taklitçi ahtapot',  hp:4, dmg:0.12, bounty:10, r:22, spd:0.6,  aggro:130, eye:'#ffcf3a', mimic:true},
  // Engelleyici unsurlar (kıpırdamaz). Kestane ve mayın vurulabilir, kat listesine sayılır; baca kırılmaz, sayılmaz.
  urchin:  {n:'Deniz kestanesi',   hp:1.6, dmg:0.06, bounty:1, r:15, obst:true},
  mine:    {n:'Eski deniz mayını', hp:0.6, dmg:0.28, bounty:3, r:14, obst:true, blast:115},
  vent:    {n:'Kızgın baca',       hp:0,   dmg:0.10, bounty:0, r:0,  obst:true, hazard:true},
};

// Silahlar: hepsi sınırsız, sadece dolum süresi var. Seviye 0..3, hasar x(1 + 0.5*seviye).
const WEAPONS = [
  {id:'spear',   n:'Zıpkın tüfeği',          unlock:0, dmg:1,   cd:0.55, kind:'dart',   speed:950,  range:520, d:'Tek atış, hızlı dolum. Her dalgıcın ilk dostu.'},
  {id:'bang',    n:'Patlayıcı mızrak',       unlock:1, dmg:5,   cd:1.3,  kind:'melee',  range:85,  d:'Yakına saplanıp patlar. Büyük hasar, güçlü geri itme.'},
  {id:'net',     n:'Ağ atar',                unlock:2, dmg:0.5, cd:2.8,  kind:'net',    speed:620,  range:420, radius:100, stun:4, d:'Ağ fırlatır, içindeki bütün canavarları 4 saniye tutar.'},
  {id:'aps',     n:'Sualtı tüfeği',          unlock:4, dmg:0.55,cd:0.11, kind:'dart',   speed:1150, range:600, spread:0.08, d:'Su altında ateş eden seri tüfek. Sürülere birebir.'},
  {id:'sonic',   n:'Sonik top',              unlock:5, dmg:1.6, cd:2.4,  kind:'cone',   range:290, angle:0.65, stun:2, d:'Koni şeklinde ses dalgası: iter, sersemletir.'},
  {id:'torpedo', n:'Mini torpido',           unlock:7, dmg:11,  cd:2.2,  kind:'homing', speed:520,  range:900, blast:130, d:'Hedefi takip eder, patlayınca çevreye hasar verir.'},
  {id:'trident', n:'Poseidon\'un üç dişlisi',unlock:9, dmg:7,   cd:0,    kind:'beam',   range:460, d:'Basılı tuttukça yakan bir ışın. Atlantis\'in silahı (saniyede hasar).'},
];

// Yetenekler: bekleme süreli. Seviye 0..2, bekleme x[1, 0.8, 0.6]. dash her zaman takılı.
const SKILLS = [
  {id:'dash',  n:'Hız patlaması',    unlock:0, cd:4,  dur:0.35, d:'Bir anda üç kat hızla fırla. Kaçmak ve saldırıdan sıyrılmak için.'},
  {id:'lift',  n:'Kaldırma balonu',  unlock:1, cd:40, d:'Balon şişer, seni en yakın üst istasyona hızla çeker.'},
  {id:'shock', n:'Elektrik kalkanı', unlock:1, cd:10, dur:1.6, radius:125, d:'Etrafına elektrik verir: canavarları iter ve yakar.'},
  {id:'flare', n:'İşaret fişeği',    unlock:2, cd:14, dur:12, d:'Karanlığı aydınlatır, canavarları kaçırır.'},
  {id:'sonar', n:'Sonar',            unlock:3, cd:12, dur:6,  d:'Hazineleri, eseri ve kılık değiştirmiş canavarları gösterir.'},
  {id:'camo',  n:'Kamuflaj',         unlock:5, cd:22, dur:4.5, d:'Canavarlar seni birkaç saniye göremez.'},
];

const CONS = {
  spareTank:{n:'Yedek tüp',   d:'Havan bitince kendiliğinden açılır, tüpü %60 doldurur.', price:3.0, max:2, pack:1},
  spareBag: {n:'Yedek çanta', d:'Çantan dolunca açılır, o dalış için %50 daha fazla yer.', price:2.0, max:2, pack:1},
};

DG.data = {
  LAYERS, SHIPS, GEAR, MON, WEAPONS, SKILLS, CONS,
  TRACKS: ['tank','speed','bag','light','suit','armor'],
  TRACK_LABEL: {tank:'HAVA', speed:'HIZ', bag:'ÇANTA', light:'IŞIK', suit:'DERİNLİK', armor:'KORUMA'},
  TRACK_W: {tank:1, speed:1, bag:1.1, light:0.8, suit:1.2, armor:0.9},
  STEP_COST: [0, 1, 3, 9],
  KM: {speed:[1,1.2,1.4,1.65], suit:[0.3,0.55,0.8,1.0], bag:[5,7,9,12], light:[100,120,145,170], armor:[0,0.15,0.3,0.45]},
  WPN_COST: [6, 4, 10, 25],    // açma ve seviye 1-3, açıldığı katın fiyat birimiyle
  SKILL_COST: [3, 5, 14],      // açma ve seviye 1-2
  SKILL_CD: [1, 0.8, 0.6],
};
})();
