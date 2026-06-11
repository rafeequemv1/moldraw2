(function () {
  const form = document.querySelector('[data-medchem-tool]');
  if (!form) return;

  const mode = form.getAttribute('data-medchem-tool');
  const input = document.getElementById('compoundInput');
  const output = document.getElementById('outputBox');
  const summary = document.getElementById('summaryBox');
  const copyBtn = document.getElementById('copyBtn');
  let latestText = '';

  const propertyList = [
    'IUPACName',
    'MolecularFormula',
    'MolecularWeight',
    'CanonicalSMILES',
    'IsomericSMILES',
    'XLogP',
    'TPSA',
    'HBondDonorCount',
    'HBondAcceptorCount',
    'RotatableBondCount',
    'HeavyAtomCount'
  ].join(',');

  function setBusy(text) {
    output.textContent = text;
    if (summary) summary.textContent = 'Working...';
  }

  function getInputType() {
    return document.querySelector('input[name="inputType"]:checked')?.value || 'smiles';
  }

  async function fetchProperties(value, type) {
    const encoded = encodeURIComponent(value);
    const path = type === 'name' ? `name/${encoded}` : `smiles/${encoded}`;
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${path}/property/${propertyList}/JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('PubChem lookup failed');
    const props = (await res.json())?.PropertyTable?.Properties?.[0];
    if (!props) throw new Error('No compound properties found');
    return props;
  }

  function numberValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function ruleLine(label, value, test, limitText) {
    const ok = test(value);
    return { label, value, ok, limitText };
  }

  function lipinskiRules(props) {
    const mw = numberValue(props.MolecularWeight);
    const logp = numberValue(props.XLogP);
    const hbd = numberValue(props.HBondDonorCount);
    const hba = numberValue(props.HBondAcceptorCount);
    return [
      ruleLine('Molecular weight', mw, (v) => v !== null && v <= 500, '<= 500 g/mol'),
      ruleLine('XLogP', logp, (v) => v !== null && v <= 5, '<= 5'),
      ruleLine('H-bond donors', hbd, (v) => v !== null && v <= 5, '<= 5'),
      ruleLine('H-bond acceptors', hba, (v) => v !== null && v <= 10, '<= 10')
    ];
  }

  function veberRules(props) {
    const tpsa = numberValue(props.TPSA);
    const rot = numberValue(props.RotatableBondCount);
    return [
      ruleLine('TPSA', tpsa, (v) => v !== null && v <= 140, '<= 140 A^2'),
      ruleLine('Rotatable bonds', rot, (v) => v !== null && v <= 10, '<= 10')
    ];
  }

  function renderPropertyTable(props, rows) {
    return `<div class="result-card">
      <h2>${props.IUPACName || 'Compound'}</h2>
      <div class="meta-grid">
        <span><strong>Formula</strong>${props.MolecularFormula || 'N/A'}</span>
        <span><strong>MW</strong>${props.MolecularWeight || 'N/A'} g/mol</span>
        <span><strong>CID</strong>${props.CID || 'N/A'}</span>
      </div>
      <table class="score-table">
        <thead><tr><th>Property</th><th>Value</th><th>Guideline</th><th>Status</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${row.label}</td><td>${row.value ?? 'N/A'}</td><td>${row.limitText}</td><td class="${row.ok ? 'pass' : 'fail'}">${row.ok ? 'Pass' : 'Review'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  function resultText(props, rows, title) {
    const lines = [
      title,
      `Compound: ${props.IUPACName || 'N/A'}`,
      `Formula: ${props.MolecularFormula || 'N/A'}`,
      `Molecular weight: ${props.MolecularWeight || 'N/A'} g/mol`,
      `CID: ${props.CID || 'N/A'}`,
      ''
    ];
    rows.forEach((row) => {
      lines.push(`${row.label}: ${row.value ?? 'N/A'} (${row.limitText}) - ${row.ok ? 'Pass' : 'Review'}`);
    });
    return lines.join('\n');
  }

  function renderLipinski(props) {
    const rows = lipinskiRules(props);
    const violations = rows.filter((row) => !row.ok).length;
    const status = violations === 0 ? 'Passes Lipinski Rule of Five' : `${violations} Lipinski rule ${violations === 1 ? 'review item' : 'review items'}`;
    summary.textContent = status;
    latestText = resultText(props, rows, status);
    output.innerHTML = renderPropertyTable(props, rows) + '<p class="note">Lipinski rules are guidelines for oral drug-likeness, not a guarantee of activity, safety, or developability.</p>';
  }

  function renderDruglikeness(props) {
    const rows = [...lipinskiRules(props), ...veberRules(props)];
    const passed = rows.filter((row) => row.ok).length;
    const score = Math.round((passed / rows.length) * 100);
    const status = `Drug-likeness guideline score: ${score}/100`;
    summary.textContent = status;
    latestText = resultText(props, rows, status);
    output.innerHTML = renderPropertyTable(props, rows) + '<p class="note">This lightweight druglikeness score combines Lipinski and Veber-style property checks. It should be used for triage and teaching, not as a medicinal chemistry decision by itself.</p>';
  }

  function renderSingleProperty(props, key, label, unit, interpretation) {
    const value = props[key];
    summary.innerHTML = `<span class="big-value">${value ?? 'N/A'}${unit ? ` ${unit}` : ''}</span>${label}`;
    latestText = `${label}: ${value ?? 'N/A'}${unit ? ` ${unit}` : ''}\nCompound: ${props.IUPACName || 'N/A'}\nFormula: ${props.MolecularFormula || 'N/A'}\nSMILES: ${props.IsomericSMILES || props.CanonicalSMILES || 'N/A'}\nCID: ${props.CID || 'N/A'}`;
    output.innerHTML = `<div class="result-card">
      <h2>${label}</h2>
      <div class="single-value">${value ?? 'N/A'}${unit ? ` ${unit}` : ''}</div>
      <p>${interpretation}</p>
      <div class="meta-grid">
        <span><strong>Compound</strong>${props.IUPACName || 'N/A'}</span>
        <span><strong>Formula</strong>${props.MolecularFormula || 'N/A'}</span>
        <span><strong>MW</strong>${props.MolecularWeight || 'N/A'} g/mol</span>
        <span><strong>CID</strong>${props.CID || 'N/A'}</span>
      </div>
    </div>`;
  }

  async function calculate() {
    const value = input.value.trim();
    latestText = '';
    if (!value) {
      output.textContent = 'Enter a SMILES string or compound name first.';
      summary.textContent = 'No input yet.';
      return;
    }
    setBusy('Looking up compound properties from PubChem...');
    try {
      const props = await fetchProperties(value, getInputType());
      if (mode === 'lipinski') renderLipinski(props);
      if (mode === 'druglikeness') renderDruglikeness(props);
      if (mode === 'logp') renderSingleProperty(props, 'XLogP', 'XLogP / LogP estimate', '', 'Higher LogP generally means greater hydrophobicity. Very high values can signal solubility and formulation concerns.');
      if (mode === 'tpsa') renderSingleProperty(props, 'TPSA', 'Topological polar surface area', 'A^2', 'TPSA is often used as a permeability and oral bioavailability guideline. Values at or below about 140 A^2 satisfy the Veber-style TPSA guideline.');
    } catch {
      output.textContent = 'No property result found. Try a simpler SMILES, a PubChem compound name, or check the spelling.';
      summary.textContent = 'Lookup failed.';
    }
  }

  document.getElementById('calculateBtn')?.addEventListener('click', calculate);
  document.getElementById('clearBtn')?.addEventListener('click', () => {
    input.value = '';
    latestText = '';
    output.textContent = 'Results appear here.';
    summary.textContent = 'Enter a compound to calculate.';
  });
  copyBtn?.addEventListener('click', async () => {
    if (!latestText) return;
    try { await navigator.clipboard.writeText(latestText); } catch {}
  });
  document.querySelectorAll('[data-example]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.getAttribute('data-example') || '';
      const type = button.getAttribute('data-type');
      if (type) {
        const radio = document.querySelector(`input[name="inputType"][value="${type}"]`);
        if (radio) radio.checked = true;
      }
      calculate();
    });
  });

  const initial = new URLSearchParams(window.location.search).get('smiles');
  if (initial) {
    input.value = initial;
    const radio = document.querySelector('input[name="inputType"][value="smiles"]');
    if (radio) radio.checked = true;
  }
  calculate();
}());
