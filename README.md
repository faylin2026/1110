報修登記系統
用於登記報修問題、查看報修清單並追蹤處理狀態。
雲端任務測試

欄位表：[文件/報修欄位表.xlsx](文件/報修欄位表.xlsx)

## 網頁前端

純 HTML/CSS/JavaScript，不需要安裝或建置，共用 `style.css`：

- `index.html`（首頁）：辦公室水電報修表單，程式在 `app.js`，連線設定與故障位置選項在 `config.js`。送出後新增到 Supabase 的 `repair_requests` 資料表（不送 `status`，由資料庫預設為「待受理」），現場照片上傳到 `repair-photos` 儲存空間；下方清單顯示最近 20 筆。需先執行 `supabase/repair_requests_v2.sql`。
- `meat.html`：訂購價格比較（台中牛肉、羊肉與高雄錦記地瓜酥），資料在 `meat-data.js`，程式在 `meat.js`，不需要 Supabase。
- `jinji.html`：錦記地瓜酥訂購登記，欄位只有訂購人、電話、品項、訂購數量（包），程式在 `jinji.js`，存到 Supabase 的 `jinji_orders` 資料表（需先執行 `supabase/jinji_orders.sql`）。
- `snack.html`：錦記地瓜酥登記表，以「包」為單位登記各口味，程式在 `snack.js`；每個口味存成 `orders` 資料表的一筆（重量 = 包數 × 每包重量），不需要另外建表。
- `order.html`：訂購登記表，品項來自 `meat-data.js`，程式在 `order.js`，連線設定在 `config.js`。訂單存到 Supabase 的 `orders` 資料表；網頁只能新增、不能讀取，請到 Supabase 後台 Table Editor 查看訂單。

### 水電報修的設定步驟

1. 在 Supabase 的 SQL Editor 執行 `supabase/repair_requests_v2.sql`（全新專案或已執行過舊版 `supabase/schema.sql` 都適用，舊資料會保留；可重複執行）。它會升級 `repair_requests` 資料表、設定權限，並建立不公開的照片儲存空間 `repair-photos`。
2. 在 `config.js` 的 `REPAIR_SITES`、`REPAIR_AREAS` 改成公司實際的辦公地點、樓層與區域（目前是範例）。
3. 管理端欄位由總務或維修人員在 Supabase 後台 Table Editor → `repair_requests` 填寫：

   | 欄位 | 用途 |
   | --- | --- |
   | `case_no`、`created_at` | 案件編號、報修時間，自動產生 |
   | `priority` | 處理優先順序：緊急／高／中／低 |
   | `assignee`、`vendor` | 負責人、維修廠商 |
   | `status` | 待受理 → 已派工 → 處理中 → 待驗收 → 已結案；另有「暫停處理」 |
   | `expected_at` | 預計處理時間（會顯示在網頁清單） |
   | `work_notes`、`materials`、`cost` | 處理內容、材料、費用（元） |
   | `completion_photo_paths`、`completed_at` | 完工照片路徑、完成時間 |
   | `acceptance_result` | 驗收結果：已修復／仍有問題 |
   | `reopened_from` | 仍有問題而重新開案時，填原案件的 `id` |
   | `pause_reason`、`next_update_at` | 狀態改成「暫停處理」（待料、待報價、需延期）時必填：原因、下次更新時間 |

   現場照片在後台 Storage → `repair-photos`，路徑記在 `photo_paths`。
4. 網頁（publishable key）只能新增報修人填的欄位，只能讀取清單顯示的欄位；姓名、聯絡方式、照片、費用等只有後台看得到。網頁不能修改或刪除任何資料。

`supabase/schema.sql` 是第一版的 `repair_requests` 建表 SQL，已由 `supabase/repair_requests_v2.sql` 取代。

訂購登記表的設定步驟：

1. 在 Supabase 的 SQL Editor 執行 `supabase/orders.sql`；要用地瓜酥訂購登記，再執行 `supabase/jinji_orders.sql`。
2. 在 `config.js` 填入 Supabase 專案網址與 publishable key（不可放 secret key）。
3. 本機預覽：在儲存庫根目錄執行 `python3 -m http.server 8000`，再開啟 http://localhost:8000/ （比價頁是 http://localhost:8000/meat.html ，訂購頁是 http://localhost:8000/order.html ）。
4. 發佈：GitHub 儲存庫 Settings → Pages → Source 選 Deploy from a branch，分支 `main`、資料夾 `/ (root)`。

## PWA（可安裝成手機 App）

- `manifest.webmanifest`：App 名稱、圖示、啟動頁（`index.html`）與捷徑（訂購價格比較、地瓜酥訂購、訂購登記表）。
- `sw.js`：Service Worker。本站檔案先連網取得最新版本，離線時改用快取；Supabase API 不經過快取，所以報修與訂單一定要連網才能送出。修改 `sw.js` 裡的預先快取清單時，請把 `CACHE_VERSION` 加 1。
- `pwa.js`：在每個頁面註冊 Service Worker，離線時在頁面上方顯示提示。
- `icons/`：App 圖示（192、512、maskable 512、Apple 180、favicon 32）。

安裝方式：用手機開啟 GitHub Pages 網址後，Android Chrome 點「安裝應用程式」或「加到主畫面」；iPhone Safari 點分享 →「加入主畫面」。Service Worker 需要 HTTPS，本機預覽請用 `http://localhost`。
