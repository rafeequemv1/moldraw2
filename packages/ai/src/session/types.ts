import type { Molecule } from '@moldraw/domain';
import type { MoleculeEditor, MoleculeSelection } from '@moldraw/core';
import type { AiExecutionContext } from '../types';

/** Typed session events — keep `type` from day one for later SSE sync. */
export type SessionEventType =
  | 'session.changed'
  | 'session.undo'
  | 'session.redo'
  | 'session.loaded'
  | 'session.persisted'
  /** Whole document replaced (App bridge sync, file load). */
  | 'session.document'
  /** Agent asked to bring atoms into view; carries `focus`. Does not change the revision. */
  | 'session.focus';

export interface SessionFocusTarget {
  atomIds: string[];
  /** World-space bounds of the atoms (canvas px), when they exist. */
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface SessionEvent {
  type: SessionEventType;
  revision: number;
  /** Opaque id of the client that caused the change (lets a bridge ignore its own echoes). */
  clientId?: string;
  focus?: SessionFocusTarget;
}

export interface SessionCommandSuccess {
  ok: true;
  revision: number;
  changed: boolean;
  extra?: unknown;
  molecule?: Molecule;
}

export interface SessionCommandFailure {
  ok: false;
  revision: number;
  changed: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type SessionCommandResult = SessionCommandSuccess | SessionCommandFailure;

export interface ApplyCommandOptions {
  /** Include the full molecule in the result (omit by default — use GET / reads). */
  includeMolecule?: boolean;
  /**
   * Optimistic concurrency: fail with `STALE_REVISION` (no change) when the
   * session revision differs. Use the revision from the last result / event.
   */
  expectedRevision?: number;
  /** Tag the resulting event with the caller's id (bridge echo suppression). */
  clientId?: string;
}

export type ApplyCommandArg =
  | string
  | {
      id: string;
      input?: unknown;
      includeMolecule?: boolean;
      expectedRevision?: number;
      clientId?: string;
    };

export interface MoldrawSessionState {
  revision: number;
  molecule: Molecule;
  selection: MoleculeSelection;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Independent session instance. App / MCP / HTTP each create their own.
 * No global singleton.
 */
export interface MoldrawSession {
  /** Public mutation entry. MCP, HTTP, and tools must use this — not `store.applyCommand`. */
  applyCommand(
    command: ApplyCommandArg,
    input?: unknown,
    opts?: ApplyCommandOptions,
  ): SessionCommandResult;
  store: MoleculeEditor;
  ctx: AiExecutionContext;
  subscribe: (listener: (event: SessionEvent) => void) => () => void;
  persist: () => void;
  get revision(): number;
  getState: () => MoldrawSessionState;
  undo: (opts?: ApplyCommandOptions) => SessionCommandResult;
  redo: (opts?: ApplyCommandOptions) => SessionCommandResult;
  setSelection: (patch: Partial<MoleculeSelection>, opts?: ApplyCommandOptions) => SessionCommandResult;
  /**
   * Replace the whole document (undoable). Used by the App bridge to push the
   * user's edits into the shared session; not exposed as an AI tool.
   */
  replaceDocument: (molecule: Molecule, opts?: ApplyCommandOptions) => SessionCommandResult;
  /** Emit a `session.focus` event (no revision change) so connected canvases scroll to `atomIds`. */
  focusAtoms: (atomIds: string[]) => void;
}

export interface CreateMoldrawSessionOptions {
  initialMolecule?: Molecule;
  initialSelection?: Partial<MoleculeSelection>;
  /** Called after a successful committed mutation (and undo/redo). */
  persist?: (molecule: Molecule, event: SessionEvent) => void;
  /** Node chemistry adapter. Defaults to `createNodeChemistryEngine()`. */
  engine?: import('./chemistryEngine').ChemistryEngine;
  bondLengthPx?: number;
  includeMoleculeByDefault?: boolean;
}
