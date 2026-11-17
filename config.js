// 網站設定
//
// 這裡只能放 publishable key（以 sb_publishable_ 開頭），它本來就會公開在網頁上。
// 絕對不要放 secret key（sb_secret_ 開頭）或 service_role 金鑰。
// 資料安全靠 supabase/ 資料夾裡各個 SQL 檔的 GRANT、RLS 與 CHECK 設定。
//
// 值的來源：Supabase 後台 → Project Settings → API Keys / Data API
window.APP_CONFIG = {
  SUPABASE_URL: "https://nkfyhiebwbgizscthskv.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_QSSA9c6pstsgi9DyGV29oQ_GhLHazlM",

  // ---------- 水電報修表單（index.html）的選項 ----------
  // 報修人的所屬部門
  REPAIR_DEPARTMENTS: ["管理部", "外銷部", "董事長室", "總經理室", "設計部", "業務部"],

  // 故障位置
  // 表單會依「樓層 → 區域」的順序讓報修人選擇；改完存檔即可，不必動其他檔案。
  REPAIR_FLOORS: ["1F", "2F", "3F", "4F", "5F"],
  // 每個樓層都能選的區域
  REPAIR_AREAS: ["辦公區", "會議室", "茶水間", "廁所", "走廊／梯廳", "大廳／櫃台", "機房", "倉庫", "停車場", "其他"],
};
