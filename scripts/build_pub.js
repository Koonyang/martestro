// 식품안전나라 COOKRCP01 원본(raw/all.json) → 앱용 압축 데이터(pub_data.js)
var fs = require('fs');
var L = require('../src/logic.js');
var rows = JSON.parse(fs.readFileSync(__dirname + '/../raw/all.json', 'utf8'));
var CATS = ['반찬','국&찌개','일품','밥','후식','기타'];
var EXCLUDE = /떡갈비|햄버거|소스|액젓|젓갈|새우젓|케첩|케찹|육수|맛술|분말|엑기스|즙|페이스트|오일|파우더|맛가루|다시다|조미료|액$|청$|^물$|절임물|뜨물|향$|가루/;
var ALWAYS_MINOR = {'마늘':1,'참기름':1,'쌀':1};
var NAME_ONLY_MAIN = {'고추장':1,'된장':1,'대파':1,'우유':1,'치즈':1,'카레':1};

function clean(s){ return String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/\r/g,''); }
function parseParts(txt, name){
  var t = clean(txt);
  // 첫 줄이 레시피 이름이면 제거
  var lines = t.split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
  if (lines.length > 1 && lines[0].replace(/\s/g,'') === String(name).replace(/\s/g,'')) lines.shift();
  t = lines.join('\n');
  t = t.replace(/\[[^\]]*\]/g, ',').replace(/[•●·▶►■□◆◇※]/g, ',')
       .replace(/\d+\s*인분\s*(기준)?/g, ',')
       .replace(/(^|\n|,)\s*-?\s*[^,\n:：>]{1,14}\s*[:：>]\s*/g, '$1,');
  var toks = t.split(/[,\n]|\s\+\s/).map(function(x){ return x.replace(/^[-\s]+|[-\s]+$/g,''); }).filter(Boolean);
  var out = [];
  toks.forEach(function(tok){
    if (tok.length > 40) return;
    var m = tok.match(/^([^\d(（½⅓¼⅔¾]+?)\s*[(（]?\s*([\d½⅓¼⅔¾].*|적당량.*|약간.*|조금.*|소량.*)?$/);
    if (!m) return;
    var nm = m[1].replace(/^(주재료|부재료|재료|필수)\s+/,'').replace(/[)）]/g,'').replace(/(적당량|약간|조금|소량)$/,'').trim();
    var amt = (m[2]||'').trim();
    if (/^[^(（]*[)）]$/.test(amt)) amt = amt.slice(0,-1).trim();
    var op = (amt.match(/[(（]/g)||[]).length, cl = (amt.match(/[)）]/g)||[]).length;
    if (op > cl) amt += ')';
    if (!amt && nm.length >= 3 && /(소스|곁들임|볶음|무침|양념장?|드레싱|반죽|토핑|재료|육수|만들기|장식)$/.test(nm)) return;
    if (!nm || nm.length > 14 || /^(주재료|부재료|재료|양념|고명|소스|기타|필수)$/.test(nm)) return;
    var g = null, gm = amt.match(/([\d.]+)\s*(g|ml|㎖|G)\b/); if (gm) g = parseFloat(gm[1]);
    else { gm = amt.match(/=\s*([\d.]+)\s*g/); if (gm) g = parseFloat(gm[1]); }
    out.push({nm:nm, amt:amt, g:g});
  });
  return out;
}
function nameHas(recipeName, key){
  var n = recipeName.replace(/\s/g,'').replace(/떡갈비|햄버거|굴소스/g,'');
  if (n.indexOf(key) >= 0) return true;
  return L.guessIng(n) === key || n.indexOf(key.replace('고기','')) >= 0 && key.length>2;
}
function cleanStep(s){
  s = clean(s).replace(/\s*\n\s*/g,' ').replace(/^\s*\d+\s*[.)]\s*/,'').replace(/[a-z]\s*$/,'').replace(/\s+/g,' ').trim();
  if (s.length > 110) s = s.slice(0,108).replace(/\s\S*$/,'') + '…';
  return s;
}
var handNames = {}; L.RECIPES.forEach(function(r){ handNames[r.name.replace(/\s/g,'')] = 1; });
var seen = {}, out = [], dropped = {dup:0, parse:0, hand:0}, noKey = 0;
rows.sort(function(a,b){ return (+a.RCP_SEQ) - (+b.RCP_SEQ); });
rows.forEach(function(r){
  var name = String(r.RCP_NM||'').trim().replace(/\s+/g,' ');
  var nk = name.replace(/\s/g,'');
  if (handNames[nk]) { dropped.hand++; return; }
  if (seen[nk]) { dropped.dup++; return; }
  var parts = parseParts(r.RCP_PARTS_DTLS, name);
  var steps = []; for (var i=1;i<=20;i++){ var st = r['MANUAL'+(i<10?'0':'')+i]; if (st && st.trim()) steps.push(cleanStep(st)); }
  steps = steps.filter(Boolean).slice(0,6);
  if (parts.length < 2 || !steps.length) { dropped.parse++; return; }
  seen[nk] = 1;
  // 재료 → 앱 재료키
  var keys = {}, order = [];
  var maxG = 0; parts.forEach(function(p){ if (p.g != null && !/^물|육수|우유|두유/.test(p.nm) && p.g < 2000) maxG = Math.max(maxG, p.g); });
  parts.forEach(function(p, i){
    if (EXCLUDE.test(p.nm) && !/카레/.test(p.nm)) return;
    var k = L.guessIng(p.nm); if (!k) return;
    var inName = nameHas(name, k);
    var main;
    if (ALWAYS_MINOR[k]) main = false;
    else if (NAME_ONLY_MAIN[k]) main = inName;
    else main = inName || (p.g != null ? (p.g >= 50 || (p.g >= 25 && p.g >= 0.5*maxG)) : i < 3);
    if (!keys[k]) { keys[k] = {main:main}; order.push(k); } else if (main) keys[k].main = true;
  });
  // 주재료가 하나도 없으면 사전 재료 중 가장 앞의 것을 주재료로
  var mains = order.filter(function(k){ return keys[k].main; });
  if (!mains.length && order.length){
    var gOf = {}; parts.forEach(function(p){ var k = L.guessIng(p.nm); if (k && gOf[k] == null) gOf[k] = p.g; });
    var cand = order.filter(function(k){ return !ALWAYS_MINOR[k] && !NAME_ONLY_MAIN[k] && (gOf[k] == null || gOf[k] >= 20); });
    if (cand.length) keys[cand[0]].main = true;
  }
  // 주재료는 최대 3개 (이름에 들어간 재료 > 무게 순)
  var gMap = {}; parts.forEach(function(p){ var k = L.guessIng(p.nm); if (k && gMap[k] == null) gMap[k] = p.g == null ? 40 : p.g; });
  var ms = order.filter(function(k){ return keys[k].main; });
  if (ms.length > 3){
    ms.sort(function(a,b){ return (nameHas(name,b)?1e6:0) + (gMap[b]||0) - ((nameHas(name,a)?1e6:0) + (gMap[a]||0)); });
    ms.slice(3).forEach(function(k){ keys[k].main = false; });
  }
  if (!order.length) noKey++;
  var keyStr = order.map(function(k){ return k + (keys[k].main ? '*' : ''); }).join(',');
  var partStr = parts.map(function(p){ return p.amt ? p.nm + ' ' + p.amt : p.nm; }).join(', ');
  if (partStr.length > 220) partStr = partStr.slice(0,218).replace(/,[^,]*$/,'') + ' 외';
  var img = String(r.ATT_FILE_NO_MAIN||'').replace(/^https?:\/\/www\.foodsafetykorea\.go\.kr\//,'');
  var cat = CATS.indexOf(r.RCP_PAT2); if (cat < 0) cat = 5;
  var kcal = Math.round(parseFloat(r.INFO_ENG)) || 0;
  out.push([+r.RCP_SEQ, name, cat, kcal, img, keyStr, partStr, steps.join('\n')]);
});
var meta = {source:'식품의약품안전처 식품안전나라 「조리식품의 레시피 DB」(COOKRCP01) Open API', fetched:'2026-10-30', total:rows.length, kept:out.length, dropped:dropped, noKey:noKey};
var js = '// 자동 생성: build_pub.js — ' + meta.source + ', 수집 ' + meta.fetched + '\nvar PUB_META = ' + JSON.stringify(meta) + ';\nvar PUB_CATS = ' + JSON.stringify(CATS) + ';\nvar PUB_RAW = ' + JSON.stringify(out).replace(/\],\[/g,'],\n[') + ';\nif (typeof module !== "undefined") module.exports = {PUB_META:PUB_META, PUB_CATS:PUB_CATS, PUB_RAW:PUB_RAW};\n';
fs.writeFileSync(__dirname + '/../src/pub_data.js', js);
console.log(JSON.stringify(meta), 'bytes', Buffer.byteLength(js));
