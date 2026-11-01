# 個人研究服務設定

目前狀態：GitHub Pages 前端已發布；後端程式已準備但尚未部署，沒有正式服務網址、個人 OpenAI API 金鑰或實際付費分析結果。模擬測試不等同正式資料驗證。

## 1. 建立個人 Cloudflare Worker

1. 到 https://dash.cloudflare.com/sign-up 建立個人帳號。
2. 到 Workers & Pages，新增 Worker，選擇匯入 GitHub 儲存庫，授權並選取 `larchang-create/stockfolio`。
3. Worker 名稱使用 `stockfolio-research`，專案根目錄為儲存庫根目錄。部署指令使用 `npx wrangler deploy`。不需買網域，不需連接公司帳號。
4. 儲存庫根目錄已有 `wrangler.jsonc`、`package.json` 和 `backend/worker.mjs`。這個 Worker 只提供 API，網站繼續由原本 GitHub Pages 發布。
5. 若自動建立流程因缺少環境設定仍能部署，這是正常的；未設定時 /health 回報 ready:false，研究請求回報 503，不會假裝成功。

## 2. 個人 OpenAI API

到 https://platform.openai.com/ 建立個人 API 專案，啟用付費用量並建立該專案的金鑰。模型和網路搜尋會按使用量計費。請從小額測試開始，查看實際用量；平台上的預算通知不要當成保證會停止請求的硬上限。

不要把金鑰貼到聊天、GitHub、網站表單或公開文件。

## 3. 在 Worker 設定三個值

Cloudflare Worker → Settings → Variables and Secrets：

- `OPENAI_API_KEY`：個人 OpenAI API 金鑰，類型為 Secret。
- `OPENAI_MODEL`：你的 API 帳號可用、同時支援 Responses API、web_search 及結構化輸出的模型 ID。模型在正式測試時確認，程式不硬寫特定型號。
- `APP_ACCESS_TOKEN`：自行產生至少 32 字元的隨機通行碼，類型為 Secret。這是網站用來存取你後端的通行碼，與 OpenAI 金鑰不同。
- `ALLOWED_ORIGIN`：已在設定檔設為 `https://larchang-create.github.io`。移轉前端網域時要一起更新。

修改後部署 Worker，取得實際的 `https://stockfolio-research.<帳號>.workers.dev` 網址。健康檢查只確認設定是否存在，不會呼叫付費模型。

## 4. 連接網站

前往 https://larchang-create.github.io/stockfolio/#academy ，點右上角「服務設定」，輸入 Worker 網址及 `APP_ACCESS_TOKEN`。這裡絕對不輸入 OpenAI API 金鑰。

通行碼僅保留在 sessionStorage，關閉工作階段後可能需重新輸入。不會包含在股票 JSON 備份。公司報告和個人筆記仍存在本機 localStorage，沒有跨裝置同步。

連接後：

- 新增股票會發起資料取得及研究請求；已加入的公司可按「同步」。
- 研究院選股後按「取得資料並分析」執行。關閉頁面不會繼續輪詢或排程追蹤。
- 重複研究同代號會優先使用後端約 6 小時快取，產生時間在報告中顯示；「重新取得」不代表強制略過快取。
- 報告與手動研究筆記分開保存，不會用 AI 文字覆寫你的原始假設。
- 第一版是「AI 搜尋公開來源 → 依證據整理六區塊」。不是已完整整合 SEC/MOPS XBRL 的資料庫；數字擷取和判讀仍需核對原始文件。報告若沒有搜尋來源、引用不完整、格式錯誤或請求失敗，會顯示錯誤並保留舊結果。
- ETF／基金暫不套公司分析；股價、估值或資料不足時應列為未知，不是即時報價保證。
- 公開前端不會公開後端金鑰，但目前還沒有網站登入頁；後端以服務通行碼保護。登入及跨裝置資料庫是後續工作。

## 5. 第一次真實驗證

1. 先測 MSFT：檢查公司身分、官方財報期末日期、六區塊與來源連結。
2. 再測台股 2330 與另一個未預設代號，確認不是固定樣本。
3. 逐項對照原始文件的期間、幣別、單位、單季／累計、合併／個體，及現金支出／租賃口徑。
4. 到個人 OpenAI API 用量頁檢查實際費用與回應時間，再決定要不要擴大名單。

參考：
- https://developers.cloudflare.com/workers/get-started/dashboard/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/guides/structured-outputs
