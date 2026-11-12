-- =====================================================================
-- 報修登記系統：Supabase 建表 SQL
--
-- 用法：在 Supabase 專案的 SQL Editor 貼上整份檔案並執行一次。
-- 整份包在同一個交易裡，任何一步失敗就全部不生效。
--
-- 安全設計分三層，缺一不可：
--   1. GRANT  ：決定 anon（網頁前端用公開金鑰連線的身分）能對哪些欄位做什麼。
--   2. RLS    ：決定 anon 能讀、能新增哪些「資料列」。
--   3. CHECK  ：不論誰寫入，資料本身都必須合法（選項值、文字長度）。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 建立資料表
-- id、created_at 由資料庫自動產生，前端不用也不能填。
-- gen_random_uuid() 是 PostgreSQL 13 以上內建函式，Supabase 可直接使用。
-- ---------------------------------------------------------------------
create table if not exists public.repair_requests (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null    default now(),
  reporter_name text        not null,
  location      text        not null,
  category      text        not null,
  description   text        not null,
  urgency       text        not null    default '中',
  status        text        not null    default '待處理',

  -- -------------------------------------------------------------------
  -- 第 3 層：CHECK 限制
  -- 這些限制寫在資料表上，連管理員從後台修改也必須遵守。
  -- -------------------------------------------------------------------

  -- 選項欄位只能是規定的值
  constraint repair_requests_category_check
    check (category in ('設備', '網路', '環境', '其他')),
  constraint repair_requests_urgency_check
    check (urgency in ('低', '中', '高')),
  constraint repair_requests_status_check
    check (status in ('待處理', '處理中', '已完成')),

  -- 文字欄位：去掉前後空白後不能是空的，且不能超過上限字數。
  -- 上限是暫定值，筆記尚未規定（待確認）。
  constraint repair_requests_reporter_name_length
    check (char_length(btrim(reporter_name)) between 1 and 50
           and char_length(reporter_name) <= 50),
  constraint repair_requests_location_length
    check (char_length(btrim(location)) between 1 and 100
           and char_length(location) <= 100),
  constraint repair_requests_description_length
    check (char_length(btrim(description)) between 1 and 1000
           and char_length(description) <= 1000)
);

comment on table public.repair_requests is '報修登記：同事送出的報修單';

-- ---------------------------------------------------------------------
-- 第 1 層：GRANT 權限
-- 這個 Supabase 專案不會自動開放新資料表，所以要明確授權。
-- 先把所有權限收回，再只給 anon 需要的最小權限：
--   - 讀取：可讀全部欄位（清單頁要顯示）。
--   - 新增：只能填 reporter_name、location、category、description、urgency。
--     id、created_at 由資料庫產生；status 不開放，新增時一律用預設值「待處理」。
--   - 修改、刪除：完全不給。
-- authenticated（登入使用者）目前不用登入，所以也不給任何權限。
-- 管理員更新狀態請用 Supabase 後台（以資料表擁有者身分操作，不受此限）。
-- ---------------------------------------------------------------------
revoke all on table public.repair_requests from public, anon, authenticated;

grant select on table public.repair_requests to anon;

grant insert (reporter_name, location, category, description, urgency)
  on table public.repair_requests to anon;

-- ---------------------------------------------------------------------
-- 第 2 層：RLS 資料列安全
-- 啟用後，沒有符合任何 policy 的操作一律被拒絕。
-- 因為沒有建立 update、delete 的 policy，即使權限設錯也無法修改或刪除。
-- ---------------------------------------------------------------------
alter table public.repair_requests enable row level security;

-- 先刪掉同名 policy，讓這段可以重複執行
drop policy if exists "任何人可讀取報修清單" on public.repair_requests;
drop policy if exists "任何人可新增待處理的報修" on public.repair_requests;

-- 讀取：任何人（anon）都可以看到全部報修單
create policy "任何人可讀取報修清單"
  on public.repair_requests
  for select
  to anon
  using (true);

-- 新增：任何人（anon）都可以新增，但 status 必須是「待處理」。
-- GRANT 已經不讓 anon 填 status，這裡再檢查一次，作為雙重保險。
create policy "任何人可新增待處理的報修"
  on public.repair_requests
  for insert
  to anon
  with check (status = '待處理');

commit;
