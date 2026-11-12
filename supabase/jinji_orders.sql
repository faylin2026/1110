-- =====================================================================
-- 錦記地瓜酥訂購登記：Supabase 建表 SQL
--
-- 用法：在 Supabase 專案的 SQL Editor 貼上整份檔案並執行一次。
-- 整份包在同一個交易裡，任何一步失敗就全部不生效。
--
-- 欄位只有：訂購人、電話、品項、訂購數量（包）。
-- 訂單含姓名與電話，所以網頁（anon）只能「新增」，不能讀取、修改或刪除。
-- 查看訂單請到 Supabase 後台的 Table Editor → jinji_orders。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 建立資料表
-- id、created_at、status 由資料庫產生，網頁不能填。
-- ---------------------------------------------------------------------
create table if not exists public.jinji_orders (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null    default now(),
  customer_name  text        not null,
  phone          text        not null,
  item_name      text        not null,
  quantity       integer     not null,
  status         text        not null    default '待確認',

  -- -------------------------------------------------------------------
  -- 第 3 層：CHECK 限制（連管理員從後台修改也必須遵守）
  -- -------------------------------------------------------------------

  -- 訂購人：去掉前後空白後 1～50 字
  constraint jinji_orders_customer_name_length
    check (char_length(btrim(customer_name)) between 1 and 50
           and char_length(customer_name) <= 50),

  -- 電話：只能有數字、+、-、空白、括號，共 8～20 字
  constraint jinji_orders_phone_format
    check (phone ~ '^[0-9+()\- ]{8,20}$'),

  -- 品項：只能是錦記的四種口味
  constraint jinji_orders_item_check
    check (item_name in ('地瓜酥', '蜜糖地瓜酥', '綜合酥', '純芋頭酥')),

  -- 訂購數量：1～100 包
  constraint jinji_orders_quantity_range
    check (quantity between 1 and 100),

  -- 處理狀態只能是規定的值
  constraint jinji_orders_status_check
    check (status in ('待確認', '已向店家下單', '已完成', '已取消'))
);

comment on table public.jinji_orders is '錦記地瓜酥訂購登記：網頁送出的訂單，只有後台能查看';

-- ---------------------------------------------------------------------
-- 第 1 層：GRANT 權限
-- 先收回所有權限，再只給 anon「新增」這四個欄位：
--   customer_name、phone、item_name、quantity
-- 不給讀取（select），網頁看不到任何訂單，電話不會外流。
-- 不給修改、刪除；authenticated（登入使用者）不給任何權限。
-- ---------------------------------------------------------------------
revoke all on table public.jinji_orders from public, anon, authenticated;

grant insert (customer_name, phone, item_name, quantity)
  on table public.jinji_orders to anon;

-- ---------------------------------------------------------------------
-- 第 2 層：RLS 資料列安全
-- 只建立 insert policy；沒有 select、update、delete policy。
-- 新增時狀態必須是「待確認」（anon 無法填 status，所以一定是預設值）。
-- ---------------------------------------------------------------------
alter table public.jinji_orders enable row level security;

drop policy if exists "任何人可新增待確認的地瓜酥訂單" on public.jinji_orders;

create policy "任何人可新增待確認的地瓜酥訂單"
  on public.jinji_orders
  for insert
  to anon
  with check (status = '待確認');

commit;
