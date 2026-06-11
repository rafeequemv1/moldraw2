(function () {
  const dataEl = document.getElementById('molecule-data');
  if (!dataEl) return;

  let molecule = null;
  try {
    molecule = JSON.parse(dataEl.textContent || '{}');
  } catch {
    molecule = null;
  }
  if (!molecule || !molecule.cid) return;

  document.querySelectorAll('[data-editor-link]').forEach((editorLink) => {
    if (molecule.smiles) {
      editorLink.href = `/?smiles=${encodeURIComponent(molecule.smiles)}`;
    }
  });

  document.querySelectorAll('[data-smiles-href]').forEach((link) => {
    if (!molecule.smiles) return;
    const base = link.getAttribute('data-smiles-href');
    link.href = `${base}${base.includes('?') ? '&' : '?'}smiles=${encodeURIComponent(molecule.smiles)}`;
  });

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const key = button.getAttribute('data-copy');
      const text = molecule[key] || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const original = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => { button.textContent = original; }, 1300);
      } catch {
        window.prompt('Copy this value:', text);
      }
    });
  });

  const viewerEl = document.getElementById('molecule3d');
  const statusEl = document.getElementById('viewerStatus');
  if (!viewerEl) return;

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (window.$3Dmol) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const sdfUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(molecule.cid)}/record/SDF/?record_type=3d`;

  const renderViewer = () => {
    setStatus(`Loading ${molecule.name || 'molecule'} 3D conformer...`);
    loadScript('https://3Dmol.org/build/3Dmol-min.js')
      .then(() => {
        if (!window.$3Dmol) throw new Error('3Dmol unavailable');
        return fetch(sdfUrl);
      })
    .then((response) => {
      if (!response.ok) throw new Error('No 3D conformer');
      return response.text();
    })
    .then((sdf) => {
      const viewer = window.$3Dmol.createViewer(viewerEl, { backgroundColor: 'white' });
      viewer.addModel(sdf, 'sdf');
      viewer.setStyle({}, {
        stick: { radius: 0.16, colorscheme: 'Jmol' },
        sphere: { scale: 0.22, colorscheme: 'Jmol' },
      });
      viewer.zoomTo();
      viewer.render();
      if (statusEl) statusEl.remove();
    })
    .catch(() => {
      setStatus('3D conformer preview is unavailable right now. PubChem may still provide downloadable 3D data.');
    });
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      renderViewer();
    }, { rootMargin: '180px' });
    observer.observe(viewerEl);
  } else {
    renderViewer();
  }
}());
