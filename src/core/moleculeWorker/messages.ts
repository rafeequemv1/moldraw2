/**
 * Typed message contract between the App and the native molecule worker
 * (`workers/moleculeEngineWorker.ts`). Both sides import these types so
 * adding/removing a request can't drift.
 */

import type { CipStereoTags } from '@moldraw/engine-2d/indigo/cip';
import type { StructureCheckResult } from '@moldraw/engine-2d/indigo/check';
import type { IndigoConvertFormat } from '@moldraw/engine-2d/indigo/types';
import type { IndigoCalculatedProperties } from '@moldraw/engine-2d/indigo/calculate';
import type { IndigoDruglikeProperties } from '@moldraw/engine-2d/indigo/properties';
import type { AutomapMode } from '@moldraw/engine-2d/indigo/automap';
import type { RingConformationByIndex } from '@moldraw/domain';

// ─── Outgoing requests ───────────────────────────────────────────────────

export type MoleculeWorkerRequest =
  | { type: 'INIT'; id: string }
  | {
      type: 'CLEANUP';
      id: string;
      payload: {
        molBlock: string;
        bondLengthPx?: number;
        /** Prefer Indigo WASM layout when loaded (default true). */
        preferIndigo?: boolean;
        /** Soft Indigo clean2d (gentle tidy) instead of full layout. */
        mode?: 'layout' | 'clean2d';
        /** 0-based atom indices for clean2d selection (empty = whole mol soft-clean). */
        selectedAtomIndices?: number[];
        /**
         * Chair/boat locks by molblock atom index. Molfiles cannot carry
         * `ringConformations`; without this Indigo flattens them to hexagons.
         */
        ringConformationsByIndex?: RingConformationByIndex[];
      };
    }
  | { type: 'INIT_INDIGO'; id: string }
  | { type: 'GET_STEREO_TAGS'; id: string; payload: { molBlock: string } }
  | { type: 'GET_SMILES'; id: string; payload: { molBlock: string } }
  | {
      type: 'GET_REACTION_SMILES';
      id: string;
      payload: { reactMolBlock: string; prodMolBlock: string };
    }
  | {
      type: 'SMILES_TO_MOLBLOCK';
      id: string;
      payload: {
        smiles: string;
        /** Prefer Indigo layout when ready (default true). False → native generate2D only. */
        preferIndigo?: boolean;
      };
    }
  | { type: 'TEXT_TO_MOLBLOCK'; id: string; payload: { text: string } }
  /** ChemDraw CDXML text or CDX as base64 → molblock (Indigo). */
  | {
      type: 'CHEMDRAW_TO_MOLBLOCK';
      id: string;
      payload: { data: string; format: 'cdxml' | 'cdx' };
    }
  /** No-op passthrough: native imports already carry full stereo. */
  | { type: 'ENRICH_IMPORT_MOLBLOCK'; id: string; payload: { molBlock: string } }
  | {
      type: 'CONVERT';
      id: string;
      payload: {
        input: string;
        outputFormat: IndigoConvertFormat;
        /** Extra Indigo options (e.g. molfile-saving-mode: "3000"). */
        options?: Record<string, string>;
      };
    }
  | {
      type: 'CHECK_STRUCTURE';
      id: string;
      payload: { molBlock: string; types?: string };
    }
  | {
      type: 'AROMATIZE';
      id: string;
      payload: { molBlock: string; mode: 'aromatize' | 'dearomatize' };
    }
  | {
      type: 'CALCULATE_PROPERTIES';
      id: string;
      payload: { molBlock: string; selectedAtomIndices?: number[] };
    }
  | {
      type: 'AUTOMAP';
      id: string;
      payload: {
        /** Reaction SMILES (`A>>B`) or RXN file text. */
        input: string;
        mode?: AutomapMode;
        /** When set with prodMolBlock, builds an RXN from two molblocks. */
        reactMolBlock?: string;
        prodMolBlock?: string;
      };
    }
  /** Teaching demo: CBr + O → CO (laid-out molblocks for canvas insert). */
  | { type: 'AUTOMAP_DEMO'; id: string };

// ─── Incoming responses ──────────────────────────────────────────────────

export type MoleculeWorkerResponse =
  | { type: 'INIT_SUCCESS'; id: string }
  | { type: 'INIT_ERROR'; id: string; error: string }
  | {
      type: 'CLEANUP_SUCCESS';
      id: string;
      payload: { molBlock: string; source?: 'indigo' | 'native' };
    }
  | { type: 'CLEANUP_ERROR'; id: string; error: string }
  | { type: 'INIT_INDIGO_SUCCESS'; id: string; payload: { ready: boolean; version?: string } }
  | { type: 'INIT_INDIGO_ERROR'; id: string; error: string }
  | { type: 'GET_STEREO_TAGS_SUCCESS'; id: string; payload: { tags: CipStereoTags | null } }
  | { type: 'GET_STEREO_TAGS_ERROR'; id: string; error: string }
  | { type: 'GET_SMILES_SUCCESS'; id: string; payload: { smiles: string } }
  | { type: 'GET_SMILES_ERROR'; id: string; error: string }
  | { type: 'SMILES_TO_MOLBLOCK_SUCCESS'; id: string; payload: { molBlock: string } }
  | { type: 'SMILES_TO_MOLBLOCK_ERROR'; id: string; error: string }
  | { type: 'TEXT_TO_MOLBLOCK_SUCCESS'; id: string; payload: { molBlock: string } }
  | { type: 'TEXT_TO_MOLBLOCK_ERROR'; id: string; error: string }
  | { type: 'CHEMDRAW_TO_MOLBLOCK_SUCCESS'; id: string; payload: { molBlock: string } }
  | { type: 'CHEMDRAW_TO_MOLBLOCK_ERROR'; id: string; error: string }
  | { type: 'ENRICH_IMPORT_MOLBLOCK_SUCCESS'; id: string; payload: { molBlock: string } }
  | { type: 'CONVERT_SUCCESS'; id: string; payload: { output: string; format: IndigoConvertFormat } }
  | { type: 'CONVERT_ERROR'; id: string; error: string }
  | { type: 'CHECK_STRUCTURE_SUCCESS'; id: string; payload: StructureCheckResult }
  | { type: 'CHECK_STRUCTURE_ERROR'; id: string; error: string }
  | { type: 'AROMATIZE_SUCCESS'; id: string; payload: { molBlock: string; mode: 'aromatize' | 'dearomatize' } }
  | { type: 'AROMATIZE_ERROR'; id: string; error: string }
  | {
      type: 'CALCULATE_PROPERTIES_SUCCESS';
      id: string;
      payload: {
        calculated: IndigoCalculatedProperties | null;
        druglike: IndigoDruglikeProperties | null;
      };
    }
  | { type: 'CALCULATE_PROPERTIES_ERROR'; id: string; error: string }
  | {
      type: 'AUTOMAP_SUCCESS';
      id: string;
      payload: {
        maps: number[];
        mapsByComponent: number[][];
        rxnfile: string;
      };
    }
  | { type: 'AUTOMAP_ERROR'; id: string; error: string }
  | {
      type: 'AUTOMAP_DEMO_SUCCESS';
      id: string;
      payload: {
        reactMolBlock: string;
        prodMolBlock: string;
        /** Atom indices (0-based) in each molblock that should show a CH₃ alias. */
        reactMethylIndices?: number[];
        prodMethylIndices?: number[];
      };
    }
  | { type: 'AUTOMAP_DEMO_ERROR'; id: string; error: string };
