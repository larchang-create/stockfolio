# 最新修正：Build Secret 隨部署自動傳入 Runtime

使用者已非常不耐煩，正式 /api/setup 仍 passwordState:missing，但 databaseReady:true；不要繼續猜密碼長度或叫他找 Runtime。已新增 scripts/deploy.mjs，package.json 的 npm run deploy 讀 Build 的 SITE_PASSWORD，以 wrangler deploy --secrets-file 一併送 Runtime 加密 Secret，部署後驗證正式登入及 DB 讀取，再登出。Tests/deploy.test.mjs 六項測試及真 Wrangler dry-run 通過。

**必要尚待使用者動作：stockfolio → Settings → Builds → Deploy command 從 npx wrangler deploy 改成 npm run deploy，保留該 Build 區塊既有 SITE_PASSWORD Secret，儲存並重新部署。** 代理沒 Cloudflare 權限，不能替他改該欄位，也不能聲稱正式驗證已過。後續看該次建置的驗證成功訊息或明確失敗原因。若使用者不願再設，應換方法，不能再重複同樣 Runtime 指示。

# 接手重點：已改成網站密碼登入

使用者認為 Zero Trust Free 還要付款方式太麻煩，明確取消此方式。不要再引導設定 Zero Trust／Access、AUD、個人信箱白名單或綁卡。沿用已建立的個人 Cloudflare Worker，使用單一網站密碼及 D1，電腦手機共用一份資料。

個人 GitHub：larchang-create/stockfolio，main 已連接 GitHub Pages 及 Cloudflare Builds。
個人雲端：https://stockfolio.larry17342.workers.dev/ 。GitHub Pages https://larchang-create.github.io/stockfolio/ 是本機預覽與舊備份匯出入口。

最新程式移除 Access，部署會嘗試自動準備 D1，仍需使用者於 Worker Settings → Variables and Secrets 設定 Secret SITE_PASSWORD（至少 16 字元），再 Save and deploy。不要讓使用者把密碼貼到聊天或 commit。不要聲稱本機測試代表已正式啟用；確認 Cloudflare 部署、DB 綁定及兩台實機登入同步。

- backend/password-auth.mjs：登入、登出、Secure HttpOnly SameSite Strict __Host- Cookie，HMAC 簽章及 DB hashed token 驗證，30 天期限，改 Secret 使舊憑證失效；IP 與全站時間窗限流。initializeDB 自動建表，保留既有資料。
- backend/worker.mjs：公開 /login、/login.js、/style.css 與不含秘密的 /api/setup；其餘 API 必須登入；修改請求驗證 Origin。資料 owner 固定 personal，不是多租戶系統。
- wrangler.jsonc：name stockfolio、assets 同域 run_worker_first:true、preview_urls:false，d1_databases 綁定 DB、database_name stockfolio，自動配置無 ID。最低 Wrangler4.45。若正式已有 DB 優先保留其 ID；若建置 token 沒 D1 權限，請依 SETUP.md 修正，不能破壞舊資料庫。
- public/login.html、login.js：簡潔密碼頁，未設定提供一次設定引導；不保存密碼。app.js 用 /api/session 的 accountId，不再用 email。登出需先儲存、同步；清除該帳號本機 cache。
- public/sync.js：3-way merge、離線暫存、版本 CAS、防覆蓋、衝突選版本。同步名單、欄位、檢視紀錄、研究草稿及已保存 AI 報告。
- public/cloud-config.js 已填實際個人雲端網址。

測試 Node22.13+ npm test、python3 tests/run_browser.py；需 Chrome。SQLite 執行真實交易和 schema；同步測試涵蓋兩裝置、離線重啟、刪除及衝突，登入測試涵蓋密碼、Cookie、登出撤銷、改密碼失效、Origin 與限流。模型測試仍用 mock，未啟用付費分析。

使用者偏好：繁體中文，簡單介面；左側台股、美股、總經概況、研究院。新增只要市場與代號，不要加大量教學橫幅。先完成同步，再做抓取分析，不要新增股票就自動付費分析。

研究框架：公司怎麼賺錢、成長、品質、投入、價格假設、論點失效。原始文章 https://unclestocknotes.substack.com/p/32e 及 /p/22b。backend/research.mjs 保留 AI 搜尋及六區塊，analysis 與手動 research 分開存；接手應重新讀文章再聲稱符合原文。

目前排查：使用者已設定 Secret，但正式 /api/setup 回傳 passwordReady:false,databaseReady:true。原因尚未確定，不能直接宣稱是 Build 設錯或字數不足。新增 passwordState（missing/too_short/too_long/invalid_type/ready）及前端明確提示，待正式部署後確認原因。不要索取密碼。若 missing，確認執行用 Secret 與 Production 部署，而不是再讓使用者改密碼。
