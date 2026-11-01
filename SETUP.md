# 個人登入及跨裝置同步設定

先完成本頁的登入與名單同步，再處理公開資料及 AI 分析。這一步不需要 OpenAI API 金鑰，也不需要購買自訂網域。服務方案與費用以 Cloudflare 註冊頁實際顯示為準。

目前尚未取得個人 Cloudflare 帳號的操作權限，因此後端未正式部署、未取得雲端網址，也尚未進行兩台實機登入同步驗收。公開 GitHub Pages 仍是本機儲存。

## 1. 建立個人帳號並連接 GitHub

1. 到 [Cloudflare](https://dash.cloudflare.com/sign-up) 使用自己的信箱建立帳號。
2. Workers & Pages → 建立應用程式／匯入 GitHub，選擇 `larchang-create/stockfolio`。
3. 選 Worker（不是 Pages），名稱 `stockfolio`，根目錄使用儲存庫根目錄。部署指令為 `npx wrangler deploy`，無需前端建置。
4. 儲存庫已有網站檔案與 Worker。首次部署未設定登入時顯示「尚未完成個人登入設定」，屬於預期狀態。
5. 記下實際 `https://stockfolio.<你的子網域>.workers.dev` 網址。

## 2. 建立 D1 資料庫

1. Cloudflare 控制台 → D1 → 建立資料庫，名稱 `stockfolio`。
2. 資料庫 Console 執行儲存庫 `migrations/0001_sync.sql` 內容，建立兩張表。
3. 記下 Database ID。請提供此非秘密識別碼，接手 AI 即可將下列設定加入 `wrangler.jsonc` 後發布。不要使用範例字串直接部署。

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "stockfolio",
  "database_id": "此處必須是實際 Database ID",
  "migrations_dir": "migrations"
}]
```

設定應保存於儲存庫，避免後續部署移除只在控制台建立的綁定。若用命令列，也可在設定後執行 `npx wrangler d1 migrations apply DB --remote` 套用同一份建表檔。

## 3. 設定自己的信箱登入

1. 啟用 Cloudflare Zero Trust，建立自己的 team name，取得 `<team>.cloudflareaccess.com`。
2. 在 Access → Applications 新增 Self-hosted 應用，完整主機名稱填第一步的 Worker 網址主機，保護整個網站，不只 `/api`。
3. 新增 Allow 規則，只允許自己的個人 Email。登入方式使用 One-time PIN（信箱一次性驗證碼）。不要使用 Everyone 規則。
4. 取得此 Access 應用程式的 Audience（AUD）。
5. 將下列一般設定加入 `wrangler.jsonc` 的 `vars`，重新部署：

```json
"vars": {
  "ACCESS_TEAM_DOMAIN": "你的team.cloudflareaccess.com",
  "ACCESS_AUD": "實際的應用程式AUD",
  "OWNER_EMAIL": "你要登入的個人信箱"
}
```

這三個設定不是 API 密鑰，但 OWNER_EMAIL 是個人資訊。若不希望信箱出現在公開儲存庫，可改用 Cloudflare Secret 設定 `OWNER_EMAIL`，不要寫進 vars。任何 API Token、登入驗證碼或帳號密碼都不要貼到聊天或 GitHub。

請使用 hostname-based Access，後端會驗證 `Cf-Access-Jwt-Assertion`；如果改用其他 Access 模式，必須確認也傳送此簽章憑證。網站與 API 使用同一網域，手機不用跨網域 Cookie 或手動輸入服務通行碼。

## 4. 驗收及搬移舊資料

1. 手機關閉公司 Wi-Fi／VPN，使用行動網路開啟個人 Worker 網址。
2. 用自己的信箱登入，確認網站顯示「已同步」。
3. 在電腦登入同一個網址及信箱；新增 MSFT，手機重新回到頁面或等待約 30 秒，確認出現。
4. 手機新增台股 2330，在電腦確認；再測試研究草稿、觀察標記、刪除及重新整理。
5. 測試兩台同時修改同一段筆記，應顯示兩個版本，由你選擇。
6. 測試已開啟頁面暫時離線後修改，恢復網路並按「立即同步」，確認另一台看到更新。
7. 從原 [GitHub 網站](https://larchang-create.github.io/stockfolio/) 匯出 JSON，於雲端版匯入（會詢問取代目前名單；先保留備份）。
8. 驗收完成後，把 `public/cloud-config.js` 的網址設為實際 Worker 首頁。GitHub 頁面上的「登入雲端版」會帶你到該網址。

此後電腦、手機都使用這個 Worker 網址；不需要開 Codex 或原本的 Omni。

## 5. 同步完成後再啟用研究服務

此階段先不設定付費模型。後續再選擇個人資料與 AI 供應商；目前保留的研究模組使用 OpenAI Responses API 搜尋公開資料並整理六個問題。

若採用此模組，在 Worker 設定 `OPENAI_API_KEY`（Secret）及 `OPENAI_MODEL`，再進行真實資料與用量驗證。新增股票不會自動呼叫 AI，需按「取得資料並分析」。這不是已整合所有台美股結構化財報的資料庫；ETF 尚不套公司研究。模型失敗不覆寫舊報告，報告不覆寫手動草稿。

官方說明：[Worker 與 Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[D1](https://developers.cloudflare.com/d1/)、[Workers GitHub 整合](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)。
