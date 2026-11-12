// 報修登記：前端程式
// 只使用 publishable key 連線，權限由資料庫的 GRANT、RLS 與 CHECK 控制。
(function () {
  "use strict";

  const TABLE = "repair_requests";
  const LIST_LIMIT = 20;
  // 與 supabase/schema.sql 的 CHECK 一致
  const MAX_LEN = { reporter_name: 50, location: 100, description: 1000 };
  const CATEGORIES = ["設備", "網路", "環境", "其他"];
  const URGENCIES = ["低", "中", "高"];

  const $ = (id) => document.getElementById(id);
  const form = $("repair-form");
  const submitBtn = $("submit-btn");
  const formMessage = $("form-message");
  const configWarning = $("config-warning");
  const listEl = $("repair-list");
  const listStatus = $("list-status");
  const refreshBtn = $("refresh-btn");
  const description = $("description");
  const descriptionCount = $("description-count");

  description.addEventListener("input", () => {
    descriptionCount.textContent = String(description.value.length);
  });

  function showMessage(el, text, ok) {
    el.textContent = text;
    el.className = "message " + (ok ? "message-ok" : "message-error");
    el.hidden = false;
  }

  // ---------- 檢查設定 ----------
  const cfg = window.APP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || "").trim();
  const key = String(cfg.SUPABASE_PUBLISHABLE_KEY || "").trim();

  function configProblem() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return "無法載入 Supabase 程式庫，請檢查網路連線後重新整理頁面。";
    }
    if (!/^https:\/\/\S+$/.test(url) || !key || key.includes("【")) {
      return "尚未設定 Supabase 連線：請在 config.js 填入專案網址與 publishable key。";
    }
    if (/^sb_secret_/.test(key) || /service_role/.test(key)) {
      return "config.js 裡放的是 secret 金鑰，這不能公開！請立即在 Supabase 後台撤銷它，改用 publishable key。";
    }
    return "";
  }

  const problem = configProblem();
  if (problem) {
    showMessage(configWarning, problem, false);
    submitBtn.disabled = true;
    refreshBtn.disabled = true;
    listStatus.textContent = "尚無法載入清單。";
    return;
  }

  const client = window.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- 錯誤訊息 ----------
  function friendlyError(error) {
    const code = error && error.code;
    if (code === "23514") return "資料不符合規定（選項或字數），請檢查後再送出。";
    if (code === "42501") return "沒有權限執行這個動作，請聯絡管理員確認資料庫權限設定。";
    if (code === "42P01" || code === "PGRST205") return "找不到報修資料表，請確認已執行 supabase/schema.sql。";
    if (error && /fetch|network/i.test(String(error.message))) return "網路連線失敗，請稍後再試。";
    return "發生錯誤：" + ((error && error.message) || "未知錯誤");
  }

  // ---------- 清單 ----------
  const timeFormat = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    // 一律用 textContent，避免使用者輸入的內容被當成 HTML 執行
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderList(rows) {
    listEl.replaceChildren();
    if (!rows.length) {
      listStatus.textContent = "目前還沒有報修資料。";
      return;
    }
    listStatus.textContent = "共 " + rows.length + " 筆，新的在上面。";
    for (const r of rows) {
      const li = el("li", "repair-item");
      const top = el("div", "item-top");
      top.append(
        el("span", "badge", r.category),
        el("span", "badge urgency-" + r.urgency, "緊急：" + r.urgency),
        el("span", "badge", r.status)
      );
      const when = r.created_at ? timeFormat.format(new Date(r.created_at)) : "";
      li.append(
        top,
        el("p", "item-desc", r.description),
        el("p", "item-meta", r.reporter_name + "・" + r.location + (when ? "・" + when : ""))
      );
      listEl.append(li);
    }
  }

  async function loadList() {
    refreshBtn.disabled = true;
    listStatus.textContent = "載入中…";
    try {
      const { data, error } = await client
        .from(TABLE)
        .select("id, created_at, reporter_name, location, category, description, urgency, status")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw error;
      renderList(data || []);
    } catch (error) {
      listEl.replaceChildren();
      listStatus.textContent = "清單載入失敗：" + friendlyError(error);
    } finally {
      refreshBtn.disabled = false;
    }
  }

  // ---------- 表單 ----------
  function readForm() {
    const fd = new FormData(form);
    const v = (name) => String(fd.get(name) || "").trim();
    return {
      reporter_name: v("reporter_name"),
      location: v("location"),
      category: v("category"),
      description: v("description"),
      urgency: v("urgency"),
      // 刻意不送 status：資料庫預設為「待處理」，anon 也沒有寫入 status 的權限
    };
  }

  function validate(row) {
    if (!row.reporter_name) return "請填寫報修人。";
    if (!row.location) return "請填寫地點或部門。";
    if (!CATEGORIES.includes(row.category)) return "請選擇類別。";
    if (!row.description) return "請填寫問題說明。";
    if (!URGENCIES.includes(row.urgency)) return "請選擇緊急程度。";
    for (const [field, max] of Object.entries(MAX_LEN)) {
      if (row[field].length > max) return "有欄位超過字數上限（" + max + " 字）。";
    }
    return "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.hidden = true;

    const row = readForm();
    const invalid = validate(row);
    if (invalid) {
      showMessage(formMessage, invalid, false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    try {
      const { error } = await client.from(TABLE).insert(row);
      if (error) throw error;
      form.reset();
      descriptionCount.textContent = "0";
      showMessage(formMessage, "已送出報修，謝謝！", true);
      loadList();
    } catch (error) {
      showMessage(formMessage, "送出失敗：" + friendlyError(error), false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出報修";
    }
  });

  refreshBtn.addEventListener("click", loadList);
  loadList();
})();
