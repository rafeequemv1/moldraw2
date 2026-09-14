/**
 * Self-test for AI read/recipe tools. Run:
 *   npx tsx --tsconfig tsconfig.app.json packages/ai/src/__tests__/parityTools.ts
 */
import { createMoleculeStore, CMD } from '@moldraw/core';
import { engine, perceiveRings } from '@moldraw/engine';
import { executeAiTool, listAiToolIds, listAiToolsByCategory } from '../index';

let passed = 0;
let failed = 0;

const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

console.log('AI parity tools\n');

{
  const ids = listAiToolIds();
  check('registry includes molecule.get_structure', ids.includes('molecule.get_structure'));
  check('registry includes molecule.get_canvas_state', ids.includes('molecule.get_canvas_state'));
  check('registry includes molecule.find_rings', ids.includes('molecule.find_rings'));
  check('registry includes molecule.color_rings', ids.includes('molecule.color_rings'));
  check('registry includes molecule.color_by_element', ids.includes('molecule.color_by_element'));
  check('registry includes molecule.apply_display_style', ids.includes('molecule.apply_display_style'));
  check('registry includes molecule.color_by_bond_order', ids.includes('molecule.color_by_bond_order'));
  check('registry includes molecule.move_fragment', ids.includes('molecule.move_fragment'));
  check('registry includes molecule.rotate_fragment', ids.includes('molecule.rotate_fragment'));
  check('registry includes molecule.paint_rings', ids.includes('molecule.paint_rings'));
  check('read category non-empty', listAiToolsByCategory('read').length >= 5);
  check('recipe category non-empty', listAiToolsByCategory('recipe').length >= 8);
}

const store = createMoleculeStore();
const benzene = engine.parseSmiles('c1ccccc1');
const laid = engine.generate2D(benzene);
store.applyCommand(CMD.MergeImportedStructure, {
  atoms: laid.atoms,
  bonds: laid.bonds,
});

const rings = perceiveRings(store.getMolecule());
check('benzene has 1 ring', rings.length === 1, rings.length);

const ctx = {
  getMolecule: () => store.getMolecule(),
  applyCommand: (id: string, input: unknown) => store.applyCommand(id, input),
  getSelection: () => store.getSelection(),
  setSelection: (p: Parameters<typeof store.setSelection>[0]) => store.setSelection(p),
  undo: () => store.undo(),
  redo: () => store.redo(),
  canUndo: () => store.canUndo(),
  canRedo: () => store.canRedo(),
};

const struct = await executeAiTool('molecule.get_structure', {}, ctx);
check('get_structure ok', struct.ok);
if (struct.ok) {
  const data = struct.data as { atoms: unknown[]; bonds: unknown[] };
  check('get_structure atoms 6', data.atoms.length === 6, data.atoms.length);
}

const fr = await executeAiTool('molecule.find_rings', {}, ctx);
check('find_rings ok', fr.ok);
if (fr.ok) {
  const data = fr.data as { ringCount: number };
  check('find_rings count 1', data.ringCount === 1, data);
}

const color = await executeAiTool(
  'molecule.color_rings',
  { color: '#3b82f6', opacity: 0.4 },
  ctx,
);
check('color_rings ok', color.ok, color.ok ? undefined : color);
if (color.ok) {
  const mol = store.getMolecule();
  const fillCount = Object.keys(mol.ringFills ?? {}).length;
  check('ring fills applied', fillCount >= 1, fillCount);
}

{
  const oStore = createMoleculeStore();
  const ethanol = engine.generate2D(engine.parseSmiles('CCO'));
  oStore.applyCommand(CMD.MergeImportedStructure, {
    atoms: ethanol.atoms,
    bonds: ethanol.bonds,
  });
  const oCtx = {
    getMolecule: () => oStore.getMolecule(),
    applyCommand: oStore.applyCommand.bind(oStore),
    setSelection: () => {},
  };
  const byEl = await executeAiTool(
    'molecule.color_by_element',
    { element: 'O', color: 'red' },
    oCtx,
  );
  check('color_by_element ok', byEl.ok, byEl.ok ? undefined : byEl);
  if (byEl.ok) {
    const oxygens = oStore.getMolecule().atoms.filter(a => a.element === 'O');
    check('oxygen painted red', oxygens.every(a => a.color === '#dc2626'), oxygens.map(a => a.color));
  }

  const style = await executeAiTool(
    'molecule.apply_display_style',
    { all: true, labelFontSizePt: 18, bondThicknessPx: 4, opacity: 0.5 },
    oCtx,
  );
  check('apply_display_style ok', style.ok, style.ok ? undefined : style);
  if (style.ok) {
    const m = oStore.getMolecule();
    check(
      'label font overrides',
      m.atoms.every(a => a.labelFontSizePt === 18),
      m.atoms.map(a => a.labelFontSizePt),
    );
    check(
      'bond thickness overrides',
      m.bonds.every(b => b.thicknessPx === 4),
      m.bonds.map(b => b.thicknessPx),
    );
    check(
      'opacity overrides',
      m.atoms.every(a => a.opacity === 0.5) && m.bonds.every(b => b.opacity === 0.5),
      { atoms: m.atoms.map(a => a.opacity), bonds: m.bonds.map(b => b.opacity) },
    );
  }

  const ketoneStore = createMoleculeStore();
  const acetone = engine.generate2D(engine.parseSmiles('CC(=O)C'));
  ketoneStore.applyCommand(CMD.MergeImportedStructure, {
    atoms: acetone.atoms,
    bonds: acetone.bonds,
  });
  const ketoneCtx = {
    getMolecule: () => ketoneStore.getMolecule(),
    applyCommand: ketoneStore.applyCommand.bind(ketoneStore),
    setSelection: () => {},
  };
  const doubles = await executeAiTool(
    'molecule.color_by_bond_order',
    { bondOrder: 'double', color: 'blue' },
    ketoneCtx,
  );
  check('color_by_bond_order ok', doubles.ok, doubles.ok ? undefined : doubles);
  if (doubles.ok) {
    const m = ketoneStore.getMolecule();
    const dbl = m.bonds.filter(b => b.order === 2 && !b.aromatic);
    check('double bonds painted blue', dbl.length >= 1 && dbl.every(b => b.color === '#2563eb'), {
      count: dbl.length,
      colors: dbl.map(b => b.color),
    });
  }
}

// --- canvas state: benzene (left) + ethanol (right) ---
{
  const multi = createMoleculeStore();
  const bz = engine.generate2D(engine.parseSmiles('c1ccccc1'));
  multi.applyCommand(CMD.MergeImportedStructure, { atoms: bz.atoms, bonds: bz.bonds });

  const et = engine.generate2D(engine.parseSmiles('CCO'));
  const offsetX = 200;
  multi.applyCommand(CMD.MergeImportedStructure, {
    atoms: et.atoms.map(a => ({ ...a, x: a.x + offsetX })),
    bonds: et.bonds,
  });

  const multiCtx = {
    getMolecule: () => multi.getMolecule(),
    applyCommand: (id: string, input: unknown) => multi.applyCommand(id, input),
    getSelection: () => multi.getSelection(),
  };

  const stats = await executeAiTool('molecule.stats', {}, multiCtx);
  check('stats ok', stats.ok);
  if (stats.ok) {
    const data = stats.data as { moleculeCount: number };
    check('stats moleculeCount 2', data.moleculeCount === 2, data);
  }

  const canvas = await executeAiTool('molecule.get_canvas_state', {}, multiCtx);
  check('get_canvas_state ok', canvas.ok, canvas.ok ? undefined : canvas);
  if (canvas.ok) {
    const data = canvas.data as {
      summary: {
        moleculeCount: number;
        documentSmiles?: string;
        reactionSmiles?: string | null;
      };
      molecules: Array<{
        index: number;
        smiles?: string;
        atomIds: string[];
        bbox: { cx: number; cy: number };
        atoms?: Array<{ id: string; x: number; y: number }>;
      }>;
      selection: { atomIds: string[] };
    };
    check('canvas moleculeCount 2', data.summary.moleculeCount === 2, data.summary);
    check('canvas molecules length 2', data.molecules.length === 2, data.molecules.length);
    check(
      'canvas ordered left-to-right',
      data.molecules[0]!.bbox.cx < data.molecules[1]!.bbox.cx,
      data.molecules.map(m => m.bbox.cx),
    );
    check(
      'canvas left SMILES present',
      typeof data.molecules[0]!.smiles === 'string' && data.molecules[0]!.smiles!.length > 0,
      data.molecules[0]?.smiles,
    );
    check(
      'canvas right SMILES present',
      typeof data.molecules[1]!.smiles === 'string' && data.molecules[1]!.smiles!.length > 0,
      data.molecules[1]?.smiles,
    );
    check(
      'canvas distinct SMILES',
      data.molecules[0]!.smiles !== data.molecules[1]!.smiles,
      [data.molecules[0]?.smiles, data.molecules[1]?.smiles],
    );
    check(
      'canvas atom coords present',
      Array.isArray(data.molecules[0]!.atoms) && (data.molecules[0]!.atoms?.length ?? 0) >= 6,
      data.molecules[0]?.atoms?.length,
    );
    check('canvas atomIds present', data.molecules[0]!.atomIds.length >= 6);
    check('canvas has selection field', Array.isArray(data.selection.atomIds));
  }

  const beforeSnap = await executeAiTool(
    'molecule.get_canvas_state',
    { includeCoords: false },
    multiCtx,
  );
  const beforeCx = beforeSnap.ok
    ? (beforeSnap.data as { molecules: Array<{ bbox: { cx: number } }> }).molecules[0]!.bbox.cx
    : null;

  const moved = await executeAiTool(
    'molecule.move_fragment',
    { moleculeIndex: 0, dx: 50, dy: 0 },
    multiCtx,
  );
  check('move_fragment ok', moved.ok, moved.ok ? undefined : moved);
  if (moved.ok && beforeCx != null) {
    const after = await executeAiTool(
      'molecule.get_canvas_state',
      { includeCoords: false },
      multiCtx,
    );
    check('move_fragment ok snapshot', after.ok);
    if (after.ok) {
      const cx = (after.data as { molecules: Array<{ bbox: { cx: number } }> }).molecules[0]!
        .bbox.cx;
      check('move_fragment shifted ~50', Math.abs(cx - (beforeCx + 50)) < 1, { beforeCx, cx });
    }
  }

  const beforeRight = await executeAiTool(
    'molecule.get_canvas_state',
    { includeCoords: true },
    multiCtx,
  );
  const rotate = await executeAiTool(
    'molecule.rotate_fragment',
    { moleculeIndex: 1, degrees: 90 },
    multiCtx,
  );
  check('rotate_fragment ok', rotate.ok, rotate.ok ? undefined : rotate);
  if (rotate.ok && beforeRight.ok) {
    const beforeAtoms = (
      beforeRight.data as {
        molecules: Array<{ atoms?: Array<{ id: string; x: number; y: number }> }>;
      }
    ).molecules[1]!.atoms!;
    const afterRight = await executeAiTool(
      'molecule.get_canvas_state',
      { includeCoords: true },
      multiCtx,
    );
    if (afterRight.ok) {
      const afterAtoms = (
        afterRight.data as {
          molecules: Array<{ atoms?: Array<{ id: string; x: number; y: number }> }>;
        }
      ).molecules[1]!.atoms!;
      const changed = beforeAtoms.some((a, i) => {
        const b = afterAtoms.find(x => x.id === a.id) ?? afterAtoms[i];
        return b && (Math.abs(b.x - a.x) > 0.1 || Math.abs(b.y - a.y) > 0.1);
      });
      check('rotate_fragment changed coords', changed);
    }
  }

  const align = await executeAiTool(
    'molecule.align_fragments',
    { moleculeIndexes: [0, 1], mode: 'top' },
    multiCtx,
  );
  check('align_fragments ok', align.ok, align.ok ? undefined : align);
}

// --- paint_rings on benzene-only canvas ---
{
  const paintStore = createMoleculeStore();
  const bz = engine.generate2D(engine.parseSmiles('c1ccccc1'));
  paintStore.applyCommand(CMD.MergeImportedStructure, { atoms: bz.atoms, bonds: bz.bonds });
  const paintCtx = {
    getMolecule: () => paintStore.getMolecule(),
    applyCommand: (id: string, input: unknown) => paintStore.applyCommand(id, input),
  };
  const paint = await executeAiTool(
    'molecule.paint_rings',
    { color: '#ef4444', opacity: 0.3, moleculeIndex: 0 },
    paintCtx,
  );
  check('paint_rings ok', paint.ok, paint.ok ? undefined : paint);
  if (paint.ok) {
    const fillCount = Object.keys(paintStore.getMolecule().ringFills ?? {}).length;
    check('paint_rings filled', fillCount >= 1, fillCount);
  }
}

// --- reaction SMILES when arrow splits sides ---
{
  const rxn = createMoleculeStore();
  const left = engine.generate2D(engine.parseSmiles('CCO'));
  rxn.applyCommand(CMD.MergeImportedStructure, { atoms: left.atoms, bonds: left.bonds });
  const right = engine.generate2D(engine.parseSmiles('CC=O'));
  rxn.applyCommand(CMD.MergeImportedStructure, {
    atoms: right.atoms.map(a => ({ ...a, x: a.x + 250 })),
    bonds: right.bonds,
  });
  // Vertical arrow: half-plane split is left (reactants) vs right (products).
  rxn.applyCommand(CMD.AddReactionArrow, {
    arrow: {
      id: 'arr-test-1',
      x1: 125,
      y1: -40,
      x2: 125,
      y2: 40,
      kind: 'straight',
    },
  });

  const rxnCtx = {
    getMolecule: () => rxn.getMolecule(),
    applyCommand: (id: string, input: unknown) => rxn.applyCommand(id, input),
  };

  const canvas = await executeAiTool('molecule.get_canvas_state', {}, rxnCtx);
  check('reaction get_canvas_state ok', canvas.ok, canvas.ok ? undefined : canvas);
  if (canvas.ok) {
    const data = canvas.data as {
      summary: { reactionSmiles?: string | null; moleculeCount: number };
      molecules: Array<{ role?: string }>;
    };
    check(
      'reactionSmiles set',
      typeof data.summary.reactionSmiles === 'string' &&
        data.summary.reactionSmiles.includes('>>'),
      data.summary.reactionSmiles,
    );
    const roles = data.molecules.map(m => m.role).filter(Boolean);
    check(
      'reaction roles tagged',
      roles.includes('reactant') && roles.includes('product'),
      roles,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} AI parity checks failed`);
}
