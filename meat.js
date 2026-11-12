// 台中牛羊肉價格比較：依 meat-data.js 產生品項清單與店家資料
(function () {
  "use strict";

  const data = window.MEAT_DATA;
  const $ = (id) => document.getElementById(id);
  const itemList = $("item-list");
  const storeList = $("store-list");
  const status = $("items-status");
  const filterKeyword = $("filter-keyword");
  const filterMeat = $("filter-meat");
  const filterStore = $("filter-store");
  const filterOrigin = $("filter-origin");
  const sortSel = $("sort");

  $("updated").textContent = data.updated;

  // 品項的店家代碼若不是單一門市（例如價格未區分門市的連鎖店），用這裡的名稱
  const CHAIN_NAMES = data.chainNames || {};
  const CHAIN_PHONES = { roubo: "04-2380-3061" };
  const storeById = Object.fromEntries(data.stores.map((s) => [s.id, s]));
  const storeName = (id) => (storeById[id] ? storeById[id].name : CHAIN_NAMES[id] || id);
  const storePhone = (id) => (storeById[id] ? storeById[id].phone : CHAIN_PHONES[id] || null);

  const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
  const kg = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 3 });

  // 每公斤價格：回傳 [最低, 最高]，無法換算時回傳 null
  function perKg(item) {
    if (!item.weightKg) return null;
    const [lo, hi] = Array.isArray(item.price) ? item.price : [item.price, item.price];
    return [lo / item.weightKg, hi / item.weightKg];
  }

  const fmtRange = ([lo, hi]) =>
    Math.round(lo) === Math.round(hi) ? money.format(lo) : money.format(lo) + "～" + money.format(hi);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function telLink(phone) {
    if (!phone) return el("span", "", "電話待確認");
    const a = el("a", "", phone);
    a.href = "tel:" + phone.replace(/[^0-9+]/g, "");
    return a;
  }

  // ---------- 篩選選單 ----------
  const itemStores = [...new Set(data.items.map((i) => i.store))];
  for (const id of itemStores) filterStore.append(new Option(storeName(id), id));
  for (const o of [...new Set(data.items.map((i) => i.origin))]) filterOrigin.append(new Option(o, o));

  const keyword = () => filterKeyword.value.trim();

  // ---------- 品項 ----------
  function renderItems() {
    let rows = data.items.filter(
      (i) => (!keyword() || i.name.includes(keyword())) &&
             (!filterMeat.value || i.meat === filterMeat.value) &&
             (!filterStore.value || i.store === filterStore.value) &&
             (!filterOrigin.value || i.origin === filterOrigin.value)
    );
    const key = (i) => (perKg(i) ? perKg(i)[0] : Infinity); // 無法換算的排最後
    if (sortSel.value === "asc") rows.sort((a, b) => key(a) - key(b));
    if (sortSel.value === "desc") rows.sort((a, b) => (perKg(b) ? perKg(b)[0] : -1) - (perKg(a) ? perKg(a)[0] : -1));
    if (sortSel.value === "store") rows.sort((a, b) => storeName(a.store).localeCompare(storeName(b.store), "zh-Hant") || key(a) - key(b));

    itemList.replaceChildren();
    status.textContent = rows.length ? "共 " + rows.length + " 個品項" : "沒有符合條件的品項";
    for (const i of rows) {
      const li = el("li", "price-item");
      const pk = perKg(i);
      const head = el("div", "price-head");
      head.append(el("span", "price-name", i.name));
      const big = el("span", "price-kg");
      big.append(pk ? el("strong", "", fmtRange(pk)) : el("strong", "", "無法換算"));
      if (pk) big.append(el("span", "per", " 元／公斤"));
      head.append(big);

      const tags = el("div", "item-top");
      tags.append(el("span", "badge", i.meat));
      tags.append(el("span", "badge", i.origin));
      tags.append(el("span", "badge", storeName(i.store)));

      const price = Array.isArray(i.price) ? i.price.join("～") : String(i.price);
      const weight = i.weightKg ? kg.format(i.weightKg) + " 公斤" : "未標示";
      const meta = el("p", "item-meta", "售價 " + price + " 元／" + i.unit + "・重量 " + weight + "・價格來源：" + i.ref);

      const call = el("p", "item-meta");
      call.append("訂購電話：", telLink(storePhone(i.store)));

      li.append(head, tags, meta, call);
      if (pk) {
        const order = el("a", "order-link", "訂購這個品項");
        order.href = "order.html?item=" + encodeURIComponent(window.MEAT_ITEM_ID(i));
        li.append(order);
      }
      itemList.append(li);
    }
  }

  // ---------- 店家 ----------
  function renderStores() {
    storeList.replaceChildren();
    const stores = data.stores.filter((s) => !filterMeat.value || s.meats.includes(filterMeat.value));
    for (const s of stores) {
      const li = el("li", "store-item");
      li.append(el("h3", "", s.name));
      const dl = el("dl", "store-dl");
      const add = (k, v) => {
        dl.append(el("dt", "", k));
        const dd = el("dd");
        if (v instanceof Node) dd.append(v); else dd.textContent = v;
        dl.append(dd);
      };
      add("販售", s.meats.join("、"));
      add("地址", s.address);
      add("電話", telLink(s.phone));
      add("來源", s.source);
      add("Google 評分", s.rating || "待確認");
      add("店家資料", s.info);
      const hasPrice = data.items.some((i) => i.store === s.id || (s.id.startsWith("roubo") && i.store === "roubo"));
      if (!hasPrice) add("價格", "查不到網路價格，請電話詢價");
      li.append(dl);
      storeList.append(li);
    }
  }

  [filterStore, filterOrigin, sortSel].forEach((s) => s.addEventListener("change", renderItems));
  filterMeat.addEventListener("change", () => { renderItems(); renderStores(); });
  filterKeyword.addEventListener("input", renderItems);
  document.querySelectorAll("[data-keyword]").forEach((b) =>
    b.addEventListener("click", () => { filterKeyword.value = b.dataset.keyword; renderItems(); })
  );
  renderItems();
  renderStores();
})();
