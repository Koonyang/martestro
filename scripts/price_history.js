// 가격 기록(data/price_history.json)과 「추정 가격」 채우기
// - 전단에서 가격을 못 읽은 품목(가격 null)에, ① 같은 마트 지난 전단의 같은 상품 가격 → ② 지금 다른 마트의 같은 상품 가격(용량을 맞출 수 있을 때만)
//   순서로 어림한 값을 넣고 12번째 칸(r[11])에 {est:1, p:가격, o:정상가?, src:'past'|'other', m:마트, d:날짜, n:원래 상품명} 을 붙여요. 못 찾으면 그대로 null.
//   o(정상가)는 지난 전단에 정상가가 적혀 있던 경우만 — 정상가는 주마다 잘 안 바뀌어서 절약액 어림에 써요.
// - 매일 실행 때 진짜로 읽은 가격(추정 아님)을 기록에 쌓아요. 기록은 상품마다 최근 4개, 400일까지만.
const fs = require('fs'), path = require('path');
const FILE = process.env.PRICE_HISTORY_FILE || path.join(__dirname, '..', 'data', 'price_history.json');
const HIST_MARTS = ['topmart', 'lottemart'];       // 기록을 쌓는 마트(가격이 빠지는 일이 있는 마트)
const EST_MARTS = ['topmart', 'lottemart'];        // 추정 가격을 채우는 마트
const PEER_MARTS = ['emart', 'homeplus', 'lottemart', 'topmart', 'costco']; // ② 에서 비교하는 마트(편의점 제외: 1+1·소포장이라 값이 달라요)
const KEEP = 4, MAX_DAYS = 400;

// 상품 이름 → 비교용 열쇠: 괄호(원산지·용량)·띄어쓰기·기호를 빼요. 「남양)찰기장쌀」 = 「남양 찰기장쌀(1kg)」
const key = n => String(n || '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/사전\s*예약|기획|특가|대용량|행사/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '');
// 이름 속 용량(g 기준). 「100g」「2.5kg」「1.8L」「500ml」; 「×4입」 같은 묶음은 곱해요. 모르면 null
function size(n) {
  const s = String(n || '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|mL|l|L)(?![a-zA-Z])/); if (!m) return null;
  let v = +m[1] * (/^k|^l$|^L$/.test(m[2]) ? 1000 : 1);
  const k = s.match(/[×x*]\s*(\d+)\s*(입|개|봉|팩)/); if (k) v *= +k[1];
  return v || null;
}
// 묶음·카테고리 품목(「전품목」「규격 상이」「A/B」)은 값 하나로 어림할 수 없어요
const UNESTIMABLE = /전품목|카테고리|규격\s*상이|각\s*\d|\//;
const round10 = p => Math.round(p / 10) * 10;

function load(file = FILE) {
  try { const h = JSON.parse(fs.readFileSync(file, 'utf8')); if (h && h.marts) return h; } catch (e) {}
  return { version: 1, marts: {} };
}
function save(h, file = FILE) { fs.writeFileSync(file, JSON.stringify(h)); }

// 진짜로 읽은 가격만 기록 (추정·null 은 빼요)
function record(h, deals, date, marts = HIST_MARTS) {
  const cut = new Date(new Date(date).getTime() - MAX_DAYS * 864e5).toISOString().slice(0, 10);
  for (const m of marts) {
    const box = h.marts[m] || (h.marts[m] = {});
    for (const r of deals[m] || []) {
      if (r[1] == null || r[11] || !(r[1] > 0)) continue;
      const k = key(r[0]); if (k.length < 2) continue;
      const d = r[4] || date; // 전단 시작일
      const list = box[k] || (box[k] = []);
      const same = list.find(e => e[0] === d && e[2] === r[0]);
      const row = r[2] > r[1] ? [d, r[1], r[0], r[2]] : [d, r[1], r[0]]; // [전단 시작일, 가격, 상품명, 정상가?]
      if (same) list[list.indexOf(same)] = row; else list.push(row);
      list.sort((a, b) => a[0].localeCompare(b[0]));
      box[k] = list.filter(e => e[0] >= cut).slice(-KEEP);
      if (!box[k].length) delete box[k];
    }
  }
  return h;
}

// 용량을 맞춰 값 옮기기: 둘 다 용량을 알면 비율로, 둘 다 모르면 그대로, 한쪽만 알면 못 써요(strict) / 같은 마트는 그대로(loose)
function scale(p, fromName, toName, strict) {
  const a = size(fromName), b = size(toName);
  if (a && b) { const f = b / a; return f >= 0.25 && f <= 4 ? p * f : null; }
  if (strict && (a || b)) return null;
  return p;
}
function estimate(h, deals, mart, name, today) {
  if (UNESTIMABLE.test(name)) return null;
  const k = key(name); if (k.length < 2) return null;
  // ① 같은 마트 지난 전단 (이번 전단 시작일보다 이전 기록, 가장 최근 것)
  const box = (h.marts || {})[mart] || {};
  let list = box[k];
  if (!list && k.length >= 3) { const alt = Object.keys(box).find(x => x.length >= 3 && (x.startsWith(k) || k.startsWith(x)) && Math.abs(x.length - k.length) <= 2); if (alt) list = box[alt]; }
  const past = (list || []).filter(e => e[0] < today).slice(-1)[0] || (list || []).slice(-1)[0];
  if (past) { const p = scale(past[1], past[2], name, false); if (p) { const o = past[3] ? scale(past[3], past[2], name, false) : null; return { p: round10(p), ...(o ? { o: round10(o) } : {}), est: 1, src: 'past', m: mart, d: past[0], n: past[2] }; } }
  // ② 지금 다른 마트의 같은 상품 (여러 곳이면 가운데 값)
  const c = [];
  for (const m of PEER_MARTS) {
    if (m === mart) continue;
    for (const r of deals[m] || []) {
      if (r[1] == null || r[11] || key(r[0]) !== k || UNESTIMABLE.test(r[0])) continue;
      const p = scale(r[1], r[0], name, true); if (p) c.push({ p, m, n: r[0], d: r[4] || null });
    }
  }
  if (c.length) { c.sort((a, b) => a.p - b.p); const x = c[(c.length - 1) >> 1]; return { p: round10(x.p), est: 1, src: 'other', m: x.m, d: x.d, n: x.n }; }
  return null;
}
// deals 안의 가격 없는 품목에 추정 가격 채우기 (이미 붙은 추정은 다시 계산). 통계를 돌려줘요
function fill(h, deals, today, marts = EST_MARTS) {
  const stat = {};
  for (const m of marts) {
    const s = stat[m] = { read: 0, est: 0, none: 0 };
    deals[m] = (deals[m] || []).map(r => {
      if (r[11] && r[11].est) { r = r.slice(0, 11); r[1] = null; }
      if (r[1] != null) {
        s.read++;
        // 전단에 정상가가 없으면(탑마트) 지난 전단에 적힌 같은 품목 정상가를 빌려 써요 — 읽은 가격보다 비쌀 때만
        if (r[2] == null) { const e = estimate(h, deals, m, r[0], r[4] || today); if (e && e.src === 'past' && e.o && e.o > r[1] && e.o <= r[1] * 3) { r = r.slice(); r[2] = e.o; s.orig = (s.orig || 0) + 1; } }
        return trim(r);
      }
      const e = estimate(h, deals, m, r[0], r[4] || today);
      if (!e) { s.none++; return trim(r); }
      s.est++;
      const out = r.slice(0, 11); while (out.length < 11) out.push(null);
      out[11] = { est: 1, p: e.p, ...(e.o ? { o: e.o } : {}), src: e.src, m: e.m, d: e.d, n: e.n };
      return out;
    });
  }
  return stat;
}
// 뒤쪽 빈 칸 정리 (r[9]·r[10] 이 null 이면 잘라요)
function trim(r) { r = r.slice(); while (r.length > 9 && r[r.length - 1] == null) r.pop(); return r; }

module.exports = { FILE, key, size, load, save, record, estimate, fill, UNESTIMABLE, HIST_MARTS };
