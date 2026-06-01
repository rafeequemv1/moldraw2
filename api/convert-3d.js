const fetchText = async (url, timeoutMs = 45000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
};

const getSdf3DStats = (text) => {
  if (typeof text !== 'string' || !/M\s+END/i.test(text)) return null;
  const lines = text.split(/\r?\n/);
  const countsIndex = lines.findIndex((line) => /^\s*\d+\s+\d+.*V[23]000/.test(line));
  if (countsIndex < 0) return null;
  const atomCount = Number.parseInt(lines[countsIndex].trim().split(/\s+/)[0], 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) return null;

  const zValues = [];
  for (let i = 0; i < atomCount; i += 1) {
    const parts = String(lines[countsIndex + 1 + i] || '').trim().split(/\s+/);
    const z = Number.parseFloat(parts[2]);
    if (Number.isFinite(z)) zValues.push(z);
  }
  if (!zValues.length) return null;

  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  return {
    atomCount,
    headerSays3D: /3D/i.test(lines[1] || ''),
    zDepth: maxZ - minZ,
  };
};

const isValid3DSdf = (text) => {
  const stats = getSdf3DStats(text);
  // Some truly planar molecules are valid 3D conformers, but 2D service output
  // must not be treated as quantum-ready coordinates.
  return Boolean(stats && (stats.headerSays3D || stats.zDepth > 0.05));
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const smiles = String(req.body?.smiles || '').trim();
  if (!smiles) {
    return res.status(400).json({ error: 'Missing SMILES', code: 'MISSING_SMILES' });
  }
  if (smiles.length > 2000) {
    return res.status(400).json({ error: 'SMILES is too long', code: 'SMILES_TOO_LONG' });
  }

  const encoded = encodeURIComponent(smiles);
  const sources = [
    {
      name: 'pubchem',
      url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/record/SDF/?record_type=3d`,
    },
    {
      name: 'nci-cactus',
      url: `https://cactus.nci.nih.gov/chemical/structure/${encoded}/file?format=sdf&get3d=true`,
    },
  ];

  const errors = [];
  for (const source of sources) {
    try {
      const result = await fetchText(source.url);
      if (result.ok && isValid3DSdf(result.text)) {
        return res.status(200).json({ sdf: result.text, source: source.name });
      }
      errors.push(`${source.name}:${result.status}`);
    } catch (error) {
      errors.push(`${source.name}:${error?.name || 'error'}`);
    }
  }

  return res.status(404).json({
    error: 'No 3D conformer could be generated for this SMILES.',
    code: 'NO_3D_CONFORMER',
    tried: errors,
  });
};
