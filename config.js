// Supabase 連線設定
//
// 這裡只能放 publishable key（以 sb_publishable_ 開頭），它本來就會公開在網頁上。
// 絕對不要放 secret key（sb_secret_ 開頭）或 service_role 金鑰。
// 資料安全靠 supabase/schema.sql 裡的 GRANT、RLS 與 CHECK 設定。
//
// 請把下面兩個值換成你的 Supabase 專案資料：
//   Supabase 後台 → Project Settings → API Keys / Data API
window.APP_CONFIG = {
  SUPABASE_URL: "【你的 Supabase 專案網址】",
  SUPABASE_PUBLISHABLE_KEY: "【你的 publishable key】",
};
