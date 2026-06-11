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

  function findPrimaryConverterInput(panel) {
    var textarea = panel.querySelector('textarea:not([readonly])');
    if (textarea) return textarea;
    return Array.from(panel.querySelectorAll('input[type="text"], input:not([type])')).find(function (input) {
      return !input.closest('.pubchem-import, .pdb-id-form');
    });
  }

  function pubChemBase(query) {
    var clean = String(query || '').trim();
    return /^\d+$/.test(clean)
      ? 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + encodeURIComponent(clean)
      : 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/' + encodeURIComponent(clean);
  }

  function getPubChemSmiles(props) {
    return props?.IsomericSMILES || props?.CanonicalSMILES || props?.SMILES || props?.ConnectivitySMILES || '';
  }

  function setConverterFeedback(panel, text) {
    var target = panel.querySelector('.status, #statusText, #outputBox, #resultBox, textarea[readonly], .output');
    if (!target) return;
    if ('value' in target && target.tagName === 'TEXTAREA') target.value = text;
    else target.textContent = text;
  }

  var sampleValues = {
    smiles: [
      { label: 'Aspirin', value: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
      { label: 'Caffeine', value: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
      { label: 'Methanol', value: 'CO' },
      { label: 'Glucose', value: 'C(C1C(C(C(C(O1)O)O)O)O)O' }
    ],
    name: [
      { label: 'Aspirin IUPAC', value: '2-acetyloxybenzoic acid' },
      { label: 'Caffeine', value: 'caffeine' },
      { label: 'Ibuprofen', value: 'ibuprofen' },
      { label: 'Paracetamol', value: 'paracetamol' }
    ],
    cid: [
      { label: 'Aspirin CID', value: '2244' },
      { label: 'Caffeine CID', value: '2519' },
      { label: 'Methanol CID', value: '887' },
      { label: 'Glucose CID', value: '5793' }
    ],
    inchi: [
      { label: 'Aspirin', value: 'InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)' },
      { label: 'Caffeine', value: 'InChI=1S/C8H10N4O2/c1-10-4-9-6-5(10)7(13)12(3)8(14)11(6)2/h4H,1-3H3' },
      { label: 'Methanol', value: 'InChI=1S/CH4O/c1-2/h2H,1H3' }
    ],
    inchikey: [
      { label: 'Aspirin', value: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' },
      { label: 'Caffeine', value: 'RYYVLZVUVIJVGH-UHFFFAOYSA-N' },
      { label: 'Methanol', value: 'OKKJLVBELUTLKV-UHFFFAOYSA-N' }
    ],
    mol: [
      { label: 'Methanol MOL', value: '\n  MolDraw sample\n\n  2  1  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.4300    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\nM  END' }
    ],
    sdf: [
      { label: 'Methanol SDF', value: '\n  MolDraw sample\n\n  2  1  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.4300    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\nM  END\n$$$$' }
    ],
    mol2: [
      { label: 'Methanol MOL2', value: '@<TRIPOS>MOLECULE\nMethanol\n2 1 1 0 0\nSMALL\nUSER_CHARGES\n\n@<TRIPOS>ATOM\n      1 C1          0.0000    0.0000    0.0000 C.3       1 MET       0.0000\n      2 O1          1.4300    0.0000    0.0000 O.3       1 MET       0.0000\n@<TRIPOS>BOND\n     1    1    2 1\n@<TRIPOS>SUBSTRUCTURE\n     1 MET         1 TEMP              0 ****  ****    0 ROOT' }
    ],
    pdb: [
      { label: 'Methanol PDB', value: 'HETATM    1  C1  MET A   1       0.000   0.000   0.000  1.00 20.00           C\nHETATM    2  O1  MET A   1       1.430   0.000   0.000  1.00 20.00           O\nCONECT    1    2\nCONECT    2    1\nEND' },
      { label: 'Tiny peptide PDB', value: 'ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00 20.00           N\nATOM      2  CA  GLY A   1       1.450   0.000   0.000  1.00 20.00           C\nATOM      3  C   GLY A   1       2.050   1.360   0.000  1.00 20.00           C\nATOM      4  O   GLY A   1       1.450   2.420   0.000  1.00 20.00           O\nTER\nEND' }
    ]
  };

  function sampleTypeForPath(pathname) {
    var name = pathname.split('/').pop() || '';
    if (/^smiles-to-|smiles-to-structure/.test(name)) return 'smiles';
    if (/^iupac-name-to-/.test(name)) return 'name';
    if (/^cid-to-/.test(name)) return 'cid';
    if (/^inchi-to-/.test(name)) return 'inchi';
    if (/^inchikey-to-/.test(name)) return 'inchikey';
    if (/^mol2-to-/.test(name)) return 'mol2';
    if (/^mol-to-/.test(name)) return 'mol';
    if (/^sdf-to-/.test(name)) return 'sdf';
    if (/^pdb-to-/.test(name)) return 'pdb';
    return '';
  }

  function addConverterSamplePresets() {
    if (window.location.pathname.indexOf('/tools/free-chem-tools/') !== 0) return;
    var panel = document.querySelector('main .panel');
    if (!panel || panel.querySelector('.example-chips')) return;
    var input = findPrimaryConverterInput(panel);
    if (!input) return;
    var type = sampleTypeForPath(window.location.pathname);
    var samples = sampleValues[type];
    if (!samples || !samples.length) return;

    var chips = document.createElement('div');
    chips.className = 'example-chips site-sample-presets';
    chips.setAttribute('aria-label', 'Sample presets');
    samples.forEach(function (sample) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = sample.label;
      button.addEventListener('click', function () {
        input.value = sample.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        setConverterFeedback(panel, 'Loaded ' + sample.label + ' sample. Click Convert to run it.');
      });
      chips.appendChild(button);
    });

    var insertTarget = input.closest('.input-row') || input;
    insertTarget.parentNode.insertBefore(chips, insertTarget);
  }

  function addSmilesPubChemImport() {
    if (!/\/tools\/free-chem-tools\/smiles-to-/.test(window.location.pathname)) return;
    var panel = document.querySelector('main .panel');
    if (!panel || panel.querySelector('#pubchemImportBtn, [data-site-pubchem-import]')) return;
    var input = findPrimaryConverterInput(panel);
    if (!input) return;

    var importWrap = document.createElement('div');
    importWrap.className = 'pubchem-import';
    importWrap.setAttribute('data-site-pubchem-import', 'true');
    importWrap.setAttribute('aria-label', 'PubChem SMILES import');
    importWrap.innerHTML = [
      '<input type="text" placeholder="Search PubChem by name or CID, e.g. methanol, aspirin, 2244" aria-label="PubChem compound name or CID">',
      '<button type="button">Import from PubChem</button>'
    ].join('');

    var queryInput = importWrap.querySelector('input');
    var button = importWrap.querySelector('button');
    var insertTarget = input.closest('.input-row') || input;
    insertTarget.parentNode.insertBefore(importWrap, insertTarget);

    async function importSmiles() {
      var query = (queryInput.value || '').trim();
      if (!query) {
        setConverterFeedback(panel, 'Enter a compound name or PubChem CID first.');
        return;
      }
      setConverterFeedback(panel, 'Searching PubChem...');
      try {
        var response = await fetch(pubChemBase(query) + '/property/SMILES,ConnectivitySMILES,CanonicalSMILES,IsomericSMILES,IUPACName/JSON');
        if (!response.ok) throw new Error('PubChem lookup failed');
        var props = (await response.json())?.PropertyTable?.Properties?.[0];
        var smiles = getPubChemSmiles(props);
        if (!smiles) throw new Error('No SMILES returned');
        input.value = smiles;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        var action = panel.querySelector('#convertBtn, #renderBtn, #drawBtn, .site-converter-primary-action');
        if (action) action.click();
        setConverterFeedback(panel, 'Imported ' + (props?.IUPACName || query) + ' from PubChem.');
      } catch (err) {
        setConverterFeedback(panel, 'PubChem import failed. Try a different name, exact spelling, or CID.');
      }
    }

    button.addEventListener('click', importSmiles);
    queryInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') importSmiles();
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
    var input = findPrimaryConverterInput(panel);
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
    addSmilesPubChemImport();
    addConverterSamplePresets();
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
