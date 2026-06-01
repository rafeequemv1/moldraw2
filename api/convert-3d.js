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

const isValidSdf = (text) => typeof text === 'string'
  && /M\s+END/i.test(text)
  && /^\s*\d+\s+\d+.*V[23]000/m.test(text);

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
      if (result.ok && isValidSdf(result.text)) {
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
