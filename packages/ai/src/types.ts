import type { Molecule } from '@moldraw/domain';
import type { MoleculeSelection } from '@moldraw/core';

export type ImportMergeMode = 'merge' | 'replace';

export type ImportPlacementKind = 'origin' | 'viewport_center';

export interface ImportMolblockOpts {
  mode?: ImportMergeMode;
  placement?: ImportPlacementKind;
  useViewportGrid?: boolean;
  compoundName?: string;
  /**
   * When false, skip pan/zoom-to-selection after import (batch placer focuses once).
   * Default true for single imports.
   */
  focus?: boolean;
  /** Start a new import grid at slot 0 (viewport-centered unless placeBesideExisting). */
  startFreshGrid?: boolean;
  /** With startFreshGrid: park the grid to the right of current canvas content. */
  placeBesideExisting?: boolean;
}

export interface ImportSmilesOpts extends ImportMolblockOpts {
  mode?: ImportMergeMode;
  /**
   * `auto` (default) — try PubChem then local worker (good for named compounds).
   * `local` — Indigo/native SMILES→2D only (no PubChem). Required for reaction schemes
   * so intermediates that are not in PubChem still draw from the model’s SMILES.
   */
  resolveVia?: 'auto' | 'local';
}

export type AiWorkerOk = { ok: true; data?: unknown };
export type AiWorkerFail = { ok: false; error?: string };
export type AiWorkerResult = AiWorkerOk | AiWorkerFail;

/**
 * Context handed to every AI/MCP tool handler.
 *
 * - `getMolecule` — read-only access to the current document.
 * - `applyCommand` — must delegate to `session.applyCommand` (MCP/HTTP) or the App session store.
 * - Selection / undo hooks — session kernel wires these to the store (not no-ops).
 * - Worker hooks — browser App uses workers; Node session uses `ChemistryEngine`.
 */
export interface AiExecutionContext {
  getMolecule: () => Molecule;

  applyCommand?: (
    commandId: string,
    input: unknown,
  ) => {
    ok: boolean;
    error?: { code: string; message: string; details?: unknown };
    extra?: unknown;
  };

  getSelection?: () => MoleculeSelection;
  setSelection?: (patch: Partial<MoleculeSelection>) => void;

  undo?: () => void;
  redo?: () => void;
  canUndo?: () => boolean;
  canRedo?: () => boolean;

  /** Native/Indigo CLEANUP on the current structure (in-app worker). */
  runCleanup?: () => Promise<{ ok: boolean; error?: string }>;

  runAromatize?: (mode: 'aromatize' | 'dearomatize') => Promise<AiWorkerResult>;
  runExplicitHydrogens?: (mode?: 'fold' | 'unfold' | 'auto') => Promise<AiWorkerResult>;
  runCheckStructure?: () => Promise<AiWorkerResult>;
  runAutomap?: () => Promise<AiWorkerResult>;
  runCipStereo?: () => Promise<AiWorkerResult>;
  exportSmiles?: () => Promise<AiWorkerResult>;

  importMolblock?: (
    molblock: string,
    opts?: ImportMolblockOpts,
  ) => Promise<{ ok: boolean; newAtomIds?: string[]; newBondIds?: string[]; error?: string }>;

  importSmiles?: (
    smiles: string,
    opts?: ImportSmilesOpts,
  ) => Promise<{ ok: boolean; newAtomIds?: string[]; newBondIds?: string[]; error?: string }>;

  bondLengthPx?: number;
  bondAngleSnapDeg?: number;
  viewport?: { x: number; y: number; zoom: number };
  windowWidth?: number;
  windowHeight?: number;
  nextGridSlot?: () => { col: number; row: number };
  /** Stable world center of grid slot (0,0) for a multi-import batch. */
  nextGridOrigin?: () => { x: number; y: number };

  /** Bring atoms into the visible canvas after an AI add / import. */
  focusAtoms?: (atomIds: string[]) => void;

  /** Chat UI preference for procedure diagrams (set per turn). */
  diagramLayoutMode?: 'glassware' | 'scheme' | 'both';
}

export type AiToolSuccess<T> = { ok: true; data: T };

export type AiToolError = {
  code:
    | 'UNKNOWN_TOOL'
    | 'UNKNOWN_COMMAND'
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'EXECUTION'
    | 'NO_DISPATCHER';
  message: string;
  details?: unknown;
};

export type AiToolFailure = { ok: false; error: AiToolError };

export type AiToolResult = AiToolSuccess<unknown> | AiToolFailure;

