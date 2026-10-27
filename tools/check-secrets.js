#!/usr/bin/env node
/* 金鑰外洩檢查：node tools/check-secrets.js
   這個 repo 會公開在 GitHub，所以每次 commit 前都應該跑一次。
   （可執行 tools/install-hook.sh 讓它在 git commit 時自動檢查）
   只要掃到疑似金鑰的字串就會回傳錯誤碼 1。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const RULES = [
  ['Anthropic 金鑰', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['OpenAI / 類似格式金鑰', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['Google API 金鑰', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub 權杖', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['Slack 權杖', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['AWS 存取金鑰', /\bAKIA[0-9A-Z]{16}\b/],
  ['私鑰', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Bearer 權杖', /Bearer\s+[A-Za-z0-9._-]{30,}/],
  ['寫死的金鑰指派', /(?:api[_-]?key|secret|token|authorization)["']?\s*[:=]\s*["'][A-Za-z0-9_\-./+]{20,}["']/i],
];
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.zip', '.woff', '.woff2']);

const hits = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
    if (SKIP_EXT.has(path.extname(name).toLowerCase())) continue;
    const rel = path.relative(ROOT, p);
    if (rel === path.join('tools', 'check-secrets.js')) continue;   // 規則本身
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const [label, re] of RULES) if (re.test(line)) hits.push(`${rel}:${i + 1}  ${label}`);
    });
  }
})(ROOT);

if (hits.length) {
  console.error('❌ 發現疑似金鑰，請移除後再 commit（已經推上去的金鑰請立刻到服務商後台作廢）：');
  hits.forEach((h) => console.error('  - ' + h));
  process.exit(1);
}
console.log('✅ 沒有發現疑似金鑰的字串。');
