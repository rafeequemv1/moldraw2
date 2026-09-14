/**
 * Structured chat session memory (goals, plan, tools, prefs, canvas fingerprint).
 * Persisted by the App (localStorage / IndexedDB); formatted into the LLM blot.
 */
import type { CanvasPreambleFingerprint } from './canvasPreamble';
import type { DiagramLayoutMode } from './diagramLayoutEnforce';
import type { ChatMessage } from './types';

function memoryLineFromMessage(m: ChatMessage): string | null {
  if (m.role === 'user') {
    const t = m.content.trim();
    const nImg = m.attachments?.length ?? 0;
    const imgNote = nImg > 0 ? ` [${nImg} image${nImg > 1 ? 's' : ''}]` : '';
    if (!t && !nImg) return null;
    const body = t
      ? t.length > 160
        ? `${t.slice(0, 159)}…`
        : t
      : 'Image attachment';
    return `User: ${body}${imgNote}`;
  }
  if (m.role === 'tool') {
    const label = m.toolName ? m.toolName.replace(/^command\./, '') : 'tool';
    const ok = m.toolOk === false ? 'failed' : 'ok';
    return `Tool ${label}: ${ok}`;
  }
  if (m.role === 'assistant') {
    const t = m.content.trim();
    if (!t) return null;
    const first = t.split(/\n/)[0] ?? t;
    return `Assistant: ${first.length > 120 ? `${first.slice(0, 119)}…` : first}`;
  }
  return null;
}

/** Fold older messages into a short rolling notes string (local only — no LLM). */
export function foldMessagesIntoMemory(prevMemory: string, older: ChatMessage[]): string {
  const lines: string[] = [];
  if (prevMemory.trim()) lines.push(prevMemory.trim());
  for (const m of older) {
    const line = memoryLineFromMessage(m);
    if (line) lines.push(line);
  }
  const joined = lines.join('\n');
  const maxChars = 1800;
  if (joined.length <= maxChars) return joined;
  return joined.slice(joined.length - maxChars);
}

export interface SessionToolMemoryEntry {
  name: string;
  ok: boolean;
  at: number;
  /** Short UI-facing summary, not full JSON. */
  summary?: string;
}

export interface StructuredSessionMemory {
  version: 1;
  goals: string[];
  pendingPlan: string | null;
  lastTools: SessionToolMemoryEntry[];
  prefs: {
    diagramLayoutMode?: DiagramLayoutMode;
  };
  /** Last known canvas fingerprint (updated each turn). */
  canvas?: CanvasPreambleFingerprint;
  /** Folded older-turn lines (legacy blot body). */
  foldNotes: string;
  updatedAt: number;
}

export function createEmptySessionMemory(): StructuredSessionMemory {
  return {
    version: 1,
    goals: [],
    pendingPlan: null,
    lastTools: [],
    prefs: {},
    foldNotes: '',
    updatedAt: Date.now(),
  };
}

/** Accept structured object or legacy plain-string memory from localStorage. */
export function normalizeSessionMemory(
  raw: StructuredSessionMemory | string | null | undefined,
): StructuredSessionMemory {
  if (raw == null || raw === '') return createEmptySessionMemory();
  if (typeof raw === 'string') {
    return { ...createEmptySessionMemory(), foldNotes: raw.trim(), updatedAt: Date.now() };
  }
  if (typeof raw !== 'object' || raw.version !== 1) {
    return createEmptySessionMemory();
  }
  return {
    version: 1,
    goals: Array.isArray(raw.goals)
      ? raw.goals.filter((g): g is string => typeof g === 'string').slice(-8)
      : [],
    pendingPlan: typeof raw.pendingPlan === 'string' ? raw.pendingPlan : null,
    lastTools: Array.isArray(raw.lastTools)
      ? raw.lastTools
          .filter(
            (t): t is SessionToolMemoryEntry =>
              !!t && typeof t === 'object' && typeof t.name === 'string',
          )
          .slice(-12)
      : [],
    prefs: {
      diagramLayoutMode:
        raw.prefs?.diagramLayoutMode === 'glassware' ||
        raw.prefs?.diagramLayoutMode === 'scheme' ||
        raw.prefs?.diagramLayoutMode === 'both'
          ? raw.prefs.diagramLayoutMode
          : undefined,
    },
    canvas: raw.canvas && typeof raw.canvas === 'object' ? raw.canvas : undefined,
    foldNotes: typeof raw.foldNotes === 'string' ? raw.foldNotes : '',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

/** Text blot for Gemini history (not shown as a chat bubble). */
export function formatSessionMemoryForLlm(mem: StructuredSessionMemory): string {
  const parts: string[] = [];
  if (mem.goals.length > 0) {
    parts.push(`Goals: ${mem.goals.slice(-5).join(' · ')}`);
  }
  if (mem.pendingPlan) {
    parts.push(`Pending plan:\n${mem.pendingPlan}`);
  }
  if (mem.lastTools.length > 0) {
    const tools = mem.lastTools
      .slice(-8)
      .map(t => `${t.name.replace(/^command\./, '')}(${t.ok ? 'ok' : 'fail'})`)
      .join(', ');
    parts.push(`Last tools: ${tools}`);
  }
  if (mem.prefs.diagramLayoutMode) {
    parts.push(`Prefs: diagram=${mem.prefs.diagramLayoutMode}`);
  }
  if (mem.canvas && (mem.canvas.atomCount > 0 || mem.canvas.moleculeCount > 0)) {
    const smiles =
      mem.canvas.smiles.length > 0
        ? `; SMILES ${mem.canvas.smiles.slice(0, 6).join(' | ')}`
        : '';
    parts.push(
      `Last canvas: ${mem.canvas.moleculeCount} mol(s), ${mem.canvas.atomCount} atoms${smiles}`,
    );
  }
  if (mem.foldNotes.trim()) {
    parts.push(`Earlier turns:\n${mem.foldNotes.trim()}`);
  }
  return parts.join('\n\n');
}

function looksLikePendingPlan(assistantText: string): boolean {
  const t = assistantText.trim();
  if (!t) return false;
  if (/draw this on the canvas\?/i.test(t)) return true;
  if (/^\s*\d+[.)]/m.test(t)) return true;
  if (/\n\s*\d+[.)]\s+/m.test(t) && t.length > 80) return true;
  return false;
}

function softGoalFromUser(userText: string): string | null {
  const t = userText.trim();
  if (!t) return null;
  const goalMatch = t.match(/\bgoals?\s*:\s*(.+)/i);
  if (goalMatch?.[1]) return goalMatch[1].trim().slice(0, 200);
  if (/^(draw|build|make|synthesize|add|import|create|prepare|design)\b/i.test(t)) {
    return t.slice(0, 160);
  }
  return null;
}

/**
 * Fold overflow turns + refresh goals / plan / tools / prefs / canvas after a chat turn.
 */
export function updateSessionMemoryAfterTurn(
  prev: StructuredSessionMemory | string | null | undefined,
  opts: {
    overflow?: ChatMessage[];
    userText: string;
    assistantText: string;
    toolMessages: ChatMessage[];
    diagramLayoutMode?: DiagramLayoutMode;
    canvas?: CanvasPreambleFingerprint;
  },
): StructuredSessionMemory {
  const base = normalizeSessionMemory(prev);
  let foldNotes = base.foldNotes;
  if (opts.overflow?.length) {
    foldNotes = foldMessagesIntoMemory(foldNotes, opts.overflow);
  }

  const goals = [...base.goals];
  const soft = softGoalFromUser(opts.userText);
  if (soft && goals[goals.length - 1] !== soft) {
    goals.push(soft);
  }
  while (goals.length > 8) goals.shift();

  const toolsThisTurn = opts.toolMessages.filter(m => m.role === 'tool');
  let pendingPlan = base.pendingPlan;
  if (toolsThisTurn.length > 0) {
    pendingPlan = null;
  } else if (looksLikePendingPlan(opts.assistantText)) {
    pendingPlan = opts.assistantText.trim().slice(0, 600);
  }

  const lastTools = [
    ...base.lastTools,
    ...toolsThisTurn.map(m => ({
      name: m.toolName ?? 'tool',
      ok: m.toolOk !== false,
      at: Date.now(),
      summary: (m.content || '').slice(0, 80) || undefined,
    })),
  ].slice(-12);

  return {
    version: 1,
    goals,
    pendingPlan,
    lastTools,
    prefs: {
      ...base.prefs,
      ...(opts.diagramLayoutMode ? { diagramLayoutMode: opts.diagramLayoutMode } : {}),
    },
    canvas: opts.canvas ?? base.canvas,
    foldNotes,
    updatedAt: Date.now(),
  };
}
