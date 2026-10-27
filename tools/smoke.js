/* 冒煙測試：node tools/smoke.js
   沒有瀏覽器也能跑：用簡易的假 DOM 載入真正的 data/engine/ai/ui，
   從標題一路玩到開票結算，檢查有沒有執行期錯誤、畫面上有沒有 undefined / NaN。
   另外用假的 fetch 測 AI 成功與失敗兩條路。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

/* ---------- 簡易假 DOM ---------- */
class Text { constructor(t) { this.nodeType = 3; this.data = String(t); } get textContent() { return this.data; } }
class El {
  constructor(tag) {
    this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {};
    this._cls = new Set(); this.style = { setProperty(k, v) { this[k] = v; } }; this.dataset = {}; this.parent = null;
    this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.offsetWidth = 1;
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get type() { return this.attrs.type; } set type(v) { this.attrs.type = v; }
  get classList() {
    const s = this._cls;
    return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !s.has(c) : f; if (on) s.add(c); else s.delete(c); return on; }, contains: (c) => s.has(c) };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener() {}
  append(...n) { n.forEach((x) => { if (typeof x === 'string') x = new Text(x); x.parent = this; this.children.push(x); }); }
  replaceChildren(...n) { this.children.forEach((c) => { c.parent = null; }); this.children = []; this.append(...n); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(new Text(v)); }
  focus() {} select() {}
  walk(fn) { fn(this); this.children.forEach((c) => c.walk && c.walk(fn)); }
  querySelectorAll(sel) {
    const out = []; const cls = sel.startsWith('.') ? sel.slice(1) : null;
    this.walk((n) => { if (n !== this && n.nodeType === 1 && (cls ? n._cls.has(cls) : n.tagName === sel.toUpperCase())) out.push(n); });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function makeEnv({ config, fetchImpl }) {
  const body = new El('body'); const app = new El('main');
  body.append(app);
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const win = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController,
    document: {
      body, getElementById: () => app, createElement: (t) => new El(t), createTextNode: (t) => new Text(t),
      addEventListener() {}, removeEventListener() {}, activeElement: null,
      querySelectorAll: (s) => body.querySelectorAll(s), querySelector: (s) => body.querySelector(s),
    },
    localStorage: mem(), sessionStorage: mem(),
    navigator: { vibrate() { return true; }, clipboard: { writeText: async () => {} } },
    location: { origin: 'https://example.github.io', pathname: '/taipei/' },
    matchMedia: () => ({ matches: true }),   // 當作「減少動態」，讓等待時間縮到最短
    scrollTo() {}, fetch: fetchImpl || (async () => { throw new TypeError('no network'); }),
  };
  win.window = win; win.self = win; win.globalThis = win;
  if (config) win.localStorage.setItem('tpmg.ai.v1', JSON.stringify(config));
  const ctx = vm.createContext(win);
  vm.runInContext('Date.now = () => (globalThis.__t = (globalThis.__t || 1e12) + 400);', ctx); // 讓小遊戲計時快轉
  ['data', 'engine', 'ai', 'ui'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));
  return { win, body, app };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findAll = (root, pred) => { const out = []; root.walk((n) => { if (n.nodeType === 1 && pred(n)) out.push(n); }); return out; };
const btn = (root, text) => findAll(root, (n) => n.tagName === 'BUTTON' && n.textContent.includes(text) && !n.disabled && !n.hidden)[0];
function click(el) { if (!el) throw new Error('找不到可點擊的元素'); (el.listeners.click || []).forEach((f) => f({ target: el, preventDefault() {} })); }
async function until(fn, label, ms = 4000) {
  const t0 = Date.now(); // 這是外層真實時間
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(10); }
  throw new Error('逾時等待：' + label);
}

const E = require('../js/engine.js');
function findSeedWith(eventId, playerId) {
  for (let seed = 1; seed < 5000; seed++) {
    const st = E.newGame({ playerId, difficulty: 'normal', seed });
    while (!st.finished) {
      const ev = E.getEvent(st);
      if (ev.id === eventId) return seed;
      const pick = ev.choices.find((c) => E.canAfford(st, c));
      E.choose(st, ev, pick.id, { tier: 0 });
      E.endRound(st);
    }
  }
  throw new Error('找不到含 ' + eventId + ' 的挑戰碼');
}
const MARKET_SEED = findSeedWith('night_market', 'bear');

const problems = [];
process.on('unhandledRejection', (e) => problems.push('未處理的 Promise 錯誤：' + (e && e.stack || e)));
function lint(app, where) {
  const t = app.textContent;
  if (/undefined|NaN|\[object/.test(t)) problems.push(`${where}：畫面出現 undefined/NaN/[object]：${t.match(/.{0,20}(undefined|NaN|\[object).{0,20}/)[0]}`);
}

async function playThrough(name, opts) {
  const { win, body, app } = makeEnv(opts);
  const seen = { screens: new Set(), aiEvents: 0, minis: 0, advice: 0, rounds: 0 };
  await sleep(20);
  lint(app, name + '/標題'); seen.screens.add('標題');
  click(btn(app, '怎麼玩')); lint(body, name + '/怎麼玩'); click(findAll(body, (n) => n._cls.has('sheet__close'))[0]);
  click(btn(app, '開始選戰'));
  await sleep(10); lint(app, name + '/選角'); seen.screens.add('選角');
  click(btn(app, '硬派')); click(btn(app, '輕鬆')); click(btn(app, '普通'));
  click(findAll(app, (n) => n._cls.has('cand'))[1]);
  const seedBox = findAll(app, (n) => n.tagName === 'INPUT' && n.attrs['aria-label'] === '挑戰碼')[0];
  seedBox.value = String(MARKET_SEED);
  click(btn(app, '就決定是你了'));

  for (let r = 0; r < 10; r++) {
    await until(() => findAll(app, (n) => n._cls.has('ticket')).length === 3, `第 ${r + 1} 週的選項`, 15000);
    lint(app, `${name}/第${r + 1}週`); seen.rounds++;
    if (findAll(app, (n) => n._cls.has('tag--ai')).length) seen.aiEvents++;
    if (r === 1 || r === 4) {
      click(btn(app, '問幕僚')); await sleep(30);
      if (findAll(app, (n) => n._cls.has('advice__text')).length) seen.advice++;
      lint(app, name + '/幕僚');
    }
    if (r === 2) { click(findAll(app, (n) => n._cls.has('pollbar'))[0]); lint(body, name + '/民調抽屜'); click(findAll(body, (n) => n._cls.has('sheet__close'))[0]); }
    // 優先挑小遊戲選項，其次挑第一個負擔得起的
    const tickets = findAll(app, (n) => n._cls.has('ticket') && !n.disabled);
    const pick = tickets.find((t) => t.textContent.includes('小遊戲')) || tickets[0];
    click(pick);
    const mini = await Promise.race([until(() => findAll(body, (n) => n._cls.has('mini__btn'))[0], '小遊戲', 600).catch(() => null), sleep(700).then(() => null)]);
    if (mini) {
      seen.minis++;
      for (let i = 0; i < 30; i++) (mini.listeners.pointerdown || []).forEach((f) => f({ preventDefault() {} }));
      await until(() => !findAll(body, (n) => n._cls.has('mini__btn')).length, '小遊戲結束', 8000);
    }
    await until(() => btn(app, r === 9 ? '前往開票之夜' : '進入第'), `第 ${r + 1} 週結果`, 8000);
    lint(app, `${name}/結果${r + 1}`);
    click(btn(app, r === 9 ? '前往開票之夜' : '進入第'));
  }
  await sleep(30);
  seen.screens.add('開票'); lint(app, name + '/開票');
  const skipBtn = btn(app, '快轉'); if (skipBtn) click(skipBtn);   // 開票動畫還在跑時可以快轉
  const reveal = await until(() => btn(app, '揭曉結果'), '開票完成', 15000);
  click(reveal);
  await sleep(30);
  seen.screens.add('結算'); lint(app, name + '/結算');
  const hasBallotStamp = findAll(app, (n) => n._cls.has('stamp--ballot')).length === 1;
  if (!hasBallotStamp) problems.push(name + '：結算畫面沒有圈選章');
  await until(() => !app.textContent.includes('正在整理開票之夜'), '選後報導', 8000);
  lint(app, name + '/報導');
  const report = findAll(app, (n) => n._cls.has('report__text'))[0].textContent;
  click(btn(app, '分享結果')); await sleep(10);
  click(btn(app, '再選一次')); await sleep(10); seen.screens.add('再來一局');
  // AI 設定視窗
  click(btn(app, '回標題') || findAll(app, (n) => n._cls.has('bar__back'))[0]); await sleep(10);
  click(btn(app, 'AI 設定')); lint(body, name + '/AI設定');
  const keyInput = findAll(body, (n) => n.tagName === 'INPUT' && n.attrs['aria-label'] === 'API 金鑰')[0];
  if (!keyInput) problems.push(name + '：AI 設定視窗找不到金鑰欄位');
  return { seen: { ...seen, screens: [...seen.screens] }, report, store: win.localStorage };
}

(async () => {
  const lines = [];
  // 1) 完全離線
  let r = await playThrough('離線', {});
  lines.push(['離線完整一局', r.seen, r.report.slice(0, 50)]);
  if (r.seen.minis < 1) problems.push('離線：沒有觸發夜市小遊戲');
  const saved = r.store.getItem('tpmg.save.v1');
  if (saved) problems.push('離線：開票後存檔應該被清除');

  // 2) AI 成功（假 fetch，依提示詞回不同內容）
  let calls = 0;
  const okFetch = async (url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    const system = body.system || '';
    let text;
    if (system.includes('編劇')) text = '```json\n' + JSON.stringify({ emoji: '🌧️', title: '雨傘大風波', scene: '連日大雨，市民在公車站擠成一團，大家都想知道你的對策。', choices: [
      { emoji: '☂️', label: '免費借傘站', sub: '全市設點', funds: 20, energy: 10, fx: { worker: 9, family: 9, youth: 9, senior: 9, vendor: 9, trust: 5 }, result: '借傘站大排長龍，大家都笑了。' },
      { emoji: '🚌', label: '加開公車', sub: '疏運人潮', funds: 30, energy: 20, fx: { worker: 8, senior: 6, scandal: -2 }, result: '公車司機對你比讚。' },
      { emoji: '📱', label: '發文關心', sub: '最省力', funds: 0, energy: 3, fx: { trust: 1 }, result: '大家按了愛心。' }] }) + '\n```';
    else if (system.includes('幕僚長')) text = '小聲說：記得顧好最弱的那一群，別讓他們覺得被忽略喔！';
    else if (system.includes('鴨鴨記者')) text = '開票之夜，台北的雨剛好停了。你靠著幾個關鍵決定一路追分，最後在十二個行政區都留下了足跡，現場的志工們抱在一起又笑又哭，記者鴨鴨也忍不住多拍了幾張照片，這是一場值得記住的選戰。';
    else text = 'OK';
    return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text }] }) };
  };
  r = await playThrough('AI成功', { config: { provider: 'anthropic', key: 'fake-test-key-0001', model: '', base: '', remember: true, enabled: true }, fetchImpl: okFetch });
  lines.push(['AI 成功（假 fetch）', { ...r.seen, fetchCalls: calls }, r.report.slice(0, 50)]);
  if (r.seen.aiEvents < 1) problems.push('AI成功：沒有出現 AI 突發快訊');
  if (!r.report.includes('開票之夜，台北的雨剛好停了')) problems.push('AI成功：結算沒有使用 AI 報導');

  // 3) AI 失敗（401）要自動退回內建內容，且錯誤訊息不能洩漏金鑰
  const badFetch = async () => ({ ok: false, status: 401, text: async () => 'invalid key fake-leak-canary-XYZ789' });
  r = await playThrough('AI失敗', { config: { provider: 'anthropic', key: 'fake-leak-canary-XYZ789', model: '', base: '', remember: true, enabled: true }, fetchImpl: badFetch });
  lines.push(['AI 失敗（401）', r.seen, r.report.slice(0, 50)]);
  if (r.report.includes('XYZ789')) problems.push('AI失敗：報導內容洩漏了金鑰');

  lines.forEach(([n, s, rep]) => console.log('✔', n, JSON.stringify(s), '\n   報導：', rep));
  if (problems.length) { console.log('\n❌ 發現問題：'); problems.forEach((p) => console.log(' -', p)); process.exit(1); }
  console.log('\n✅ 全部通過：沒有執行期錯誤、畫面沒有 undefined/NaN');
  process.exit(0);
})().catch((e) => { console.error('❌ 測試中斷：', e); process.exit(1); });
