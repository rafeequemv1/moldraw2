(function () {
  if (document.querySelector('.site-topbar-root')) return;

  var topbar = document.createElement('header');
  topbar.className = 'site-topbar-root';
  topbar.innerHTML = [
    '<div class="site-topbar-inner">',
    '  <a class="site-topbar-brand" href="/" aria-label="MolDraw home">',
    '    <img class="site-topbar-logo" src="/logo.svg" alt="MolDraw">',
    '    <span class="site-topbar-by">by scidart.com</span>',
    '  </a>',
    '  <nav class="site-topbar-nav" aria-label="Main navigation">',
    '    <a class="site-topbar-link site-topbar-cta" href="/">Open App</a>',
    '    <a class="site-topbar-link" href="/tools/">Tools</a>',
    '    <a class="site-topbar-link" href="/tools/free-chem-tools/">Free Tools</a>',
    '    <a class="site-topbar-link" href="/course/index.html">Course</a>',
    '    <a class="site-topbar-link" href="/blog/">Blog</a>',
    '    <a class="site-topbar-link" href="/pages/faq.html">FAQ</a>',
    '  </nav>',
    '</div>',
  ].join('');

  document.body.insertBefore(topbar, document.body.firstChild);
})();
