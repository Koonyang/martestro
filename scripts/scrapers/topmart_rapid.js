// 탑마트 전단 RapidOCR 결과(글자 상자) → 품목 이름·가격 짝짓기. 정확도가 우선: 틀린 가격보다 빈 가격이 나아요.
// 지난주 손으로 적은 가격(88품목)과 맞춰 보며 정한 규칙: 이름과 가격이 아주 가깝고(가격 글자 높이 1배 안),
// 두 해상도 판독이 서로 다른 값을 내지 않을 때만 가격을 믿어요. 「수·목 행사가」·정상가(작은 가격)는 빼고 큰 할인가만.
// boxes: [[text, [[x,y]x4], score]] → [{name, price, nameBox, priceText}]
const KEY = s => String(s).split('(')[0].replace(/[^가-힣a-zA-Z]/g, '');
function norm(b) { const xs = b[1].map(p => p[0]), ys = b[1].map(p => p[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); return { t: b[0].trim(), s: b[2], x0, x1, y0, y1, h: y1 - y0, w: x1 - x0 }; }
const REG = /시가|행사|수목|수-|정상|판매가|[A-Z]{3,}/;
function parsePrice(t) {
  if (REG.test(t)) return null;
  const s = t.replace(/\s+/g, '');
  let m = s.match(/^(\d{1,3})[,.](\d{3})(?:[,.](\d{3}))?([원월일]?)$/);
  if (m) { const p = +(m[1] + m[2] + (m[3] || '')); return p >= 100 && p <= 300000 ? p : null; }
  m = s.match(/^([1-9]\d{2})원$/); if (m) return +m[1];
  return null;
}
const LABEL = /[할합짧필핣]인가|^수[·\-\s]|^수가|※|데이$|이미지|사진|특가|^\d|교육|상품$|품목/;
function isName(t) { if (LABEL.test(t) || REG.test(t) || /\d{1,3},\d{3}/.test(t)) return false; const k = KEY(t); return /[가-힣]{2,}/.test(k) && k.length <= 24; }
function dist(N, P) {
  const ox = Math.min(N.x1, P.x1) - Math.max(N.x0, P.x0), oy = Math.min(N.y1, P.y1) - Math.max(N.y0, P.y0);
  const tol = Math.min(N.h, P.h) * 0.4;
  if (ox > Math.min(P.w, N.w) * 0.25) {
    if (N.y1 <= P.y0 + tol) return Math.max(0, P.y0 - N.y1);            // 이름 아래 가격
    if (P.y1 <= N.y0 + tol) return Math.max(0, N.y0 - P.y1) * (opt0.below || 1.3); // 가격 아래 이름
  }
  if (oy > Math.min(N.h, P.h) * 0.3) { const dx = Math.max(0, Math.max(N.x0, P.x0) - Math.min(N.x1, P.x1)); return dx * (opt0.side || 1.5) + P.h * 0.3; }
  return 1e9;
}
let opt0 = {};
// 이름 바로 아래 작은 줄 「(국산·500g·팩)」을 이름에 붙여요(한 끼 가격 계산용 규격)
function specBelow(B, N) {
  const S = B.find(b => /^[(（]/.test(b.t) && b.y0 >= N.y1 - N.h * 0.3 && b.y0 - N.y1 < N.h * 1.2 && Math.min(b.x1, N.x1) - Math.max(b.x0, N.x0) > 0);
  return S ? S.t.replace(/^（/, '(') : '';
}
function pair(boxes, opt = {}) {
  opt0 = opt;
  const B = boxes.map(norm).filter(b => b.h > 4 && b.s >= (opt.minScore || 0.5));
  const prices = B.filter(b => b.w > 0).map(b => ({ ...b, p: parsePrice(b.t) })).filter(b => b.p != null);
  const names = B.filter(b => isName(b.t));
  // 줄 친 정상가·「수·목 행사가」 빼기: 왼쪽에 행사가/시가 꼬리표가 붙었거나, 바로 아래·옆에 훨씬 큰 가격이 있으면
  const regular = P => B.some(L => /행사가|시가|정상가|판매가/.test(L.t) && L !== P && Math.min(L.y1, P.y1) - Math.max(L.y0, P.y0) > P.h * 0.4 && P.x0 - L.x1 < P.h * 2 && L.x0 < P.x0)
    || prices.some(Q => Q !== P && Q.h >= P.h * (opt.big || 1.35) && Math.abs((Q.y0 + Q.y1) / 2 - (P.y0 + P.y1) / 2) < Q.h * 2.2 && Math.abs((Q.x0 + Q.x1) / 2 - (P.x0 + P.x1) / 2) < Q.w * 1.5);
  const sale = prices.filter(P => !regular(P));
  const E = [];
  for (const P of sale) for (const N of names) { const d = dist(N, P); if (d < (opt.k || 3) * P.h) E.push([d / P.h, N, P]); }
  E.sort((a, b) => a[0] - b[0]);
  const usedN = new Set(), usedP = new Set(), out = [];
  for (const [d, N, P] of E) { if (usedN.has(N) || usedP.has(P)) continue; usedN.add(N); usedP.add(P); out.push({ name: N.t + (N.t.includes('(') ? '' : specBelow(B, N)), price: P.p, ptext: P.t, d, ph: P.h }); }
  return out;
}
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);
const MAXP = 200000, STRONG = 1, SOLO = 0.3;
// runs: 같은 전단 한 장을 여러 설정으로 읽은 상자 목록들 → [{name, price|null}] (name = OCR 원문)
function combine(runs) {
  const groups = [];
  runs.forEach((r, i) => pair(r, { k: 3 }).forEach(x => {
    const k = KEY(x.name); if (k.length < 2) return;
    let g = groups.find(g => sim(g.k, k) >= 0.75); if (!g) groups.push(g = { k, name: x.name, c: [] });
    g.c.push({ i, p: x.price, d: x.d });
  }));
  return groups.map(g => {
    const vals = new Set(g.c.map(c => c.p)), p = g.c[0].p;
    const runsN = new Set(g.c.map(c => c.i)).size;
    // 두 해상도가 같은 값을 읽었으면 믿고, 한쪽만 읽었으면 이름과 아주 가까울 때만(SOLO)
    const okP = vals.size === 1 && p >= 100 && p <= MAXP && (runsN >= 2 || g.c[0].d < SOLO);
    return { name: g.name, price: okP ? p : null };
  });
}
// 가격 짝이 없는 이름 줄도 품목 후보로(이름만)
function names(runs) {
  const s = [];
  for (const r of runs) for (const b of r) { const t = String(b[0]).trim(), k = KEY(t); if (isName(t) && b[2] >= 0.8 && !s.some(x => sim(KEY(x), k) >= 0.75)) s.push(t); }
  return s;
}
module.exports = { pair, combine, names, sim, parsePrice, isName, KEY };
