# 拾股 Stockfolio

繁體中文、台股與美股個人研究工具。沒有公司登入、公司 API、VPN、Omni 服務或外部程式庫依賴。靜態網站，可交由任何 AI 修改。

## 現況與功能邊界

- 可用：新增/編輯/刪除股票、關鍵字與市場篩選、本益比與殖利率篩選、排序、自選清單、到期清單、研究紀錄、檢視後展延、JSON 備份還原、CSV 匯入、每週 ICS 提醒。
- 行情由使用者輸入或 CSV 匯入。尚未接上即時行情、全市場資料庫、雲端排程更新、Email/LINE 通知及跨裝置同步。
- 載入示範只會建立兩筆虛構公司資料，不是實際行情或推薦。
- 資料存在網站網域對應的瀏覽器 localStorage；更換網域、帳號、裝置或瀏覽器前，先匯出備份，再於新環境匯入。清除瀏覽器資料會刪除本機紀錄。
- 網頁關閉後沒有背景工作；行事曆提醒須由使用者匯入個人行事曆。每週提醒自下載後第七天起，為每週重複的全天事件。

## 本機使用

解壓縮後，用 Python 開啟靜態服務：

```sh
python3 -m http.server 8080 --directory public
```

瀏覽 `http://localhost:8080`。建議使用 HTTP 網址，不依賴直接開啟檔案時各瀏覽器不同的儲存行為。

## 公開部署與個人所有權

上傳 `public` 目錄內的所有檔案到個人靜態網站代管服務，不需要建置或伺服器。`index.html` 應位於發布根目錄。網站執行不需要這台 Omni。

公開版型預覽：https://larchang-create.github.io/stockfolio/

網站透過個人 GitHub 儲存庫 larchang-create/stockfolio 的 GitHub Actions 發布至 GitHub Pages。發布目錄為 public。這是版型預覽，仍為手動資料模式，尚未實作後續討論的完整研究流程。

本專案的 Pages Source 設定為 GitHub Actions；.github/workflows/pages.yml 會發布 public 目錄。推送至 main 後會自動部署。

網站檔案可以公開，但訪客各自只會看到自己瀏覽器的本機資料。此版本沒有登入或雲端資料庫；不要將個人備份上傳到公開儲存庫。

## CSV

第一列標題：`market,symbol,name,price,pe,yield,asOf,nextReview,frequency,notes`

market 為「台股」或「美股」。日期為 YYYY-MM-DD。price/pe/yield 可空白，yield 用百分數（3 表示 3%）。frequency 為 7、14 或 30 天。缺少價格與財務數據時，UI 顯示 —；設定數值篩選後，未知數值不會通過篩選。本益比篩選排除零與負值。

同市場同代號重複時拒絕整批匯入，不會部分修改資料。CSV 匯入新增資料，JSON 備份還原則取代現有資料，須確認。

## 下一階段

確定個人代管帳號、行情資料供應商、更新頻率與通知方式後，才可完成自動追蹤。行情金鑰應存放在後端秘密設定，不能寫入公開的 JavaScript。自動追蹤需雲端排程及資料儲存，與目前瀏覽器個人資料模式不同。
