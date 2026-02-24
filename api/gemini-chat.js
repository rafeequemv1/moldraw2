const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const ALLOWED_GEMINI_MODELS = new Set(['gemini-2.5-flash', 'gemini-3.0-flash', 'gemini-3-pro']);
const selectModel = (requested) => (ALLOWED_GEMINI_MODELS.has(requested) ? requested : DEFAULT_GEMINI_MODEL);
const MAX_RATE_LIMIT_RETRIES = 2;
const BASE_RETRY_MS = 700;
const MAX_RETRY_MS = 6000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parseRetryAfterSeconds = (headerValue) => {
  if (!headerValue) return null;
  const asNum = Number(headerValue);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.ceil(asNum);
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    const deltaSec = Math.ceil((asDate - Date.now()) / 1000);
    return deltaSec > 0 ? deltaSec : 0;
  }
  return null;
};

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
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const { prompt, smiles, molfile, apiKey, history, model } = req.body || {};
  const selectedModel = selectModel(model);
  const key = apiKey || process.env.GEMINI_API_KEY || '';

  if (!key) {
    return res.status(400).json({ error: 'No API key provided. Paste your Gemini API key in assistant settings.', code: 'MISSING_API_KEY' });
  }
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt', code: 'MISSING_PROMPT' });
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
    const callGemini = async (modelName) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({ contents }),
      }
    );

    const callGeminiWith429Retry = async (modelName) => {
      let resp = null;
      let retryAfterSeconds = null;
      for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
        resp = await callGemini(modelName);
        if (resp.status !== 429) {
          return { resp, retryAfterSeconds, attempts: attempt + 1 };
        }
        retryAfterSeconds = parseRetryAfterSeconds(resp.headers.get('retry-after'));
        if (attempt < MAX_RATE_LIMIT_RETRIES) {
          const jitter = Math.floor(Math.random() * 250);
          const backoffMs = retryAfterSeconds != null
            ? Math.min(MAX_RETRY_MS, Math.max(400, retryAfterSeconds * 1000))
            : Math.min(MAX_RETRY_MS, BASE_RETRY_MS * (2 ** attempt) + jitter);
          await sleep(backoffMs);
        }
      }
      return { resp, retryAfterSeconds, attempts: MAX_RATE_LIMIT_RETRIES + 1 };
    };

    let usedModel = selectedModel;
    const triedModels = [usedModel];
    let primary = await callGeminiWith429Retry(usedModel);
    let resp = primary.resp;
    let retryAfterSeconds = primary.retryAfterSeconds;
    let totalAttempts = primary.attempts;
    if (!resp.ok && usedModel !== DEFAULT_GEMINI_MODEL && (resp.status === 400 || resp.status === 404 || resp.status === 429)) {
      triedModels.push(DEFAULT_GEMINI_MODEL);
      const fallback = await callGeminiWith429Retry(DEFAULT_GEMINI_MODEL);
      totalAttempts += fallback.attempts;
      if (fallback.resp.ok) {
        resp = fallback.resp;
        usedModel = DEFAULT_GEMINI_MODEL;
      } else if (resp.status === 429 || fallback.resp.status !== 429) {
        resp = fallback.resp;
        retryAfterSeconds = fallback.retryAfterSeconds;
        usedModel = DEFAULT_GEMINI_MODEL;
      }
    }

    if (!resp.ok) {
      await resp.text();
      console.warn('[gemini-proxy] upstream_error', {
        requestId,
        status: resp.status,
        model: usedModel,
        attempts: totalAttempts,
      });
      if (resp.status === 400 || resp.status === 403) {
        return res.status(resp.status).json({
          error: 'Invalid API key or access denied.',
          code: 'INVALID_KEY_OR_ACCESS',
          modelTried: usedModel,
          triedModels,
        });
      }
      if (resp.status === 429) {
        return res.status(429).json({
          error: 'Gemini rate limit reached. Please retry shortly or switch to Gemini 2.5 Flash.',
          code: 'RATE_LIMITED',
          retryAfterSeconds: retryAfterSeconds ?? null,
          modelTried: usedModel,
          triedModels,
        });
      }
      return res.status(502).json({
        error: `Gemini API error (${resp.status})`,
        code: 'UPSTREAM_ERROR',
        modelTried: usedModel,
        triedModels,
      });
    }

    const data = await resp.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ reply: reply || 'No response from Gemini.', model: usedModel });
  } catch (error) {
    console.error('[gemini-proxy] internal_error', { requestId, message: error?.message || 'unknown' });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
};
