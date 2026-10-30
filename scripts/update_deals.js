#!/usr/bin/env node
// 매일 GitHub Actions 가 실행: 마트별 전단을 새로 읽어 data/deals.json 을 갱신해요.
// - 어떤 마트가 실패하면 그 마트는 이전 데이터를 그대로 둬요(지우지 않음).
// - 기간이 끝난 품목은 빼요.
// - 실제 내용이 바뀌었을 때만 파일을 다시 써요(→ 바뀐 게 없으면 커밋도 안 생김).
const fs = require('fs'), path = require('path');
const L = require('../src/logic.js');
const { todayKST } = require('./lib');

const FILE = process.env.DEALS_FILE || path.join(__dirname, '..', 'data', 'deals.json');
const SCRAPERS = { emart: require('./scrapers/emart'), homeplus: require('./scrapers/homeplus'), lottemart: require('./scrapers/lottemart'), topmart: require('./scrapers/topmart') };
const MIN = { emart: 10, homeplus: 5, lottemart: 10, topmart: 5 }; // 이보다 적게 읽히면 '구조가 바뀌어 실패'로 보고 이전 데이터 유지
const only = (process.env.ONLY || '').split(',').filter(Boolean);

(async () => {
  const today = process.env.TODAY || todayKST();
  const prev = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const next = { version: 1, updated: prev.updated, sources: { ...prev.sources }, deals: {}, status: { ...prev.status } };
  const alive = rows => (rows || []).filter(r => !r[5] || r[5] >= today);
  // 1) 이전 데이터에서 끝난 품목 빼기
  for (const k of Object.keys(prev.deals)) next.deals[k] = alive(prev.deals[k]);
  // 2) 마트별 새로 읽기
  const log = [];
  for (const [mart, s] of Object.entries(SCRAPERS)) {
    if (only.length && !only.includes(mart)) continue;
    const st = prev.status[mart] || {};
    try {
      const r = await s.run({ today, guessIng: L.guessIng, dealIng: L.dealIng, prevStatus: st });
      if (r.keep) { next.status[mart] = { ...st, ok: true, lastTry: today, msg: r.msg }; log.push(`${mart}: 유지 (${r.msg})`); continue; }
      const items = alive(r.items);
      if (items.length < MIN[mart]) throw new Error(`읽은 품목이 ${items.length}개뿐 (최소 ${MIN[mart]}) — 페이지 구조가 바뀌었을 수 있음`);
      const same = JSON.stringify(items) === JSON.stringify(next.deals[mart]);
      next.deals[mart] = items;
      if (!same) next.sources[mart] = r.source;
      next.status[mart] = { mode: 'auto', ok: true, fetched: same ? (st.fetched || today) : today, lastTry: today, count: items.length,
        ...(r.flyerId ? { flyerId: r.flyerId } : {}), ...(r.flyerTitle ? { flyerTitle: r.flyerTitle } : {}), msg: same ? '변화 없음' : '갱신됨' };
      log.push(`${mart}: ${same ? '변화 없음' : '갱신'} ${items.length}개`);
    } catch (e) {
      next.status[mart] = { ...st, ok: false, lastTry: today, lastError: String(e.message || e).slice(0, 300) };
      log.push(`${mart}: 실패 → 이전 데이터 유지 (${next.deals[mart] ? next.deals[mart].length : 0}개) — ${e.message}`);
    }
  }
  // 3) 바뀐 게 있을 때만 저장 (lastTry 같은 시도 기록만 바뀐 건 무시)
  const strip = o => JSON.stringify({ s: o.sources, d: o.deals, st: Object.fromEntries(Object.entries(o.status).map(([k, v]) => [k, { ...v, lastTry: undefined, msg: undefined }])) });
  console.log(log.join('\n'));
  if (strip(prev) === strip(next)) { console.log('변경 없음 — 저장 안 함'); return; }
  next.updated = new Date(Date.now() + 9 * 3600e3).toISOString().replace('Z', '+09:00').slice(0, 19) + '+09:00';
  // 데이터가 앱에서 정상적으로 읽히는지 마지막 확인
  if (!L.setDealsData(next)) throw new Error('생성한 deals.json 을 앱 로직이 못 읽음');
  fs.writeFileSync(FILE, JSON.stringify(next));
  console.log('저장:', FILE, Object.entries(next.deals).map(([k, v]) => k + ' ' + v.length).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
