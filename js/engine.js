/* ============================================================
   遊戲引擎：純邏輯，不碰 DOM，瀏覽器與 Node 都能跑
   狀態 s 是純 JSON，可直接存進 localStorage 續玩
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.TPEngine = factory(root.TPData);
})(typeof self !== 'undefined' ? self : this, function (D) {

  const BLOC_IDS = D.BLOCS.map((b) => b.id);
  const blocById = Object.fromEntries(D.BLOCS.map((b) => [b.id, b]));
  const candById = Object.fromEntries(D.CANDIDATES.map((c) => [c.id, c]));
  const poolById = Object.fromEntries(D.POOL.map((e) => [e.id, e]));

  /* ---------- 可調參數（平衡用） ---------- */
  const CONFIG = {
    totalRounds: 10,
    softT: 9,              // 越小，領先者贏越多
    trustWeight: 0.15,     // 形象對所有群體的加成
    scandalWeight: 0.16,   // 爭議對所有群體的扣分
    noiseSd: 1.7,          // 開票日各區隨機誤差
    startFunds: 100, startEnergy: 100, startTrust: 50,
    fundsCap: 150, energyCap: 100,
    energyRegen: 10, fundsRegenBase: 4,
    rivalMove: [7.5, 9.9],  // 對手每週在某群體的增幅範圍
    rivalCap: 78,
    rubber: 4,              // 橡皮筋強度
    voters: 1700000,        // 「示意」總投票數
    difficulty: {
      easy:   { rivalGain: 0.8,  rivalStart: -2, funds: 110, hints: 'easy'   },
      normal: { rivalGain: 1.0,  rivalStart: 0,  funds: 90,  hints: 'normal' },
      hard:   { rivalGain: 1.25, rivalStart: 3,  funds: 90,  hints: 'hard'   },
    },
  };

  /* ---------- 工具 ---------- */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round1 = (v) => Math.round(v * 10) / 10;

  // mulberry32：狀態存在 s.rs，所以同一個挑戰碼 + 同樣選擇 = 同樣結果
  function rnd(s) {
    s.rs = (s.rs + 0x6D2B79F5) | 0;
    let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(s) {
    const u = Math.max(rnd(s), 1e-9), v = rnd(s);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function pickWeighted(s, items, wfn) {
    const ws = items.map(wfn);
    const total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) return items[Math.floor(rnd(s) * items.length)];
    let r = rnd(s) * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  const totalPop = D.DISTRICTS.reduce((a, d) => a + d.pop, 0);
  const blocWeight = {};
  BLOC_IDS.forEach((b) => {
    blocWeight[b] = D.DISTRICTS.reduce((a, d) => a + (d.pop / totalPop) * d.mix[b], 0);
  });

  /* ---------- 開新局 ---------- */
  function newGame({ playerId, difficulty = 'normal', seed } = {}) {
    if (!candById[playerId]) playerId = D.CANDIDATES[0].id;
    if (!CONFIG.difficulty[difficulty]) difficulty = 'normal';
    seed = (seed === undefined || seed === null || Number.isNaN(Number(seed)))
      ? ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) % 1000000
      : Number(seed) >>> 0;
    const diff = CONFIG.difficulty[difficulty];
    const s = {
      v: 1, seed, rs: seed * 7919 + 17, difficulty, playerId,
      rivals: D.CANDIDATES.filter((c) => c.id !== playerId).map((c) => c.id),
      round: 0, total: CONFIG.totalRounds,
      funds: diff.funds, energy: CONFIG.startEnergy, trust: CONFIG.startTrust, scandal: 0,
      a: {}, distBonus: {}, flags: {}, used: {}, aiEvents: {},
      curEvent: null, history: [], polls: [], news: [], advisorLeft: 3,
      finished: false,
    };
    D.CANDIDATES.forEach((c) => {
      s.a[c.id] = {};
      BLOC_IDS.forEach((b) => {
        s.a[c.id][b] = c.base[b] + (c.id === playerId ? 0 : diff.rivalStart);
      });
    });
    s.polls.push(poll(s).shares);
    return s;
  }

  /* ---------- 民意計算 ---------- */
  // 玩家的「有效好感度」＝群體好感 + 形象 − 爭議 + 地盤加成
  function appealOf(s, cid, bloc, distId) {
    let v = s.a[cid][bloc];
    if (cid === s.playerId) {
      v += (s.trust - 50) * CONFIG.trustWeight - s.scandal * CONFIG.scandalWeight;
      if (distId) v += s.distBonus[distId] || 0;
    }
    return v;
  }
  function softmax(map) {
    const ids = Object.keys(map);
    const ex = ids.map((id) => Math.exp(map[id] / CONFIG.softT));
    const sum = ex.reduce((a, b) => a + b, 0);
    const out = {};
    ids.forEach((id, i) => { out[id] = ex[i] / sum; });
    return out;
  }
  function districtShares(s, d, noise) {
    const mixSum = BLOC_IDS.reduce((a, b) => a + d.mix[b], 0);
    const ap = {};
    D.CANDIDATES.forEach((c) => {
      let v = 0;
      BLOC_IDS.forEach((b) => { v += (d.mix[b] / mixSum) * appealOf(s, c.id, b, d.id); });
      if (noise) v += gauss(s) * CONFIG.noiseSd;
      ap[c.id] = v;
    });
    return softmax(ap);
  }
  function poll(s) {
    const shares = {};
    D.CANDIDATES.forEach((c) => { shares[c.id] = 0; });
    D.DISTRICTS.forEach((d) => {
      const sh = districtShares(s, d, false);
      D.CANDIDATES.forEach((c) => { shares[c.id] += (d.pop / totalPop) * sh[c.id]; });
    });
    const blocs = {};
    BLOC_IDS.forEach((b) => {
      const ap = {};
      D.CANDIDATES.forEach((c) => { ap[c.id] = appealOf(s, c.id, b); });
      blocs[b] = softmax(ap);
    });
    return { shares, blocs };
  }
  function leadRival(s) {
    const p = poll(s).shares;
    return s.rivals.reduce((best, r) => (p[r] > p[best] ? r : best), s.rivals[0]);
  }
  function playerLeads(s) {
    const p = poll(s).shares;
    return s.rivals.every((r) => p[s.playerId] > p[r]);
  }
  function weakestBloc(s) {
    return BLOC_IDS.reduce((w, b) => (appealOf(s, s.playerId, b) < appealOf(s, s.playerId, w) ? b : w), BLOC_IDS[0]);
  }
  function strongestBloc(s) {
    return BLOC_IDS.reduce((w, b) => (appealOf(s, s.playerId, b) > appealOf(s, s.playerId, w) ? b : w), BLOC_IDS[0]);
  }

  /* ---------- 事件 ---------- */
  function eventById(s, id) {
    if (id && id.startsWith('ai_')) return s.aiEvents[Number(id.slice(3))] || null;
    if (id === D.FIXED.open.id) return D.FIXED.open;
    if (id === D.FIXED.debate.id) return D.FIXED.debate;
    if (id === D.FIXED.final.id) return D.FIXED.final;
    return poolById[id] || null;
  }
  // 同一週重複呼叫，一定拿到同一個事件
  function getEvent(s) {
    if (s.curEvent && s.curEvent.round === s.round) {
      const e = eventById(s, s.curEvent.id);
      if (e) return e;
    }
    let ev;
    if (s.round === 0) ev = D.FIXED.open;
    else if (s.round === s.total - 2) ev = D.FIXED.debate;
    else if (s.round === s.total - 1) ev = D.FIXED.final;
    else if (s.aiEvents[s.round]) ev = s.aiEvents[s.round];
    else {
      const cands = D.POOL.filter((e) => !s.used[e.id] && (!e.cond || e.cond(s)));
      ev = pickWeighted(s, cands, (e) => (e.weight || 0) + (e.cond && e.boost && s.round >= 3 ? e.boost : 0));
    }
    s.curEvent = { round: s.round, id: ev.id };
    return ev;
  }
  // 哪些回合預留給 AI 突發事件
  function aiSlots(s) { return [3, 6].filter((r) => r < s.total - 2); }

  /* ---------- 選項顯示用資料 ---------- */
  function canAfford(s, ch) {
    return s.funds >= (ch.cost.funds || 0) && s.energy >= (ch.cost.energy || 0);
  }
  function hintsFor(ch, level) {
    if (level === 'hard') return [];
    const fx = ch.mini ? (ch.tiers[1] || ch.tiers[0]).fx : (ch.fx || {});
    const out = [];
    BLOC_IDS.forEach((b) => {
      const v = fx[b];
      if (!v) return;
      if (level === 'normal' && Math.abs(v) < 2) return;
      out.push({ emoji: blocById[b].emoji, dir: v > 0 ? 1 : -1, strong: level === 'easy' && Math.abs(v) >= 7, good: v > 0 });
    });
    if (fx.trust) out.push({ emoji: '⭐', dir: fx.trust > 0 ? 1 : -1, strong: level === 'easy' && Math.abs(fx.trust) >= 6, good: fx.trust > 0 });
    if (fx.scandal) out.push({ emoji: '💣', dir: fx.scandal > 0 ? 1 : -1, strong: false, good: fx.scandal < 0 });
    if (ch.boostWeakest) out.push({ emoji: '🎯', dir: 1, strong: false, good: true });
    if (ch.rival) out.push({ emoji: '⚔️', dir: -1, strong: false, good: true });
    return out;
  }
  function describeChoices(s, ev) {
    const level = CONFIG.difficulty[s.difficulty].hints;
    return ev.choices.map((ch) => ({
      id: ch.id, e: ch.e, label: ch.label, sub: ch.sub,
      cost: { funds: ch.cost.funds || 0, energy: ch.cost.energy || 0 },
      affordable: canAfford(s, ch),
      risky: !!(ch.risk || ch.luck),
      mini: ch.mini || null,
      hints: hintsFor(ch, level),
    }));
  }

  /* ---------- 套用效果 ---------- */
  function applyFx(s, fx, deltas) {
    const cand = candById[s.playerId];
    Object.keys(fx || {}).forEach((k) => {
      let v = fx[k];
      if (blocById[k]) {
        if (v > 0) v *= (cand.gain[k] || 1);
        const old = s.a[s.playerId][k];
        const nv = clamp(old + v, 0, 100);
        deltas[k] = round1((deltas[k] || 0) + (nv - old));
        s.a[s.playerId][k] = nv;
      } else if (k === 'trust' || k === 'scandal') {
        const old = s[k];
        const nv = clamp(old + v, 0, 100);
        deltas[k] = round1((deltas[k] || 0) + (nv - old));
        s[k] = nv;
      }
    });
  }
  function applyRival(s, amount) {
    const r = leadRival(s);
    BLOC_IDS.forEach((b) => { s.a[r][b] = clamp(s.a[r][b] + amount, 0, 100); });
    return r;
  }

  function choose(s, ev, choiceId, opt = {}) {
    const ch = ev.choices.find((c) => c.id === choiceId);
    if (!ch) return { error: 'nochoice' };
    if (!canAfford(s, ch)) return { error: 'cost' };
    const cf = ch.cost.funds || 0, ce = ch.cost.energy || 0;
    s.funds = Math.max(0, s.funds - cf);
    s.energy = Math.max(0, s.energy - ce);

    const deltas = {};
    let text = ch.result || '';
    let outcome = null;
    let tier = null;
    const notes = [];

    // 基本效果（小遊戲則依表現分三階）
    if (ch.mini) {
      tier = clamp(Math.floor(opt.tier || 0), 0, ch.tiers.length - 1);
      applyFx(s, ch.tiers[tier].fx, deltas);
      text = ch.tiers[tier].result;
      if (tier === ch.tiers.length - 1) s.flags.marketGreat = true;
    } else {
      applyFx(s, ch.fx, deltas);
    }
    // 地盤
    if (ch.dist) {
      Object.keys(ch.dist).forEach((d) => { s.distBonus[d] = clamp((s.distBonus[d] || 0) + ch.dist[d], -10, 10); });
    }
    // 承諾呼應（要在記錄這次旗標之前檢查）
    if (ch.bonusIf && s.flags[ch.bonusIf.flag]) {
      applyFx(s, ch.bonusIf.fx, deltas);
      if (ch.bonusIf.text) notes.push(ch.bonusIf.text);
    }
    // 運氣：成功 / 失敗
    if (ch.luck && ch.risk) {
      if (rnd(s) < ch.luck.p) { applyFx(s, ch.luck.fx, deltas); text = ch.luck.result; outcome = 'luck'; }
      else { applyFx(s, ch.risk.fx, deltas); text = ch.risk.result; outcome = 'risk'; }
    } else if (ch.risk) {
      if (rnd(s) < ch.risk.p) { applyFx(s, ch.risk.fx, deltas); text = ch.risk.result; outcome = 'risk'; }
    }
    // 打擊領先對手
    let rivalHit = null;
    if (ch.rival) { rivalHit = applyRival(s, ch.rival); }
    // 補強最弱的一群
    if (ch.boostWeakest) {
      const w = weakestBloc(s);
      applyFx(s, { [w]: ch.boostWeakest }, deltas);
      notes.push(`補強了「${blocById[w].name}」`);
    }
    if (ch.flag) s.flags[ch.flag] = true;
    s.used[ev.id] = true;
    s.history.push({
      round: s.round, id: ev.id, ai: !!ev.ai, title: ev.title, emoji: ev.emoji,
      choiceId: ch.id, label: ch.label, e: ch.e, outcome, tier,
    });
    return { text, notes, deltas, outcome, tier, cost: { funds: cf, energy: ce }, rivalHit };
  }

  /* ---------- 一週結束：對手行動、資源回復 ---------- */
  function endRound(s) {
    const diff = CONFIG.difficulty[s.difficulty];
    const news = [];
    const pollNow = poll(s).shares;
    const bestRival = Math.max(...s.rivals.map((r) => pollNow[r]));
    const wasAhead = pollNow[s.playerId] > bestRival;
    // 橡皮筋：玩家領先越多，對手越拚（讓選戰保持懸念）；落後時對手略微鬆懈
    const rubber = clamp(1 + (pollNow[s.playerId] - bestRival) * CONFIG.rubber, 0.8, 1.9);

    s.rivals.forEach((rid) => {
      const r = candById[rid];
      const bloc = pickWeighted(s, BLOC_IDS, (b) => blocWeight[b] * (1 + (62 - s.a[rid][b]) / 55));
      const [lo, hi] = CONFIG.rivalMove;
      const delta = round1((lo + rnd(s) * (hi - lo)) * diff.rivalGain * rubber);
      s.a[rid][bloc] = clamp(s.a[rid][bloc] + delta, 0, 100);
      BLOC_IDS.forEach((b) => {
        let v = s.a[rid][b] + (rnd(s) - 0.5) * 1.6;
        if (v > CONFIG.rivalCap) v -= (v - CONFIG.rivalCap) * 0.2;
        s.a[rid][b] = clamp(v, 0, 100);
      });
      const tpl = D.RIVAL_NEWS[bloc];
      news.push({ kind: 'move', who: rid, emoji: r.emoji, bloc, text: tpl[Math.floor(rnd(s) * tpl.length)].replace('{n}', r.name), delta });
    });

    // 對手攻擊玩家（領先時更常發生）
    if (rnd(s) < (wasAhead ? 0.4 : 0.15)) {
      const aid = s.rivals[Math.floor(rnd(s) * s.rivals.length)];
      const a = candById[aid];
      const text = D.RIVAL_ATTACK[Math.floor(rnd(s) * D.RIVAL_ATTACK.length)].replace('{n}', a.name);
      const deltas = {};
      if (rnd(s) < 0.5) applyFx(s, { trust: -2 }, deltas);
      else { const b = strongestBloc(s); applyFx(s, { [b]: -3 }, deltas); }
      news.push({ kind: 'attack', who: aid, emoji: a.emoji, text, deltas });
    }

    // 資源回復
    s.funds = Math.min(CONFIG.fundsCap, s.funds + CONFIG.fundsRegenBase + Math.round(s.trust / 10));
    s.energy = Math.min(CONFIG.energyCap, s.energy + CONFIG.energyRegen);

    s.round += 1;
    s.news = news;
    s.polls.push(poll(s).shares);
    if (s.round >= s.total) s.finished = true;
    return news;
  }

  /* ---------- 開票 ---------- */
  function finalElection(s) {
    const shares = {};
    const votes = {};
    D.CANDIDATES.forEach((c) => { shares[c.id] = 0; });
    const districts = D.DISTRICTS.map((d) => {
      const sh = districtShares(s, d, true);
      const w = d.pop / totalPop;
      D.CANDIDATES.forEach((c) => { shares[c.id] += w * sh[c.id]; });
      const ids = Object.keys(sh).sort((a, b) => sh[b] - sh[a]);
      return { id: d.id, name: d.name, col: d.col, row: d.row, pop: w, shares: sh, winner: ids[0], order: ids };
    });
    D.CANDIDATES.forEach((c) => { votes[c.id] = Math.round(shares[c.id] * CONFIG.voters); });
    const ranking = Object.keys(shares).sort((a, b) => shares[b] - shares[a]);
    const won = ranking[0] === s.playerId;
    const districtsWon = {};
    D.CANDIDATES.forEach((c) => { districtsWon[c.id] = districts.filter((d) => d.winner === c.id).length; });
    return {
      districts, shares, votes, ranking, winner: ranking[0], won,
      margin: shares[ranking[0]] - shares[ranking[1]],
      playerRank: ranking.indexOf(s.playerId) + 1,
      districtsWon,
    };
  }

  function computeEnding(s, res) {
    const p = res.shares[s.playerId];
    const trailed = s.polls.slice(-4, -1).some((pl) => Math.max(...s.rivals.map((r) => pl[r])) > pl[s.playerId]);
    const ctx = {
      flags: s.flags, trust: s.trust, scandal: s.scandal, funds: s.funds,
      districtsWon: res.districtsWon[s.playerId], won: res.won, trailed,
    };
    const badges = D.BADGES.filter((b) => b.test(ctx));
    let tier, title, emoji, desc;
    if (res.won) {
      if (res.margin >= 0.10) { tier = 'landslide'; title = '台北之光'; emoji = '🏆'; desc = '你幾乎橫掃全市，連最難攻下的區都對你比讚。'; }
      else if (res.margin >= 0.04) { tier = 'win'; title = '穩穩勝選'; emoji = '🎉'; desc = '每一個決定都算數，最後的票數很踏實。'; }
      else { tier = 'narrow'; title = '驚險過關'; emoji = '😮‍💨'; desc = '差距小到記者都要重算三次，但你贏了！'; }
    } else if (res.playerRank === 2 && res.shares[res.winner] - p < 0.04) {
      tier = 'close'; title = '差一點點'; emoji = '🥲'; desc = '只差幾個里的票數。早一點補強某一群，結果就不同了。';
    } else if (res.playerRank === 2) {
      tier = 'second'; title = '值得再戰'; emoji = '💪'; desc = '雖然這次輸了，但你的支持者還在，下次一定更好。';
    } else {
      tier = 'third'; title = '重新整理行囊'; emoji = '🎒'; desc = '這次的決策沒有打中大家的需求，換個策略再試一次吧。';
    }
    return { tier, title, emoji, desc, badges, trailed };
  }

  /* ---------- 離線幕僚（沒有 API 也能用） ---------- */
  function adviseOffline(s, ev) {
    const A = D.ADVISOR;
    const lead = leadRival(s);
    const rv = candById[lead];
    let worst = null, gap = -999;
    BLOC_IDS.forEach((b) => {
      const g = appealOf(s, lead, b) - appealOf(s, s.playerId, b);
      if (g > gap) { gap = g; worst = b; }
    });
    const opts = ev.choices.filter((c) => canAfford(s, c));
    let bestC = null, bestV = 0;
    opts.forEach((c) => {
      const fx = c.mini ? c.tiers[1].fx : (c.fx || {});
      let v = fx[worst] || 0;
      if (c.boostWeakest && worst === weakestBloc(s)) v += c.boostWeakest;
      if (v > bestV) { bestV = v; bestC = c; }
    });
    let text;
    if (s.energy < 30) text = `${A.emoji} 你的體力只剩 ${Math.round(s.energy)}，今天選省力的選項比較安全。`;
    else if (bestC) text = `${A.emoji} 「${blocById[worst].name}」現在比${rv.name}低約 ${Math.max(1, Math.round(gap))} 點。「${bestC.label}」好像對他們比較有感喔！`;
    else text = `${A.emoji} 這題對「${blocById[worst].name}」幫助不大，先顧形象、守住資源也是一種策略。`;
    return text;
  }

  /* ---------- AI 事件驗證與限幅（AI 的輸出不可信，一律重新整理） ---------- */
  function cleanText(x, max) {
    if (typeof x !== 'string') return '';
    return x.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function cleanEmoji(x, fallback) {
    if (typeof x === 'string') {
      const m = x.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u);
      if (m) return m[0];
    }
    return fallback;
  }
  const clampInt = (v, lo, hi) => clamp(Math.round(Number(v) || 0), lo, hi);

  function validateAIEvent(raw, round) {
    try {
      if (!raw || !Array.isArray(raw.choices) || raw.choices.length !== 3) return null;
      const ev = {
        id: 'ai_' + round, ai: true,
        emoji: cleanEmoji(raw.emoji, '📰'),
        title: cleanText(raw.title, 14),
        scene: cleanText(raw.scene, 120),
        choices: [],
      };
      if (!ev.title || ev.scene.length < 10) return null;
      for (let i = 0; i < 3; i++) {
        const c = raw.choices[i] || {};
        const ch = {
          id: 'abc'[i], e: cleanEmoji(c.emoji, '✨'),
          label: cleanText(c.label, 16), sub: cleanText(c.sub, 30),
          cost: { funds: clampInt(c.funds, 0, 35), energy: clampInt(c.energy, 0, 30) },
          fx: {}, result: cleanText(c.result, 60),
        };
        if (!ch.label || !ch.result) return null;
        const fx = c.fx && typeof c.fx === 'object' ? c.fx : {};
        let pos = 0;
        BLOC_IDS.forEach((b) => { const v = clampInt(fx[b], -10, 10); if (v) { ch.fx[b] = v; if (v > 0) pos += v; } });
        const t = clampInt(fx.trust, -8, 8); if (t) ch.fx.trust = t;
        const x = clampInt(fx.scandal, -8, 8); if (x) ch.fx.scandal = x;
        // 效果總量要和成本相稱，避免 AI 發出「免費又超強」的選項
        const cap = Math.min(14, 3 + 0.3 * (ch.cost.funds + ch.cost.energy));
        if (pos > cap) {
          const k = cap / pos;
          BLOC_IDS.forEach((b) => { if (ch.fx[b] > 0) ch.fx[b] = Math.max(1, Math.floor(ch.fx[b] * k)); });
        }
        ev.choices.push(ch);
      }
      // 至少要有一個負擔得起的低成本選項，避免卡關
      if (!ev.choices.some((c) => c.cost.funds === 0 && c.cost.energy <= 8)) {
        const cheapest = ev.choices.reduce((a, b) => ((a.cost.funds + a.cost.energy) <= (b.cost.funds + b.cost.energy) ? a : b));
        cheapest.cost = { funds: 0, energy: Math.min(cheapest.cost.energy, 5) };
      }
      return ev;
    } catch (e) { return null; }
  }

  /* ---------- 給 AI 與分享用的摘要 ---------- */
  function summary(s) {
    const me = candById[s.playerId];
    const p = poll(s).shares;
    return {
      week: s.round + 1, weeksTotal: s.total,
      candidate: me.name, party: me.party,
      funds: Math.round(s.funds), energy: Math.round(s.energy), trust: Math.round(s.trust), scandal: Math.round(s.scandal),
      polls: Object.fromEntries(D.CANDIDATES.map((c) => [c.name, Math.round(p[c.id] * 100)])),
      weakest: blocById[weakestBloc(s)].name, strongest: blocById[strongestBloc(s)].name,
      recent: s.history.slice(-4).map((h) => `${h.title}：${h.label}`),
      avoidTitles: s.history.map((h) => h.title).concat(D.POOL.map((e) => e.title)),
    };
  }

  function reportFallback(s, res, ending) {
    const me = candById[s.playerId];
    const w = candById[res.winner];
    const picks = s.history.filter((h) => h.id !== 'e_final').slice(0, 3).map((h) => `「${h.label}」`);
    const pct = (id) => (res.shares[id] * 100).toFixed(1) + '%';
    const lead = res.won
      ? `${me.emoji}${me.name}以 ${pct(me.id)} 的得票率勝出！`
      : `${w.emoji}${w.name}以 ${pct(w.id)} 的得票率勝出，${me.emoji}${me.name}得票 ${pct(me.id)}。`;
    return `${D.REPORTER.emoji} 鴨鴨播報：${lead}分析指出，${picks.join('、')}等決定是這場選戰的關鍵時刻。` +
      `${me.name}共拿下 ${res.districtsWon[me.id]} 個行政區。${ending.desc}`;
  }

  function shareText(s, res, ending, url) {
    const me = candById[s.playerId];
    return `我在《台北市長大作戰》選了${me.emoji}${me.name}，${res.won ? '成功當選' : '很可惜落選'}！` +
      `得票率 ${(res.shares[s.playerId] * 100).toFixed(1)}%，拿下 ${res.districtsWon[s.playerId]}/12 區（${ending.emoji}${ending.title}）。` +
      `挑戰碼 ${s.seed}，一起來玩${url ? '：' + url : ''}`;
  }

  return {
    CONFIG, newGame, getEvent, aiSlots, describeChoices, canAfford, hintsFor,
    choose, endRound, poll, finalElection, computeEnding, adviseOffline,
    validateAIEvent, summary, reportFallback, shareText,
    leadRival, playerLeads, weakestBloc, strongestBloc, appealOf, blocWeight,
    data: D,
  };
});
