// 스크래퍼 공통 도구 (Node 18+ 내장 fetch 사용, 외부 패키지 없음)
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 Martestro-bot (+https://github.com/Koonyang/martestro)';

async function http(url, opt = {}, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opt.timeout || 30000);
      const res = await fetch(url, { ...opt, headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...(opt.headers || {}) }, signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return res;
    } catch (e) { if (e.cause && !/\(/.test(e.message)) e.message += ' (' + (e.cause.code || e.cause.message) + ' ' + url.slice(0, 60) + ')'; last = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}
const getText = async (u, o) => (await http(u, o)).text();
const getJson = async (u, o) => (await http(u, o)).json();

// 한국시간 오늘 YYYY-MM-DD
function todayKST(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600e3);
  return k.toISOString().slice(0, 10);
}
const pad = n => String(n).padStart(2, '0');
// 월/일만 있는 날짜 → 연도 추정 (기준일과 가장 가까운 해)
function mdToDate(m, d, ref = todayKST()) {
  const y = +ref.slice(0, 4), rm = +ref.slice(5, 7);
  let yy = y;
  if (rm >= 11 && m <= 2) yy = y + 1; else if (rm <= 2 && m >= 11) yy = y - 1;
  return `${yy}-${pad(m)}-${pad(d)}`;
}
// UTC ISO → 한국 날짜
const isoToKST = s => todayKST(new Date(s));
const num = s => s == null ? null : (s = String(s).replace(/[^\d]/g, ''), s ? +s : null);

// 먹거리 판정: 재료 사전에 걸리거나(레시피용), 아래 먹거리 단어가 있으면 OK. 술/생활용품/가전은 제외
const NOT_FOOD = /화장지|휴지|물티슈|세제|샴푸|린스|치약|칫솔|바디|로션|기저귀|생리대|섬유유연|주방세제|키친타올|랩|호일|위스키|와인|맥주|소주|막걸리|사케|보드카|진\(|하이볼|UHD|모니터|TV|태블릿|노트북|청소기|에어|선풍기|건전지|배터리|의류|양말|내의|이불|패딩|장난감|완구|사료|캣|도그|우산|냄비|프라이팬|밀폐용기|수건|타월|면도|염색|마스크팩|화장품|향수|디퓨저|캔들|공기|필터|전구|상품권|포인트|쿠폰|유료광고|냉장고|커피머신|머신|게이밍|헤드셋|럭키박스|LUCKY|서랍장|조끼|아가방|티니핑|에디션|캠핑|텐트|게임|가방|부탄가스|구연산|크리넥스|옥시크린|화장지/;
const FOOD_EXTRA = /사과|배\(|배 |감귤|귤|밀감|한라봉|레드향|천혜향|포도|샤인머스캣|머스캣|딸기|바나나|단감|홍시|곶감|키위|멜론|메론|수박|참외|블루베리|체리|망고|파인애플|자몽|오렌지|석류|고구마|밤|라면|우유|요거트|요구르트|치즈|버터|김\(|들기름김|구이김|초밥|치킨|닭강정|빵|베이커리|만두|떡볶이|햇반|즉석밥|쌀|잡곡|현미|과자|스낵|초콜릿|아이스크림|음료|커피|주스|두유|생수|탄산|견과|아몬드|호두|캐슈넛|땅콩|킹크랩|대게|랍스터|전복|굴|가리비|홍합|조개|명란|젓갈|회|연어|참치|고기|한우|한돈|육|갈비|등심|안심|목심|삼겹|오리|소시지|베이컨|어묵|김치|반찬|국|탕|찌개|소스|양념|장류|된장|고추장|간장|식용유|참기름|올리브유|설탕|소금|밀가루|부침가루|튀김가루|시리얼|꿀|잼|피자|도시락|샐러드|채소|야채|버섯|과일|나물|새우|오징어|문어|낙지|게|생선|고등어|갈치|삼치|조기|굴비|황태|멸치|미역|다시마|떡|면|국수|냉면|우동|파스타|스파게티|짜파게티|카레|짜장|햄|밀키트|즉석|냉동밥|컵밥|돈까스|돈가스|너겟|핫도그|볶음밥|곰탕|육개장|죽|스팸|비엔나|딤섬|교자|통조림|계란|란\(|두부|콩나물|숙주|감자|양파|당근|무\(|배추|양배추|상추|깻잎|시금치|오이|호박|파프리카|피망|토마토|브로콜리|대파|쪽파|마늘|생강|고추|단호박|아스파라거스|옥수수|콩/;

function isFood(name, guessIng) {
  if (!name) return false;
  if (NOT_FOOD.test(name)) return false;
  return !!guessIng(name) || FOOD_EXTRA.test(name);
}
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

module.exports = { http, getText, getJson, todayKST, mdToDate, isoToKST, num, isFood, clean, UA };
