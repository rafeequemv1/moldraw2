const { generate3DStructure } = require('../server/convert3d-core');

const setCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
};

const parseBody = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
};

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET' || req.method === 'HEAD') {
    return res.status(200).json({
      ok: true,
      endpoint: '/api/convert-3d',
      method: 'POST',
      example: { smiles: 'CCO' },
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const body = parseBody(req.body);
    const result = await generate3DStructure({
      smiles: body.smiles,
      molfile: body.molfile,
    });
    if (result.status >= 500) {
      console.error('[convert-3d]', result.body);
    } else if (result.body?.code && result.status !== 200) {
      console.warn('[convert-3d]', result.body.code);
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[convert-3d] internal_error', error?.message || error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
};

module.exports.config = {
  maxDuration: 10,
};
