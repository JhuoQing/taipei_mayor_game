/* ============================================================
   資料檔：候選人、選民群、行政區、事件池
   - 全部角色皆為虛構動物，與任何真實政治人物、政黨無關
   - 行政區人口與選民結構為「遊戲示意值」，並非真實統計
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TPData = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ---------- 五大選民群 ---------- */
  const BLOCS = [
    { id: 'youth',  name: '青年學生', emoji: '🎒' },
    { id: 'worker', name: '上班族',   emoji: '💼' },
    { id: 'family', name: '育兒家庭', emoji: '🍼' },
    { id: 'senior', name: '銀髮長輩', emoji: '🧓' },
    { id: 'vendor', name: '店家攤商', emoji: '🏮' },
  ];

  /* ---------- 三位虛構候選人 ---------- */
  const CANDIDATES = [
    {
      id: 'mimi', no: 1, name: '招財咪', emoji: '🐱', party: '珍奶陣線',
      color: '#FF8FA3', soft: '#FFE3E8',
      tagline: '點子多、愛直播的新生代',
      perk: '年輕人超愛你，長輩還在適應',
      base:  { youth: 59, worker: 54, family: 48, senior: 40, vendor: 47 },
      gain:  { youth: 1.25, senior: 0.85 },
      intro: '大家好～我是招財咪！今天也要把好運帶給台北！',
    },
    {
      id: 'bear', no: 2, name: '熊大叔', emoji: '🐻', party: '滷肉飯聯盟',
      color: '#7FD8BE', soft: '#DDF6EE',
      tagline: '嗓門大、很會串門子的老里長',
      perk: '長輩和店家都挺你，年輕人比較無感',
      base:  { youth: 40, worker: 46, family: 50, senior: 56, vendor: 54 },
      gain:  { senior: 1.25, vendor: 1.25, youth: 0.85 },
      intro: '來來來，先吃飯！吃飽再聊政見！',
    },
    {
      id: 'fox', no: 3, name: '狐博士', emoji: '🦊', party: '小籠包黨',
      color: '#B7A0FF', soft: '#ECE5FF',
      tagline: '話不多、數據很準的行政專家',
      perk: '上班族與家長信任你，攤商覺得你太理性',
      base:  { youth: 48, worker: 58, family: 54, senior: 44, vendor: 38 },
      gain:  { worker: 1.25, family: 1.15, vendor: 0.85 },
      intro: '根據我的試算，勝率……先保密。',
    },
  ];

  /* ---------- 十二行政區（磚塊地圖座標 + 示意人口 + 選民結構） ---------- */
  const DISTRICTS = [
    { id: 'beitou',     name: '北投', col: 1, row: 0, pop: 0.085, mix: { youth: .12, worker: .20, family: .20, senior: .34, vendor: .14 } },
    { id: 'shilin',     name: '士林', col: 2, row: 0, pop: 0.095, mix: { youth: .14, worker: .20, family: .24, senior: .22, vendor: .20 } },
    { id: 'datong',     name: '大同', col: 1, row: 1, pop: 0.045, mix: { youth: .10, worker: .18, family: .14, senior: .34, vendor: .24 } },
    { id: 'zhongshan',  name: '中山', col: 2, row: 1, pop: 0.090, mix: { youth: .16, worker: .32, family: .18, senior: .20, vendor: .14 } },
    { id: 'neihu',      name: '內湖', col: 3, row: 1, pop: 0.115, mix: { youth: .14, worker: .40, family: .24, senior: .12, vendor: .10 } },
    { id: 'wanhua',     name: '萬華', col: 0, row: 2, pop: 0.065, mix: { youth: .12, worker: .16, family: .14, senior: .34, vendor: .24 } },
    { id: 'zhongzheng', name: '中正', col: 1, row: 2, pop: 0.050, mix: { youth: .18, worker: .28, family: .14, senior: .26, vendor: .14 } },
    { id: 'songshan',   name: '松山', col: 2, row: 2, pop: 0.070, mix: { youth: .14, worker: .30, family: .20, senior: .22, vendor: .14 } },
    { id: 'nangang',    name: '南港', col: 3, row: 2, pop: 0.045, mix: { youth: .14, worker: .36, family: .24, senior: .14, vendor: .12 } },
    { id: 'daan',       name: '大安', col: 1, row: 3, pop: 0.105, mix: { youth: .26, worker: .30, family: .20, senior: .16, vendor: .08 } },
    { id: 'xinyi',      name: '信義', col: 2, row: 3, pop: 0.090, mix: { youth: .14, worker: .34, family: .26, senior: .16, vendor: .10 } },
    { id: 'wenshan',    name: '文山', col: 1, row: 4, pop: 0.095, mix: { youth: .22, worker: .20, family: .28, senior: .20, vendor: .10 } },
  ];

  /* ---------- 幕僚與記者 ---------- */
  const ADVISOR = { emoji: '🦉', name: '貓頭鷹幕僚長' };
  const REPORTER = { emoji: '🦆', name: '鴨鴨記者' };

  /* ---------- 對手新聞模板 ---------- */
  const RIVAL_NEWS = {
    youth:  ['{n}到大學城辦快閃座談，學生排隊拍照', '{n}宣布青年創業基金，貼文瘋傳'],
    worker: ['{n}站上捷運站出口，遞出早餐和政見單', '{n}提出彈性上下班方案，上班族議論紛紛'],
    family: ['{n}抱著寶寶玩偶逛親子館，家長們拍手', '{n}承諾增設共融公園，社團瘋狂轉貼'],
    senior: ['{n}拜訪里長伯們，茶會一場接一場', '{n}宣布長者共餐加碼，阿公阿嬤點頭'],
    vendor: ['{n}幫夜市攤商顧攤，烤香腸一次賣光', '{n}承諾店租協調平台，店家們看好戲'],
  };
  const RIVAL_ATTACK = [
    '{n}在直播裡暗示你的政見太空泛',
    '{n}團隊發布比較表，指你的承諾很難兌現',
    '{n}翻出你以前的發言，網友吵成一團',
  ];

  /* ============================================================
     事件
     fx 的 key：youth / worker / family / senior / vendor（民意）
                trust（形象 0~100）、scandal（爭議 0~100）
     cost：{ funds, energy }
     risk：失敗時「額外」套用   luck：成功時「額外」套用
     dist：只加成特定行政區（遊戲內「地盤」效果）
     rival：對目前領先對手的全群民意加減
     flag：記錄玩家做過的承諾，會影響後續事件
     ============================================================ */

  const FIXED = {
    open: {
      id: 'e_theme', emoji: '🪧', title: '競選總部掛牌！',
      scene: '競選總部開張第一天，鴨鴨記者把麥克風塞到你面前：「請問，你這次的主打是什麼？」',
      choices: [
        { id: 'a', e: '🚇', label: '通勤大升級', sub: '增班、轉乘優惠、尖峰不再擠', cost: { funds: 20, energy: 10 },
          fx: { worker: 8, youth: 3, family: 2, vendor: -1 }, flag: 'transit', dist: { neihu: 3, nangang: 3 },
          result: '捷運站的上班族對你比了大拇指！' },
        { id: 'b', e: '🧸', label: '友善育兒城市', sub: '托育、公園、親子空間', cost: { funds: 15, energy: 15 },
          fx: { family: 9, worker: 2, senior: 1 }, flag: 'kids', dist: { wenshan: 3 },
          result: '家長社團一夜之間都在轉貼你的政見。' },
        { id: 'c', e: '👂', label: '先走訪 12 區聽故事', sub: '不急著喊口號，先用耳朵拿分', cost: { funds: 0, energy: 10 },
          fx: { youth: 2, worker: 2, family: 2, senior: 3, vendor: 2, trust: 7 }, flag: 'listener',
          result: '你的筆記本寫滿了，市民覺得被認真對待。' },
      ],
    },
    debate: {
      id: 'e_debate', emoji: '📺', title: '電視辯論會',
      scene: '三位候選人同台！攝影棚的燈好亮，觀眾席舉起手寫牌。主持人問：「請說明你與對手最大的不同。」',
      choices: [
        { id: 'a', e: '📊', label: '用數據硬剛', sub: '圖表一張一張翻', cost: { funds: 0, energy: 20 },
          fx: { worker: 7, family: 3, youth: 2, senior: -3 }, risk: { p: 0.2, fx: { trust: -3 }, result: '圖表翻太快，觀眾聽到睡著了……' },
          result: '你的數字一出，對手臉都僵了。' },
        { id: 'b', e: '💬', label: '用故事打動人心', sub: '講一個市民的真實故事', cost: { funds: 0, energy: 20 },
          fx: { senior: 5, family: 6, youth: 1, worker: -2, trust: 3 },
          result: '攝影棚安靜了幾秒，然後有人偷偷擦眼角。' },
        { id: 'c', e: '🎯', label: '專攻領先對手', sub: '見縫插針，直擊弱點', cost: { funds: 0, energy: 15 },
          fx: { trust: -3, scandal: 4 }, rival: -3,
          result: '對手被問得啞口無言，但你也被說「火藥味太重」。' },
      ],
    },
    final: {
      id: 'e_final', emoji: '🔥', title: '最後衝刺週！',
      scene: '投票日倒數！志工群組一直跳通知，你的腳底也快起水泡了。最後的資源要怎麼壓？',
      choices: [
        { id: 'a', e: '📢', label: '全區大掃街', sub: '每個區都跑到、都握手', cost: { funds: 25, energy: 25 },
          fx: { youth: 4, worker: 4, family: 4, senior: 4, vendor: 4 },
          result: '你的鞋底磨平了，但每個區都看見你。' },
        { id: 'b', e: '🎯', label: '補強最弱的一群', sub: '把力氣花在最不挺你的人身上', cost: { funds: 15, energy: 15 },
          boostWeakest: 10,
          result: '原本最冷淡的那群人，竟然主動來跟你握手。' },
        { id: 'c', e: '📞', label: '呼籲大家出門投票', sub: '低成本，穩穩拿形象分', cost: { funds: 5, energy: 8 },
          fx: { youth: 2, worker: 2, family: 2, senior: 2, vendor: 2, trust: 5, scandal: -3 },
          result: '「投票不用花錢，但很有力量！」這句話被轉貼了上萬次。' },
      ],
    },
  };

  const POOL = [
    {
      id: 'night_market', emoji: '🍢', title: '夜市掃街夜', weight: 1,
      scene: '週五晚上的夜市人山人海，烤香腸的香氣一路飄過來。攤商阿姨遞給你一串，順便問：「你有沒有要幫我們講話啊？」',
      choices: [
        { id: 'a', e: '🤝', label: '全場握手掃街', sub: '限時 5 秒，手速決定成果！', cost: { funds: 5, energy: 25 },
          mini: { type: 'tap', secs: 5, at: [10, 22] },
          dist: { shilin: 4 },
          tiers: [
            { fx: { vendor: 3, family: 1 }, result: '握到一半手就酸了……但攤商們還是很給面子。' },
            { fx: { vendor: 7, family: 3, trust: 2 }, result: '你一路握到夜市出口，香腸都吃了三根！' },
            { fx: { vendor: 11, family: 4, youth: 2, trust: 4 }, result: '神之手！整條街都在喊你的名字！' },
          ] },
        { id: 'b', e: '🪧', label: '租下巨型看板', sub: '夜市入口，全場最大', cost: { funds: 25, energy: 5 },
          fx: { youth: 2, worker: 2, family: 3, senior: 3, vendor: 2 },
          result: '大家在看板前自拍，雖然沒人記得你說了什麼。' },
        { id: 'c', e: '🌭', label: '默默買宵夜衝業績', sub: '低調，但攤商都記得', cost: { funds: 8, energy: 5 },
          fx: { vendor: 5, trust: 2 }, dist: { shilin: 2 },
          result: '你吃到快撐破，但老闆娘多送了一顆滷蛋。' },
      ],
    },
    {
      id: 'rainy_night', emoji: '☔', title: '豪大雨夜', weight: 1,
      scene: '傾盆大雨！河濱公園和地下道積水，社群上滿滿都是抱怨。你的手機一直震動。',
      choices: [
        { id: 'a', e: '🦺', label: '穿雨衣親赴現場', sub: '全身濕透，形象加分', cost: { funds: 0, energy: 25 },
          fx: { family: 4, senior: 5, worker: 3, trust: 6 }, dist: { wanhua: 3, shilin: 2 },
          result: '你的雨衣上寫著「我在現場」，網友轉發超過三萬次。' },
        { id: 'b', e: '📋', label: '開記者會公布防汛計畫', sub: '專業地講清楚怎麼做', cost: { funds: 20, energy: 10 },
          fx: { worker: 5, family: 4, trust: 3 },
          result: '簡報清楚易懂，記者們難得沒有追問。' },
        { id: 'c', e: '📱', label: '發限動表示關心', sub: '最省力，但可能被說敷衍', cost: { funds: 0, energy: 3 },
          fx: { youth: 1, trust: -3, scandal: 3 },
          result: '有人留言：「在現場的才叫關心。」' },
      ],
    },
    {
      id: 'youth_rent', emoji: '🏠', title: '租屋好貴啦！', weight: 1,
      scene: '大學生連線反映租屋價格飆漲，學生會邀請你來座談。現場的人手上都拿著「房租繳不起」的手寫牌。',
      choices: [
        { id: 'a', e: '💸', label: '提出租金補貼', sub: '立刻有感，但荷包會痛', cost: { funds: 30, energy: 5 },
          fx: { youth: 9, worker: 2 }, flag: 'rentSubsidy', dist: { daan: 3 },
          result: '台下爆出歡呼，有人把你的名字寫在手臂上。' },
        { id: 'b', e: '🏘️', label: '承諾增加青年住宅', sub: '長期計畫，慢慢有感', cost: { funds: 15, energy: 15 },
          fx: { youth: 5, family: 3, worker: 1 }, flag: 'housing',
          result: '同學們說：「聽起來很棒，但我畢業前蓋得完嗎？」' },
        { id: 'c', e: '🎧', label: '只聽、不承諾', sub: '誠實但不太解渴', cost: { funds: 0, energy: 8 },
          fx: { youth: 2, trust: 2 },
          result: '大家客氣地鼓掌，但眼神寫著「所以呢？」' },
      ],
    },
    {
      id: 'senior_card', emoji: '🧓', title: '長輩的心聲', weight: 1,
      scene: '社區活動中心裡，阿公阿嬤們圍著你說：公車路線太少、敬老福利希望加碼，還有，手機到底怎麼用啦。',
      choices: [
        { id: 'a', e: '🚌', label: '敬老卡加碼＋社區巴士', sub: '誠意十足的大禮', cost: { funds: 25, energy: 5 },
          fx: { senior: 9, family: 1, worker: -1 }, flag: 'seniorBus', dist: { beitou: 3, datong: 2 },
          result: '阿嬤塞給你一包糖：「這個少年仔有誠意！」' },
        { id: 'b', e: '🍵', label: '辦社區茶會拜訪', sub: '一家一家敲門', cost: { funds: 5, energy: 20 },
          fx: { senior: 6, trust: 3, family: 1 },
          result: '你喝了十二杯茶，也聽了十二個故事。' },
        { id: 'c', e: '📱', label: '開辦手機教學班', sub: '長輩和年輕人都覺得可愛', cost: { funds: 10, energy: 12 },
          fx: { senior: 3, youth: 3, trust: 2 },
          result: '孫子孫女把教學影片 po 上網，點閱爆表。' },
      ],
    },
    {
      id: 'leaked_audio', emoji: '🎙️', title: '錄音外流！', weight: 1,
      scene: '一段你私下聊天的錄音被剪成短影音，標題寫得超誇張。留言區已經吵成一鍋滷肉。',
      choices: [
        { id: 'a', e: '🙇', label: '立刻道歉說明', sub: '快速、誠懇、不躲避', cost: { funds: 0, energy: 10 },
          fx: { trust: 1, scandal: -6 },
          result: '你把完整錄音公開，風向慢慢轉了。' },
        { id: 'b', e: '🔎', label: '發聲明強力反擊', sub: '賭一把！', cost: { funds: 15, energy: 8 },
          fx: { scandal: -2 },
          luck: { p: 0.5, fx: { trust: 7, scandal: -8 }, result: '你逐字拆解，網友直呼：「被剪輯害了！」' },
          risk: { p: 0.5, fx: { trust: -6, scandal: 8 }, result: '聲明被抓到一個小錯字，反而成了新的炎上點。' },
          result: '聲明發出後，網路上一片嘩然。' },
        { id: 'c', e: '🕊️', label: '當作沒看到', sub: '時間會沖淡一切？', cost: { funds: 0, energy: 0 },
          fx: { trust: -2, scandal: 6 },
          result: '事情沒有自己消失，反而越滾越大。' },
      ],
    },
    {
      id: 'office_squeeze', emoji: '💼', title: '尖峰時段好擠', weight: 1,
      scene: '內湖科技園區的加班族抱怨：捷運尖峰擠成沙丁魚，午餐還貴到想哭。',
      choices: [
        { id: 'a', e: '🚇', label: '增班尖峰＋倡議彈性上班', sub: '直擊痛點', cost: { funds: 25, energy: 8 },
          fx: { worker: 8, family: 2, vendor: -2 }, dist: { neihu: 3, nangang: 2 },
          bonusIf: { flag: 'transit', fx: { worker: 3, trust: 2 }, text: '（你一開始就主打通勤，大家覺得你說到做到！）' },
          result: '「終於有人懂了！」加班族在社群上刷屏。' },
        { id: 'b', e: '🍱', label: '推動午餐優惠聯盟', sub: '上班族和店家都開心', cost: { funds: 15, energy: 10 },
          fx: { worker: 5, vendor: 4 },
          result: '便當店老闆笑得闔不攏嘴。' },
        { id: 'c', e: '🎥', label: '辦一場 Q&A 直播', sub: '用嘴巴解決問題', cost: { funds: 0, energy: 15 },
          fx: { worker: 3, youth: 3, trust: 2 },
          result: '你回答了 87 個問題，最後一題是「午餐吃什麼」。' },
      ],
    },
    {
      id: 'daycare', emoji: '🏫', title: '托育名額搶翻天', weight: 1,
      scene: '家長團體氣到發聲：托育名額抽籤像抽獎，公園的遊具也舊到掉漆。',
      choices: [
        { id: 'a', e: '👶', label: '增設公共托育', sub: '大工程，但家長最有感', cost: { funds: 30, energy: 10 },
          fx: { family: 9, worker: 2 }, flag: 'daycare', dist: { wenshan: 3, xinyi: 2 },
          bonusIf: { flag: 'kids', fx: { family: 3, trust: 2 }, text: '（你一直主打育兒，這次格外有說服力！）' },
          result: '爸爸媽媽們含淚說：「我終於可以回職場了。」' },
        { id: 'b', e: '🛝', label: '翻新共融遊具', sub: '小孩笑，大人也笑', cost: { funds: 20, energy: 5 },
          fx: { family: 6, youth: 1, trust: 2 },
          result: '新溜滑梯開幕當天，隊伍排到馬路上。' },
        { id: 'c', e: '🍼', label: '去托育中心當一日志工', sub: '手忙腳亂但很真誠', cost: { funds: 0, energy: 20 },
          fx: { family: 4, trust: 4 },
          result: '你被三個小朋友同時抱住，笑容是真的。' },
      ],
    },
    {
      id: 'old_town', emoji: '🏮', title: '老街的去留', weight: 1,
      scene: '大稻埕的老店面臨拆遷與觀光化的爭議，店家們請你表態：是留住老味道，還是讓城市往前跑？',
      choices: [
        { id: 'a', e: '🧱', label: '推動老街活化計畫', sub: '保留風貌，也讓生意興隆', cost: { funds: 25, energy: 10 },
          fx: { vendor: 8, senior: 4, youth: 2 }, flag: 'oldtown', dist: { datong: 4, wanhua: 3 },
          result: '老店的店長掛上「感謝」兩個大字。' },
        { id: 'b', e: '🏗️', label: '支持加速都更', sub: '房子新、路更寬，但有人不開心', cost: { funds: 10, energy: 10 },
          fx: { worker: 4, family: 2, vendor: -5, senior: -3 },
          result: '建商很開心，老店的阿伯嘆了一口氣。' },
        { id: 'c', e: '🍵', label: '蹲在店門口喝茶聊天', sub: '不表態，但很有誠意', cost: { funds: 0, energy: 10 },
          fx: { vendor: 3, senior: 2, trust: 3 },
          result: '老闆泡了最好的茶：「少年仔，你有耳朵。」' },
      ],
    },
    {
      id: 'mascot_rally', emoji: '🎪', title: '造勢活動怎麼辦', weight: 1,
      scene: '競選團隊吵成一團：到底該辦大型造勢、拍短影音，還是做貼圖就好？',
      choices: [
        { id: 'a', e: '🎆', label: '大型造勢晚會', sub: '全場嗨翻，錢包也見底', cost: { funds: 35, energy: 15 },
          fx: { youth: 6, worker: 3, family: 3, senior: 2, vendor: 2 },
          result: '螢光棒海一路閃到凌晨，團隊嗓子都啞了。' },
        { id: 'b', e: '🎬', label: '短影音挑戰賽', sub: '成功就爆紅，失敗就尷尬', cost: { funds: 10, energy: 20 },
          fx: { youth: 8, worker: 2 },
          risk: { p: 0.3, fx: { scandal: 6, trust: -2 }, result: '你的舞步被剪成鬼畜影片，全網瘋傳……' },
          result: '你的舞蹈挑戰獲得十萬個讚！' },
        { id: 'c', e: '🧧', label: '發放吉祥物貼圖', sub: '便宜又可愛', cost: { funds: 5, energy: 5 },
          fx: { youth: 3, family: 2 },
          result: '貼圖一上架，群組裡都是你的臉。' },
      ],
    },
    {
      id: 'endorsement', emoji: '🌟', title: '有人想站台', weight: 1,
      scene: '三組人馬同時敲你的門：一位超紅的網紅、一位廟公加里長，還有一位退休的老教授。',
      choices: [
        { id: 'a', e: '📺', label: '接受網紅站台', sub: '年輕人買單，但有風險', cost: { funds: 10, energy: 5 },
          fx: { youth: 7, worker: 1 },
          risk: { p: 0.25, fx: { scandal: 6 }, result: '網紅過去的爭議被翻出來，連累了你。' },
          result: '站台影片瞬間破百萬觀看。' },
        { id: 'b', e: '⛩️', label: '拜訪廟公與里長', sub: '地方人脈，樁腳之王', cost: { funds: 0, energy: 20 },
          fx: { senior: 6, vendor: 4, family: 2 },
          result: '廟口擺了一桌，每個人都說「自己人啦」。' },
        { id: 'c', e: '🎓', label: '請老教授公開背書', sub: '低調但有分量', cost: { funds: 15, energy: 5 },
          fx: { worker: 5, family: 3, trust: 4 },
          result: '教授推推眼鏡說：「這份計畫，我審過。」' },
      ],
    },
    {
      id: 'rival_attack', emoji: '🥊', title: '對手出招了', weight: 1,
      scene: '領先的對手突然發難，質疑你的政見前後矛盾，記者圍著你要回應。',
      choices: [
        { id: 'a', e: '📜', label: '公開完整政見紀錄', sub: '攤在陽光下', cost: { funds: 0, energy: 15 },
          fx: { trust: 5, scandal: -4 },
          result: '你的紀錄清清楚楚，反而讓人更安心。' },
        { id: 'b', e: '🎤', label: '反擊對手的漏洞', sub: '火力全開', cost: { funds: 10, energy: 10 },
          fx: { trust: -1 }, rival: -3,
          risk: { p: 0.3, fx: { scandal: 5 }, result: '你說得太兇，被指控「抹黑」。' },
          result: '對手的支持者開始動搖。' },
        { id: 'c', e: '🤐', label: '不回應', sub: '寧靜致遠？', cost: { funds: 0, energy: 0 },
          fx: { trust: -2, scandal: 4 },
          result: '沉默被解讀成心虛，風向有點不妙。' },
      ],
    },
    {
      id: 'volunteers', emoji: '🦸', title: '志工團報到', weight: 1,
      scene: '一群大學生志工說，想自費來幫你掃街、發傳單、顧攤位。',
      choices: [
        { id: 'a', e: '🍙', label: '辦培訓、請吃便當', sub: '把志工團顧好', cost: { funds: 15, energy: 10 },
          fx: { youth: 5, worker: 2, family: 2, trust: 3 },
          result: '志工們穿著同款背心，成了街頭最可愛的風景。' },
        { id: 'b', e: '📲', label: '建群組讓他們自主運作', sub: '放手給年輕人', cost: { funds: 0, energy: 8 },
          fx: { youth: 3, trust: 2 },
          result: '群組一天跳出 999+ 則訊息，大家玩得很開心。' },
        { id: 'c', e: '🙏', label: '婉拒，專心跑行程', sub: '省力，但有點可惜', cost: { funds: 0, energy: 0 },
          fx: { trust: -1 },
          result: '志工們失望地說：「好吧，那我們自己去別組。」' },
      ],
    },
    {
      id: 'garbage_truck', emoji: '🗑️', title: '垃圾車之亂', weight: 1,
      scene: '市民抱怨垃圾車時間不固定，夜市結束後的垃圾堆得像小山。',
      choices: [
        { id: 'a', e: '🚛', label: '承諾調整收運＋夜市清潔計畫', sub: '全面改善', cost: { funds: 20, energy: 8 },
          fx: { family: 4, vendor: 3, senior: 3, worker: 2 },
          result: '垃圾車的音樂聲突然變得很悅耳。' },
        { id: 'b', e: '🚚', label: '親自跟車體驗', sub: '一起追垃圾車！', cost: { funds: 0, energy: 20 },
          fx: { trust: 5, family: 3 },
          result: '你提著垃圾袋追車的畫面，成了年度迷因。' },
        { id: 'c', e: '📝', label: '請市府研究改善', sub: '穩穩的，沒有驚喜', cost: { funds: 0, energy: 3 },
          fx: { family: 1, trust: -1 },
          result: '大家的反應是：「又是研究……」' },
      ],
    },
    {
      id: 'zoo_baby', emoji: '🐼', title: '動物園新生兒', weight: 1,
      scene: '木柵動物園的新生幼獸成了全民話題。你的幕僚眼睛發亮：「要不要蹭一下熱度？」',
      choices: [
        { id: 'a', e: '📸', label: '去動物園合照打卡', sub: '可愛爆擊', cost: { funds: 5, energy: 12 },
          fx: { family: 5, youth: 4, trust: 1 }, dist: { wenshan: 4 },
          result: '照片裡你笑得比幼獸還開心。' },
        { id: 'b', e: '🎟️', label: '推出親子日活動', sub: '家長最買單', cost: { funds: 20, energy: 10 },
          fx: { family: 7, youth: 2 }, dist: { wenshan: 3 },
          result: '親子日報名一小時就額滿。' },
        { id: 'c', e: '🧍', label: '保持距離，不蹭熱度', sub: '低調', cost: { funds: 0, energy: 0 },
          fx: { trust: 2 },
          result: '有人說你很穩重，也有人說你錯過了好機會。' },
      ],
    },
    {
      /* 條件事件：承諾太多，會被追問錢從哪裡來 */
      id: 'budget_doubt', emoji: '💰', title: '錢從哪裡來？', weight: 0,
      cond: (s) => ['rentSubsidy', 'seniorBus', 'daycare', 'transit', 'kids', 'housing', 'oldtown']
        .filter((f) => s.flags[f]).length >= 2,
      boost: 5,
      scene: '你前面開出了不少好政見。現在記者舉手：「請問，這些錢從哪裡來？」',
      choices: [
        { id: 'a', e: '📚', label: '公布完整財務計畫', sub: '一條一條算給大家看', cost: { funds: 10, energy: 20 },
          fx: { trust: 8, worker: 3, scandal: -3 },
          result: '一整面牆的試算表，讓記者安靜了。' },
        { id: 'b', e: '🥊', label: '反問對手的預算', sub: '轉移焦點', cost: { funds: 0, energy: 10 },
          fx: { trust: -1, scandal: 2 }, rival: -2,
          result: '現場氣氛一度很火爆，但問題沒被回答。' },
        { id: 'c', e: '🙈', label: '說會再研究', sub: '拖延戰術', cost: { funds: 0, energy: 0 },
          fx: { trust: -5, scandal: 4 },
          result: '「再研究」這三個字，被做成了梗圖。' },
      ],
    },
  ];

  /* ---------- 結局 ---------- */
  const BADGES = [
    { id: 'listener',  emoji: '👂', name: '傾聽之王',   test: (c) => c.flags.listener && c.trust >= 60 },
    { id: 'market',    emoji: '🍢', name: '夜市之神',   test: (c) => c.flags.marketGreat },
    { id: 'clean',     emoji: '✨', name: '零黑料',     test: (c) => c.scandal <= 3 },
    { id: 'rich',      emoji: '💰', name: '荷包君',     test: (c) => c.funds >= 50 },
    { id: 'sweep',     emoji: '🌈', name: '全區都愛',   test: (c) => c.districtsWon >= 10 },
    { id: 'comeback',  emoji: '🔥', name: '逆轉勝',     test: (c) => c.won && c.trailed },
  ];

  return { BLOCS, CANDIDATES, DISTRICTS, ADVISOR, REPORTER, RIVAL_NEWS, RIVAL_ATTACK, FIXED, POOL, BADGES };
});
