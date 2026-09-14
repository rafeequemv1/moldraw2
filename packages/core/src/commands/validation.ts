/**
 * Shared, agent-friendly validation helpers for the command boundary.
 *
 * - `formatZodIssues` turns Zod issues into a flat, path-addressed list plus a
 *   one-line summary so LLM callers can self-correct without parsing Zod's
 *   nested `flatten()` shape.
 * - `findUnknownReferences` walks a parsed command input and reports every
 *   atom / bond id that does not exist in the molecule, so unknown ids fail
 *   loudly (`NOT_FOUND`) instead of silently no-op'ing.
 */
import type { Molecule } from '@moldraw/domain';
import type { ZodIssue } from 'zod';
import { isValidInstanceAtomId, isValidInstanceBondId } from '../molecule/instanceArrays';

export interface FormattedIssue {
  /** Dotted path into the input, e.g. `atom.element` or `atomIds.2`. */
  path: string;
  message: string;
  code: string;
  expected?: unknown;
  received?: unknown;
}

export interface FormattedValidationError {
  issues: FormattedIssue[];
  /** Human/agent one-liner: `atom.element: Unknown element symbol "Xx"; atom.x: Required`. */
  summary: string;
}

export function formatZodIssues(issues: readonly ZodIssue[]): FormattedValidationError {
  const out: FormattedIssue[] = issues.map(issue => {
    const rec = issue as ZodIssue & { expected?: unknown; received?: unknown };
    const formatted: FormattedIssue = {
      path: issue.path.length ? issue.path.map(String).join('.') : '(root)',
      message: issue.message,
      code: issue.code,
    };
    if (rec.expected !== undefined) formatted.expected = rec.expected;
    if (rec.received !== undefined) formatted.received = rec.received;
    return formatted;
  });
  const summary = out
    .slice(0, 6)
    .map(i => `${i.path}: ${i.message}`)
    .join('; ');
  return {
    issues: out,
    summary: out.length > 6 ? `${summary}; … (+${out.length - 6} more)` : summary,
  };
}

/** Input keys whose string value(s) must be existing atom ids. */
const ATOM_REF_KEYS = new Set([
  'atomId',
  'atomIds',
  'rootAtomId',
  'startAtomId',
  'targetAtomId',
  'existingAtomId',
  'fromAtomId',
  'toAtomId',
  'atomIdA',
  'atomIdB',
  'ringAtomIds',
  'coreAtomIds',
  'subsetAtomIds',
]);

/** Input keys whose string value(s) must be existing bond ids. */
const BOND_REF_KEYS = new Set(['bondId', 'bondIds', 'fusedBondId']);

/**
 * Commands whose inputs legitimately carry ids that are *not yet* in the
 * molecule (pasted / imported fragments, previews, selections that may be
 * stale) — reference checking is skipped for them.
 */
export const LENIENT_REFERENCE_COMMANDS: ReadonlySet<string> = new Set([
  'molecule.pasteFragment',
  'molecule.mergeSketch',
  'molecule.commitFragmentPlacement',
  'molecule.mergeImportedStructure',
  'molecule.replaceImportedStructure',
  'molecule.importMolblock',
  'molecule.replaceFromMolblock',
  'molecule.applyCleanupResult',
  'molecule.applyExplicitHydrogens',
  'molecule.aromatize',
  'molecule.cleanup',
  'molecule.insertDemoReaction',
  'molecule.insertDemoMechanism',
  'molecule.addReactionMultiStep',
  'molecule.erase',
  'molecule.deleteSelection',
  'molecule.translateMarqueeSelection',
  'molecule.applyCoordsTable',
  'molecule.applyAtomMaps',
]);

export interface UnknownReferences {
  unknownAtomIds: string[];
  unknownBondIds: string[];
  /** `path → id` pairs for precise error messages. */
  paths: { path: string; id: string; kind: 'atom' | 'bond' }[];
}

export function findUnknownReferences(mol: Molecule, input: unknown): UnknownReferences | null {
  if (!input || typeof input !== 'object') return null;
  let atomSet: Set<string> | null = null;
  let bondSet: Set<string> | null = null;
  const atomExists = (id: string): boolean => {
    atomSet ??= new Set(mol.atoms.map(a => a.id));
    return atomSet.has(id) || isValidInstanceAtomId(mol, id);
  };
  const bondExists = (id: string): boolean => {
    bondSet ??= new Set(mol.bonds.map(b => b.id));
    return bondSet.has(id) || isValidInstanceBondId(mol, id);
  };

  const unknownAtoms = new Set<string>();
  const unknownBonds = new Set<string>();
  const paths: UnknownReferences['paths'] = [];

  const check = (kind: 'atom' | 'bond', value: unknown, path: string): void => {
    if (typeof value === 'string') {
      const exists = kind === 'atom' ? atomExists(value) : bondExists(value);
      if (!exists) {
        (kind === 'atom' ? unknownAtoms : unknownBonds).add(value);
        paths.push({ path, id: value, kind });
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => check(kind, v, `${path}.${i}`));
    }
  };

  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 6 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i), depth + 1));
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (ATOM_REF_KEYS.has(key)) check('atom', value, childPath);
      else if (BOND_REF_KEYS.has(key)) check('bond', value, childPath);
      else if (value && typeof value === 'object') walk(value, childPath, depth + 1);
    }
  };
  walk(input, '', 0);

  if (!paths.length) return null;
  return {
    unknownAtomIds: [...unknownAtoms],
    unknownBondIds: [...unknownBonds],
    paths,
  };
}

export function describeUnknownReferences(refs: UnknownReferences): string {
  const parts: string[] = [];
  if (refs.unknownAtomIds.length) {
    parts.push(
      `unknown atom id${refs.unknownAtomIds.length > 1 ? 's' : ''} ${refs.unknownAtomIds
        .slice(0, 5)
        .map(id => `"${id}"`)
        .join(', ')}${refs.unknownAtomIds.length > 5 ? ', …' : ''}`,
    );
  }
  if (refs.unknownBondIds.length) {
    parts.push(
      `unknown bond id${refs.unknownBondIds.length > 1 ? 's' : ''} ${refs.unknownBondIds
        .slice(0, 5)
        .map(id => `"${id}"`)
        .join(', ')}${refs.unknownBondIds.length > 5 ? ', …' : ''}`,
    );
  }
  return `${parts.join('; ')} (use molecule.get_structure or molecule.get_canvas_state to list current ids)`;
}
