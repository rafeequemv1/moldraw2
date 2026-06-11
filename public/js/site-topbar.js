(function () {
  if (!document.querySelector('script[data-site="i9cwwugh"][src="https://piqo.app/piqo.js"]')) {
    var piqoScript = document.createElement('script');
    piqoScript.defer = true;
    piqoScript.setAttribute('data-site', 'i9cwwugh');
    piqoScript.src = 'https://piqo.app/piqo.js';
    document.head.appendChild(piqoScript);
  }

  if (window.location.pathname.indexOf('/tools/') === 0 || window.location.pathname === '/tools') {
    document.body.classList.add('tools-page-sticky-nav');
    if (!document.querySelector('.site-scroll-top-btn')) {
      var scrollTopButton = document.createElement('button');
      scrollTopButton.type = 'button';
      scrollTopButton.className = 'site-scroll-top-btn';
      scrollTopButton.setAttribute('aria-label', 'Scroll to top');
      scrollTopButton.textContent = 'Top';
      scrollTopButton.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      window.addEventListener('scroll', function () {
        scrollTopButton.classList.toggle('visible', window.scrollY > 420);
      }, { passive: true });
      document.body.appendChild(scrollTopButton);
    }
  }

  function getConverterLabels(panel) {
    var title = (panel.querySelector('h1')?.textContent || '').replace(/\s+Online Tool|\s+Online|\s+Converter/gi, '').trim();
    var parts = title.split(/\s+to\s+/i);
    if (parts.length >= 2) {
      return {
        input: parts[0].trim() + ' Input',
        output: parts.slice(1).join(' to ').trim() + ' Output',
      };
    }
    return { input: 'Input', output: 'Output' };
  }

  function makeCard(title, kind) {
    var card = document.createElement('div');
    card.className = 'site-converter-card site-converter-' + kind;
    var heading = document.createElement('h2');
    heading.className = 'site-converter-card-title';
    heading.textContent = title;
    card.appendChild(heading);
    return card;
  }

  function buttonMatches(button, terms) {
    var id = (button.id || '').toLowerCase();
    var text = (button.textContent || '').toLowerCase();
    return terms.some(function (term) {
      return id.indexOf(term) !== -1 || text.indexOf(term) !== -1;
    });
  }

  function appendIfHasChildren(parent, child) {
    if (child.children.length) parent.appendChild(child);
  }

  function addCopyOutputButton(outputTarget, outputActions) {
    if (outputActions.querySelector('[data-site-copy-output]')) return;
    var hasCopyButton = Array.from(outputActions.querySelectorAll('button')).some(function (button) {
      return buttonMatches(button, ['copy']);
    });
    if (hasCopyButton) return;
    var copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'ghost-btn';
    copyButton.setAttribute('data-site-copy-output', 'true');
    copyButton.textContent = 'Copy output';
    copyButton.addEventListener('click', async function () {
      var value = 'value' in outputTarget ? outputTarget.value : outputTarget.textContent;
      if (!value || !value.trim()) return;
      try {
        await navigator.clipboard.writeText(value.trim());
      } catch (err) {}
    });
    outputActions.insertBefore(copyButton, outputActions.firstChild);
  }

  function moveButtons(actions, inputCard, outputCard, middleCard, outputTarget) {
    if (!actions) return;
    var inputActions = document.createElement('div');
    inputActions.className = 'site-converter-card-actions';
    var outputActions = document.createElement('div');
    outputActions.className = 'site-converter-card-actions';

    Array.from(actions.querySelectorAll('button')).forEach(function (button) {
      if (buttonMatches(button, ['convert', 'render', 'draw'])) {
        button.classList.add('site-converter-primary-action');
        middleCard.appendChild(button);
      } else if (buttonMatches(button, ['copy', 'download', 'export', 'dl'])) {
        outputActions.appendChild(button);
      } else {
        inputActions.appendChild(button);
      }
    });

    appendIfHasChildren(inputCard, inputActions);
    if (outputTarget) addCopyOutputButton(outputTarget, outputActions);
    appendIfHasChildren(outputCard, outputActions);
    if (!actions.children.length) actions.remove();
  }

  function moveInputHelpers(panel, inputCard) {
    [
      '.input-tools',
      '.pubchem-import',
      '.example-chips',
      '.mini-note',
      '.source-note',
      '.input-row',
      '.file-picker',
      '.pdb-id-form'
    ].forEach(function (selector) {
      Array.from(panel.querySelectorAll(selector)).forEach(function (node) {
        if (!inputCard.contains(node) && !node.closest('.site-converter-shell')) {
          inputCard.appendChild(node);
        }
      });
    });
  }

  function enhanceExistingIoGrid(panel) {
    var grid = panel.querySelector('.io-grid');
    if (!grid || grid.classList.contains('site-converter-shell')) return false;
    var columns = Array.from(grid.children);
    if (columns.length < 2) return false;
    var actions = panel.querySelector(':scope > .actions');
    var outputTarget = columns[1].querySelector('textarea, .output, pre, code');
    var labels = getConverterLabels(panel);
    var middle = document.createElement('div');
    middle.className = 'site-converter-middle';
    columns[0].classList.add('site-converter-card', 'site-converter-input');
    columns[1].classList.add('site-converter-card', 'site-converter-output');
    if (!columns[0].querySelector('.site-converter-card-title, h2')) {
      var inputTitle = document.createElement('h2');
      inputTitle.className = 'site-converter-card-title';
      inputTitle.textContent = labels.input;
      columns[0].insertBefore(inputTitle, columns[0].firstChild);
    }
    if (!columns[1].querySelector('.site-converter-card-title, h2')) {
      var outputTitle = document.createElement('h2');
      outputTitle.className = 'site-converter-card-title';
      outputTitle.textContent = labels.output;
      columns[1].insertBefore(outputTitle, columns[1].firstChild);
    }
    grid.classList.add('site-converter-shell');
    grid.insertBefore(middle, columns[1]);
    moveButtons(actions, columns[0], columns[1], middle, outputTarget);
    return true;
  }

  function enhanceSimpleConverter(panel) {
    if (panel.classList.contains('site-converter-enhanced')) return;
    if (enhanceExistingIoGrid(panel)) {
      panel.classList.add('site-converter-enhanced');
      return;
    }
    var input = panel.querySelector('textarea:not([readonly]), input[type="text"], input:not([type])');
    var output = panel.querySelector('.output, #outputBox, #resultBox, textarea[readonly]');
    var actions = panel.querySelector(':scope > .actions, .input-wrap > .actions');
    var helperActions = panel.querySelector(':scope > .input-row');
    if (!input || !output || !actions) return;

    var labels = getConverterLabels(panel);
    var shell = document.createElement('div');
    shell.className = 'site-converter-shell';
    var inputCard = makeCard(labels.input, 'input');
    var middleCard = document.createElement('div');
    middleCard.className = 'site-converter-middle';
    var outputCard = makeCard(labels.output, 'output');

    moveInputHelpers(panel, inputCard);
    if (!inputCard.contains(input)) inputCard.appendChild(input);
    outputCard.appendChild(output);
    moveButtons(actions, inputCard, outputCard, middleCard, output);
    if (helperActions) moveButtons(helperActions, inputCard, outputCard, middleCard, output);

    shell.appendChild(inputCard);
    shell.appendChild(middleCard);
    shell.appendChild(outputCard);
    var insertBefore = panel.querySelector('.status, .quick-answer')?.nextSibling || panel.querySelector('textarea, .io-grid');
    panel.insertBefore(shell, insertBefore);
    panel.classList.add('site-converter-enhanced');
  }

  if (window.location.pathname.indexOf('/tools/free-chem-tools/') === 0) {
    document.body.classList.add('site-free-tools-page');
    Array.from(document.querySelectorAll('main .panel')).forEach(enhanceSimpleConverter);
  }

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
    '    <a class="site-topbar-link" href="/dashboard/">Dashboard</a>',
    '    <a class="site-topbar-link" href="/tools/">Tools</a>',
    '    <a class="site-topbar-link" href="/community/">Community</a>',
    '    <a class="site-topbar-link" href="/tools/free-chem-tools/">Free Tools</a>',
    '    <a class="site-topbar-link" href="/course/index.html">Course</a>',
    '    <a class="site-topbar-link" href="/blog/">Blog</a>',
    '    <a class="site-topbar-link" href="/pages/faq.html">FAQ</a>',
    '  </nav>',
    '</div>',
  ].join('');

  document.body.insertBefore(topbar, document.body.firstChild);
})();
