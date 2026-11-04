#!/usr/bin/env node
// data/price_history.json 을 git 기록(지난 data/deals.json 들)에서 처음부터 다시 만들어요. 한 번 돌리면 되고, 이후엔 update_deals 가 매일 쌓아요.
// 사용: node scripts/build_price_history.js
const { execFileSync } = require('child_process');
const H = require('./price_history');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const revs = git('log', '--reverse', '--format=%H %cI', '--', 'data/deals.json').trim().split('\n').filter(Boolean);
const h = H.load();
for (const line of revs) {
  const [sha, when] = line.split(' ');
  let d; try { d = JSON.parse(git('show', sha + ':data/deals.json')); } catch (e) { continue; }
  H.record(h, d.deals || {}, when.slice(0, 10));
}
H.save(h);
console.log('기록:', Object.entries(h.marts).map(([m, v]) => m + ' ' + Object.keys(v).length + '개 상품').join(', '));
