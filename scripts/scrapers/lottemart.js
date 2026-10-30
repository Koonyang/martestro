// 롯데마트 공식 전단 (롯데마트GO 웹전단 www.mlotte.net) — 전단 이미지의 대체텍스트(img_desc)를 읽어요.
const { getJson, mdToDate, num, isFood, clean } = require('../lib');
const API = 'https://www.lottemartgo.com/apis/fo/product/leaflet';
const HDR = { 'Content-Type': 'application/json', 'x-ssp-gateway-service-id': 'PRODUCT', Origin: 'https://www.mlotte.net', Referer: 'https://www.mlotte.net/' };
const post = (p, body) => getJson(API + p, { method: 'POST', headers: HDR, body: JSON.stringify(body || {}) });

const STOP = /할인|카드|L\.POINT|LPOINT|원$|%|행사|1\+1|2\+1|하나|더$|^\d|기간|한정|수산대전|해양수산부|농\/할|통큰$|상생$|NEW$|GAP$|BRIX|이상$|구매|증정|특가|가격|초특가|메가|오픈런|^※|!|“|”|"|선별|기계로|당도|예능|신대륙|발견|롯데마트|롯데슈퍼|단독|^\[|\]$/;

function nameOf(line) {
  // 규격 괄호: (100g/냉장/…) 처럼 규격·원산지를 담은 첫 괄호
  const re = /([^\s()]+(?:\s[^\s()]+){0,5})\(([^)]*(?:\/|g|kg|입|개|봉|팩|마리|송이|단|통|박스|규격|산)[^)]*)\)/g;
  let m;
  while ((m = re.exec(line))) {
    const words = m[1].split(' '); const keep = [];
    for (let i = words.length - 1; i >= 0; i--) { if (STOP.test(words[i])) break; keep.unshift(words[i]); }
    if (!keep.length) continue;
    const spec = m[2].split('/')[0];
    const start = m.index + m[1].length - keep.join(' ').length;
    return { name: clean(keep.join(' ') + ' (' + spec + ')'), idx: m.index + m[0].length, pre: line.slice(0, start) };
  }
  return null;
}
function priceOf(rest) {
  rest = rest.replace(/(\d)\s+,(\d)/g, '$1,$2');
  const before = rest.split(/※|▶/)[0];
  let m = before.match(/([\d,]{3,})원\s*할인 전 가격\s*([\d,]{3,})원/) || before.match(/([\d,]{3,})원 할인 전 가격 ([\d,]{3,})/);
  if (m) return { price: num(m[1]), orig: num(m[2]) };
  const chain = [...before.matchAll(/([\d,]{3,})(?:\/[\d,]+)?원?\s*→/g)];
  m = before.match(/→\s*(?:[^\d→]*?)([\d,]{3,})(?:\/[\d,]+)?원?(?!.*→)/);
  if (chain.length && m) return { price: num(m[1]), orig: num(chain[0][1]) };
  m = before.match(/([\d,]{3,})(?:\/[\d,]+)?원/);
  if (m) return { price: num(m[1]), orig: null };
  return { price: null, orig: null };
}
function condOf(pre, rest) {
  const s = pre + ' ' + rest;
  const m = s.match(/(행사카드|L\.POINT|수산대전 해양수산부|가격할인|농\/할)\s*(\d+%\s*할인|[\d,]+원\s*할인|\d천원\s*할인|\d만원\s*할인|1\+1|2\+1)/) || s.match(/(하나 더 1\+1|행사카드 2\+1|\d개 이상\s*\d+% 할인|1\+1|2\+1)/);
  return m ? clean(m[0]) : '행사가';
}
function datesOf(line, def, ref) {
  let m = line.match(/기간\s*:\s*(\d{1,2})\/(\d{1,2})\([^)]\)\s*~\s*(\d{1,2})\/(\d{1,2})/);
  if (m) return [mdToDate(+m[1], +m[2], ref), mdToDate(+m[3], +m[4], ref)];
  const lead = [...line.matchAll(/^(?:(\d{1,2})\/(\d{1,2})[월화수목금토일](?:,\s*)?)/g)];
  m = line.match(/^((?:\d{1,2}\/\d{1,2}[월화수목금토일],?\s*)+)/);
  if (m) { const ds = [...m[1].matchAll(/(\d{1,2})\/(\d{1,2})/g)].map(x => mdToDate(+x[1], +x[2], ref)); return [ds[0], ds[ds.length - 1]]; }
  return def;
}

function parseLeaflet(lf, guessIng, ref) {
  const def = [lf.post_start_dt.slice(0, 10), lf.post_end_dt.slice(0, 10)];
  const items = []; const seen = new Set();
  (lf.leaflet_img_list || []).forEach((img, pi) => {
    String(img.img_desc || '').split('\n').map(clean).forEach(line => {
      if (!line || line.startsWith('※') || line.startsWith('·')) return;
      const n = nameOf(line); if (!n) return;
      if (!isFood(n.name, guessIng)) return;
      const rest = line.slice(n.idx);
      const { price, orig } = priceOf(rest);
      const cond = condOf(n.pre, rest);
      if (price == null && cond === '행사가') return;
      const [start, end] = datesOf(line, def, ref);
      const key = n.name + '|' + start; if (seen.has(key)) return; seen.add(key);
      items.push([n.name.slice(0, 60), price, orig && price && orig > price ? orig : null, cond, start, end, null, 'lottemart', pi + 1]);
    });
  });
  return items;
}

async function run(ctx) {
  const init = await post('/plate/init');
  const grp = ((init.data || {}).plate_leaflet_str_list || []).find(s => s.str_type === 'HYPER');
  if (!grp) throw new Error('롯데마트: 일반 매장(HYPER) 전단 그룹을 못 찾음');
  const sel = await post('/plate/select', { str_cd: grp.str_grp_cd, rst1: '', is_group: '1' });
  const list = ((sel.data || {}).plate_leaflet_list || []).filter(l => l.post_end_dt.slice(0, 10) >= ctx.today);
  if (!list.length) throw new Error('롯데마트: 진행 중 전단 없음');
  const lf = list[0];
  const items = parseLeaflet(lf, ctx.guessIng, ctx.today);
  const title = lf.plate_leaflet_nm.replace(/^\d{8}-\d{8}_/, '');
  return {
    items, flyerId: lf.plate_leaflet_id,
    source: { label: '롯데마트 공식 전단 「' + title + '」 (롯데마트GO 웹전단, 일반 매장)', url: 'https://www.mlotte.net/', checked: ctx.today, period: `${lf.post_start_dt.slice(0, 10)}~${lf.post_end_dt.slice(0, 10)} (신선식품 기준, 품목별 상이)`, official: true, note: '전단 이미지의 대체텍스트를 자동으로 읽어요. 제타플렉스·맥스 매장은 전단이 달라요.' },
  };
}
module.exports = { run, parseLeaflet, nameOf, priceOf };
