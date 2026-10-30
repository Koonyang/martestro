// 로직 테스트: 2026-10-30 시점 고정 데이터(fixtures/deals_2026-10-30.json)로 결과가 항상 같게 검사
const L = require('../src/logic.js'); const assert = require('assert');
L.setDealsData(JSON.parse(require('fs').readFileSync(__dirname+'/fixtures/deals_2026-10-30.json')));
L.setToday('2026-10-30');
// 1. 모든 실제 딜이 재료로 매핑되는지
let unm = [];
for (const b in L.DEALS) for (const d of L.DEALS[b]) if (!d.ing) unm.push(b+': '+d.name);
console.log('미매핑 딜:', unm.length ? unm : '없음');
for (const b in L.DEALS) console.log(b, L.DEALS[b].length+'개', L.DEALS[b].map(d=>d.name.slice(0,10)+'→'+d.ing).join(' | '));
// 2. guessIng
assert.equal(L.guessIng('오늘좋은 순두부 (350g)'), '순두부');
assert.equal(L.guessIng('맛있는 두부'), '두부');
assert.equal(L.guessIng('한우 양념 소불고기'), '소고기');
assert.equal(L.guessIng('동원 통그릴 비엔나'), '소시지');
assert.equal(L.guessIng('국내산 삼겹살/목심'), '돼지고기');
assert.equal(L.guessIng('무항생제 황금 닭볶음탕용'), '닭고기');
assert.equal(L.guessIng('대추방울토마토'), '토마토');
// 3. 브랜드 감지
const cases = {'이마트 용산점':'emart','이마트24 시청점':'convenience','이마트 에브리데이':'emart_everyday','노브랜드 시청점':'nobrand','홈플러스 익스프레스 중림점':'homeplus_express','홈플러스 영등포점':'homeplus','롯데마트 서울역점':'lottemart','롯데슈퍼':'lottesuper','코스트코 양재점':'costco','하나로마트':'hanaro','GS더프레시 시청점':'gsfresh','GS FRESH':'gsfresh','이마트 트레이더스 월계점':'traders','우리동네마트':'local','네일마트':'local','롯데백화점본점 식품관':'dept'};
for (const [n,b] of Object.entries(cases)) assert.equal(L.detectBrand({name:n, shop:'supermarket'}), b, n);
assert.equal(L.detectBrand({name:'Costco', shop:'wholesale'}), 'costco');
// 4. 거리
const d = L.haversineKm(37.5663,126.9779,37.5547,126.9707); console.log('시청→서울역 km', d.toFixed(2)); assert(d>1.2&&d<1.6);
// 5. parseMarts with fixture
const fx = {elements:[
 {type:'node',id:1,lat:37.5547,lon:126.9707,tags:{shop:'supermarket',name:'롯데마트',brand:'롯데마트'}},
 {type:'way',id:2,center:{lat:37.60,lon:127.0},tags:{shop:'supermarket',name:'이마트 미아점'}},
 {type:'node',id:3,lat:37.567,lon:126.978,tags:{shop:'supermarket',name:'싱싱마트'}},
 {type:'node',id:4,lat:37.62,lon:127.05,tags:{shop:'supermarket',name:'먼동네마트'}},
 {type:'node',id:5,lat:37.567,lon:126.979,tags:{shop:'supermarket'}},
 {type:'node',id:6,lat:37.567,lon:126.979,tags:{shop:'wholesale',name:'청자수입상가'}}]};
const m = L.parseMarts(fx,37.5663,126.9779,2);
console.log(m.map(x=>x.name+'('+x.brand+','+x.distKm.toFixed(2)+'km)').join(', '));
assert.deepEqual(m.map(x=>x.name), ['싱싱마트','롯데마트','이마트 미아점']);
// 6. real overpass result if present
try { const op = require('./fixtures/op.json'); const mm = L.parseMarts(op,37.5663,126.9779,2); console.log('실제 Overpass 결과(서울시청 2km):', mm.length,'곳; 상위:', mm.slice(0,8).map(x=>x.name+'/'+x.brand+'/'+x.distKm.toFixed(2)).join(', ')); assert(mm.length>10); } catch(e){ console.log('op.json 없음', e.message); }
// 7. 추천
const deals = [...L.DEALS.emart, ...L.DEALS.homeplus];
const ranked = L.rankRecipes(L.RECIPES, deals, '2026-10-30');
console.log('레시피 수', L.RECIPES.length, '추천', ranked.length);
ranked.slice(0,8).forEach(r=>console.log(r.recipe.name, `주재료 ${r.mainHit}/${r.mainTotal}`, '절약', r.savings, '부족:', r.missing.map(x=>x.ing.k).join(',')));
// 만료 처리: 11/5 이후엔 다 사라짐
assert.equal(L.rankRecipes(L.RECIPES, deals, '2026-11-05').length, 0);
// 홈플러스 보리돼지(10/30까지) → 10/31엔 일품포크로 대체
const idx31 = L.buildDealIndex(L.DEALS.homeplus,'2026-10-31'); assert(idx31['돼지고기'][0].name.includes('일품포크'));
const idx30 = L.buildDealIndex(L.DEALS.homeplus,'2026-10-30'); assert(idx30['돼지고기'][0].name.includes('보리')); console.log('10/30 홈플 돼지 best:', idx30['돼지고기'].map(x=>x.name).join(' / '));
// 김치찌개 계산 검증(이마트만)
const kimchi = L.scoreRecipe(L.RECIPES[0], L.buildDealIndex(L.DEALS.emart,'2026-10-30'));
assert.equal(kimchi.mainHit, 3); assert.equal(kimchi.savings, 3100-1860);
assert.equal(kimchi.origSum, 3100); assert.equal(kimchi.saleSum, 1860); assert.equal(kimchi.savePct, 40); // 절약률 게이지 = 원가 대비 절약
assert.equal(kimchi.origSum - kimchi.saleSum, kimchi.savings);
// 수동 입력 아이템
const custom = [{name:'애호박',price:1000,orig:1500,ing:L.guessIng('애호박'),start:null,end:null}];
const dj = L.scoreRecipe(L.RECIPES[1], L.buildDealIndex(custom,'2026-10-30')); assert.equal(dj.mainHit,1); assert.equal(dj.savings,500);
// 레시피 재료 키가 사전에 있는지 (미역/당면은 의도적 미포함)
const keys = new Set(L.ING_LIST); const odd = new Set(); L.RECIPES.forEach(r=>r.ings.forEach(i=>{ if(!keys.has(i.k)) odd.add(i.k); }));
console.log('사전에 없는 레시피 재료:', [...odd]);

// ---- 공공데이터 레시피 ----
assert(L.PUB_RECIPES.length >= 950, 'pub recipes ' + L.PUB_RECIPES.length);
assert(L.ALL_RECIPES.length >= 1000, 'all ' + L.ALL_RECIPES.length);
const nm = new Set(); L.ALL_RECIPES.forEach(r=>{ const k=r.name.replace(/\s/g,''); assert(!nm.has(k), 'dup '+r.name); nm.add(k); });
assert(L.ALL_RECIPES.slice(0, L.RECIPES.length).every(r=>r.src==='hand'), '직접 쓴 레시피 유지');
L.PUB_RECIPES.forEach(r=>{ assert(r.steps.length>=1 && r.steps.length<=6); r.steps.forEach(s=>assert(s.length<=110, s)); assert(L.RECIPE_CATS.includes(r.cat)); assert(!r.img || r.img.startsWith('https://www.foodsafetykorea.go.kr/'), r.img); r.ings.forEach(i=>assert(keys.has(i.k), i.k)); assert(r.ings.filter(i=>i.main).length<=3); });
const withMain = L.PUB_RECIPES.filter(r=>r.ings.some(i=>i.main)).length; console.log('pub recipes:', L.PUB_RECIPES.length, '· 주재료 매핑됨:', withMain, '· all:', L.ALL_RECIPES.length);
// 오매핑 방지: 굴소스/새우젓/멸치액젓/떡갈비는 재료로 잡히면 안 됨
const sample = (n)=>L.PUB_RECIPES.find(r=>r.name===n);
const tt = L.PUB_RECIPES.filter(r=>/굴소스/.test(r.parts) && !/(^|[ ,])굴 /.test(r.parts) && !/굴/.test(r.name)); assert(tt.every(r=>!r.ings.some(i=>i.k==='굴')), 'oyster sauce mapped');
const ss = L.PUB_RECIPES.filter(r=>/떡갈비/.test(r.name) && !/떡(,| \d|$)/.test(r.parts.replace(/떡갈비/g,''))); assert(ss.every(r=>!r.ings.some(i=>i.k==='떡')), 'tteokgalbi→떡');
// 검색/분류
const f1 = L.filterRecipes(L.ALL_RECIPES, '두부 찌개', ''); assert(f1.length>=3 && f1.every(r=>r.q.includes('두부') && r.q.includes('찌개')));
const f2 = L.filterRecipes(L.ALL_RECIPES, '', '후식'); assert(f2.length>=50 && f2.every(r=>r.cat==='후식'));
// 성능: 전체 랭킹 1회
let t0=Date.now(); for(let i=0;i<20;i++) L.rankRecipes(L.ALL_RECIPES, L.DEALS.emart.concat(L.DEALS.homeplus), '2026-10-30'); console.log('rank 1,0xx recipes x20:', Date.now()-t0, 'ms');
const top = L.rankRecipes(L.ALL_RECIPES, L.DEALS.emart, '2026-10-30'); assert(top.slice(0,10).some(s=>s.recipe.src==='hand') && top.slice(0,30).some(s=>s.recipe.src==='pub'), '기본+공공 레시피가 섞여 상위 노출');

// ---- 탑마트 ----
assert.equal(L.detectBrand({name:'서원유통 탑마트'}), 'topmart'); assert.equal(L.detectBrand({name:'탑마트'}), 'topmart'); assert.equal(L.detectBrand({name:'탑마트 진주호탄점'}), 'topmart');
const tm = L.DEALS.topmart; assert.equal(tm.length, 93); assert(tm.every(d=>d.check && d.src==='topmart'));
const T='2026-10-30', tmAct = tm.filter(d=>L.isActive(d,T)), tmNow = tmAct.filter(d=>!L.isUpcoming(d,T));
assert(!tmAct.some(d=>d.end==='2026-10-29'), '10/29 종료 품목 숨김');
assert(tmAct.some(d=>d.name.startsWith('양파(국산·3kg') && L.isUpcoming(d,T)), '11/1 단하루 양파는 예정');
assert(tmNow.some(d=>d.name.startsWith('돌문어')), '10/30 단하루 돌문어');
assert(!L.DEALS.topmart.filter(d=>L.isActive(d,'2026-10-31')).some(d=>d.name.startsWith('돌문어')), '10/31엔 돌문어 끝');
assert.equal(L.guessIng('돌문어(국산·100g)'), '문어'); assert.equal(L.guessIng('조방낙지'), '낙지'); assert.equal(L.guessIng('꽃게(국산·대·5마리)'), '꽃게');
assert.equal(tm.find(d=>d.name.startsWith('청양/오이맛고추')).ing, null); assert.equal(tm.find(d=>d.name.startsWith('CJ)햇반')).ing, '즉석밥'); assert.equal(tm.find(d=>d.name.startsWith('CJ)햇반')).cat, '간편식품'); // 간편식품은 이제 레시피 매칭에 써요
// 진주 호탄동 실제 OSM 결과
const jj = JSON.parse(require('fs').readFileSync(__dirname+'/fixtures/op_jinju.json'));
const jm = L.parseMarts(jj, 35.1617518, 128.1153464, 2);
const ho = jm.find(m=>m.id==='node/4655465094'); assert(ho && ho.brand==='topmart' && ho.distKm < 0.01, 'hotan');
const tops = jm.filter(m=>m.brand==='topmart'); assert(tops.length>=2); console.log('진주 탑마트:', tops.map(m=>m.name+' '+m.distKm.toFixed(2)+'km').join(', '), '| 목록:', jm.map(m=>m.name).join(', '));
assert(!jm.some(m=>/낚시|이불|보일러|건설/.test(m.name)), 'non-food filtered');
const tmRank = L.rankRecipes(L.ALL_RECIPES, tm, T); assert(tmRank.length > 100);
console.log('탑마트 10/30: 표시', tmAct.length, '(오늘 적용', tmNow.length, '+ 예정', tmAct.length-tmNow.length, ') · 추천 레시피', tmRank.length, '· TOP5:', tmRank.slice(0,5).map(s=>s.recipe.name+'('+s.mainHit+'/'+s.mainTotal+')').join(', '));

// 현재 data/deals.json 구조 검사 (자동 갱신 결과가 앱에서 읽히는지)
{ const D = JSON.parse(require('fs').readFileSync(__dirname+'/../data/deals.json','utf8'));
  assert(D.version===1 && D.deals && D.sources && D.status, 'deals.json schema');
  for (const [b, rows] of Object.entries(D.deals)) { assert(Array.isArray(rows), b);
    rows.forEach(r => { assert(typeof r[0]==='string' && r[0], b+' name'); assert(r[1]===null || typeof r[1]==='number', b+' price '+r[0]);
      assert(!r[5] || /^\d{4}-\d\d-\d\d$/.test(r[5]), b+' end'); assert(D.sources[r[7]||b], b+' source '+(r[7]||b)); }); }
  console.log('data/deals.json:', Object.entries(D.deals).map(([k,v])=>k+' '+v.length).join(', '), '· updated', D.updated); }
// 탑마트 OCR 이름 추출 (분류 안내·잡음 제거)
{ const { extractNames } = require('../scripts/scrapers/topmart');
  const n = extractNames('대추방울토마토 4,980\n채소류 두부/콩나물류\n칼치 (국산)\n@#$ 12,900\n농심)새우깡\n한우냉장양지 100g', L.dealIng);
  assert.deepStrictEqual(n, ['대추방울토마토','갈치','한우냉장양지'], JSON.stringify(n)); }

// 미리 만든 마트 타일 경로: 같은 Overpass 결과로 실시간 검색(parseMarts)과 같은 목록이 나오는지
{ const { toRows } = require('../scripts/build_marts');
  for (const [f, lat, lon] of [['op.json',37.5663,126.9779],['op_jinju.json',35.1617518,128.1153464]]) {
    const js = JSON.parse(require('fs').readFileSync(__dirname+'/fixtures/'+f));
    const g = toRows(js.elements); const rows = g.big.concat(g.local, g.conv);
    for (const r of [1,2,3]) {
      const a = L.parseMarts(js, lat, lon, r).filter(m=>m.brand!=='convenience').map(m=>m.id).sort();
      const b = L.martsFromRows(g.big.concat(g.local), lat, lon, r).map(m=>m.id).sort();
      assert.deepStrictEqual(b, a, f+' r='+r);
    }
    assert(L.martTileKeys(lat, lon, 5).length <= 6);
  }
  const jj = JSON.parse(require('fs').readFileSync(__dirname+'/fixtures/op_jinju.json')); const g = toRows(jj.elements);
  const near = L.martsFromRows(g.big.concat(g.local), 35.1617518, 128.1153464, 3);
  assert(near.some(m=>m.brand==='topmart' && m.id==='node/4655465094'), '진주 탑마트 호탄점 (타일 경로)');
  console.log('마트 타일 경로 = 실시간 검색 결과 일치 (서울시청·진주 호탄동, 1/2/3km)'); }
{ // 간편식품 전단 품목 + 레시피 종류 필터
  const c = n => { const v = L.convOf(n); return v && v.kind + '/' + v.ing; };
  assert.strictEqual(c('CJ)햇반 찰기가득쌀밥(210gx8입)'), '즉석밥/즉석밥');
  assert.strictEqual(c('봉지라면 전품목'), '라면/라면');
  assert.strictEqual(c('교자만두/얇은피 만두 30여종'), '만두/만두');
  assert.strictEqual(c('CJ 스팸 클래식/마일드 (200g×3입)'), '햄/햄');
  assert.strictEqual(c('사조/오뚜기/칼보/리오마레 참치 전품목'), '참치캔/참치');
  assert.strictEqual(c('피코크 대왕 한우사골 부대찌개 (1,638g)'), '밀키트/null');
  assert.strictEqual(c('냉동피자 전품목'), '냉동식품/null');
  assert.strictEqual(c('오뚜기 3분 카레/짜장 전품목 (200g)'), '카레·짜장/카레');
  for (const n of ['참치액/코인육수 전품목', '스페인 대패 삼겹살 (2kg, 봉, 냉동)', '냉동흰다리새우살(900g)', '감홍사과 (1.3kg)', '한우 몸보신탕용 (사골)']) assert.strictEqual(L.convOf(n), null, n);
  // 예전 데이터(9칸)도, 새 데이터(10번째 칸 '간편식품')도 똑같이 읽혀요
  L.setDealsData({ deals: { emart: [['오뚜기 진라면 (5입)', 3980, 4980, '', '2026-10-30', '2026-11-05', null, 'emart', 1], ['CJ 햇반 (8입)', 7980, 9980, '', '2026-10-30', '2026-11-05', '-', 'emart', 1, '간편식품'], ['양파 (3kg)', 4980, 5980, '', '2026-10-30', '2026-11-05'], ['종가 포기김치 (1kg)', 8980, 9980, '', '2026-10-30', '2026-11-05']] }, sources: {} });
  const E = L.DEALS.emart;
  assert.deepStrictEqual(E.map(d => [d.ing, d.cat]), [['라면', '간편식품'], ['즉석밥', '간편식품'], ['양파', null], ['김치', null]]);
  const rk = L.rankRecipes(L.ALL_RECIPES, E, '2026-10-30');
  const kfr = rk.find(s => s.recipe.name === '김치볶음밥'); assert(kfr && kfr.matched.some(m => m.deal.ing === '즉석밥'), '밥 1공기 ← 즉석밥');
  assert(rk.some(s => /라면/.test(s.recipe.name) && s.matched.some(m => m.deal.ing === '라면')), '라면 요리 ← 라면 할인');
  // 종류 필터
  const A = L.ALL_RECIPES, J = A.filter(r => r.jachi), Q = A.filter(r => r.quick);
  assert(J.length >= 60 && J.length <= 300, '자취생 ' + J.length); assert(Q.length >= 60 && Q.length <= 300, '간편식품 ' + Q.length);
  assert(J.every(r => r.cat !== '후식' && r.cat !== '기타')); assert(!J.some(r => r.name === '전복버터구이'));
  assert(Q.some(r => r.name === '떡볶이') && Q.some(r => r.name === '부대찌개') && Q.some(r => r.name === '우동'));
  assert(J.some(r => r.name === '계란말이') && !J.some(r => r.name === '소불고기'));
  assert.strictEqual(L.filterRecipes(A, '', '', null, []).length, A.length);
  assert.strictEqual(L.filterRecipes(A, '', '', null, ['jachi', 'quick']).length, A.filter(r => r.jachi || r.quick).length);
  console.log('간편식품·종류 필터: 자취생', J.length, '/ 간편식품', Q.length, '/ 합집합', A.filter(r => r.jachi || r.quick).length, '/ 전체', A.length);
}
// 화면용 품목 이름 정리 (data/deals.json 실제 이름들)
{
  const S = L.splitDealName, eq = (n, title, meta) => assert.deepStrictEqual(S(n), {title, meta}, n);
  eq('돼지냉장삼겹살(국산·구이/수육용·100g)', '돼지냉장삼겹살 구이/수육용', ['국산', '100g']);
  eq('돼지냉장목살(국산·100g) 구이/수육용', '돼지냉장목살 구이/수육용', ['국산', '100g']);
  eq('수입)돼지냉동대패삼겹 1kg(스페인산·봉)', '돼지냉동대패삼겹', ['스페인산', '1kg', '봉']);
  eq('수입)소냉장와규등심(호주산·100g) 구이/스테이크용', '소냉장와규등심 구이/스테이크용', ['호주산', '100g']);
  eq('수입)소냉장꽃갈비 LA식(원산지별도표기·100g)', '소냉장꽃갈비 LA식', ['원산지별도표기', '100g']);
  eq('미국산 냉장 꽃갈비살 (100g)', '냉장 꽃갈비살', ['미국산', '100g']);
  eq('국내산 돼지고기 삼겹살/목심 (각 100g)', '돼지고기 삼겹살/목심', ['국내산', '각 100g']);
  eq('항공직송연어(노르웨이·500g·팩)', '항공직송연어', ['노르웨이', '500g', '팩']);
  eq('남해안 생굴(국내산) 200G(봉)', '남해안 생굴', ['국내산', '200G', '봉']);
  eq('CJ)햇반 찰기가득쌀밥(210gx8입)', 'CJ 햇반 찰기가득쌀밥', ['210g×8입']);
  eq('고당도감귤(타이벡)(국산·2.8kg·BOX)', '고당도감귤(타이벡)', ['국산', '2.8kg', 'BOX']);
  eq('국물용멸치(대멸)(멸치:국산·650g)', '국물용멸치(대멸)', ['국산', '650g']);
  eq('피코크 대왕 한우사골 부대찌개 (1,638g)', '피코크 대왕 한우사골 부대찌개', ['1,638g']);
  eq('돼지냉장삼겹살(국산·100g', '돼지냉장삼겹살', ['국산', '100g']); // 닫는 괄호 없음
  eq('한우 몸보신탕용 (사골)', '한우 몸보신탕용 (사골)', []); // 규격이 아닌 괄호는 그대로
  eq('유명산지 밤고구마 (3kg)', '유명산지 밤고구마', ['3kg']);
  eq('양파', '양파', []);
  // 모든 실제 이름: 빈 이름 없음, 원문은 그대로(매칭은 원문으로)
  const raw = JSON.parse(require('fs').readFileSync(__dirname + '/../data/deals.json'));
  const names = Object.values(raw.deals).flat().map(x => Array.isArray(x) ? x[0] : x.name);
  names.forEach(n => { const r = S(n); assert(r.title.length > 0, n); assert(!/^수입\)/.test(r.title), n); });
  assert.strictEqual(L.dealIng ? typeof L.dealIng : 'function', 'function');
  console.log('품목 이름 정리:', names.length, '개 OK, 예) ', S('수입)돼지냉동대패삼겹 1kg(스페인산·봉)').title);
}
{ // 할인 재료 키워드 검색
  let k = L.addKw([], '  돼지  '); assert.deepStrictEqual(k, ['돼지']);
  k = L.addKw(k, ''); k = L.addKw(k, '   '); k = L.addKw(k, '돼 지'); k = L.addKw(k, 'CJ'); k = L.addKw(k, 'cj');
  assert.deepStrictEqual(k, ['돼지', 'CJ'], '빈 값·중복(띄어쓰기·대소문자 무시) 무시');
  const d = {name:'수입)돼지냉동대패삼겹 1kg(스페인산·봉)', ing:'돼지고기', martName:'홈플러스'};
  const conv = {name:'CJ)햇반 찰기가득쌀밥(210gx8입)', ing:'즉석밥', cat:'간편식품', kind:'즉석밥', martName:'이마트'};
  assert(L.dealMatchesKw(d, []), '키워드 없으면 전부');
  assert(L.dealMatchesKw(d, ['대패 삼겹']), '띄어쓰기 무시 + 원래 이름');
  assert(L.dealMatchesKw(d, ['돼지고기']), '재료 키');
  assert(L.dealMatchesKw(d, ['홈플']), '마트 이름');
  assert(L.dealMatchesKw(d, ['스페인']), '원산지(원래 이름 안)');
  assert(L.dealMatchesKw(conv, ['cj햇반']), '대소문자 무시');
  assert(L.dealMatchesKw(conv, ['간편식품']) && L.dealMatchesKw(conv, ['즉석']), '분류·종류 태그');
  assert(!L.dealMatchesKw(d, ['두부']) && L.dealMatchesKw(d, ['두부', '삼겹']), 'OR');
  assert(!L.dealMatchesKw(d, ['이마트']), '다른 마트');
  console.log('할인 재료 키워드 검색 OK');
}
console.log('ALL TESTS PASSED');
