/**
 * MCP prompts — reusable workflows that teach an agent the recommended
 * tool sequence (draw → verify → fix) without it having to discover it.
 */
export interface McpPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface McpPromptDescriptor {
  name: string;
  title?: string;
  description: string;
  arguments: McpPromptArgument[];
}

export interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export const MCP_PROMPTS: readonly McpPromptDescriptor[] = [
  {
    name: 'draw-structure',
    title: 'Draw a structure',
    description: 'Draw a molecule from a name, SMILES or description, then verify it visually and chemically.',
    arguments: [
      { name: 'structure', description: 'Name, SMILES or plain-language description of what to draw.', required: true },
      { name: 'placement', description: '"replace" (default) or "add" to keep existing content.', required: false },
    ],
  },
  {
    name: 'verify-canvas',
    title: 'Verify the canvas',
    description: 'Inspect the current canvas (state, SMILES, SVG, structure check) and report problems.',
    arguments: [],
  },
  {
    name: 'build-reaction',
    title: 'Build a reaction scheme',
    description: 'Draw reactants → arrow → products with conditions text, laid out left to right.',
    arguments: [
      { name: 'reactants', description: 'SMILES or names, comma-separated.', required: true },
      { name: 'products', description: 'SMILES or names, comma-separated.', required: true },
      { name: 'conditions', description: 'Reagents / conditions above the arrow.', required: false },
    ],
  },
  {
    name: 'edit-structure',
    title: 'Edit the current structure',
    description: 'Make a targeted change to what is already drawn using ids from molecule.get_structure.',
    arguments: [{ name: 'change', description: 'What to change, e.g. "replace the OH on C3 with NH2".', required: true }],
  },
];

export function getMcpPromptMessages(
  name: string,
  args: Record<string, string | undefined>,
): McpPromptMessage[] | null {
  const text = (s: string): McpPromptMessage => ({ role: 'user', content: { type: 'text', text: s } });
  switch (name) {
    case 'draw-structure': {
      const placement = args.placement === 'add' ? 'add' : 'replace';
      return [
        text(
          [
            `Draw this on the Moldraw canvas: ${args.structure ?? '(missing)'}.`,
            '',
            'Workflow:',
            `1. If you know a SMILES, call draw.smiles with { smiles, placement: "${placement}" }. Prefer isomeric SMILES so stereo is drawn as wedges.`,
            '2. Otherwise build it with draw.ring / draw.chain / draw.atom / draw.bond (use the returned newAtomIds to attach the next piece), or molecule.batch for several steps at once.',
            '3. Verify: call molecule.get_canvas_state (formula, SMILES per fragment) and molecule.render (SVG) and compare with the intent.',
            '4. Fix with edit.atom / edit.bond / edit.delete, then run command.molecule.cleanup if the layout is crowded.',
            'Report the final SMILES and formula.',
          ].join('\n'),
        ),
      ];
    }
    case 'verify-canvas':
      return [
        text(
          [
            'Verify the current Moldraw canvas.',
            '1. molecule.get_canvas_state → list fragments with formula and SMILES.',
            '2. molecule.render → look at the SVG for overlapping atoms, missing wedges, misplaced labels.',
            '3. molecule.check_structure (or molecule.stats) → valency and chemistry issues.',
            'Summarise issues found and propose the exact edit.* / command.* calls that would fix them. Do not apply changes unless asked.',
          ].join('\n'),
        ),
      ];
    case 'build-reaction':
      return [
        text(
          [
            `Build a reaction scheme. Reactants: ${args.reactants ?? '(missing)'}. Products: ${args.products ?? '(missing)'}.${args.conditions ? ` Conditions: ${args.conditions}.` : ''}`,
            '1. Draw each reactant with draw.smiles { placement: "add" } — left to right; use molecule.get_canvas_state bounds to place the next fragment to the right (offsetX).',
            '2. Add a forward arrow with draw.arrow between reactants and products' + (args.conditions ? ', passing the conditions as `reagentAbove`.' : '.'),
            '3. Draw the products to the right of the arrow.',
            '4. Verify with molecule.render and adjust with command.molecule.translateAtoms / edit.* as needed.',
          ].join('\n'),
        ),
      ];
    case 'edit-structure':
      return [
        text(
          [
            `Edit the current structure: ${args.change ?? '(missing)'}.`,
            '1. molecule.get_structure → atom / bond ids with elements, neighbours and coordinates.',
            '2. Identify the target ids, then apply edit.atom / edit.bond / edit.delete / draw.atom (attachToAtomId) — or molecule.batch for an atomic multi-step change.',
            '3. Verify with molecule.get_canvas_state and molecule.render. Undo with molecule.undo if the result is wrong.',
          ].join('\n'),
        ),
      ];
    default:
      return null;
  }
}
