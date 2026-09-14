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
export interface MoleculeCommand<I, X = void> {
  /** Stable string id, e.g. `'molecule.addAtom'`. */
  readonly id: string;
  /** Short human/agent-facing description. */
  readonly description: string;
  /** Zod schema validated before `apply` runs. */
  readonly inputSchema: ZodType<I>;
  /** Pure transition: snapshot in, next snapshot out (+ optional extras). */
  apply(prev: Molecule, input: I): { next: Molecule; extra?: X };
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
    code: 'UNKNOWN_COMMAND' | 'VALIDATION' | 'EXECUTION';
    message: string;
    details?: unknown;
  };
}

export type CommandResult<X = unknown> = CommandSuccess<X> | CommandFailure;
