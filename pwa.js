// 註冊 Service Worker（讓網站可安裝成 App、離線瀏覽）
// 並在離線時提醒：表單要連網才能送出。
(function () {
  "use strict";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        // 註冊失敗不影響網站使用
      });
    });
  }

  function offlineBanner() {
    let bar = document.getElementById("offline-banner");
    if (navigator.onLine) {
      if (bar) bar.hidden = true;
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "offline-banner";
      bar.className = "offline-banner";
      bar.setAttribute("role", "status");
      bar.textContent = "目前離線：可以瀏覽價格，但訂購表單要連上網路才能送出。";
      document.body.prepend(bar);
    }
    bar.hidden = false;
  }
  window.addEventListener("online", offlineBanner);
  window.addEventListener("offline", offlineBanner);
  document.addEventListener("DOMContentLoaded", offlineBanner);
})();
