// 브라우저 확인(선택): npm i puppeteer-core 후 CHROME=/usr/bin/google-chrome node test/browser/smoke.js [BASE_URL]
// BASE_URL 없으면 이 폴더를 로컬 서버로 띄워서 검사해요. 휴대폰 화면 크기, 한국시간 2026-10-30 고정.
const puppeteer = require('puppeteer-core'); const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = process.env.SITE || path.join(__dirname, '..', '..');
(async () => {
  let base = process.argv[2], srv;
  if (!base) { srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
      fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, {'Content-Type': f.endsWith('.json') ? 'application/json' : f.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8'}); s.end(b); }); });
    await new Promise(r => srv.listen(0, r)); base = 'http://127.0.0.1:' + srv.address().port + '/'; }
  const op = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'op_jinju.json'))); // 실시간 검색 대체용(가짜 응답)
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'deals.json')));
  const fake = process.env.FAKE_UPDATE ? { ...live, updated: '2099-01-01T05:00:00+09:00', deals: { ...live.deals, emart: [['테스트용 국산 애호박', 990, 1990, '테스트', '2026-10-30', '2026-11-05', null, 'emart', 1], ...live.deals.emart] } } : null;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  await b.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await p.emulateTimezone('Asia/Seoul');
  await p.evaluateOnNewDocument(() => { const RD = Date, off = new RD('2026-10-30T12:00:00+09:00').getTime() - RD.now();
    class FD extends RD { constructor(...a) { if (a.length === 0) super(RD.now() + off); else super(...a); } static now() { return RD.now() + off; } } window.Date = FD; });
  let overpassReq = 0; const LIVE = !!process.env.LIVE;
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url();
    if (u.includes('nominatim.openstreetmap.org')) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(/%EC%84%9C%EC%9A%B8|seoul/i.test(u) ? [{ lat: '37.5663', lon: '126.9779', display_name: '서울특별시청, 세종대로, 중구' }] : [{ lat: '35.1617518', lon: '128.1153464', display_name: '호탄동, 진주시, 경상남도' }]) });
    if (u.includes('interpreter')) { overpassReq++; if (LIVE) return r.continue(); return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(op) }); }
    if ((LIVE || process.env.FALLBACK) && u.includes('data/marts/')) return r.respond({ status: 404, body: '' });
    if (fake && u.includes('data/deals.json')) return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fake) });
    if (u.startsWith(base)) return r.continue();
    r.abort(); });
  await p.goto(base, { waitUntil: 'networkidle0' });
  console.log('title:', await p.title());
  console.log('header:', await p.$eval('header', e => e.innerText.replace(/\s+/g, ' ')));
  const foot = await p.$eval('.site-foot', e => e.innerText.replace(/\s+/g, ' ').trim()); console.log('footer:', foot);
  if (/갱신/.test(await p.$eval('header', e => e.innerText)) || !/\d+\/\d+ \d\d:\d\d 전단 갱신/.test(foot) || !/출처·데이터 정보/.test(foot)) throw new Error('갱신 시각/출처 링크는 페이지 맨 아래에 있어야 해요');
  // 마트 검색 속도: 서울시청·진주 호탄동 × 2/3/5km
  async function search(fn) {
    await p.$eval('#locStatus', e => { e.textContent = ''; });
    const t = Date.now(); await fn();
    await p.waitForFunction(() => /찾았어요|못 가져왔어요/.test(document.getElementById('locStatus').innerText), { timeout: 90000 });
    return Date.now() - t;
  }
  // 위치 지정: 「현재 위치로 찾기」 버튼 + 가짜 GPS 좌표 (빠른 선택 프리셋은 없어졌어요)
  const PLACES = { '서울 시청': [37.5663, 126.9779], '진주 호탄동': [35.1617518, 128.1153464] };
  // 주소 입력 검색(Nominatim 가짜 응답) — 브라우저가 GPS 위치를 캐시해서 장소 바꾸기는 주소로
  async function useAddr(place) { await p.$eval('#addr', e => { e.value = ''; }); await p.type('#addr', place); await p.click('#btnAddr'); }
  async function useGeo(place) { const [latitude, longitude] = PLACES[place]; await p.setGeolocation({ latitude, longitude }); await p.click('#btnGeo'); }
  if (await p.$('#presets')) throw new Error('빠른 위치 설정 줄이 아직 있어요');
  // 「위치 없이 전단만 보기」는 위치 없이도 동작해야 해요
  const noLocChips = await p.$$eval('#brandChips button', bs => bs.map(x => x.innerText.trim()));
  if (!noLocChips.some(t => t.includes('이마트'))) throw new Error('위치 없이 전단만 보기 버튼 없음');
  await p.$$eval('#brandChips button', bs => bs.find(x => x.innerText.includes('이마트')).click());
  await p.click('nav button[data-tab="tab-deals"]'); const noLocDeals = await p.$eval('#dealSummary', e => e.innerText.replace(/\s+/g, ' '));
  console.log('no-location deals:', noLocDeals.slice(0, 60)); if (!/이마트/.test(noLocDeals)) throw new Error('위치 없이 이마트 전단 안 보임');
  await p.$$eval('#brandChips button', bs => bs.find(x => x.innerText.includes('이마트')).click());
  await p.click('nav button[data-tab="tab-loc"]');
  // 새 위치가 정해지면 마트 목록으로 자동 스크롤되는지 (반경 변경 때는 안 움직임)
  const listTop = () => p.evaluate(() => { const c = document.getElementById('martList').closest('.card'); return { y: scrollY, top: Math.round(c.getBoundingClientRect().top), hdr: Math.round(document.getElementById('top').getBoundingClientRect().height) }; });
  const settle = () => p.waitForFunction(() => { const y = scrollY; return new Promise(r => setTimeout(() => r(scrollY === y), 250)); }, { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => scrollTo(0, 0));
  await search(() => useGeo('진주 호탄동')); await new Promise(r => setTimeout(r, 300)); await settle();
  let sc = await listTop(); console.log('autoscroll(geo):', sc);
  if (!(sc.y > 0 && sc.top >= sc.hdr && sc.top <= sc.hdr + 30)) throw new Error('현재 위치 지정 후 마트 목록으로 스크롤 안 됨');
  await p.evaluate(() => scrollTo(0, 0));
  await search(() => p.select('#radius', '3')); await new Promise(r => setTimeout(r, 700));
  if ((await listTop()).y !== 0) throw new Error('반경 변경인데 스크롤됨');
  await p.select('#radius', '2'); await new Promise(r => setTimeout(r, 1200));
  await p.evaluate(() => scrollTo(0, 0)); await p.$eval('#addr', e => { e.value = ''; }); await p.type('#addr', '진주 호탄동');
  await search(() => p.click('#btnAddr')); await new Promise(r => setTimeout(r, 300)); await settle();
  sc = await listTop(); console.log('autoscroll(address):', sc);
  if (!(sc.y > 0 && sc.top >= sc.hdr && sc.top <= sc.hdr + 30)) throw new Error('주소 검색 후 마트 목록으로 스크롤 안 됨');
  for (const place of ['서울 시청', '진주 호탄동']) {
    for (const km of ['2', '3', '5']) {
      if (km === '2') { await p.select('#radius', '2'); await new Promise(r => setTimeout(r, 1500)); }
      const ms = await search(async () => { if (km === '2') await useAddr(place); else await p.select('#radius', km); });
      const info = await p.evaluate(() => ({ st: document.getElementById('locStatus').innerText, tiles: window.__lastMartTiles, n: document.querySelectorAll('#martList .mart').length,
        top: [...document.querySelectorAll('#martList .mart')].filter(e => /탑마트|이마트|홈플러스|롯데마트/.test(e.innerText)).slice(0, 4).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 40)) }));
      console.log(`${place} ${km}km: ${ms}ms · ${info.st.replace(/\s+/g, ' ')} · 타일 ${info.tiles} · 목록 ${info.n} · ${info.top.join(' | ')}`);
    }
  }
  console.log('overpass requests:', overpassReq);
  await p.select('#radius', '2');
  await search(() => useAddr('진주 호탄동'));
  if (!(await p.$('input[data-id="node/4655465094"]'))) throw new Error('탑마트 호탄점 없음');
  await p.$$eval('#martList input:checked', els => els.forEach(e => { if (e.dataset.id !== 'node/4655465094') e.click(); }));
  if (!(await p.$eval('input[data-id="node/4655465094"]', e => e.checked))) await p.$eval('input[data-id="node/4655465094"]', e => e.click());
  // 플로팅 「할인 식재료 확인 · N곳」 버튼: 선택 1곳 이상 + 위치·마트 탭일 때만, 누르면 할인 재료 탭 맨 위로
  await new Promise(r => setTimeout(r, 500));
  const fab = await p.$eval('#fab', e => ({ show: e.classList.contains('show'), txt: e.innerText.replace(/\s+/g, ' ').trim(), bottom: Math.round(e.getBoundingClientRect().bottom), navTop: Math.round(document.querySelector('nav').getBoundingClientRect().top) }));
  console.log('fab:', fab);
  if (!fab.show || !/할인 식재료 확인 · 1곳/.test(fab.txt) || fab.bottom > fab.navTop) throw new Error('플로팅 버튼 표시/위치 이상');
  await p.screenshot({ path: '/tmp/martestro_fab.png' });
  // 마지막 마트 줄이 버튼에 가리지 않는지 (맨 아래로 스크롤)
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await new Promise(r => setTimeout(r, 300));
  const cover = await p.evaluate(() => { const cs = document.querySelectorAll('#tab-loc .card'), last = cs[cs.length - 1].getBoundingClientRect(), f = document.getElementById('fab').getBoundingClientRect(); return { lastBottom: Math.round(last.bottom), fabTop: Math.round(f.top) }; });
  console.log('fab vs last row:', cover); if (cover.lastBottom > cover.fabTop) throw new Error('버튼이 마지막 마트를 가려요');
  await p.click('#fab'); await new Promise(r => setTimeout(r, 400));
  const after = await p.evaluate(() => ({ tab: document.querySelector('section.tab.on').id, y: scrollY, fab: document.getElementById('fab').classList.contains('show') }));
  console.log('fab click:', after); if (after.tab !== 'tab-deals' || after.y !== 0 || after.fab) throw new Error('버튼 눌러도 할인 재료 탭으로 안 감');
  await p.click('nav button[data-tab="tab-loc"]'); await new Promise(r => setTimeout(r, 300));
  await p.$$eval('#martList input:checked', els => els.forEach(e => e.click())); await new Promise(r => setTimeout(r, 500));
  if (await p.$eval('#fab', e => e.classList.contains('show'))) throw new Error('0곳인데 버튼이 보여요');
  await p.$eval('input[data-id="node/4655465094"]', e => e.click()); await new Promise(r => setTimeout(r, 300));
  await p.click('nav button[data-tab="tab-deals"]');
  console.log('deals:', await p.$eval('#dealSummary', e => e.innerText.replace(/\s+/g, ' ')));
  await p.screenshot({ path: '/tmp/martestro_deals.png' });
  await p.click('nav button[data-tab="tab-recipes"]');
  console.log('top5:', await p.$$eval('.recipe h3', els => els.slice(0, 5).map(e => e.innerText)));
  const gauges = await p.$$eval('.recipe .gauge', gs => gs.slice(0, 3).map(g => g.getAttribute('aria-label')));
  console.log('gauges:', gauges);
  if (!gauges.length || !gauges.every(t => /^예상 절약률 \d+%: 원가 [\d,]+원 → [\d,]+원 · \d+% 절약$/.test(t))) throw new Error('절약률 게이지 없음/형식 오류');
  if (await p.$('.recipe .save')) throw new Error('예전 절약 알약이 남아 있어요');
  // 범례 줄은 없어지고, 「가격확인」「주재료」 태그를 누르면 뜻이 말풍선으로 떠요 (하나만, 바깥/다시 누름/ESC/스크롤로 닫힘)
  if (await p.$('.legend')) throw new Error('레시피 카드 범례가 아직 있어요');
  const tipState = () => p.evaluate(() => { const t = document.getElementById('tipPop'); if (!t || t.hidden) return null; const r = t.getBoundingClientRect(); return { text: t.innerText, left: Math.round(r.left), right: Math.round(r.right), vw: document.documentElement.clientWidth, open: document.querySelectorAll('button.tipb[aria-expanded=true]').length }; });
  const chkSel = '.recipe button.tipb[data-tip="chk"]', mainSel = '.recipe button.tipb[data-tip="main"]';
  await p.$eval(chkSel, e => e.scrollIntoView({ block: 'center' })); await new Promise(r => setTimeout(r, 200));
  const before = await p.$eval(chkSel, e => e.closest('.recipe').querySelector('details') ? e.closest('.recipe').querySelector('details').open : null);
  await p.click(chkSel); let tp = await tipState(); console.log('tip(chk):', tp);
  if (!tp || !/매장에서 한 번 확인/.test(tp.text) || tp.left < 0 || tp.right > tp.vw || tp.open !== 1) throw new Error('가격확인 말풍선 이상');
  if (await p.$eval(chkSel, e => e.getAttribute('aria-describedby')) !== 'tipPop' || await p.$eval('#tipPop', e => e.getAttribute('role')) !== 'tooltip') throw new Error('말풍선 접근성 속성 이상');
  const afterD = await p.$eval(chkSel, e => e.closest('.recipe').querySelector('details') ? e.closest('.recipe').querySelector('details').open : null);
  if (before !== afterD) throw new Error('태그 눌렀는데 카드가 펼쳐짐');
  await p.click(chkSel); if (await tipState()) throw new Error('다시 눌러도 안 닫힘');
  await p.click(mainSel); tp = await tipState(); console.log('tip(main):', tp && tp.text);
  if (!tp || !/핵심 재료/.test(tp.text)) throw new Error('주재료 말풍선 이상');
  await p.click(chkSel); tp = await tipState(); if (!tp || tp.open !== 1 || !/가격/.test(tp.text)) throw new Error('말풍선이 하나만 떠야 해요');
  await p.keyboard.press('Escape'); if (await tipState()) throw new Error('ESC로 안 닫힘');
  if (await p.evaluate(() => document.activeElement && document.activeElement.matches('button.tipb'))) {} else throw new Error('ESC 후 포커스가 태그로 안 돌아옴');
  await p.keyboard.press('Enter'); if (!(await tipState())) throw new Error('키보드(Enter)로 안 열림');
  await p.mouse.click(195, 120); if (await tipState()) throw new Error('바깥 눌러도 안 닫힘');
  await p.click(chkSel); await p.evaluate(() => scrollBy(0, 60)); await new Promise(r => setTimeout(r, 150)); if (await tipState()) throw new Error('스크롤해도 안 닫힘');
  // 마트 목록의 「전단 판독 · 가격확인」 태그는 눌러도 마트 체크가 안 바뀌어야 해요
  await p.click('nav button[data-tab="tab-loc"]');
  const mt = await p.$('#martList button.tipb'); if (mt) { await mt.evaluate(e => e.scrollIntoView({ block: 'center' })); const id = await mt.evaluate(e => e.closest('.mart').querySelector('input').dataset.id); const c0 = await p.$eval(`input[data-id="${id}"]`, e => e.checked);
    await mt.click(); const tm = await tipState(); const c1 = await p.$eval(`input[data-id="${id}"]`, e => e.checked); console.log('tip(mart):', tm && tm.text, 'checked same:', c0 === c1);
    if (!tm || c0 !== c1) throw new Error('마트 줄 가격확인 태그가 체크를 바꿈'); await p.keyboard.press('Escape'); }
  await p.click('nav button[data-tab="tab-recipes"]');
  // 칩 가격 옆 매장 이름은 기본 숨김, 카드별 「표시 가격 기준」 밑줄 텍스트로 켜고 끄기 (카드 펼침은 그대로)
  const mnState = () => p.$eval('#recipeList .recipe', c => ({ chip: c.querySelector('.ing.hit small').innerText, mnVis: [...c.querySelectorAll('.mn')].filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none').length, mn: c.querySelectorAll('.mn').length, pressed: c.querySelector('.mn-toggle').getAttribute('aria-pressed'), open: c.querySelector('details') ? c.querySelector('details').open : null, other: c.nextElementSibling && c.nextElementSibling.classList.contains('show-mn') }));
  let ms = await mnState(); console.log('mn default:', ms);
  if (ms.mnVis !== 0 || ms.mn < 1 || ms.pressed !== 'false' || /이마트|탑마트|홈플러스|롯데마트/.test(ms.chip)) throw new Error('기본으로 매장 이름이 보여요');
  await p.$eval('#recipeList .recipe .mn-toggle', e => e.scrollIntoView({ block: 'center' })); await p.click('#recipeList .recipe .mn-toggle');
  let ms2 = await mnState(); console.log('mn on:', ms2);
  if (ms2.mnVis !== ms2.mn || ms2.pressed !== 'true' || !/마트/.test(ms2.chip) || ms2.open !== ms.open || ms2.other) throw new Error('표시 가격 기준 켜기 이상');
  await p.focus('#recipeList .recipe .mn-toggle'); await p.keyboard.press('Enter'); ms2 = await mnState();
  if (ms2.mnVis !== 0 || ms2.pressed !== 'false') throw new Error('키보드로 끄기 이상');
  await p.click('nav button[data-tab="tab-loc"]');
  await p.$$eval('#brandChips button', bs => { const e = bs.find(x => x.innerText.includes('이마트')); e && e.click(); });
  await p.click('nav button[data-tab="tab-deals"]');
  if (fake) console.log('fake update shown:', await p.evaluate(() => document.body.innerText.includes('테스트용 국산 애호박')));
  // 간편식품 묶음 (이마트 전단: 라면·만두·햄·참치·즉석밥 …)
  const conv = await p.$$eval('.ing-h', hs => { const h = hs.find(x => x.innerText.startsWith('간편식품')); if (!h) return null; const rows = []; let n = h.nextElementSibling; while (n && n.classList.contains('deal')) { rows.push(n.querySelector('.tag.conv') && n.querySelector('.tag.conv').innerText); n = n.nextElementSibling; } return { head: h.innerText.replace(/\s+/g, ' '), kinds: [...new Set(rows)] }; });
  console.log('deals 간편식품:', conv); if (!conv || conv.kinds.length < 4) throw new Error('할인 재료 탭에 간편식품 묶음이 없어요');
  // 레시피 종류 칩: 전체 ↔ 자취생/간편식품(여러 개, 합집합), 마지막 칩 끄면 전체
  await p.click('nav button[data-tab="tab-recipes"]'); await new Promise(r => setTimeout(r, 300));
  const chips = () => p.$$eval('.kchip', bs => bs.map(b => b.getAttribute('data-kind') + ':' + b.getAttribute('aria-pressed') + ':' + b.querySelector('.kc').innerText));
  const nCards = () => p.$$eval('#recipeList .recipe', e => e.length);
  const sum = () => p.$eval('#recipeSummary', e => e.innerText.replace(/\s+/g, ' '));
  let ch = await chips(); console.log('chips:', ch); if (!/^:true:/.test(ch[0]) || !/^jachi:false:\d/.test(ch[1]) || !/^quick:false:\d/.test(ch[2])) throw new Error('칩 기본 상태 이상');
  const cnt = ch.map(x => +x.split(':')[2].replace(/,/g, ''));
  if (!(cnt[1] > 3 && cnt[2] > 3 && cnt[1] < cnt[0] && cnt[2] < cnt[0])) throw new Error('칩 개수 이상 ' + cnt);
  await p.click('.kchip[data-kind="quick"]'); ch = await chips(); console.log('quick:', ch, await sum());
  if (!/^:false/.test(ch[0]) || !/^quick:true/.test(ch[2])) throw new Error('간편식품 칩 상태 이상');
  if (await nCards() !== Math.min(30, cnt[2])) throw new Error('간편식품 카드 수 ' + await nCards() + ' != ' + cnt[2]);
  const qNames = await p.$$eval('#recipeList .recipe h3', e => e.slice(0, 5).map(x => x.innerText)); console.log('quick top5:', qNames);
  await p.click('.kchip[data-kind="jachi"]'); ch = await chips(); console.log('both:', ch, await sum());
  const both = +((await sum()).match(/자취생·간편식품 ([\d,]+)개/) || [0, '0'])[1].replace(/,/g, '');
  if (!/^jachi:true/.test(ch[1]) || !/^quick:true/.test(ch[2]) || !(both >= Math.max(cnt[1], cnt[2]) && both <= cnt[1] + cnt[2])) throw new Error('합집합 이상 ' + both);
  if (cnt[2] > 30 || cnt[1] > 30) { const m0 = await p.$eval('#btnMore', b => b.innerText); await p.click('#btnMore'); await new Promise(r => setTimeout(r, 300)); console.log('more:', m0, '→', await nCards()); if (await nCards() !== Math.min(60, both)) throw new Error('더 보기 필터 이상'); }
  await p.click('.kchip[data-kind="quick"]'); await p.click('.kchip[data-kind="jachi"]'); ch = await chips(); console.log('fallback:', ch);
  if (!/^:true/.test(ch[0]) || /true/.test(ch[1] + ch[2])) throw new Error('마지막 칩 끄면 전체로 안 돌아감');
  await p.click('.kchip[data-kind="jachi"]'); await p.click('.kchip[data-kind=""]'); ch = await chips(); if (!/^:true/.test(ch[0]) || /true/.test(ch[1])) throw new Error('전체 눌러도 다른 칩이 안 꺼짐');
  if (await nCards() !== Math.min(30, cnt[0])) throw new Error('전체 복귀 후 카드 수 이상');
  if (await p.$('nav button[data-tab="tab-info"]')) throw new Error('출처 탭이 아직 메뉴에 있어요');
  console.log('nav:', await p.$$eval('nav button', bs => bs.map(b => b.innerText.trim()).join(' | ')));
  await p.click('#btnSrc'); await p.waitForFunction(() => document.getElementById('srcSheet').open, { timeout: 5000 });
  console.log('info:', await p.$eval('#dataInfo', e => e.innerText.replace(/\s+/g, ' ')));
  await p.screenshot({ path: '/tmp/martestro_info.png' });
  await p.click('#srcClose'); await new Promise(r => setTimeout(r, 200));
  if (await p.$eval('#srcSheet', d => d.open)) throw new Error('출처 시트가 안 닫혀요');
  console.log('errors:', errs);
  await b.close(); if (srv) srv.close();
  if (errs.filter(e => !/404|Failed to load resource/.test(e)).length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
