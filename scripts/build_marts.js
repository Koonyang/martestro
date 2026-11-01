#!/usr/bin/env node
// 전국 마트 위치(OpenStreetMap) → data/marts/ 격자 타일 (앱이 내 주변 타일 1~4개만 받아서 바로 거리 계산)
// 1순위 Overpass API(여러 서버), 실패하면 Geofabrik 대한민국 추출본 + osmium(있을 때). 둘 다 실패하면 기존 타일 유지(exit 0).
// 사용: node scripts/build_marts.js            (인터넷에서 받기)
//       node scripts/build_marts.js kr.json    (미리 받은 Overpass JSON 사용)
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const L = require('../src/logic.js');
const OUT = process.env.MARTS_OUT || path.join(__dirname, '..', 'data', 'marts');
const TILE = L.MART_TILE; // 도(°)
const BIG_SHOPS = /^(wholesale|department_store)$/;
const Q = '[out:json][timeout:600];area["ISO3166-1"="KR"][admin_level=2]->.kr;(nwr["shop"~"^(supermarket|convenience|wholesale|department_store)$"](area.kr););out center tags;';
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function overpass() {
  for (const u of SERVERS) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 700e3);
      const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(Q), signal: ctl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Martestro-bot (+https://github.com/Koonyang/martestro)' } });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.elements || j.elements.length < 5000) throw new Error('결과가 너무 적음 ' + (j.elements || []).length + (j.remark ? ' ' + j.remark : ''));
      console.log('Overpass OK', u, j.elements.length);
      return j.elements;
    } catch (e) { console.log('Overpass 실패', u, e.message); }
  }
  return null;
}
function geofabrik() {
  try { execFileSync('osmium', ['--version'], { stdio: 'ignore' }); } catch (e) { console.log('osmium 없음 — Geofabrik 대체 경로 건너뜀'); return null; }
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-'));
  try {
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', d + '/kr.pbf', 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf'], { stdio: 'inherit', timeout: 900e3 });
    execFileSync('osmium', ['tags-filter', d + '/kr.pbf', 'nwr/shop=supermarket,convenience,wholesale,department_store', '-o', d + '/f.pbf', '--overwrite']);
    execFileSync('osmium', ['export', d + '/f.pbf', '-f', 'geojsonseq', '-a', 'type,id', '-o', d + '/f.geojsonseq', '--overwrite']);
    const els = [];
    for (const line of fs.readFileSync(d + '/f.geojsonseq', 'utf8').split('\n')) {
      const s = line.replace(/^\x1e/, '').trim(); if (!s) continue;
      const f = JSON.parse(s), p = f.properties || {}, g = f.geometry; if (!g) continue;
      let la = 0, lo = 0;
      if (g.type === 'Point') { lo = g.coordinates[0]; la = g.coordinates[1]; }
      else { let a = 1e9, b = -1e9, c = 1e9, e = -1e9; (function walk(x) { if (typeof x[0] === 'number') { c = Math.min(c, x[0]); e = Math.max(e, x[0]); a = Math.min(a, x[1]); b = Math.max(b, x[1]); } else x.forEach(walk); })(g.coordinates); la = (a + b) / 2; lo = (c + e) / 2; }
      const type = p['@type'] === 'way' ? 'way' : p['@type'] === 'relation' ? 'relation' : 'node';
      const tags = { ...p }; delete tags['@type']; delete tags['@id'];
      els.push({ type, id: p['@id'], lat: la, lon: lo, tags });
    }
    console.log('Geofabrik OK', els.length);
    return els.length >= 5000 ? els : null;
  } catch (e) { console.log('Geofabrik 실패', e.message); return null; }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}

function toRows(elements) {
  const big = [], local = [], conv = [], seen = {};
  for (const e of elements) {
    const t = e.tags || {};
    const la = e.lat != null ? e.lat : e.center && e.center.lat, lo = e.lon != null ? e.lon : e.center && e.center.lon;
    if (la == null || lo == null || (!t.name && !t.brand)) continue;
    const brand = L.detectBrand(t);
    let name = (/^[\x00-\x7f]+$/.test(t.name || '') && t['name:ko']) || t.name || t['name:ko'] || t.brand; // 영문 이름이면 한국어 이름 우선
    const isBig = L.BRANDS[brand] && L.BRANDS[brand].big;
    if (isBig && /^[\x00-\x7f]+$/.test(name)) name = L.BRANDS[brand].label + (t.branch ? ' ' + t.branch : ''); // 'Emart' → '이마트'
    if (BIG_SHOPS.test(t.shop) && !isBig && !(t.shop === 'wholesale' && brand === 'local' && L.isFoodWholesale(t, name))) continue; // 도매·백화점은 대형마트 브랜드만 (+ 식자재마트 같은 식품 도매)
    if (brand === 'local' && L.isNonFoodName(name)) continue; // 식료품점이 아닌 잘못 태깅된 곳 (식자재마트는 통과)
    const key = name + '|' + la.toFixed(3) + lo.toFixed(3); if (seen[key]) continue; seen[key] = 1;
    const row = [e.type[0] + e.id, +la.toFixed(5), +lo.toFixed(5), name];
    if (brand !== 'local') row.push(brand);
    (isBig ? big : brand === 'convenience' ? conv : local).push(row);
  }
  return { big, local, conv };
}
function tileOf(r) { return Math.floor(r[1] / TILE) + '_' + Math.floor(r[2] / TILE); }

async function main() {
  let els = null;
  if (process.argv[2]) { const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); els = j.elements; }
  else els = (await overpass()) || geofabrik();
  if (els && process.env.SAVE_RAW) fs.writeFileSync(process.env.SAVE_RAW, JSON.stringify({ elements: els }));
  if (!els) { console.log('마트 데이터를 못 받음 → 기존 data/marts 유지'); return; }
  const { big, local, conv } = toRows(els);
  const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const groups = { s: local, c: conv }, tiles = { s: {}, c: {} };
  const tmp = OUT + '.new'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp + '/s', { recursive: true }); fs.mkdirSync(tmp + '/c', { recursive: true });
  for (const [g, rows] of Object.entries(groups)) {
    const by = {};
    rows.forEach(r => { (by[tileOf(r)] = by[tileOf(r)] || []).push(r); });
    for (const [k, rs] of Object.entries(by)) { rs.sort((a, b) => a[0] < b[0] ? -1 : 1); fs.writeFileSync(`${tmp}/${g}/${k}.json`, JSON.stringify(rs)); tiles[g][k] = rs.length; }
  }
  big.sort((a, b) => a[0] < b[0] ? -1 : 1);
  fs.writeFileSync(tmp + '/big.json', JSON.stringify(big));
  // 지도 데이터가 그대로면 날짜만 바뀌는 커밋을 만들지 않도록 기존 날짜 유지
  const hash = require('crypto').createHash('sha1').update(JSON.stringify([big, local, conv])).digest('hex').slice(0, 12);
  let prev = null; try { prev = JSON.parse(fs.readFileSync(OUT + '/index.json', 'utf8')); } catch (e) {}
  const index = { v: 1, date: prev && prev.hash === hash ? prev.date : date, hash, tile: TILE, source: '© OpenStreetMap contributors (ODbL)',
    count: { big: big.length, s: local.length, c: conv.length }, s: tiles.s, c: tiles.c };
  fs.writeFileSync(tmp + '/index.json', JSON.stringify(index));
  fs.rmSync(OUT, { recursive: true, force: true }); fs.renameSync(tmp, OUT);
  console.log('저장', OUT, JSON.stringify(index.count), '타일', Object.keys(tiles.s).length, '+', Object.keys(tiles.c).length);
}
module.exports = { toRows, tileOf };
if (require.main === module) main().catch(e => { console.error('build_marts 오류 (기존 데이터 유지):', e); process.exit(0); });
