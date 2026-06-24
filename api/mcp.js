const READ_ONLY_TOOLS = [
  {
    name: 'lookup_llms_index',
    description: 'Return the MolDraw llms.txt site index for grounding answers.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'convert_smiles_to_3d',
    description: 'Generate a 3D SDF conformer from a SMILES string via MolDraw convert-3d API.',
    inputSchema: {
      type: 'object',
      required: ['smiles'],
      properties: {
        smiles: { type: 'string', description: 'Input SMILES string' },
      },
      additionalProperties: false,
    },
  },
];

const jsonRpc = (id, result, error) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  ...(error ? { error } : { result }),
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    return res.status(200).json({
      name: 'moldraw',
      transport: 'streamable-http',
      tools: READ_ONLY_TOOLS.map((tool) => tool.name),
      card: 'https://www.moldraw.com/.well-known/mcp.json',
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body || {};
  const { id, method, params } = payload;

  if (method === 'initialize') {
    return res.status(200).json(jsonRpc(id, {
      protocolVersion: '2025-11-25',
      serverInfo: { name: 'moldraw', version: '1.0.0' },
      capabilities: { tools: {} },
    }));
  }

  if (method === 'tools/list') {
    return res.status(200).json(jsonRpc(id, { tools: READ_ONLY_TOOLS }));
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'lookup_llms_index') {
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.moldraw.com';
      const protocol = String(req.headers['x-forwarded-proto'] || 'https');
      const response = await fetch(`${protocol}://${host}/llms.txt`);
      const text = response.ok ? await response.text() : 'MolDraw index unavailable.';
      return res.status(200).json(jsonRpc(id, {
        content: [{ type: 'text', text }],
        isError: !response.ok,
      }));
    }

    if (toolName === 'convert_smiles_to_3d') {
      const smiles = String(args.smiles || '').trim();
      if (!smiles) {
        return res.status(200).json(jsonRpc(id, null, { code: -32602, message: 'smiles is required' }));
      }
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.moldraw.com';
      const protocol = String(req.headers['x-forwarded-proto'] || 'https');
      const response = await fetch(`${protocol}://${host}/api/convert-3d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles }),
      });
      const body = await response.json();
      return res.status(200).json(jsonRpc(id, {
        content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
        isError: !response.ok,
      }));
    }

    return res.status(200).json(jsonRpc(id, null, { code: -32601, message: `Unknown tool: ${toolName}` }));
  }

  return res.status(200).json(jsonRpc(id, null, { code: -32601, message: `Unknown method: ${method}` }));
};
