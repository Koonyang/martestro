// 세븐일레븐 공식 행사 상품(1+1·2+1·덤증정·할인) — www.7-eleven.co.kr/product/presentList.asp 화면의 목록 조각(listMoreAjax.asp).
// 사진(/upload/…)은 robots.txt 가 수집을 막아 두어 서버에서 받지 않고, 주소만 적어 브라우저가 보여 줘요.
const { http, num, clean } = require('../lib');
const C = require('./cvs_common');
const BASE = 'https://www.7-eleven.co.kr';
const PAGE_URL = BASE + '/product/presentList.asp';
const TABS = { 1: '1+1', 2: '2+1', 3: '덤증정', 4: '할인' };

function parse(html, tab) {
  return [...html.matchAll(/<li>\s*<ul class="tag_list_01">([\s\S]*?)fncGoView\('(\d+)'\)/g)].map(m => {
    const b = m[1];
    const tags = [...b.matchAll(/<li class=['"]?ico_tag_\d+['"]?>([^<]*)/g)].map(x => clean(x[1]));
    const prices = [...b.matchAll(/<span>([\d,]+)<\/span>/g)].map(x => num(x[1]));
    const del = num((b.match(/<del>([\s\S]*?)<\/del>/) || [])[1]);
    const img = (b.match(/<img src="([^"]+)"/) || [])[1];
    const label = tags.find(t => /^\d\s*\+\s*\d$/.test(t)) || TABS[tab];
    return { id: m[2], name: clean((b.match(/class='name'[^>]*>([^<]*)/) || [])[1]), price: prices[prices.length - 1] || null, orig: del, label: label.replace(/\s+/g, ''), img: img ? (img.startsWith('/') ? BASE + img : img) : null };
  }).filter(x => x.name);
}

async function run(ctx) {
  const range = C.monthRange(ctx.today), items = [];
  let total = 0, dropped = 0;
  for (const tab of [1, 2, 3, 4]) {
    const seen = new Set();
    for (let p = 1; p <= 40; p++) {
      const html = await (await http(BASE + '/product/listMoreAjax.asp', { method: 'POST', timeout: 60000, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: PAGE_URL }, body: `intPageSize=100&intCurrPage=${p}&pTab=${tab}&cateCd1=&cateCd2=&cateCd3=` })).text();
      const fresh = parse(html, tab).filter(x => !seen.has(x.id));
      if (!fresh.length) break;
      for (const it of fresh) {
        seen.add(it.id); total++;
        if (it.label === '덤증정') it.orig = null;
        const r = C.toRow(it, 'seven', range);
        if (r.row) items.push(r.row); else dropped++;
      }
      await C.sleep(1000);
    }
  }
  return { items, total, dropped, source: { label: '세븐일레븐 행사 상품', url: PAGE_URL, checked: ctx.today, period: range[0].slice(0, 7) + ' 한 달', official: true, tag: '공식 행사', note: `1+1·2+1·덤증정·할인 ${total}개 중 먹거리(간편식품·식재료) ${items.length}개. 가격은 행사대로 샀을 때 개당 가격이에요.` } };
}
module.exports = { run, parse };
