// 홈플러스 공식 디지털 전단 (my.homeplus.co.kr/digital) — 웹페이지가 쓰는 상품 목록 JSON 을 그대로 읽어요.
const { http, getJson, num, isFood, clean } = require('../lib');
const BASE = 'https://my.homeplus.co.kr';

const ymd = s => s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null; // "20261029 00:00:00"

function toRows(goods, guessIng) {
  const out = [];
  for (const g of goods) {
    const name = clean(g.goodsNm);
    if (!isFood(name, guessIng)) continue;
    const price = num(g.price), orig = num(g.origPrice);
    const tags = (g.tags || []).map(t => clean(t.tagNm)).filter(Boolean);
    out.push([name, price, orig && price && orig > price ? orig : null, tags.join(', ') || '행사가', ymd(g.startTime), ymd(g.endTime), null, 'homeplus', null]);
  }
  return out;
}

async function run(ctx) {
  // 세션 쿠키 받기
  const r0 = await http(BASE + '/digital');
  const cookie = (r0.headers.getSetCookie ? r0.headers.getSetCookie() : [r0.headers.get('set-cookie') || '']).map(c => c.split(';')[0]).filter(Boolean).join('; ');
  const hdr = { 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/digital', Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
  let page = 1, tpage = 1; const goods = [];
  do {
    const j = await getJson(BASE + '/digital/getLftMainGoods', { method: 'POST', headers: hdr, body: `sortBy=P&page=${page}&searchTagNm=` });
    if (!j || !j.data || !Array.isArray(j.data.goodsList)) throw new Error('홈플러스: 상품 목록 응답 형식이 바뀜');
    goods.push(...j.data.goodsList); tpage = +j.data.tpage || 1; page++;
  } while (page <= tpage && page <= 30);
  const items = toRows(goods, ctx.guessIng);
  const starts = items.map(r => r[4]).filter(Boolean).sort(), ends = items.map(r => r[5]).filter(Boolean).sort();
  return {
    items, raw: goods.length,
    source: { label: '홈플러스 공식 디지털 전단 (마이홈플러스 「전단 상품 보기」)', url: BASE + '/digital', checked: ctx.today, period: starts.length ? `${starts[0]}~${ends[ends.length - 1]} (품목별 상이)` : '품목별 상이', official: true },
  };
}
module.exports = { run, toRows };
