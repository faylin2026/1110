-- =====================================================================
-- 辦公室水電報修：repair_requests 資料表（第 2 版）與照片儲存空間
--
-- 用法：在 Supabase 專案的 SQL Editor 貼上整份檔案並執行一次。
--   - 已經執行過舊的 supabase/schema.sql：這份會把舊資料表升級，舊資料保留。
--   - 全新的專案：只要執行這一份，不必先執行 schema.sql。
-- 整份包在同一個交易裡，任何一步失敗就全部不生效；可以重複執行。
--
-- 安全設計分三層：
--   1. GRANT ：網頁（anon）只能新增報修人填的欄位，只能讀取清單要顯示的欄位。
--              姓名、聯絡方式、照片、維修費用等欄位網頁讀不到。
--   2. RLS   ：新增時狀態一定是「待受理」；沒有修改、刪除的 policy。
--   3. CHECK ：選項值、文字長度、暫停處理必填原因。
-- 管理端欄位（優先順序、負責人、狀態、費用、驗收…）請在 Supabase 後台
-- Table Editor 填寫，後台以資料表擁有者身分操作，不受 1、2 層限制。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 資料表（全新專案才會真的建立；已存在就略過）
-- ---------------------------------------------------------------------
create table if not exists public.repair_requests (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null    default now(),
  reporter_name text        not null,
  category      text        not null,
  description   text        not null,
  status        text        not null    default '待受理'
);

-- 案件編號用的流水號
create sequence if not exists public.repair_case_seq;

-- ---------------------------------------------------------------------
-- 報修人填寫的欄位
-- ---------------------------------------------------------------------
alter table public.repair_requests
  add column if not exists case_no           text,
  add column if not exists legacy            boolean not null default false,
  add column if not exists department        text,
  add column if not exists contact           text,
  add column if not exists site              text,
  add column if not exists floor             text,
  add column if not exists area              text,
  add column if not exists seat_or_asset     text,
  add column if not exists subcategory       text,
  add column if not exists impact            text,
  add column if not exists photo_paths       text[] not null default '{}',
  add column if not exists availability_type text not null default '隨時',
  add column if not exists available_date    date,
  add column if not exists available_slot    text,
  -- 舊版欄位：新表單不再使用，只為了保留舊資料
  add column if not exists location          text,
  add column if not exists urgency           text;

-- ---------------------------------------------------------------------
-- 管理端（總務／維修人員）填寫的欄位
-- ---------------------------------------------------------------------
alter table public.repair_requests
  add column if not exists priority               text,
  add column if not exists assignee               text,
  add column if not exists vendor                 text,
  add column if not exists expected_at            timestamptz,
  add column if not exists work_notes             text,
  add column if not exists materials              text,
  add column if not exists cost                   numeric(12,0),
  add column if not exists completion_photo_paths text[] not null default '{}',
  add column if not exists completed_at           timestamptz,
  add column if not exists acceptance_result      text,
  add column if not exists reopened_from          uuid references public.repair_requests (id),
  add column if not exists pause_reason           text,
  add column if not exists next_update_at         timestamptz;

comment on table  public.repair_requests                 is '辦公室水電報修：同仁送出的報修單與維修處理紀錄';
comment on column public.repair_requests.case_no         is '案件編號，自動產生，例如 WR-20261117-0001';
comment on column public.repair_requests.legacy          is '升級前的舊資料為 true，不檢查新版必填欄位';
comment on column public.repair_requests.contact         is '聯絡方式：分機或手機';
comment on column public.repair_requests.site            is '故障位置：辦公地點';
comment on column public.repair_requests.seat_or_asset   is '座位或設備編號（選填）';
comment on column public.repair_requests.photo_paths     is '現場照片在 repair-photos 儲存空間裡的路徑';
comment on column public.repair_requests.priority        is '處理優先順序，由管理人員依安全風險及影響範圍判定';
comment on column public.repair_requests.expected_at     is '預計處理時間';
comment on column public.repair_requests.cost            is '維修費用（元）';
comment on column public.repair_requests.reopened_from   is '驗收仍有問題而重新開案時，填原案件的 id';
comment on column public.repair_requests.next_update_at  is '暫停處理時必填：下次更新時間';
comment on column public.repair_requests.location        is '舊版欄位（已停用）';
comment on column public.repair_requests.urgency         is '舊版欄位（已停用），改用 priority';

-- ---------------------------------------------------------------------
-- 升級舊資料
-- ---------------------------------------------------------------------
-- 先拿掉舊版限制，才能改狀態名稱
alter table public.repair_requests
  drop constraint if exists repair_requests_category_check,
  drop constraint if exists repair_requests_urgency_check,
  drop constraint if exists repair_requests_status_check,
  drop constraint if exists repair_requests_location_length;

alter table public.repair_requests
  alter column location drop not null,
  alter column urgency  drop not null,
  alter column urgency  drop default,
  alter column status   set default '待受理';

-- 還沒有案件編號的就是升級前的舊資料
update public.repair_requests
   set legacy  = true,
       status  = case status when '待處理' then '待受理'
                             when '已完成' then '已結案'
                             else status end,
       case_no = 'WR-' || to_char(created_at at time zone 'Asia/Taipei', 'YYYYMMDD')
                 || '-' || lpad(nextval('public.repair_case_seq')::text, 4, '0')
 where case_no is null;

alter table public.repair_requests
  alter column case_no set default
    'WR-' || to_char(now() at time zone 'Asia/Taipei', 'YYYYMMDD')
    || '-' || lpad(nextval('public.repair_case_seq')::text, 4, '0'),
  alter column case_no set not null;

-- ---------------------------------------------------------------------
-- 第 3 層：CHECK 限制（連管理員從後台修改也必須遵守）
-- ---------------------------------------------------------------------
alter table public.repair_requests
  drop constraint if exists repair_requests_case_no_key,
  drop constraint if exists repair_requests_required_fields,
  drop constraint if exists repair_requests_text_lengths,
  drop constraint if exists repair_requests_impact_check,
  drop constraint if exists repair_requests_photos_check,
  drop constraint if exists repair_requests_availability_check,
  drop constraint if exists repair_requests_priority_check,
  drop constraint if exists repair_requests_acceptance_check,
  drop constraint if exists repair_requests_cost_check,
  drop constraint if exists repair_requests_pause_check,
  drop constraint if exists repair_requests_admin_text_lengths;

alter table public.repair_requests
  add constraint repair_requests_case_no_key unique (case_no),

  -- 新報修單的必填欄位（舊資料不檢查）
  add constraint repair_requests_required_fields check (
    legacy or (
          char_length(btrim(coalesce(department, ''))) >= 1
      and char_length(btrim(coalesce(contact, '')))    >= 2
      and char_length(btrim(coalesce(site, '')))       >= 1
      and char_length(btrim(coalesce(floor, '')))      >= 1
      and char_length(btrim(coalesce(area, '')))       >= 1
      and impact is not null
    )
  ),

  -- 文字長度上限
  add constraint repair_requests_text_lengths check (
        char_length(coalesce(department, ''))     <= 50
    and char_length(coalesce(contact, ''))        <= 100
    and char_length(coalesce(site, ''))           <= 50
    and char_length(coalesce(floor, ''))          <= 20
    and char_length(coalesce(area, ''))           <= 50
    and char_length(coalesce(seat_or_asset, ''))  <= 100
    and char_length(coalesce(subcategory, ''))    <= 30
    and char_length(coalesce(available_slot, '')) <= 30
  ),

  -- 報修類別（後三個是舊版類別，只為了保留舊資料）
  add constraint repair_requests_category_check
    check (category in ('電力', '照明', '給水', '排水', '廁所', '其他', '設備', '網路', '環境')),

  add constraint repair_requests_impact_check
    check (impact is null
           or impact in ('有安全疑慮', '區域無法使用', '部分功能異常', '暫不影響使用')),

  -- 現場照片最多 5 張
  add constraint repair_requests_photos_check
    check (cardinality(photo_paths) <= 5
           and char_length(array_to_string(photo_paths, ',')) <= 1000),

  -- 可配合維修時段：指定時段時必須有日期
  add constraint repair_requests_availability_check
    check (availability_type in ('隨時', '指定時段')
           and (availability_type <> '指定時段' or available_date is not null)),

  add constraint repair_requests_status_check
    check (status in ('待受理', '已派工', '處理中', '待驗收', '已結案', '暫停處理')),

  add constraint repair_requests_priority_check
    check (priority is null or priority in ('緊急', '高', '中', '低')),

  add constraint repair_requests_acceptance_check
    check (acceptance_result is null or acceptance_result in ('已修復', '仍有問題')),

  add constraint repair_requests_cost_check
    check (cost is null or cost >= 0),

  -- 暫停處理（待料、待報價、需延期）必須填原因與下次更新時間
  add constraint repair_requests_pause_check
    check (status <> '暫停處理'
           or (char_length(btrim(coalesce(pause_reason, ''))) >= 1 and next_update_at is not null)),

  add constraint repair_requests_admin_text_lengths check (
        char_length(coalesce(assignee, ''))     <= 50
    and char_length(coalesce(vendor, ''))       <= 100
    and char_length(coalesce(work_notes, ''))   <= 2000
    and char_length(coalesce(materials, ''))    <= 1000
    and char_length(coalesce(pause_reason, '')) <= 500
  );

-- ---------------------------------------------------------------------
-- 第 1 層：GRANT 權限
-- 新增：只能填報修人的欄位。id、case_no、created_at、status 由資料庫產生。
-- 讀取：只開放清單要顯示的欄位，不含姓名、聯絡方式、座位、照片、費用。
-- 修改、刪除：完全不給。
-- ---------------------------------------------------------------------
revoke all on table public.repair_requests from public, anon, authenticated;
revoke all on sequence public.repair_case_seq from public, anon, authenticated;

grant insert (reporter_name, department, contact, site, floor, area, seat_or_asset,
              category, subcategory, description, impact, photo_paths,
              availability_type, available_date, available_slot)
  on table public.repair_requests to anon;

grant select (id, case_no, created_at, site, floor, area, location,
              category, subcategory, description, impact, status,
              expected_at, pause_reason, next_update_at, completed_at, acceptance_result)
  on table public.repair_requests to anon;

-- 產生案件編號需要用到流水號
grant usage on sequence public.repair_case_seq to anon;

-- ---------------------------------------------------------------------
-- 第 2 層：RLS 資料列安全
-- ---------------------------------------------------------------------
alter table public.repair_requests enable row level security;

drop policy if exists "任何人可讀取報修清單" on public.repair_requests;
drop policy if exists "任何人可新增待處理的報修" on public.repair_requests;
drop policy if exists "任何人可新增待受理的報修" on public.repair_requests;

create policy "任何人可讀取報修清單"
  on public.repair_requests
  for select
  to anon
  using (true);

create policy "任何人可新增待受理的報修"
  on public.repair_requests
  for insert
  to anon
  with check (status = '待受理' and not legacy);

-- ---------------------------------------------------------------------
-- 現場照片的儲存空間（Storage bucket）
-- 不公開：網頁只能上傳，不能讀取、覆蓋或刪除；看照片請到後台 Storage。
-- 每張上限 5 MB，只收圖片。
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repair-photos', 'repair-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "任何人可上傳報修照片" on storage.objects;

create policy "任何人可上傳報修照片"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'repair-photos');

commit;
