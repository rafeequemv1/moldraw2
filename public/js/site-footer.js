(function () {
  document.querySelectorAll('[data-footer-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
