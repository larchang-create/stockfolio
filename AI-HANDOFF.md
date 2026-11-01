# 給接手 AI 的說明

使用者希望個人選股並定期追蹤台股與美股，要求可從公司網域/VPN 以外使用，並可由個人帳號或其他 AI 接手。不要部署到 NVIDIA/Astra 或依賴原始 Omni。

這是無建置的靜態 HTML/CSS/JavaScript 工具。入口 `public/index.html`，樣式 `public/style.css`，行為 `public/app.js`。保留繁體中文與手機版支援。

已實作瀏覽器本機股票清單、手動數值篩選、追蹤紀錄、CSV/JSON 移轉、行事曆提醒；尚未接真實行情、全市場篩選、自動更新或背景通知。請清楚告知使用者，不能把示範資料當成真實行情。

原環境 Sites 發布回應為「Sites is not yet enabled for this workspace」。未成功建立 Sites 專案，沒有 Sites project_id；目前網站已改由個人 GitHub Pages 發布：https://larchang-create.github.io/stockfolio/。GitHub 連接已確認，個人帳號為 larchang-create；目前可存取的儲存庫清單為空。連接工具沒有建立儲存庫及設定 Pages 的功能。已準備 .github/workflows/pages.yml，待個人儲存庫建立並啟用 Pages 的 GitHub Actions 發布來源後，即可上傳專案並發布。先確認個人代管連接，再把 public 部署到使用者個人帳號，測試無公司登入下的公開存取。不要聲稱本機網址是公開網站。

資料結構：JSON {schemaVersion:1,exportedAt,stocks:[]}。股票含 market,symbol,name,price,pe,yield,asOf,nextReview,frequency,watch,notes,demo,history:[{date,notes}]。localStorage key 是 stockfolio-v1，ID 為本機 UUID。JSON 匯入會重新產生 ID。移轉網域前請使用者先匯出備份。

下一步：取得個人代管環境完成公開發布，確認正式選股策略與行情來源，再規劃安全的資料 API、雲端儲存、排程及通知。不要在前端暴露行情或 AI 金鑰。

目前已有研究院及精簡介面；後端 backend/worker.mjs 使用 OpenAI Responses web_search，再用 JSON schema 整理六區塊，沒有硬編股票樣本。wrangler.jsonc 可部署到個人 Cloudflare Worker。必須等使用者建立個人服務並設定金鑰後才能進行真實測試；目前只有模擬測試通過。前端服務設定只輸入 Worker 網址和 APP_ACCESS_TOKEN，不能輸入 OpenAI 金鑰。報告存在股票 analysis 欄位；手動草稿仍在 research 欄位。完整流程見 SETUP.md。
