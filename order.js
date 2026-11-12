// 訂購登記表：前端程式
// 只使用 publishable key 連線；資料庫只允許新增訂單，不能讀取（見 supabase/orders.sql）。
(function () {
  "use strict";

  const TABLE = "orders";
  // 與 supabase/orders.sql 的 CHECK 一致
  const LIMITS = { customer_name: 50, pickup_note: 200, note: 500, minKg: 0.1, maxKg: 50 };
  const PHONE_RE = /^[0-9+()\- ]{8,20}$/;

  const $ = (id) => document.getElementById(id);
  const form = $("order-form");
  const itemSel = $("item");
  const itemInfo = $("item-info");
  const weightInput = $("weight_kg");
  const estimateEl = $("estimate");
  const pickupNote = $("pickup_note");
  const pickupLabel = $("pickup-note-label");
  const pickupHint = $("pickup-note-hint");
  const submitBtn = $("submit-btn");
  const formMessage = $("form-message");
  const configWarning = $("config-warning");

  const data = window.MEAT_DATA;
  const itemId = window.MEAT_ITEM_ID;
  const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

  function showMessage(el, text, ok) {
    el.textContent = text;
    el.className = "message " + (ok ? "message-ok" : "message-error");
    el.hidden = false;
  }

  // ---------- 品項選單 ----------
  // 只列出能換算每公斤價格的品項；售價是範圍時，以較高價估算
  const storeName = (id) => {
    const s = data.stores.find((x) => x.id === id);
    return s ? s.name : (data.chainNames && data.chainNames[id]) || id;
  };
  const orderable = data.items
    .filter((i) => i.weightKg)
    .map((i) => {
      const hi = Array.isArray(i.price) ? Math.max(...i.price) : i.price;
      return {
        id: itemId(i),
        meat: i.meat,
        name: i.name,
        origin: i.origin,
        store: storeName(i.store),
        perKg: Math.round((hi / i.weightKg) * 100) / 100,
        pack: i.unit === "包" || i.unit === "盒" ? { price: hi, kg: i.weightKg, unit: i.unit } : null,
        isRange: Array.isArray(i.price),
      };
    });
  const byId = new Map(orderable.map((o) => [o.id, o]));

  for (const meat of [...new Set(orderable.map((o) => o.meat))]) {
    const group = document.createElement("optgroup");
    group.label = meat;
    orderable
      .filter((o) => o.meat === meat)
      .sort((a, b) => a.perKg - b.perKg)
      .forEach((o) => {
        group.append(new Option(o.name + "｜" + o.store + "｜" + money.format(o.perKg) + " 元／公斤", o.id));
      });
    itemSel.append(group);
  }

  function selected() {
    return byId.get(itemSel.value) || null;
  }

  function updateEstimate() {
    const o = selected();
    const kg = Number(weightInput.value);
    if (o) {
      itemInfo.textContent =
        "店家：" + o.store + "・來源：" + o.origin + "・每公斤 " + money.format(o.perKg) + " 元" +
        (o.isRange ? "（店家標價不一致，以較高價估算）" : "") +
        (o.pack ? "・每" + o.pack.unit + " " + o.pack.kg + " 公斤、" + money.format(o.pack.price) + " 元" : "");
    } else {
      itemInfo.textContent = "";
    }
    estimateEl.textContent =
      o && kg >= LIMITS.minKg && kg <= LIMITS.maxKg ? money.format(Math.round(o.perKg * kg)) + " 元" : "—";
  }

  // 從首頁「訂購」按鈕帶入品項：order.html?item=...
  const preset = new URLSearchParams(location.search).get("item");
  if (preset && byId.has(preset)) itemSel.value = preset;

  itemSel.addEventListener("change", updateEstimate);
  weightInput.addEventListener("input", updateEstimate);

  // ---------- 取貨方式 ----------
  function pickupMethod() {
    const r = form.querySelector('input[name="pickup_method"]:checked');
    return r ? r.value : "";
  }
  function updatePickup() {
    if (pickupMethod() === "宅配") {
      pickupLabel.innerHTML = '宅配地址 <span class="req" aria-hidden="true">*</span>';
      pickupHint.textContent = "必填，請填完整地址。";
      pickupNote.autocomplete = "street-address";
    } else {
      pickupLabel.textContent = "希望取貨時間";
      pickupHint.textContent = "選填，例如：11/20 下午。";
      pickupNote.autocomplete = "off";
    }
  }
  form.querySelectorAll('input[name="pickup_method"]').forEach((r) => r.addEventListener("change", updatePickup));

  updateEstimate();
  updatePickup();

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
    return;
  }

  const client = window.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function friendlyError(error) {
    const code = error && error.code;
    if (code === "23514") return "資料不符合規定（電話格式、重量或字數），請檢查後再送出。";
    if (code === "42501") return "沒有權限送出訂單，請聯絡管理員確認資料庫權限設定。";
    if (code === "42P01" || code === "PGRST205") return "找不到訂單資料表，請確認已執行 supabase/orders.sql。";
    if (error && /fetch|network/i.test(String(error.message))) return "網路連線失敗，請稍後再試。";
    return "發生錯誤：" + ((error && error.message) || "未知錯誤");
  }

  // ---------- 送出 ----------
  function readForm() {
    const fd = new FormData(form);
    const v = (name) => String(fd.get(name) || "").trim();
    const o = selected();
    return {
      order: o,
      row: {
        customer_name: v("customer_name"),
        phone: v("phone"),
        pickup_method: pickupMethod(),
        pickup_note: v("pickup_note"),
        note: v("note"),
        store_name: o ? o.store : "",
        item_name: o ? o.name : "",
        unit_price_per_kg: o ? o.perKg : 0,
        weight_kg: Math.round(Number(v("weight_kg")) * 100) / 100,
        // 刻意不送 status、estimated_total：由資料庫產生
      },
    };
  }

  function validate({ order, row }) {
    if (!order) return "請選擇品項。";
    if (!(row.weight_kg >= LIMITS.minKg && row.weight_kg <= LIMITS.maxKg)) return "重量請填 0.1～50 公斤。";
    if (!row.customer_name) return "請填寫訂購人。";
    if (row.customer_name.length > LIMITS.customer_name) return "訂購人最多 50 字。";
    if (!PHONE_RE.test(row.phone)) return "電話格式不正確（8～20 碼，只能有數字、+、-、空白、括號）。";
    if (row.pickup_method === "宅配" && row.pickup_note.length < 5) return "宅配請填寫完整地址。";
    if (row.pickup_note.length > LIMITS.pickup_note) return "取貨時間或地址最多 200 字。";
    if (row.note.length > LIMITS.note) return "備註最多 500 字。";
    return "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.hidden = true;

    const input = readForm();
    const invalid = validate(input);
    if (invalid) {
      showMessage(formMessage, invalid, false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    try {
      // 不加 .select()：anon 沒有讀取權限，只能新增
      const { error } = await client.from(TABLE).insert(input.row);
      if (error) throw error;
      const total = money.format(Math.round(input.row.unit_price_per_kg * input.row.weight_kg));
      form.reset();
      updateEstimate();
      updatePickup();
      showMessage(
        formMessage,
        "已送出訂購：" + input.order.name + " " + input.row.weight_kg + " 公斤，預估 " + total +
          " 元。我們會向店家確認後與你聯絡。",
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
