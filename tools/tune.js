/* 參數掃描：node tools/tune.js  （找出讓勝率落在目標範圍的組合） */
const E = require('../js/engine.js');
const D = E.data;
const BLOCS = D.BLOCS.map((b) => b.id);
const N = 300;

function fxOf(ch) { return ch.mini ? ch.tiers[1].fx : (ch.fx || {}); }
function score(s, ch, cw) {
  const fx = fxOf(ch); const lead = E.leadRival(s); let v = 0;
  BLOCS.forEach((b) => {
    const gap = E.appealOf(s, lead, b) - E.appealOf(s, s.playerId, b);
    const gain = D.CANDIDATES.find((c) => c.id === s.playerId).gain[b] || 1;
    const f = fx[b] || 0;
    v += (f > 0 ? f * gain : f) * E.blocWeight[b] * 5 * (1 + Math.max(0, gap) / 12);
  });
  v += (fx.trust || 0) * 0.6 - (fx.scandal || 0) * 0.7;
  if (ch.rival) v += -ch.rival * 3;
  if (ch.boostWeakest) v += ch.boostWeakest * 0.25;
  if (ch.risk) v -= ch.risk.p * 2;
  v -= ((ch.cost.funds || 0) + (ch.cost.energy || 0)) * cw;
  return v;
}
function play(c, diff, strat, seed) {
  const s = E.newGame({ playerId: c, difficulty: diff, seed });
  let g = 0;
  while (!s.finished && g++ < 50) {
    const ev = E.getEvent(s);
    const opts = ev.choices.filter((x) => E.canAfford(s, x));
    const cw = strat === 'greedy' ? 0.012 : 0.045;
    const pick = strat === 'random' ? opts[Math.floor(Math.random() * opts.length)]
      : opts.reduce((a, b) => (score(s, a, cw) >= score(s, b, cw) ? a : b));
    E.choose(s, ev, pick.id, { tier: pick.mini ? (strat === 'random' ? Math.floor(Math.random() * 3) : 1) : 0 });
    E.endRound(s);
  }
  return E.finalElection(s).won;
}
function rate(diff, strat) {
  let w = 0, n = 0;
  D.CANDIDATES.forEach((c) => { for (let i = 0; i < N; i++) { if (play(c.id, diff, strat, 500 + i * 17 + c.no)) w++; n++; } });
  return w / n;
}

const grid = [];
const combos = [];
for (const [lo, cap, rub] of [[8, 72, 3], [7, 76, 4]]) for (const reg of [[3, 8], [4, 10], [6, 12]]) for (const sf of [80, 100]) combos.push({ lo, cap, rub, reg, sf });
for (const c of combos) {
  Object.assign(E.CONFIG, { rivalMove: [c.lo, c.lo + 2.4], rivalCap: c.cap, rubber: c.rub, softT: 9, fundsRegenBase: c.reg[0], energyRegen: c.reg[1] });
  E.CONFIG.difficulty.normal.funds = c.sf; E.CONFIG.difficulty.hard.funds = c.sf; E.CONFIG.difficulty.easy.funds = c.sf + 20;
  grid.push({
    移動: c.lo, 上限: c.cap, 橡皮筋: c.rub, 回復: c.reg.join('/'), 起始資金: c.sf,
    '輕鬆·亂': (rate('easy', 'random') * 100).toFixed(0) + '%',
    '輕鬆·高手': (rate('easy', 'greedy') * 100).toFixed(0) + '%',
    '普通·亂': (rate('normal', 'random') * 100).toFixed(0) + '%',
    '普通·省': (rate('normal', 'smart') * 100).toFixed(0) + '%',
    '普通·花': (rate('normal', 'greedy') * 100).toFixed(0) + '%',
    '困難·亂': (rate('hard', 'random') * 100).toFixed(0) + '%',
    '困難·高手': (rate('hard', 'greedy') * 100).toFixed(0) + '%',
  });
}
console.table(grid);
