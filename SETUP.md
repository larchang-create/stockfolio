# 啟用 AI 研究

登入與名單同步已由使用者設定完成，目前進入公開資料搜尋與研究服務設定。請先讀 [AI-SETUP.md](AI-SETUP.md)：只需在既有 Builds 新增 OPENAI_API_KEY Secret，部署指令維持 npm run deploy。

# 修正部署密碼未進入 Runtime：使用統一部署指令

目前正式網站已確認 databaseReady:true、passwordState:missing。先前使用者把密碼設在 Builds 的 Secret，而單獨 `npx wrangler deploy` 沒有將該值傳給 Runtime。不要再引導使用者反覆重設或找 Runtime 區塊。

在 **stockfolio → Settings → Builds**：

1. 保留既有 Variables and secrets 中的 Secret `SITE_PASSWORD`（16 至 256 字元，不貼到聊天）。
2. 將 **Deploy command** 改成 **`npm run deploy`**。
3. 儲存並重新部署一次。

package.json 的 deploy 現在執行 scripts/deploy.mjs：使用 Builds 的密碼產生權限 0600 的暫存秘密檔，以官方 `wrangler deploy --secrets-file` 同時部署程式及加密 Secret；結束或失敗立即刪除暫存檔，不放入 repo/public，不印出內容。需要 Wrangler4.156+，已設定 dependency。

部署完成後，程式還會查正式 /api/setup、用該密碼登入、讀取名單確認 DB 可用、登出測試工作階段。測試不改動股票，不印出個人資料。失敗回傳非零，不再把單純 upload 成功當成登入可用。若 Build 沒有密碼或長度錯誤，在部署前直接停止，避免猜測。

本機單元及打包測試已通過；真正正式登入驗證需要使用者改好 Deploy command 後於 Cloudflare 執行。代理未取得雲端帳號操作權限，不能宣稱已替使用者改好指令或驗證正式登入。

官方依據：https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code

---

# 個人網站設定：密碼登入

使用者已取消 Cloudflare Zero Trust／Access，不要再要求綁付款方式、建立 Access 應用、信箱驗證或 AUD。沿用個人 Cloudflare Workers 與 D1 的免費方案；正式使用網址：

https://stockfolio.larry17342.workers.dev/

## 只需設定一次密碼

1. 關閉 Zero Trust 付款頁，不需要在該頁填寫任何付款資訊。
2. 回到 Cloudflare → Workers & Pages → **stockfolio** → **Settings**。
3. 找到 **Variables and Secrets** → **Add**，類型選 **Secret**。
4. 名稱填 `SITE_PASSWORD`，內容填自己設定的網站專用密碼，至少 16 個字元、最多 256 字元。請使用密碼管理員產生，或數個不相關的單字組合；不要使用 Gmail 密碼。
5. **Save and deploy**。不要把密碼貼到聊天、GitHub、一般 vars 或網址。
6. 回到網站，輸入這個密碼登入。另一台電腦／手機也用相同網址及密碼登入，即可共用相同資料。

目前程式已移除 Access 依賴。GitHub main 更新會觸發已連接的 Cloudflare 自動部署；是否部署成功、DB 是否連接，以實際控制台及網站為準，不能只憑本機測試宣稱同步已上線。

## 資料庫自動準備

wrangler.jsonc 使用 D1 自動資源配置：`binding: DB`、`database_name: stockfolio`，不填捏造的 database_id。Wrangler 4.45+ 在部署時建立或沿用綁定資源。第一次使用時，後端自動建立名單、登入工作階段與登入次數限制的表，不需使用者貼 SQL。

如果 Cloudflare 的建置紀錄顯示沒有建立 D1 的權限，先修正該次建置使用的 API Token 對此個人帳號的 D1 Edit 權限，或由使用者在 D1 建立資料庫後把實際 database_id 寫回 config。不要刪除或換掉既有資料庫。若已存在正式 DB，優先保留實際 ID。

自動配置說明：https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/

## 登入與同步行為

- 這是單人網站，所有裝置登入相同網站密碼後共用 `personal` 資料，不支援多使用者個別帳戶。
- 網站密碼保存在 Cloudflare Secret；前端不儲存或匯出密碼，沒有第三方登入服務。
- 登入憑證使用 Secure／HttpOnly／SameSite=Strict Cookie，約 30 天到期。後端檢查簽章及 DB 工作階段。登出會撤銷該台的工作階段；在 Cloudflare 更改密碼會使所有舊登入失效。
- 同 IP 每 15 分鐘最多 10 次登入嘗試，全站同時段最多 100 次，超出暫停登入。新增限流不是無限防禦或企業級帳號系統。
- 名單、筆記、研究草稿、已存報告同步；已開啟頁面在離線時保留修改，恢復網路重試。每 30 秒及重新回到頁面檢查更新。
- 同欄位衝突由使用者選版本；不同欄位合併，不會直接覆蓋另一裝置的修改。
- 原 GitHub Pages 是本機預覽。請先在舊網址匯出 JSON，再至雲端版匯入搬移。兩網址的本機儲存互不相通。

## 兩裝置驗收

1. 在電腦登入後新增 MSFT，等「已同步」。
2. 手機關閉公司 VPN，用行動網路登入同一網址，確認看到 MSFT。
3. 手機新增 2330，電腦重新回到頁面，確認出現。
4. 再驗證研究筆記、刪除、重新整理、短暫離線後恢復，以及同筆記衝突選擇。

未完成這些步驟前，不宣稱實際跨裝置驗收已完成。

## 後續研究服務

先完成登入與同步，再決定資料與 AI 供應商。此階段不需要 AI 金鑰或付費模型。保留的 backend/research.mjs 使用 OpenAI Responses API 搜尋公開資料並整理六個研究問題；尚無新的真實分析結果。不要在新增股票時自動發起付費請求。

## 設定看似成功但仍無法登入

先查看 /api/setup，只回傳就緒旗標與 passwordState，不含密碼或實際長度。missing 表示正式 Worker 沒收到該 Secret（或空值）；too_short 表示有收到但少於 16 字元；too_long 表示超過 256 字元；invalid_type 表示非文字；ready 表示可用。登入頁會對應顯示原因，可以按「重新檢查設定」更新狀態，不需要反覆猜或重設密碼。

Build 區塊中的 Variables and Secrets 只給建置程序使用，不會自動進入網站執行的 env。確認是在 Worker 本身 Settings 的執行設定新增 Secret，並套用到 production 目前部署。部署 Ready 不等同該網站已收到密碼。不要將 Secret 複製到公開 config。
