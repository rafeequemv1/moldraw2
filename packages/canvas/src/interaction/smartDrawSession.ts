/**
 * Host-owned Smart Draw stroke session.
 * The plugin never sees the idle timer — only a completed stroke group.
 */

export const SMART_DRAW_TOOL_ID = 'smart_draw';
/** Idle after the last stroke before the host commits the session. */
export const SMART_DRAW_IDLE_MS = 1200;

export type SmartDrawPoint = { x: number; y: number };
export type SmartDrawStroke = { points: SmartDrawPoint[] };

export interface SmartDrawSessionResult {
  sessionId: string;
  strokes: SmartDrawStroke[];
  bondLengthPx: number;
}

export function isSmartDrawTool(toolId: string): boolean {
  return toolId === SMART_DRAW_TOOL_ID;
}

const newSessionId = (): string =>
  `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface SmartDrawSessionOptions {
  idleMs?: number;
  getBondLengthPx: () => number;
  onComplete: (result: SmartDrawSessionResult) => void;
  onStrokesChange?: (strokes: SmartDrawStroke[]) => void;
}

export interface SmartDrawSession {
  addStroke(points: SmartDrawPoint[]): void;
  /** End the session and emit if any strokes were captured. */
  commit(): void;
  /** Drop buffered strokes without emitting. */
  discard(): void;
  getStrokes(): SmartDrawStroke[];
  getSessionId(): string;
  dispose(): void;
}

export function createSmartDrawSession(opts: SmartDrawSessionOptions): SmartDrawSession {
  const idleMs = opts.idleMs ?? SMART_DRAW_IDLE_MS;
  let sessionId = newSessionId();
  let strokes: SmartDrawStroke[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const notify = () => {
    opts.onStrokesChange?.(strokes);
  };

  const resetIdle = () => {
    clearTimer();
    if (strokes.length === 0) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, idleMs);
  };

  const flush = () => {
    clearTimer();
    if (strokes.length === 0) return;
    const result: SmartDrawSessionResult = {
      sessionId,
      strokes,
      bondLengthPx: opts.getBondLengthPx(),
    };
    strokes = [];
    sessionId = newSessionId();
    notify();
    opts.onComplete(result);
  };

  return {
    addStroke(points) {
      if (points.length < 2) {
        resetIdle();
        return;
      }
      strokes = [...strokes, { points: points.map(p => ({ x: p.x, y: p.y })) }];
      notify();
      resetIdle();
    },
    commit() {
      flush();
    },
    discard() {
      clearTimer();
      if (strokes.length === 0) return;
      strokes = [];
      sessionId = newSessionId();
      notify();
    },
    getStrokes() {
      return strokes;
    },
    getSessionId() {
      return sessionId;
    },
    dispose() {
      clearTimer();
    },
  };
}
