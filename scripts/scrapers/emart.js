// 이마트 공식 전단 (emartapp.emart.com) — 전단 이미지마다 붙어 있는 "자세한 내용" 텍스트를 읽어요.
const { getText, mdToDate, num, isFood, clean, todayKST } = require('../lib');
const URL = 'https://emartapp.emart.com/leaflet/leafletView_EL.do';

const unesc = s => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function parse(html, guessIng, ref = todayKST()) {
  const blocks = [...html.matchAll(/<div class="img_detail_txt[^"]*">([\s\S]*?)<\/div>/g)].map(m => m[1]);
  if (!blocks.length) throw new Error('이마트: 전단 텍스트 블록을 못 찾음(페이지 구조 변경?)');
  const items = []; let title = null, period = null;
  blocks.forEach((b, bi) => {
    const page = +((b.match(/<h2>\s*전단\s*(\d+)\s*면/) || [])[1] || bi + 1);
    const body = unesc((b.match(/<p>([\s\S]*?)<\/p>/) || [, ''])[1]).replace(/<br\s*\/?>/g, '\n');
    body.split('\n').map(clean).filter(Boolean).forEach(line => {
      if (line.startsWith('[')) {
        if (!title) { const t = line.match(/^\[\s*([^\]]+?)\s*\]/); if (t) title = t[1]; }
        const pm = line.match(/행사기간\s*:\s*([\d.]+\([^)]\)\s*-\s*[\d.]+\([^)]\))/); if (pm && !period) period = pm[1];
        return;
      }
      const pm = line.match(/행사기간\s*:\s*(\d{1,2})\.(\d{1,2})\([^)]\)(?:\s*-\s*(\d{1,2})\.(\d{1,2})\([^)]\))?/);
      if (!pm) return;
      const head = line.slice(0, pm.index);
      // 이름 = 첫 괄호(규격)까지
      let nm = head.split(/\s※/)[0];
      const pm1 = nm.match(/^(.+?\))/);
      nm = pm1 ? pm1[1] : ((nm.match(/^(.*?(?:전품목|\d+여?종|기획))/) || [, nm.split(' 대한민국')[0]])[1]);
      const name = clean(nm).slice(0, 60);
      if (!isFood(name, guessIng)) return;
      const start = mdToDate(+pm[1], +pm[2], ref), end = pm[3] ? mdToDate(+pm[3], +pm[4], ref) : start;
      const rest = line.slice(pm.index + pm[0].length).replace(/^,?\s*단 하루!?/, '').trim();
      let price = null, orig = null, cond = '';
      const pr = rest.match(/([\d,]+)(?:\/[\d,]+)?원?\s*->\s*([\d,]+)(?:\/[\d,]+)?원/);
      if (pr) { orig = num(pr[1]); price = num(pr[2]); cond = rest.slice(pr.index + pr[0].length); }
      else { const p1 = rest.match(/^([\d,]+)(?:\/[\d,]+)?원/); if (p1) { price = num(p1[1]); cond = rest.slice(p1[0].length); } else cond = rest; }
      cond = clean(cond.split(/ 이마트e\/| ※| <혜택| 일반고객/)[0]).slice(0, 60) || (orig ? '행사가' : '행사가');
      if (price != null && orig != null && price >= orig) orig = null;
      if (price == null && !/할인|\+/.test(cond)) return; // 가격도 할인조건도 없으면 버림
      items.push([name, price, orig, cond, start, end, null, 'emart', page]);
    });
  });
  return { items, title, period };
}

async function run(ctx) {
  const html = await getText(URL);
  const { items, title, period } = parse(html, ctx.guessIng, ctx.today);
  return {
    items,
    source: { label: '이마트 공식 전단' + (title ? ' 「' + title + '」' : ''), url: URL, checked: ctx.today, period: period ? period + ' (품목별 상이)' : '품목별 상이', official: true },
  };
}
module.exports = { run, parse, URL };
