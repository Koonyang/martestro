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
console.log('탑마트 10/30: 표시', tmAct.length, '(오늘 할인', tmNow.length, '+ 예정', tmAct.length-tmNow.length, ') · 추천 레시피', tmRank.length, '· TOP5:', tmRank.slice(0,5).map(s=>s.recipe.name+'('+s.mainHit+'/'+s.mainTotal+')').join(', '));

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
  // 조리시간은 안 써요: 어떤 레시피에도 mins 없음, 자취생/간편식품은 재료 수·가공식품·지은 밥으로
  assert(A.every(r => !('mins' in r)), 'mins 남음');
  assert(!Q.some(r => r.name === '시금치나물') && Q.some(r => r.name === '계란말이') && Q.some(r => r.name === '김치볶음밥')); // 맛살·밥
  assert(J.some(r => r.name === '고등어조림') && !J.some(r => r.name === '카레라이스') && !J.some(r => r.name === '닭볶음탕')); // 주재료 2개 이하
  // 기본 레시피 1인분 열량 어림
  L.RECIPES.forEach(r => { assert(r.kcalEst && r.kcal >= 30 && r.kcal <= 1000 && r.kcal % 10 === 0, r.name + ' ' + r.kcal); });
  const kc = n => L.RECIPES.find(r => r.name === n).kcal;
  assert(kc('김치찌개') >= 300 && kc('김치찌개') <= 500, '김치찌개 ' + kc('김치찌개'));
  assert(kc('김치볶음밥') >= 550 && kc('김치볶음밥') <= 800, '김치볶음밥 ' + kc('김치볶음밥'));
  assert(kc('콩나물국') < kc('된장찌개') && kc('시금치나물') < kc('제육볶음') && kc('삼겹살 상추쌈') > kc('소불고기'));
  assert.equal(L.estKcal({name:'테스트', src:'hand', ings:[{k:'계란', amt:'2개'}]}), 80); // 110g÷2인분×140 = 77 → 80
  assert(A.filter(r => !r.kcal).length <= 8, '열량 없는 레시피가 너무 많아요'); assert(A.every(r => r.kcal == null || (r.kcal >= 5 && r.kcal <= 1200)), '열량 데이터 오류');
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
// 정렬: 방향 토글, 값 없는 항목은 어느 방향이든 맨 뒤
{
  const D = L.DEAL_SORTS, R = L.RECIPE_SORTS;
  let c = L.normSort(D, null); assert.deepEqual(c, {k:'rec', rev:false});
  assert.deepEqual(L.normSort(D, {k:'zzz', rev:true}), {k:'rec', rev:false});
  assert.deepEqual(L.normSort(D, {k:'rec', rev:true}), {k:'rec', rev:false});
  c = L.nextSort(D, c, 'off'); assert.deepEqual(c, {k:'off', rev:false}); assert.equal(L.sortLabel(D, c), '할인율 높은순'); assert.equal(L.sortArrow(D, c), '↑');
  c = L.nextSort(D, c, 'off'); assert.deepEqual(c, {k:'off', rev:true}); assert.equal(L.sortLabel(D, c), '할인율 낮은순'); assert.equal(L.sortArrow(D, c), '↓');
  c = L.nextSort(D, c, 'price'); assert.deepEqual(c, {k:'price', rev:false}); assert.equal(L.sortLabel(D, c), '가격 낮은순'); assert.equal(L.sortArrow(D, c), '↓');
  assert.equal(L.sortLabel(D, {k:'price', rev:true}), '가격 높은순');
  assert.equal(L.sortLabel(D, {k:'end', rev:false}), '마감 임박순'); assert.equal(L.sortLabel(D, {k:'end', rev:true}), '마감 여유순');
  assert.deepEqual(L.nextSort(D, {k:'rec', rev:false}, 'rec'), {k:'rec', rev:false}); assert.equal(L.sortArrow(D, {k:'rec'}), '');
  ['절약률 높은순','절약률 낮은순','비용 낮은순','비용 높은순','칼로리 낮은순','칼로리 높은순'].forEach((l, i) => assert.equal(L.sortLabel(R, {k:['save','cost','kcal'][i>>1], rev:!!(i&1)}), l));
  assert.deepEqual(R.map(d => d.k), ['rec','save','cost','kcal']); // 조리시간 정렬은 없앴어요
  assert.deepEqual(L.normSort(R, {k:'time', rev:true}), {k:'rec', rev:false}); // 예전에 저장한 조리시간 → 추천순
  assert.equal(L.sortArrow(R, {k:'kcal', rev:false}), '↓'); assert.equal(L.sortArrow(R, {k:'kcal', rev:true}), '↑');
  // 모든 정렬 이름(기본·반대)이 뜻에 맞는 화살표를 가져요
  [D, R].forEach(defs => defs.filter(d => d.dir).forEach(d => [false, true].forEach(rev => { const l = L.sortLabel(defs, {k:d.k, rev}), a = L.sortArrow(defs, {k:d.k, rev});
    assert.equal(a, /높은|많은|큰|임박/.test(l) ? '↑' : '↓', l + ' → ' + a); assert(a, l); })));
  assert.equal(L.sortArrow(D, {k:'end', rev:false}), '↑'); assert.equal(L.sortArrow(D, {k:'end', rev:true}), '↓');
  const ds = [{name:'a', price:1000, orig:2000, end:'2026-11-03'}, {name:'b', price:500, end:'2026-10-31'}, {name:'c', cond:'1+1'}, {name:'d', price:3000, orig:3300, end:'2026-11-01'}, {name:'e', price:800, orig:1000}];
  const nm = l => l.map(x => x.name).join('');
  assert.equal(nm(L.sortDeals(ds, {k:'rec'})), 'abcde');
  assert.equal(nm(L.sortDeals(ds, {k:'off', rev:false})), 'aedbc'); // 50,20,9 % / 할인율 없음은 뒤 (원래 순서)
  assert.equal(nm(L.sortDeals(ds, {k:'off', rev:true})), 'deabc');
  assert.equal(nm(L.sortDeals(ds, {k:'price', rev:false})), 'beadc');
  assert.equal(nm(L.sortDeals(ds, {k:'price', rev:true})), 'daebc');
  assert.equal(nm(L.sortDeals(ds, {k:'end', rev:false})), 'bdace');
  assert.equal(nm(L.sortDeals(ds, {k:'end', rev:true})), 'adbce');
  assert.equal(nm(ds), 'abcde'); // 원본은 그대로
  // 실제 데이터: 할인율 순서 + 빈 값 맨 뒤
  const act = deals.filter(d => L.isActive(d, '2026-10-30'));
  [false, true].forEach(rev => { const o = L.sortDeals(act, {k:'off', rev}).map(L.dealOffPct); const f = o.findIndex(v => v == null);
    if (f >= 0) assert(o.slice(f).every(v => v == null)); const v = o.slice(0, f < 0 ? o.length : f); for (let i = 1; i < v.length; i++) assert(rev ? v[i] >= v[i-1] : v[i] <= v[i-1]); });
  // 레시피
  const rk = L.rankRecipes(L.RECIPES, deals, '2026-10-30');
  assert(rk.some(s => s.mainCost > 0));
  rk.forEach(s => { const p = s.matched.filter(x => x.ing.main && x.meal).reduce((a, x) => a + x.meal.price, 0); assert.equal(s.mainCost, s.matched.some(x => x.ing.main && x.meal) ? p : null); }); // 한 끼 기준 비용
  const chk = (k, rev, desc) => { const o = L.sortRecipes(rk, {k, rev}).map(s => L.recipeSortVal(k, s)); const f = o.indexOf(null);
    if (f >= 0) assert(o.slice(f).every(v => v == null), k); const v = o.slice(0, f < 0 ? o.length : f); assert(v.length > 1, k);
    for (let i = 1; i < v.length; i++) assert(desc ? v[i] <= v[i-1] : v[i] >= v[i-1], k+rev); };
  chk('save', false, true); chk('save', true, false); chk('cost', false, false); chk('cost', true, true); chk('kcal', false, false); chk('kcal', true, true);
  assert.deepEqual(L.sortRecipes(rk, {k:'rec'}).map(s => s.recipe.name), rk.map(s => s.recipe.name));
  // {s}/{r} 섞인 목록 + get, 원 레시피는 절약률 값이 없어 뒤로
  const mix = [{r:L.RECIPES[0]}, {s:rk[0]}]; assert.equal(L.sortRecipes(mix, {k:'save'}, it => it.s || it.r)[0], rk[0].savePct ? mix[1] : mix[0]);
  console.log('정렬 OK');
}
// 한 끼(1인분) 가격: 실제 전단 상품명으로 팩 무게 읽기 + 레시피 분량 → 한 끼 가격
{
  const pg = (n, k) => L.packGrams(n, k);
  const cases = [
    ['돼지냉동대패삼겹 1kg(국산·봉)', '돼지고기', 1000], ['수입)돼지냉동대패삼겹 1kg(스페인산·봉)', '돼지고기', 1000],
    ['돼지냉장삼겹살(국산·구이/수육용·100g)', '돼지고기', 100], ['보리먹고 자란 돼지 삼겹살 100G/돼지고기', '돼지고기', 100],
    ['지평선메뚜기쌀 등 쌀 6종(국산·20kg)', '쌀', 20000], ['종가 김장김치 (5kg)', '김치', 5000], ['한우냉동모듬곰거리 3kg(국산·팩)', '소고기', 3000],
    ['농심 감바스 짜파게티 (137g×4입)', '라면', 548], ['CJ)햇반 찰기가득쌀밥(210gx8입)', '즉석밥', 1680], ['CJ 비비고 왕교자 (350g×3)', '만두', 1050],
    ['동원)딤섬새우하가우/부추창펀(300gx2입/390gx2입)', '만두', 600], ['동원 통그릴 비엔나 180G*2', '소시지', 360], ['오리주물럭 500g+500g(원산지별도표기·1묶음)', '오리고기', 1000],
    ['동물복지란 30구 (대/특)', '계란', 30*55], ['행복대란 30개입', '계란', 30*55], ['양파(국산·6~8입·망)', '양파', 7*200], ['파프리카 (개)', '파프리카', 150],
    ['대파 (단)', '대파', 800], ['제주 은갈치 (대/마리, 해동)', '갈치', 500], ['오징어(국산·5마리)', '오징어', 1250], ['오뚜기 컵라면6입(육개장/진라면 3종 등 4종)', '라면', 720],
    ['파스퇴르 후레쉬우유 (900ml)', '우유', 900], ['활전복 (중/20~25미기획, 100g)', '전복', 100], ['토종닭백숙(국산·1마리)', '닭고기', 1000],
    ['본고장 포차 즉석우동/김치우동 (상품별 규격 상이)', '우동면', null], ['인기버섯 5종 (각)', '버섯', null], ['국산 시금치', '시금치', null], ['갱엿 꾸덕 닭강정 (팩)', '닭고기', null]
  ];
  cases.forEach(([n, k, g]) => assert.equal(pg(n, k), g, n));
  // 분량 문자열
  assert.equal(L.amtGrams('200g', '돼지고기'), 200); assert.equal(L.amtGrams('1/2모', '두부'), 150); assert.equal(L.amtGrams('1마리(1kg)', '닭고기'), 1000);
  assert.equal(L.amtGrams('4개', '계란'), 220); assert.equal(L.amtGrams('2큰술', '고추장'), 30); assert.equal(L.amtGrams('약간', '당근'), 5); assert.equal(L.amtGrams('한 줌', '버섯'), 50);
  assert.equal(L.amtGrams('1/4포기', '김치'), 625); assert.equal(L.amtGrams('', '김치'), null);
  // 인분: 공공 레시피 1인분, 기본 레시피 2인분(밥 1공기 요리는 1인분)
  const R = n => L.ALL_RECIPES.find(r => r.name === n);
  assert.equal(L.recipeServ(R('김치찌개')), 2); assert.equal(L.recipeServ(R('김치볶음밥')), 1);
  const kj = R('김치찌개'), pork = kj.ings.find(i => i.k === '돼지고기');
  assert.equal(L.mealGrams(kj, pork), 100); // 200g ÷ 2인분
  // 대패삼겹 1kg 11,060원 → 한 끼 100g = 1,106원 → 1,110원 (팩 가격 아님)
  const big = {name:'수입)돼지냉동대패삼겹 1kg(스페인산·봉)', ing:'돼지고기', price:11060, orig:15800};
  assert.equal(L.round10(big.price * L.mealFrac(kj, pork, big)), 1110);
  // 100g당 가격은 그대로 곱하기: 100g 1,984원 × 1 = 1,980원, 150g이면 2,980원
  const per100 = {name:'돼지냉장삼겹살(국산·구이/수육용·100g)', ing:'돼지고기', price:1984};
  assert.equal(L.round10(per100.price * L.mealFrac(kj, pork, per100)), 1980);
  const jy = R('제육볶음'); assert.equal(L.round10(per100.price * L.mealFrac(jy, jy.ings.find(i => i.k === '돼지고기'), per100)), 2980);
  // 20kg 쌀 56,905원 → 밥 1공기(생쌀 90g) ≈ 260원
  const kb = R('김치볶음밥'), rice = kb.ings.find(i => i.k === '쌀');
  assert.equal(L.round10(56905 * L.mealFrac(kb, rice, {name:'지평선메뚜기쌀 등 쌀 6종(국산·20kg)', ing:'쌀'})), 260);
  // 지은 밥 상품(200g×4입)은 1공기 210g 기준
  assert.equal(L.round10(7980 * L.mealFrac(kb, rice, {name:'CJ 구수한 쌀밥 (200g×4입)', ing:'쌀'})), 2090);
  // 공공 레시피: 재료 줄 g 그대로 (1인분)
  const pub = L.ALL_RECIPES.find(r => r.src === 'pub' && /새송이버섯 100g/.test(r.parts || ''));
  assert.equal(L.mealGrams(pub, pub.ings.find(i => i.k === '버섯')), 100);
  // 공공 레시피의 '밥 210g'(지은 밥)은 생쌀 90g으로
  const bb = L.ALL_RECIPES.find(r => r.src === 'pub' && r.ings.some(i => i.k === '쌀') && /(^|, )(쌀)?밥 210g/.test(r.parts || ''));
  if (bb) assert(L.mealGrams(bb, bb.ings.find(i => i.k === '쌀')) <= 100, bb.name);
  // 팩 크기 모름 → null (화면은 「1팩 기준」)
  assert.equal(L.mealFrac(kj, pork, {name:'갱엿 꾸덕 닭강정 (팩)', ing:'닭고기', price:9990}), null);
  // 추천 결과: 재료마다 meal, 절약률 게이지는 한 끼 기준 합계
  const rk2 = L.rankRecipes(L.ALL_RECIPES, deals, '2026-10-30');
  rk2.forEach(s => { s.matched.forEach(x => { if (x.deal.price == null) return assert.equal(x.meal, null);
      if (x.meal.f == null) assert.equal(x.meal.price, x.deal.price); else { assert(x.meal.price % 10 === 0 && x.meal.price >= 10); } });
    const o = s.matched.filter(x => x.ing.main && x.meal && x.meal.orig).reduce((a, x) => a + x.meal.orig, 0); assert.equal(s.mealOrig, o); assert(s.mealSale <= s.mealOrig); });
  const maxPack = Math.max(...rk2.flatMap(s => s.matched.filter(x => x.meal && x.meal.f != null).map(x => x.meal.price)));
  console.log('한 끼 가격 최댓값:', maxPack, '원'); assert(maxPack < 15000);
  console.log('한 끼 가격 OK');
}
{ // 행간 10% 늘림: 모든 line-height는 예전 값×1.1 (워드마크 1, 할인 재료 머리말 1.2/1.35만 예외)
  const T = require('fs').readFileSync(__dirname + '/../src/template.html', 'utf8');
  const lhs = [...T.matchAll(/([^{}\n]*)\{[^{}]*?line-height:\s*([0-9.]+)(px)?/g)].map(m => ({ sel: m[1].trim(), v: +m[2] }));
  const inl = [...T.matchAll(/style="[^"]*line-height:\s*([0-9.]+)/g)].map(m => +m[1]);
  const OK = new Set([1.705, 1.43, 1.76, 1.485, 1.1, 1.32, 17.6, 1.65, 1.815]);
  lhs.forEach(x => { if (/\.brand \.wm/.test(x.sel)) assert.equal(x.v, 1); else if (/^\.dhead \.page-h (h1|p)$/.test(x.sel)) assert([1.2, 1.35].includes(x.v), x.sel); /* 할인 재료 머리말만 일부러 촘촘히 */ else assert(OK.has(x.v), x.sel + ' line-height ' + x.v); });
  inl.forEach(v => assert(OK.has(v), 'inline line-height ' + v));
  // 글씨 크기를 따라가는 em 행간은 예전 px 값 그대로 (17.6px @ 10.5px 글씨)
  const lhCalc = [...T.matchAll(/line-height:calc\(([^)]*)\)/g)].map(m => m[1]);
  assert.deepEqual(lhCalc, ['17.6em / 10.5'], 'calc line-height ' + lhCalc);
  assert(/body\{[^}]*line-height:1\.705/.test(T));
  console.log('line-height ×1.1 OK (' + lhs.length + '+' + inl.length + ')');
}

// ---- 직접 쓴 추가 레시피 (src/hand_recipes.js) + 사진 ----
{ const fs = require('fs'), path = require('path');
  const H = require('../src/hand_recipes.js'); const more = L.RECIPES.slice(43);
  assert.strictEqual(more.length, H.HAND_MORE_RAW.length); assert(more.length >= 40 && more.length <= 60, '추가 레시피 수 ' + more.length);
  assert.strictEqual(L.RECIPES.length, 43 + more.length);
  const pubNames = new Set(L.PUB_RECIPES.map(r => r.name.replace(/\s/g, ''))), seen = new Set();
  L.RECIPES.forEach(r => { const k = r.name.replace(/\s/g, ''); assert(!seen.has(k), '이름 중복 ' + r.name); seen.add(k); assert(!pubNames.has(k), '공공 레시피와 이름 중복 ' + r.name); });
  const ING = new Set(L.ING_LIST.concat(['당면','가지','마요네즈','새우젓','김','무','케첩','미역']));
  more.forEach(r => {
    assert(L.RECIPE_CATS.includes(r.cat) && r.cat !== '후식', '분류 ' + r.name);
    assert(r.serv === 1 || r.serv === 2, '인분 ' + r.name);
    assert(r.ings.some(i => i.main), '주재료 ' + r.name); assert(r.ings.every(i => ING.has(i.k)), '재료 키 ' + r.name + ' ' + r.ings.map(i => i.k));
    assert(r.ings.every(i => i.amt), '분량 ' + r.name); assert(r.steps.length >= 3, '만드는 법 ' + r.name);
    assert(r.kcal >= 40 && r.kcal <= 900 && r.kcalEst, '열량 ' + r.name + ' ' + r.kcal);
    assert(/^assets\/recipes\/[a-z0-9-]+\.webp$/.test(r.img) && fs.existsSync(path.join(__dirname, '..', r.img)), '사진 파일 ' + r.name);
    assert(fs.statSync(path.join(__dirname, '..', r.img)).size < 120000, '사진 용량 ' + r.name);
    if (r.imgAi) assert(!r.imgCredit); else { const c = r.imgCredit; assert(c && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(c.u) && c.a && c.t, '사진 출처 ' + r.name);
      assert(/^(CC0|CC BY(-SA)? [\d.]+( kr)?|퍼블릭 도메인)$/.test(c.l) && !/NC|ND/.test(c.l), '사진 라이선스 ' + r.name + ' ' + c.l); }
  });
  L.RECIPES.slice(0, 43).forEach(o => assert(!o.serv && !o.img, '기존 레시피 그대로 ' + o.name));
  // 기존 규칙(재료 5개·주재료 2개 이하, 비싼 재료 X → 자취생 / 가공식품·지은 밥 → 간편식품)
  const t = n => more.find(r => r.name === n);
  assert(t('참치마요덮밥').jachi && t('참치마요덮밥').quick && t('참치마요덮밥').rice);
  assert(!t('소고기 숙주볶음').jachi, '소고기는 자취생 아님'); assert(!t('라볶이').jachi && t('라볶이').quick, '재료 6개');
  assert.strictEqual(L.recipeServ(t('간장계란밥')), 1); assert.strictEqual(L.recipeServ(t('어묵탕')), 2);
  const ai = more.filter(r => r.imgAi).length, real = more.length - ai;
  const jachi = L.ALL_RECIPES.filter(r => r.jachi).length, quick = L.ALL_RECIPES.filter(r => r.quick).length;
  console.log('추가 레시피', more.length, '· 실제 사진', real, '· AI', ai, '· 자취생 +' + more.filter(r => r.jachi).length, '(전체 ' + jachi + ') · 간편식품 +' + more.filter(r => r.quick).length, '(전체 ' + quick + ')');
  assert(real >= 15 && ai >= 1);
  // 화면: AI 사진에만 작은 「AI 생성 이미지」 표시, 출처 화면에 사진 출처
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  assert(/\.ai-lbl\{[^}]*bottom:4px[^}]*z-index:2[^}]*font-size:calc\(100cqw \* 8 \/ 76\)/.test(html), 'AI 표시 스타일 (사진 76px일 때 8px)');
  assert(html.includes("r.img && r.imgAi ? '<span class=\"ai-lbl\">AI 생성 이미지</span>'"), '썸네일 AI 표시');
  assert(html.includes('function photoCredits()') && html.includes('photoCredits() +'), '사진 출처');
}
{ // 편의점 행사(CU·세븐일레븐·이마트24): 분류·개당 가격·파서·브랜드
  const fs = require('fs');
  const C = require('../scripts/scrapers/cvs_common');
  const k = n => { const c = C.classify(n); return c.keep ? (c.kind || 'ING:' + c.ing) : 'X'; };
  // 간편식품은 남기고 종류 표시
  assert.strictEqual(k('CJ)햇반210g'), '즉석밥'); assert.strictEqual(k('농심)신라면툼바큰사발'), '라면');
  assert.strictEqual(k('CJ)비비고왕교자315g'), '만두'); assert.strictEqual(k('CJ)맥스봉숯불맛핫바90g'), '즉석식');
  assert.strictEqual(k('하림)닭가슴살갈릭100g'), '즉석식'); assert.strictEqual(k('오뚜기)저당브리또바질치킨125g'), '도시락·김밥');
  assert.strictEqual(k('CJ)비비고갈비탕400g'), '즉석식'); assert.strictEqual(k('오뚜기)우노불고기피자180g'), '냉동식품');
  assert.strictEqual(k('삼양)맵탱청양대파소컵'), '라면'); assert.strictEqual(k('오뚜기)열라면맛치즈후랑크70g'), '즉석식');
  // 확실한 식재료만 재료로
  assert.strictEqual(k('CJ)국산콩두부찌개용380g'), 'ING:두부'); assert.strictEqual(k('종가집)맛김치300g'), 'ING:김치');
  assert.strictEqual(k('풀무원)튜브다진마늘80g'), 'ING:마늘'); assert.strictEqual(k('신선)한돈삼겹살200g'), 'ING:돼지고기');
  // 과자·음료·반려동물·생활용품·양념은 빼요
  for (const n of ['농심)멘토스레인보우', '한성)일품실오징어30g', '농심)치타라24g', '청정원)고구마츄60G', 'CJ)햇반레드빈호박차500', '코카)스프라이트P500ml', '매크로)레이즈트러플감자',
    '마즈)위스카스파우치_H', '동원)뉴트리스틱(참치닭가슴살)_', '피죤)핑크로즈스프레이120ml', '샘표)한국풍마파두부190g', '오리엔탈드레싱245ml'])
    assert.strictEqual(k(n), 'X', n);
  // 개당 가격 · 이번 달
  assert.strictEqual(C.unitPrice(2200, '1+1'), 1100); assert.strictEqual(C.unitPrice(1500, '2+1'), 1000); assert.strictEqual(C.unitPrice(1000, '할인'), 1000);
  assert.deepStrictEqual(C.monthRange('2026-10-30'), ['2026-10-01', '2026-10-31']); assert.deepStrictEqual(C.monthRange('2028-02-03'), ['2028-02-01', '2028-02-29']);
  const R = ['2026-10-01', '2026-10-31'];
  assert.deepStrictEqual(C.toRow({ name: 'CJ)햇반210g', price: 2200, label: '1+1', img: 'https://x.example/a.jpg' }, 'cu', R).row, ['CJ)햇반210g', 1100, 2200, '1+1', R[0], R[1], '즉석밥', 'cu', null, '간편식품', 'https://x.example/a.jpg']);
  assert.deepStrictEqual(C.toRow({ name: 'CJ)맥스봉숯불맛핫바90g', price: 3000, orig: 3600, label: '할인' }, 'seven', R).row.slice(1, 10), [3000, 3600, '할인', R[0], R[1], '-', 'seven', null, '간편식품']);
  assert.strictEqual(C.toRow({ name: 'CJ)비비고갈비탕400g', price: 5980, label: '2+1' }, 'seven', R).row[9], '즉석식');
  assert.strictEqual(C.toRow({ name: '농심)멘토스레인보우', price: 900, label: '1+1' }, 'cu', R).row, null);
  // 공식 목록 조각 파서 (구조가 바뀌면 여기서 걸려요)
  const cu = require('../scripts/scrapers/cu').parse('<li class="prod_list"><a><img src="//img.example/p/1.jpg"><div class="name" onClick="view(1);"><p>CJ)햇반210g</p></div><div class="price"><strong>2,200</strong><span class="won">원</span></div><div class="badge"> <span class="plus1">1+1</span></div></a></li>');
  assert.deepStrictEqual(cu, [{ name: 'CJ)햇반210g', price: 2200, label: '1+1', img: 'https://img.example/p/1.jpg' }]);
  const sv = require('../scripts/scrapers/seven').parse("<li> <ul class=\"tag_list_01\"><li class='ico_tag_06'>2+1</li></ul><img src=\"/upload/product/1/2.jpg\"><div class='name'>CJ)비비고왕교자315g</div><div class='price'><span>8,980</span></div><a href=\"javascript:fncGoView('061235');\">", 2);
  assert.deepStrictEqual(sv.map(x => [x.name, x.price, x.label, x.img]), [['CJ)비비고왕교자315g', 8980, '2+1', 'https://www.7-eleven.co.kr/upload/product/1/2.jpg']]);
  const e24 = require('../scripts/scrapers/emart24').parse('<div class="itemWrap"><img src="https://img.example/e.JPG"><span class="sale floatR">SALE</span><div class="itemtitle"> <p> <a href="#">CJ)국산콩두부부침용380G</a></p></div><p class="price">2,980 원</p><p class="priceOff">3,980 원</p></div>');
  assert.deepStrictEqual(e24, [{ name: 'CJ)국산콩두부부침용380G', price: 2980, orig: 3980, label: '할인', img: 'https://img.example/e.JPG' }]);
  // 편의점 이름 → 브랜드
  assert.strictEqual(L.cvsBrandOf('CU 진주호탄점'), 'cu'); assert.strictEqual(L.cvsBrandOf('씨유 신안점'), 'cu'); assert.strictEqual(L.cvsBrandOf('GS25 진주점'), 'gs25');
  assert.strictEqual(L.cvsBrandOf('세븐일레븐 진주역점'), 'seven'); assert.strictEqual(L.cvsBrandOf('이마트24 R진주점'), 'emart24'); assert.strictEqual(L.cvsBrandOf('emart24 진주점'), 'emart24');
  assert.strictEqual(L.cvsBrandOf('미니스톱 진주점'), null); assert.strictEqual(L.cvsBrandOf('스쿠터 대리점'), null);
  // 앱: 1+1 은 개당 50%, r[9] 의 종류 이름(즉석식)은 간편식품 묶음 + 종류 태그
  L.setDealsData({ deals: { cu: [['CJ)햇반210g', 1100, 2200, '1+1', '2026-10-01', '2026-10-31', '즉석밥', 'cu', null, '간편식품', 'https://x.example/a.jpg'], ['CJ)비비고갈비탕400g', 3990, 5980, '2+1', '2026-10-01', '2026-10-31', '-', 'cu', null, '즉석식'], ['CJ)국산콩두부찌개용380g', 1500, 3000, '1+1', '2026-10-01', '2026-10-31', '두부', 'cu', null]] }, sources: {} });
  const D = L.DEALS.cu;
  assert.deepStrictEqual(D.map(d => [d.kind, d.cat, d.ing, Math.round(L.dealOffPct(d))]), [['즉석밥', '간편식품', '즉석밥', 50], ['즉석식', '간편식품', null, 33], [null, null, '두부', 50]]);
  assert.deepStrictEqual(L.sortDeals(D, { k: 'off' }).map(d => d.ing || d.kind)[2], '즉석식');
  assert(L.dealMatchesKw(D[0], ['햇반']) && L.dealMatchesKw(D[2], ['두부']));
  assert(L.BRANDS.cu.label === 'CU' && L.BRANDS.seven.label === '세븐일레븐' && L.BRANDS.emart24.label === '이마트24' && !L.BRANDS.cu.big);
  // 화면: 칩·근처 편의점 → 브랜드 행사, 1+1 배지
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  assert(html.includes("var CVS_BRANDS = ['cu','seven','emart24'];") && html.includes('DATA_BRANDS.filter(hasDeals)'), '편의점 칩');
  assert(html.includes('var db = dataBrandOf(m) || m.brand;'), '근처 편의점 → 행사');
  assert(html.includes("np ? '<span class=\"off np\">'+np+'</span>'"), '1+1 배지');
  // 실제 데이터: 편의점 품목은 모두 먹거리이고 이번 달 기간·개당 가격
  const real = JSON.parse(fs.readFileSync(__dirname + '/../data/deals.json', 'utf8'));
  for (const b of ['cu', 'seven', 'emart24']) (real.deals[b] || []).forEach(r => {
    assert(C.classify(r[0]).keep, '먹거리 ' + r[0]); assert(r[1] > 0 && r[4] && r[5], '가격·기간 ' + r[0]);
    if (/^\d\+\d$/.test(r[3])) assert(r[2] > r[1], '정가 > 개당 ' + r[0]);
  });
  console.log('편의점 행사:', ['cu', 'seven', 'emart24'].map(b => b + ' ' + (real.deals[b] || []).length).join(', '));
}
{ // 레시피 탭 제목 아래 한 줄: 마트 이름 없이 공통 문구
  const st = o => L.recipeSubtitle(o).replace(/<[^>]+>/g, '');
  assert.strictEqual(st({sel:true, mart:true, n:42, total:1078}), '선택한 재료로 만들 수 있는 레시피 42개');
  assert.strictEqual(st({sel:false, mart:true, n:661, total:1078}), '선택한 마트의 할인 재료로 만들 수 있는 레시피 661개');
  assert.strictEqual(st({sel:false, mart:false, n:1078, total:1078}), '레시피 1,078개');
  assert.strictEqual(st({sel:false, mart:false, n:12, total:1078}), '레시피 12개');
  assert(!/전체|중\)/.test(L.recipeSubtitle({mart:true, n:661, total:1078})) && /<b>661개<\/b>$/.test(L.recipeSubtitle({mart:true, n:661, total:1078})));
  // 제목 옆 전체 개수: 아무것도 안 골라 전부 보일 땐 숨김
  assert.strictEqual(L.recipeTotalLabel({sel:false, mart:true, n:661, total:1078}), '전체 1,078개');
  assert.strictEqual(L.recipeTotalLabel({sel:true, mart:true, n:42, total:1078}), '전체 1,078개');
  assert.strictEqual(L.recipeTotalLabel({sel:false, mart:false, n:12, total:1078}), '전체 1,078개');
  assert.strictEqual(L.recipeTotalLabel({sel:false, mart:false, n:1078, total:1078}), '');
  console.log('recipeSubtitle ok');
}
console.log('ALL TESTS PASSED');
