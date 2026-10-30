// CU 공식 행사 상품(1+1·2+1) — cu.bgfretail.com/event/plus.do 화면이 부르는 목록 조각(plusAjax.do)을 그대로 읽어요.
// 한 쪽 40개, 쪽 사이 1초 쉼. 행사 기간은 표시가 없어 이번 달(1일~말일)로 봐요.
const { http, num, clean } = require('../lib');
const C = require('./cvs_common');
const PAGE_URL = 'https://cu.bgfretail.com/event/plus.do?category=event&depth2=1&sf=N';

function parse(html) {
  return [...html.matchAll(/<li class="prod_list">([\s\S]*?)<\/li>/g)].map(m => {
    const b = m[1];
    const img = (b.match(/<img src="([^"]+)"/) || [])[1];
    return {
      name: clean((b.match(/<div class="name"[^>]*>\s*<p>([^<]*)/) || [])[1]),
      price: num((b.match(/<strong>([\d,]+)/) || [])[1]),
      label: clean((b.match(/<div class="badge">[\s\S]*?<span class="plus\d">([^<]*)<\/span>/) || [])[1]),
      img: img ? (img.startsWith('//') ? 'https:' + img : img) : null,
    };
  }).filter(x => x.name);
}

async function run(ctx) {
  const range = C.monthRange(ctx.today), items = [], seen = new Set();
  let total = 0, dropped = 0;
  for (let p = 1; p <= 80; p++) {
    const html = await (await http('https://cu.bgfretail.com/event/plusAjax.do', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: PAGE_URL }, body: `pageIndex=${p}&listType=1&searchCondition=&user_id=` })).text();
    const list = parse(html);
    if (!list.length) break;
    for (const it of list) {
      const k = it.name + '|' + it.label; if (seen.has(k)) continue; seen.add(k); total++;
      const r = C.toRow(it, 'cu', range);
      if (r.row) items.push(r.row); else dropped++;
    }
    await C.sleep(1000);
  }
  return { items, total, dropped, source: { label: 'CU 행사 상품', url: PAGE_URL, checked: ctx.today, period: range[0].slice(0, 7) + ' 한 달', official: true, tag: '공식 행사', note: `1+1·2+1 ${total}개 중 먹거리(간편식품·식재료) ${items.length}개. 가격은 행사대로 샀을 때 개당 가격이에요.` } };
}
module.exports = { run, parse };
