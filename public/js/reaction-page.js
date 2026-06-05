(function () {
  const MOLECULE_NAMES = {
    'CC=O': 'Acetaldehyde',
    'C/C=C/C=O': 'Crotonaldehyde',
    'CC(=O)C': 'Acetone',
    'CC(=O)C=C(C)C': 'Mesityl oxide',
    'O=Cc1ccccc1': 'Benzaldehyde',
    'C=P(c1ccccc1)(c1ccccc1)c1ccccc1': 'Methylene triphenylphosphorane',
    'C=Cc1ccccc1': 'Styrene',
    'O=C1CCCCC1': 'Cyclohexanone',
    'C=C1CCCCC1': 'Methylenecyclohexane',
    'C=O': 'Formaldehyde',
    'C[Mg]Br': 'Methylmagnesium bromide',
    'CCO': 'Ethanol',
    'Br[Mg]c1ccccc1': 'Phenylmagnesium bromide',
    'OC(c1ccccc1)c1ccccc1': 'Diphenylmethanol',
    'B(O)(O)c1ccccc1': 'Phenylboronic acid',
    'Brc1ccccc1': 'Bromobenzene',
    'c1ccc(-c2ccccc2)cc1': 'Biphenyl',
    'B(O)(O)c1cccnc1': 'Pyridylboronic acid',
    'c1ccc(-c2cccnc2)cc1': 'Phenylpyridine',
    'C=CC(=O)OC': 'Methyl acrylate',
    'COC(=O)C=Cc1ccccc1': 'Methyl cinnamate',
    'Ic1ccccc1': 'Iodobenzene',
    'C=Cc1ccccc1': 'Styrene',
    'C(=Cc1ccccc1)c1ccccc1': 'Stilbene',
    'c1ccccc1': 'Benzene',
    'CC(=O)Cl': 'Acetyl chloride',
    'CC(=O)c1ccccc1': 'Acetophenone',
    'COc1ccccc1': 'Anisole',
    'COc1ccc(C(C)=O)cc1': 'p-Methoxyacetophenone',
    'C=CC=C': '1,3-Butadiene',
    'C=CC=O': 'Acrolein',
    'O=CC1C=CCCC1': 'Cyclohexenecarbaldehyde',
    'C=C': 'Ethene',
    'C1=CCCCC1': 'Cyclohexene',
    'C1C=CC=C1': 'Cyclopentadiene',
    'O=C1OC(=O)C=C1': 'Maleic anhydride',
    'O=C1OC(=O)C2C3C=CC(C2)C13': 'Norbornene anhydride adduct',
  };

  const encodeSmiles = (smiles) => encodeURIComponent(String(smiles || '').trim());
  const moleculeImageUrl = (smiles) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeSmiles(smiles)}/PNG?image_size=220x160`;

  const splitSide = (side) => String(side || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  const createMoleculeTile = (smiles) => {
    const tile = document.createElement('div');
    tile.className = 'reaction-molecule-tile';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = `Rendered structure for ${smiles}`;
    img.src = moleculeImageUrl(smiles);
    img.onerror = () => {
      img.remove();
      tile.classList.add('reaction-molecule-fallback');
    };

    const code = document.createElement('code');
    code.className = 'reaction-molecule-name';
    code.textContent = MOLECULE_NAMES[smiles] || smiles;
    code.title = smiles;

    tile.appendChild(img);
    tile.appendChild(code);
    return tile;
  };

  const renderReaction = (smiles) => {
    const [left = '', right = ''] = String(smiles || '').split('>>');
    const reactants = splitSide(left);
    const products = splitSide(right);
    if (!reactants.length || !products.length) return null;

    const wrap = document.createElement('div');
    wrap.className = 'reaction-rendered-scheme';

    const leftBox = document.createElement('div');
    leftBox.className = 'reaction-side';
    reactants.forEach((part, index) => {
      if (index > 0) {
        const plus = document.createElement('span');
        plus.className = 'reaction-plus';
        plus.textContent = '+';
        leftBox.appendChild(plus);
      }
      leftBox.appendChild(createMoleculeTile(part));
    });

    const arrow = document.createElement('div');
    arrow.className = 'reaction-arrow';
    arrow.textContent = '->';

    const rightBox = document.createElement('div');
    rightBox.className = 'reaction-side';
    products.forEach((part, index) => {
      if (index > 0) {
        const plus = document.createElement('span');
        plus.className = 'reaction-plus';
        plus.textContent = '+';
        rightBox.appendChild(plus);
      }
      rightBox.appendChild(createMoleculeTile(part));
    });

    wrap.appendChild(leftBox);
    wrap.appendChild(arrow);
    wrap.appendChild(rightBox);
    return wrap;
  };

  const renderTarget = (target) => {
    const smiles = target.getAttribute('data-reaction-smiles');
    if (!smiles || target.getAttribute('data-reaction-rendered') === 'true') return;
    const rendered = renderReaction(smiles);
    if (!rendered) return;
    target.setAttribute('data-reaction-rendered', 'true');

    if (target.classList.contains('scheme')) {
      target.insertAdjacentElement('afterend', rendered);
      return;
    }

    target.appendChild(rendered);
    const note = document.createElement('p');
    note.className = 'note reaction-smiles-note';
    note.innerHTML = `<strong>Reaction SMILES:</strong> <code>${smiles.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
    target.appendChild(note);

    const link = document.createElement('a');
    link.className = 'editor-btn reaction-example-edit';
    link.href = `/?reaction=${encodeURIComponent(smiles)}`;
    link.textContent = 'Edit this example in MolDraw';
    target.appendChild(link);
  };

  const targets = Array.from(document.querySelectorAll('[data-reaction-smiles]'));
  if (!targets.length) return;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        renderTarget(entry.target);
      });
    }, { rootMargin: '220px' });
    targets.forEach((target) => observer.observe(target));
  } else {
    targets.forEach(renderTarget);
  }
}());
