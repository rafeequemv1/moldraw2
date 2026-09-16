(function () {
  document.querySelectorAll('[data-footer-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  document.querySelectorAll('.site-footer-nav').forEach(function (nav) {
    if (nav.querySelector('a[href="/addons"], a[href="/addons/"]')) return;
    var tools = Array.from(nav.querySelectorAll('a')).find(function (link) {
      var href = link.getAttribute('href') || '';
      return href === '/tools/' || href === '/tools';
    });
    if (!tools) return;
    var sep = document.createElement('span');
    sep.className = 'site-footer-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '·';
    var link = document.createElement('a');
    link.href = '/addons';
    link.textContent = 'Addons';
    var after = tools.nextElementSibling;
    if (after && after.classList.contains('site-footer-sep')) {
      after.after(link);
      link.after(sep);
    } else {
      tools.after(sep);
      sep.after(link);
    }
  });
})();
