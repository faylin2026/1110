報修登記系統
用於登記報修問題、查看報修清單並追蹤處理狀態。
雲端任務測試

欄位表：[文件/報修欄位表.xlsx](文件/報修欄位表.xlsx)

## 網頁前端

純 HTML/CSS/JavaScript，不需要安裝或建置，共用 `style.css`：

- `index.html`（首頁）：台中牛羊肉價格比較，資料在 `meat-data.js`，程式在 `meat.js`，不需要 Supabase。
- `order.html`：肉品訂購登記表，品項來自 `meat-data.js`，程式在 `order.js`，連線設定在 `config.js`。訂單存到 Supabase 的 `orders` 資料表；網頁只能新增、不能讀取，請到 Supabase 後台 Table Editor 查看訂單。

`supabase/schema.sql` 是先前報修登記用的 `repair_requests` 資料表，網頁已不再使用。

訂購登記表的設定步驟：

1. 在 Supabase 的 SQL Editor 執行 `supabase/orders.sql`。
2. 在 `config.js` 填入 Supabase 專案網址與 publishable key（不可放 secret key）。
3. 本機預覽：在儲存庫根目錄執行 `python3 -m http.server 8000`，再開啟 http://localhost:8000/ （訂購頁是 http://localhost:8000/order.html ）。
4. 發佈：GitHub 儲存庫 Settings → Pages → Source 選 Deploy from a branch，分支 `main`、資料夾 `/ (root)`。
