const { generate3DStructure } = require('../server/convert3d-core');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const result = await generate3DStructure({
    smiles: req.body?.smiles,
    molfile: req.body?.molfile,
  });
  return res.status(result.status).json(result.body);
};
