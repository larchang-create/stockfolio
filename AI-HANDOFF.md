# 最新階段 2026-11-08：總經與國際事件、逗號批次新增

使用者要求更新總經頁（含國際政經新聞），並新增逗號分隔股票代號、一次加入多檔。不要重設登入或改研究服務。

- public/watchlist.js 提供 parse/plan：支援英文逗號、中文逗號、頓號及換行，最多 200 代號；先驗證全部才建立新資料。重複略過、未標記觀察的舊資料重新加入，保留 notes/research/analysis/UUID。同市場一次 commit 至既有同步機制。台股保留 0050 前導零，美股大寫且支援 BRK.B / BRK-B。混入無效代號會指出並整批不寫入。
- 總經頁 public/macro.js + macro-data.json：2026-11-08 查核快照，六指標（Fed 政策利率、整體 CPI、核心 CPI、失業率、台灣出口、USD/TWD），三事件（10/28 FOMC、10/16 中國技術出口目錄提案及臨時登記、10/12 歐盟對俄名單）。原始官方來源、資料期末/發布日/查核日分開。兩張圖只有實際收錄歷史點，沒有補造 24 個月；折線顯示實際範圍並可展開數值表。
- 事件支援分類及「與我的名單相關」，精確比對市場/代號及 watch flag；點公司連回該股票研究院。這是研究關聯，不是已確認法律適用或營收曝險；提案與臨時措施分開，保留未知與後續驗證。宏觀頁不是新聞全量聚合，也不是即時/背景排程。「重新載入」僅取網站已發布快照；失敗保留前一份資料與查核時間。
- 沒改後端、密碼、D1 schema。公開資料不包含私人名單；關聯在瀏覽器端比對。
- 驗證：48 項 Node 測試通過；tests/run_browser.py 改用 browser_runner.mjs 透過 Chrome CDP 等待實際結果，避免舊 virtual-time-budget 快轉造成假 fetch 失敗。Chrome 實際介面涵蓋六指標/三事件/篩選/更新失敗保留/公司捷徑/批次去重/原子拒絕。兩個獨立瀏覽器經真正本機 Worker+D1 驗證批次名單同步、研究載入與筆記保留，重新整理可還原。桌面 1440 及手機 390 寬截圖無橫向溢出。

# 最新階段 2026-11-08：使用者回到 Omni，先用已完成研究載入流程

使用者說「我們繼續吧，繼續在 Omni 上完成」。沿用既有網站、帳號、密碼與 D1，不要求新 API 金鑰，不重做登入。

新增 public/reports.js 嚴格驗證外部研究格式；研究院「載入已完成研究」讀取 public/reports/index.json 中對應市場代號的報告，按既有 persist 同步 analysis。支援「匯入研究」JSON，僅更新選定股票 analysis，保留自訂名稱、名單、筆記與未儲存草稿。拒絕代號錯配、缺來源、未來日期、較舊報告覆寫。沒有個人 API 設定時隱藏即時 AI 分析按鈕，名單「載入研究」也走同流程。

已實際查官方 2026 Q3 財報及 SEC 10-Q，產出 AMZN-2026-11-08.json。這是公開公司研究，不包含使用者私人資料；repo 本來就是 public。六個問題含事實／推論／未知，沒有取得有效股價與完整估值，因此明確保留估值未完成，亦未假裝完成所有資產負債細項。方法依前面使用者確認的六題與兩篇 Substack，不是完整估值或個人交易建議。

未設定排程、未讓 Omni 讀私人名單、未直接寫正式 D1；需使用者在網站選 AMZN 並按載入，之後透過既有同步跨裝置。不是任意代號點擊後自動即時研究。新增公司的研究要先在這個對話完成，更新研究檔和目錄後才能載入。正式 Worker 狀態無 Cloudflare 授權可查，不要聲稱已親自驗證正式站。

驗證：npm test、Chrome 研究載入及保留草稿測試通過；兩個獨立 Chrome Context 經真正本機 Worker+D1 載入 AMZN、另一裝置收到六區塊、重新整理後仍在且其他筆記保留。修正測試 reload 需先等待 performance.timeOrigin 改變，防止讀到舊 DOM。

# 最新階段：使用者已要求啟用公開資料抓取與研究分析

先前誤把研究頁「取得資料並分析」未啟用解讀為裝置同步問題。使用者貼 AMZN 圖確認是研究按鈕，再明確說「那來設定吧」。不要再排查或重設網站密碼，沿用現有 npm run deploy 與 Builds Secret。

已實作：Build 中新增 OPENAI_API_KEY Secret 即可，部署程式 whitelist 安全帶入 Runtime；預設 gpt-5.4-mini，官方目前支援 Responses+web_search+structured outputs。部署後登入檢查 /api/research/check 只取模型資訊，不產生付費分析，也不代表有足夠額度。六問題真實研究由使用者在網站手動啟動，首次以 AMZN 驗收。

backend/research-service.mjs 管理 6 小時 D1 快取、單帳號執行鎖及分析結果原子存入股票 analysis、更新同步 revision，保留 notes/research/company name（原 name 等於 symbol 才補公司名）。快取表和鎖於 initializeDB 自動建立。呼叫失敗不覆寫。研究畫面在沒 API 金鑰時打開專屬設定，不再錯說帳號未同步。

已重新讀原始兩篇 Substack，研究提示涵蓋基本面／市場預期／價格、產業與景氣、現金品質、投入、估值情境與失效。六題是使用者確認的整理框架，不能說逐字照搬文章完整系統（部位管理、回測等尚未實作）。沒有真實 API 金鑰；尚未執行正式付費分析，不能宣稱真實數據已通過驗證。詳細操作見 AI-SETUP.md。不要索取金鑰貼到聊天。

另新增 tests/browser_sync.mjs：兩個獨立 Chrome BrowserContext 經真正 Cloudflare 本機 Worker+D1 登入、新增 MSFT、另一裝置修改筆記、重新整理均通過；不是正式手機實機驗收。

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
