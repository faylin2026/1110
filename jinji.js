// 錦記地瓜酥訂購登記：訂購人、電話、品項、訂購數量
// 只使用 publishable key 連線；資料庫只允許新增，不能讀取（見 supabase/jinji_orders.sql）。
(function () {
  "use strict";

  const TABLE = "jinji_orders";
  // 品項名稱必須與 supabase/jinji_orders.sql 的 CHECK 一致；價格、重量為網路參考價
  const ITEMS = [
    { name: "地瓜酥", grams: 400, price: 100 },
    { name: "蜜糖地瓜酥", grams: 350, price: 100 },
    { name: "綜合酥", grams: 300, price: 100 },
    { name: "純芋頭酥", grams: 250, price: 100 },
  ];
  const MIN_QTY = 1;
  const MAX_QTY = 100;
  const PHONE_RE = /^[0-9+()\- ]{8,20}$/;

  const $ = (id) => document.getElementById(id);
  const form = $("jinji-form");
  const itemSel = $("item_name");
  const itemInfo = $("item-info");
  const qty = $("quantity");
  const estimate = $("estimate");
  const submitBtn = $("submit-btn");
  const formMessage = $("form-message");
  const configWarning = $("config-warning");
  const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

  function showMessage(el, text, ok) {
    el.textContent = text;
    el.className = "message " + (ok ? "message-ok" : "message-error");
    el.hidden = false;
  }

  // ---------- 品項與數量 ----------
  for (const it of ITEMS) {
    itemSel.append(new Option(it.name + "（每包 " + it.grams + " 公克，約 " + it.price + " 元）", it.name));
  }
  const findItem = (name) => ITEMS.find((it) => it.name === name) || null;

  function quantity() {
    return Number(qty.value);
  }

  function update() {
    const it = findItem(itemSel.value);
    itemInfo.textContent = it
      ? "每包 " + it.grams + " 公克・" + it.price + " 元・換算每公斤 " + money.format((it.price / it.grams) * 1000) + " 元"
      : "";
    const q = quantity();
    estimate.textContent =
      it && Number.isInteger(q) && q >= MIN_QTY && q <= MAX_QTY ? money.format(it.price * q) + " 元" : "—";
  }

  function step(d) {
    const q = Number.isInteger(quantity()) ? quantity() : MIN_QTY;
    qty.value = String(Math.min(MAX_QTY, Math.max(MIN_QTY, q + d)));
    update();
  }
  $("qty-minus").addEventListener("click", () => step(-1));
  $("qty-plus").addEventListener("click", () => step(1));
  qty.addEventListener("input", update);
  itemSel.addEventListener("change", update);

  // 首頁可用 jinji.html?item=蜜糖地瓜酥 帶入品項
  const preset = new URLSearchParams(location.search).get("item");
  if (preset && findItem(preset)) itemSel.value = preset;
  update();

  // ---------- 檢查設定 ----------
  const cfg = window.APP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || "").trim();
  const key = String(cfg.SUPABASE_PUBLISHABLE_KEY || "").trim();
  let problem = "";
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    problem = "無法載入 Supabase 程式庫，請檢查網路連線後重新整理頁面。";
  } else if (!/^https:\/\/\S+$/.test(url) || !key || key.includes("【")) {
    problem = "尚未設定 Supabase 連線：請在 config.js 填入專案網址與 publishable key。";
  } else if (/^sb_secret_/.test(key) || /service_role/.test(key)) {
    problem = "config.js 裡放的是 secret 金鑰，這不能公開！請立即在 Supabase 後台撤銷它，改用 publishable key。";
  }
  if (problem) {
    showMessage(configWarning, problem, false);
    submitBtn.disabled = true;
    return;
  }

  const client = window.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function friendlyError(error) {
    const code = error && error.code;
    if (code === "23514") return "資料不符合規定（電話格式、品項或數量），請檢查後再送出。";
    if (code === "42501") return "沒有權限送出，請聯絡管理員確認資料庫權限設定。";
    if (code === "42P01" || code === "PGRST205") return "找不到訂單資料表，請確認已執行 supabase/jinji_orders.sql。";
    if (error && /fetch|network/i.test(String(error.message))) return "網路連線失敗，請稍後再試。";
    return "發生錯誤：" + ((error && error.message) || "未知錯誤");
  }

  // ---------- 送出 ----------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.hidden = true;

    const row = {
      customer_name: String($("customer_name").value).trim(),
      phone: String($("phone").value).trim(),
      item_name: itemSel.value,
      quantity: quantity(),
      // 刻意不送 id、created_at、status：由資料庫產生
    };

    let invalid = "";
    if (!row.customer_name) invalid = "請填寫訂購人。";
    else if (row.customer_name.length > 50) invalid = "訂購人最多 50 字。";
    else if (!PHONE_RE.test(row.phone)) invalid = "電話格式不正確（8～20 碼，只能有數字、+、-、空白、括號）。";
    else if (!findItem(row.item_name)) invalid = "請選擇品項。";
    else if (!Number.isInteger(row.quantity) || row.quantity < MIN_QTY || row.quantity > MAX_QTY) invalid = "訂購數量請填 1～100 的整數。";
    if (invalid) {
      showMessage(formMessage, invalid, false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    try {
      // 不加 .select()：anon 沒有讀取權限，只能新增
      const { error } = await client.from(TABLE).insert(row);
      if (error) throw error;
      const total = findItem(row.item_name).price * row.quantity;
      form.reset();
      update();
      showMessage(
        formMessage,
        "已送出訂購：" + row.item_name + " " + row.quantity + " 包，預估 " + money.format(total) + " 元。我們會向店家確認後與你聯絡。",
        true
      );
    } catch (error) {
      showMessage(formMessage, "送出失敗：" + friendlyError(error), false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出訂購";
    }
  });
})();
