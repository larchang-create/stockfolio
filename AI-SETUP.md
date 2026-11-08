# 不另設 API 的研究載入流程（2026-11-08）

在 Omni 這個對話完成公開資料查核與六問題研究，將研究檔發布到現有網站。登入個人網站 → 研究院 → 選 AMZN → 載入已完成研究。若名單尚無 AMZN，先在美股加入代號。報告存入該股票 analysis 並隨既有 D1 同步至其他裝置；不覆寫筆記。亦可用「匯入研究」載入相同格式 JSON；不要用取代整份名單的「匯入備份」。

研究檔格式：schemaVersion:1、type:"stockfolio-research"、market、symbol、report。完整例子見 public/reports/AMZN-2026-11-08.json。public/reports/index.json 列出已完成的對應檔案；每檔公司僅列最新一份，保留原始生成時間、財報期末、方法與原始來源。較舊報告不覆寫較新的既有研究。個人筆記與名單不要提交至公開 repo。

目前不是背景排程，也不會在加入任意代號後自動生成研究。只有完成並發布的公司報告能載入。沒有資料的公司會明示尚未完成，不套用其他公司的範例。AMZN 的估值與部分財務細項仍為待補，不是完整定價結論。

以下 API 即時研究路徑仍保留，僅在你選擇另設個人 API 後使用，與上述流程分開。

# 啟用公開資料搜尋與六問題研究

沿用已完成的 Cloudflare Builds 設定，不新增代管服務、不再使用 Zero Trust。模型預設為 `gpt-5.4-mini`，不需要使用者另外填模型名稱。

## 使用者操作

1. 用個人帳號登入 https://platform.openai.com/ ，建立個人 API 專案（例如 Stockfolio）。在 API Keys 建立金鑰。這是按用量計費的 API，須有可用額度；是否需要付款／儲值，以該帳戶的 Billing 畫面為準。
2. Cloudflare → Workers & Pages → stockfolio → Settings → **Builds** → Variables and secrets，新增 **Secret**：名稱 `OPENAI_API_KEY`，值填剛建立的金鑰。不要貼到聊天或 GitHub。
3. 保留既有 `SITE_PASSWORD` Secret，Deploy command 保持 **`npm run deploy`**。儲存後重新部署。
4. 部署會將密碼與 AI 金鑰一起送入執行環境，並在登入後檢查模型連線，不自動產生付費研究。看到 AI 連線檢查成功後，登入網站 → 研究院 → 選 AMZN → 取得資料並分析。
5. 驗證公司身分、財報期末日期、六個區塊、可點擊的來源；用手機登入同一網站確認研究報告也存在。這才是第一次真實驗收。

## 網站行為

- 我的帳號 → 研究服務設定 → 檢查連線：只取得模型權限資訊，不產生模型回應。成功僅表示金鑰及模型連線正常；搜尋能力與實際可用額度要等第一份分析確認。
- 分析會先用 Responses web_search 搜尋當時公開資料，再以結構化輸出整理六個問題。事實、公司預測、推論、未知要分開；數字須核對原始來源。
- 此為公司研究整理，不是即時報價或已完整接上所有 SEC/MOPS 結構化財報的資料庫。ETF 尚不套用公司分析。
- 結果直接保存到 D1 與該股票的 analysis 欄位，其他裝置會同步；不覆寫個人的 research 草稿或 notes。原有公司名稱只有仍等於股票代號時才自動補。
- 同公司、同模型的報告 6 小時內優先使用雲端快取；產生日期仍為原始時間。不能將再次按鈕理解成必定重抓最新資料。
- 同一時間只允許一份新研究，避免不同裝置重複發起付費請求。新增股票不自動分析；沒有背景排程。
- API 失敗、引用缺失或格式無效不會覆寫舊報告。部分模型／搜尋額度限制可能需要在個人 API 帳戶處理。

## 程式與秘密

- `scripts/deploy.mjs` 只把 SITE_PASSWORD 及可選 OPENAI_API_KEY 放入權限 0600 暫存檔，以 `wrangler deploy --secrets-file` 送入 Cloudflare；隨後刪除，不放入 public、repo 或備份。
- `backend/research-service.mjs` 管理連線檢查、雲端快取、帳號執行鎖、報告保存。
- `backend/research.mjs` 管理搜尋、來源追溯及六區塊結構化輸出。模型預設低推理以控制時間與用量，每次最多 5 次搜尋工具呼叫。搜尋及模型皆可能計費，不承諾固定單次金額。
- 若需更換模型，可在個人 Worker 設定 OPENAI_MODEL，或修改預設常數；需同時支援 Responses、web_search 與 structured outputs。

## 已驗證與未驗證

單元、SQLite 快取與同步、部署金鑰轉送、錯誤處理、瀏覽器介面，以及兩個獨立瀏覽器的名單筆記同步均已測試。沒有使用者真實金鑰，尚未執行任何正式 OpenAI 付費研究；AMZN 首份真實報告仍待使用者設定後驗收，不可宣稱已完成。

官方資料：
- https://developers.openai.com/api/docs/quickstart
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/pricing
