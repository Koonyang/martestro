// 탑마트(서원유통) — 전단이 이미지뿐이라 martmap.co.kr 이 모아 둔 전단 이미지를 받아 무료 OCR(tesseract)로 읽어요.
// 1) 전단 한 장 전체에서 품목 이름 줄(위치 포함)을 찾고, 2) 이름 바로 아래(가격이 적히는 자리)를 잘라 숫자만 다시 읽어요.
// 가격은 「1,984원」처럼 모양이 확실할 때만 넣어요(애매하면 비워 두고, update_deals 가 지난 전단·다른 마트 가격으로 어림해요).
// OCR 엔진: 1순위 RapidOCR(PaddleOCR 한국어 모델, 무료·pip) — 이름·가격 상자를 한 번에 읽어 topmart_rapid.js 가 짝지어요.
//   없으면(설치 실패) 예전 방식: npm 패키지 tesseract.js 가 있으면 그걸(로컬·CI 결과가 같음), 없으면 tesseract 명령어를 써요.
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { getJson, http, isoToKST, isFood, clean } = require('../lib');
const L = require('../../src/logic.js');
const RP = require('./topmart_rapid');
const STORE = 'topmart-21840'; // 탑마트 진주호탄점 (전단은 전 점포 공통)
const API = 'https://martmap.co.kr/api/stores/' + STORE;
const PAGE = 'https://martmap.co.kr/stores/' + STORE;

const FIX = [[/칼치/g, '갈치'], [/토미토/g, '토마토'], [/매스켓|머스켓/g, '머스캣'], [/브로컬리/g, '브로콜리'], [/삼겸/g, '삼겹'], [/삼검/g, '삼겹'], [/감글/g, '감귤'], [/고츠가루/g, '고춧가루'], [/밀치/g, '멸치'], [/필리판/g, '필리핀'], [/콰리고추/g, '꽈리고추'], [/파리고추/g, '꽈리고추']];

function tessJs() { try { return require('tesseract.js'); } catch (e) { return null; } }
function hasCli() {
  try { execFileSync(process.env.TESSERACT_BIN || 'tesseract', ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}
function hasTesseract() { return !!tessJs() || hasCli(); }
const PY = process.env.OCR_PYTHON || 'python3';
function hasRapid() { if (process.env.NO_RAPID) return false; try { execFileSync(PY, ['-c', 'import rapidocr, onnxruntime'], { stdio: 'ignore' }); return true; } catch (e) { return false; } }
// RapidOCR 로 전단 여러 장 → 장마다 [{name, price}] (이름은 cleanName 으로 다듬기 전 원문)
function readRapid(files) {
  const out = execFileSync(PY, [path.join(__dirname, '..', 'ocr_rapid.py'), ...files], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'], timeout: 15 * 60000 });
  const j = JSON.parse(out);
  return files.map(f => {
    const runs = j[f] || [], got = RP.combine(runs), seen = new Set(got.map(g => RP.KEY(g.name)));
    for (const n of RP.names(runs)) if (![...seen].some(k => RP.sim(k, RP.KEY(n)) >= 0.75)) { seen.add(RP.KEY(n)); got.push({ name: n, price: null }); }
    return got;
  });
}

// OCR 엔진 하나로 통일: recognize(file, psm) → {text, lines:[[글자, x0, y0, x1, y1]]}
async function makeEngine() {
  const T = tessJs();
  if (T) {
    const w = await T.createWorker('kor', 1, { cachePath: os.tmpdir() });
    return {
      name: 'tesseract.js',
      async recognize(file, psm) {
        await w.setParameters({ tessedit_pageseg_mode: String(psm) });
        const r = await w.recognize(file, {}, { text: true, blocks: true });
        const lines = [];
        for (const b of r.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || [])
          lines.push([l.text.trim(), l.bbox.x0, l.bbox.y0, l.bbox.x1, l.bbox.y1]);
        return { text: r.data.text, lines };
      },
      close: () => w.terminate(),
    };
  }
  const bin = process.env.TESSERACT_BIN || 'tesseract';
  return {
    name: 'tesseract-cli',
    async recognize(file, psm) {
      const tsv = execFileSync(bin, [file, 'stdout', '-l', 'kor', '--psm', String(psm), 'tsv'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
      const g = new Map();
      for (const row of tsv.split('\n').slice(1)) {
        const c = row.split('\t'); if (c.length < 12 || c[0] !== '5' || !c[11].trim()) continue;
        const k = c[2] + '.' + c[3] + '.' + c[4], x = +c[6], y = +c[7], X = x + +c[8], Y = y + +c[9];
        const o = g.get(k); if (!o) g.set(k, [c[11], x, y, X, Y]); else { o[0] += ' ' + c[11]; o[1] = Math.min(o[1], x); o[2] = Math.min(o[2], y); o[3] = Math.max(o[3], X); o[4] = Math.max(o[4], Y); }
      }
      const lines = [...g.values()];
      return { text: lines.map(l => l[0]).join('\n'), lines };
    },
    close: async () => {},
  };
}

function cleanName(line, dealIng) {
  FIX.forEach(([a, b]) => { line = line.replace(a, b); });
  const head = line.split(/[(\d@<{\[|:;!^~]/)[0];
  const name = clean(head.replace(/[^가-힣)\/·\s]/g, ' ')).replace(/^[)\/·\s]+|[\/·\s]+$/g, '');
  if (name.replace(/[^가-힣]/g, '').length < 2 || name.length > 24) return null;
  if (/류$|류[\s\/)]|할인|행사|맛$|깜|깡/.test(name)) return null; // 분류 안내·문구
  if (!dealIng(name) && !L.convOf(name)) return null; // 레시피 재료나 간편식품으로 확인되는 이름만 (OCR 잡음 제거)
  return name;
}
// 가격까지 짝지어진 이름은 재료 사전에 없어도(isFood 만 통과하면) 받아요
function cleanLoose(line) { return cleanName(line, () => true); }
function extractNames(text, dealIng) {
  return text.split('\n').map(l => cleanName(l, dealIng)).filter(Boolean);
}

// 가격 자리 OCR 글자 → 가격. 「5,984원」「4,784 원」처럼 쉼표 세 자리 + 원(또는 원을 잘못 읽은 왼·윈·월)이 있거나,
// 쉼표 세 자리 숫자가 두 번 이상 똑같이 읽혔을 때만 믿어요. 원이 숫자(8·9·0)로 읽혀 「29608」이 된 건 버려요.
const OK = p => p >= 100 && p <= 300000;
function priceFromTexts(texts) {
  const strict = [], loose = [];
  for (const t0 of texts) {
    const t = String(t0 || '').replace(/[|_~^`'"]/g, ' ');
    const m = t.match(/(?<![\d,.])(\d{1,3})\s?[,.]\s?(\d{3})\s?[원왼윈월웬완](?![\d])|(?<![\d,.])([1-9]\d{2})\s?[원왼윈웬](?![\d])/);
    if (m) { const p = m[3] ? +m[3] : +(m[1] + m[2]); if (OK(p)) strict.push(p); }
    const m2 = t.match(/(?<![\d,.])(\d{1,3})[,.](\d{3})(?![\d,.])/);
    if (m2) { const p = +(m2[1] + m2[2]); if (OK(p)) loose.push(p); }
  }
  if (strict.length) return strict[0];
  const c = {}; for (const p of loose) c[p] = (c[p] || 0) + 1;
  const best = Object.keys(c).filter(k => c[k] >= 2);
  return best.length === 1 ? +best[0] : null;
}

// 흑백·1.5배(전체) / 이름 줄 아래 가격 자리 잘라 2배 (python3 + Pillow)
function prepPage(file) {
  const out = file + '.png';
  execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("L");im=im.resize((im.width*3//2,im.height*3//2));im.save(sys.argv[2])', file, out], { stdio: 'ignore' });
  return out;
}
// 가격은 이름 바로 아래(원산지 줄 다음)에 크게 적혀요 → 높이가 다른 두 칸을 잘라 둘 다 읽어요
function priceBoxes(l) {
  const [, x0, , x1, y1] = l, h = l[4] - l[2], X = Math.max(0, x0 - h), W = Math.max((x1 - x0) * 1.3, 5 * h);
  return [3.2, 5].map(k => [X, y1, Math.round(X + W), Math.round(y1 + h * k)]);
}
function cropAll(png, boxes, dir) {
  const spec = path.join(dir, 'boxes.json'); fs.writeFileSync(spec, JSON.stringify(boxes));
  execFileSync('python3', ['-c', `import sys,json
from PIL import Image
im=Image.open(sys.argv[1]);bs=json.load(open(sys.argv[2]))
for i,b in enumerate(bs):
  c=im.crop(tuple(b));c=c.resize((c.width*2,c.height*2));c.save(sys.argv[3]+'/c%d.png'%i)`, png, spec, dir], { stdio: 'ignore' });
  return boxes.map((b, i) => path.join(dir, 'c' + i + '.png'));
}

// 전단 한 장 → [{name, price}]
async function readPage(eng, file, dealIng, dir) {
  const png = prepPage(file);
  const full = await eng.recognize(png, 11);
  const found = [];
  for (const l of full.lines) {
    const name = cleanName(l[0], dealIng);
    if (name && l[4] - l[2] >= 12) found.push({ name, line: l });
  }
  const crops = cropAll(png, found.flatMap(f => priceBoxes(f.line)), dir);
  for (let i = 0; i < found.length; i++) {
    const texts = [];
    for (const c of [crops[2 * i], crops[2 * i + 1]]) for (const psm of [6, 11]) { try { texts.push((await eng.recognize(c, psm)).text.replace(/\n/g, ' ')); } catch (e) {} }
    found[i].price = priceFromTexts(texts);
    if (process.env.OCR_DEBUG) console.error('[ocr]', found[i].name, JSON.stringify(texts), found[i].price);
  }
  return found;
}

async function run(ctx) {
  const j = await getJson(API);
  const flyers = (j.flyers || []).filter(f => f.endDate && isoToKST(f.endDate) >= ctx.today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (!flyers.length) throw new Error('탑마트: martmap 에 진행 중 전단 없음');
  const f = flyers[0];
  const prev = ctx.prevStatus || {};
  if (prev.flyerId === f.id && !process.env.FORCE_OCR) return { keep: true, msg: '같은 전단(' + f.title + ') — 기존 정리 데이터 유지' };
  const rapid = hasRapid();
  if (!rapid && !hasTesseract()) throw new Error('탑마트: 새 전단 발견(' + f.title + ')했지만 tesseract(OCR)가 없어 기존 데이터 유지');
  const start = isoToKST(f.startDate), end = isoToKST(f.endDate);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topmart-'));
  const byName = new Map(), items = [];
  const pages = (f.pages || []).sort((a, b) => a.pageOrder - b.pageOrder);
  const files = [];
  for (const p of pages) {
    const buf = Buffer.from(await (await http(p.imageUrl, { timeout: 60000 })).arrayBuffer());
    const file = path.join(dir, 'p' + p.pageOrder + '.webp'); fs.writeFileSync(file, buf); files.push(file);
  }
  let eng = null, results = null, t0 = Date.now();
  if (rapid) {
    try {
      results = readRapid(files).map(list => list.map(({ name, price }) => {
        const n = cleanName(name, ctx.dealIng); if (!n) return null;
        // 규격(500g·1kg·10입…)은 한 끼 가격 계산에 쓰여서 「이름(500g)」으로 남겨요
        const sz = (String(name).split('(').slice(1).join('(').match(/([1-9]\d*(?:\.\d+)?)\s?(kg|g|ml|L|입|개|마리|봉)(?![a-z])/i) || [])[0];
        return { name: sz ? n + '(' + sz.replace(/\s/g, '') + ')' : n, price };
      }).filter(Boolean));
      eng = { name: 'RapidOCR', close: async () => {} };
    } catch (e) { console.error('[topmart] RapidOCR 실패 → tesseract 로 대신:', e.message); results = null; }
  }
  if (!results) {
    if (!hasTesseract()) throw new Error('탑마트: RapidOCR 실패, tesseract 도 없어 기존 데이터 유지');
    eng = await makeEngine(); results = [];
    for (const file of files) { try { results.push(await readPage(eng, file, ctx.dealIng, dir)); } catch (e) { results.push([]); } }
  }
  console.error('[topmart] OCR ' + eng.name + ' ' + files.length + '장 ' + Math.round((Date.now() - t0) / 1000) + '초');
  try {
    for (let pi = 0; pi < pages.length; pi++) {
      const p = pages[pi], found = results[pi] || [];
      for (const { name, price } of found) {
        if (!(isFood(name, ctx.dealIng) || L.convOf(name))) continue;
        const had = byName.get(name) || (price == null && items.find(r => RP.sim(RP.KEY(r[0]), RP.KEY(name)) >= 0.7));
        if (had) { if (had[1] == null && price != null) { had[1] = price; had[3] = NOTE_P; } continue; }
        const row = [name, price, null, price != null ? NOTE_P : NOTE_N, start, end, null, 'topmart', p.pageOrder];
        byName.set(name, row); items.push(row);
      }
    }
  } finally { await eng.close(); }
  // 가격 없는 이름 조각(「돼지냉장」⊂「돼지냉장갈비」)은 빼요 — 엉뚱한 어림값이 붙지 않게
  for (let i = items.length - 1; i >= 0; i--) {
    const k = RP.KEY(items[i][0]);
    if (items[i][1] == null && items.some(r => r !== items[i] && RP.KEY(r[0]) !== k && RP.KEY(r[0]).includes(k))) items.splice(i, 1);
  }
  const priced = items.filter(r => r[1] != null).length;
  return {
    items, flyerId: f.id, flyerTitle: f.title, priced, engine: eng.name,
    msg: 'OCR(' + eng.name + ') 품목 ' + items.length + '개 중 가격 ' + priced + '개 판독' + (priced ? '' : ' — 가격을 하나도 못 읽었어요(전단 모양이 바뀌었는지 확인 필요)'),
    source: {
      label: '탑마트(서원유통) 「' + f.title + '」 전단 (전 점포 공통) — 이미지 자동 판독', url: PAGE, checked: ctx.today,
      period: start + '~' + end + ' (품목별 요일 한정은 전단 원본 확인)', official: false, needsCheck: true,
      note: '전단이 이미지뿐이라 무료 OCR로 품목 이름과 가격을 자동으로 읽었어요. 숫자가 확실할 때만 가격을 넣었고, 못 읽은 가격은 지난 전단·다른 마트 가격으로 어림했어요(「추정」 표시). 빠지거나 잘못 읽힌 품목이 있을 수 있어요. 원본: 서원유통 전단 뷰어 ' + (f.sourceUrl || 'https://www.seowon.com/shopping/leafletViewer/000'),
      pages: pages.map(p => p.imageUrl),
    },
  };
}
const NOTE_P = ''; // 가격을 읽은 품목은 따로 문구 없이(「가격확인」 꼬리표로 충분)
const NOTE_N = '전단 이미지 자동 판독(OCR) · 가격은 전단 원본에서 확인';
module.exports = { run, extractNames, hasTesseract, hasRapid, priceFromTexts, cleanName };
