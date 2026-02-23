const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are MolDraw Assistant — a chemistry AI embedded in an interactive 2D/3D molecular editor called MolDraw (by Scidart Academy).

CAPABILITIES:
- Draw any molecule, reaction, or structure on the canvas via SMILES.
- Name molecules: provide IUPAC name, common name, or both.
- Convert names to structures: "draw aspirin" -> output the SMILES for aspirin.
- Explain reactions, mechanisms, functional groups, properties.
- Provide molecular properties (mass, formula, etc.) from the structure.
- Answer support questions about MolDraw and help users navigate the app.

RESPONSE FORMAT — You MUST reply with a single JSON object (no markdown, no backticks, no extra text):
{
  "assistant_message": "your reply shown in chat",
  "canvas_action": "none" | "clear" | "set_smiles" | "append_smiles",
  "smiles": "valid SMILES string or null"
}

ACTION RULES:
- "set_smiles" replaces canvas with SMILES.
- "append_smiles" adds without clearing.
- "clear" clears the canvas.
- "none" chat-only response.

IMPORTANT: Output ONLY the JSON object.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, smiles, molfile, apiKey, history } = req.body || {};
  const key = apiKey || process.env.GEMINI_API_KEY || '';

  if (!key) {
    return res.status(400).json({ error: 'No API key provided. Paste your Gemini API key in assistant settings.' });
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  const userContext =
    `Current SMILES on canvas: ${smiles || 'empty'}\n` +
    `Molfile (may be truncated):\n${molfile ? String(molfile).slice(0, 4000) : 'N/A'}\n` +
    `\nUser: ${prompt}`;

  const contents = [];
  contents.push({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
  contents.push({
    role: 'model',
    parts: [{ text: '{"assistant_message":"Ready to help!","canvas_action":"none","smiles":null}' }],
  });

  if (Array.isArray(history)) {
    history.slice(-20).forEach((msg) => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text || '' }],
      });
    });
  }
  contents.push({ role: 'user', parts: [{ text: userContext }] });

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({ contents }),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Gemini API error:', resp.status, text);
      if (resp.status === 400 || resp.status === 403) {
        return res.status(resp.status).json({ error: 'Invalid API key or access denied.' });
      }
      return res.status(500).json({ error: `Gemini API error (${resp.status})` });
    }

    const data = await resp.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ reply: reply || 'No response from Gemini.', model: GEMINI_MODEL });
  } catch (error) {
    console.error('Gemini proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
