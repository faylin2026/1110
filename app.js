// 辦公室水電報修表單：前端程式
// 只使用 publishable key 連線。資料庫權限見 supabase/repair_requests_v2.sql：
//   - 只能新增報修人填的欄位（不送 status，由資料庫預設為「待受理」）
//   - 只能讀取清單要顯示的欄位（不含姓名、聯絡方式、照片）
(function () {
  "use strict";

  const TABLE = "repair_requests";
  const PHOTO_BUCKET = "repair-photos";
  const LIST_LIMIT = 20;
  const MAX_PHOTOS = 5;
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 與儲存空間的單檔上限一致
  const PHOTO_MAX_SIDE = 1600;             // 上傳前把長邊縮到這個像素數，省流量
  const REMEMBER_KEY = "repair-reporter";
  const SQL_FILE = "supabase/repair_requests_v2.sql";

  // 清單要讀的欄位；必須在 SQL 的 grant select 範圍內
  const LIST_COLUMNS = "id, case_no, created_at, site, floor, area, location, category, subcategory, "
    + "description, impact, status, expected_at, pause_reason, next_update_at, completed_at, acceptance_result";

  // 報修類別與可再細分的現象；類別名稱必須與 SQL 的 CHECK 一致
  const OTHER_SUB = "其他／不確定";
  const CATEGORIES = [
    { name: "電力", subs: ["停電", "跳電", "插座異常"] },
    { name: "照明", subs: ["燈具不亮", "燈光閃爍"] },
    { name: "給水", subs: ["漏水", "水龍頭故障", "無水"] },
    { name: "排水", subs: ["排水堵塞", "漏水"] },
    { name: "衛浴", subs: ["馬桶堵塞", "沖水異常", "設備破損"] },
    { name: "其他", subs: [] },
  ];

  // 影響情況；名稱必須與 SQL 的 CHECK 一致
  const IMPACTS = [
    { name: "有安全疑慮", desc: "可能觸電、起火、滑倒或淹水" },
    { name: "區域無法使用", desc: "整個區域或設備完全不能用" },
    { name: "部分功能異常", desc: "還能用，但不正常" },
    { name: "暫不影響使用", desc: "不急，方便時處理即可" },
  ];

  const $ = (id) => document.getElementById(id);
  const form = $("repair-form");
  const submitBtn = $("submit-btn");
  const formMessage = $("form-message");
  const configWarning = $("config-warning");
  const siteSel = $("site");
  const floorSel = $("floor");
  const areaSel = $("area");
  const subField = $("subcategory-field");
  const subSel = $("subcategory");
  const descInput = $("description");
  const photoInput = $("photos");
  const photoList = $("photo-list");
  const availDetail = $("availability-detail");
  const availDate = $("available_date");
  const listEl = $("repair-list");
  const listStatus = $("list-status");
  const reloadBtn = $("reload-btn");

  const cfg = window.APP_CONFIG || {};

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function showMessage(target, text, ok) {
    target.textContent = text;
    target.className = "message " + (ok ? "message-ok" : "message-error");
    target.hidden = false;
  }

  function option(value, label, placeholder) {
    const opt = el("option", "", label === undefined ? value : label);
    opt.value = value;
    if (placeholder) {
      opt.disabled = true;
      opt.selected = true;
    }
    return opt;
  }

  function checkedValue(name) {
    const input = form.querySelector('input[name="' + name + '"]:checked');
    return input ? input.value : "";
  }

  // ---------- 選項：辦公地點 → 樓層 → 區域 ----------
  const sites = (Array.isArray(cfg.REPAIR_SITES) ? cfg.REPAIR_SITES : [])
    .filter((s) => s && s.name && Array.isArray(s.floors) && s.floors.length);
  const areas = Array.isArray(cfg.REPAIR_AREAS) ? cfg.REPAIR_AREAS : [];

  sites.forEach((s) => siteSel.append(option(s.name)));
  areas.forEach((a) => areaSel.append(option(a)));

  function fillFloors() {
    const site = sites.find((s) => s.name === siteSel.value);
    floorSel.replaceChildren(option("", site ? "請選擇樓層" : "請先選辦公地點", true));
    if (site) site.floors.forEach((f) => floorSel.append(option(f)));
    floorSel.disabled = !site;
    // 只有一個樓層就直接選好
    if (site && site.floors.length === 1) floorSel.value = site.floors[0];
  }
  siteSel.addEventListener("change", fillFloors);
  // 只有一個辦公地點就直接選好
  if (sites.length === 1) {
    siteSel.value = sites[0].name;
    fillFloors();
  }

  // ---------- 選項：報修類別、現象、影響情況 ----------
  function choice(name, value, desc) {
    const label = el("label", "choice");
    const input = el("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    const body = el("span");
    body.append(el("strong", "", value));
    if (desc) body.append(el("small", "", desc));
    label.append(input, body);
    return label;
  }

  CATEGORIES.forEach((c) => $("category-choices").append(choice("category", c.name)));
  IMPACTS.forEach((i) => $("impact-choices").append(choice("impact", i.name, i.desc)));

  function fillSubcategories() {
    const cat = CATEGORIES.find((c) => c.name === checkedValue("category"));
    const subs = cat ? cat.subs : [];
    subSel.replaceChildren();
    if (subs.length) {
      subSel.append(option("", "請選擇最接近的現象", true));
      subs.concat(OTHER_SUB).forEach((s) => subSel.append(option(s)));
    }
    subField.hidden = !subs.length;
  }

  // ---------- 表單互動 ----------
  function updateCount() {
    $("description-count").textContent = descInput.value.length + " / " + descInput.maxLength;
  }
  descInput.addEventListener("input", updateCount);

  function updateAvailability() {
    availDetail.hidden = checkedValue("availability_type") !== "指定時段";
  }

  function localDate(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  availDate.min = localDate(new Date());

  form.addEventListener("change", (event) => {
    const t = event.target;
    if (t.name === "category") fillSubcategories();
    if (t.name === "impact") $("safety-note").hidden = t.value !== "有安全疑慮";
    if (t.name === "availability_type") updateAvailability();
    clearError(t);
  });
  form.addEventListener("input", (event) => {
    clearError(event.target);
    // 開始修改後，收起上一次的「沒填好／送出失敗」訊息
    if (formMessage.classList.contains("message-error")) formMessage.hidden = true;
  });

  // ---------- 記住報修人資料（只存在這台裝置） ----------
  const REMEMBER_FIELDS = ["reporter_name", "department", "contact"];

  function loadRemembered() {
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
      if (saved) REMEMBER_FIELDS.forEach((f) => { if (typeof saved[f] === "string") $(f).value = saved[f]; });
    } catch (err) {
      // 讀不到就當作沒存過
    }
  }

  function saveRemembered(row) {
    try {
      if ($("remember").checked) {
        const data = {};
        REMEMBER_FIELDS.forEach((f) => { data[f] = row[f]; });
        localStorage.setItem(REMEMBER_KEY, JSON.stringify(data));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (err) {
      // 無痕模式等情況存不了，不影響報修
    }
  }

  // ---------- 欄位錯誤訊息 ----------
  // anchor 可以是輸入框，也可以是整組選項（fieldset）
  function setError(anchor, text) {
    const holder = anchor.closest(".field, .choice-group") || anchor;
    let msg = holder.querySelector(".field-error");
    if (!msg) {
      msg = el("p", "field-error");
      msg.id = "err-" + (anchor.id || anchor.name || Math.random().toString(36).slice(2));
      holder.append(msg);
    }
    msg.textContent = text;
    holder.classList.add("has-error");
    if (anchor.matches("input, select, textarea")) {
      anchor.setAttribute("aria-invalid", "true");
      anchor.setAttribute("aria-errormessage", msg.id);
    }
  }

  function clearError(target) {
    const holder = target.closest && target.closest(".has-error");
    if (!holder) return;
    holder.classList.remove("has-error");
    const msg = holder.querySelector(".field-error");
    if (msg) msg.remove();
    holder.querySelectorAll("[aria-invalid]").forEach((n) => {
      n.removeAttribute("aria-invalid");
      n.removeAttribute("aria-errormessage");
    });
  }

  // ---------- 照片 ----------
  let photos = []; // { blob, url, name }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("無法讀取圖片")); };
      img.src = url;
    });
  }

  // 把照片縮小並轉成 JPEG；手機原圖常有 5～10 MB，縮小後約數百 KB
  async function shrinkPhoto(file) {
    const img = await loadImage(file);
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // 透明背景的 PNG 轉 JPEG 時補白底
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("無法壓縮圖片");
    return blob;
  }

  function renderPhotos() {
    photoList.replaceChildren();
    photos.forEach((p, index) => {
      const li = el("li", "photo-item");
      const img = el("img");
      img.src = p.url;
      img.alt = "照片 " + (index + 1);
      const remove = el("button", "photo-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", "移除照片 " + (index + 1));
      remove.addEventListener("click", () => {
        URL.revokeObjectURL(p.url);
        photos = photos.filter((x) => x !== p);
        renderPhotos();
      });
      li.append(img, remove);
      photoList.append(li);
    });
    document.querySelector(".file-button").textContent =
      photos.length ? "＋ 再加照片（已選 " + photos.length + " / " + MAX_PHOTOS + "）" : "＋ 拍照或選擇照片";
  }

  function clearPhotos() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    renderPhotos();
  }

  photoInput.addEventListener("change", async () => {
    const files = Array.from(photoInput.files || []);
    photoInput.value = ""; // 讓同一張照片移除後可以再選一次
    clearError(photoInput);
    const problems = [];
    for (const file of files) {
      if (photos.length >= MAX_PHOTOS) {
        problems.push("最多 " + MAX_PHOTOS + " 張，多的沒有加入。");
        break;
      }
      let blob;
      try {
        blob = await shrinkPhoto(file);
      } catch (err) {
        // 瀏覽器無法解碼（例如部分 HEIC）：格式與大小符合就直接用原檔
        if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= MAX_PHOTO_BYTES) blob = file;
      }
      if (!blob || blob.size > MAX_PHOTO_BYTES) {
        problems.push("「" + file.name + "」無法使用，請改用 JPG 或 PNG 照片。");
        continue;
      }
      photos.push({ blob, url: URL.createObjectURL(blob), name: file.name });
    }
    renderPhotos();
    if (problems.length) setError(photoInput, problems.join(" "));
  });

  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  // ---------- 讀取表單、檢查 ----------
  function readForm() {
    const text = (id) => String($(id).value).trim();
    const specified = checkedValue("availability_type") === "指定時段";
    return {
      reporter_name: text("reporter_name"),
      department: text("department"),
      contact: text("contact"),
      site: siteSel.value,
      floor: floorSel.value,
      area: areaSel.value,
      seat_or_asset: text("seat_or_asset") || null,
      category: checkedValue("category"),
      subcategory: subField.hidden ? null : subSel.value || null,
      description: text("description"),
      impact: checkedValue("impact"),
      availability_type: specified ? "指定時段" : "隨時",
      available_date: specified ? availDate.value || null : null,
      available_slot: specified ? $("available_slot").value : null,
    };
  }

  // 回傳第一個有問題的欄位（沒有問題回傳 null）
  function validate(row) {
    form.querySelectorAll(".has-error").forEach((h) => clearError(h));
    const errors = [];
    const need = (anchor, ok, text) => { if (!ok) errors.push([anchor, text]); };

    need($("reporter_name"), row.reporter_name, "請填寫姓名。");
    need($("department"), row.department, "請填寫部門。");
    need($("contact"), row.contact.length >= 3, "請填寫分機、手機或公司 Email。");
    need(siteSel, row.site, "請選擇辦公地點。");
    need(floorSel, row.floor, "請選擇樓層。");
    need(areaSel, row.area, "請選擇區域。");
    need($("category-group"), row.category, "請選擇報修類別。");
    if (!subField.hidden) need(subSel, row.subcategory, "請選擇最接近的現象；不確定就選「" + OTHER_SUB + "」。");
    need(descInput, row.description, "請描述發生的情況。");
    need($("impact-group"), row.impact, "請選擇影響情況。");
    if (row.availability_type === "指定時段") {
      need(availDate, row.available_date, "請選擇日期。");
      if (row.available_date) need(availDate, row.available_date >= availDate.min, "日期不能早於今天。");
    }

    errors.forEach(([anchor, text]) => setError(anchor, text));
    return errors.length ? errors[0][0] : null;
  }

  // ---------- 檢查設定 ----------
  const url = String(cfg.SUPABASE_URL || "").trim();
  const key = String(cfg.SUPABASE_PUBLISHABLE_KEY || "").trim();
  let problem = "";
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    problem = "無法載入 Supabase 程式庫，請檢查網路連線後重新整理頁面。";
  } else if (!/^https:\/\/\S+$/.test(url) || !key || key.includes("【")) {
    problem = "尚未設定 Supabase 連線：請在 config.js 填入專案網址與 publishable key。";
  } else if (/^sb_secret_/.test(key) || /service_role/.test(key)) {
    problem = "config.js 裡放的是 secret 金鑰，這不能公開！請立即在 Supabase 後台撤銷它，改用 publishable key。";
  } else if (!sites.length || !areas.length) {
    problem = "尚未設定故障位置選項：請在 config.js 填寫 REPAIR_SITES 與 REPAIR_AREAS。";
  }

  loadRemembered();
  updateCount();
  updateAvailability();
  renderPhotos();

  if (problem) {
    showMessage(configWarning, problem, false);
    submitBtn.disabled = true;
    reloadBtn.disabled = true;
    listStatus.textContent = "無法載入清單。";
    return;
  }

  const client = window.supabase.createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function friendlyError(error) {
    const code = error && error.code;
    const message = String((error && error.message) || "");
    const needSql = "資料庫尚未完成設定，請管理員在 Supabase 的 SQL Editor 執行 " + SQL_FILE + "。";
    if (code === "23514") return "資料不符合規定，請檢查各欄位後再送出。";
    if (code === "42501" || code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205") return needSql;
    if (/bucket not found/i.test(message) || /row-level security/i.test(message)) return needSql;
    if (/fetch|network/i.test(message)) return "網路連線失敗，請確認網路後再試一次。";
    return "發生錯誤：" + (message || "未知錯誤");
  }

  // ---------- 清單 ----------
  const timeFmt = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  function formatTime(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
  }

  const STATUS_CLASS = {
    "待受理": "status-new", "已派工": "status-active", "處理中": "status-active",
    "待驗收": "status-review", "已結案": "status-done", "暫停處理": "status-paused",
  };

  function renderItem(r) {
    const li = el("li", "repair-item");

    const top = el("div", "item-top");
    top.append(el("span", "badge " + (STATUS_CLASS[r.status] || ""), r.status || "—"));
    top.append(el("span", "badge", r.subcategory ? r.category + "・" + r.subcategory : r.category || "—"));
    if (r.impact) top.append(el("span", "badge" + (r.impact === "有安全疑慮" ? " impact-safety" : ""), r.impact));
    li.append(top);

    li.append(el("p", "item-desc", r.description || ""));

    // 升級前的舊資料只有 location
    const place = r.site ? [r.site, r.floor, r.area].filter(Boolean).join(" ") : r.location || "";
    li.append(el("p", "item-meta", [r.case_no, place, formatTime(r.created_at) + " 報修"].filter(Boolean).join("・")));

    const progress = [];
    if (r.status === "暫停處理") {
      if (r.pause_reason) progress.push("暫停原因：" + r.pause_reason);
      if (r.next_update_at) progress.push("下次更新：" + formatTime(r.next_update_at));
    } else if (r.completed_at) {
      progress.push("完成時間：" + formatTime(r.completed_at));
    } else if (r.expected_at) {
      progress.push("預計處理：" + formatTime(r.expected_at));
    }
    if (r.acceptance_result) progress.push("驗收結果：" + r.acceptance_result);
    if (progress.length) li.append(el("p", "item-progress", progress.join("・")));

    return li;
  }

  let loadSeq = 0;
  async function loadList() {
    const seq = ++loadSeq;
    reloadBtn.disabled = true;
    listStatus.textContent = "載入中…";
    let result;
    try {
      result = await client.from(TABLE).select(LIST_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
    } catch (err) {
      result = { error: err };
    }
    if (seq !== loadSeq) return; // 已經有更新的一次載入
    reloadBtn.disabled = false;
    if (result.error) {
      listStatus.textContent = "清單載入失敗：" + friendlyError(result.error);
      return;
    }
    const rows = result.data || [];
    listEl.replaceChildren(...rows.map(renderItem));
    listStatus.textContent = rows.length ? "" : "目前沒有報修紀錄。";
  }
  reloadBtn.addEventListener("click", loadList);

  // ---------- 送出 ----------
  async function uploadPhotos() {
    const now = new Date();
    const folder = now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + "/" + randomId();
    const paths = [];
    for (let i = 0; i < photos.length; i++) {
      // 上次送出失敗但照片已上傳成功的，不重複上傳
      if (photos[i].path) { paths.push(photos[i].path); continue; }
      submitBtn.textContent = "上傳照片中…（" + (i + 1) + " / " + photos.length + "）";
      const blob = photos[i].blob;
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const path = folder + "/" + (i + 1) + "." + ext;
      const { error } = await client.storage.from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error) throw error;
      photos[i].path = path;
      paths.push(path);
    }
    return paths;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitBtn.disabled) return;
    formMessage.hidden = true;

    const row = readForm();
    const firstInvalid = validate(row);
    if (firstInvalid) {
      showMessage(formMessage, "還有欄位沒填好，請看上方紅字提示。", false);
      const focusTarget = firstInvalid.matches("fieldset") ? firstInvalid.querySelector("input") : firstInvalid;
      if (focusTarget) focusTarget.focus();
      firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    submitBtn.disabled = true;
    try {
      // 注意：不送 status、case_no、created_at，由資料庫產生
      row.photo_paths = await uploadPhotos();
      submitBtn.textContent = "送出中…";
      const { data, error } = await client.from(TABLE).insert(row).select("case_no").single();
      if (error) throw error;

      saveRemembered(row);
      form.reset();
      clearPhotos();
      loadRemembered();
      if (sites.length === 1) siteSel.value = sites[0].name;
      fillFloors();
      fillSubcategories();
      updateAvailability();
      updateCount();
      $("safety-note").hidden = true;

      showMessage(formMessage, "報修已送出，案件編號 " + data.case_no + "。總務受理後，可在下方清單查看處理進度。", true);
      loadList();
    } catch (err) {
      showMessage(formMessage, "送出失敗：" + friendlyError(err) + " 你填的內容還在，可以直接再送一次。", false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出報修";
      formMessage.scrollIntoView({ block: "nearest", behavior: "smooth" });
      formMessage.focus({ preventScroll: true });
    }
  });

  loadList();
})();
