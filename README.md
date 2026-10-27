# 台北市長大作戰 🗳️☂️

十週選戰，十個決定，一張選票。手機優先的可愛風網頁小遊戲，純靜態、可直接放在 GitHub Pages。

> 角色（招財咪、熊大叔、狐博士）、政黨與行政區選民結構全部是遊戲虛構設定，與任何真實人物或政黨無關。

## 玩法

- 選一位候選人，在 10 週內每週面對一個事件、做一個決定。
- 五種選民群（青年、上班族、育兒家庭、銀髮長輩、店家攤商）各有想法；💰 資金與 ⚡ 體力有限；⭐ 形象加成、💣 爭議扣分。
- 你的承諾會被記住，之後可能被追問「錢從哪來」。
- 最後十二個行政區逐區開票，總得票最高者當選。
- 「挑戰碼」相同就會遇到一樣的事件順序，可以和朋友比賽。

## 部署到 GitHub Pages

1. 在 GitHub 建立新 repo（免費版需為 Public）。
2. 把這個資料夾裡的所有檔案上傳到 repo 根目錄（包含 `.nojekyll`）。
3. 到 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main` / `(root)`，按 Save。
4. 約一分鐘後，網址會是 `https://<你的帳號>.github.io/<repo 名稱>/`。

## 🔒 金鑰安全（請先看這一段）

免費版 GitHub repo 一定是公開的，**任何人都看得到裡面的每一行程式碼，包含歷史紀錄**。所以：

- **絕對不要把 API 金鑰寫進任何檔案**，也不要放在網址參數裡。
- 這個專案的設計是「玩家自帶金鑰」：金鑰在遊戲裡的 **AI 設定** 視窗輸入，只存在玩家自己瀏覽器的 `localStorage`（取消勾選「記住」則存在 `sessionStorage`，關閉分頁就消失），並且只會送往玩家自己選的 AI 服務商。遊戲網站本身沒有後端。
- 你自己測試時也一樣：打開部署好的網站 → 標題畫面的「AI 設定」→ 貼上你的金鑰 → 測試連線。
- 請在服務商後台替金鑰設定**每月用量上限**。
- 遊戲內有每次開啟頁面最多 40 次 AI 呼叫的保護；每局正常約 3～6 次。
- 每次 commit 前執行 `node tools/check-secrets.js` 檢查是否誤放金鑰；也可以執行 `sh tools/install-hook.sh` 讓它在 `git commit` 時自動檢查。
- 如果金鑰不小心上傳過，**請立刻到服務商後台作廢它**。光是刪掉檔案沒有用，歷史紀錄裡還在。

### 想讓玩家「不用自己的金鑰」也能玩 AI？

不能把你的金鑰放進前端。需要一個中介：用 Cloudflare Workers、Vercel Functions 之類的小服務保管金鑰，前端只呼叫你的服務，並在那裡做來源限制與用量限制。這個專案目前不包含這一層。

## AI 功能

AI 是選配，沒設定也能完整遊玩。啟用後會多出：

| 功能 | 說明 |
| --- | --- |
| 🤖 AI 突發快訊 | 第 4、7 週由 AI 依你目前的處境編寫事件。數值會被引擎重新檢查與限幅，不會失衡。 |
| 🦉 幕僚建議 | 問幕僚時由 AI 用貓頭鷹的口吻給提示（每局 3 次）；沒有 AI 時用內建規則。 |
| 🦆 鴨鴨開票特報 | 結算畫面依你的決策歷史寫一段報導；沒有 AI 時用內建模板。 |

支援的服務商（在 AI 設定裡選擇，模型名稱可自行改）：

- **Anthropic（Claude）**：預設模型 `claude-haiku-5-5`。
- **OpenAI 相容**：預設 `gpt-4o-mini`，可改網址連到 OpenRouter 或其他相容服務；網址必須是 `https://`（本機測試可用 `http://localhost`）。本機模型（例如 Ollama）需要允許瀏覽器跨來源請求（CORS）。
- **Google Gemini**：預設 `gemini-2.5-flash`。

預設模型名稱可能隨服務商更新而過期，遇到「找不到模型」時，到 AI 設定改成目前可用的名稱即可。

AI 回傳的內容一律當成純文字顯示（不會被當成 HTML），事件的數值一律經過 `TPEngine.validateAIEvent` 重新整理與限幅。

## 專案結構

```
index.html            入口（含內容安全政策）
css/style.css         樣式（手機優先）
js/data.js            候選人、選民群、行政區、事件池 ← 想加事件改這裡
js/engine.js          純邏輯引擎（民調、對手行動、開票），不碰 DOM
js/ai.js              AI 模組（玩家自帶金鑰、多服務商）
js/ui.js              所有畫面與互動
tools/sim.js          平衡模擬：node tools/sim.js 800
tools/tune.js         參數掃描
tools/smoke.js        無瀏覽器冒煙測試：node tools/smoke.js
tools/check-secrets.js 金鑰外洩檢查
```

## 開發

本機預覽：在專案根目錄執行 `python3 -m http.server 8080`，開 `http://localhost:8080`。

### 新增一個事件

在 `js/data.js` 的 `POOL` 加一筆：

```js
{
  id: 'my_event', emoji: '🎈', title: '事件標題', weight: 1,
  scene: '情境描述……',
  choices: [
    { id: 'a', e: '💸', label: '選項名稱', sub: '一句說明', cost: { funds: 20, energy: 10 },
      fx: { youth: 6, worker: 2, trust: 2 }, result: '選擇後的一句回饋。' },
    // ……共三個；建議至少有一個 cost 為 0 的省力選項
  ],
}
```

選項可用的欄位：`risk` / `luck`（機率額外效果）、`dist`（行政區地盤加成）、`rival`（打擊領先對手）、`flag`（記錄承諾）、`bonusIf`（呼應之前的承諾）、`mini`（小遊戲）。可參考 `night_market` 與 `office_squeeze`。

### 調整難度

修改 `js/engine.js` 最上方的 `CONFIG`（對手每週增幅、資源回復、民調敏感度等），再用 `node tools/sim.js` 看勝率。目前目標：普通難度下，隨機亂選約 15% 勝率、會看提示的玩家約 80%。

## 授權與聲明

自由修改與分享。遊戲內容為虛構創作，行政區人口與選民結構為示意數值，並非真實統計。
