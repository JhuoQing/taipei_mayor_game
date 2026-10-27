/* 平衡模擬：node tools/sim.js [場數]
   用不同策略各打幾千場，看勝率是否落在合理範圍 */
const E = require('../js/engine.js');
const D = E.data;
const N = Number(process.argv[2]) || 1500;
const BLOCS = D.BLOCS.map((b) => b.id);

function fxOf(ch) { return ch.mini ? ch.tiers[1].fx : (ch.fx || {}); }

function scoreChoice(s, ch, mode) {
  const fx = fxOf(ch);
  const lead = E.leadRival(s);
  let v = 0;
  BLOCS.forEach((b) => {
    const gap = E.appealOf(s, lead, b) - E.appealOf(s, s.playerId, b);
    const gain = (D.CANDIDATES.find((c) => c.id === s.playerId).gain[b]) || 1;
    const f = fx[b] || 0;
    v += (f > 0 ? f * gain : f) * E.blocWeight[b] * 5 * (mode === 'smart' ? 1 + Math.max(0, gap) / 12 : 1);
  });
  v += (fx.trust || 0) * 0.6 - (fx.scandal || 0) * 0.7;
  if (ch.rival) v += -ch.rival * 3;
  if (ch.boostWeakest) v += ch.boostWeakest * 0.25;
  if (ch.risk) v -= ch.risk.p * 2;
  if (ch.luck) v += (ch.luck.p - 0.5) * 2;
  const cost = (ch.cost.funds || 0) + (ch.cost.energy || 0);
  v -= cost * (mode === 'smart' ? 0.045 : 0.015);
  return v;
}

function play(candId, difficulty, strat, seed) {
  const s = E.newGame({ playerId: candId, difficulty, seed });
  let guard = 0;
  while (!s.finished && guard++ < 50) {
    const ev = E.getEvent(s);
    const opts = ev.choices.filter((c) => E.canAfford(s, c));
    let pick;
    if (strat === 'random') {
      pick = opts[Math.floor(Math.random() * opts.length)];
    } else {
      pick = opts.reduce((a, b) => (scoreChoice(s, a, strat) >= scoreChoice(s, b, strat) ? a : b));
    }
    const tier = pick.mini ? (strat === 'random' ? Math.floor(Math.random() * 3) : 1) : 0;
    E.choose(s, ev, pick.id, { tier });
    E.endRound(s);
  }
  const res = E.finalElection(s);
  return { won: res.won, share: res.shares[candId], rank: res.playerRank, trust: s.trust, scandal: s.scandal };
}

const rows = [];
['easy', 'normal', 'hard'].forEach((diff) => {
  ['random', 'greedy', 'smart'].forEach((strat) => {
    let wins = 0, share = 0, n = 0;
    const byCand = {};
    D.CANDIDATES.forEach((c) => {
      let w = 0;
      for (let i = 0; i < N; i++) {
        const r = play(c.id, diff, strat, 1000 + i * 31 + c.no);
        if (r.won) w++;
        share += r.share; n++;
      }
      byCand[c.name] = (w / N * 100).toFixed(0) + '%';
      wins += w;
    });
    rows.push({ 難度: diff, 策略: strat, 勝率: (wins / (N * 3) * 100).toFixed(1) + '%', 平均得票: (share / n * 100).toFixed(1) + '%', ...byCand });
  });
});
console.table(rows);
