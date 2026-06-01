const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 3001;

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const LEGACY_GEMINI_MODEL_ALIASES = {
  'gemini-3.0-flash': 'gemini-3-flash-preview',
  'gemini-3-pro': 'gemini-3.1-pro-preview',
};
const ALLOWED_GEMINI_MODELS = new Set([
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
]);
const selectModel = (requested) => {
  const normalized = LEGACY_GEMINI_MODEL_ALIASES[requested] || requested;
  return ALLOWED_GEMINI_MODELS.has(normalized) ? normalized : DEFAULT_GEMINI_MODEL;
};
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

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({
  origin: (origin, cb) => {
    // Allow browser requests from local app hosts and non-browser tools.
    if (!origin) return cb(null, true);
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1' || /^192\.168\./.test(hostname)) {
        return cb(null, true);
      }
    } catch { /* ignore */ }
    return cb(new Error('Not allowed by CORS'));
  },
}));

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

app.post('/api/convert-3d', async (req, res) => {
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
        return res.json({ sdf: result.text, source: source.name });
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
});

const SYSTEM_PROMPT =
`You are MolDraw Assistant — a chemistry AI embedded in an interactive 2D/3D molecular editor called MolDraw (by Scidart Academy).

CAPABILITIES:
- Draw any molecule, reaction, or structure on the canvas via SMILES.
- Name molecules: provide IUPAC name, common name, or both.
- Convert names to structures: "draw aspirin" → output the SMILES for aspirin.
- Explain reactions, mechanisms, functional groups, properties.
- Provide molecular properties (mass, formula, etc.) from the structure.
- Answer support questions about MolDraw and help users navigate the app.

APP SUPPORT — Answer these kinds of questions using "none" canvas_action:
• How to draw molecules: "Use the 2D editor on the left. Select bond types from the toolbar."
• How to search molecules: "Type a molecule name (e.g. caffeine) in the search bar and press Search."
• How to import PDB proteins: "Enter a PDB ID (e.g. 1CRN) in the search bar and click the PDB button, or use the PDB file upload button."
• How to export: "Use the export buttons (PNG, JPG, SDF, XYZ, X3D, OBJ) in the 3D panel."
• How to use AI: "Paste your Gemini API key via the ⚙ settings icon. Then ask me to draw, name, or explain molecules."
• How to get a Gemini API key: "Visit https://aistudio.google.com/apikey to create a free Gemini API key."
• How to copy/paste SMILES: "Use the Copy/Paste buttons in the top toolbar."
• How to save work: "Your canvas is auto-saved locally. It persists across browser sessions."
• What is MolDraw: "MolDraw is a free ChemDraw alternative by Scidart Academy with 2D/3D editors, PubChem search, PDB protein viewing, AI assistant, and multiple export formats."
• For any question about features, help the user navigate.

RESPONSE FORMAT — You MUST reply with a single JSON object (no markdown, no backticks, no extra text):
{
  "assistant_message": "your reply shown in chat",
  "canvas_action": "none" | "clear" | "set_smiles" | "append_smiles",
  "smiles": "valid SMILES string or null"
}

ACTION RULES:
• "set_smiles" — replaces the canvas with the SMILES structure. Use when the user asks to draw, show, or visualize a specific molecule or reaction.
• "append_smiles" — adds the structure WITHOUT clearing existing content. Use when user says "also draw", "add", or when multiple structures are requested.
• "clear" — clears the canvas entirely.
• "none" — only reply in chat, don't change the canvas. USE THIS for support/help/how-to questions.

NAMING RULES:
• When asked for IUPAC / systematic / common name of the current structure, read the provided SMILES/molfile and derive the name. State it in assistant_message.
• If the user gives a chemical name and asks to draw it, convert the name to a valid SMILES and use set_smiles.
• For reactions, use SMILES reaction notation with >> (e.g. "CC(=O)O.CCO>>CC(=O)OCC.O").

SMILES QUALITY:
• Always output valid, canonical SMILES.
• For stereochemistry use @ / @@ and E/Z notation where relevant.
• For reactions use reactants>>products format.

IMPORTANT: Output ONLY the JSON object. No explanation outside it. No markdown fences.`;

app.post('/api/gemini-chat', async (req, res) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { prompt, smiles, molfile, apiKey, history, model, image } = req.body || {};
  const selectedModel = selectModel(model);
  const imageMimeType = typeof image?.mimeType === 'string' ? image.mimeType : '';
  const imageData = typeof image?.data === 'string' ? image.data : '';
  const hasImage = /^image\/(png|jpe?g|webp|gif)$/i.test(imageMimeType)
    && imageData.length <= 3_600_000
    && /^[A-Za-z0-9+/=]+$/.test(imageData);

  const key = apiKey || process.env.GEMINI_API_KEY || '';
  if (!key) {
    return res.status(400).json({ error: 'No API key provided. Paste your Gemini API key in the assistant settings.', code: 'MISSING_API_KEY' });
  }

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt', code: 'MISSING_PROMPT' });
  }
  if (image && !hasImage) {
    return res.status(400).json({ error: 'Unsupported or invalid image attachment.', code: 'INVALID_IMAGE' });
  }

  const userContext =
    `Current SMILES on canvas: ${smiles || 'empty'}\n` +
    `Molfile (may be truncated):\n${molfile ? String(molfile).slice(0, 4000) : 'N/A'}\n` +
    `\nUser: ${prompt}`;

  // Build multi-turn conversation contents
  const contents = [];
  // System prompt as the first user turn
  contents.push({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
  contents.push({ role: 'model', parts: [{ text: '{"assistant_message":"Ready to help! I can draw molecules, name structures, explain reactions, and answer questions about MolDraw.","canvas_action":"none","smiles":null}' }] });

  // Replay previous conversation turns (last 20 to stay within context limits)
  if (Array.isArray(history)) {
    const recent = history.slice(-20);
    for (const msg of recent) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      });
    }
  }

  // Current user message with canvas context
  const userParts = [{ text: userContext }];
  if (hasImage) {
    userParts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageData,
      },
    });
  }
  contents.push({ role: 'user', parts: userParts });

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

    // Graceful fallback only when the selected model endpoint no longer exists.
    if (!resp.ok && usedModel !== DEFAULT_GEMINI_MODEL && (resp.status === 404)) {
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
          error: 'Invalid API key or access denied. Check your Gemini API key.',
          code: 'INVALID_KEY_OR_ACCESS',
          modelTried: usedModel,
          triedModels,
        });
      }
      if (resp.status === 429) {
        return res.status(429).json({
          error: 'Gemini rate limit reached. Please retry shortly or switch to Gemini 3.1 Flash-Lite.',
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
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    res.json({ reply: reply || 'No response from Gemini.', model: usedModel });
  } catch (error) {
    console.error('[gemini-proxy] internal_error', { requestId, message: error?.message || 'unknown' });
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.listen(PORT, () => {
  console.log(`Gemini proxy server listening on http://localhost:${PORT}`);
});

