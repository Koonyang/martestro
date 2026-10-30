// ===== 데이터 & 순수 로직 (node 테스트 가능) =====
var TODAY_FIXED = null; // 테스트용

var BRANDS = {
  emart:{label:'이마트',big:true,color:'#f5b400'},
  topmart:{label:'탑마트',big:true,color:'#0f8a4b'},
  traders:{label:'트레이더스',big:true,color:'#d38b00'},
  homeplus:{label:'홈플러스',big:true,color:'#e3002b'},
  lottemart:{label:'롯데마트',big:true,color:'#e60012'},
  costco:{label:'코스트코',big:true,color:'#005daa'},
  nobrand:{label:'노브랜드',big:false,color:'#ffd200'},
  emart_everyday:{label:'이마트에브리데이',big:false,color:'#f5b400'},
  homeplus_express:{label:'홈플러스익스프레스',big:false,color:'#e3002b'},
  lottesuper:{label:'롯데슈퍼',big:false,color:'#e60012'},
  hanaro:{label:'하나로마트',big:false,color:'#0a8a3a'},
  gsfresh:{label:'GS더프레시',big:false,color:'#00a0e2'},
  kims:{label:'킴스클럽',big:false,color:'#7a3fb0'},
  dept:{label:'백화점 식품관',big:false,color:'#5b5b9a'},
  convenience:{label:'편의점',big:false,color:'#888'},
  local:{label:'동네마트',big:false,color:'#4a7c59'}
};

// 이름(→ 영문명 → 브랜드 태그 → 운영사) 순서로 한 필드씩 판별. '케이마트·하이마트'처럼 '이마트'가 들어간 동네마트를 이마트로 잘못 보지 않게 앞 글자를 확인해요.
function brandOfText(t){
  if (/써브웨이|subway|세탁/.test(t)) return 'skip';
  if (/(이\s*마트|e\s*-?\s*(mart|마트))\s*24|gs\s*25|^cu\b|\bcu\s|씨유|세븐\s*일레븐|7-?eleven|미니스톱|ministop/.test(t)) return 'convenience';
  if (/서원\s*유통|^\(?주?\)?\s*탑\s*마트|^top\s*mart/.test(t)) return 'topmart';
  if (/코스트코|costco/.test(t)) return 'costco';
  if (/트레이더스|traders/.test(t)) return 'traders';
  if (/노브랜드|no\s*brand/.test(t)) return 'nobrand';
  if (/(이\s*마트|e\s*-?\s*(mart|마트))\s*(에브리|everyday|슈퍼)/.test(t)) return 'emart_everyday';
  if (/(^|[^가-힣])이\s*마트|(^|[^a-z가-힣])e\s*-?\s*(mart|마트)/.test(t)) return 'emart';
  if (/홈플러스\s*(익스|슈퍼)|home\s*plus\s*(express|365)|365\s*홈플러스/.test(t)) return 'homeplus_express';
  if (/홈플러스|home\s*plus/.test(t)) return 'homeplus';
  if (/롯데\s*마트|lotte\s*mart/.test(t)) return 'lottemart';
  if (/롯데\s*슈퍼|lotte\s*super/.test(t)) return 'lottesuper';
  if (/하나로|농협|nonghyup|hanaro/.test(t)) return 'hanaro';
  if (/gs\s*(the\s*)?fresh|gs\s*더\s*프레시|gs\s*프레시|gs\s*슈퍼|gs\s*수퍼/.test(t)) return 'gsfresh';
  if (/킴스\s*클럽|kim'?s\s*club/.test(t)) return 'kims';
  if (/(롯데|현대|신세계|갤러리아|ak)\s*백화점|식품관|department/.test(t)) return 'dept';
  return null;
}
function detectBrand(tags){
  tags = tags || {};
  var fields = [tags.name, tags['name:ko'], tags['name:en'], tags.brand, tags['brand:ko'], tags['brand:en'], tags.operator];
  for (var i = 0; i < fields.length; i++){
    if (!fields[i]) continue;
    var b = brandOfText(String(fields[i]).toLowerCase().trim());
    if (b === 'skip') return 'local';
    if (b) return b;
  }
  if (tags.shop === 'department_store') return 'dept';
  if (tags.shop === 'convenience') return 'convenience';
  return 'local';
}

function haversineKm(lat1, lon1, lat2, lon2){
  var R = 6371, toR = Math.PI/180;
  var dLat = (lat2-lat1)*toR, dLon = (lon2-lon1)*toR;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 2*R*Math.asin(Math.sqrt(a));
}

var NON_FOOD_RE = /써브웨이|세탁|상가|도매|타운|프라자|플라자|핸드백|네일|샘물|이유식|문구|화장품|약국|의류|가구|전자|철물|공구|꽃|낚시|이불|보일러|건설|자재|plaza|mall/i;
// Overpass 결과 → 마트 목록 (반경 안 전체 + 반경 밖은 대형마트만)
function parseMarts(json, lat, lon, radiusKm){
  var out = [], seen = {};
  (json && json.elements || []).forEach(function(e){
    var tags = e.tags || {};
    var la = e.lat != null ? e.lat : (e.center && e.center.lat);
    var lo = e.lon != null ? e.lon : (e.center && e.center.lon);
    if (la == null || lo == null) return;
    var brand = detectBrand(tags);
    var name = tags.name || tags['name:ko'] || tags.brand || (BRANDS[brand] ? BRANDS[brand].label : '이름 없는 마트');
    if (!tags.name && !tags.brand) return; // 이름 없는 점은 제외
    if (brand === 'local' && NON_FOOD_RE.test(name)) return; // 식료품점이 아닌 잘못 태깅된 곳 제외
    if (tags.shop === 'wholesale' && brand !== 'costco' && brand !== 'traders') return;
    var d = haversineKm(lat, lon, la, lo);
    if (d > radiusKm && !(BRANDS[brand] && BRANDS[brand].big)) return;
    var id = e.type + '/' + e.id;
    var key = name + '|' + la.toFixed(3) + lo.toFixed(3);
    if (seen[key]) return; seen[key] = 1;
    out.push({id:id, name:name, brand:brand, lat:la, lon:lo, distKm:d,
      addr:[tags['addr:city'], tags['addr:district'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')});
  });
  out.sort(function(a,b){ return a.distKm - b.distKm; });
  return out;
}

// ---- 미리 만든 전국 마트 타일 (data/marts/) ----
var MART_TILE = 0.1; // 도(°) 단위 격자, 약 11km × 9km
function martTileKeys(lat, lon, km){
  var dLat = km / 111.32, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180)), out = [];
  for (var i = Math.floor((lat - dLat) / MART_TILE); i <= Math.floor((lat + dLat) / MART_TILE); i++)
    for (var j = Math.floor((lon - dLon) / MART_TILE); j <= Math.floor((lon + dLon) / MART_TILE); j++) out.push(i + '_' + j);
  return out;
}
var OSM_TYPE = {n:'node', w:'way', r:'relation'};
// rows: [[id('n123'), lat, lon, name, brand?], ...] → parseMarts 와 같은 모양의 목록 (대형마트는 7km 안이면 반경 밖이어도 포함)
function martsFromRows(rows, lat, lon, radiusKm, bigKm){
  var out = [], seen = {};
  bigKm = bigKm || 7;
  rows.forEach(function(r){
    var id = (OSM_TYPE[r[0][0]] || 'node') + '/' + r[0].slice(1);
    if (seen[id]) return; seen[id] = 1;
    var brand = r[4] || 'local', big = BRANDS[brand] && BRANDS[brand].big;
    var d = haversineKm(lat, lon, r[1], r[2]);
    if (d > (big ? Math.max(radiusKm, bigKm) : radiusKm)) return;
    out.push({id:id, name:r[3], brand:brand, lat:r[1], lon:r[2], distKm:d, addr:''});
  });
  out.sort(function(a,b){ return a.distKm - b.distKm; });
  return out;
}

// ---- 재료 사전 (이름 → 표준 재료) ----
var ING_SYNONYMS = [
  ['돼지고기', ['삼겹','목심','목살','앞다리','돼지','한돈','포크','대패']],
  ['소고기', ['한우','소불고기','소고기','쇠고기','와규','곰거리','차돌','사태','우둔','홍두깨','등심','찜갈비','LA갈비','la갈비','꽃갈비','양지','국거리','청정우']],
  ['닭고기', ['닭볶음탕','통닭','닭다리','닭가슴','백숙','닭고기','닭안심','닭날개','닭봉','닭']],
  ['오리고기', ['오리']],
  ['순두부', ['순두부']],
  ['두부', ['두부']],
  ['계란', ['계란','달걀','대란','생생란','동물복지란','유정란']],
  ['양파', ['양파']],
  ['감자', ['감자']],
  ['고구마', ['고구마']],
  ['당근', ['당근']],
  ['대파', ['대파','쪽파']],
  ['애호박', ['애호박','호박잎']],
  ['단호박', ['단호박']],
  ['양배추', ['양배추']],
  ['배추', ['알배기','배추','봄동']],
  ['시금치', ['시금치']],
  ['버섯', ['버섯','새송이','표고','느타리','팽이','양송이','참타리']],
  ['파프리카', ['파프리카']],
  ['상추', ['상추','로메인','모둠쌈']],
  ['마늘', ['마늘']],
  ['김치', ['김치','배추김치','포기김치']],
  ['어묵', ['어묵']],
  ['소시지', ['비엔나','소시지']],
  ['햄', ['햄','스팸']],
  ['참치', ['참치']],
  ['고등어', ['고등어']],
  ['오징어', ['오징어']],
  ['새우', ['새우']],
  ['굴', ['생굴','굴']],
  ['갈치', ['갈치']],
  ['전복', ['전복']],
  ['연어', ['연어']],
  ['콩나물', ['콩나물']],
  ['숙주', ['숙주']],
  ['청경채', ['청경채']],
  ['미나리', ['미나리']],
  ['아욱', ['아욱']],
  ['토마토', ['토마토']],
  ['오이', ['오이']],
  ['떡', ['떡볶이떡','가래떡','떡국떡','냉동 떡','떡']],
  ['만두', ['만두']],
  ['라면', ['라면']],
  ['카레', ['카레','짜장']],
  ['된장', ['된장']],
  ['고추장', ['고추장']],
  ['참기름', ['참기름','들기름']],
  ['우동면', ['우동','칼국수','수제비']],
  ['맛살', ['맛살']],
  ['치즈', ['치즈']],
  ['쌀', ['쌀']],
  ['멸치', ['멸치']],
  ['황태', ['황태','북어']],
  ['명란', ['명란']],
  ['유부', ['유부']],
  ['우유', ['우유']],
  ['문어', ['문어']],
  ['낙지', ['낙지']],
  ['꽃게', ['꽃게']],
  ['브로콜리', ['브로콜리','브로컬리']]
];
var ING_LIST = ING_SYNONYMS.map(function(x){ return x[0]; });

function guessIng(name){
  if (!name) return null;
  var n = String(name).replace(/\s+/g,'');
  var best = null, bestLen = 0;
  ING_SYNONYMS.forEach(function(pair){
    pair[1].forEach(function(w){
      var ww = w.replace(/\s+/g,'');
      if (n.indexOf(ww) >= 0 && ww.length > bestLen){ best = pair[0]; bestLen = ww.length; }
    });
  });
  return best;
}

// ---- 전단 할인 데이터 ----
// data/deals.json 에서 읽어요. (빌드 때 index.html 에 한 벌 내장 → 오프라인/실패 시 대비,
// 페이지가 열리면 최신 data/deals.json 을 다시 받아와서 바꿔 끼움)
// 행 형식: [이름, 할인가(null=조건할인), 기준가, 할인조건, 시작, 종료, 재료('-'=없음, null=자동), 출처키, 면]
var SOURCES = {}, RAW_DEALS = {}, DEALS_META = {updated:null, status:{}};
function setDealsData(d){
  if (!d || !d.deals) return false;
  SOURCES = d.sources || {}; RAW_DEALS = d.deals; DEALS_META = {updated:d.updated||null, status:d.status||{}};
  DEALS = buildDeals();
  return true;
}
// 전단 상품명 → 재료 (가공식품·양념·'~와 어울리는' 같은 문구 때문에 생기는 오매칭을 걸러냄. 레시피 재료 매칭엔 안 씀)
var DEAL_NOT_ING = /소스|액젓|참치액|육수|죽(?:\s|$|\()|라면|짜파게티|우동\(|김치우동|즉석우동|피자|볶음밥|비빔밥|부대찌개|밀키트|짜장밥|플래터|돈까스|꿔바로우|시즈닝|과자|스낵|프링글스|기름김|구이김|호떡|곰탕|새우깡|파래김|재래김|만두|교자|딤섬|호빵|냉장고|진미|육포/;
function dealIng(name){
  var n = String(name||'');
  if (DEAL_NOT_ING.test(n)) return null;
  n = n.replace(/[가-힣]+(?:와|과)\s*잘?\s*어울리는/g, ' ').replace(/오리지[날널]/g, '');
  return guessIng(n);
}
function buildDeals(){
  var out = {};
  Object.keys(RAW_DEALS).forEach(function(brand){
    out[brand] = RAW_DEALS[brand].map(function(r, i){
      return {id: brand+'-'+i, brand: brand, name:r[0], price:r[1], orig:r[2], cond:r[3], start:r[4], end:r[5],
        ing: r[6] === '-' ? null : (r[6] || dealIng(r[0])), src: r[7] || brand, page: r[8] || null, real:true,
        check: !!(SOURCES[r[7] || brand] && SOURCES[r[7] || brand].needsCheck)};
    });
  });
  return out;
}
var DEALS = {};
(function(){
  var d = (typeof DEALS_DATA !== 'undefined') ? DEALS_DATA : null;
  if (!d && typeof require !== 'undefined'){ try { d = require('../data/deals.json'); } catch(e){} }
  if (d) setDealsData(d);
})();

function todayStr(){
  if (TODAY_FIXED) return TODAY_FIXED;
  var d = new Date(); var tz = d.getTime() + (9*60 + d.getTimezoneOffset())*60000; // 한국시간
  var k = new Date(tz);
  return k.getFullYear()+'-'+String(k.getMonth()+1).padStart(2,'0')+'-'+String(k.getDate()).padStart(2,'0');
}
function isActive(deal, today){
  today = today || todayStr();
  if (!deal.end) return true;
  return deal.end >= today;
}
function isUpcoming(deal, today){ today = today || todayStr(); return deal.start && deal.start > today; }

// ---- 레시피 (재료: [재료, 주재료여부, 분량]) ----
var R = function(name, emoji, mins, ings, steps){ return {name:name, emoji:emoji, mins:mins, ings:ings.map(function(x){ return {k:x[0], main:!!x[1], amt:x[2]||''}; }), steps:steps}; };
var RECIPES = [
  R('김치찌개','🍲',25,[['김치',1,'1/4포기'],['돼지고기',1,'200g'],['두부',1,'1/2모'],['대파',0,'1대'],['양파',0,'1/2개']],['돼지고기를 냄비에 볶다가 김치를 넣고 함께 볶아요.','물 500ml를 붓고 끓여요.','두부·양파·대파를 넣고 10분 더 끓여요.']),
  R('된장찌개','🥘',20,[['된장',1,'2큰술'],['두부',1,'1/2모'],['애호박',1,'1/3개'],['감자',0,'1개'],['양파',0,'1/2개'],['버섯',0,'한 줌'],['대파',0,'1/2대']],['멸치육수나 물 500ml에 된장을 풀어요.','감자→양파·애호박·버섯 순서로 넣어 끓여요.','두부와 대파를 넣고 한소끔 끓여요.']),
  R('제육볶음','🌶️',25,[['돼지고기',1,'300g'],['고추장',1,'2큰술'],['양파',1,'1개'],['대파',0,'1대'],['당근',0,'1/3개'],['마늘',0,'1큰술']],['고추장·간장·설탕·고춧가루·마늘로 양념을 만들어요.','돼지고기를 양념에 10분 재워요.','센 불에 고기를 볶다가 양파·당근·대파를 넣어 마저 볶아요.']),
  R('계란말이','🍳',10,[['계란',1,'4개'],['대파',0,'약간'],['당근',0,'약간'],['맛살',0,'2줄']],['계란을 풀고 다진 채소, 소금을 섞어요.','약불 팬에 얇게 부어 익으면 돌돌 말아요.','남은 계란물을 더 부어 반복해 말아요.']),
  R('감자조림','🥔',20,[['감자',1,'3개'],['양파',0,'1/2개'],['당근',0,'1/3개']],['감자를 깍둑썰어 물에 헹궈요.','간장 3·설탕 1·물 1컵을 넣고 졸여요.','양파·당근을 넣고 국물이 자작해지면 물엿, 깨를 뿌려요.']),
  R('소불고기','🥩',25,[['소고기',1,'300g'],['양파',1,'1/2개'],['대파',0,'1/2대'],['버섯',0,'한 줌'],['당근',0,'약간']],['간장·설탕·마늘·참기름으로 양념해 고기를 재워요.','팬에 고기를 볶다가 채소를 넣어요.','국물이 졸아들면 완성! (양념 불고기를 샀다면 바로 볶기)']),
  R('닭볶음탕','🍗',40,[['닭고기',1,'1마리(1kg)'],['감자',1,'2개'],['당근',0,'1/2개'],['양파',0,'1개'],['대파',0,'1대'],['고추장',0,'1큰술']],['닭을 한 번 데쳐 헹궈요.','간장·고추장·고춧가루·설탕·마늘 양념과 물 2컵을 넣고 끓여요.','감자·당근을 넣고 20분, 양파·대파 넣고 5분 더 졸여요.']),
  R('순두부찌개','🔥',20,[['순두부',1,'1봉'],['계란',1,'1개'],['돼지고기',0,'50g'],['양파',0,'1/4개'],['대파',0,'약간'],['버섯',0,'약간']],['고춧가루·기름에 고기와 양파를 볶아 고추기름을 내요.','물 300ml를 붓고 순두부를 큼직하게 넣어요.','끓으면 계란을 깨 넣고 대파로 마무리해요.']),
  R('시금치나물','🥬',10,[['시금치',1,'1단'],['마늘',0,'1작은술'],['참기름',0,'1큰술']],['시금치를 소금물에 30초 데쳐 찬물에 헹궈요.','물기를 꼭 짜요.','국간장·마늘·참기름·깨로 조물조물 무쳐요.']),
  R('콩나물국','🥣',15,[['콩나물',1,'1봉'],['대파',0,'1/2대'],['마늘',0,'1작은술']],['물 1L에 콩나물을 넣고 뚜껑 덮어 끓여요.','국간장·소금으로 간해요.','마늘·대파를 넣고 한소끔 더 끓여요.']),
  R('어묵볶음','🍢',10,[['어묵',1,'4장'],['양파',0,'1/2개'],['당근',0,'약간']],['어묵을 한입 크기로 썰어요.','기름에 양파·당근과 함께 볶아요.','간장·물엿 약간으로 간하고 깨를 뿌려요.']),
  R('김치볶음밥','🍚',15,[['김치',1,'1컵'],['쌀',0,'밥 1공기'],['햄',0,'50g'],['계란',0,'1개'],['대파',0,'약간']],['대파로 파기름을 내고 김치·햄을 볶아요.','밥을 넣어 고루 볶아요.','계란 프라이를 올려 완성해요.']),
  R('소고기미역국','🍜',30,[['소고기',1,'150g'],['미역',1,'한 줌(불린 것)'],['참기름',0,'1큰술'],['마늘',0,'1작은술']],['미역을 물에 불려 먹기 좋게 잘라요.','참기름에 소고기와 미역을 볶아요.','물 1L를 붓고 국간장으로 간해 20분 끓여요.']),
  R('삼겹살 상추쌈','🥓',15,[['돼지고기',1,'400g'],['상추',1,'1봉'],['마늘',0,'몇 쪽'],['된장',0,'쌈장 2큰술'],['버섯',0,'약간']],['삼겹살을 노릇하게 구워요.','마늘·버섯도 함께 구워요.','상추에 고기·쌈장·마늘을 올려 싸 먹어요.']),
  R('고등어조림','🐟',30,[['고등어',1,'1마리'],['감자',1,'1개'],['양파',0,'1/2개'],['대파',0,'1/2대']],['냄비에 감자를 깔고 고등어를 올려요.','간장·고춧가루·마늘·설탕 양념과 물 1컵을 부어요.','중불에 20분 졸이고 양파·대파를 넣어 마무리해요.']),
  R('고등어구이','🐠',15,[['고등어',1,'1마리']],['고등어 물기를 키친타월로 닦아요.','기름 두른 팬에 껍질부터 중불로 구워요.','뒤집어서 속까지 익혀요.']),
  R('오징어볶음','🦑',20,[['오징어',1,'1마리'],['양파',1,'1/2개'],['양배추',0,'2장'],['당근',0,'약간'],['대파',0,'1/2대'],['고추장',0,'1큰술']],['오징어를 손질해 칼집 내고 썰어요.','고추장·고춧가루·간장·설탕·마늘로 양념을 만들어요.','채소를 볶다가 오징어·양념을 넣고 센 불에 빠르게 볶아요.']),
  R('새우볶음밥','🍤',15,[['새우',1,'100g'],['계란',1,'2개'],['쌀',0,'밥 1공기'],['대파',0,'약간'],['당근',0,'약간']],['파기름에 새우를 볶아요.','계란을 스크램블하고 밥·당근을 넣어 볶아요.','소금·굴소스로 간해요.']),
  R('굴전','🦪',15,[['굴',1,'200g'],['계란',1,'2개']],['굴을 소금물에 살살 씻어 물기를 빼요.','밀가루를 묻히고 계란물을 입혀요.','기름 두른 팬에 앞뒤로 부쳐요.']),
  R('갈치조림','🐟',30,[['갈치',1,'2토막'],['감자',1,'1개'],['양파',0,'1/2개'],['대파',0,'1/2대']],['감자를 도톰하게 썰어 냄비에 깔아요.','갈치를 올리고 간장·고춧가루·마늘 양념과 물을 부어요.','20분 졸인 뒤 양파·대파를 넣어요.']),
  R('연어덮밥','🍣',10,[['연어',1,'150g'],['쌀',0,'밥 1공기'],['양파',0,'1/4개']],['양파를 얇게 채 썰어 찬물에 담가 매운맛을 빼요.','밥 위에 양파와 연어를 올려요.','간장·와사비 또는 간장·설탕·물 소스를 뿌려요.']),
  R('훈제오리볶음','🦆',15,[['오리고기',1,'400g'],['양파',1,'1개'],['양배추',0,'2장'],['파프리카',0,'1개'],['버섯',0,'한 줌']],['훈제오리를 팬에 볶아 기름을 내요.','양파·양배추·파프리카·버섯을 넣고 볶아요.','후추 약간으로 마무리해요.']),
  R('버섯볶음','🍄',10,[['버섯',1,'200g'],['양파',0,'1/2개'],['파프리카',0,'1/2개']],['버섯을 먹기 좋게 찢거나 썰어요.','기름에 양파와 함께 센 불로 볶아요.','소금·후추 또는 굴소스로 간해요.']),
  R('잡채','🍝',40,[['당면',1,'150g'],['시금치',1,'1/2단'],['당근',1,'1/3개'],['버섯',0,'한 줌'],['양파',0,'1/2개'],['돼지고기',0,'100g']],['당면을 삶아 간장·설탕·참기름에 버무려요.','채소와 고기를 각각 볶아요.','모두 합쳐 간장·참기름·깨로 무쳐요.']),
  R('부대찌개','🍲',25,[['햄',1,'1/2캔'],['소시지',1,'5개'],['김치',1,'1/2컵'],['라면',0,'1개'],['두부',0,'1/3모'],['대파',0,'1대']],['냄비에 햄·소시지·김치·두부를 둘러 담아요.','고춧가루·간장·마늘 양념과 육수를 부어 끓여요.','라면 사리와 대파를 넣고 면이 익으면 완성.']),
  R('떡볶이','🌶️',20,[['떡',1,'300g'],['어묵',1,'2장'],['고추장',1,'2큰술'],['대파',0,'1대'],['양배추',0,'2장'],['계란',0,'삶은 것 2개']],['물 400ml에 고추장·고춧가루·설탕·간장을 풀어요.','떡과 어묵을 넣고 끓여요.','양배추·대파·삶은 계란을 넣고 졸여요.']),
  R('카레라이스','🍛',30,[['카레',1,'1봉(100g)'],['감자',1,'2개'],['당근',1,'1/2개'],['양파',1,'1개'],['돼지고기',0,'150g']],['고기와 채소를 깍둑썰어 볶아요.','물 600ml를 붓고 15분 끓여요.','불을 줄이고 카레가루를 풀어 걸쭉하게 끓여요.']),
  R('토마토달걀볶음','🍅',10,[['토마토',1,'2개'],['계란',1,'3개'],['대파',0,'약간']],['계란을 스크램블해 덜어 둬요.','파기름에 토마토를 볶아 즙을 내요.','계란을 다시 넣고 소금·설탕 약간으로 간해요.']),
  R('단호박찜','🎃',20,[['단호박',1,'1통']],['단호박을 깨끗이 씻어 반 갈라 씨를 빼요.','전자레인지 7~8분 또는 찜기에 15분 쪄요.','꿀이나 치즈를 올려도 맛있어요.']),
  R('고구마맛탕','🍠',25,[['고구마',1,'2개']],['고구마를 한입 크기로 썰어 물기를 빼요.','기름에 노릇하게 튀기듯 구워요.','설탕·물엿 시럽에 버무리고 깨를 뿌려요.']),
  R('두부조림','🧈',20,[['두부',1,'1모'],['대파',0,'1/2대'],['양파',0,'1/4개']],['두부를 도톰하게 썰어 노릇하게 부쳐요.','간장·고춧가루·설탕·마늘·물로 양념을 만들어요.','양념을 붓고 양파·대파와 함께 졸여요.']),
  R('참치김치찌개','🥫',20,[['참치',1,'1캔'],['김치',1,'1/4포기'],['두부',0,'1/2모'],['양파',0,'1/2개'],['대파',0,'1/2대']],['김치를 기름에 볶아요.','물 500ml를 붓고 끓여요.','참치·두부·양파·대파를 넣고 10분 더 끓여요.']),
  R('청경채볶음','🥬',10,[['청경채',1,'300g'],['마늘',0,'1큰술'],['버섯',0,'한 줌']],['청경채를 반 갈라 씻어요.','마늘을 기름에 볶아 향을 내요.','청경채·버섯을 넣고 굴소스로 빠르게 볶아요.']),
  R('전복버터구이','🐚',15,[['전복',1,'4마리'],['마늘',0,'3쪽']],['전복을 솔로 문질러 씻고 칼집을 내요.','버터에 마늘을 볶다가 전복을 넣어요.','간장 약간을 둘러 앞뒤로 구워요.']),
  R('아욱된장국','🍵',20,[['아욱',1,'1봉'],['된장',1,'1.5큰술'],['새우',0,'약간'],['대파',0,'약간']],['아욱을 바락바락 주물러 풋내를 빼요.','멸치육수에 된장을 풀고 아욱·새우를 넣어요.','10분 끓이고 대파를 넣어요.']),
  R('미나리전','🥞',20,[['미나리',1,'1봉'],['오징어',0,'1/2마리'],['계란',0,'1개']],['미나리를 5cm 길이로 썰어요.','부침가루·물·계란으로 반죽해 미나리·오징어를 섞어요.','팬에 얇게 펴서 바삭하게 부쳐요.']),
  R('떡만둣국','🥟',20,[['만두',1,'6개'],['떡',1,'1컵'],['계란',0,'1개'],['대파',0,'약간']],['육수(또는 사골)를 끓여요.','떡과 만두를 넣고 떠오를 때까지 끓여요.','계란을 풀어 넣고 대파로 마무리해요.']),
  R('배추된장국','🥬',20,[['배추',1,'1/4통'],['된장',1,'1.5큰술'],['멸치',0,'육수용 한 줌'],['대파',0,'약간']],['멸치로 육수를 내요.','된장을 풀고 배추를 넣어 끓여요.','대파를 넣고 국간장으로 간해요.']),
  R('명란계란말이','🥚',10,[['명란',1,'1줄'],['계란',1,'4개'],['대파',0,'약간']],['계란을 풀고 대파를 넣어요.','계란물을 얇게 붓고 명란을 올려 말아요.','남은 계란물로 반복해 도톰하게 말아요.']),
  R('황태국','🐟',20,[['황태',1,'한 줌'],['계란',0,'1개'],['대파',0,'약간'],['참기름',0,'1큰술']],['황태채를 물에 살짝 적셔 참기름에 볶아요.','물 800ml를 붓고 끓여요.','계란을 풀어 넣고 대파·국간장으로 마무리해요.']),
  R('감자채볶음','🥔',15,[['감자',1,'2개'],['양파',0,'1/2개'],['당근',0,'약간']],['감자를 채 썰어 찬물에 전분을 빼요.','기름에 감자를 볶다가 양파·당근을 넣어요.','소금·후추로 간해요.']),
  R('파프리카 소고기볶음','🫑',15,[['소고기',1,'200g'],['파프리카',1,'2개'],['양파',0,'1/2개']],['소고기를 간장·설탕·마늘에 재워요.','고기를 볶다가 채 썬 파프리카·양파를 넣어요.','센 불에 빠르게 볶아 아삭하게 완성해요.']),
  R('우동','🍜',10,[['우동면',1,'2인분'],['어묵',0,'1장'],['대파',0,'약간'],['계란',0,'1개']],['물에 동봉 스프(또는 쯔유)를 풀고 끓여요.','우동면·어묵을 넣고 2~3분 끓여요.','대파·계란을 올려요.'])
];

// 손으로 쓴 레시피의 분류
var HAND_CAT = {'김치찌개':'국&찌개','된장찌개':'국&찌개','순두부찌개':'국&찌개','콩나물국':'국&찌개','소고기미역국':'국&찌개','부대찌개':'국&찌개','참치김치찌개':'국&찌개','아욱된장국':'국&찌개','떡만둣국':'국&찌개','배추된장국':'국&찌개','황태국':'국&찌개','닭볶음탕':'국&찌개',
  '김치볶음밥':'밥','새우볶음밥':'밥','연어덮밥':'밥','카레라이스':'밥','떡볶이':'일품','우동':'일품','삼겹살 상추쌈':'일품','잡채':'일품','고구마맛탕':'후식','단호박찜':'후식'};
RECIPES.forEach(function(r){ r.cat = HAND_CAT[r.name] || '반찬'; r.src = 'hand'; });

// ---- 공공데이터 레시피 (식품안전나라 COOKRCP01) → 레시피 객체 ----
var PUB_EMOJI = {'반찬':'🥢','국&찌개':'🍲','일품':'🍽️','밥':'🍚','후식':'🍮','기타':'🥄'};
var IMG_BASE = 'https://www.foodsafetykorea.go.kr/';
function expandPub(raw, cats){
  return (raw||[]).map(function(a){
    var cat = cats[a[2]] || '기타';
    var ings = a[5] ? a[5].split(',').map(function(t){ var main = /\*$/.test(t); return {k:t.replace('*',''), main:main, amt:''}; }) : [];
    var img = a[4] ? (/^https?:/.test(a[4]) ? a[4].replace(/^http:/,'https:') : IMG_BASE + a[4]) : '';
    return {name:a[1], emoji:PUB_EMOJI[cat]||'🥄', mins:null, cat:cat, kcal:a[3]||null, img:img, ings:ings, parts:a[6], steps:a[7].split('\n'), src:'pub', seq:a[0]};
  });
}
var _pub = (typeof PUB_RAW !== 'undefined') ? {raw:PUB_RAW, cats:PUB_CATS, meta:PUB_META} : null;
if (!_pub && typeof require !== 'undefined'){ try { var _m = require('./pub_data.js'); _pub = {raw:_m.PUB_RAW, cats:_m.PUB_CATS, meta:_m.PUB_META}; } catch(e){} }
var PUB_INFO = _pub ? _pub.meta : null;
var PUB_RECIPES = _pub ? expandPub(_pub.raw, _pub.cats) : [];
var ALL_RECIPES = (function(){
  var seen = {}, out = [];
  RECIPES.concat(PUB_RECIPES).forEach(function(r){ var k = r.name.replace(/\s/g,''); if (seen[k]) return; seen[k] = 1; out.push(r); });
  out.forEach(function(r){ r.q = (r.name + ' ' + r.cat + ' ' + r.ings.map(function(i){ return i.k; }).join(' ') + ' ' + (r.parts||'')).replace(/\s+/g,'').toLowerCase(); });
  return out;
})();
var RECIPE_CATS = ['반찬','국&찌개','일품','밥','후식','기타'];

// 검색·분류 필터 (q: 검색어, cat: ''=전체)
function filterRecipes(list, q, cat, getR){
  getR = getR || function(x){ return x; };
  var words = String(q||'').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(function(x){
    var r = getR(x);
    if (cat && r.cat !== cat) return false;
    for (var i=0;i<words.length;i++) if (r.q.indexOf(words[i]) < 0) return false;
    return true;
  });
}

var PANTRY_NOTE = '간장·소금·설탕·고춧가루·식용유·후추·깨 같은 기본양념은 집에 있다고 가정했어요.';

// 선택된 마트들의 할인 목록 → 재료별 최적 딜
function buildDealIndex(deals, today){
  var idx = {};
  deals.forEach(function(d){
    if (!d.ing || !isActive(d, today)) return;
    (idx[d.ing] = idx[d.ing] || []).push(d);
  });
  Object.keys(idx).forEach(function(k){
    idx[k].sort(function(a,b){
      var ua = isUpcoming(a, today) ? 1 : 0, ub = isUpcoming(b, today) ? 1 : 0;
      if (ua !== ub) return ua - ub; // 오늘 적용되는 할인 우선
      // 할인율 우선(대용량 묶음이 '절약액'만 커서 1등 되는 것 방지), 같으면 절약액
      var ra = (a.price!=null && a.orig) ? Math.round((a.orig-a.price)/a.orig*100) : -1;
      var rb = (b.price!=null && b.orig) ? Math.round((b.orig-b.price)/b.orig*100) : -1;
      if (rb !== ra) return rb - ra;
      var sa = (a.price!=null && a.orig!=null) ? a.orig-a.price : -1;
      var sb = (b.price!=null && b.orig!=null) ? b.orig-b.price : -1;
      if (sb !== sa) return sb - sa;
      var pa = a.price==null ? 1e12 : a.price, pb = b.price==null ? 1e12 : b.price;
      return pa - pb;
    });
  });
  return idx;
}

function scoreRecipe(recipe, idx){
  var mainTotal = 0, mainHit = 0, anyHit = 0, savings = 0;
  var matched = [], missing = [];
  recipe.ings.forEach(function(ing){
    if (ing.main) mainTotal++;
    var list = idx[ing.k];
    if (list && list.length){
      var best = list[0];
      if (ing.main) mainHit++;
      anyHit++;
      if (ing.main && best.price!=null && best.orig!=null && best.orig > best.price) savings += best.orig - best.price;
      matched.push({ing:ing, deal:best, others:list.length-1});
    } else {
      missing.push({ing:ing});
    }
  });
  var ratio = mainTotal ? mainHit/mainTotal : 0;
  // 주재료 적중(최대 3개) + 비율 + 부재료 적중 + 절약액 + 직접 다듬은 기본 레시피 가산점
  var score = ratio*20 + Math.min(mainHit,3)*4 + Math.min(anyHit-mainHit,3)*1 + Math.min(savings/1000, 10)*0.4 + (recipe.src === 'pub' ? 0 : 6);
  return {recipe:recipe, mainTotal:mainTotal, mainHit:mainHit, anyHit:anyHit, ratio:ratio, savings:savings, matched:matched, missing:missing, score:score};
}

function rankRecipes(recipes, deals, today){
  var idx = buildDealIndex(deals, today);
  return recipes.map(function(r){ return scoreRecipe(r, idx); })
    .filter(function(s){ return s.mainHit > 0; })
    .sort(function(a,b){ return b.score - a.score || b.savings - a.savings; });
}

function formatWon(n){ return n==null ? '' : Number(n).toLocaleString('ko-KR') + '원'; }

if (typeof module !== 'undefined') module.exports = {isUpcoming:isUpcoming, NON_FOOD_RE:NON_FOOD_RE, detectBrand:detectBrand, haversineKm:haversineKm, parseMarts:parseMarts, MART_TILE:MART_TILE, martTileKeys:martTileKeys, martsFromRows:martsFromRows, guessIng:guessIng, dealIng:dealIng, get DEALS(){ return DEALS; }, get RAW_DEALS(){ return RAW_DEALS; }, setDealsData:setDealsData, get DEALS_META(){ return DEALS_META; }, RECIPES:RECIPES, ALL_RECIPES:ALL_RECIPES, PUB_RECIPES:PUB_RECIPES, PUB_INFO:PUB_INFO, filterRecipes:filterRecipes, RECIPE_CATS:RECIPE_CATS, buildDealIndex:buildDealIndex, scoreRecipe:scoreRecipe, rankRecipes:rankRecipes, isActive:isActive, setToday:function(t){TODAY_FIXED=t;}, ING_LIST:ING_LIST, BRANDS:BRANDS, get SOURCES(){ return SOURCES; }};
