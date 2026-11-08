# 最新階段 2026-11-08：總經影響路徑介面已獲使用者批准上線

- 首頁以事件為先，今日重點（最近三天新增／更新，通常至多五則，重大事件可超額、不湊數）、持續追蹤、收合的其他事件。依重大程度、名單關聯、解讀更新日排序；同一事件使用固定 id。
- 中東油氣事件有五條可切換路徑：能源、供應鏈、科技與電力、利率與消費、國防與基建。每條分事件／推論／產業，列公司研究問題、驗證指標與改變判斷條件。名單按市場與代號精確配對，連到研究院；關聯只代表待查路徑。
- 資料背景引用 11/3 IEA 能源安全評論與 10/14 油市報告，未把報告價格當即時行情。原始公告日、事件解讀更新日與抓取檢查時間分開；數據和原始公告預設收合。
- publicMacro() 合併本次發布的事件與既有即時指標快取，防止舊快取擋住新介面資料。保留較新指標與來源網址，不觸碰私人名單／筆記。固定事件公告來源不得被動態指標來源取代。
- 本次是介面與已查證事件內容更新。新聞原文仍由每日 Cloudflare 批次抓取；背景 Omni 研究連線問題尚未解決，不能聲稱每天自動產出新的事件分析。未新增 API 金鑰、費用方案或 Astra 部署。

# 最新階段 2026-11-08：使用者指定個人 Omni 遠端研究；總經新版只先預覽

使用者拒絕沿用工作網站的 Astra 團隊空間，明確改選「我自己的 Omni 遠端主機」。本階段沒有建立 Astra 服務、GitLab repo 或團隊憑證，既有工作網站未修改。

- 新 backend/remote-research.mjs：登入者可批准 90 天有效的機器授權或撤銷。遠端程式自行產生 256-bit token，只在私有遠端目錄儲存；網站儲存 SHA-256 hash。授權網址只帶指紋，沒有原始 token。機器只能讀觀察代號與公開資料、提交 analysis，不能讀私人筆記或刪除／編輯手動欄位。未授權、撤銷及跨站寫入皆拒絕。
- 遠端程式 remote/start-omni.mjs 使用內建 15 分鐘 timer，在使用者 Omni 的背景工作階段持續運行，不設定系統服務或 crontab。Omni 必須持續運行；重啟後需重新啟動此程式。遠端私有狀態目錄 remote-state/ 已忽略，不能放入 Git、移交 zip 或工具輸出原始憑證。
- 等 Cloudflare 當日 07:00 公開資料批次全部嘗試完畢，才領取最多兩檔研究。財報／公告索引未變時重用既有報告；報價／取回時間改變不單獨觸發全文重做。當批次失敗不反覆消耗模型額度。二十分鐘工作鎖、刪除／新報告防覆寫及同一交易內的 revision 更新，保留私人筆記。
- Native Codex 研究沿用 Omni 既有登入與預設模型，不搬移帳號憑證、不需要新 API key。使用 read-only、on-request 及平台受管權限，關閉 shell/apps 工具，使用原生公開搜尋；結構化輸出六題，必須有完成的 web_search 查核事件及有效來源才接受。失敗保留原報告。非正式財報／估值缺資料須保留未知。
- 真實最小模型連線測試成功（僅回 ready:true）；這不等於已完成公司研究或正式排程寫回。程序直接 HTTPS 與背景連線探測均收到 ECONNRESET，使用者表示 Omni 桌面瀏覽器能開站；不可據此聲稱研究已全自動運作。尚需一次性網站授權及背景程式實際連線成功。
- 網站新增 /remote-connect 批准／撤銷與最近研究紀錄，登入可保留這個受限返回路徑，拒絕外部跳轉。總經版面尚未改；依使用者要求，簡化版只在對話中預覽，待確認後才改網站。
- 測試：73 項 Node 測試通過；真實 Chrome + 本機 Worker/D1 驗證批准授權、登入後返回、機器不可讀 /api/state、撤銷立即生效及既有兩裝置筆記／名單／研究同步。

# 最新階段 2026-11-08：每日資料批次，遠端 Omni 研究尚未啟用

使用者明確要求 Cloudflare 每日更新、完成後 Omni 遠端自動研究，不使用個人電腦資源。

- 公開資料改成每天 Asia/Taipei 07:00 開始的新批次，使用 publicBatchStart 切日。保留每 15 分鐘排程觸發，讓每次只處理一個未檢查來源及最多兩家公司；每個來源／公司當批次已嘗試過就不自動重抓（來源失敗仍保留舊值，隔日重試，亦可手動更新）。不要誤稱 Cron 本身變成每天只觸發一次。七個來源約 90 分鐘完成，股票名單可能更久。共用台股／SEC 對照快取依同一日批次重用。排程不呼叫模型。
- 登入後狀態回傳 frequency=daily、batchStart 與繁中排程說明。總經頁同步更新文字；既有筆記／研究與 revision 未變。
- 遠端自動研究尚未啟用；尚需可用的遠端排程執行通道，以及網站受控的名單讀取與研究寫回授權。這一版沒有啟動模型、沒有建立網站機器憑證，不可宣稱兩段排程已打通。應由資料完成狀態觸發研究，而不是假定固定延後一小時就全部完成。
- 驗證新增每日07:00切日、整批完成後不再對外抓取、次日重新抓取及私人欄位保留；65 項 Node 子測試、Chrome 介面及 Wrangler dry-run 通過。

# 最新階段 2026-11-08：A 方案，Cloudflare 免費額度內優先的公開資料排程

使用者選擇 A：Cloudflare 定期抓官方公開資料、共用 D1 快取；不呼叫 AI、不串 Omni 背景分析，也不新增金鑰或付費服務。

- wrangler.jsonc 增加每 15 分鐘 cron。每次輪替一個總經／官方新聞來源、最多兩檔觀察公司；六次輪替約 90 分鐘，兩個新聞 feed 各約三小時。公司成功或失敗後隔 12 小時才再次排隊，大名單可能更久。手動股票更新有 15 分鐘快取。
- 新 backend/public-data.mjs 與 public-data-parsers.mjs，四張獨立 public_* 表自動初始化。排程只讀 watch=true 的私人名單，不覆寫 sync_stocks、筆記、研究報告或 revision。刪除／取消觀察後不重新寫回公司資料。併發鎖、來源逾時、日期／代號驗證、快取上限、失敗保留上次成功結果。
- 總經：Fed 利率、BLS CPI／核心 CPI／失業率、央行 USD/TWD、財政部出口。新聞只收 Fed／歐盟官方 RSS 標題、日期及連結，不冒充全量國際新聞，也不自動改寫既有事件分析。
- 美股：SEC 代號對照及申報索引，尚非財務數字解析、股價或 AI 六題分析。台股：上市／上櫃公司名冊、當次重大訊息、財報彙總索引、可辨識日期的上市收盤資料；ETF 不適用公司財報，櫃買價格尚未串接。官方網站可能限制讀取，個別失敗要如實顯示。
- UI：觀察列「更新資料」改走公開資料 API；展開顯示來源與日期。總經頁讀雲端快取、來源狀態與折疊更新紀錄；lastCronRun 才代表真正 cron 已觸發，不可拿部署啟動的一次手動 cycle 冒充 cron。GitHub Pages 預覽仍讀靜態資料。
- scripts/deploy.mjs 沿用既有安全密碼搬移方式，部署後驗證資料服務配置並啟動一次 cycle，不修改密碼。網站資料 API 需要登入、寫入同源。沒有公開排程操作網址。
- .github/workflows/check-public-sources.yml 只在相關程式變更後以固定 AMZN、2330、0050 做一次唯讀官方來源診斷，不讀正式私人清單，不是定期收集服務。實際排程在 Cloudflare。
- 驗證：64 項 Node 子測試、真實 Chrome 介面、兩個獨立 Chrome Context 經真正本機 Worker+D1 的名單／筆記／報告／刪除同步及 Wrangler dry-run 打包通過。官方來源實際成功與第一個正式 cron 仍須依部署後紀錄確認，不能僅憑 mock 測試宣稱成功。

- 正式 Cloudflare 已成功部署首版（efcc788）；GitHub runner 的真實來源診斷確認 Fed／CPI／就業／匯率／出口／Fed RSS 成功，AMZN 有 20 個 SEC 文件，0050／2330 可取得 2026-11-06 日期的收盤價。診斷指出台股 API 的「主旨 」欄位尾端有空白、EU RSS 用 a10:updated；已正規化欄名及支援命名空間日期，新增對應測試。2330 不在當次財報彙總／當次公告中是來源範圍，不補造資料。部分來源失敗時保留舊收盤日期及報價。
- 正式 cron 的首次執行仍要以登入後的 lastCronRun 確認；Agent 沒有 Cloudflare 控制台權限或正式網站密碼，不可聲稱親自讀取正式 D1。GitHub Pages 預覽部署另遇 artifact metadata 平台錯誤，正式 Cloudflare 站部署不受影響。

# 最新階段 2026-11-08：登入提示、逗號範例、直接刪除及 Amazon 重複整理

使用者已想起密碼，不需要再重設。要求登入頁提示至少 16 字元、英文逗號不加空格、清單直接刪除，並確認 AMZN 與 Amazon 是兩筆獨立股票列。

- login.html 新增可存取的 16 字元／大小寫提示，未改密碼或驗證規則；順便把失效的 Runtime 設定引導修正為既有 Builds Secret + npm run deploy。login.js missing 說明同步修正。
- 批次輸入範例統一 MSFT,AMZN,AAPL 與 2330,2454,0050；原本就支援無空格，也繼續容許前後空白。
- watchlist.js 僅對已知美股名稱 AMAZON、AMAZON.COM 統一為 AMZN，不做模糊公司名稱推測。新增時以標準代號防重；若只存在舊 AMAZON，保留 UUID/筆記直接更正 symbol。若既有 AMZN 與 AMAZON 兩筆，提供「合併重複」。無法直接存取正式私人資料，使用者需在更新網站按合併，不可聲稱已替他合併正式帳戶。
- 合併保留標準 AMZN 的 ID／自訂名稱／手動財務欄位，合併可容納長度內的不同筆記與六題草稿，保留較新分析和檢視紀錄；兩份完整原始紀錄存 duplicateArchive，可在展開資料匯出合併前備份。資料過大或筆記超限拒絕合併，不截斷。normalize/readForm 保留 archive，支援備份還原及同步。
- 股票列改以 symbol 為主要標籤、公司名為次標籤。每列新增「刪除」，確認後刪除股票及其附屬筆記/研究，沿用現有跨裝置同步；取消保留資料。研究正在載入時禁止合併，未儲存草稿需先存。
- 測試：51 項 Node 子測試通過；真實 Chrome 驗證提示、無空格範例、舊資料合併、取消／確認刪除。兩個獨立 Chrome Context 經本機 Worker+D1 驗證批次加入、合併及後續編輯保留 archive、較新報告、同步及跨裝置刪除，保留其他股票筆記。

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
