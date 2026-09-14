import type { ZodType } from 'zod';
import type { Molecule } from '@moldraw/domain';

/**
 * One named, validated, replay-safe action that mutates the document molecule.
 *
 * Commands are the single source of truth for *every* user-visible mutation:
 *  - Canvas tools dispatch them via `executeCommand` so undo/redo and AI tooling
 *    see the same effects.
 *  - The AI/MCP layer (`src/ai/registry.ts`) wraps them so external agents can
 *    drive the editor with the same semantics as a user click.
 *
 * `apply` returns the next molecule (or `prev` unchanged if the input is
 * rejected by valency / overlap / not-found rules — same fail-silent behaviour
 * the existing `Mut.*` mutations have).
 *
 * `extra` is an optional sidecar payload returned alongside the next molecule
 * when the caller needs more than just the molecule (e.g. the new ids of
 * duplicated atoms so they can be auto-selected).
 */
/**
 * Who should see a command in tool catalogues.
 *  - `core`      — everyday chemistry drawing; in the default MCP toolset.
 *  - `advanced`  — legitimate but niche (arrays, perspective, outline, styling).
 *  - `internal`  — canvas-tool plumbing / engine round-trips (molblock results,
 *                  preview state, marquee translate). Hidden unless `full`.
 */
export type CommandVisibility = 'core' | 'advanced' | 'internal';

export interface MoleculeCommand<I, X = void> {
  /** Stable string id, e.g. `'molecule.addAtom'`. */
  readonly id: string;
  /** Short human/agent-facing description. */
  readonly description: string;
  /** Zod schema validated before `apply` runs. */
  readonly inputSchema: ZodType<I>;
  /** Pure transition: snapshot in, next snapshot out (+ optional extras). */
  apply(prev: Molecule, input: I): { next: Molecule; extra?: X };
  /** Catalogue visibility (defaults to `core` when omitted; see `commandMeta.ts`). */
  readonly visibility?: CommandVisibility;
  /** True when the command removes content (atoms, bonds, annotations). */
  readonly destructive?: boolean;
  /** True when re-applying the same input yields the same document. */
  readonly idempotent?: boolean;
  /** Free-form grouping tags (`atoms`, `bonds`, `rings`, `reactions`, `annotations`, …). */
  readonly tags?: readonly string[];
  /**
   * `strict` (default): every `atomId(s)` / `bondId(s)` style reference in the
   * input must exist in the molecule or the command fails with `NOT_FOUND`.
   * `lenient`: inputs may carry ids that are not yet in the document.
   */
  readonly references?: 'strict' | 'lenient';
}

export type AnyMoleculeCommand = MoleculeCommand<unknown, unknown>;

export interface CommandSuccess<X = unknown> {
  ok: true;
  next: Molecule;
  extra?: X;
}

export interface CommandFailure {
  ok: false;
  error: {
    code: 'UNKNOWN_COMMAND' | 'VALIDATION' | 'NOT_FOUND' | 'EXECUTION';
    message: string;
    details?: unknown;
  };
}

export type CommandResult<X = unknown> = CommandSuccess<X> | CommandFailure;

/**
 * Throw from `apply` to fail with a specific code instead of the generic
 * `EXECUTION` (used by `molecule.transaction` to surface a step's own error).
 */
export class CommandFailureError extends Error {
  readonly code: CommandFailure['error']['code'];
  readonly details?: unknown;
  constructor(code: CommandFailure['error']['code'], message: string, details?: unknown) {
    super(message);
    this.name = 'CommandFailureError';
    this.code = code;
    this.details = details;
  }
}
