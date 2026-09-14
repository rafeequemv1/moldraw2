/**
 * MCP resources — read-only views of the session an agent can attach to
 * context without spending a tool call (`moldraw://…`).
 */
import { buildCanvasStateSnapshot, moleculeToMolblock } from '@moldraw/core';
import { moleculeToSmiles } from '@moldraw/engine';
import {
  defaultHeadlessDisplayPrefs,
  renderMoleculeSvgHeadless,
} from '@moldraw/canvas/export/renderMoleculeSvgHeadless';
import {
  AMINO_ACID_TEMPLATES,
  FUNCTIONAL_GROUP_TEMPLATES,
  LIGAND_TEMPLATES,
} from '@moldraw/templates';
import type { MoldrawSession } from '../session/types';

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  title?: string;
  description: string;
  mimeType: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export const MCP_RESOURCES: readonly McpResourceDescriptor[] = [
  {
    uri: 'moldraw://molecule.json',
    name: 'molecule.json',
    title: 'Current molecule (JSON)',
    description: 'Full Moldraw molecule document: atoms, bonds, annotations, arrows, brackets.',
    mimeType: 'application/json',
  },
  {
    uri: 'moldraw://molecule.mol',
    name: 'molecule.mol',
    title: 'Current molecule (V2000 molblock)',
    description: 'MDL molfile (V2000) of the current document.',
    mimeType: 'chemical/x-mdl-molfile',
  },
  {
    uri: 'moldraw://molecule.smiles',
    name: 'molecule.smiles',
    title: 'Current molecule (SMILES)',
    description: 'Isomeric SMILES (one line per disconnected fragment, joined with ".").',
    mimeType: 'text/plain',
  },
  {
    uri: 'moldraw://molecule.svg',
    name: 'molecule.svg',
    title: 'Current canvas (SVG)',
    description: 'Headless SVG rendering of the whole canvas (800 px wide, white background).',
    mimeType: 'image/svg+xml',
  },
  {
    uri: 'moldraw://canvas-state.json',
    name: 'canvas-state.json',
    title: 'Canvas state snapshot',
    description: 'Per-fragment summary (atom ids, formula, SMILES, bounds) — same payload as molecule.get_canvas_state.',
    mimeType: 'application/json',
  },
  {
    uri: 'moldraw://selection.json',
    name: 'selection.json',
    title: 'Current selection',
    description: 'Selected atom / bond / annotation ids plus revision.',
    mimeType: 'application/json',
  },
  {
    uri: 'moldraw://templates/amino-acids.json',
    name: 'amino-acids.json',
    title: 'Amino-acid templates',
    description: 'Codes, names and SMILES for the built-in amino-acid library (use with command.molecule.placeAminoAcid / draw.smiles).',
    mimeType: 'application/json',
  },
  {
    uri: 'moldraw://templates/functional-groups.json',
    name: 'functional-groups.json',
    title: 'Functional-group templates',
    description: 'Ids, labels and SMILES for the built-in functional-group library.',
    mimeType: 'application/json',
  },
  {
    uri: 'moldraw://templates/ligands.json',
    name: 'ligands.json',
    title: 'Ligand templates',
    description: 'Coordination-chemistry ligand library (ids, names, SMILES, denticity).',
    mimeType: 'application/json',
  },
];

export function readMcpResource(session: MoldrawSession, uri: string): McpResourceContent | null {
  const desc = MCP_RESOURCES.find(r => r.uri === uri);
  if (!desc) return null;
  const mol = session.store.getMolecule();
  const state = session.getState();
  const text = ((): string => {
    switch (uri) {
      case 'moldraw://molecule.json':
        return JSON.stringify({ revision: state.revision, molecule: mol }, null, 2);
      case 'moldraw://molecule.mol':
        return moleculeToMolblock(mol);
      case 'moldraw://molecule.smiles':
        return moleculeToSmiles(mol);
      case 'moldraw://molecule.svg': {
        const r = renderMoleculeSvgHeadless({
          molecule: mol,
          width: 800,
          background: 'white',
          displayPrefs: defaultHeadlessDisplayPrefs(session.ctx.bondLengthPx),
        });
        return r?.svg ?? '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
      }
      case 'moldraw://canvas-state.json':
        return JSON.stringify(
          { revision: state.revision, ...buildCanvasStateSnapshot(mol, { includeCoords: false, includeSmiles: true, includeAnnotations: true }) },
          null,
          2,
        );
      case 'moldraw://selection.json':
        return JSON.stringify({ revision: state.revision, selection: state.selection }, null, 2);
      case 'moldraw://templates/amino-acids.json':
        return JSON.stringify(AMINO_ACID_TEMPLATES, null, 2);
      case 'moldraw://templates/functional-groups.json':
        return JSON.stringify(FUNCTIONAL_GROUP_TEMPLATES, null, 2);
      case 'moldraw://templates/ligands.json':
        return JSON.stringify(LIGAND_TEMPLATES, null, 2);
      default:
        return '';
    }
  })();
  return { uri, mimeType: desc.mimeType, text };
}
