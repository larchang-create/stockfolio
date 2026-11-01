# 給接手 AI

優先順序：先完成個人網站、信箱登入及跨裝置相同名單／筆記，再更新公開資料抓取與六問題研究。所有服務必須屬於使用者個人帳號，可在公司 VPN 以外使用，不依賴 NVIDIA/Astra/Omni。

目前個人 GitHub `larchang-create/stockfolio` 主分支，由 Actions 發布 public 到 https://larchang-create.github.io/stockfolio/ 。這是可用的本機儲存預覽；尚未取得個人 Cloudflare 帳號／D1／Access 實際設定，不能宣稱跨裝置已上線。使用者先前表示沒有雲端/API帳號，請帶其完成 SETUP.md。不要先要求付費 AI 金鑰。

架構：
- public/index.html、style.css、app.js：繁體中文介面，台股、美股、總經、研究院。新增只要市場及代號。不要恢復大量教學橫幅。
- public/sync.js：純 JavaScript 3-way merge + 同步 Client；GET/PUT /api/state、樂觀版本、帳號本機 pending cache、離線恢復及衝突選擇。別將同步改成單純最後寫入覆蓋。
- backend/worker.mjs：網站與 API 同域。驗證 Cloudflare Access RS256 JWT（issuer、aud、exp、nbf、OWNER_EMAIL），只用已簽章 email。DB schema 在 migrations/0001_sync.sql。D1 batch 交易 CAS mutation_id guard，資料分列存放並以 JSON 分批輸入，避免大量股票超過每次查詢數限制。
- wrangler.jsonc：同時提供 public assets，run_worker_first:true。尚需實際 d1_databases 與 Access vars，不能捏造 Database ID／個人信箱。部署未設定會 fail closed。
- public/cloud-config.js：取得實際雲端網址後填入。GitHub 預覽保持本機模式；不同 origin 的舊 localStorage 要用 JSON 搬移，不能靜默讀取。
- backend/research.mjs：保留 OpenAI 搜尋與 JSON schema 報告產生，尚未實際付費呼叫。新加入股票不自動研究。AI 結果存在 analysis，手動草稿 research，不得互相覆寫。

資料：stocks[] 含穩定 UUID id、market、symbol、name、watch、數值、日期、notes、history、research、analysis。以 market:symbol 為自然識別合併。備份 schemaVersion:1；本機 key stockfolio-v1；雲端帳號 cache key stockfolio-account:<verified email> 保存 base/current/revision。本機資料不自動灌入新登入的帳號。

同步每 30 秒／focus／online；持久化修改 debounce 250ms。研究草稿未存及編輯 dialog 開啟時，延後套遠端更新。同欄衝突顯示兩版本；目前一批選本機或遠端，其他不衝突欄位仍合併。尚未做到逐欄不同選擇或多人協作。頁面必須先開啟才能離線編輯，不是 PWA。

驗證：Node22.13+ npm test；Python tests/run_browser.py 需 Chrome。SQLite 執行實際 schema、交易 rollback、stale CAS、兩裝置 Client、離線重啟、刪除與衝突、RSA token 簽章；瀏覽器驗證名單及草稿操作。模型是 mock、實際 Cloudflare 兩台裝置登入及同步尚待部署後驗收。

研究框架：公司如何賺錢、成長來源、品質（現金/利潤/AR/存貨）、成長代價、價格隱含假設、論點失效與下次查證。原始參考文章 https://unclestocknotes.substack.com/p/32e 及 /p/22b；使用者期待以文章為基準，重新讀取後再聲稱分析符合文章。需要指出公司事實、管理層預測、推論、未知及可點原始來源，不使用虛構行情補空值。未進行新一輪文章內容驗證。
