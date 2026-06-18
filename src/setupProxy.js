const express = require('express');
const { generate3DStructure } = require('../server/convert3d-core');

module.exports = function setupDevProxy(app) {
  app.use(express.json({ limit: '5mb' }));

  app.post('/api/convert-3d', async (req, res) => {
    try {
      const result = await generate3DStructure({
        smiles: req.body?.smiles,
        molfile: req.body?.molfile,
      });
      res.status(result.status).json(result.body);
    } catch (error) {
      res.status(500).json({
        error: error?.message || '3D conversion failed',
        code: 'CONVERT_3D_FAILED',
      });
    }
  });
};
