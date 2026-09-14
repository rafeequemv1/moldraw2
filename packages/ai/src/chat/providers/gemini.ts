import {
  FunctionCallingMode,
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type GenerativeModel,
  type Part,
} from '@google/generative-ai';
import type { ChatImageAttachment, ChatMessage, LlmToolDefinition } from '../types';
import { formatToolProgressLabel, userRequestsCanvasEdit } from '../toolBridge';
import { GEMINI_DEFAULT_MODEL, resolveGeminiModelId } from './geminiModels';
import type { ChatProvider, ChatProviderParams, ChatProviderResult } from './types';

export { GEMINI_DEFAULT_MODEL, resolveGeminiModelId } from './geminiModels';
export const GEMINI_FALLBACK_MODEL = GEMINI_DEFAULT_MODEL;
/** Retries per sendMessage call before giving up (exponential backoff). */
const MAX_SEND_RETRIES = 3;

const NO_TOOL_EDIT_REPLY =
  'I could not change the canvas because no editing tool ran. Please try again — for example “draw benzene”, “import aspirin”, or “build a 3-step reaction scheme”.';

function newMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** HTTP status extracted from a Gemini SDK error, or undefined. */
function errorHttpStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
    return (e as { status: number }).status;
  }
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/\[(\d{3})[ \]]/) ?? msg.match(/\b(429|500|503)\b/);
  return m ? Number(m[1]) : undefined;
}

/** True for hard quota errors (monthly spend cap / daily quota) that retries cannot fix. */
function isHardQuotaError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes('spending cap') || msg.includes('quota') || msg.includes('billing');
}

/** True for transient capacity errors worth retrying: 503/500 overload, 429 rate limit. */
function isRetryableError(e: unknown): boolean {
  if (isHardQuotaError(e)) return false;
  const status = errorHttpStatus(e);
  if (status === 503 || status === 500 || status === 429) return true;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('capacity')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Send with exponential backoff + jitter on transient 503/429/500 errors. */
async function sendWithRetry<T>(send: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_SEND_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = 1000 * 2 ** (attempt - 1) + Math.random() * 500;
      await sleep(backoffMs);
    }
    try {
      return await send();
    } catch (e) {
      lastError = e;
      if (!isRetryableError(e)) throw e;
    }
  }
  throw lastError;
}

/** User-facing message for capacity errors (short; UI may add expandable detail). */
function friendlyCapacityMessage(e: unknown, _modelsTried: string[]): string {
  const status = errorHttpStatus(e);
  if (status === 429) {
    return 'Rate limit or quota reached — wait a minute and try again.';
  }
  return 'Gemini is busy — try again in a moment.';
}

/** Thrown when the first request fails on capacity — safe to retry the whole turn on a fallback model. */
class ModelBusyError extends Error {
  readonly busyCause: unknown;

  constructor(busyCause: unknown) {
    super(busyCause instanceof Error ? busyCause.message : String(busyCause));
    this.name = 'ModelBusyError';
    this.busyCause = busyCause;
  }
}

function toGeminiFunctionDeclarations(tools: LlmToolDefinition[]): FunctionDeclaration[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as unknown as FunctionDeclaration['parameters'],
  }));
}

const SYSTEM_INSTRUCTION =
  'You are Moldraw, an assistant for a 2D chemical structure editor. ' +
  'CRITICAL: The canvas only changes when you CALL tools. Never say Done, Added, or claim success unless you called a tool this turn. Text-only replies do not draw anything. ' +
  'If the user asks to draw, add, import, build, clear, move, color, or otherwise edit the canvas, you MUST call the appropriate tool before replying — EXCEPT lab-manual / apparatus diagrams (see below). ' +
  'Use tools to read or modify the molecule. Prefer valid, minimal edits. ' +
  'Before editing existing canvas content, call molecule.get_canvas_state first — moleculeCount, per-molecule SMILES/atomIds/bbox (left-to-right), selection, annotations. ' +
  'INDIVIDUAL EDITS (never clear the whole canvas): Target one molecule with moleculeIndex (0=leftmost) or smilesIncludes. Wrong structure → molecule.replace_fragment with the correct SMILES/name. Delete one → molecule.delete_fragment. Move/rotate one → move_fragment / rotate_fragment. Atom/bond tweaks → molecule.get_structure({moleculeIndex}) then command.molecule.updateAtomElement / updateAtomCharge / updateAtomLonePairs / updateBond / setAtomAlias / setAtomIsotope / addBond / deleteAtoms. Stereo: invertStereoAtAtom, flipBondEndpoints, swapAtomPositions. Polymer: addSruBracket / updateSruBracket / deleteSruBracket. Arrows: updateReactionArrow / deleteReactionArrow. Pencil: addStroke / deleteStroke. Raster image paste (not chemistry): addCanvasImage. Molblock text → importMolblock; clipboard fragment → pasteFragment. 3D on canvas: apply3DPose / flatten3DPose / rotate3DPose / clear3DPose; depth UI: setPerspectiveDepthShading|Fade|Wedges. 2D look: setStructureTheme with themeId "skeletal" (Default) or "simple" (ball-and-stick). Fix wrong labels with updateCanvasText/deleteCanvasText. Keep every other molecule untouched. ' +
  'Never use addCanvasImage for “draw this structure” — that pastes a raster; recreate chemistry via importSmiles / rings / schemes. ' +
  'LAB MANUAL / GLASSWARE PROCEDURE (confirm-then-draw): When the user asks for synthesis/procedure steps WITH glassware, apparatus, or a lab-manual diagram: do NOT call mutating tools on the first turn. Reply with a short numbered plan (step labels, setup or vessels per step, whether you will clear the canvas, optional structure scheme), then ask “Draw this on the canvas?”. Only after they confirm (yes / draw / ok / go ahead) call molecule.build_lab_manual with layoutMode matching the chat Diagram toggle (glassware|scheme|both — also on ctx.diagramLayoutMode). build_lab_manual draws step arrows between apparatus columns and places any reaction scheme in a separate band BELOW (never overlapping). Call molecule.list_glassware if unsure of setups or port ids. Ordinary “add benzene” / structure-only schemes still use tools immediately. ' +
  'GLASSWARE PIPELINES: For custom connected apparatus, call molecule.list_glassware (ports per kind), then molecule.place_glassware with pieces[{name, attachTo?, fromPort, toPort}] so joints align — do NOT invent free cx/cy offsets for stacked necks. Rules: joint↔joint, hose↔hose, cap↔joint. Prefer named setup ids when they match (reflux, heated_reflux, cooled_reaction, dry_ice_reaction, fractional_distillation, vacuum_line, inert_balloon, rotovap, clamped_flask, distillation, vacuum_distillation, short_path, schlenk_line, inert_flask, …). ' +
  'For multi-step / reaction schemes / synthesis examples when Diagram toggle is Scheme (or the user wants structures only): use molecule.build_reaction_scheme. When Diagram is Steps or Both, NEVER use build_reaction_scheme alone — use molecule.build_lab_manual with steps[] (and compounds for Both). There is no reaction library and schemes do NOT use PubChem — pass real SMILES for every structure. ' +
  'CRITICAL ACCURACY: compounds[].smiles must be valid SMILES that depict the actual molecule at that step (e.g. phenol Oc1ccccc1, 4-nitrophenol O=[N+]([O-])c1ccc(O)cc1, paracetamol CC(=O)Nc1ccc(O)cc1). Never pass English names in smiles. labelBelow is the display name and MUST match that SMILES. Reagents/catalysts go on arrows only. The canvas scheme MUST match the reaction you describe in text — do not describe paracetamol while drawing unrelated molecules. Prefer Pro-tier models when available for this task. ' +
  'CRITICAL CANVAS PRESERVATION: clear defaults to false. Never call clearAll or pass clear:true unless the user explicitly asks to clear, replace, wipe, or start fresh. Follow-ups (“add a step”, “add another molecule”, “now show the reaction”) MUST keep existing drawings — place new content beside/below. ' +
  'RESONANCE STRUCTURES (critical — you reason the chemistry yourself): For any ask like “resonance of benzene”, “show resonance structures”, contributors, mesomers, enolate resonance, ↔ — ALWAYS call molecule.place_resonance_forms. Do NOT use place_molecules or importSmiles alone (those omit ↔). There is NO preset list — YOU invent correct distinct contributor SMILES. ' +
  '↔ is automatic (withResonanceArrows defaults true); the user does NOT need to ask for resonance arrows. Always pass forms[{smiles,label?}] with ≥2 chemically DISTINCT SMILES (different bonding/charge patterns — never duplicate the same structure twice). Optional label is a human caption only (e.g. "Ortho radical") — NEVER put SMILES in label. ' +
  'Examples of distinct contributors (illustrative, not a closed list): benzene Kekulé C1=CC=CC=C1 vs C1C=CC=CC=1; acetone enolate oxyanion C=C([O-])C vs carbanion [CH2-]C(=O)C; ozone [O-][O+]=O vs O=[O+][O-]; carboxylate CC(=O)[O-] vs CC([O-])=O. ' +
  'ALWAYS include mechanismArrows on the left form when electron movement is part of the teaching picture (enolate, carboxylate, ozone, amide, nitro, allyl, etc.): use formIndex 0, from/to as atom|bond|lone_pair with 0-based indices within that form, headStyle "pair" for 2e moves / "single" for fish-hooks. For simple Kekulé benzene, ↔ alone is enough unless the user asks for curly arrows. Prefer clear:true when the user asks to “show/draw resonance of …” as a fresh diagram. Tool result formMaps lists atomIndex/bondIndex if you need a follow-up fix. ' +
  'Arrow kinds: resonance = solid straight ↔; electron_flow = curved mechanism arrow (fromAnchor/toAnchor: atom|bond|lone_pair); also straight, curved, equilibrium, retrosynthetic, cycle_arc, path, row_wrap, s_curve. ' +
  'MULTI-MOLECULE LAYOUT: When adding 2+ separate molecules (not a reaction scheme and not resonance), ALWAYS call molecule.place_molecules once with molecules[{smiles,label?}] so they land in a neat grid. Do NOT call importSmiles repeatedly (that scatters / re-pans). Do NOT hand-place rings at random coordinates. ' +
  'For a brand-new synthesis only when the user wants a clean slate, you may set clear:true. Otherwise clear:false. ' +
  'LAYOUT: readable spacing; never stack. One reactant → two+ products → layout:"branch". Closed loops (Krebs/TCA/citric acid cycle, urea cycle, etc.) → layout:"cycle". Linear pathways → layout:"row". ' +
  'build_reaction_scheme input: compounds[{smiles, labelBelow?}] (≥2), arrows[{reagentAbove?, reagentBelow?, kind?}], optional clear/title/maxPerRow, layout:"row"|"cycle"|"branch". ' +
  'For cyclic pathways: layout:"cycle" (arrows length = compounds.length). For one reactant → multiple products: layout:"branch" (first = reactant; arrows length = compounds-1). ' +
  'Scheme arrow kinds: cycle_arc = circumferential arcs for layout:"cycle" (default — neat Krebs-style ring); path = flowchart 90° elbows for branch; row_wrap = multi-row snake (auto on row wraps); same-row steps stay straight. Also s_curve, curved, retrosynthetic, equilibrium, resonance (↔), electron_flow. Do not force path on cycle or every in-row arrow. ' +
  'Prefer gesture recipes over raw commands: molecule.move_fragment, rotate_fragment (degrees), align_fragments, distribute_fragments, duplicate_fragment, delete_fragment, paint_rings, rotate_perspective. ' +
  'Pass moleculeIndex (0 = leftmost) or smilesIncludes from get_canvas_state; do not invent atom ids. ' +
  'For focused follow-ups you may use molecule.get_structure, molecule.find_rings, or molecule.get_selection. ' +
  'For “color all rings” / “add blue color in all rings” / “paint rings”: call molecule.color_rings once with { color: "#3b82f6" } (or the requested color). Do NOT loop get_selection — empty selection cannot color rings. molecule.color_selection is only when atoms are already selected. ' +
  'CRITICAL — 2D atom colors: Settings default is BLACK labels (Color atom labels by element is OFF). Oxygen is NOT automatically red on the 2D canvas. For “make all oxygen red” / “color all N blue” you MUST call molecule.color_by_element with { element: "O", color: "red" } (or #dc2626). Never claim heteroatoms are already CPK-colored unless the user enabled that setting. Custom painted colors always show even when the setting is off. ' +
  'For “make all double bonds blue” / “color all triples red”: call molecule.color_by_bond_order once with { bondOrder: "double", color: "blue" }. Do NOT use color_selection (fails with nothing selected) and do NOT loop set_selection. ' +
  'For label font size / bond thickness / opacity (“bigger labels”, “thicker bonds”, “make selection 50% transparent”, “fade oxygen”): call molecule.apply_display_style with labelFontSizePt, bondThicknessPx, and/or opacity (0–1). Use all:true for the whole canvas, element:"O" for one element, or rely on the current selection. null clears the per-object override (Settings defaults return). Prefer this recipe over the raw command. ' +
  'For named compounds (aspirin, caffeine, testosterone, etc.) call command.molecule.importSmiles with { "smiles": "<name or SMILES>" } — the smiles field accepts common names and CAS as well as SMILES. Do not hand-draw atom by atom. ' +
  'CRITICAL: When the user says "add/draw/put <compound name>" (e.g. "add testosterone"), ALWAYS call command.molecule.importSmiles — NEVER command.molecule.addCanvasText. Canvas text is only for explicit label/caption requests. ' +
  'After a successful importSmiles, skip command.molecule.cleanup unless the user asks (PubChem already provides 2D layout; cleanup often mismatches). ' +
  'If any tool returns ok:false / Failed, say so clearly — never claim the structure was added when import failed. ' +
  'For library templates (Ph, COOH, amino acids) prefer molecule.place_template. ' +
  'For a single glassware piece or one named setup (reflux, heated_reflux, cooled_reaction, dry_ice_reaction, fractional_distillation, vacuum_line, inert_balloon, rotovap, clamped_flask, distillation, vacuum_distillation, short_path, addition_reflux, vacuum_filtration, dean_stark, extraction, filtration, schlenk_line, inert_flask, …): molecule.place_glassware after confirmation when it is part of a procedure plan; immediate place is OK for “add a condenser” / “add a spatula”. Catalog auto-updates via molecule.list_glassware. ' +
  'molecule.build_lab_manual input: steps[{label, setup?, pieces[]?, glassware[]?, note?}], optional title/clear, optional compounds/arrows (SMILES) for a chemistry band under the apparatus. ' +
  'For molblock text use command.molecule.importMolblock. Call molecule.get_canvas_state or molecule.stats before large edits. ' +
  'command.molecule.addRing uses center:{x,y}, numSides, isAromatic, angleOffset (optional radius / fuse). ' +
  'command.molecule.cleanup runs layout cleanup. ' +
  'command.molecule.addCanvasText requires { text: { id, x, y, text, fontSize, color } } — prefer build_reaction_scheme for labels under molecules; use build_lab_manual / place_glassware for apparatus captions. ' +
  'When the user attaches image(s) (structure drawings, screenshots, textbook figures, hand sketches): interpret the chemistry and CALL tools to recreate it on the canvas — prefer command.molecule.importSmiles for single compounds, molecule.build_reaction_scheme for multi-step schemes, confirm-then-draw build_lab_manual for apparatus figures, rings/bonds only when needed. Do not only describe the image. If the figure is unclear, ask a short clarifying question after attempting a best-effort draw. Never use addCanvasImage for “draw this structure” — that pastes a raster; structures must be real atoms/bonds via tools. ' +
  'Reply in clean Markdown that is easy to skim: conversational tone; short opening sentence; ' +
  '## or ### titles only when there are real sections; bullet lists for steps or findings; ' +
  'tables when comparing a few facts (formula, mass, counts); inline `code` for SMILES/ids; ' +
  'bold sparingly for key terms. No walls of text, no raw HTML, no decorative emoji spam. ' +
  'After tools, briefly say what changed.';

/** Convert a data-URL attachment into a Gemini inline image part. */
function attachmentToInlinePart(a: ChatImageAttachment): Part {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(a.dataUrl);
  if (!m) throw new Error('Invalid chat image data URL');
  return {
    inlineData: {
      mimeType: a.mimeType || m[1] || 'image/png',
      data: m[2]!,
    },
  };
}

const DEFAULT_IMAGE_PROMPT =
  'Draw the chemical structure(s) from the attached image(s) on the canvas.';

/** Build Gemini Parts for a user message (optional multimodal images). */
function userMessageToParts(m: ChatMessage, includeImages: boolean): Part[] {
  const parts: Part[] = [];
  const text = m.content.trim();
  const atts = m.attachments ?? [];
  if (text) parts.push({ text });
  if (includeImages) {
    for (const a of atts) parts.push(attachmentToInlinePart(a));
  }
  if (!parts.length) {
    parts.push({
      text: atts.length ? DEFAULT_IMAGE_PROMPT : '(empty message)',
    });
  } else if (includeImages && atts.length && !text) {
    // Ensure there is always an instruction when only images are sent.
    parts.unshift({ text: DEFAULT_IMAGE_PROMPT });
  }
  return parts;
}

/** Convert persisted chat messages to Gemini `Content` history (excludes in-flight user msg). */
function chatMessagesToHistory(messages: ChatMessage[]): Content[] {
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      // Prior turns: text only (images already slimmed / stripped in compactHistory).
      contents.push({ role: 'user', parts: userMessageToParts(m, false) });
    } else if (m.role === 'assistant' && m.content.trim()) {
      contents.push({ role: 'model', parts: [{ text: m.content }] });
    } else if (m.role === 'tool' && m.toolName) {
      // Prefer full tool JSON (`llmContent`); UI may store a short summary in `content`.
      const rawJson = m.llmContent ?? m.content;
      let responsePayload: object;
      try {
        responsePayload = JSON.parse(rawJson) as object;
      } catch {
        responsePayload = { result: rawJson };
      }
      contents.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: m.toolName,
              response: responsePayload,
            },
          },
        ],
      });
    }
  }
  return contents;
}

function extractFunctionCalls(parts: Part[]): { name: string; args: Record<string, unknown> }[] {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      calls.push({
        name: p.functionCall.name,
        args: (p.functionCall.args as Record<string, unknown>) ?? {},
      });
    }
  }
  return calls;
}

function extractText(parts: Part[]): string {
  return parts
    .map(p => p.text ?? '')
    .join('')
    .trim();
}

function createModel(
  genAI: GoogleGenerativeAI,
  modelName: string,
  functionDeclarations: FunctionDeclaration[],
  mode: FunctionCallingMode,
  systemInstructionSuffix?: string,
): GenerativeModel {
  const systemInstruction = systemInstructionSuffix?.trim()
    ? `${SYSTEM_INSTRUCTION} ${systemInstructionSuffix.trim()}`
    : SYSTEM_INSTRUCTION;
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
    toolConfig:
      functionDeclarations.length > 0
        ? { functionCallingConfig: { mode } }
        : undefined,
  });
}

async function runTurnWithModel(
  modelName: string,
  params: ChatProviderParams,
): Promise<ChatProviderResult> {
  const { apiKey, messages, tools, onToolCall, maxToolRounds, onProgress, onToolMessage } = params;
  const last = messages.at(-1);
  if (!last || last.role !== 'user') {
    throw new Error('Last message must be from the user.');
  }

  const prior = messages.slice(0, -1);
  const history = chatMessagesToHistory(prior);
  const functionDeclarations = toGeminiFunctionDeclarations(tools);
  const hasImages = (last.attachments?.length ?? 0) > 0;
  const wantsEdit = userRequestsCanvasEdit(last.content, { hasImages });
  const hasTools = functionDeclarations.length > 0;
  const userParts = userMessageToParts(last, true);

  const genAI = new GoogleGenerativeAI(apiKey);

  // Prefer AUTO; for clear edit intents start with ANY so Gemini must call a tool.
  let callingMode: FunctionCallingMode =
    wantsEdit && hasTools ? FunctionCallingMode.ANY : FunctionCallingMode.AUTO;
  const sysSuffix = params.systemInstructionSuffix;
  let model = createModel(genAI, modelName, functionDeclarations, callingMode, sysSuffix);
  let chatSession = model.startChat({ history });
  const toolMessages: ChatMessage[] = [];
  let rounds = 0;

  onProgress?.({
    phase: 'thinking',
    detail: hasImages
      ? 'Reading attached image(s)…'
      : wantsEdit
        ? 'Planning canvas edit…'
        : 'Planning next step…',
  });

  // First request: no tool side effects have happened yet, so a capacity
  // failure here is safe to retry on a different (stable) model.
  let response: Awaited<ReturnType<typeof chatSession.sendMessage>>;
  try {
    response = await sendWithRetry(() => chatSession.sendMessage(userParts));
  } catch (e) {
    if (isRetryableError(e)) throw new ModelBusyError(e);
    throw e;
  }
  let lastText = '';

  while (rounds < maxToolRounds) {
    let parts = response.response.candidates?.[0]?.content?.parts ?? [];
    let calls = extractFunctionCalls(parts);
    lastText = extractText(parts) || lastText;

    // If AUTO somehow skipped tools on an edit request, force one ANY retry.
    if (calls.length === 0 && wantsEdit && hasTools && rounds === 0 && callingMode === FunctionCallingMode.AUTO) {
      onProgress?.({ phase: 'thinking', detail: 'Retrying — requiring a canvas tool…' });
      callingMode = FunctionCallingMode.ANY;
      model = createModel(genAI, modelName, functionDeclarations, callingMode, sysSuffix);
      chatSession = model.startChat({ history });
      const nudgeParts: Part[] = [
        ...userParts,
        {
          text: '\n\n(You must call a Moldraw tool to change the canvas. Do not reply with text only.)',
        },
      ];
      response = await sendWithRetry(() => chatSession.sendMessage(nudgeParts));
      parts = response.response.candidates?.[0]?.content?.parts ?? [];
      calls = extractFunctionCalls(parts);
      lastText = extractText(parts) || lastText;
    }

    if (calls.length === 0) break;

    // After the first forced tool call, switch to AUTO so the model can reply in text.
    if (callingMode === FunctionCallingMode.ANY) {
      callingMode = FunctionCallingMode.AUTO;
      model = createModel(genAI, modelName, functionDeclarations, callingMode, sysSuffix);
      chatSession = model.startChat({
        history: [
          ...history,
          { role: 'user', parts: userParts },
          { role: 'model', parts },
        ],
      });
    }

    const functionResponseParts: Part[] = [];
    for (const call of calls) {
      const label = formatToolProgressLabel(call.name, call.args);
      onProgress?.({ phase: 'tool_start', toolName: call.name, label });

      let toolResult: unknown;
      let ok = true;
      try {
        toolResult = await onToolCall(call.name, call.args);
        if (
          toolResult &&
          typeof toolResult === 'object' &&
          'ok' in toolResult &&
          (toolResult as { ok: boolean }).ok === false
        ) {
          ok = false;
        }
      } catch (e) {
        ok = false;
        toolResult = { error: e instanceof Error ? e.message : String(e) };
      }

      const toolMsg: ChatMessage = {
        id: newMessageId(),
        role: 'tool',
        content: JSON.stringify(toolResult ?? { ok: true }),
        llmContent: JSON.stringify(toolResult ?? { ok: true }),
        toolArgs: call.args,
        toolName: call.name,
        toolOk: ok,
      };
      toolMessages.push(toolMsg);
      onToolMessage?.(toolMsg);

      onProgress?.({ phase: 'tool_end', toolName: call.name, label, ok });

      functionResponseParts.push({
        functionResponse: {
          name: call.name,
          response:
            typeof toolResult === 'object' && toolResult !== null
              ? (toolResult as object)
              : { result: toolResult },
        },
      });
    }

    onProgress?.({ phase: 'thinking', detail: 'Continuing…' });

    // Mid-turn: tools may already have mutated the molecule, so only retry the
    // same session (never re-run the whole turn on another model).
    response = await sendWithRetry(() => chatSession.sendMessage(functionResponseParts));
    rounds += 1;
  }

  const finalParts = response.response.candidates?.[0]?.content?.parts ?? [];
  lastText = extractText(finalParts) || lastText;

  if (wantsEdit && toolMessages.length === 0) {
    return {
      assistantText: NO_TOOL_EDIT_REPLY,
      toolMessages,
    };
  }

  const mutated = toolMessages.some(
    m =>
      m.toolOk !== false &&
      m.toolName != null &&
      !m.toolName.includes('get_') &&
      !m.toolName.includes('.stats') &&
      !m.toolName.includes('export_') &&
      !m.toolName.includes('list_'),
  );
  const fallback = mutated
    ? 'Updated the canvas.'
    : toolMessages.length > 0
      ? 'I inspected the canvas but did not apply a change. Try again — for ring color use “color all rings blue”.'
      : 'Ask me to draw or edit a structure on the canvas.';

  return {
    assistantText: lastText || fallback,
    toolMessages,
  };
}

export const geminiProvider: ChatProvider = {
  id: 'gemini',

  async chat(params: ChatProviderParams): Promise<ChatProviderResult> {
    const modelName = resolveGeminiModelId(params.model);
    try {
      return await runTurnWithModel(modelName, params);
    } catch (e) {
      if (e instanceof ModelBusyError) {
        throw new Error(friendlyCapacityMessage(e.busyCause, [modelName]), { cause: e });
      }
      if (isRetryableError(e) || isHardQuotaError(e)) {
        throw new Error(friendlyCapacityMessage(e, [modelName]), { cause: e });
      }
      throw e;
    }
  },
};
