/**
 * Molecule engine worker — Indigo 2D layout + CIP / convert / check / aromatize
 * + native parse/SMILES.
 *
 * 3D lives in `molecule3dWorker.ts` so Indigo WASM load/layout never blocks
 * progressive UFF / Calculate structure.
 */
import {
  engine,
  calculateCip,
  aromatizeMolecule,
  checkStructure,
  convertExplicitHydrogens,
  certifyLayout,
} from '@moldraw/engine';
import { resolveCleanupBondLength } from '@moldraw/core/io/localCleanup';
import { withRingConformationsByAtomIndex } from '@moldraw/domain';
import {
  cleanupPreferIndigo,
  layoutMoleculeIndigo,
  loadIndigo,
  getIndigoOrNull,
  indigoCalculateCip,
  indigoConvert,
  indigoInchiToMolblock,
  indigoChemDrawToMolblock,
  indigoCalculate,
  indigoDruglikeProperties,
  indigoAutomap,
  buildRxnFromMolblocks,
} from '@moldraw/engine-2d';

/** SMILES → 2D molblock: native generate2D + certify first; optional Indigo accelerator. */
const smilesToLaidMolblock = async (
  smiles: string,
  preferIndigo = false,
): Promise<string | null> => {
  try {
    const mol = engine.parseSmiles(smiles);
    if (mol.atoms.length === 0) return null;
    const bondLen = 45;
    const seed = engine.generate2D(mol, { bondLengthPx: bondLen, skipEnergyRefine: true });
    const certified = certifyLayout(seed, { bondLengthPx: bondLen, maxRestarts: 2 });
    let laid = certified.molecule;
    if (preferIndigo) {
      try {
        const indigo = getIndigoOrNull() ?? (await loadIndigo());
        if (indigo) {
          const { molecule } = await layoutMoleculeIndigo(mol, { bondLengthPx: bondLen });
          laid = molecule;
        }
      } catch (err) {
        console.warn('[SMILES_TO_MOLBLOCK] Indigo layout failed, using native', err);
      }
    }
    return engine.toMolblock(laid);
  } catch (err) {
    console.warn('[SMILES_TO_MOLBLOCK] failed', err);
    return null;
  }
};

/** InChI → laid-out molblock. */
const indigoInchiToLaidMolblock = async (inchi: string): Promise<string | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  const mb = indigoInchiToMolblock(inchi, indigo);
  if (!mb) return null;
  try {
    const mol = engine.parseMolblock(mb);
    if (mol.atoms.length === 0) return null;
    const { molecule } = await layoutMoleculeIndigo(mol, { bondLengthPx: 45 });
    return engine.toMolblock(molecule);
  } catch (err) {
    console.warn('[TEXT_TO_MOLBLOCK] InChI layout failed', err);
    return null;
  }
};

self.onmessage = (e) => {
  const { type, payload, id } = e.data;

  if (type === 'INIT') {
    // Engine is usable immediately for parse/SMILES/cleanup. Indigo loads lazily
    // when preferIndigo is enabled or Indigo-only tools are invoked.
    self.postMessage({ type: 'INIT_SUCCESS', id });
  } else if (type === 'INIT_INDIGO') {
    void loadIndigo()
      .then(indigo => {
        self.postMessage({
          type: 'INIT_INDIGO_SUCCESS',
          id,
          payload: {
            ready: !!indigo,
            version: indigo ? String(indigo.version?.() ?? '') : undefined,
          },
        });
      })
      .catch(err => {
        self.postMessage({ type: 'INIT_INDIGO_ERROR', id, error: String(err) });
      });
  } else if (type === 'CLEANUP') {
    void (async () => {
      try {
        const parsed = engine.parseMolblock(payload.molBlock);
        const mol = withRingConformationsByAtomIndex(
          parsed,
          payload.ringConformationsByIndex,
        );
        if (mol.atoms.length === 0) {
          self.postMessage({ type: 'CLEANUP_ERROR', error: 'Invalid MolBlock', id });
          return;
        }
        const bondLen = resolveCleanupBondLength(mol, payload.bondLengthPx);
        const preferIndigo = payload.preferIndigo === true;
        const mode = payload.mode === 'clean2d' ? 'clean2d' : 'layout';
        const result = await cleanupPreferIndigo(mol, {
          bondLengthPx: bondLen,
          preferIndigo,
          indigo: {
            mode,
            selectedAtomIndices: payload.selectedAtomIndices,
          },
        });
        self.postMessage({
          type: 'CLEANUP_SUCCESS',
          payload: {
            molBlock: engine.toMolblock(result.molecule),
            source: result.source,
          },
          id,
        });
      } catch (err) {
        self.postMessage({ type: 'CLEANUP_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'ENRICH_IMPORT_MOLBLOCK') {
    self.postMessage({
      type: 'ENRICH_IMPORT_MOLBLOCK_SUCCESS',
      id,
      payload: { molBlock: payload.molBlock },
    });
  } else if (type === 'GET_SMILES') {
    try {
      const mol = engine.parseMolblock(payload.molBlock);
      if (mol.atoms.length === 0) {
        self.postMessage({ type: 'GET_SMILES_ERROR', error: 'Invalid MolBlock', id });
        return;
      }
      const smiles = engine.toSmiles(mol);
      self.postMessage({ type: 'GET_SMILES_SUCCESS', payload: { smiles }, id });
    } catch (err) {
      self.postMessage({ type: 'GET_SMILES_ERROR', error: String(err), id });
    }
  } else if (type === 'GET_REACTION_SMILES') {
    try {
      const molL = engine.parseMolblock(payload.reactMolBlock);
      const molR = engine.parseMolblock(payload.prodMolBlock);
      if (molL.atoms.length === 0 || molR.atoms.length === 0) {
        self.postMessage({ type: 'GET_SMILES_ERROR', error: 'Invalid MolBlock (reaction side)', id });
        return;
      }
      const smiles = engine.toSmiles(molL) + '>>' + engine.toSmiles(molR);
      self.postMessage({ type: 'GET_SMILES_SUCCESS', payload: { smiles }, id });
    } catch (err) {
      self.postMessage({ type: 'GET_SMILES_ERROR', error: String(err), id });
    }
  } else if (type === 'GET_STEREO_TAGS') {
    void (async () => {
      try {
        const mol = engine.parseMolblock(payload.molBlock);
        if (mol.atoms.length === 0) {
          self.postMessage({ type: 'GET_STEREO_TAGS_SUCCESS', payload: { tags: null }, id });
          return;
        }
        const nativeTags = calculateCip(mol);
        if (nativeTags.atomStereoTags.length > 0 || nativeTags.bondStereoTags.length > 0) {
          self.postMessage({ type: 'GET_STEREO_TAGS_SUCCESS', payload: { tags: nativeTags }, id });
          return;
        }
        const indigo = getIndigoOrNull() ?? (await loadIndigo());
        if (!indigo) {
          self.postMessage({ type: 'GET_STEREO_TAGS_SUCCESS', payload: { tags: nativeTags }, id });
          return;
        }
        const tags = indigoCalculateCip(payload.molBlock, indigo) ?? nativeTags;
        self.postMessage({ type: 'GET_STEREO_TAGS_SUCCESS', payload: { tags }, id });
      } catch (err) {
        self.postMessage({ type: 'GET_STEREO_TAGS_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'CONVERT') {
    void (async () => {
      try {
        const indigo = getIndigoOrNull() ?? (await loadIndigo());
        if (!indigo) {
          self.postMessage({ type: 'CONVERT_ERROR', error: 'Indigo WASM not ready', id });
          return;
        }
        const output = indigoConvert(
          payload.input,
          payload.outputFormat,
          indigo,
          payload.options,
        );
        if (!output) {
          self.postMessage({
            type: 'CONVERT_ERROR',
            error: `Indigo convert to ${payload.outputFormat} failed`,
            id,
          });
          return;
        }
        self.postMessage({
          type: 'CONVERT_SUCCESS',
          payload: { output, format: payload.outputFormat },
          id,
        });
      } catch (err) {
        self.postMessage({ type: 'CONVERT_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'CHECK_STRUCTURE') {
    void (async () => {
      try {
        const mol = engine.parseMolblock(payload.molBlock);
        const native = checkStructure(mol);
        const nativeResult = {
          ok: native.ok,
          issues: native.issues.map(i => ({
            type: i.type,
            message: i.message,
            atomIndices: i.atomIndex != null ? [i.atomIndex] : undefined,
            bondIndices: i.bondIndex != null ? [i.bondIndex] : undefined,
          })),
          raw: JSON.stringify(native),
        };
        self.postMessage({ type: 'CHECK_STRUCTURE_SUCCESS', payload: nativeResult, id });
      } catch (err) {
        self.postMessage({ type: 'CHECK_STRUCTURE_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'AROMATIZE') {
    void (async () => {
      try {
        const mode = payload.mode === 'dearomatize' ? 'dearomatize' : 'aromatize';
        const mol = engine.parseMolblock(payload.molBlock);
        if (mol.atoms.length === 0) {
          self.postMessage({ type: 'AROMATIZE_ERROR', error: 'Invalid MolBlock', id });
          return;
        }
        const next = aromatizeMolecule(mol, mode);
        self.postMessage({
          type: 'AROMATIZE_SUCCESS',
          payload: { molBlock: engine.toMolblock(next), mode },
          id,
        });
      } catch (err) {
        self.postMessage({ type: 'AROMATIZE_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'CONVERT_EXPLICIT_HYDROGENS') {
    void (async () => {
      try {
        const mode =
          payload.mode === 'fold' || payload.mode === 'unfold' ? payload.mode : 'auto';
        const mol = engine.parseMolblock(payload.molBlock);
        if (mol.atoms.length === 0) {
          self.postMessage({
            type: 'CONVERT_EXPLICIT_HYDROGENS_ERROR',
            error: 'Invalid MolBlock',
            id,
          });
          return;
        }
        const next = convertExplicitHydrogens(mol, mode);
        self.postMessage({
          type: 'CONVERT_EXPLICIT_HYDROGENS_SUCCESS',
          payload: { molBlock: engine.toMolblock(next), mode },
          id,
        });
      } catch (err) {
        self.postMessage({
          type: 'CONVERT_EXPLICIT_HYDROGENS_ERROR',
          error: String(err),
          id,
        });
      }
    })();
  } else if (type === 'CALCULATE_PROPERTIES') {
    void (async () => {
      try {
        const indigo = getIndigoOrNull() ?? (await loadIndigo());
        if (!indigo) {
          self.postMessage({
            type: 'CALCULATE_PROPERTIES_ERROR',
            error: 'Indigo WASM not ready',
            id,
          });
          return;
        }
        const mb = String(payload.molBlock ?? '');
        const selected = Array.isArray(payload.selectedAtomIndices)
          ? payload.selectedAtomIndices
          : [];
        const calculated = indigoCalculate(mb, indigo, selected);
        const druglike = indigoDruglikeProperties(mb, indigo);
        self.postMessage({
          type: 'CALCULATE_PROPERTIES_SUCCESS',
          payload: { calculated, druglike },
          id,
        });
      } catch (err) {
        self.postMessage({ type: 'CALCULATE_PROPERTIES_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'AUTOMAP') {
    void (async () => {
      try {
        const indigo = getIndigoOrNull() ?? (await loadIndigo());
        if (!indigo) {
          self.postMessage({ type: 'AUTOMAP_ERROR', error: 'Indigo WASM not ready', id });
          return;
        }
        let input = String(payload.input ?? '').trim();
        if (!input && payload.reactMolBlock && payload.prodMolBlock) {
          input = buildRxnFromMolblocks(payload.reactMolBlock, payload.prodMolBlock);
        }
        if (!input) {
          self.postMessage({
            type: 'AUTOMAP_ERROR',
            error: 'Need a reaction (arrow + reactants/products) or reaction SMILES',
            id,
          });
          return;
        }
        const mode =
          payload.mode === 'keep' ||
          payload.mode === 'alter' ||
          payload.mode === 'clear'
            ? payload.mode
            : 'discard';
        const result = indigoAutomap(input, indigo, mode);
        if (!result) {
          self.postMessage({ type: 'AUTOMAP_ERROR', error: 'Indigo automap failed', id });
          return;
        }
        self.postMessage({
          type: 'AUTOMAP_SUCCESS',
          payload: {
            maps: result.maps,
            mapsByComponent: result.mapsByComponent,
            rxnfile: result.rxnfile,
          },
          id,
        });
      } catch (err) {
        self.postMessage({ type: 'AUTOMAP_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'AUTOMAP_DEMO') {
    void (async () => {
      try {
        // Full teaching SN2: CH3Br + OH- → CH3OH + Br-
        const cbr = await smilesToLaidMolblock('CBr');
        const oh = await smilesToLaidMolblock('[OH-]');
        const meoh = await smilesToLaidMolblock('CO');
        const brMinus = await smilesToLaidMolblock('[Br-]');
        if (!cbr || !oh || !meoh || !brMinus) {
          self.postMessage({
            type: 'AUTOMAP_DEMO_ERROR',
            error: 'Could not layout demo reaction (Indigo SMILES)',
            id,
          });
          return;
        }

        const shiftMol = (
          mol: ReturnType<typeof engine.parseMolblock>,
          idPrefix: string,
          dx: number,
          dy: number,
        ) => ({
          atoms: mol.atoms.map(a => ({
            ...a,
            id: `${idPrefix}${a.id}`,
            x: a.x + dx,
            y: a.y + dy,
          })),
          bonds: mol.bonds.map(b => ({
            ...b,
            id: `${idPrefix}${b.id}`,
            fromAtomId: `${idPrefix}${b.fromAtomId}`,
            toAtomId: `${idPrefix}${b.toAtomId}`,
          })),
        });

        const cbrMol = engine.parseMolblock(cbr);
        const ohMol = engine.parseMolblock(oh);
        const meohMol = engine.parseMolblock(meoh);
        const brMol = engine.parseMolblock(brMinus);

        // Stack OH- under methyl bromide with clear vertical gap
        const cbrMaxY = Math.max(...cbrMol.atoms.map(a => a.y), 0);
        const cbrMidX =
          cbrMol.atoms.reduce((s, a) => s + a.x, 0) / Math.max(1, cbrMol.atoms.length);
        const ohCx =
          ohMol.atoms.reduce((s, a) => s + a.x, 0) / Math.max(1, ohMol.atoms.length);
        const ohCy =
          ohMol.atoms.reduce((s, a) => s + a.y, 0) / Math.max(1, ohMol.atoms.length);
        const ohShifted = shiftMol(ohMol, 'demo_oh_', cbrMidX - ohCx, cbrMaxY + 110 - ohCy);

        const reactCombined = {
          atoms: [...cbrMol.atoms, ...ohShifted.atoms],
          bonds: [...cbrMol.bonds, ...ohShifted.bonds],
        };

        // Products: methanol + Br- below it
        const meohMaxY = Math.max(...meohMol.atoms.map(a => a.y), 0);
        const meohMidX =
          meohMol.atoms.reduce((s, a) => s + a.x, 0) / Math.max(1, meohMol.atoms.length);
        const brCx =
          brMol.atoms.reduce((s, a) => s + a.x, 0) / Math.max(1, brMol.atoms.length);
        const brCy =
          brMol.atoms.reduce((s, a) => s + a.y, 0) / Math.max(1, brMol.atoms.length);
        const brShifted = shiftMol(brMol, 'demo_br_', meohMidX - brCx, meohMaxY + 110 - brCy);

        const prodCombined = {
          atoms: [...meohMol.atoms, ...brShifted.atoms],
          bonds: [...meohMol.bonds, ...brShifted.bonds],
        };

        const reactMethylIndices = reactCombined.atoms
          .map((a, i) => (a.element === 'C' ? i : -1))
          .filter(i => i >= 0);
        const prodMethylIndices = prodCombined.atoms
          .map((a, i) => (a.element === 'C' ? i : -1))
          .filter(i => i >= 0);

        self.postMessage({
          type: 'AUTOMAP_DEMO_SUCCESS',
          payload: {
            reactMolBlock: engine.toMolblock(reactCombined),
            prodMolBlock: engine.toMolblock(prodCombined),
            reactMethylIndices,
            prodMethylIndices,
          },
          id,
        });
      } catch (err) {
        self.postMessage({ type: 'AUTOMAP_DEMO_ERROR', error: String(err), id });
      }
    })();
  } else if (type === 'SMILES_TO_MOLBLOCK') {
    void (async () => {
      const preferIndigo = payload.preferIndigo === true;
      const mb = await smilesToLaidMolblock(payload.smiles, preferIndigo);
      if (mb) {
        self.postMessage({ type: 'SMILES_TO_MOLBLOCK_SUCCESS', payload: { molBlock: mb }, id });
      } else {
        self.postMessage({
          type: 'SMILES_TO_MOLBLOCK_ERROR',
          error: preferIndigo
            ? 'Invalid or unsupported SMILES (Indigo layout)'
            : 'Invalid or unsupported SMILES (native layout)',
          id,
        });
      }
    })();
  } else if (type === 'TEXT_TO_MOLBLOCK') {
    void (async () => {
      const text = String(payload.text ?? '').trim();
      if (!text) {
        self.postMessage({
          type: 'TEXT_TO_MOLBLOCK_ERROR',
          error: 'Empty structure text',
          id,
        });
        return;
      }

      const indigo = getIndigoOrNull() ?? (await loadIndigo());

      /** Convert exotic formats → laid-out molblock via Indigo. */
      const indigoTextToLaidMolblock = async (raw: string): Promise<string | null> => {
        if (!indigo) return null;
        try {
          // Prefer molfile; for reactions Indigo may return RXN — fall back to SMILES.
          const mb = indigoConvert(raw, 'molfile', indigo);
          if (mb && mb.includes('V2000') && !mb.includes('$RXN')) {
            const mol = engine.parseMolblock(mb);
            if (mol.atoms.length > 0) {
              const hasCoords = mol.atoms.some(a => Math.abs(a.x) > 1e-6 || Math.abs(a.y) > 1e-6);
              if (!hasCoords) {
                const { molecule } = await layoutMoleculeIndigo(mol, { bondLengthPx: 45 });
                return engine.toMolblock(molecule);
              }
              return engine.toMolblock(mol);
            }
          }
          const smiles = indigoConvert(raw, 'smiles', indigo);
          if (!smiles) return null;
          if (smiles.includes('>>')) {
            const [reactSmi, prodSmi] = smiles.split('>>').map(s => s.trim());
            const reactMb = reactSmi ? await smilesToLaidMolblock(reactSmi) : null;
            const prodMb = prodSmi ? await smilesToLaidMolblock(prodSmi) : null;
            if (!reactMb && !prodMb) return null;
            if (!prodMb) return reactMb;
            if (!reactMb) return prodMb;
            const react = engine.parseMolblock(reactMb);
            const prod = engine.parseMolblock(prodMb);
            const reactMaxX = Math.max(...react.atoms.map(a => a.x), 0);
            const reactMidY =
              react.atoms.reduce((s, a) => s + a.y, 0) / Math.max(1, react.atoms.length);
            const prodMidY =
              prod.atoms.reduce((s, a) => s + a.y, 0) / Math.max(1, prod.atoms.length);
            const gap = 160;
            const shiftedProd = {
              atoms: prod.atoms.map(a => ({
                ...a,
                id: `rxn_p_${a.id}`,
                x: a.x + reactMaxX + gap,
                y: a.y + (reactMidY - prodMidY),
              })),
              bonds: prod.bonds.map(b => ({
                ...b,
                id: `rxn_p_${b.id}`,
                fromAtomId: `rxn_p_${b.fromAtomId}`,
                toAtomId: `rxn_p_${b.toAtomId}`,
              })),
            };
            return engine.toMolblock({
              atoms: [...react.atoms, ...shiftedProd.atoms],
              bonds: [...react.bonds, ...shiftedProd.bonds],
            });
          }
          return smilesToLaidMolblock(smiles);
        } catch (err) {
          console.warn('[TEXT_TO_MOLBLOCK] Indigo convert failed', err);
          return null;
        }
      };

      if (text.startsWith('InChI=')) {
        const mb = await indigoInchiToLaidMolblock(text);
        if (mb) {
          self.postMessage({ type: 'TEXT_TO_MOLBLOCK_SUCCESS', payload: { molBlock: mb }, id });
        } else {
          self.postMessage({
            type: 'TEXT_TO_MOLBLOCK_ERROR',
            error: 'Could not parse InChI (Indigo convert/layout).',
            id,
          });
        }
        return;
      }

      const looksCml = /<cml[\s>]|<molecule[\s>]/i.test(text);
      const looksRxn = text.toUpperCase().includes('$RXN');
      const looksSmarts =
        !text.includes('\n') && /[[\]*!;$]/.test(text) && !text.includes('>>');

      if (looksCml || looksRxn || looksSmarts) {
        const mb = await indigoTextToLaidMolblock(text);
        if (mb) {
          self.postMessage({ type: 'TEXT_TO_MOLBLOCK_SUCCESS', payload: { molBlock: mb }, id });
        } else {
          self.postMessage({
            type: 'TEXT_TO_MOLBLOCK_ERROR',
            error: looksRxn
              ? 'Could not parse RXN file (Indigo).'
              : looksCml
                ? 'Could not parse CML (Indigo).'
                : 'Could not parse SMARTS (Indigo).',
            id,
          });
        }
        return;
      }

      try {
        const asMolblock = engine.parseMolblock(text);
        if (asMolblock.atoms.length > 0) {
          const { molecule } = await layoutMoleculeIndigo(asMolblock, { bondLengthPx: 45 });
          self.postMessage({
            type: 'TEXT_TO_MOLBLOCK_SUCCESS',
            payload: { molBlock: engine.toMolblock(molecule) },
            id,
          });
          return;
        }
      } catch {
        /* not a molblock — try SMILES / Indigo convert next */
      }

      const asSmiles = await smilesToLaidMolblock(text);
      if (asSmiles) {
        self.postMessage({ type: 'TEXT_TO_MOLBLOCK_SUCCESS', payload: { molBlock: asSmiles }, id });
        return;
      }

      // Last resort: Indigo convert (covers odd SMARTS / CML without clear markers)
      const viaIndigo = await indigoTextToLaidMolblock(text);
      if (viaIndigo) {
        self.postMessage({ type: 'TEXT_TO_MOLBLOCK_SUCCESS', payload: { molBlock: viaIndigo }, id });
        return;
      }

      self.postMessage({ type: 'TEXT_TO_MOLBLOCK_ERROR', error: 'Could not parse structure text', id });
    })();
  } else if (type === 'CHEMDRAW_TO_MOLBLOCK') {
    void (async () => {
      try {
        const indigo = getIndigoOrNull() ?? (await loadIndigo());
        if (!indigo) {
          self.postMessage({
            type: 'CHEMDRAW_TO_MOLBLOCK_ERROR',
            error: 'Indigo WASM is required to open ChemDraw files.',
            id,
          });
          return;
        }
        const format = payload.format === 'cdx' ? 'cdx' : 'cdxml';
        const mb = indigoChemDrawToMolblock(String(payload.data ?? ''), format, indigo);
        if (!mb) {
          self.postMessage({
            type: 'CHEMDRAW_TO_MOLBLOCK_ERROR',
            error:
              format === 'cdx'
                ? 'Could not parse ChemDraw .cdx. Try Save As → CDXML or .mol in ChemDraw.'
                : 'Could not parse ChemDraw CDXML.',
            id,
          });
          return;
        }
        // Layout if coords are all zero (common for some CDX imports).
        try {
          const mol = engine.parseMolblock(mb);
          const hasCoords = mol.atoms.some(a => Math.abs(a.x) > 1e-6 || Math.abs(a.y) > 1e-6);
          if (mol.atoms.length > 0 && !hasCoords) {
            const { molecule } = await layoutMoleculeIndigo(mol, { bondLengthPx: 45 });
            self.postMessage({
              type: 'CHEMDRAW_TO_MOLBLOCK_SUCCESS',
              payload: { molBlock: engine.toMolblock(molecule) },
              id,
            });
            return;
          }
        } catch {
          /* use raw molblock */
        }
        self.postMessage({
          type: 'CHEMDRAW_TO_MOLBLOCK_SUCCESS',
          payload: { molBlock: mb },
          id,
        });
      } catch (err) {
        self.postMessage({ type: 'CHEMDRAW_TO_MOLBLOCK_ERROR', error: String(err), id });
      }
    })();
  }
};
