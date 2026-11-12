報修登記系統
用於登記報修問題、查看報修清單並追蹤處理狀態。
雲端任務測試

欄位表：[文件/報修欄位表.xlsx](文件/報修欄位表.xlsx)

## 網頁前端

根目錄的 `index.html`、`style.css`、`app.js`、`config.js` 是報修登記網頁，純 HTML/CSS/JavaScript，不需要安裝或建置。

1. 在 Supabase 的 SQL Editor 執行 `supabase/schema.sql`。
2. 在 `config.js` 填入 Supabase 專案網址與 publishable key（不可放 secret key）。
3. 本機預覽：在儲存庫根目錄執行 `python3 -m http.server 8000`，再開啟 http://localhost:8000/ 。
4. 發佈：GitHub 儲存庫 Settings → Pages → Source 選 Deploy from a branch，分支 `main`、資料夾 `/ (root)`。
