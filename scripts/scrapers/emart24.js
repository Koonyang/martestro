// 이마트24 공식 행사 상품 — emart24.co.kr/goods/event 의 「간편식사」 분류만 읽어요(과자·음료·생활용품은 레시피와 무관해 건너뜀).
const { http, num, clean } = require('../lib');
const C = require('./cvs_common');
const PAGE_URL = 'https://emart24.co.kr/goods/event';
const LABEL = { onepl: null, twopl: null, tripl: null, sale: '할인', dum: '덤증정', gift: '덤증정' };

function parse(html) {
  return html.split('<div class="itemWrap">').slice(1).map(b => {
    const bd = b.match(/<span class="([a-z]+) floatR">([^<]*)/) || [];
    const raw = clean(bd[2]).replace(/\s+/g, '');
    const label = /^\d\+\d$/.test(raw) ? raw : (LABEL[bd[1]] || raw || '할인');
    return {
      name: clean((b.match(/<div class="itemtitle">\s*<p>\s*<a[^>]*>([^<]*)/) || [])[1]),
      price: num((b.match(/class="price">([^<]*)/) || [])[1]),
      orig: num((b.match(/class="priceOff">([^<]*)/) || [])[1]),
      label, img: (b.match(/<img[^>]*src="(https:[^"]+)"/) || [])[1] || null,
    };
  }).filter(x => x.name);
}

async function run(ctx) {
  const range = C.monthRange(ctx.today), items = [], seen = new Set();
  let total = 0, dropped = 0;
  for (let p = 1; p <= 80; p++) {
    const html = await (await http(`${PAGE_URL}?search=&page=${p}&base_category_seq=1&align=`)).text();
    const fresh = parse(html).filter(x => !seen.has(x.name + '|' + x.label));
    if (!fresh.length) break;
    for (const it of fresh) {
      seen.add(it.name + '|' + it.label); total++;
      const r = C.toRow(it, 'emart24', range);
      if (r.row) items.push(r.row); else dropped++;
    }
    await C.sleep(1000);
  }
  return { items, total, dropped, source: { label: '이마트24 행사 상품', url: PAGE_URL, checked: ctx.today, period: range[0].slice(0, 7) + ' 한 달', official: true, tag: '공식 행사', note: `간편식사 행사 ${total}개 중 먹거리(간편식품·식재료) ${items.length}개. 가격은 행사대로 샀을 때 개당 가격이에요.` } };
}
module.exports = { run, parse };
