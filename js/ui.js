/* ============================================================
   介面：所有畫面與互動
   - 一律用 createElement / textContent 渲染，AI 回傳的文字不會被當成 HTML
   - 沒有任何金鑰寫在這裡；金鑰由玩家在「AI 設定」自行輸入
   ============================================================ */
(function () {
  'use strict';
  const E = window.TPEngine, AI = window.TPAI, D = E.data;
  const CAND = Object.fromEntries(D.CANDIDATES.map((c) => [c.id, c]));
  const BLOC = Object.fromEntries(D.BLOCS.map((b) => [b.id, b]));
  const root = document.getElementById('app');
  const SAVE_KEY = 'tpmg.save.v1', STAT_KEY = 'tpmg.stats.v1', PREF_KEY = 'tpmg.pref.v1';
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 小工具 ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無痕模式 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const PROPS = new Set(['disabled', 'value', 'checked', 'hidden', 'selected', 'open']);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const sk of Object.keys(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; }
        } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (PROPS.has(k)) el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    kids.flat(Infinity).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 30) : ms));
  const num1 = (n) => { const r = Math.round(n * 10) / 10; return (r > 0 ? '+' : '') + (Number.isInteger(r) ? r : r.toFixed(1)); };
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const pct0 = (x) => Math.round(x * 100) + '%';

  /* ---------- 偏好、戰績、存檔 ---------- */
  const prefs = Object.assign({ sound: true, vibrate: true, difficulty: 'normal', lastCand: null }, store.get(PREF_KEY, {}));
  const savePrefs = () => store.set(PREF_KEY, prefs);
  const stats = () => Object.assign({ plays: 0, wins: 0, badges: {} }, store.get(STAT_KEY, {}));
  const loadSave = () => {
    const sv = store.get(SAVE_KEY, null);
    return sv && sv.s && sv.s.v === 1 && CAND[sv.s.playerId] ? sv : null;
  };
  const saveGame = () => { if (G.s) store.set(SAVE_KEY, { v: 1, s: G.s, t: Date.now() }); };

  /* ---------- 音效與震動（可關閉） ---------- */
  const Sfx = (() => {
    let ctx = null;
    function ensure() {
      if (ctx === null) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = false; } }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, gain, when) {
      if (!prefs.sound) return;
      const c = ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      const t = c.currentTime + (when || 0);
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain || 0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.03);
    }
    return {
      tap() { tone(660, 0.08, 'triangle', 0.05); },
      good() { tone(523, 0.1, 'triangle', 0.05); tone(784, 0.16, 'triangle', 0.05, 0.09); },
      bad() { tone(330, 0.16, 'sawtooth', 0.03); tone(247, 0.2, 'sawtooth', 0.03, 0.12); },
      stamp() { tone(110, 0.18, 'square', 0.07); tone(70, 0.28, 'sine', 0.1, 0.02); },
      win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.05, i * 0.11)); },
      lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.22, 'sine', 0.05, i * 0.16)); },
      count() { tone(880, 0.04, 'square', 0.02); },
    };
  })();
  const buzz = (ms) => { if (prefs.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } };

  /* ---------- 畫面骨架 ---------- */
  const G = { s: null, ev: null, busy: false, pending: {}, advice: {}, res: null, aiNotified: false };

  function mount(node) { root.replaceChildren(node); window.scrollTo(0, 0); }
  function toast(msg) {
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t);
    setTimeout(() => t.classList.add('is-out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  function openSheet(title, body) {
    const prevFocus = document.activeElement;
    const close = () => {
      backdrop.remove(); document.body.classList.remove('has-sheet');
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const closeBtn = h('button', { class: 'sheet__close', 'aria-label': '關閉', onclick: close }, '✕');
    const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'sheet__head' }, h('h2', { class: 'sheet__title' }, title), closeBtn),
        h('div', { class: 'sheet__body' }, body)));
    document.body.append(backdrop);
    document.body.classList.add('has-sheet');
    document.addEventListener('keydown', onKey);
    closeBtn.focus();
    return { close };
  }

  /* ============================================================
     標題畫面
     ============================================================ */
  function aiStatusText() {
    if (!AI.isReady()) return 'AI 未設定（不影響遊玩）';
    const c = AI.getConfig();
    return 'AI 已啟用：' + AI.PROVIDERS[c.provider].label.split('（')[0];
  }

  function showTitle() {
    const save = loadSave();
    const st = stats();
    const aiOn = AI.isReady();
    const soundBtn = h('button', { class: 'chipbtn', 'aria-pressed': String(prefs.sound), onclick: () => {
      prefs.sound = !prefs.sound; savePrefs(); soundBtn.textContent = prefs.sound ? '🔊 音效開' : '🔇 音效關';
      soundBtn.setAttribute('aria-pressed', String(prefs.sound)); Sfx.tap();
    } }, prefs.sound ? '🔊 音效開' : '🔇 音效關');

    mount(h('section', { class: 'screen title' },
      h('div', { class: 'title__logo' },
        h('h1', { class: 'logo' }, h('span', { class: 'logo__top' }, '台北市長'), h('span', { class: 'logo__big' }, '大作戰')),
        h('div', { class: 'stamp stamp--title', 'aria-hidden': 'true' }, '卜')),
      h('div', { class: 'title__trio', 'aria-hidden': 'true' },
        D.CANDIDATES.map((c) => h('div', { class: 'badge', style: { '--c': c.color } }, h('span', { class: 'badge__no' }, c.no), c.emoji))),
      h('p', { class: 'title__tag' }, '十週選戰，每個決定都會改變開票結果。'),
      h('div', { class: 'title__actions' },
        h('button', { class: 'btn btn--primary', onclick: () => { Sfx.tap(); showSelect(); } }, '開始選戰'),
        save && h('button', { class: 'btn btn--ghost', onclick: resumeGame },
          `繼續上次選戰（${CAND[save.s.playerId].emoji} ${save.s.finished ? '等待開票' : '第 ' + (save.s.round + 1) + ' 週'}）`)),
      h('div', { class: 'title__tools' },
        h('button', { class: 'chipbtn', onclick: openHowTo }, '📖 怎麼玩'),
        h('button', { class: 'chipbtn', onclick: () => openAISettings(() => showTitle()) },
          h('span', { class: 'dot' + (aiOn ? ' dot--on' : '') }), ' AI 設定'),
        soundBtn),
      h('p', { class: 'title__ai' }, aiStatusText()),
      st.plays > 0 && h('p', { class: 'title__stats' }, `累積 ${st.plays} 場，當選 ${st.wins} 次`),
      h('p', { class: 'fine' }, '遊戲純屬虛構：角色、政黨、行政區選民結構與所有數據皆為遊戲設定，與任何真實人物或政黨無關。')));
  }

  function openHowTo() {
    openSheet('怎麼玩', h('div', { class: 'prose' },
      h('p', null, '你是一位市長候選人，要在 10 週內做出決定，贏得 5 種選民的好感。'),
      h('ul', null,
        h('li', null, '每週一個事件、三個選項。選項上的 ↑↓ 是大致影響，🎲 代表有風險。'),
        h('li', null, '💰 資金和 ⚡ 體力有限，花光就只能選便宜的選項。'),
        h('li', null, '⭐ 形象會加成所有群體，💣 爭議會扣分，別讓它爆掉。'),
        h('li', null, '你的承諾會被記住，之後記者可能追問「錢從哪來」。'),
        h('li', null, '最後 12 個行政區各自開票，總得票最高的人當選。')),
      h('p', null, '🦉 幕僚長每局可以問 3 次。想和朋友比賽，輸入同一個「挑戰碼」就會遇到一樣的事件順序。')));
  }

  /* ============================================================
     選角畫面
     ============================================================ */
  function showSelect() {
    let picked = prefs.lastCand && CAND[prefs.lastCand] ? prefs.lastCand : D.CANDIDATES[0].id;
    let diff = prefs.difficulty;
    const seedInput = h('input', { class: 'input', type: 'text', inputmode: 'numeric', maxlength: '9', placeholder: '留空＝隨機', 'aria-label': '挑戰碼' });
    const cards = new Map();

    const cardFor = (c) => {
      const el = h('button', { class: 'cand', style: { '--c': c.color, '--soft': c.soft }, 'aria-pressed': String(c.id === picked), onclick: () => {
        picked = c.id; Sfx.tap();
        cards.forEach((node, id) => { node.classList.toggle('is-picked', id === picked); node.setAttribute('aria-pressed', String(id === picked)); });
      } },
        h('span', { class: 'cand__avatar' }, h('span', { class: 'cand__no' }, c.no), c.emoji),
        h('span', { class: 'cand__main' },
          h('span', { class: 'cand__name' }, c.name, h('span', { class: 'pill' }, c.party)),
          h('span', { class: 'cand__tag' }, c.tagline),
          h('span', { class: 'cand__bars', 'aria-hidden': 'true' },
            D.BLOCS.map((b) => h('span', { class: 'mbar' }, h('i', null, b.emoji),
              h('b', null, h('u', { style: { width: Math.max(8, Math.min(100, (c.base[b.id] - 28) / 36 * 100)) + '%' } }))))),
          h('span', { class: 'cand__perk' }, c.perk)));
      if (c.id === picked) el.classList.add('is-picked');
      cards.set(c.id, el);
      return el;
    };

    const diffs = [['easy', '輕鬆', '提示更多、對手較慢'], ['normal', '普通', '剛剛好'], ['hard', '硬派', '不顯示影響、對手更強']];
    const diffNote = h('p', { class: 'seg__note' }, diffs.find((d) => d[0] === diff)[2]);
    const segBtns = diffs.map(([id, label, note]) => h('button', { class: 'seg__btn' + (id === diff ? ' is-on' : ''), 'aria-pressed': String(id === diff), onclick: () => {
      diff = id; prefs.difficulty = id; savePrefs(); Sfx.tap(); diffNote.textContent = note;
      segBtns.forEach((b, i) => { const on = diffs[i][0] === id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    } }, label));

    mount(h('section', { class: 'screen select' },
      h('header', { class: 'bar' },
        h('button', { class: 'bar__back', 'aria-label': '回標題', onclick: showTitle }, '‹'),
        h('h2', { class: 'bar__title' }, '選你的候選人')),
      h('div', { class: 'cand-list' }, D.CANDIDATES.map(cardFor)),
      h('div', { class: 'seg', role: 'group', 'aria-label': '難度' }, segBtns),
      diffNote,
      h('details', { class: 'seed' },
        h('summary', null, '和朋友比賽？輸入挑戰碼'),
        h('label', { class: 'field' }, h('span', null, '挑戰碼（數字）'), seedInput)),
      h('div', { class: 'cta' },
        h('button', { class: 'btn btn--primary', onclick: () => {
          Sfx.tap(); prefs.lastCand = picked; savePrefs();
          const raw = seedInput.value.trim();
          startGame(picked, diff, /^\d{1,9}$/.test(raw) ? Number(raw) : undefined);
        } }, '就決定是你了！'))));
  }

  /* ============================================================
     遊戲流程
     ============================================================ */
  function startGame(candId, diff, seed) {
    G.s = E.newGame({ playerId: candId, difficulty: diff, seed });
    G.pending = {}; G.advice = {}; G.busy = false; G.aiNotified = false;
    saveGame();
    renderRound();
  }
  function resumeGame() {
    const sv = loadSave();
    if (!sv) { showTitle(); return; }
    G.s = sv.s; G.pending = {}; G.advice = {}; G.busy = false; G.aiNotified = false;
    if (G.s.finished) showElection(); else renderRound();
  }

  /* ---- AI 突發事件：提前在背景準備，沒準備好就用內建事件 ---- */
  function fetchAIEvent(round) {
    if (G.pending[round]) return G.pending[round];
    const snapshot = E.summary(G.s);
    const p = AI.generateEvent(snapshot, round)
      .then((ev) => { if (ev && G.s) G.s.aiEvents[round] = ev; })
      .catch((err) => {
        if (!G.aiNotified) { G.aiNotified = true; toast('AI 暫時無法使用：' + (err && err.message ? err.message : '未知錯誤') + ' 已改用內建事件。'); }
      })
      .finally(() => { delete G.pending[round]; });
    G.pending[round] = p;
    return p;
  }
  function prefetchAI() {
    if (!AI.isReady()) return;
    const s = G.s;
    E.aiSlots(s).forEach((slot) => {
      if (s.round >= slot - 2 && s.round < slot && !s.aiEvents[slot] && !G.pending[slot]) fetchAIEvent(slot);
    });
  }
  async function ensureAIEvent() {
    const s = G.s;
    if (!E.aiSlots(s).includes(s.round) || s.aiEvents[s.round] || !AI.isReady()) return;
    mount(h('section', { class: 'screen loading' },
      h('div', { class: 'loading__emoji', 'aria-hidden': 'true' }, D.REPORTER.emoji),
      h('p', { class: 'loading__text' }, '鴨鴨正在打聽突發快訊…')));
    const p = G.pending[s.round] || fetchAIEvent(s.round);
    await Promise.race([p, new Promise((r) => setTimeout(r, 9000))]);
  }

  /* ---- HUD ---- */
  function buildHUD() {
    const s = G.s;
    const shares = E.poll(s).shares;
    const stations = [];
    for (let i = 0; i < s.total; i++) {
      stations.push(h('span', { class: 'st' + (i < s.round ? ' st--done' : '') + (i === s.round ? ' st--now' : '') + (i === s.total - 1 ? ' st--end' : '') }, i === s.total - 1 ? '卜' : ''));
    }
    const left = s.total - s.round;
    const res = (emoji, label, val, cls) => h('div', { class: 'res ' + cls, title: label },
      h('span', { class: 'res__top' }, h('span', { class: 'res__emoji', 'aria-hidden': 'true' }, emoji), h('b', null, Math.round(val)), h('span', { class: 'sr' }, label)),
      h('span', { class: 'res__bar' }, h('i', { style: { width: Math.max(0, Math.min(100, val)) + '%' } })));
    const bar = h('button', { class: 'pollbar', 'aria-label': '查看詳細民調', onclick: openPollSheet },
      D.CANDIDATES.slice().sort((a, b) => a.no - b.no).map((c) => h('span', { class: 'pollbar__seg' + (c.id === s.playerId ? ' is-you' : ''), style: { '--c': c.color, flexGrow: String(Math.max(0.12, shares[c.id])) } },
        h('span', null, c.emoji, ' ', pct0(shares[c.id])))));
    return h('div', { class: 'hud' },
      h('div', { class: 'line', role: 'img', 'aria-label': `第 ${s.round + 1} 週，共 ${s.total} 週` },
        h('span', { class: 'line__track' }),
        h('span', { class: 'line__done', style: { width: (s.round / (s.total - 1) * 100) + '%' } }),
        stations),
      h('p', { class: 'hud__week' }, left === 1 ? '最後一週！' : `第 ${s.round + 1} 週`, h('span', null, left === 1 ? '投票日就在眼前' : `距離投票日還有 ${left} 週`)),
      h('div', { class: 'res-row' },
        res('💰', '資金', s.funds, 'res--funds'), res('⚡', '體力', s.energy, 'res--energy'),
        res('⭐', '形象', s.trust, 'res--trust'), res('💣', '爭議', s.scandal, 'res--scandal')),
      bar);
  }

  /* ---- 一週的決策畫面 ---- */
  async function renderRound() {
    const s = G.s;
    await ensureAIEvent();
    const ev = E.getEvent(s);
    G.ev = ev; G.busy = false;
    const me = CAND[s.playerId];
    const choices = E.describeChoices(s, ev);

    const adviceBox = h('div', { class: 'advice', 'aria-live': 'polite' });
    if (G.advice[s.round]) fillAdvice(adviceBox, G.advice[s.round]);
    const adviceBtn = h('button', { class: 'chipbtn chipbtn--owl', onclick: () => askAdvisor(adviceBtn, adviceBox) },
      `${D.ADVISOR.emoji} 問幕僚（剩 ${s.advisorLeft} 次）`);
    if (s.advisorLeft <= 0 && !G.advice[s.round]) adviceBtn.disabled = true;

    const tickets = choices.map((c) => h('button', {
      class: 'ticket' + (c.affordable ? '' : ' is-locked'), disabled: !c.affordable, 'data-id': c.id, onclick: () => onPick(c.id),
    },
      h('span', { class: 'ticket__stub', 'aria-hidden': 'true' }, c.e),
      h('span', { class: 'ticket__body' },
        h('span', { class: 'ticket__label' }, c.label,
          c.risky && h('span', { class: 'tag tag--risk' }, '🎲 賭一把'),
          c.mini && h('span', { class: 'tag tag--mini' }, '🕹️ 小遊戲')),
        h('span', { class: 'ticket__sub' }, c.sub),
        h('span', { class: 'ticket__meta' },
          c.cost.funds || c.cost.energy
            ? [c.cost.funds ? h('span', { class: 'cost' }, '💰' + c.cost.funds) : null, c.cost.energy ? h('span', { class: 'cost' }, '⚡' + c.cost.energy) : null]
            : h('span', { class: 'cost cost--free' }, '免費'),
          c.hints.map((x) => h('span', { class: 'hint ' + (x.good ? 'hint--good' : 'hint--bad'), title: x.emoji }, x.emoji + (x.dir > 0 ? '↑' : '↓') + (x.strong ? '↑' : ''))),
          !c.affordable && h('span', { class: 'cost cost--lock' }, '資源不足')))));

    mount(h('section', { class: 'screen play', style: { '--c': me.color, '--soft': me.soft } },
      buildHUD(),
      h('article', { class: 'scene' },
        h('div', { class: 'scene__head' },
          h('span', { class: 'scene__emoji', 'aria-hidden': 'true' }, ev.emoji),
          h('h2', { class: 'scene__title' }, ev.title),
          ev.ai && h('span', { class: 'tag tag--ai' }, '🤖 AI 快訊')),
        h('p', { class: 'scene__text' }, ev.scene),
        h('div', { class: 'scene__tools' }, adviceBtn),
        adviceBox),
      h('div', { class: 'tickets', role: 'group', 'aria-label': '選擇你的決定' }, tickets)));
    prefetchAI();
  }

  function fillAdvice(box, a) {
    box.replaceChildren(h('p', { class: 'advice__text' }, a.text, a.ai && h('span', { class: 'tag tag--ai' }, '🤖')));
  }
  async function askAdvisor(btn, box) {
    const s = G.s;
    if (G.advice[s.round]) { toast('這週已經問過了'); return; }
    if (s.advisorLeft <= 0) return;
    s.advisorLeft -= 1;
    btn.disabled = true;
    btn.textContent = `${D.ADVISOR.emoji} 剩 ${s.advisorLeft} 次`;
    Sfx.tap();
    let advice = { text: E.adviseOffline(s, G.ev), ai: false };
    if (AI.isReady()) {
      box.replaceChildren(h('p', { class: 'advice__text advice__text--wait' }, `${D.ADVISOR.emoji} 讓我想想……`));
      try {
        const t = await AI.advise(E.summary(s), G.ev);
        if (t) advice = { text: D.ADVISOR.emoji + ' ' + t, ai: true };
      } catch (e) { /* 失敗就用離線建議 */ }
    }
    G.advice[s.round] = advice;
    if (G.s === s && G.ev) fillAdvice(box, advice);
    saveGame();
  }

  /* ---- 選擇之後 ---- */
  async function onPick(id) {
    if (G.busy) return;
    G.busy = true;
    const s = G.s, ev = G.ev;
    const ch = ev.choices.find((c) => c.id === id);
    document.querySelectorAll('.ticket').forEach((t) => { t.disabled = true; if (t.dataset.id === id) t.classList.add('is-picked'); else t.classList.add('is-dim'); });
    Sfx.tap(); buzz(12);
    await sleep(260);

    let tier = 0;
    if (ch.mini) tier = await runTapGame(ch);

    const before = E.poll(s).shares;
    const res = E.choose(s, ev, id, { tier });
    if (res.error) { toast('這個選項現在不能選'); G.busy = false; renderRound(); return; }
    const week = s.round + 1;
    const news = E.endRound(s);
    const after = E.poll(s).shares;
    saveGame();
    G.busy = false;
    const gainSum = Object.keys(res.deltas).reduce((a, k) => a + (k === 'scandal' ? -res.deltas[k] : res.deltas[k]), 0);
    if (gainSum >= 0) { Sfx.good(); buzz(20); } else { Sfx.bad(); buzz([30, 40, 30]); }
    showResult({ ev, ch, res, news, before, after, week });
  }

  /* ---- 夜市掃街小遊戲 ---- */
  function runTapGame(ch) {
    return new Promise((resolve) => {
      const secs = ch.mini.secs, [t1, t2] = ch.mini.at;
      let taps = 0, started = false, finished = false, endAt = 0, timer = null;
      const count = h('div', { class: 'mini__count', 'aria-live': 'off' }, '0');
      const timeBar = h('div', { class: 'mini__time' }, h('i'));
      const prompt = h('p', { class: 'mini__prompt' }, '點一下就開始！');
      const target = h('button', { class: 'mini__btn', 'aria-label': '握手' }, '🤝');
      const stars = h('div', { class: 'mini__stars', 'aria-hidden': 'true' }, '☆☆☆');
      const overlay = h('div', { class: 'mini', role: 'dialog', 'aria-modal': 'true', 'aria-label': '夜市掃街小遊戲' },
        h('div', { class: 'mini__card' },
          h('h3', { class: 'mini__title' }, '夜市掃街！'),
          h('p', { class: 'mini__hint' }, `${secs} 秒內狂點，握越多手越好`),
          timeBar, count, target, stars, prompt));
      document.body.append(overlay);
      document.body.classList.add('has-sheet');

      const update = () => {
        count.textContent = String(taps);
        stars.textContent = (taps >= t1 ? '★' : '☆') + (taps >= t2 ? '★' : '☆') + (taps >= t2 * 1.4 ? '★' : '☆');
      };
      const finish = () => {
        if (finished) return;
        finished = true; clearInterval(timer);
        target.disabled = true;
        const tier = taps >= t2 ? 2 : taps >= t1 ? 1 : 0;
        prompt.textContent = tier === 2 ? '神之手！' : tier === 1 ? '不錯喔！' : '手有點酸……';
        (tier ? Sfx.good : Sfx.bad)();
        setTimeout(() => { overlay.remove(); document.body.classList.remove('has-sheet'); resolve(tier); }, reduceMotion ? 100 : 1100);
      };
      target.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (finished) return;
        if (!started) {
          started = true; endAt = Date.now() + secs * 1000;
          timeBar.classList.add('is-run'); timeBar.firstChild.style.animationDuration = secs + 's';
          prompt.textContent = '快快快！';
          timer = setInterval(() => { if (Date.now() >= endAt) finish(); }, 50);
        }
        taps += 1; update(); Sfx.count(); buzz(6);
        target.classList.remove('is-hit'); void target.offsetWidth; target.classList.add('is-hit');
      });
      target.focus();
    });
  }

  /* ---- 一週結果 ---- */
  function chip(emoji, value, kind) {
    const good = kind === 'scandal' ? value < 0 : value > 0;
    return h('span', { class: 'delta ' + (good ? 'delta--up' : 'delta--down') }, emoji, ' ', num1(value));
  }
  function showResult({ ev, ch, res, news, before, after, week }) {
    const s = G.s;
    const me = CAND[s.playerId];
    const d = res.deltas;
    const chips = [];
    D.BLOCS.forEach((b) => { if (d[b.id]) chips.push(chip(b.emoji, d[b.id], 'bloc')); });
    if (d.trust) chips.push(chip('⭐', d.trust, 'trust'));
    if (d.scandal) chips.push(chip('💣', d.scandal, 'scandal'));
    const costs = [];
    if (res.cost.funds) costs.push(h('span', { class: 'cost' }, '💰 -' + res.cost.funds));
    if (res.cost.energy) costs.push(h('span', { class: 'cost' }, '⚡ -' + res.cost.energy));

    const outcomeTag = res.outcome === 'luck' ? h('span', { class: 'tag tag--luck' }, '🍀 賭贏了') : res.outcome === 'risk' ? h('span', { class: 'tag tag--risk' }, '💥 出狀況') : null;

    const newsItems = news.map((n) => h('li', { class: 'news__item news__item--' + n.kind },
      h('span', { class: 'news__who', style: { '--c': CAND[n.who].color } }, n.emoji),
      h('span', { class: 'news__text' }, n.text,
        n.kind === 'move' && h('span', { class: 'delta delta--rival' }, BLOC[n.bloc].emoji, ' ↑'),
        n.kind === 'attack' && n.deltas && Object.keys(n.deltas).map((k) => chip(k === 'trust' ? '⭐' : BLOC[k].emoji, n.deltas[k], k)))));

    const rows = D.CANDIDATES.slice().sort((a, b) => after[b.id] - after[a.id]).map((c) => {
      const diff = (after[c.id] - before[c.id]) * 100;
      return h('li', { class: 'rank' + (c.id === s.playerId ? ' is-you' : ''), style: { '--c': c.color } },
        h('span', { class: 'rank__who' }, c.emoji, ' ', c.name),
        h('span', { class: 'rank__bar' }, h('i', { style: { width: (after[c.id] * 100) + '%' } })),
        h('b', { class: 'rank__pct' }, pct(after[c.id])),
        h('span', { class: 'rank__diff ' + (diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : '') }, Math.abs(diff) < 0.05 ? '–' : num1(diff)));
    });

    const last = s.finished;
    mount(h('section', { class: 'screen result', style: { '--c': me.color, '--soft': me.soft } },
      h('header', { class: 'result__head' }, h('span', { class: 'result__wk' }, `第 ${week} 週`), h('h2', null, ev.title)),
      h('article', { class: 'bubble', 'aria-live': 'polite' },
        h('div', { class: 'bubble__who', 'aria-hidden': 'true' }, me.emoji),
        h('div', { class: 'bubble__main' },
          h('p', { class: 'bubble__pick' }, ch.e, ' ', ch.label, outcomeTag),
          h('p', { class: 'bubble__text' }, res.text),
          res.notes.length > 0 && h('p', { class: 'bubble__notes' }, res.notes.join(' ')),
          h('div', { class: 'chips' }, chips, costs))),
      h('article', { class: 'news' },
        h('h3', { class: 'news__title' }, D.REPORTER.emoji, ' 鴨鴨快報'),
        h('ul', { class: 'news__list' }, newsItems)),
      h('article', { class: 'rankbox' },
        h('h3', { class: 'news__title' }, '📊 最新民調', h('small', null, '（誤差 ±3%）')),
        h('ul', { class: 'rank-list' }, rows)),
      h('div', { class: 'cta cta--sticky' },
        h('button', { class: 'btn btn--primary', onclick: () => { Sfx.tap(); if (last) showElection(); else renderRound(); } },
          last ? '前往開票之夜 🗳️' : `進入第 ${week + 1} 週`))));
  }

  /* ---- 民調詳情 ---- */
  function openPollSheet() {
    const s = G.s;
    const p = E.poll(s);
    const cands = D.CANDIDATES.slice().sort((a, b) => a.no - b.no);
    const seg = (c, share) => h('span', { class: 'stack__seg', style: { '--c': c.color, flexGrow: String(Math.max(0.1, share)) } }, Math.round(share * 100));
    const rows = D.BLOCS.map((b) => h('div', { class: 'stack' },
      h('span', { class: 'stack__label' }, b.emoji, ' ', b.name),
      h('span', { class: 'stack__bar' }, cands.map((c) => seg(c, p.blocs[b.id][c.id])))));
    openSheet('各群體民調', h('div', null,
      h('p', { class: 'legend' }, cands.map((c) => h('span', { class: 'legend__i', style: { '--c': c.color } }, c.emoji, ' ', c.name, c.id === s.playerId ? '（你）' : ''))),
      h('div', { class: 'stacks' }, rows),
      h('p', { class: 'fine' }, `⭐ 形象 ${Math.round(s.trust)} 會加成所有群體；💣 爭議 ${Math.round(s.scandal)} 會扣分。數字是各群體中的支持比例（%）。`)));
  }

  /* ============================================================
     開票之夜
     ============================================================ */
  async function showElection() {
    store.del(SAVE_KEY);
    const s = G.s;
    const res = E.finalElection(s);
    G.res = res;
    let skip = false;
    const tiles = new Map();
    const grid = h('div', { class: 'map', role: 'img', 'aria-label': '台北十二個行政區開票地圖' },
      D.DISTRICTS.map((d) => {
        const t = h('div', { class: 'tile', style: { gridColumn: String(d.col + 1), gridRow: String(d.row + 1) } },
          h('span', { class: 'tile__name' }, d.name), h('span', { class: 'tile__who' }, '？'));
        tiles.set(d.id, t); return t;
      }));
    const cands = D.CANDIDATES.slice().sort((a, b) => a.no - b.no);
    const segs = new Map();
    const bar = h('div', { class: 'count__bar' }, cands.map((c) => {
      const el = h('div', { class: 'count__seg', style: { '--c': c.color, flexGrow: '1' } }, c.emoji, ' ', h('b', null, '—'));
      segs.set(c.id, el); return el;
    }));
    const status = h('p', { class: 'count__status', 'aria-live': 'polite' }, '準備開票……');
    const skipBtn = h('button', { class: 'btn btn--ghost btn--small', onclick: () => { skip = true; } }, '快轉');
    const nextBtn = h('button', { class: 'btn btn--primary', hidden: true, onclick: () => showFinal(res) }, '揭曉結果');

    mount(h('section', { class: 'screen election' },
      h('header', { class: 'bar' }, h('h2', { class: 'bar__title' }, '開票之夜')),
      status, bar, grid,
      h('div', { class: 'cta' }, skipBtn, nextBtn)));

    const order = res.districts.slice().sort((a, b) => a.pop - b.pop);
    let W = 0; const sums = {}; D.CANDIDATES.forEach((c) => { sums[c.id] = 0; });
    await sleep(500);
    for (let i = 0; i < order.length; i++) {
      const d = order[i];
      const c = CAND[d.winner];
      const t = tiles.get(d.id);
      t.style.setProperty('--c', c.color);
      t.classList.add('is-open');
      t.querySelector('.tile__who').textContent = c.emoji;
      W += d.pop; D.CANDIDATES.forEach((x) => { sums[x.id] += d.pop * d.shares[x.id]; });
      D.CANDIDATES.forEach((x) => {
        const sh = sums[x.id] / W;
        segs.get(x.id).style.flexGrow = String(Math.max(0.12, sh));
        segs.get(x.id).querySelector('b').textContent = pct0(sh);
      });
      status.textContent = `已開出 ${i + 1} / ${order.length} 區：${d.name}`;
      Sfx.count();
      if (!skip) await sleep(i > order.length - 4 ? 1000 : 620);
    }
    status.textContent = '12 個行政區全部開完！';
    skipBtn.hidden = true; nextBtn.hidden = false; nextBtn.focus();
  }

  /* ============================================================
     結算
     ============================================================ */
  function confetti() {
    if (reduceMotion) return;
    const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    const bits = ['🎉', '🧋', '🌸', '⭐', '🎊', '🍀'];
    for (let i = 0; i < 36; i++) {
      layer.append(h('span', { style: { left: Math.random() * 100 + '%', animationDelay: (Math.random() * 1.6) + 's', animationDuration: (2.6 + Math.random() * 2) + 's', fontSize: (16 + Math.random() * 16) + 'px' } }, bits[i % bits.length]));
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 6500);
  }

  function updateStats(res, ending) {
    const st = stats();
    st.plays += 1; if (res.won) st.wins += 1;
    const fresh = [];
    ending.badges.forEach((b) => { if (!st.badges[b.id]) { st.badges[b.id] = true; fresh.push(b.id); } });
    store.set(STAT_KEY, st);
    return fresh;
  }

  function showFinal(res) {
    const s = G.s;
    const me = CAND[s.playerId];
    const ending = E.computeEnding(s, res);
    const fresh = updateStats(res, ending);
    const winner = CAND[res.winner];
    const cands = D.CANDIDATES.slice().sort((a, b) => a.no - b.no);

    const ballot = h('div', { class: 'ballot' },
      h('div', { class: 'ballot__head' }, h('b', null, '台北市長選舉票'), h('small', null, '（遊戲虛構）')),
      cands.map((c) => h('div', { class: 'ballot__row' + (c.id === res.winner ? ' is-winner' : ''), style: { '--c': c.color } },
        h('span', { class: 'ballot__no' }, c.no),
        h('span', { class: 'ballot__who' }, h('span', { class: 'ballot__emoji', 'aria-hidden': 'true' }, c.emoji),
          h('span', null, h('b', null, c.name), h('small', null, c.party))),
        h('span', { class: 'ballot__box' }, c.id === res.winner && h('span', { class: 'stamp stamp--ballot', 'aria-hidden': 'true' }, '卜')))));

    const rank = res.ranking.map((id, i) => {
      const c = CAND[id];
      return h('li', { class: 'rank' + (id === s.playerId ? ' is-you' : ''), style: { '--c': c.color } },
        h('span', { class: 'rank__who' }, i === 0 ? '👑' : '', c.emoji, ' ', c.name),
        h('span', { class: 'rank__bar' }, h('i', { style: { width: (res.shares[id] * 100) + '%' } })),
        h('b', { class: 'rank__pct' }, pct(res.shares[id])),
        h('span', { class: 'rank__diff' }, `${res.districtsWon[id]} 區`));
    });

    const reportBody = h('p', { class: 'report__text' }, '正在整理開票之夜的報導……');
    const reportTag = h('span', { class: 'tag tag--ai', hidden: true }, '🤖 AI 撰寫');
    const recap = s.history.map((hh) => h('li', { class: 'recap__item' },
      h('span', { class: 'recap__wk' }, hh.round + 1),
      h('span', { class: 'recap__text' }, h('b', null, hh.emoji, ' ', hh.title), h('span', null, hh.e, ' ', hh.label,
        hh.outcome === 'luck' && ' 🍀', hh.outcome === 'risk' && ' 💥'))));
    const badges = ending.badges.length
      ? h('div', { class: 'badges' }, ending.badges.map((b) => h('span', { class: 'bdg' + (fresh.includes(b.id) ? ' is-new' : '') }, b.emoji, ' ', b.name, fresh.includes(b.id) && h('i', null, 'NEW'))))
      : null;

    const url = location.origin + location.pathname;
    const shareMsg = E.shareText(s, res, ending, url);

    mount(h('section', { class: 'screen final' + (res.won ? ' is-win' : ''), style: { '--c': me.color, '--soft': me.soft } },
      h('header', { class: 'bar' }, h('h2', { class: 'bar__title' }, '開票結果')),
      ballot,
      h('article', { class: 'verdict ' + (res.won ? 'verdict--win' : 'verdict--lose') },
        h('div', { class: 'verdict__emoji', 'aria-hidden': 'true' }, ending.emoji),
        h('h3', { class: 'verdict__title' }, res.won ? `恭喜當選！${ending.title}` : `${winner.name}當選・${ending.title}`),
        h('p', { class: 'verdict__desc' }, ending.desc),
        badges),
      h('article', { class: 'rankbox' },
        h('h3', { class: 'news__title' }, '🗳️ 最終得票'),
        h('ul', { class: 'rank-list' }, rank),
        h('p', { class: 'fine' }, `得票數為遊戲示意值（以約 ${(E.CONFIG.voters / 10000).toFixed(0)} 萬票換算）。`)),
      h('article', { class: 'report' },
        h('h3', { class: 'news__title' }, D.REPORTER.emoji, ' 鴨鴨開票特報', reportTag), reportBody),
      h('article', { class: 'recap' },
        h('h3', { class: 'news__title' }, '🧭 你的十週決策'),
        h('ol', { class: 'recap__list' }, recap)),
      h('div', { class: 'cta cta--stack' },
        h('button', { class: 'btn btn--primary', onclick: () => { Sfx.tap(); showSelect(); } }, '再選一次'),
        h('div', { class: 'cta__row' },
          h('button', { class: 'btn btn--ghost', onclick: () => shareResult(shareMsg) }, '分享結果'),
          h('button', { class: 'btn btn--ghost', onclick: () => copyText(String(s.seed), '挑戰碼已複製：' + s.seed) }, `挑戰碼 ${s.seed}`),
          h('button', { class: 'btn btn--ghost', onclick: showTitle }, '回標題')))));

    // 全場焦點：圈選章蓋下去
    setTimeout(() => { Sfx.stamp(); buzz([30, 30, 60]); }, reduceMotion ? 0 : 900);
    setTimeout(() => { if (res.won) { Sfx.win(); confetti(); } else Sfx.lose(); }, reduceMotion ? 0 : 1500);

    writeReport(res, ending, reportBody, reportTag);
  }

  async function writeReport(res, ending, bodyEl, tagEl) {
    const s = G.s;
    const fallback = E.reportFallback(s, res, ending);
    if (!AI.isReady()) { bodyEl.textContent = fallback; return; }
    try {
      const info = {
        結果: res.won ? '玩家當選' : '玩家落選',
        玩家: CAND[s.playerId].name + '（' + CAND[s.playerId].party + '）',
        得票率: Object.fromEntries(D.CANDIDATES.map((c) => [c.name, pct(res.shares[c.id])])),
        玩家拿下行政區: res.districtsWon[s.playerId] + '/12',
        結局: ending.title,
        形象: Math.round(s.trust), 爭議: Math.round(s.scandal),
        關鍵決定: s.history.map((h2) => ({ 週: h2.round + 1, 事件: h2.title, 選擇: h2.label, 結果: h2.outcome === 'luck' ? '賭贏了' : h2.outcome === 'risk' ? '出狀況' : '一般' })),
      };
      const text = await AI.report(info);
      if (text) { bodyEl.textContent = text; tagEl.hidden = false; return; }
    } catch (e) { /* 失敗就用內建報導 */ }
    bodyEl.textContent = fallback;
  }

  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.append(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (e2) { toast('複製失敗，請手動記下：' + text); }
      ta.remove();
    }
  }
  async function shareResult(msg) {
    if (navigator.share) { try { await navigator.share({ title: '台北市長大作戰', text: msg }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(msg, '結果已複製，貼給朋友吧！');
  }

  /* ============================================================
     AI 設定（玩家自帶金鑰）
     ============================================================ */
  function openAISettings(onDone) {
    const cfg = AI.getConfig();
    const P = AI.PROVIDERS;
    const sel = h('select', { class: 'input', 'aria-label': 'AI 服務商' }, Object.keys(P).map((id) => h('option', { value: id, selected: id === cfg.provider }, P[id].label)));
    sel.value = cfg.provider;   // 明確指定，避免個別瀏覽器沒有套用 option 的 selected
    const keyInput = h('input', { class: 'input', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: cfg.key, 'aria-label': 'API 金鑰' });
    const showKey = h('button', { class: 'chipbtn', type: 'button', onclick: () => { const on = keyInput.type === 'password'; keyInput.type = on ? 'text' : 'password'; showKey.textContent = on ? '隱藏' : '顯示'; } }, '顯示');
    const modelInput = h('input', { class: 'input', type: 'text', autocomplete: 'off', value: cfg.model, 'aria-label': '模型名稱' });
    const baseInput = h('input', { class: 'input', type: 'url', autocomplete: 'off', value: cfg.base, 'aria-label': 'API 網址' });
    const baseField = h('label', { class: 'field' }, h('span', null, 'API 網址（OpenAI 相容才需要）'), baseInput);
    const remember = h('input', { type: 'checkbox', checked: cfg.remember });
    const enabled = h('input', { type: 'checkbox', checked: cfg.enabled !== false });
    const note = h('p', { class: 'fine' });
    const result = h('p', { class: 'testresult', 'aria-live': 'polite' });

    const sync = () => {
      const p = P[sel.value];
      modelInput.placeholder = p.model + '（預設）';
      keyInput.placeholder = p.keyHint;
      baseInput.placeholder = p.base || '';
      baseField.hidden = sel.value !== 'openai';
      note.textContent = p.note;
    };
    sel.addEventListener('change', sync);
    sync();

    const read = () => ({ provider: sel.value, key: keyInput.value, model: modelInput.value, base: baseInput.value, remember: remember.checked, enabled: enabled.checked });

    const testBtn = h('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: async () => {
      AI.saveConfig(read());
      result.className = 'testresult'; result.textContent = '測試中……'; testBtn.disabled = true;
      try { const r = await AI.test(); result.className = 'testresult is-ok'; result.textContent = `連線成功（${r.ms} 毫秒）`; }
      catch (e) { result.className = 'testresult is-bad'; result.textContent = e.message || '連線失敗'; }
      testBtn.disabled = false;
    } }, '測試連線');

    let sheet;
    const body = h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      AI.saveConfig(read()); toast(AI.isReady() ? 'AI 設定已儲存' : '已儲存（尚未填金鑰，AI 不會啟用）');
      sheet.close(); if (onDone) onDone();
    } },
      h('p', { class: 'prose-p' }, 'AI 是選配！不設定也能完整遊玩。啟用後，會多出隨機的「AI 突發快訊」、更貼心的幕僚建議，以及開票後的專屬報導。每局約呼叫 3～6 次。'),
      h('label', { class: 'field' }, h('span', null, 'AI 服務商'), sel),
      h('div', { class: 'field' }, h('span', null, 'API 金鑰'), h('div', { class: 'row' }, keyInput, showKey)),
      h('label', { class: 'field' }, h('span', null, '模型（可留空使用預設）'), modelInput),
      baseField,
      note,
      h('label', { class: 'check' }, remember, h('span', null, '記住在這台裝置（存在這個瀏覽器）。公用電腦請不要勾選。')),
      h('label', { class: 'check' }, enabled, h('span', null, '啟用 AI 功能')),
      h('div', { class: 'safe' },
        h('b', null, '🔒 關於金鑰安全'),
        h('ul', null,
          h('li', null, '金鑰只會存在你的瀏覽器，並且只傳送給你選的 AI 服務商，遊戲網站本身沒有伺服器。'),
          h('li', null, '請使用你自己的金鑰，並在服務商後台設定用量上限。'),
          h('li', null, '不要把金鑰貼到網址、截圖或公開的程式碼裡。')),
      ),
      h('div', { class: 'row row--end' },
        h('button', { class: 'btn btn--ghost btn--small', type: 'button', onclick: () => {
          AI.clearConfig(); keyInput.value = ''; modelInput.value = ''; baseInput.value = ''; result.textContent = '已清除這台裝置上的金鑰。'; result.className = 'testresult';
        } }, '清除金鑰'),
        testBtn),
      result,
      h('div', { class: 'cta cta--inline' }, h('button', { class: 'btn btn--primary', type: 'submit' }, '儲存')));
    sheet = openSheet('AI 設定', body);
  }

  /* ---------- 啟動 ---------- */
  showTitle();
})();
