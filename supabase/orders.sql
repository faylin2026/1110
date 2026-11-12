-- =====================================================================
-- 肉品訂購登記：Supabase 建表 SQL
--
-- 用法：在 Supabase 專案的 SQL Editor 貼上整份檔案並執行一次。
-- 整份包在同一個交易裡，任何一步失敗就全部不生效。
--
-- 訂單含有訂購人姓名與電話，所以權限比報修表更嚴格：
--   網頁（anon）只能「新增」訂單，不能讀取、修改或刪除任何訂單。
--   查看與處理訂單請到 Supabase 後台的 Table Editor。
--
-- 安全設計分三層：
--   1. GRANT  ：anon 只能新增，而且只能填指定欄位。
--   2. RLS    ：只有 insert policy，新增時狀態必須是「待確認」。
--   3. CHECK  ：電話格式、重量範圍、價格範圍、文字長度。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 建立資料表
-- id、created_at、estimated_total、status 由資料庫產生，網頁不能填。
-- estimated_total 是「產生欄位」：由 每公斤單價 × 重量 自動計算，避免被竄改。
-- 注意：unit_price_per_kg 由網頁依參考價帶入，只供預估，實際以店家報價為準。
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                 uuid          primary key default gen_random_uuid(),
  created_at         timestamptz   not null    default now(),
  customer_name      text          not null,
  phone              text          not null,
  pickup_method      text          not null,
  pickup_note        text          not null    default '',
  note               text          not null    default '',
  store_name         text          not null,
  item_name          text          not null,
  unit_price_per_kg  numeric(10,2) not null,
  weight_kg          numeric(6,2)  not null,
  estimated_total    numeric(12,0) generated always as (round(unit_price_per_kg * weight_kg)) stored,
  status             text          not null    default '待確認',

  -- -------------------------------------------------------------------
  -- 第 3 層：CHECK 限制（連管理員從後台修改也必須遵守）
  -- -------------------------------------------------------------------

  -- 訂購人：去掉前後空白後 1～50 字
  constraint orders_customer_name_length
    check (char_length(btrim(customer_name)) between 1 and 50
           and char_length(customer_name) <= 50),

  -- 電話：只能有數字、+、-、空白、括號，共 8～20 字
  constraint orders_phone_format
    check (phone ~ '^[0-9+()\- ]{8,20}$'),

  -- 取貨方式只能是 自取 或 宅配；宅配時必須填地址（pickup_note）
  constraint orders_pickup_method_check
    check (pickup_method in ('自取', '宅配')),
  constraint orders_pickup_note_length
    check (char_length(pickup_note) <= 200),
  constraint orders_delivery_needs_address
    check (pickup_method <> '宅配' or char_length(btrim(pickup_note)) >= 5),

  -- 備註最多 500 字
  constraint orders_note_length
    check (char_length(note) <= 500),

  -- 店家、品項名稱不能是空的
  constraint orders_store_name_length
    check (char_length(btrim(store_name)) between 1 and 100),
  constraint orders_item_name_length
    check (char_length(btrim(item_name)) between 1 and 200),

  -- 每公斤單價：大於 0、不超過 100,000 元
  constraint orders_unit_price_range
    check (unit_price_per_kg > 0 and unit_price_per_kg <= 100000),

  -- 重量：0.1～50 公斤
  constraint orders_weight_range
    check (weight_kg >= 0.1 and weight_kg <= 50),

  -- 處理狀態只能是規定的值
  constraint orders_status_check
    check (status in ('待確認', '已向店家下單', '已完成', '已取消'))
);

comment on table public.orders is '肉品訂購登記：網頁送出的訂單，只有後台能查看';

-- ---------------------------------------------------------------------
-- 第 1 層：GRANT 權限
-- 先收回所有權限，再只給 anon「新增」以下欄位的權限：
--   customer_name、phone、pickup_method、pickup_note、note、
--   store_name、item_name、unit_price_per_kg、weight_kg
-- 不給讀取（select），所以網頁看不到任何訂單、電話不會外流。
-- 不給修改、刪除。authenticated（登入使用者）不給任何權限。
-- ---------------------------------------------------------------------
revoke all on table public.orders from public, anon, authenticated;

grant insert (customer_name, phone, pickup_method, pickup_note, note,
              store_name, item_name, unit_price_per_kg, weight_kg)
  on table public.orders to anon;

-- ---------------------------------------------------------------------
-- 第 2 層：RLS 資料列安全
-- 只建立 insert policy；沒有 select、update、delete policy，
-- 即使權限設錯，anon 也讀不到、改不了、刪不掉訂單。
-- ---------------------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "任何人可新增待確認的訂單" on public.orders;

create policy "任何人可新增待確認的訂單"
  on public.orders
  for insert
  to anon
  with check (status = '待確認');

commit;
