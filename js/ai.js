/* ============================================================
   AI 模組：玩家自帶 API 金鑰（BYOK）

   ★ 這個 repo 是公開的，所以「絕對不要」把任何金鑰寫進程式碼。
   ★ 金鑰只會存在玩家自己瀏覽器的 localStorage / sessionStorage，
     而且只會送往玩家自己選的 AI 服務商。
   ★ AI 沒設定也能完整遊玩，AI 只負責：突發快訊、幕僚悄悄話、選後報導。
   ============================================================ */
(function (root, factory) {
  root.TPAI = factory(root.TPEngine, root.TPData);
})(typeof self !== 'undefined' ? self : this, function (E, D) {

  const STORE_KEY = 'tpmg.ai.v1';
  const MAX_CALLS_PER_PAGE = 40;     // 保護玩家的額度：一次開啟頁面最多呼叫次數
  let calls = 0;

  const PROVIDERS = {
    anthropic: {
      label: 'Anthropic（Claude）',
      model: 'claude-haiku-5-5',
      keyHint: 'sk-ant-…',
      note: '金鑰到 console.anthropic.com 建立；建議設定每月用量上限。',
    },
    openai: {
      label: 'OpenAI 相容（OpenAI / OpenRouter / 本機模型）',
      model: 'gpt-4o-mini',
      base: 'https://api.openai.com/v1',
      keyHint: 'sk-…（本機模型可留空）',
      note: '任何支援 /chat/completions 的服務都可以，改一下網址即可。',
    },
    gemini: {
      label: 'Google Gemini',
      model: 'gemini-2.5-flash',
      keyHint: 'AIza…',
      note: '金鑰到 Google AI Studio 建立。',
    },
  };

  /* ---------- 設定存取 ---------- */
  function readStore(store) {
    try { const raw = store.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function getConfig() {
    const c = readStore(localStorage) || readStore(sessionStorage);
    if (!c || !PROVIDERS[c.provider]) return { provider: 'anthropic', key: '', model: '', base: '', remember: true, enabled: false };
    return Object.assign({ model: '', base: '', remember: true, enabled: true }, c);
  }
  function saveConfig(cfg) {
    const clean = {
      provider: PROVIDERS[cfg.provider] ? cfg.provider : 'anthropic',
      key: String(cfg.key || '').trim(),
      model: String(cfg.model || '').trim(),
      base: String(cfg.base || '').trim(),
      remember: !!cfg.remember,
      enabled: cfg.enabled !== false,
    };
    clearConfig();
    try { (clean.remember ? localStorage : sessionStorage).setItem(STORE_KEY, JSON.stringify(clean)); } catch (e) { /* 隱私模式可能無法儲存 */ }
    return clean;
  }
  function clearConfig() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }
  function isReady() {
    const c = getConfig();
    if (!c.enabled) return false;
    if (c.provider === 'openai') return !!(c.key || (c.base && isLocalBase(c.base)));
    return !!c.key;
  }
  function isLocalBase(b) { return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(b); }

  /* ---------- 錯誤處理（絕不把金鑰印出來） ---------- */
  function aiError(code, msg, status) { const e = new Error(msg); e.code = code; e.status = status; return e; }
  function redact(text, key) {
    let t = String(text || '');
    if (key) t = t.split(key).join('[金鑰]');
    return t.slice(0, 300);
  }
  function httpError(status, bodyText, key) {
    if (status === 401 || status === 403) return aiError('auth', '金鑰無效或沒有權限，請回設定檢查。', status);
    if (status === 429) return aiError('rate', '請求太頻繁或額度已用完，稍後再試。', status);
    if (status === 404) return aiError('model', '找不到這個模型或網址，請檢查設定。', status);
    if (status === 400) return aiError('bad', '服務商拒絕了這個請求（' + redact(bodyText, key).slice(0, 120) + '）', status);
    if (status >= 500) return aiError('server', '服務商暫時出錯，稍後再試。', status);
    return aiError('http', '連線失敗（' + status + '）', status);
  }

  /* ---------- 核心呼叫 ---------- */
  async function callModel({ system, user, maxTokens = 700, timeoutMs = 25000 }) {
    const cfg = getConfig();
    if (!isReady()) throw aiError('noconfig', '還沒有設定 AI。');
    if (calls >= MAX_CALLS_PER_PAGE) throw aiError('limit', '這次遊玩的 AI 呼叫次數已達上限，重新整理頁面可重置。');
    calls++;
    const P = PROVIDERS[cfg.provider];
    const model = cfg.model || P.model;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let url, headers, body;

    if (cfg.provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'content-type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',  // 讓瀏覽器可以直接呼叫（金鑰由玩家自己提供）
      };
      body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] };
    } else if (cfg.provider === 'openai') {
      const base = (cfg.base || P.base).replace(/\/+$/, '');
      if (!/^https:\/\//i.test(base) && !isLocalBase(base)) throw aiError('bad', '網址必須是 https://（本機測試可用 http://localhost）。');
      url = base + '/chat/completions';
      headers = { 'content-type': 'application/json' };
      if (cfg.key) headers.authorization = 'Bearer ' + cfg.key;
      body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    } else {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
      headers = { 'content-type': 'application/json', 'x-goog-api-key': cfg.key };
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: Math.max(maxTokens, 2048) },
      };
    }

    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') throw aiError('timeout', 'AI 回應太久，已改用內建內容。');
      throw aiError('network', '連不上服務商（網路、網址，或被瀏覽器外掛擋住）。');
    }
    clearTimeout(timer);
    const raw = await res.text();
    if (!res.ok) throw httpError(res.status, raw, cfg.key);
    let data;
    try { data = JSON.parse(raw); } catch (e) { throw aiError('bad', '服務商回傳了看不懂的內容。'); }

    let text = '';
    if (cfg.provider === 'anthropic') text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    else if (cfg.provider === 'openai') text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    else text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).map((p) => p.text || '').join('');
    if (!text.trim()) throw aiError('empty', 'AI 沒有回覆內容。');
    return text;
  }

  function extractJSON(text) {
    let t = String(text).replace(/```(?:json)?/gi, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  }

  /* ---------- 提示詞 ---------- */
  const SAFETY = '只能使用虛構角色。絕對不可出現真實政治人物、真實政黨、真實企業或品牌名稱；台北行政區與一般地點（夜市、捷運、河濱、公園）可以使用。' +
    '不可涉及仇恨、暴力、色情、歧視、藥物、真實發生過的事件，或對特定族群的負面描寫。';

  const EVENT_SYSTEM = [
    '你是手機小遊戲《台北市長大作戰》的編劇。這是可愛風、輕鬆、不分黨派的虛構市長選戰，玩家是一位動物候選人。',
    '請產生「一個」突發事件，只輸出 JSON，不要任何其他文字，也不要程式碼框。',
    '規則：',
    '- 繁體中文（台灣用語），語氣可愛、溫暖、有一點幽默。',
    '- ' + SAFETY,
    '- scene 不超過 100 字；每個選項的 label ≤ 12 字、sub ≤ 24 字、result ≤ 50 字。',
    '- 剛好 3 個選項，其中至少 1 個是 funds=0 且 energy≤8 的省力選項。',
    '- 數值範圍：funds 0~35、energy 0~30；fx 的 youth/worker/family/senior/vendor 為 -10~10；trust、scandal 為 -8~8。',
    '- 花越多資源，效果可以越大；省力選項效果要小。每個選項都要有取捨（幫了某群體，就冷落另一群）。',
    '- 主題不可與 avoidTitles 重複，並盡量貼合玩家目前的弱點或剛做過的決定。',
    '群體：youth 青年學生、worker 上班族、family 育兒家庭、senior 銀髮長輩、vendor 店家攤商；trust 是形象，scandal 是爭議（越高越糟）。',
    'JSON 格式：{"emoji":"🌧️","title":"…","scene":"…","choices":[{"emoji":"…","label":"…","sub":"…","funds":0,"energy":0,"fx":{"youth":0,"worker":0,"family":0,"senior":0,"vendor":0,"trust":0,"scandal":0},"result":"…"}, 共三個]}',
  ].join('\n');

  const ADVISOR_SYSTEM = [
    '你是《台北市長大作戰》裡的貓頭鷹幕僚長，說話可愛、簡短、有點碎念。',
    '根據遊戲狀態與目前事件，用最多 2 句話（總共 80 字內）給玩家一個提示。',
    '不要直接指定選哪一個選項，不要給精確數字。' + SAFETY,
    '只輸出那段話，不要任何標題或引號。',
  ].join('\n');

  const REPORT_SYSTEM = [
    '你是《台北市長大作戰》裡的鴨鴨記者，要寫選後開票之夜的短報導。',
    '繁體中文（台灣用語），可愛、幽默、親切；120~200 字，單一段落，不要標題、不要 markdown。',
    '要具體提到玩家做過的 2~3 個關鍵決定與它們的影響；落選時語氣要溫暖、給鼓勵。',
    SAFETY + '只能提到輸入資料中出現的虛構角色。',
  ].join('\n');

  /* ---------- 對外功能 ---------- */
  async function test() {
    const t0 = Date.now();
    const text = await callModel({ system: '你是連線測試。只回覆 OK 兩個字。', user: 'ping', maxTokens: 16, timeoutMs: 15000 });
    return { ok: true, ms: Date.now() - t0, sample: text.slice(0, 20) };
  }

  async function generateEvent(summary, round) {
    const user = JSON.stringify({
      task: `請產生第 ${summary.week} 週的突發事件`,
      state: {
        candidate: summary.candidate, party: summary.party,
        funds: summary.funds, energy: summary.energy, trust: summary.trust, scandal: summary.scandal,
        polls: summary.polls, weakest: summary.weakest, strongest: summary.strongest, recent: summary.recent,
      },
      avoidTitles: summary.avoidTitles.slice(-30),
    });
    // 最多嘗試 2 次；結果必須通過引擎的驗證與限幅
    for (let i = 0; i < 2; i++) {
      try {
        const text = await callModel({ system: EVENT_SYSTEM, user, maxTokens: 900 });
        const ev = E.validateAIEvent(extractJSON(text), round);
        if (ev) return ev;
      } catch (e) {
        if (['auth', 'noconfig', 'limit', 'rate', 'model'].includes(e.code)) throw e;
      }
    }
    return null;
  }

  async function advise(summary, event) {
    const user = JSON.stringify({
      state: { week: summary.week, weeksTotal: summary.weeksTotal, funds: summary.funds, energy: summary.energy, trust: summary.trust, polls: summary.polls, weakest: summary.weakest },
      event: { title: event.title, scene: event.scene, choices: event.choices.map((c) => ({ label: c.label, sub: c.sub })) },
    });
    const text = await callModel({ system: ADVISOR_SYSTEM, user, maxTokens: 200, timeoutMs: 15000 });
    const clean = cleanLine(text, 110);
    return clean || null;
  }

  async function report(info) {
    const user = JSON.stringify(info);
    const text = await callModel({ system: REPORT_SYSTEM, user, maxTokens: 500, timeoutMs: 25000 });
    const clean = cleanLine(text, 320);
    return clean && clean.length >= 40 ? clean : null;
  }

  function cleanLine(text, max) {
    return String(text).replace(/<[^>]*>/g, '').replace(/[`*#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  return {
    PROVIDERS, getConfig, saveConfig, clearConfig, isReady, test, generateEvent, advise, report,
    callsUsed: () => calls, maxCalls: MAX_CALLS_PER_PAGE,
  };
});
