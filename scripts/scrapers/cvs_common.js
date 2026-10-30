// 편의점 행사(1+1·2+1·할인) 공통: 품목 분류, 개당 가격, 이번 달 기간.
// 편의점 품목은 「간편식품」(도시락·김밥·라면·즉석밥·냉동식품·즉석식…) 위주로 남기고,
// 과자·음료·술·생활용품·반려동물 용품은 뺍니다. 재료(두부·계란·김치 등)는 확실한 것만 재료로 표시해요.
const L = require('../../src/logic.js');
const { clean } = require('../lib');

const stripMaker = n => clean(n).replace(/^[^)]{1,14}\)\s*/, ''); // "CJ)햇반…" → "햇반…"
const PET = /^뉴트리\)|뉴트리스틱|_\s*$|위스카스|시저|뉴트리플랜|세나개|칭찬스틱|애묘|애견|반려|펫|템테이션|츄르|캣|도그(?!\s*(핫|바))|_H$|덴탈|강아지|고양이/;
const NONFOOD = /스프레이|세제|샴푸|린스|치약|칫솔|물티슈|화장지|티슈|생리대|팬티라이너|기저귀|면도|로션|크림(?!빵|치즈|우동|파스타|스프)|마스크|건전지|라이터|섬유|바디|핸드|클렌|가그린|리스테린|담배|충전|우산|양말|스타킹|콘돔|밴드|파스|렌즈|볼펜|봉투|비닐|호일|랩\b|종이컵|젓가락|수세미|고무장갑|방향제|탈취|살충|모기|핫팩|흡착|카드|상품권|교통/;
const DRINK = /스프라이트|에스프레소|음료|주스|쥬스|커피|라떼|아메리카노|에이드|탄산|콜라|사이다|워터|생수|스무디|보리차|옥수수수염|녹차|홍차|오차|헛개|아이스티|티\s*\d|차\s*\d+\s*(ml|mL)|차\d+$|두유|우유|요구르트|요거트|야쿠르트|막걸리|맥주|소주|와인|하이볼|사케|보드카|위스키|칵테일|레몬\s*\d|이온|비타민|프로틴\s*(드링크|쉐이크)|에너지|핫식스|박카스|컨디션|여명|숙취|식혜|수정과|쿨피스|밀크티|콤부차/;
const SNACK = /레이즈|타코야끼|바게트|스낵|과자|칩|쿠키|크래커|비스킷|초코|초콜|캔디|젤리|구미|껌|사탕|캬라멜|카라멜|아이스|빙수|콘$|파이|웨하스|빼빼로|팝콘|육포|어포|쥐포|견과|땅콩|아몬드|피스타치오|호두|캐슈|군밤|맛밤|도넛|도나스|카스테라|모찌|떡\s*케|케이크|케익|빵|베이글|크로와상|머핀|와플|푸딩|마카롱|약과|양갱|한과|부각|말랭이|츄(?!러스)|타라|꽃게랑|쌀로별|구운감자|감자칩|오징어(?!\s*(볶음|덮밥|짬뽕))|문어\s*(다리|발)|스트링|인포켓|래핑카우|로쉐|페레로|허니|시리얼|그래놀라|프로틴\s*바|에너지바|(?<![핫치킨꼬치])바$|바\s*\d+g|라면땅|뿌셔|자갈치|꼬깔|새우깡|감자깡|양파링|홈런볼|포카칩|프링글스|오감자|치토스|맛동산|썬칩|컵케|츄러스|핫케/;
const SAUCE = /드레싱|소스|케찹|케첩|마요|머스타드|와사비|시즈닝|후추|소금|설탕|식초|조미료|다시다|미원|양념장|양념\s*\d|액젓|꽃게액|참기름|들기름(?!김)|식용유|올리브유/;
// 재료로 인정하는 것(편의점에서 실제로 파는 신선·기본 식재료). 가공 표시가 있으면 재료로 안 봐요.
const ING_OK = new Set(['두부', '순두부', '콩나물', '숙주', '김치', '계란', '고추장', '된장', '마늘', '돼지고기', '소고기', '대파', '양파', '감자', '애호박', '버섯']);
const NOT_RAW = /마파|어단백|스프|수프|밥$|미역|그라탕|닭|곱창|막창|오돌뼈|족발|삼겹살\S|볶음|구이|조림|무침|튀김|전$|스틱|바$|칩|맛|볼$|스테이크|소스|양념(?!\s*(돼지|소))|찌개|국$|탕$|라면|면$|덮밥|비빔|샐러드|샌드|버거|피자|주스|즙|분말|가루|후레이크|프레이크/;

function classify(name) {
  const full = clean(name), n = stripMaker(full);
  if (!n) return { keep: false, why: '이름 없음' };
  if (PET.test(full)) return { keep: false, why: '반려동물' };
  if (NONFOOD.test(n)) return { keep: false, why: '생활용품' };
  const soupLike = /국|탕|찌개|죽|스프|수프|육수|카레|짜장|곰탕|라면|면/.test(n);
  if (DRINK.test(n) || (/\d+\s*(ml|mL|ML|L)\b/.test(n) && !soupLike)) return { keep: false, why: '음료·술' };
  const hotbar = /핫바|후랑크|프랑크|꼬치바|소시지\s*바|구이\s*바|소바바/.test(n); // 데워 먹는 핫바류는 간식이 아니라 즉석식
  if (!hotbar && SNACK.test(n)) return { keep: false, why: '과자·간식' };
  if (SAUCE.test(n)) return { keep: false, why: '소스·양념' };
  const cv = L.convOf(n);
  if (cv) return { keep: true, kind: cv.kind, ing: cv.ing };
  // 크기·개수 꼬리를 떼고 본 이름으로 판단 ("두부찌개용380g" → "두부찌개용")
  const base = n.replace(/\s*[\d.,*]+\s*(g|kg|G|KG|ml|mL|L|입|개|구|편)?\b.*$/, '').replace(/\(.*$/, '').replace(/찌개\s*용|찌개\s*두부/g, '두부').replace(/맛김치/, '김치') || n;
  const ing = L.dealIng(n);
  const raw = ing && ING_OK.has(ing) && !NOT_RAW.test(base) &&
    (ing !== '마늘' || /다진\s*마늘|깐\s*마늘/.test(base)) && (!/^(고추장|된장)$/.test(ing) || /(고추장|된장)$/.test(base));
  if (raw) return { keep: true, kind: null, ing };
  // 그 밖의 바로 먹는 끼니 — 간편식품 묶음에만 넣어요(재료 아님)
  if (/덮밥|비빔밥|볶음밥|오므라이스|리조또|떡볶이|순대|떡꼬치|어묵|만두|돈까스|돈가스|너겟|핫도그|피자|버거|핫바|후랑크|소시지|스팸|치킨|닭|국밥|곰탕|찌개|국$|탕$|죽$|우동|국수|짜장|짬뽕|면$|볶음$|반찬|조림|장조림|김치(?!.*스낵)|샐러드|스프(?!라|레)|수프|밥$|꼬치|핫바|(고등어|삼치|연어|갈치)\s*구이|오돌뼈|곱창|막창|닭발|족발|그라탕/.test(n.replace(/\s*[\d.,*]+\s*(g|kg|G|ml|입|개)?\b.*$/, ''))) return { keep: true, kind: '즉석식', ing: null };
  return { keep: false, why: '기타' };
}

// 개당 가격: 1+1 → 2개 값에 2개(정가×1/2), 2+1 → 정가×2/3 … 10원 단위 반올림
function promoOf(label) { const m = /^(\d)\s*\+\s*(\d)$/.exec(String(label || '').replace(/\s+/g, '')); return m ? { buy: +m[1], get: +m[2] } : null; }
function unitPrice(listPrice, label) {
  const p = promoOf(label); if (!p || !listPrice) return listPrice;
  return Math.round(listPrice * p.buy / (p.buy + p.get) / 10) * 10;
}
// 편의점 행사는 달마다 바뀌어요: 이번 달 1일 ~ 말일 (한국 날짜)
function monthRange(today) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return [`${y}-${mm}-01`, `${y}-${mm}-${last}`];
}
// 한 품목 → deals.json 행. kind 는 r[9] 에(앱이 이름으로 못 가를 때 쓰는 종류 이름), 사진은 r[10]
function toRow({ name, price, orig, label, img }, src, range) {
  const c = classify(name);
  if (!c.keep || !price) return { row: null, why: c.why || '가격 없음' };
  const promo = promoOf(label);
  const unit = promo ? unitPrice(price, label) : price;
  const o = promo ? price : (orig && orig > price ? orig : null);
  const cond = promo ? `${promo.buy}+${promo.get}` : (o ? '할인' : (label || '행사'));
  const cv = L.convOf(name) || L.convOf(stripMaker(name));
  const row = [clean(name), unit, o, cond, range[0], range[1], c.ing || '-', src, null, cv ? L.CONV_CAT : (c.kind || null)];
  if (img && /^https:\/\//.test(img)) row.push(img);
  return { row, kind: c.kind, ing: c.ing };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { classify, promoOf, unitPrice, monthRange, toRow, stripMaker, sleep };
