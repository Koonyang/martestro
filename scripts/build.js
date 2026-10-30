#!/usr/bin/env node
// src/template.html + data/deals.json(내장 예비본) + src/pub_data.js + src/hand_recipes.js + src/logic.js → index.html (한 파일 앱)
const fs = require('fs'), path = require('path');
const R = p => path.join(__dirname, '..', p);
const deals = JSON.parse(fs.readFileSync(R('data/deals.json'), 'utf8'));
const code = 'var DEALS_DATA = ' + JSON.stringify(deals).replace(/</g, '\\u003c') + ';\n' +
  fs.readFileSync(R('src/pub_data.js'), 'utf8') + '\n' + fs.readFileSync(R('src/hand_recipes.js'), 'utf8') + '\n' + fs.readFileSync(R('src/logic.js'), 'utf8');
const t = fs.readFileSync(R('src/template.html'), 'utf8').split('/*LOGIC*/').join(code);
fs.writeFileSync(R('index.html'), t);
console.log('index.html', Buffer.byteLength(t), 'bytes');
