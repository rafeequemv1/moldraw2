/**
 * Local intent router — pick a small tool subset per user message (no extra LLM call).
 * Industry-style: classify first, then expose only relevant tools.
 */

export type ChatIntent =
  | 'read'
  | 'draw'
  | 'import'
  | 'scheme'
  | 'edit'
  | 'chemistry'
  | 'meta'
  | 'general';

/** Always useful for grounded edits. */
const CORE_READ = [
  'molecule.get_canvas_state',
  'molecule.stats',
  'molecule.get_selection',
] as const;

const INTENT_TOOL_IDS: Record<ChatIntent, readonly string[]> = {
  read: [
    ...CORE_READ,
    'molecule.get_structure',
    'molecule.find_rings',
    'molecule.find_substructure',
    'molecule.list_annotations',
    'molecule.export_smiles',
    'molecule.export_molblock',
    'molecule.render',
    'molecule.predict_nmr',
    'molecule.predict_mass_spectrum',
    'molecule.predict_uv',
  ],
  draw: [
    ...CORE_READ,
    'command.molecule.addRing',
    'command.molecule.addBoatRing',
    'command.molecule.addChairRing',
    'command.molecule.addChain',
    'command.molecule.addAtom',
    'command.molecule.addBond',
    'command.molecule.clearAll',
    // Named compounds often arrive as "add X" — keep import available as a safety net.
    'command.molecule.importSmiles',
    'molecule.place_molecules',
    'molecule.place_resonance_forms',
    'molecule.place_template',
    'molecule.list_glassware',
    'molecule.place_glassware',
    'molecule.build_lab_manual',
    'command.molecule.addReactionArrow',
    'command.molecule.updateReactionArrow',
    'command.molecule.deleteReactionArrow',
    'command.molecule.addCanvasShape',
    'command.molecule.updateCanvasShape',
    'command.molecule.deleteCanvasShape',
    'command.molecule.addCanvasText',
    'command.molecule.addStroke',
    'command.molecule.deleteStroke',
    'command.molecule.addSruBracket',
    'command.molecule.updateSruBracket',
    'command.molecule.deleteSruBracket',
    'command.molecule.addCanvasImage',
    'command.molecule.updateCanvasImage',
    'command.molecule.deleteCanvasImage',
  ],
  import: [
    ...CORE_READ,
    'command.molecule.importSmiles',
    'command.molecule.importMolblock',
    'command.molecule.pasteFragment',
    'molecule.place_molecules',
    'molecule.place_template',
    'command.molecule.clearAll',
  ],
  scheme: [
    ...CORE_READ,
    'molecule.build_reaction_scheme',
    'molecule.place_resonance_forms',
    'command.molecule.importSmiles',
    'molecule.place_molecules',
    'command.molecule.addReactionArrow',
    'command.molecule.updateReactionArrow',
    'command.molecule.deleteReactionArrow',
    'command.molecule.addReactionMultiStep',
    'molecule.list_glassware',
    'molecule.place_glassware',
    'molecule.build_lab_manual',
    'command.molecule.addCanvasShape',
    'command.molecule.addCanvasText',
    'command.molecule.clearAll',
  ],
  edit: [
    ...CORE_READ,
    'molecule.get_structure',
    'molecule.find_rings',
    'molecule.find_substructure',
    'molecule.set_selection',
    'molecule.move_fragment',
    'molecule.rotate_fragment',
    'molecule.align_fragments',
    'molecule.distribute_fragments',
    'molecule.duplicate_fragment',
    'molecule.delete_fragment',
    'molecule.replace_fragment',
    'command.molecule.importSmiles',
    'molecule.place_molecules',
    'molecule.color_rings',
    'molecule.color_selection',
    'molecule.color_by_element',
    'molecule.color_by_bond_order',
    'molecule.apply_display_style',
    'command.molecule.applySelectionDisplayStyle',
    'command.molecule.setStructureTheme',
    'molecule.paint_rings',
    'command.molecule.updateAtomElement',
    'command.molecule.updateAtomCharge',
    'command.molecule.updateAtomLonePairs',
    'command.molecule.setAtomAlias',
    'command.molecule.setAtomIsotope',
    'command.molecule.invertStereoAtAtom',
    'command.molecule.flipBondEndpoints',
    'command.molecule.swapAtomPositions',
    'command.molecule.updateBond',
    'command.molecule.addAtom',
    'command.molecule.addBond',
    'command.molecule.deleteBonds',
    'command.molecule.moveAtoms',
    'command.molecule.rotateAtoms',
    'command.molecule.reflectAtoms',
    'command.molecule.deleteSelection',
    'command.molecule.deleteAtoms',
    'command.molecule.addCanvasText',
    'command.molecule.updateCanvasText',
    'command.molecule.deleteCanvasText',
    'command.molecule.updateReactionArrow',
    'command.molecule.deleteReactionArrow',
    'command.molecule.addSruBracket',
    'command.molecule.updateSruBracket',
    'command.molecule.deleteSruBracket',
    'command.molecule.addStroke',
    'command.molecule.deleteStroke',
    'command.molecule.updateCanvasImage',
    'command.molecule.deleteCanvasImage',
    'command.molecule.applySelectionColor',
    'command.molecule.clearSelectionColors',
    'command.molecule.applyRingFill',
    'command.molecule.clearAll',
    'molecule.undo',
    'molecule.redo',
  ],
  chemistry: [
    ...CORE_READ,
    'molecule.predict_nmr',
    'molecule.predict_mass_spectrum',
    'molecule.predict_uv',
    'command.molecule.cleanup',
    'molecule.aromatize',
    'molecule.explicit_hydrogens',
    'molecule.check_structure',
    'molecule.cip_stereo',
    'molecule.automap',
    'molecule.rotate_perspective',
    'command.molecule.apply3DPose',
    'command.molecule.clear3DPose',
    'command.molecule.flatten3DPose',
    'command.molecule.rotate3DPose',
    'command.molecule.setPerspectiveDepthShading',
    'command.molecule.setPerspectiveDepthFade',
    'command.molecule.setPerspectiveDepthWedges',
    'command.molecule.setStructureTheme',
  ],
  meta: [...CORE_READ, 'molecule.undo', 'molecule.redo', 'molecule.set_selection'],
  general: [
    ...CORE_READ,
    'molecule.get_structure',
    'command.molecule.importSmiles',
    'command.molecule.importMolblock',
    'molecule.place_molecules',
    'molecule.replace_fragment',
    'molecule.delete_fragment',
    'command.molecule.updateAtomElement',
    'command.molecule.updateAtomLonePairs',
    'command.molecule.invertStereoAtAtom',
    'command.molecule.updateBond',
    'command.molecule.addRing',
    'command.molecule.flatten3DPose',
    'command.molecule.setStructureTheme',
    'molecule.build_reaction_scheme',
    'molecule.place_resonance_forms',
    'molecule.place_template',
    'molecule.list_glassware',
    'molecule.place_glassware',
    'molecule.build_lab_manual',
    'molecule.move_fragment',
    'command.molecule.addReactionArrow',
    'command.molecule.clearAll',
    'molecule.undo',
    'molecule.redo',
  ],
};

/** Canvas primitives — "add ring" stays draw, not import. */
const DRAW_PRIMITIVE_RE =
  /\b(ring|benzene|chair|boat|chain|bond|atom|atoms|label|labels|text|caption|annotation|arrow|arrows|hexagon|cyclohexane|phenyl|clear|canvas\s+text|pencil|stroke|sru|polymer|image|glassware|flask|flasks|beaker|condenser|funnel|rbf|reflux|apparatus|separatory|erlenmeyer|test\s*tube|dropping|claisen|dean[- ]?stark|lab\s*manual|soxhlet|schlenk|tlc|volumetric|graduated|column|bubbler|allihn|dimroth)\b/;

/** Lab apparatus / glassware diagrams (not chemical-name import). */
const GLASSWARE_DIAGRAM_RE =
  /\b(glassware|apparatus|reflux|distill|distillation|separatory|sep\s*funnel|erlenmeyer|round[- ]?bottom|rbf|liebig|condenser|büchner|buchner|filter\s*funnel|test\s*tube|lab\s*setup|lab\s*manual|mechanism\s*diagram|procedure\s*diagram|dropping\s*funnel|addition\s*funnel|three[- ]?neck|claisen|dean[- ]?stark|receiving\s*flask|still\s*head|graduated\s*cylinder|volumetric|chromatography\s*column|tlc|soxhlet|hirsch|schlenk|bubbler|allihn|dimroth|thermometer\s*adapter)\b/;

/** Affirmative follow-up after a proposed lab-manual plan. */
const CONFIRM_DRAW_RE =
  /^(yes|yep|yeah|ok|okay|sure|draw(\s+it)?|go\s+ahead|do\s+it|confirm|proceed|please\s+draw)(\s*[.!])?$/i;

/**
 * Common drug/compound names + frequent misspellings so "add testasterone"
 * routes to importSmiles instead of addCanvasText.
 */
const NAMED_COMPOUND_RE =
  /\b(aspirin|caffeine|testosterone|testasterone|testosteron|ibuprofen|paracetamol|acetaminophen|penicillin|morphine|nicotine|glucose|sucrose|cholesterol|dopamine|serotonin|adrenaline|epinephrine|naproxen|diclofenac|omeprazole|atorvastatin|metformin|amoxicillin|warfarin|cortisol|estradiol|progesterone|pyridine|furan|thiophene|aniline)\b/;

const IMPORT_VERB_RE = /\b(import|pubchem|smiles|load|fetch|look\s*up|search\s+for)\b/;

/** Strip polite wrappers: "please add X", "can you add X to the canvas". */
function normalizeUserRequest(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[?!.,]+$/g, '')
    .replace(/^(please\s+)+/g, '')
    .replace(/^(can\s+you|could\s+you|would\s+you)\s+/g, '')
    .replace(/\s+(please|thanks|thank\s+you)$/g, '')
    .replace(/\s+(to\s+the\s+canvas|on\s+the\s+canvas|here|now)$/g, '')
    .trim();
}

/**
 * "add testosterone" / "draw aspirin" / "put caffeine" → compound payload.
 * Returns null when the rest is a draw primitive or empty.
 */
function extractAddTarget(normalized: string): string | null {
  const m = normalized.match(
    /^(?:add|draw|import|put|place|get|load|fetch|make|create|insert)\s+(.+)$/,
  );
  if (!m?.[1]) return null;
  const rest = m[1].trim();
  if (!rest || DRAW_PRIMITIVE_RE.test(rest)) return null;
  if (/\b(reaction|scheme|pathway|synthesis|retrosynth|\d+\s*-?\s*step)\b/.test(rest)) {
    return null;
  }
  return rest;
}

function looksLikeCompoundQuery(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (/^\d{2,7}-\d{2}-\d$/.test(t)) return true; // CAS
  // SMILES-ish
  if (/[=#[\]@\\/]/.test(t) || /c1ccccc1/i.test(t)) return true;
  // Style / paint phrases are never compound names (“blue color in all rings”).
  if (/\b(color|colour|paint|fill|highlight|tint|rings?)\b/i.test(t)) return false;
  // Plain chemical name (allow mild typos / multi-word)
  if (/^[a-z][a-z0-9\s\-'.]{1,80}$/i.test(t) && !DRAW_PRIMITIVE_RE.test(t)) return true;
  return false;
}

/** Heuristic intent classify (local, no network). */
export function classifyChatIntent(
  text: string,
  opts?: { hasImages?: boolean },
): ChatIntent {
  const raw = text.trim().toLowerCase();
  if (!raw) return opts?.hasImages ? 'draw' : 'general';
  const t = normalizeUserRequest(raw);

  if (/\b(undo|redo)\b/.test(t) && !/\b(select|selection|fix|replace|change)\b/.test(t)) {
    return 'meta';
  }

  // Affirmative reply after a proposed lab-manual / apparatus plan → expose draw tools.
  if (CONFIRM_DRAW_RE.test(t) || CONFIRM_DRAW_RE.test(raw.trim())) {
    return 'draw';
  }

  // Stereo / lone pairs / bond flip — structure edits on existing atoms.
  if (
    /\b(lone\s*pairs?|invert\s*stereo|flip\s*(the\s+)?bond|swap\s+atoms?|wedge|dash\s*bond)\b/.test(
      t,
    )
  ) {
    return 'edit';
  }

  // 3D pose / flatten / perspective depth → chemistry tools.
  if (
    /\b(flatten|3d\s*clean|apply\s*3d|clear\s*3d|perspective|depth\s*(fade|shading|wedges?))\b/.test(
      t,
    )
  ) {
    return 'chemistry';
  }

  // Style → Theme (Default skeletal vs Simple ball-and-stick).
  if (
    /\b(ball[- ]?and[- ]?stick|ball[- ]?stick|skeletal\s*(look|theme|style)|structure\s*theme|simple\s*theme|default\s*theme)\b/.test(
      t,
    )
  ) {
    return 'edit';
  }

  // Molblock / paste fragment → import.
  if (/\b(molblock|paste\s+fragment|paste\s+structure)\b/.test(t)) {
    return 'import';
  }

  // Individual edits to existing canvas content (before import/draw routing).
  if (
    /\b(fix|correct|replace|change|swap|rename|relabel|wrong|mistaken|edit|modify|update|relocate)\b/.test(
      t,
    ) ||
    /\b(that|this|the)\s+(molecule|structure|compound|fragment|one)\b/.test(t) ||
    /\b(leftmost|rightmost|top[- ]?left|top[- ]?right|bottom[- ]?left|bottom[- ]?right)\b/.test(t) ||
    /\bmolecule\s*\d+\b/.test(t) ||
    /\b(change|turn|make)\b.+\b(into|to)\b/.test(t) ||
    /\b(sru|polymer\s*bracket|subscript)\b/.test(t)
  ) {
    return 'edit';
  }

  if (/\b(select|selection)\b/.test(t)) return 'meta';

  // Synthesis/procedure with glassware → scheme tools (includes build_lab_manual).
  if (
    GLASSWARE_DIAGRAM_RE.test(t) &&
    /\b(scheme|reaction|synthesis|synthesi[sz]e|procedure|steps?|lab\s*manual)\b/.test(t)
  ) {
    return 'scheme';
  }

  // Resonance contributors / electron-pushing diagrams → scheme tools (+ place_resonance_forms).
  if (
    /\b(resonance|resonant|contributors?|mesomer|mesomeric|electron[- ]?flow|electron[- ]?push|curly\s+arrows?|fish[- ]?hook|\u2194|↔)\b/.test(
      t,
    ) ||
    /\bresonance\s+structures?\b/.test(t)
  ) {
    return 'scheme';
  }

  if (
    /\b(scheme|reaction|multi[- ]?step|krebs|tca|pathway|retrosynth|synthesis|synthesi[sz]e)\b/.test(
      t,
    ) ||
    /\b\d+\s*-?\s*step\b/.test(t)
  ) {
    return 'scheme';
  }

  // Color / paint / rearrange existing structures — before “add X” import routing
  // (otherwise “add blue color in all rings” is misread as importing a compound named
  // “blue color in all rings” and color_rings is never exposed).
  // Also catch “make all oxygen red” / “make oxygens red colored” (no literal “color” word),
  // and font/thickness requests (“bigger labels”, “thicker bonds”).
  if (
    /\b(colou?r(?:ed|ing)?|paint(?:ed|ing)?|fill|highlight|tint|recolou?r)\b/.test(t) ||
    /\b(make|turn|set)\b.+\b(red|blue|green|orange|purple|yellow|black|pink|brown|grey|gray)\b/.test(
      t,
    ) ||
    /\b(oxygen|nitrogen|sulfur|sulphur|carbon|chlorine|bromine|fluorine|heteroatoms?)\b.+\b(red|blue|green|orange|purple|yellow|black)\b/.test(
      t,
    ) ||
    /\b(double|single|triple|aromatic|dative)\s+bonds?\b/.test(t) ||
    /\bbonds?\b.+\b(red|blue|green|orange|purple|yellow|black)\b/.test(t) ||
    /\b(font|label\s*size|font\s*size|\d+\s*pt)\b/.test(t) ||
    /\b(thicker|thinner|thickness|bond\s*width|bond\s*thick)\b/.test(t) ||
    /\b(bigger|smaller|larger)\b.+\b(label|labels|font|text|bond|bonds)\b/.test(t) ||
    /\b(label|labels|font|bond|bonds)\b.+\b(bigger|smaller|larger|thick|thin)\b/.test(t) ||
    /\b(opacit(?:y|ies)|transparent|transparency|fade|faded|see-?through|alpha)\b/.test(t) ||
    /\b(move|rotate|align|distribute|duplicate|delete|remove|erase|shift|reflect|mirror|flip)\b/.test(
      t,
    ) ||
    /\b(fragment|leftmost|rightmost|molecule\s*\d)\b/.test(t)
  ) {
    return 'edit';
  }

  // Named compounds (incl. misspellings) → import chemical structure, never canvas text.
  if (NAMED_COMPOUND_RE.test(t) || IMPORT_VERB_RE.test(t)) {
    return 'import';
  }

  const addTarget = extractAddTarget(t);
  if (addTarget && looksLikeCompoundQuery(addTarget)) {
    return 'import';
  }

  if (
    /\b(nmr|hnmr|cnmr|¹h|13c|mass\s*spec|mass\s*spectrum|uv[\s-]?vis|spectroscop|predict\s+uv|predict\s+nmr)\b/.test(
      t,
    )
  ) {
    return 'chemistry';
  }

  if (
    /\b(cleanup|clean\s*up|aromat|dearomat|hydrogen|cip|stereo|r\/s|check\s+structure|automap|valence|perspective)\b/.test(
      t,
    )
  ) {
    return 'chemistry';
  }

  if (
    /\b(stats|count|formula|mass|export|what('| i)?s on|describe|read|inspect|canvas\s+state|how many)\b/.test(
      t,
    ) &&
    !opts?.hasImages
  ) {
    return 'read';
  }

  // Explicit text/label / pencil / SRU / image annotation → draw.
  if (/\b(label|text|caption|annotation|pencil|stroke|sru|polymer|canvas\s*image)\b/.test(t)) {
    return 'draw';
  }

  // Apparatus / glassware diagrams → draw (place_glassware), not compound import.
  if (GLASSWARE_DIAGRAM_RE.test(t)) {
    return 'draw';
  }

  if (
    opts?.hasImages ||
    /\b(draw|add|place|make|create|insert|put|ring|benzene|chair|boat|chain|bond|atom|clear|image|screenshot|photo|picture|figure|redraw|recreate|transcribe)\b/.test(
      t,
    )
  ) {
    return 'draw';
  }

  return opts?.hasImages ? 'draw' : 'general';
}

export function toolIdsForIntent(intent: ChatIntent): readonly string[] {
  return INTENT_TOOL_IDS[intent] ?? INTENT_TOOL_IDS.general;
}

export function userRequestsCanvasEdit(
  text: string,
  opts?: { hasImages?: boolean },
): boolean {
  if (opts?.hasImages) return true;
  const intent = classifyChatIntent(text, opts);
  return intent !== 'read' && intent !== 'meta';
}
