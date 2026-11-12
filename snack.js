// 錦記地瓜酥登記表：以「包」為單位登記，送出時每個口味存成 orders 資料表的一筆
// 只使用 publishable key 連線；資料庫只允許新增，不能讀取（見 supabase/orders.sql）。
(function () {
  "use strict";

  const TABLE = "orders";
  const STORE_ID = "jinji";
  const MAX_PACKS = 50; // 每個口味最多 50 包（最重 0.4 公斤 × 50 = 20 公斤，符合 orders 的 50 公斤上限）
  const PHONE_RE = /^[0-9+()\- ]{8,20}$/;

  const $ = (id) => document.getElementById(id);
  const form = $("snack-form");
  const list = $("snack-list");
  const submitBtn = $("submit-btn");
  const formMessage = $("form-message");
  const configWarning = $("config-warning");
  const pickupNote = $("pickup_note");
  const pickupLabel = $("pickup-note-label");
  const pickupHint = $("pickup-note-hint");

  const data = window.MEAT_DATA;
  const store = data.stores.find((s) => s.id === STORE_ID);
  // 只列店面價品項（排除團購價那一筆）
  const products = data.items.filter((i) => i.store === STORE_ID && !i.name.includes("團購"));
  const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showMessage(target, text, ok) {
    target.textContent = text;
    target.className = "message " + (ok ? "message-ok" : "message-error");
    target.hidden = false;
  }

  // ---------- 口味與包數 ----------
  const qtyInputs = [];
  products.forEach((p, idx) => {
    const li = el("li", "snack-item");
    const info = el("div", "snack-info");
    const label = el("label", "snack-name", p.name);
    label.htmlFor = "qty-" + idx;
    info.append(
      label,
      el("span", "hint", money.format(p.price) + " 元／包・每公斤 " + money.format(p.price / p.weightKg) + " 元")
    );

    const stepper = el("div", "stepper");
    const minus = el("button", "secondary step-btn", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", p.name + " 減少一包");
    const input = el("input", "qty");
    Object.assign(input, { id: "qty-" + idx, type: "number", inputMode: "numeric", min: 0, max: MAX_PACKS, step: 1 });
    input.defaultValue = "0"; // form.reset() 後回到 0
    const plus = el("button", "secondary step-btn", "＋");
    plus.type = "button";
    plus.setAttribute("aria-label", p.name + " 增加一包");
    const change = (d) => {
      input.value = String(Math.min(MAX_PACKS, Math.max(0, (parseInt(input.value, 10) || 0) + d)));
      updateSummary();
    };
    minus.addEventListener("click", () => change(-1));
    plus.addEventListener("click", () => change(1));
    input.addEventListener("input", updateSummary);
    stepper.append(minus, input, plus);

    li.append(info, stepper);
    list.append(li);
    qtyInputs.push({ product: p, input });
  });

  function chosen() {
    return qtyInputs
      .map(({ product, input }) => ({ product, packs: Number(input.value) }))
      .filter((c) => c.packs > 0);
  }

  function updateSummary() {
    const c = chosen().filter((x) => Number.isInteger(x.packs) && x.packs <= MAX_PACKS);
    const packs = c.reduce((s, x) => s + x.packs, 0);
    const kg = c.reduce((s, x) => s + x.packs * x.product.weightKg, 0);
    const price = c.reduce((s, x) => s + x.packs * x.product.price, 0);
    $("sum-packs").textContent = String(packs);
    $("sum-kg").textContent = num.format(kg);
    $("sum-price").textContent = money.format(price) + " 元";
  }

  // ---------- 取貨方式 ----------
  function pickupMethod() {
    const r = form.querySelector('input[name="pickup_method"]:checked');
    return r ? r.value : "";
  }
  function updatePickup() {
    if (pickupMethod() === "宅配") {
      pickupLabel.innerHTML = '宅配地址 <span class="req" aria-hidden="true">*</span>';
      pickupHint.textContent = "必填，請填完整地址。宅配運費另計。";
    } else {
      pickupLabel.textContent = "希望取貨時間";
      pickupHint.textContent = "選填，例如：11/20 下午。";
    }
  }
  form.querySelectorAll('input[name="pickup_method"]').forEach((r) => r.addEventListener("change", updatePickup));
  updateSummary();
  updatePickup();

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
    if (code === "23514") return "資料不符合規定（電話格式或字數），請檢查後再送出。";
    if (code === "42501") return "沒有權限送出，請聯絡管理員確認資料庫權限設定。";
    if (code === "42P01" || code === "PGRST205") return "找不到訂單資料表，請確認已執行 supabase/orders.sql。";
    if (error && /fetch|network/i.test(String(error.message))) return "網路連線失敗，請稍後再試。";
    return "發生錯誤：" + ((error && error.message) || "未知錯誤");
  }

  // ---------- 送出 ----------
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.hidden = true;

    const fd = new FormData(form);
    const v = (name) => String(fd.get(name) || "").trim();
    const items = chosen();
    const contact = {
      customer_name: v("customer_name"),
      phone: v("phone"),
      pickup_method: pickupMethod(),
      pickup_note: v("pickup_note"),
      userNote: v("note"),
    };

    let invalid = "";
    if (!items.length) invalid = "請至少選擇一包。";
    else if (items.some((x) => !Number.isInteger(x.packs) || x.packs > MAX_PACKS)) invalid = "包數請填 0～" + MAX_PACKS + " 的整數。";
    else if (!contact.customer_name) invalid = "請填寫登記人。";
    else if (!PHONE_RE.test(contact.phone)) invalid = "電話格式不正確（8～20 碼，只能有數字、+、-、空白、括號）。";
    else if (contact.pickup_method === "宅配" && contact.pickup_note.length < 5) invalid = "宅配請填寫完整地址。";
    if (invalid) {
      showMessage(formMessage, invalid, false);
      return;
    }

    // 同一次登記的每個口味各存一筆；note 記下包數與這次登記的口味數，方便後台對照
    const rows = items.map((x) => ({
      customer_name: contact.customer_name,
      phone: contact.phone,
      pickup_method: contact.pickup_method,
      pickup_note: contact.pickup_note,
      note: ("地瓜酥登記：" + x.packs + " 包（同次登記共 " + items.length + " 種口味）" +
        (contact.userNote ? "。備註：" + contact.userNote : "")).slice(0, 500),
      store_name: store.name,
      item_name: x.product.name,
      unit_price_per_kg: Math.round((x.product.price / x.product.weightKg) * 100) / 100,
      weight_kg: Math.round(x.packs * x.product.weightKg * 100) / 100,
    }));

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    try {
      const { error } = await client.from(TABLE).insert(rows);
      if (error) throw error;
      const summary = items.map((x) => x.product.name.replace(/（.*）/, "") + " " + x.packs + " 包").join("、");
      const total = items.reduce((s, x) => s + x.packs * x.product.price, 0);
      form.reset();
      updateSummary();
      updatePickup();
      showMessage(formMessage, "已送出登記：" + summary + "，預估 " + money.format(total) + " 元。我們會向店家確認後與你聯絡。", true);
    } catch (error) {
      showMessage(formMessage, "送出失敗：" + friendlyError(error), false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出登記";
    }
  });
})();
