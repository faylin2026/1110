// Supabase 連線設定
//
// 這裡只能放 publishable key（以 sb_publishable_ 開頭），它本來就會公開在網頁上。
// 絕對不要放 secret key（sb_secret_ 開頭）或 service_role 金鑰。
// 資料安全靠 supabase/schema.sql 裡的 GRANT、RLS 與 CHECK 設定。
//
// 值的來源：Supabase 後台 → Project Settings → API Keys / Data API
window.APP_CONFIG = {
  SUPABASE_URL: "https://nkfyhiebwbgizscthskv.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_QSSA9c6pstsgi9DyGV29oQ_GhLHazlM",
};
