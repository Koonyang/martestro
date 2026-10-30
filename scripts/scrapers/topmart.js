// 탑마트(서원유통) — 전단이 이미지뿐이라 martmap.co.kr 이 모아 둔 전단 이미지를 받아 무료 OCR(tesseract)로 품목 이름을 읽어요.
// 가격 숫자는 OCR 오류가 많아서 넣지 않아요(가격 확인 필요). 같은 전단이면(이미 정리된 데이터가 있으면) 그대로 둬요.
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { getJson, http, isoToKST, isFood, clean } = require('../lib');
const L = require('../../src/logic.js');
const STORE = 'topmart-21840'; // 탑마트 진주호탄점 (전단은 전 점포 공통)
const API = 'https://martmap.co.kr/api/stores/' + STORE;
const PAGE = 'https://martmap.co.kr/stores/' + STORE;

const FIX = [[/칼치/g, '갈치'], [/토미토/g, '토마토'], [/매스켓|머스켓/g, '머스캣'], [/브로컬리/g, '브로콜리'], [/삼겸/g, '삼겹']];

function hasTesseract() {
  try { execFileSync(process.env.TESSERACT_BIN || 'tesseract', ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}
function ocrImage(file) {
  // 선택: python3 + Pillow 가 있으면 흑백·1.5배 확대해서 인식률을 올림
  let input = file;
  try {
    const out = file + '.png';
    execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("L");im=im.resize((im.width*3//2,im.height*3//2));im.save(sys.argv[2])', file, out], { stdio: 'ignore' });
    input = out;
  } catch (e) { /* Pillow 없으면 원본 그대로 */ }
  return execFileSync(process.env.TESSERACT_BIN || 'tesseract', [input, 'stdout', '-l', 'kor', '--psm', '11'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
}
function extractNames(text, dealIng) {
  const out = [];
  for (let line of text.split('\n')) {
    FIX.forEach(([a, b]) => { line = line.replace(a, b); });
    const head = line.split(/[(\d@<{\[|:;!^~]/)[0];
    const name = clean(head.replace(/[^가-힣)\/·\s]/g, ' ')).replace(/^[)\/·\s]+|[\/·\s]+$/g, '');
    if (name.replace(/[^가-힣]/g, '').length < 2 || name.length > 24) continue;
    if (/류$|류[\s\/)]|할인|행사|맛$|깜|깡/.test(name)) continue; // 분류 안내·문구
    if (!dealIng(name) && !L.convOf(name)) continue; // 레시피 재료나 간편식품(라면·햄·만두 등)으로 확인되는 이름만 (OCR 잡음 제거)
    out.push(name);
  }
  return out;
}

async function run(ctx) {
  const j = await getJson(API);
  const flyers = (j.flyers || []).filter(f => f.endDate && isoToKST(f.endDate) >= ctx.today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (!flyers.length) throw new Error('탑마트: martmap 에 진행 중 전단 없음');
  const f = flyers[0];
  const prev = ctx.prevStatus || {};
  if (prev.flyerId === f.id) return { keep: true, msg: '같은 전단(' + f.title + ') — 기존 정리 데이터 유지' };
  if (!hasTesseract()) throw new Error('탑마트: 새 전단 발견(' + f.title + ')했지만 tesseract(OCR)가 없어 기존 데이터 유지');
  const start = isoToKST(f.startDate), end = isoToKST(f.endDate);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topmart-'));
  const seen = new Set(), items = [];
  const pages = (f.pages || []).sort((a, b) => a.pageOrder - b.pageOrder);
  for (const p of pages) {
    const buf = Buffer.from(await (await http(p.imageUrl, { timeout: 60000 })).arrayBuffer());
    const file = path.join(dir, 'p' + p.pageOrder + '.webp'); fs.writeFileSync(file, buf);
    let text = '';
    try { text = ocrImage(file); } catch (e) { continue; }
    for (const name of extractNames(text, ctx.dealIng)) {
      if (seen.has(name) || !(isFood(name, ctx.dealIng) || L.convOf(name))) continue; seen.add(name);
      items.push([name, null, null, '전단 이미지 자동 판독(OCR) · 가격은 전단 원본에서 확인', start, end, null, 'topmart', p.pageOrder]);
    }
  }
  return {
    items, flyerId: f.id, flyerTitle: f.title,
    source: {
      label: '탑마트(서원유통) 「' + f.title + '」 전단 (전 점포 공통) — 이미지 자동 판독', url: PAGE, checked: ctx.today,
      period: start + '~' + end + ' (품목별 요일 한정은 전단 원본 확인)', official: false, needsCheck: true,
      note: '전단이 이미지뿐이라 무료 OCR로 품목 이름만 자동으로 읽었어요. 가격은 넣지 않았고(오독 위험), 빠지거나 잘못 읽힌 품목이 있을 수 있어요. 원본: 서원유통 전단 뷰어 ' + (f.sourceUrl || 'https://www.seowon.com/shopping/leafletViewer/000'),
      pages: pages.map(p => p.imageUrl),
    },
  };
}
module.exports = { run, extractNames, hasTesseract };
