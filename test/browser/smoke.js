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
  // 첫 방문: 저장된 게 없으면 위치·마트 설정 화면이 바로 열려요. 하단 탭은 「할인 재료 | 레시피 추천」 두 개
  const openSetup = async () => { if (!(await p.evaluate(() => document.body.classList.contains('setup')))) { await p.click('#btnSetup'); await new Promise(r => setTimeout(r, 200)); } };
  const navState = () => p.evaluate(() => ({ setup: document.body.classList.contains('setup'), on: (document.querySelector('section.tab.on') || {}).id, nav: [...document.querySelectorAll('nav button')].map(b => b.innerText.trim()).join(' | '), exp: document.getElementById('btnSetup').getAttribute('aria-expanded'), label: document.getElementById('btnSetup').getAttribute('aria-label'), loc: document.getElementById('locName').textContent }));
  { const n0 = await navState(); console.log('first visit:', n0);
    if (!n0.setup || n0.on !== 'tab-loc' || n0.nav !== '할인 재료 | 레시피 추천' || n0.exp !== 'true' || n0.label !== '위치·마트 설정 닫기') throw new Error('첫 방문 설정 화면 이상 ' + JSON.stringify(n0)); }
  // 첫 화면 문구
  { const hero = await p.evaluate(() => { const h = document.querySelector('.hero'); return { h1: h.querySelector('h1').textContent, em: (h.querySelector('h1 em') || {}).textContent, sub: h.querySelector('.sub').textContent, eyebrow: !!h.querySelector('.eyebrow') || /MAESTRO/.test(h.textContent), title: document.title }; });
    if (hero.h1 !== '오늘의 요리 지휘자' || hero.em !== '요리 지휘자' || hero.sub !== '동네 마트 재료로 찬거리를 골라드려요.' || hero.eyebrow || /할인 재료를 지휘하는/.test(hero.title)) throw new Error('첫 화면 문구 이상 ' + JSON.stringify(hero)); }
  // 「위치 설정 없이 대형마트 정보 확인」은 위치 없이도 동작해야 해요
  const noLocChips = await p.$$eval('#brandChips button', bs => bs.map(x => x.innerText.trim()));
  if (!noLocChips.some(t => t.includes('이마트'))) throw new Error('위치 설정 없이 대형마트 정보 확인 버튼 없음');
  if (noLocChips.some(t => /전단/.test(t)) || !noLocChips.includes('이마트')) throw new Error('마트 버튼은 마트 이름만: ' + noLocChips.join(','));
  const noLocTitle = await p.$eval('#brandChips', e => e.closest('.card').querySelector('h2').innerText.trim());
  if (noLocTitle !== '위치 설정 없이 대형마트 정보 확인') throw new Error('섹션 이름: ' + noLocTitle);
  if (/위치 없이 전단만 보기/.test(await p.$eval('body', e => e.innerHTML))) throw new Error('옛 섹션 이름이 남아 있어요');
  await p.$$eval('#brandChips button', bs => bs.find(x => x.innerText.includes('이마트')).click());
  await p.click('nav button[data-tab="tab-deals"]'); const noLocDeals = await p.$eval('#dealList', e => e.innerText.replace(/\s+/g, ' '));
  console.log('no-location deals:', noLocDeals.slice(0, 60)); if (!(await p.$$eval('#dealList .deal', x => x.length))) throw new Error('위치 없이 이마트 전단 안 보임');
  if (/전국 전단|공통 전단/.test(noLocDeals)) throw new Error('요약에 (전국 전단) 남음: ' + noLocDeals.slice(0, 80));
  await p.$$eval('#brandChips button', bs => bs.find(x => x.innerText.includes('이마트')).click());
  await openSetup();
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
  const after = await p.evaluate(() => ({ tab: document.querySelector('section.tab.on').id, y: scrollY, fab: document.getElementById('fab').classList.contains('show'), setup: document.body.classList.contains('setup') }));
  console.log('fab click:', after); if (after.tab !== 'tab-deals' || after.y !== 0 || after.fab || after.setup) throw new Error('버튼 눌러도 할인 재료 탭으로 안 감');
  await openSetup(); await new Promise(r => setTimeout(r, 300));
  await p.$$eval('#martList input:checked', els => els.forEach(e => e.click())); await new Promise(r => setTimeout(r, 500));
  if (await p.$eval('#fab', e => e.classList.contains('show'))) throw new Error('0곳인데 버튼이 보여요');
  await p.$eval('input[data-id="node/4655465094"]', e => e.click()); await new Promise(r => setTimeout(r, 300));
  await p.click('nav button[data-tab="tab-deals"]');
  console.log('deals:', await p.$eval('#dealSummary', e => e.innerText.replace(/\s+/g, ' ')));
  if (await p.$('#tab-deals .notice') || /가격확인 표시|눈으로 읽어 옮겼어요/.test(await p.$eval('#tab-deals', e => e.innerText))) throw new Error('할인 재료 탭에 가격확인 안내 상자가 남아 있어요');
  if (await p.$('.legend')) throw new Error('범례가 남아 있어요');
  // 할인 품목 줄의 가격확인 말풍선도 같은 문구, 줄 선택은 안 바뀜
  if (await p.$('#dealList button.tipb[data-tip="chk"]')) {
    await p.$eval('#dealList button.tipb[data-tip="chk"]', e => e.scrollIntoView({ block: 'center' }));
    const before = await p.$$eval('#dealList .deal.picked', x => x.length);
    await p.click('#dealList button.tipb[data-tip="chk"]');
    const tt = await p.evaluate(() => { const t = document.getElementById('tipPop'); const r = t.getBoundingClientRect(); return !t.hidden && { text: t.innerText, w: r.width, l: r.left, r: r.right, vw: innerWidth }; });
    console.log('deal tip:', tt);
    if (!tt || !tt.text.includes('가게 전단 이미지를 AI 인식 기능으로 읽어들인 정보에요. 정확하지 않을 수 있으니 가게에서 직접 확인이 필요해요.') || tt.l < 0 || tt.r > tt.vw) throw new Error('할인 품목 가격확인 말풍선 문구 이상');
    if (await p.$$eval('#dealList .deal.picked', x => x.length) !== before) throw new Error('말풍선 태그가 줄 선택을 바꿈');
    await p.keyboard.press('Escape');
  }
  // 보기 필터 = 「‹ 전체 ›」 화살표 (전체 → 오늘 할인 → 곧 할인 → 전체)
  // 할인 재료 탭 위쪽: 검색줄은 카드 밖·헤더 밑 sticky, 「마트 · 날짜 기준」 줄 없음, 통계 타일은 카드 없이 바탕에, 정렬 줄은 목록 카드 맨 위
  {
    const lay = () => p.evaluate(() => { const ds = document.getElementById('dSticky'), hd = document.getElementById('top'), sum = document.querySelector('#dealSummary .dfsw');
      return { inCard: !!ds.closest('.card'), sumInCard: !!sum.closest('.card'), sortInCard: !!document.getElementById('dSortBar').closest('.card'), pos: getComputedStyle(ds).position,
        dsTop: Math.round(ds.getBoundingClientRect().top), hdB: Math.round(hd.getBoundingClientRect().bottom), stuck: ds.classList.contains('stuck'), dateLine: /기준/.test(document.getElementById('dealSummary').innerText) || !!document.querySelector('.sel-marts'),
        firstChild: ds.parentElement.firstElementChild === ds, hc: hd.className, sy: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight }; });
    await p.evaluate(() => scrollTo(0, 0)); await new Promise(r => setTimeout(r, 200));
    const l0 = await lay(); await p.evaluate(() => { scrollTo(0, 900); }); await new Promise(r => setTimeout(r, 300)); const l1 = await lay(); await p.evaluate(() => scrollTo(0, 0)); await new Promise(r => setTimeout(r, 150));
    console.log('deals top layout:', JSON.stringify(l0), 'scrolled', JSON.stringify(l1));
    if (l0.inCard || l0.sumInCard || !l0.sortInCard || l0.pos !== 'sticky' || l0.dateLine || !l0.firstChild || l0.stuck) throw new Error('할인 재료 위쪽 배치 이상');
    { const g = await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), sb = r('#dealSearch'), hd = r('.dhead'), sw = r('.dhead .dfsw'), pg = r('.dhead .page-h'), cd = r('.dlist-card'), top = Math.min(sw.top, pg.top), bot = Math.max(sw.bottom, pg.bottom), bar = document.querySelector('.dfdots i.on'), dot = document.querySelector('.dfdots i:not(.on)'), b = bar && bar.getBoundingClientRect(), d = dot && dot.getBoundingClientRect();
        return { sbB: sb.bottom, cardT: cd.top, above: top - sb.bottom, below: cd.top - bot, vmid: Math.abs((sw.top + sw.bottom) - (pg.top + pg.bottom)) / 2, bar: b ? [Math.round(b.width), Math.round(b.height)] : null, mid: b && d ? Math.abs((b.top + b.bottom) - (d.top + d.bottom)) / 2 : 0 }; });
      console.log('deals header gaps:', g);
      if (Math.abs(g.above - 37.5) > 0.6 || Math.abs(g.below - 37.5) > 0.6 || Math.abs(g.above - g.below) > 1 || g.vmid > 1 || (g.bar && (g.bar[0] !== 10 || g.bar[1] !== 3)) || g.mid > 0.6) throw new Error('할인 재료 머리말 여백·쪽 표시 막대 이상 ' + JSON.stringify(g)); }
    if (Math.abs(l1.dsTop - l1.hdB) > 1 || !l1.stuck) throw new Error('스크롤해도 검색줄이 헤더 밑에 붙어 있어야 해요');
  }
  const dfState = () => p.evaluate(() => { const sw = document.querySelector('#dealSummary .dfsw'), ks = ['all', 'today', 'soon'], ns = sw.dataset.n.split(',').map(Number);
    return { cur: sw.dataset.cur || 'all', name: sw.querySelector('.dfn').textContent, cnt: parseInt(sw.querySelector('.dfc').textContent), boxes: document.querySelectorAll('#dealSummary .stat, #dealSummary .sum').length,
      arrows: [...sw.querySelectorAll('.dfa')].filter(b => !b.hidden).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), dots: [...sw.querySelectorAll('.dfdots i')].map(e => e.classList.contains('on') ? Math.round(e.getBoundingClientRect().width) : -Math.round(e.getBoundingClientRect().width)),
      n: Object.fromEntries(ns.map((v, i) => [ks[i], v])), rows: document.querySelectorAll('#dealList .deal').length, up: document.querySelectorAll('#dealList .deal .tag.soon').length,
      foc: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.step : null }; });
  const dfStep = async d => { await p.click(`#dealSummary .dfa[data-step="${d}"]`); await new Promise(r => setTimeout(r, 400)); return dfState(); };
  const dfClick = async k => { for (let t = 0; t < 3; t++) { const s = await dfState(); if (s.cur === (k || 'all')) return s; await dfStep(1); } return dfState(); };
  const NAME = { all: '전체', today: '오늘 할인', soon: '곧 할인' };
  const one = (d, k) => d.cur === k && d.name === NAME[k] && d.cnt === d.n[k] && d.rows === d.n[k] && (!d.dots.length || (d.dots.filter(x => x > 0).length === 1 && d.dots[Object.keys(NAME).indexOf(k)] > 8));
  let df = await dfState(); console.log('deal filter default:', df);
  if (df.boxes || !one(df, 'all')) throw new Error('할인 재료 보기 기본 상태 이상 ' + JSON.stringify(df));
  if (df.n.soon) {
    if (df.arrows.length !== 2 || df.arrows.some(([w, h]) => w < 44 || h < 56) || df.dots.length !== 3) throw new Error('화살표 터치 영역 이상 ' + JSON.stringify(df.arrows));
    let d1 = await dfStep(1); if (!one(d1, 'today') || d1.up !== 0 || d1.foc !== '1') throw new Error('› 누르면 오늘 할인 ' + JSON.stringify(d1));
    d1 = await dfStep(1); if (!one(d1, 'soon') || d1.up !== df.n.soon) throw new Error('› 한 번 더 누르면 곧 할인 ' + JSON.stringify(d1));
    d1 = await dfStep(1); if (!one(d1, 'all')) throw new Error('끝에서 › 누르면 전체로 돌아와야 함 ' + JSON.stringify(d1));
    d1 = await dfStep(-1); if (!one(d1, 'soon')) throw new Error('전체에서 ‹ 누르면 곧 할인 ' + JSON.stringify(d1));
    d1 = await dfStep(-1); if (!one(d1, 'today')) throw new Error('‹ 이상 ' + JSON.stringify(d1));
    await p.keyboard.press('ArrowRight'); await new Promise(r => setTimeout(r, 150)); d1 = await dfState(); if (!one(d1, 'soon')) throw new Error('키보드 → 이상 ' + JSON.stringify(d1));
    await p.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 150)); d1 = await dfState(); if (!one(d1, 'all')) throw new Error('Enter(›) 이상 ' + JSON.stringify(d1));
  }
  // 키워드 검색: 확인/Enter로 칩 추가(OR), ✕로 지우기, 숫자 타일과 AND, 빈 결과 안내, 고른 재료는 숨겨져도 유지
  {
    const W = ms => new Promise(r => setTimeout(r, ms));
    const kwState = () => p.evaluate(() => ({ kws: [...document.querySelectorAll('#dealKws .kw .kw-v')].map(e => e.textContent), rows: document.querySelectorAll('#dealList .deal').length, all: +((document.querySelector('#dealSummary .dfsw') || {dataset:{n:''}}).dataset.n.split(',')[0]), groups: [...document.querySelectorAll('#dealList .ing-h span')].reduce((a, e) => a + +e.textContent, 0), input: document.getElementById('dSearch').value, empty: !!document.querySelector('#dealList .empty button[data-kwclear]'), status: document.getElementById('dealKwStatus').textContent, top: document.getElementById('dealSearch').getBoundingClientRect().top < document.getElementById('dealSummary').getBoundingClientRect().top }));
    const base = await kwState(); if (!base.top || base.kws.length) throw new Error('검색창 위치/초기 키워드 이상');
    const pk = await p.$('#dealList .deal.pickable:not(.picked) .pick'); const pkName = await pk.evaluate(b => b.closest('.deal').dataset.sel); await pk.click(); await W(150);
    const otherGroup = await p.$$eval('#dealList .ing-h', hs => (hs.map(h => h.firstChild.textContent.trim()).find(t => !/돼지/.test(t)) || ''));
    { const sbx = await p.evaluate(() => { const i = document.getElementById('dSearch').getBoundingClientRect(), b = document.getElementById('dSearchBtn'), r = b.getBoundingClientRect(), f = document.getElementById('dealSearch').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('dSearch'));
        return { go: !!document.getElementById('dSearchGo'), lbl: b.getAttribute('aria-label'), type: b.type, bw: r.width, bh: r.height, inW: Math.abs(i.width - f.width) < 0.5, inside: r.right <= i.right && r.left > i.left + i.width / 2 && r.top >= i.top && r.bottom <= i.bottom, vmid: Math.abs((r.top + r.bottom) - (i.top + i.bottom)) / 2, ih: i.height, pr: parseFloat(cs.paddingRight), gap: i.right - r.left, leftSvg: !!document.querySelector('#dealSearch .field > svg') }; });
      console.log('deals search icon btn:', sbx);
      if (sbx.go || sbx.lbl !== '검색' || sbx.type !== 'submit' || sbx.bw < 44 || sbx.bh < 44 || !sbx.inW || !sbx.inside || sbx.vmid > 0.6 || Math.abs(sbx.ih - 53.27) > 1 || sbx.pr < sbx.gap || sbx.leftSvg) throw new Error('할인 재료 검색 돋보기 버튼 이상 ' + JSON.stringify(sbx)); }
    await p.type('#dSearch', '돼지'); await p.click('#dSearchBtn'); await W(150);
    let k1 = await kwState(); console.log('kw 돼지:', k1);
    if (k1.kws.join() !== '돼지' || k1.input !== '' || !k1.rows || k1.rows >= base.rows || k1.rows !== k1.all || k1.groups !== k1.rows) throw new Error('키워드 1개 필터 이상 ' + JSON.stringify(k1));
    const kw2 = otherGroup || '두부';
    await p.type('#dSearch', kw2); await p.keyboard.press('Enter'); await W(150);
    let k2 = await kwState(); console.log('kw 돼지+' + kw2 + ':', k2.rows, k2.status);
    if (k2.kws.join() !== '돼지,' + kw2 || k2.rows <= k1.rows || k2.groups !== k2.rows || !/키워드 2개/.test(k2.status)) throw new Error('키워드 OR 이상');
    await p.type('#dSearch', ' 돼 지 '); await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await W(150);
    if ((await kwState()).kws.length !== 2) throw new Error('중복/빈 키워드가 추가됨');
    if (df.n.soon) { const t = await dfClick('today'); const k3 = await kwState(); if (t.cur !== 'today' || k3.rows > k2.rows) throw new Error('키워드+보기 필터 AND 이상'); await dfClick(''); }
    // ✕로 하나 지우기 (키보드)
    await p.focus('#dealKws button.kw-x[data-kw="1"]'); await p.keyboard.press('Enter'); await W(150);
    k1 = await kwState(); if (k1.kws.join() !== '돼지') throw new Error('✕ 지우기 이상 ' + k1.kws);
    const lbl = await p.$eval('#dealKws button.kw-x', b => b.getAttribute('aria-label')); if (lbl !== '키워드 돼지 지우기') throw new Error('✕ 라벨 ' + lbl);
    // 빈 결과
    await p.type('#dSearch', 'zzqq없는말'); await p.click('#dSearchBtn'); await W(100); await p.click('#dealKws button.kw-x[data-kw="0"]'); await W(150);
    const ke = await kwState(); if (ke.rows || !ke.empty) throw new Error('빈 결과 안내 이상 ' + JSON.stringify(ke));
    const emptyTxt = await p.$eval('#dealList .empty', e => e.innerText); if (!/zzqq없는말/.test(emptyTxt)) throw new Error('빈 결과 문구 ' + emptyTxt);
    const why = await p.$eval('#dealList .empty .kw-why', e => ({ t: e.textContent, fs: parseFloat(getComputedStyle(e).fontSize), hfs: parseFloat(getComputedStyle(e.closest('.empty').querySelector('b')).fontSize) }));
    if (why.t !== '검색한 식품이 마트에 없거나, 할인 대상이 아니에요.' || !(why.fs < why.hfs)) throw new Error('빈 결과 이유 문구 이상 ' + JSON.stringify(why));
    await p.click('#dealList .empty button[data-kwclear]'); await W(150);
    const k0 = await kwState(); if (k0.kws.length || k0.rows !== base.rows || (await p.evaluate(() => document.activeElement.id)) !== 'dSearch') throw new Error('키워드 모두 지우기 이상');
    // 키워드 칩을 넣거나 지우면 맨 위로 (부드럽게, 움직임 줄이기면 바로)
    {
      const sy = () => p.evaluate(() => Math.round(scrollY)), down = async y => { await p.evaluate(y => scrollTo(0, y), y); await W(120); return sy(); };
      const y0 = await down(1500); await p.type('#dSearch', '돼지'); await p.click('#dSearchBtn'); const yMid = await sy(); await W(1000); const yA = await sy();
      await p.type('#dSearch', '두부'); await p.keyboard.press('Enter'); await W(150);
      const y1 = await down(600); await p.click('#dealKws button.kw-x[data-kw="1"]'); await W(1000); const yR = await sy();
      await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      const y2 = await down(600); await p.click('#dealKws button.kw-x[data-kw="0"]'); await W(40); const yRM = await sy();
      await p.emulateMediaFeatures([]);
      console.log('kw scroll-to-top:', { y0, yMid, yA, y1, yR, y2, yRM });
      if (!(y0 > 300) || yA !== 0 || yR !== 0 || yRM !== 0 || (await kwState()).kws.length) throw new Error('키워드 추가/삭제 후 맨 위로 이상');
    }
    if (!(await p.$eval(`#dealList .deal[data-sel="${pkName}"]`, e => e.classList.contains('picked')))) throw new Error('검색으로 숨겨졌던 고른 재료가 풀림');
    await p.click(`#dealList .deal[data-sel="${pkName}"] .pick`); await W(150);
  }
  // 품목 작은 사진: 모든 줄에 48px 자리(사진 또는 이모지)
  const th = await p.$$eval('#dealList .deal', ds => ({ rows: ds.length, thumbs: ds.filter(d => d.querySelector('.dthumb')).length, imgs: ds.filter(d => d.querySelector('.dthumb img')).length, w: ds[0] && ds[0].querySelector('.dthumb').getBoundingClientRect().width }));
  console.log('thumbs:', th); if (th.thumbs !== th.rows || Math.round(th.w) !== 48) throw new Error('품목 사진 자리 이상');
  // 품목 이름: 큰 글씨에 원산지·규격 괄호/「수입)」 없이, 작은 회색 줄로 따로
  const dn = await p.$$eval('#tab-deals .deal .dn', es => es.map(e => e.textContent)); const nSpec = await p.$$eval('#tab-deals .deal .dspec', es => es.length);
  console.log('deal names:', dn.length, 'spec lines:', nSpec, dn.slice(0, 3));
  if (!dn.length || !nSpec || dn.some(t => /\((국산|국내산|[가-힣]+산)[·)]|^수입\)/.test(t))) throw new Error('품목 이름에 원산지 표기가 그대로 있어요');
  await p.screenshot({ path: '/tmp/martestro_deals.png' });
  await p.click('nav button[data-tab="tab-recipes"]');
  console.log('top5:', await p.$$eval('.recipe h3', els => els.slice(0, 5).map(e => e.innerText)));
  const gauges = await p.$$eval('.recipe .rc-top .sring', gs => gs.slice(0, 3).map(g => g.getAttribute('aria-label')));
  console.log('gauges:', gauges);
  if (!gauges.length || !gauges.every(t => /^예상 절약률 \d+%: 원가 [\d,]+원 → [\d,]+원 · \d+% 절약 \(한 끼 기준( · 일부 1팩)?\)$/.test(t))) throw new Error('절약률 링 없음/형식 오류');
  { const W = ms => new Promise(r => setTimeout(r, ms)); // 절약률: 막대 상자 대신 카드 머리 오른쪽 작은 링, 누르면 「한 끼 기준」 말풍선
    const rg = await p.evaluate(() => { const b = document.querySelector('#recipeList .recipe .sring'), r = b.getBoundingClientRect(), top = b.closest('.rc-top').getBoundingClientRect(), card = b.closest('.recipe').getBoundingClientRect();
      return { w: r.width, h: r.height, right: Math.abs(r.right - (card.right - 18)) < 4, inTop: r.top >= top.top - 1 && r.bottom <= top.bottom + 1, box: !!document.querySelector('.recipe .gauge, .recipe .gbar'), exp: b.getAttribute('aria-expanded'), pct: b.querySelector('.sr-p').textContent, tag: b.tagName, lbl: (() => { const k = b.querySelector('.sr-k'); if (!k) return null; const kr = k.getBoundingClientRect(), pr = b.querySelector('.sr-p').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rin = r.width / 2 - 4; const inside = [[kr.left, kr.top], [kr.right, kr.top], [kr.left, kr.bottom], [kr.right, kr.bottom]].every(([x, y]) => Math.hypot(x - cx, y - cy) <= rin); return { t: k.textContent, fs: parseFloat(getComputedStyle(k).fontSize), above: kr.bottom <= pr.top + 1, inside }; })(), topH: top.height, basisShown: /한 끼 기준/.test(b.closest('.recipe').innerText) }; });
    console.log('save ring:', rg);
    if (rg.box || rg.tag !== 'BUTTON' || rg.w < 44 || rg.w > 60 || rg.h !== rg.w || !rg.right || !rg.inTop || rg.exp !== 'false' || !/^\d+%$/.test(rg.pct) || rg.basisShown || !rg.lbl || rg.lbl.t !== '절약률' || rg.lbl.fs < 11 || !rg.lbl.above || !rg.lbl.inside || rg.h > rg.topH) throw new Error('절약률 링 배치 이상 ' + JSON.stringify(rg));
    await p.$eval('#recipeList .recipe .sring', e => e.scrollIntoView({ block: 'center' })); await W(100); await p.click('#recipeList .recipe .sring'); await W(150);
    const po = await p.evaluate(() => { const t = document.getElementById('tipPop'), b = document.querySelector('#recipeList .recipe .sring'); return { open: !!t && !t.hidden, txt: t ? t.innerText.replace(/\s+/g, ' ') : '', exp: b.getAttribute('aria-expanded') }; });
    console.log('save ring pop:', po);
    if (!po.open || po.exp !== 'true' || !/^한 끼 기준( · 일부 1팩)? ?원가 [\d,]+원 → [\d,]+원 · 약 [\d,]+원 절약$/.test(po.txt)) throw new Error('절약률 링 말풍선 이상 ' + JSON.stringify(po));
    await p.click('#tab-recipes .page-h h1'); await W(150);
    const pc = await p.evaluate(() => ({ hid: document.getElementById('tipPop').hidden, exp: document.querySelector('#recipeList .recipe .sring').getAttribute('aria-expanded') }));
    if (!pc.hid || pc.exp !== 'false') throw new Error('바깥 누르면 링 말풍선이 닫혀야 함'); }
  if (await p.$('.recipe .save')) throw new Error('예전 절약 알약이 남아 있어요');
  // 범례 줄은 없어지고, 「가격확인」「주재료」 태그를 누르면 뜻이 말풍선으로 떠요 (하나만, 바깥/다시 누름/ESC/스크롤로 닫힘)
  if (await p.$('.legend')) throw new Error('레시피 카드 범례가 아직 있어요');
  const tipState = () => p.evaluate(() => { const t = document.getElementById('tipPop'); if (!t || t.hidden) return null; const r = t.getBoundingClientRect(); return { fs: getComputedStyle(t).fontSize, text: t.innerText, left: Math.round(r.left), right: Math.round(r.right), vw: document.documentElement.clientWidth, open: document.querySelectorAll('button.tipb[aria-expanded=true]').length }; });
  const chkSel = '.recipe button.tipb[data-tip="chk"]', mainSel = '.recipe button.tipb[data-tip="main"]';
  await p.$eval(chkSel, e => e.scrollIntoView({ block: 'center' })); await new Promise(r => setTimeout(r, 200));
  const before = await p.$eval(chkSel, e => e.closest('.recipe').querySelector('details') ? e.closest('.recipe').querySelector('details').open : null);
  await p.click(chkSel); let tp = await tipState(); console.log('tip(chk):', tp);
  if (!tp || !tp.text.includes('가게 전단 이미지를 AI 인식 기능으로 읽어들인 정보에요. 정확하지 않을 수 있으니 가게에서 직접 확인이 필요해요.') || tp.fs !== '12px' || tp.left < 0 || tp.right > tp.vw || tp.open !== 1) throw new Error('가격확인 말풍선 이상');
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
  await openSetup();
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
  // 레시피 카드 재료 가격 = 한 끼(1인분) 가격 (팩 크기를 모르면 팩 가격 + 「1팩 기준」), 게이지는 「한 끼 기준」
  {
    const pm = await p.evaluate(() => [...document.querySelectorAll('#recipeList .recipe .ing.hit')].map(e => { const sm = e.querySelector('small'); const t = sm ? sm.innerText : ''; const m = (e.getAttribute('title') || '').match(/팩 가격 ([\d,]+)원/);
      return { meal: /한 끼 약/.test(t), pack1: !!e.querySelector('.pk'), v: +((t.match(/([\d,]+)원/) || [, '0'])[1].replace(/,/g, '')), pack: m ? +m[1].replace(/,/g, '') : null }; }));
    const gk = await p.evaluate(() => [...document.querySelectorAll('#recipeList .sring')].map(e => e.getAttribute('data-basis')));
    const priced = pm.filter(x => x.pack != null), meal = priced.filter(x => x.meal), bulk = meal.filter(x => x.pack >= 20000);
    console.log('per-meal chips:', priced.length, 'meal', meal.length, '1팩', priced.filter(x => x.pack1).length, 'bulk→meal', bulk.slice(0, 3).map(x => x.pack + '→' + x.v), 'gauge', [...new Set(gk)]);
    if (!meal.length || priced.some(x => !x.meal && !x.pack1) || meal.some(x => x.v % 10 || x.v > 20000) || !gk.length || gk.some(t => !/^한 끼 기준/.test(t))) throw new Error('한 끼 가격 표시 이상');
    if (bulk.some(x => x.v >= x.pack)) throw new Error('대용량 팩이 한 끼 가격으로 안 바뀜');
  }
  // 「할인 재료 비율」 막대 줄은 없고, 사진을 누르면 흰 막(65%) + 「주재료 n/m 할인 중」이 페이드 인/아웃
  if (await p.$('#recipeList .score, #recipeList .bar')) throw new Error('할인 재료 비율 막대가 남아 있어요');
  if (/할인 재료 비율/.test(await p.$eval('#recipeList', e => e.innerText))) throw new Error('할인 재료 비율 글자가 보여요');
  const ovState = () => p.$eval('#recipeList .recipe', c => { const t = c.querySelector('button.thumb'), o = t && t.querySelector('.thumb-ov'); return t && { pressed: t.getAttribute('aria-pressed'), op: getComputedStyle(o).opacity, bg: getComputedStyle(o).backgroundColor, txt: o.textContent, label: t.getAttribute('aria-label'), open: c.querySelector('details') ? c.querySelector('details').open : null }; });
  let ov = await ovState(); console.log('overlay default:', ov);
  if (!ov || ov.pressed !== 'false' || ov.op !== '1' || !/주재료\s*\d+\/\d+\s*할인 중/.test(ov.txt) || !/사진만 보기/.test(ov.label) || ov.bg !== 'rgba(255, 255, 255, 0.5)') throw new Error('사진 막 기본(보임) 상태 이상');
  const nThumbs = await p.$$eval("#recipeList button.thumb", bs => bs.length), nShown = await p.$$eval('#recipeList button.thumb .thumb-ov', os => os.filter(o => getComputedStyle(o).opacity === '1').length);
  if (!nThumbs || nShown !== nThumbs) throw new Error('순위 카드마다 기본으로 막이 보여야 해요');
  await p.$eval('#recipeList .recipe button.thumb', e => e.scrollIntoView({ block: 'center' })); await p.click('#recipeList .recipe button.thumb'); await new Promise(r => setTimeout(r, 400));
  let ov2 = await ovState(); console.log('overlay off:', ov2);
  if (ov2.pressed !== 'true' || ov2.op !== '0' || ov2.open !== ov.open) throw new Error('사진 누르기 → 사진만 보기 이상(또는 카드가 펼쳐짐)');
  await p.focus('#recipeList .recipe button.thumb'); await p.keyboard.press('Enter'); await new Promise(r => setTimeout(r, 400));
  ov2 = await ovState(); if (ov2.pressed !== 'false' || ov2.op !== '1') throw new Error('키보드로 막 다시 켜기 이상');
  await openSetup();
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
  { const s0 = await sum(); console.log('recipe subtitle:', s0); const hd0 = await p.evaluate(() => { const s = document.getElementById('recipeSummary'), t = document.getElementById('recipeTotal'); return { tot: t.hidden ? '' : t.textContent, one: s.getBoundingClientRect().height < 30 && s.scrollWidth <= s.clientWidth, h1: document.querySelector('#tab-recipes .page-h h1').firstChild.textContent }; }); console.log('recipe header:', hd0);
    if (hd0.h1 !== '추천 레시피' || !hd0.one || !(/^선택한 마트의 할인 재료로 만들 수 있는 레시피 [\d,]+개$/.test(s0) ? /^전체 [\d,]+개$/.test(hd0.tot) : /^레시피 [\d,]+개$/.test(s0)) || !/^(선택한 마트의 할인 재료로 만들 수 있는 레시피 [\d,]+개|레시피 [\d,]+개)$/.test(s0) || /마트 \(|Mart|이마트|홈플러스|롯데|탑마트/.test(s0)) throw new Error('레시피 부제 이상 ' + s0); }
  let ch = await chips(); console.log('chips:', ch); if (!/^:true:/.test(ch[0]) || !/^jachi:false:\d/.test(ch[1]) || !/^quick:false:\d/.test(ch[2])) throw new Error('칩 기본 상태 이상');
  const cnt = ch.map(x => +x.split(':')[2].replace(/,/g, ''));
  if (!(cnt[1] > 3 && cnt[2] > 3 && cnt[1] < cnt[0] && cnt[2] < cnt[0])) throw new Error('칩 개수 이상 ' + cnt);
  await p.click('.kchip[data-kind="quick"]'); ch = await chips(); console.log('quick:', ch, await sum());
  if (!/^:false/.test(ch[0]) || !/^quick:true/.test(ch[2])) throw new Error('간편식품 칩 상태 이상');
  if (await nCards() !== Math.min(30, cnt[2])) throw new Error('간편식품 카드 수 ' + await nCards() + ' != ' + cnt[2]);
  const qNames = await p.$$eval('#recipeList .recipe h3', e => e.slice(0, 5).map(x => x.innerText)); console.log('quick top5:', qNames);
  await p.click('.kchip[data-kind="jachi"]'); ch = await chips(); console.log('both:', ch, await sum());
  const both = +((await p.$eval('#recipeSummary', e => e.dataset.kind)).match(/자취생·간편식품 ([\d,]+)개/) || [0, '0'])[1].replace(/,/g, '');
  if (!/^jachi:true/.test(ch[1]) || !/^quick:true/.test(ch[2]) || !(both >= Math.max(cnt[1], cnt[2]) && both <= cnt[1] + cnt[2])) throw new Error('합집합 이상 ' + both);
  if (cnt[2] > 30 || cnt[1] > 30) { const m0 = await p.$eval('#btnMore', b => b.innerText); await p.click('#btnMore'); await new Promise(r => setTimeout(r, 300)); console.log('more:', m0, '→', await nCards()); if (await nCards() !== Math.min(60, both)) throw new Error('더 보기 필터 이상'); }
  await p.click('.kchip[data-kind="quick"]'); await p.click('.kchip[data-kind="jachi"]'); ch = await chips(); console.log('fallback:', ch);
  if (!/^:true/.test(ch[0]) || /true/.test(ch[1] + ch[2])) throw new Error('마지막 칩 끄면 전체로 안 돌아감');
  await p.click('.kchip[data-kind="jachi"]'); await p.click('.kchip[data-kind=""]'); ch = await chips(); if (!/^:true/.test(ch[0]) || /true/.test(ch[1])) throw new Error('전체 눌러도 다른 칩이 안 꺼짐');
  if (await nCards() !== Math.min(30, cnt[0])) throw new Error('전체 복귀 후 카드 수 이상');
  // 할인 재료 고르기 → 플로팅 「해당 재료로 레시피 추천 · N개」 → 레시피 필터 + 「선택 재료」 표시
  await p.click('nav button[data-tab="tab-deals"]'); await new Promise(r => setTimeout(r, 300));
  const pickRow = async ing => { const k = await p.$eval(`.deal[data-ing="${ing}"]`, e => { e.scrollIntoView({ block: 'center' }); return e.getAttribute('data-sel'); }); await p.click(`.deal[data-sel="${k.replace(/"/g, '\\"')}"] .dn`); return k; };
  const k1 = await pickRow('돼지고기'); const k2 = await pickRow('양파');
  const fabR = () => p.$eval('#fabR', e => ({ show: e.classList.contains('show'), text: e.innerText.replace(/\s+/g, ' '), hidden: e.getAttribute('aria-hidden') }));
  const picked = await p.$$eval('.deal.picked', es => es.map(e => e.getAttribute('data-ing') + ':' + e.querySelector('.pick').getAttribute('aria-pressed')));
  let fr = await fabR(); console.log('picked:', picked, 'fabR:', fr);
  if (picked.length !== 2 || picked.some(x => !x.endsWith(':true')) || !fr.show || fr.hidden !== 'false' || !/해당 재료로 레시피 추천 · [\d,]+개/.test(fr.text)) throw new Error('재료 고르기/플로팅 버튼 이상');
  if (await p.$eval('#fab', e => e.classList.contains('show'))) throw new Error('할인 재료 탭에 마트 버튼이 보여요');
  const tipInRow = await p.$('.deal.pickable button.tipb');
  if (tipInRow) { const rk = await tipInRow.evaluate(e => { e.scrollIntoView({ block: 'center' }); return e.closest('.deal').getAttribute('data-sel'); }); const b0 = await p.$eval(`.deal[data-sel="${rk}"]`, e => e.classList.contains('picked')); await tipInRow.click(); const b1 = await p.$eval(`.deal[data-sel="${rk}"]`, e => e.classList.contains('picked')); if (b0 !== b1) throw new Error('가격확인 태그가 선택을 바꿈'); await p.keyboard.press('Escape'); console.log('tip in deal row: selection unchanged'); }
  // 키보드: 체크 버튼 Enter 로 고르고 풀기
  await p.focus(`.deal[data-sel="${k2}"] .pick`); await p.keyboard.press('Enter'); if (await p.$eval(`.deal[data-sel="${k2}"]`, e => e.classList.contains('picked'))) throw new Error('키보드로 풀기 이상'); await p.keyboard.press('Enter');
  const nFab = +(await fabR()).text.match(/([\d,]+)개/)[1].replace(/,/g, '');
  await p.evaluate(() => scrollTo(0, 400)); await new Promise(r => setTimeout(r, 300)); console.log('hit:', await p.$eval('#fabR', b => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [r.top, r.height, e && (e.id || e.className || e.tagName), e && e.closest('#fabR') ? 'in' : 'out']; })); await p.click('#fabR'); await new Promise(r => setTimeout(r, 400));
  const rt = await p.evaluate(() => ({ tab: document.querySelector('section.tab.on').id, y: scrollY, ind: document.getElementById('selInd').hidden ? null : document.getElementById('selInd').innerText.replace(/\s+/g, ' '), fabR: document.getElementById('fabR').classList.contains('show') }));
  console.log('to recipes:', rt); if (rt.tab !== 'tab-recipes' || rt.y !== 0 || !rt.ind || !/돼지고기/.test(rt.ind) || !/양파/.test(rt.ind) || rt.fabR) throw new Error('레시피 탭 이동/선택 재료 표시 이상');
  const cardIngs = await p.$$eval('#recipeList .recipe', cs => cs.map(c => [...c.querySelectorAll('.ing')].map(i => i.childNodes[0].textContent.trim())));
  if (!cardIngs.length || cardIngs.some(l => !l.some(k => k === '돼지고기' || k === '양파'))) throw new Error('고른 재료 없는 레시피가 보여요');
  const nAll = +(await chips())[0].split(':')[2].replace(/,/g, ''); if (nAll !== nFab) throw new Error('플로팅 개수(' + nFab + ') ≠ 레시피 개수(' + nAll + ')');
  { const s1 = await sum(); console.log('recipe subtitle (sel):', s1); const m = s1.match(/^선택한 재료로 만들 수 있는 레시피 ([\d,]+)개$/); const t1 = await p.evaluate(() => { const s = document.getElementById('recipeSummary'), t = document.getElementById('recipeTotal'); return { tot: t.hidden ? '' : t.textContent, one: s.getBoundingClientRect().height < 30 && s.scrollWidth <= s.clientWidth }; }); if (!t1.one || !/^전체 [\d,]+개$/.test(t1.tot) || !m || +m[1].replace(/,/g, '') !== nAll) throw new Error('레시피 부제(재료 선택) 이상 ' + s1); }
  const first = cardIngs[0].filter(k => k === '돼지고기' || k === '양파').length; console.log('sel recipes:', nAll, 'first has both:', first, await p.$$eval('#recipeList .recipe h3', e => e.slice(0, 4).map(x => x.innerText)));
  if (first !== 2) throw new Error('두 재료 다 쓰는 레시피가 앞에 안 옴');
  await p.click('.kchip[data-kind="quick"]'); const nq = await nCards(); const cq = await chips(); console.log('sel+quick:', cq); if (+cq[2].split(':')[2] > nAll) throw new Error('선택+간편식품 AND 이상'); await p.click('.kchip[data-kind=""]');
  await p.type('#rSearch', 'zzzz없는요리'); await new Promise(r => setTimeout(r, 500));
  const emp = await p.$eval('#recipeList', e => e.innerText.replace(/\s+/g, ' ')); console.log('sel empty:', emp); if (!/고른 재료가 들어간 레시피가 없어요/.test(emp)) throw new Error('빈 상태 이상');
  await p.$eval('#rSearch', e => { e.value = ''; e.dispatchEvent(new Event('input')); }); await new Promise(r => setTimeout(r, 500));
  await p.click('#selClear'); await new Promise(r => setTimeout(r, 200));
  if (!(await p.$eval('#selInd', e => e.hidden)) || await nCards() !== Math.min(30, cnt[0])) throw new Error('선택 재료 지우기 이상');
  // 마트를 빼면 그 마트 품목 선택도 사라져요
  await p.click('nav button[data-tab="tab-deals"]'); await new Promise(r => setTimeout(r, 300));
  const ek = await p.$eval('.deal.pickable', e => e.getAttribute('data-sel')); await p.click(`.deal[data-sel="${ek}"] .dn`);
  if (!(await fabR()).show) throw new Error('선택 후 플로팅 안 보임');
  const brandOf = ek.split('|')[0];
  await openSetup(); await new Promise(r => setTimeout(r, 300));
  if (brandOf === 'emart') await p.$$eval('#brandChips button', bs => { const e = bs.find(x => x.innerText.includes('이마트')); e && e.click(); });
  else await p.$$eval('#martList input:checked', els => els.forEach(e => e.click()));
  await p.click('nav button[data-tab="tab-recipes"]'); await new Promise(r => setTimeout(r, 300));
  console.log('after mart removed:', brandOf, 'ind hidden:', await p.$eval('#selInd', e => e.hidden)); if (!(await p.$eval('#selInd', e => e.hidden))) throw new Error('사라진 품목 선택이 남아 있어요');
  await openSetup(); await new Promise(r => setTimeout(r, 300));
  if (brandOf === 'emart') await p.$$eval('#brandChips button', bs => { const e = bs.find(x => x.innerText.includes('이마트')); e && e.click(); });
  else await p.$eval('input[data-id="node/4655465094"]', e => e.click());
  // 다시 방문: 저장된 위치·마트로 바로 「할인 재료」 탭, 헤더 버튼으로 설정 다시 열기·닫기
  { await new Promise(r => setTimeout(r, 300));
    await p.reload({ waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 800));
    const n1 = await navState(); const rows = await p.$$eval('#dealList .deal', x => x.length); const sm = await p.$eval('#dealSummary', e => (e.querySelector('.sel-marts') || /기준/.test(e.innerText)) ? '' : e.querySelectorAll('.dfsw .dfn').length);
    console.log('return visit:', n1, 'rows', rows, sm);
    if (n1.setup || n1.on !== 'tab-deals' || !rows || !sm || n1.exp !== 'false' || !/^위치·마트 설정/.test(n1.label)) throw new Error('다시 방문 시 할인 재료 탭 이상 ' + JSON.stringify(n1));
    if (!(await p.$eval('nav button[data-tab="tab-deals"]', b => b.classList.contains('on')))) throw new Error('하단 탭 표시 이상');
    await p.click('#btnSetup'); await new Promise(r => setTimeout(r, 250));
    const n2 = await navState(); const chk = await p.$$eval('#martList input:checked, #brandChips button[aria-pressed="true"]', x => x.length);
    if (!n2.setup || n2.on !== 'tab-loc' || n2.exp !== 'true' || !chk) throw new Error('헤더 버튼으로 설정 열기 이상 ' + JSON.stringify(n2) + ' chk ' + chk);
    await p.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 200));
    if ((await navState()).on !== 'tab-deals') throw new Error('Esc로 설정 닫기 이상');
    await p.click('nav button[data-tab="tab-recipes"]'); await p.click('#btnSetup'); await new Promise(r => setTimeout(r, 200)); await p.click('#btnSetup'); await new Promise(r => setTimeout(r, 200));
    if ((await navState()).on !== 'tab-recipes') throw new Error('✕ 닫으면 직전 탭으로 안 돌아감');
    await p.click('nav button[data-tab="tab-deals"]');
  }
  // 정렬 알약: 추천순(묶음) / 그 밖은 한 줄로, 다시 누르면 방향 반대, 값 없는 항목은 맨 뒤, localStorage 기억
  {
    const W = ms => new Promise(r => setTimeout(r, ms));
    await p.click('nav button[data-tab="tab-deals"]'); await W(250);
    const sb = sel => p.evaluate(sel => { const el = document.querySelector(sel); return { hidden: el.hidden, role: el.getAttribute('role'), pills: [...el.querySelectorAll('button.sp')].map(b => ({k: b.dataset.sort, on: b.getAttribute('aria-pressed'), t: b.textContent, al: b.getAttribute('aria-label')})) }; }, sel);
    const on = b => b.pills.filter(x => x.on === 'true').map(x => x.t).join();
    const dRows = () => p.evaluate(() => ({ heads: [...document.querySelectorAll('#dealList .ing-h')].map(e => e.firstChild.textContent.trim()), off: [...document.querySelectorAll('#dealList .deal')].map(r => { const o = r.querySelector('.price .off'); return o ? +o.textContent.replace(/[^\d]/g, '') : null; }), price: [...document.querySelectorAll('#dealList .deal')].map(r => { const o = r.querySelector('.price .now'); return o ? +o.textContent.replace(/[^\d]/g, '') : null; }) }));
    const ordered = (v, desc) => { const f = v.indexOf(null), a = v.slice(0, f < 0 ? v.length : f); return (f < 0 || v.slice(f).every(x => x == null)) && a.every((x, i) => !i || (desc ? x <= a[i-1] : x >= a[i-1])); };
    let b = await sb('#dSortBar'); const r0 = await dRows();
    if (b.hidden || b.role !== 'group' || b.pills.map(x => x.k).join() !== 'rec,off,price,end' || on(b) !== '추천순' || r0.heads.length < 2) throw new Error('할인 정렬 기본 상태 이상 ' + JSON.stringify(b));
    await p.click('#dSortBar [data-sort="off"]'); await W(200); b = await sb('#dSortBar'); let r = await dRows();
    console.log('deal sort off:', on(b), r.heads, r.off.slice(0, 6), r.off.filter(x => x == null).length);
    if (on(b) !== '할인율 높은순↑' || r.heads.length !== 1 || r.heads[0] !== '할인율 높은순' || !ordered(r.off, true) || r.off.length !== r0.off.length) throw new Error('할인율 높은순 이상');
    await p.click('#dSortBar [data-sort="off"]'); await W(200); b = await sb('#dSortBar'); r = await dRows();
    if (on(b) !== '할인율 낮은순↓' || !ordered(r.off, false) || !/다시 누르면 할인율 높은순/.test(b.pills[1].al)) throw new Error('할인율 낮은순 이상 ' + JSON.stringify(b.pills[1]));
    if (await p.evaluate(() => localStorage.getItem('mr_dsort')) !== '{"k":"off","rev":true}') throw new Error('할인 정렬 저장 이상');
    if (await p.evaluate(() => document.activeElement && document.activeElement.dataset.sort) !== 'off') throw new Error('정렬 누른 뒤 포커스 유지 안 됨');
    await p.click('#dSortBar [data-sort="price"]'); await W(200); b = await sb('#dSortBar'); r = await dRows();
    if (on(b) !== '가격 낮은순↓' || !ordered(r.price, false)) throw new Error('가격 낮은순 이상');
    await p.click('#dSortBar [data-sort="price"]'); await W(200); b = await sb('#dSortBar'); r = await dRows();
    if (on(b) !== '가격 높은순↑' || !ordered(r.price, true)) throw new Error('가격 높은순 이상');
    await p.click('#dSortBar [data-sort="end"]'); await W(200); b = await sb('#dSortBar'); if (on(b) !== '마감 임박순↑') throw new Error('마감 임박순 이상');
    await p.click('#dSortBar [data-sort="end"]'); await W(200); b = await sb('#dSortBar'); if (on(b) !== '마감 여유순↓') throw new Error('마감 여유순 이상');
    // 정렬 + 타일 필터 + 키워드 함께
    if (df.n.soon) { await dfClick('today'); r = await dRows(); const n = await p.evaluate(() => parseInt(document.querySelector('#dealSummary .dfc').textContent)); if (r.off.length !== n) throw new Error('정렬+필터 개수 이상'); await dfClick(''); }
    // 새로고침해도 기억
    await p.reload({waitUntil: 'networkidle2'}); await W(800);
    b = await sb('#dSortBar'); if (on(b) !== '마감 여유순↓') throw new Error('새로고침 뒤 할인 정렬 기억 안 됨 ' + on(b));
    await p.click('#dSortBar [data-sort="rec"]'); await W(200); await p.click('#dSortBar [data-sort="rec"]'); await W(200); b = await sb('#dSortBar'); r = await dRows();
    if (on(b) !== '추천순' || r.heads.join() !== r0.heads.join()) throw new Error('추천순(재료 묶음) 복귀 이상');
    // 레시피
    await p.click('nav button[data-tab="tab-recipes"]'); await W(400);
    const rRows = () => p.evaluate(() => [...document.querySelectorAll('#recipeList .recipe')].map(c => { const g = c.querySelector('.sring .sr-p'), m = [...c.querySelectorAll('.rmeta span')].map(e => e.textContent).find(t => /kcal$/.test(t)), mm = [...c.querySelectorAll('.rmeta span')].some(e => /\d+분$/.test(e.textContent)); return { save: g ? +g.textContent.replace(/[^\d]/g, '') : null, kcal: m ? +m.replace(/[^\d]/g, '') : null, mins: mm, rank: !!c.querySelector('.rank, .rk, .num') }; }));
    b = await sb('#rSortBar'); if (b.pills.map(x => x.k).join() !== 'rec,save,cost,kcal' || on(b) !== '추천순') throw new Error('레시피 정렬 기본 이상');
    await p.click('#rSortBar [data-sort="save"]'); await W(300); b = await sb('#rSortBar'); let rr = await rRows();
    if (on(b) !== '절약률 높은순↑' || !ordered(rr.map(x => x.save), true)) throw new Error('절약률 높은순 이상');
    if (await p.$('#btnMore') && await p.evaluate(() => getComputedStyle(document.getElementById('btnMore')).display !== 'none')) { await p.click('#btnMore'); await W(400); const r2 = await rRows(); if (r2.length <= rr.length || !ordered(r2.map(x => x.save), true)) throw new Error('더 보기 뒤 정렬 이상'); }
    await p.click('#rSortBar [data-sort="save"]'); await W(300); b = await sb('#rSortBar'); rr = await rRows();
    if (on(b) !== '절약률 낮은순↓' || !ordered(rr.map(x => x.save), false)) throw new Error('절약률 낮은순 이상');
    await p.click('#rSortBar [data-sort="cost"]'); await W(300); b = await sb('#rSortBar'); if (on(b) !== '비용 낮은순↓') throw new Error('비용 낮은순 이상');
    await p.click('#rSortBar [data-sort="cost"]'); await W(300); b = await sb('#rSortBar'); if (on(b) !== '비용 높은순↑') throw new Error('비용 높은순 이상');
    if (rr.some(x => x.mins)) throw new Error('카드에 조리시간이 남아 있어요');
    await p.click('#rSortBar [data-sort="kcal"]'); await W(300); b = await sb('#rSortBar'); rr = await rRows();
    if (on(b) !== '칼로리 낮은순↓' || !ordered(rr.map(x => x.kcal), false)) throw new Error('칼로리 낮은순 이상');
    console.log('recipe sort kcal asc:', rr.slice(0, 5).map(x => x.kcal));
    await p.click('#rSortBar [data-sort="kcal"]'); await W(300); b = await sb('#rSortBar'); rr = await rRows();
    if (on(b) !== '칼로리 높은순↑' || !ordered(rr.map(x => x.kcal), true)) throw new Error('칼로리 높은순 이상');
    if (await p.evaluate(() => localStorage.getItem('mr_rsort')) !== '{"k":"kcal","rev":true}') throw new Error('레시피 정렬 저장 이상');
    console.log('recipe sort kcal desc:', rr.slice(0, 5).map(x => x.kcal), 'no-kcal', rr.filter(x => x.kcal == null).length);
    // 예전에 저장한 조리시간 정렬 → 추천순
    await p.evaluate(() => localStorage.setItem('mr_rsort', '{"k":"time","rev":true}')); await p.reload({ waitUntil: 'networkidle0' }); await W(600);
    await p.click('nav button[data-tab="tab-recipes"]'); await W(400); b = await sb('#rSortBar'); if (on(b) !== '추천순') throw new Error('저장된 조리시간 정렬이 추천순으로 안 바뀜 ' + on(b));
    await p.click('#rSortBar [data-sort="rec"]'); await W(300);
    // 레시피 검색창: 맨 위 (할인 재료 검색과 같은 자리·높이·글자), 따라오지 않음
    { await p.evaluate(() => scrollTo(0, 0)); await W(150); const rs = await p.evaluate(() => { const e = document.getElementById('rSearch'), st = e.closest('.tools'), d = document.getElementById('dSearch'), r = e.getBoundingClientRect(); return { top: r.top, h: r.height, fs: getComputedStyle(e).fontSize, dfs: getComputedStyle(d).fontSize, pos: getComputedStyle(st).position, first: st.parentElement.firstElementChild === st }; });
      console.log('recipe search top:', rs); if (rs.pos === 'sticky' || rs.pos === 'fixed' || !rs.first || Math.abs(rs.top - 76) > 1.5 || Math.abs(rs.h - 53.27) > 1 || rs.fs !== '16px' || rs.dfs !== rs.fs) throw new Error('레시피 검색창 맨 위 sticky 아님 ' + JSON.stringify(rs)); }
    // 레시피 검색: 오른쪽 돋보기 = 검색 버튼(44×44, '검색'), 왼쪽 = 분류 아이콘
    { const ic = await p.evaluate(() => { const i = document.getElementById('rSearch').getBoundingClientRect(), s = document.getElementById('rSearchBtn'), sr = s.getBoundingClientRect(), c = document.getElementById('rCatBtn').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('rSearch'));
        return { lbl: s.getAttribute('aria-label'), sw: sr.width, sh: sr.height, sRight: sr.left > i.left + i.width / 2 && sr.right <= i.right, cLeft: c.right < i.left + i.width / 2 && c.left >= i.left, svm: Math.abs((sr.top + sr.bottom) - (i.top + i.bottom)) / 2, cvm: Math.abs((c.top + c.bottom) - (i.top + i.bottom)) / 2, pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight), cGap: c.right - i.left, sGap: i.right - sr.left, leftSvg: !!document.querySelector('#tab-recipes .tools .field > svg') }; });
      console.log('recipe search icons:', ic);
      if (ic.lbl !== '검색' || ic.sw < 44 || ic.sh < 44 || !ic.sRight || !ic.cLeft || ic.svm > 0.6 || ic.cvm > 0.6 || ic.pl < ic.cGap || ic.pr < ic.sGap || ic.leftSvg) throw new Error('레시피 검색 아이콘 배치 이상 ' + JSON.stringify(ic));
      await p.focus('#rSearch'); await p.keyboard.type('zzzz없는요리'); await p.click('#rSearchBtn'); await W(50);
      const r1 = await p.evaluate(() => ({ n: document.querySelectorAll('#recipeList .recipe').length, foc: document.activeElement && document.activeElement.id }));
      await p.$eval('#rSearch', e => { e.value = ''; }); await p.click('#rSearchBtn'); await W(50);
      const r2 = await p.evaluate(() => document.querySelectorAll('#recipeList .recipe').length);
      console.log('recipe search btn:', r1, r2); if (r1.n !== 0 || r1.foc === 'rSearch' || r2 === 0) throw new Error('레시피 돋보기 검색 버튼 동작 이상'); }
    // 분류: 큰 select 대신 검색창 안 아이콘 → 팝오버 (하나만), 고르면 금색 점 + 칩(✕)
    const cs = () => p.evaluate(() => { const b = document.getElementById('rCatBtn'), pop = document.getElementById('rCatPop'), f = document.querySelector('#tab-recipes .tools .field'), t = document.querySelector('#tab-recipes .tools'), ch = document.querySelector('.kind-row .catchip');
      return { sel: !!document.getElementById('rCat') || !!document.querySelector('#tab-recipes .tools select'), fw: Math.round(f.getBoundingClientRect().width), tw: Math.round(t.getBoundingClientRect().width), hp: b.getAttribute('aria-haspopup'), ex: b.getAttribute('aria-expanded'), al: b.getAttribute('aria-label'), open: !pop.hidden && pop.getBoundingClientRect().height > 0,
        items: [...pop.querySelectorAll('[role=menuitemradio]')].map(x => x.textContent + (x.getAttribute('aria-checked') === 'true' ? '*' : '')), dot: getComputedStyle(b.querySelector('.fdot')).display !== 'none', chip: ch ? ch.textContent : null, foc: document.activeElement && (document.activeElement.id || document.activeElement.textContent),
        cats: [...document.querySelectorAll('#recipeList .recipe .rmeta')].map(m => m.textContent) }; });
    let c0 = await cs(); console.log('cat ui:', {fw: c0.fw, tw: c0.tw, hp: c0.hp, al: c0.al});
    if (c0.sel || c0.fw !== c0.tw || c0.hp !== 'menu' || c0.ex !== 'false' || c0.open || c0.dot || c0.chip) throw new Error('분류 아이콘 기본 상태 이상 ' + JSON.stringify(c0));
    await p.click('#rCatBtn'); await W(200); let c1 = await cs();
    if (!c1.open || c1.ex !== 'true' || c1.items.length < 5 || c1.items[0] !== '전체*' || c1.items.filter(x => x.endsWith('*')).length !== 1 || c1.foc !== '전체') throw new Error('분류 팝오버 열기 이상 ' + JSON.stringify(c1));
    await p.keyboard.press('Escape'); await W(150); c1 = await cs(); if (c1.open || c1.ex !== 'false' || c1.foc !== 'rCatBtn') throw new Error('ESC로 닫기 이상');
    await p.click('#rCatBtn'); await W(150); await p.click('#tab-recipes .page-h h1'); await W(150); c1 = await cs(); if (c1.open) throw new Error('바깥 누르면 닫혀야 함');
    await p.click('#rCatBtn'); await W(150); await p.evaluate(() => [...document.querySelectorAll('#rCatPop [role=menuitemradio]')].find(x => x.textContent === '반찬').click()); await W(400); c1 = await cs();
    if (c1.open || !c1.dot || !/반찬/.test(c1.chip || '') || !/반찬/.test(c1.al) || !c1.cats.length || !c1.cats.every(x => /반찬/.test(x)) || c1.foc !== 'rCatBtn') throw new Error('분류 반찬 선택 이상 ' + JSON.stringify(c1));
    await p.click('#rCatBtn'); await W(150); c1 = await cs(); if (c1.items.filter(x => x.endsWith('*')).join() !== '반찬*' || c1.foc !== '반찬') throw new Error('선택 표시 이상');
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await W(400); c1 = await cs();
    if (c1.open || !c1.chip || /반찬/.test(c1.chip) || !c1.cats.every(x => x.includes(c1.chip.replace('분류', '')))) throw new Error('키보드로 분류 바꾸기 이상 ' + JSON.stringify(c1));
    await p.click('.kind-row .catchip'); await W(400); c1 = await cs();
    if (c1.chip || c1.dot || !/전체/.test(c1.al) || c1.foc !== 'rCatBtn') throw new Error('분류 칩 ✕ 해제 이상 ' + JSON.stringify(c1));
    console.log('category popover OK');
    await p.click('nav button[data-tab="tab-deals"]'); await W(250);
    console.log('sort pills OK');
  }
  // 「주재료가 모두 할인 중인 것만」 스위치는 없어졌어요 (검색 줄과 첫 카드 사이는 넉넉하게)
  { await p.click('nav button[data-tab="tab-recipes"]'); await new Promise(r => setTimeout(r, 300));
    const gap = await p.evaluate(() => { const t = document.getElementById('rSortBar').getBoundingClientRect(), c = document.querySelector('#recipeList > *'); return { sw: !!document.getElementById('onlyFull') || /주재료가 모두 할인 중인 것만/.test(document.getElementById('tab-recipes').innerText), gap: c ? Math.round(c.getBoundingClientRect().top - t.bottom) : -1 }; });
    console.log('recipes tools gap:', gap); if (gap.sw || gap.gap < 10 || gap.gap > 32) throw new Error('레시피 탭 스위치/간격 이상 ' + JSON.stringify(gap));
    await p.click('nav button[data-tab="tab-deals"]'); }
  if (await p.$('nav button[data-tab="tab-info"]')) throw new Error('출처 탭이 아직 메뉴에 있어요');
  console.log('nav:', await p.$$eval('nav button', bs => bs.map(b => b.innerText.trim()).join(' | ')));
  await p.click('#btnSrc'); await p.waitForFunction(() => document.getElementById('srcSheet').open, { timeout: 5000 });
  console.log('info:', await p.$eval('#dataInfo', e => e.innerText.replace(/\s+/g, ' ')));
  await p.screenshot({ path: '/tmp/martestro_info.png' });
  await p.click('#srcClose'); await new Promise(r => setTimeout(r, 200));
  if (await p.$eval('#srcSheet', d => d.open)) throw new Error('출처 시트가 안 닫혀요');
  // 저장된 마트가 더는 없으면(오래된 저장값) 버리고 설정 화면
  { await p.evaluate(() => { localStorage.setItem('mr_sel', JSON.stringify(['node/0000000', 'brand:nope'])); localStorage.setItem('mr_loc', JSON.stringify({ lat: 'x' })); });
    await p.reload({ waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 500));
    const n3 = await navState(); const sel = await p.evaluate(() => localStorage.getItem('mr_sel'));
    console.log('stale saved:', n3, sel); if (!n3.setup || n3.on !== 'tab-loc' || sel !== '[]' || n3.loc) throw new Error('오래된 저장값 처리 이상'); }
  console.log('errors:', errs);
  await b.close(); if (srv) srv.close();
  if (errs.filter(e => !/404|Failed to load resource/.test(e)).length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
