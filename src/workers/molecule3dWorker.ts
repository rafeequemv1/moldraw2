/**
 * Dedicated 3D conformer worker — native UFF / progressive embed only.
 *
 * Intentionally has NO Indigo / engine-2d imports. Uses optional engine-3d peer
 * for embed; 2D molblock I/O from the native engine.
 */
import { engine } from '@moldraw/engine';
import {
  embed3DProgressive,
  enforceStereoOnMolblock3D,
  generate3DMolblock,
  generate3DConformerResults,
  moleculeHasStereoConstraints,
  NATIVE_3D_FULL_HEAVY_LIMIT,
  NATIVE_3D_PREVIEW_HEAVY_LIMIT,
  refine3DRegion,
} from '@moldraw/engine-3d';
import type { Generate3DOptions } from '@moldraw/engine';

self.onmessage = e => {
  const { type, payload, id } = e.data;

  if (type === 'INIT') {
    self.postMessage({ type: 'INIT_SUCCESS', id });
  } else if (type === 'GENERATE_3D') {
    const includeHydrogens = payload.includeHydrogens !== false;
    try {
      let source = engine.parseMolblock(payload.molBlock);
      if (source.atoms.length === 0 && payload.fallbackMolBlock) {
        source = engine.parseMolblock(payload.fallbackMolBlock);
      }
      if (source.atoms.length === 0) {
        throw new Error('Invalid MolBlock: no atoms parsed');
      }

      let molBlock3D = '';
      let energy: number | undefined;
      let sourceLabel = 'native-3d';
      const heavyCount =
        typeof payload.heavyAtomHint === 'number'
          ? payload.heavyAtomHint
          : source.atoms.filter((a: { element: string }) => a.element !== 'H').length;

      // Optional 3D seed (molblock atom order) → by parsed atom id.
      let seed3D: Map<string, { x: number; y: number; z: number }> | undefined;
      if (Array.isArray(payload.seed3D) && payload.seed3D.length > 0) {
        seed3D = new Map();
        source.atoms.forEach((a: { id: string }, i: number) => {
          const s = payload.seed3D[i];
          if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)) {
            seed3D!.set(a.id, { x: s.x, y: s.y, z: s.z });
          }
        });
        if (seed3D.size === 0) seed3D = undefined;
      }

      const tryGenerate = (opts: Generate3DOptions, label: string): boolean => {
        try {
          molBlock3D = generate3DMolblock(source, { ...opts, seed3D });
          sourceLabel = label;
          return true;
        } catch (err) {
          console.warn('[GENERATE_3D] fallback after', label, err);
          return false;
        }
      };

      let ok = false;
      if (heavyCount > NATIVE_3D_PREVIEW_HEAVY_LIMIT) {
        molBlock3D = engine.toMolblock(source);
        sourceLabel = 'native-3d-large';
        ok = true;
      } else if (heavyCount > NATIVE_3D_FULL_HEAVY_LIMIT) {
        ok = tryGenerate(
          {
            includeHydrogens: false,
            iterations: 20,
            count: 1,
            maxIterations: 20,
            forceField: 'none',
          },
          'native-3d-light',
        );
        if (!ok) {
          molBlock3D = engine.toMolblock(source);
          sourceLabel = 'native-3d-fallback';
          ok = true;
        }
      } else if (payload.progressive !== false) {
        // Single-structure progressive UFF — taper iterations for large molecules.
        // Multi-conformer sampling is a separate path (kept for smaller molecules).
        const shellIterations =
          heavyCount > 350 ? 8 : heavyCount > 250 ? 12 : heavyCount > 160 ? 20 : heavyCount > 50 ? 28 : heavyCount > 25 ? 32 : 40;
        const finalIterations =
          heavyCount > 350 ? 24 : heavyCount > 250 ? 36 : heavyCount > 160 ? 56 : heavyCount > 50 ? 72 : heavyCount > 25 ? 80 : 100;
        // Insulin-scale: heavy-only UFF then place H is much faster than full-H UFF.
        const progressiveIncludeH = includeHydrogens && heavyCount <= 220;
        try {
          let lastProgressAt = 0;
          const result = embed3DProgressive(source, {
            includeHydrogens: progressiveIncludeH,
            shellIterations,
            finalIterations,
            shellBuffer: 2,
            seed3D,
            onProgress: update => {
              const now =
                typeof performance !== 'undefined' ? performance.now() : Date.now();
              if (!update.done && update.shell > 0 && now - lastProgressAt < 120) {
                return;
              }
              lastProgressAt = now;
              self.postMessage({
                type: 'GENERATE_3D_PROGRESS',
                payload: {
                  molBlock3D: update.molblock,
                  fraction: update.fraction,
                  shell: update.shell,
                  shellCount: update.shellCount,
                  done: update.done,
                  energy: update.energy,
                },
                id,
              });
            },
          });
          molBlock3D = result.molblock;
          energy = result.energy;
          sourceLabel = result.source;
          ok = true;
        } catch (err) {
          console.warn('[GENERATE_3D] progressive failed, UFF fallback', err);
        }
        if (!ok) {
          ok =
            tryGenerate(
              {
                includeHydrogens,
                iterations: heavyCount > 40 ? 60 : 100,
                count: 1,
                maxIterations: heavyCount > 40 ? 100 : 200,
              },
              'native-3d',
            ) ||
            tryGenerate(
              {
                includeHydrogens,
                iterations: 40,
                count: 1,
                maxIterations: 40,
                forceField: 'none',
              },
              'native-3d',
            );
        }
        if (!ok) {
          molBlock3D = engine.toMolblock(source);
          sourceLabel = 'native-3d-fallback';
          ok = true;
        }
      } else {
        // Conformer sampling discards the starting geometry — skip it when the
        // caller asked to re-minimize an existing conformer (seed3D).
        if (!seed3D) {
          try {
            const sampleCount = heavyCount > 25 ? 12 : 16;
            const ranked = generate3DConformerResults(source, {
              includeHydrogens,
              count: sampleCount,
              maxIterations: 400,
            });
            if (ranked.length > 0) {
              molBlock3D = ranked[0].molblock;
              energy = ranked[0].energy;
              sourceLabel = 'native-3d';
              ok = true;
            }
          } catch (err) {
            console.warn('[GENERATE_3D] conformers failed, single embed', err);
          }
        }
        if (!ok) {
          ok =
            tryGenerate({ includeHydrogens }, 'native-3d') ||
            tryGenerate(
              {
                includeHydrogens: false,
                forceField: 'none',
                iterations: 40,
                count: 1,
              },
              'native-3d-light',
            );
        }
      }

      if (!ok || !molBlock3D) {
        molBlock3D = engine.toMolblock(source);
        sourceLabel = 'native-3d-fallback';
      }

      // Hard-correct chirality / E–Z vs 2D wedges (heavy atoms first in molblock).
      if (moleculeHasStereoConstraints(source) && molBlock3D) {
        const heavyIds = source.atoms.filter(a => a.element !== 'H').map(a => a.id);
        const stereoFixed = enforceStereoOnMolblock3D(source, molBlock3D, heavyIds);
        if (stereoFixed) molBlock3D = stereoFixed.molblock;
      }

      self.postMessage({
        type: 'GENERATE_3D_SUCCESS',
        payload: { molBlock3D, source: sourceLabel, energy },
        id,
      });
    } catch (err) {
      const fallback = payload.fallbackMolBlock || payload.molBlock || '';
      if (fallback) {
        self.postMessage({
          type: 'GENERATE_3D_SUCCESS',
          payload: {
            molBlock3D: fallback,
            source: 'native-3d-fallback',
          },
          id,
        });
      } else {
        self.postMessage({ type: 'GENERATE_3D_ERROR', error: String(err), id });
      }
    }
  } else if (type === 'REFINE_3D_REGION') {
    try {
      const source = engine.parseMolblock(payload.molBlock);
      if (source.atoms.length === 0) {
        throw new Error('Invalid MolBlock: no atoms parsed');
      }
      const result = refine3DRegion(source, {
        dirtyAtomIds: payload.dirtyAtomIds ?? [],
        previousMolblock3D: payload.previousMolBlock3D,
        includeHydrogens: payload.includeHydrogens !== false,
        bondBuffer: payload.bondBuffer ?? 2,
        maxIterations: payload.maxIterations ?? 28,
      });
      self.postMessage({
        type: 'GENERATE_3D_SUCCESS',
        payload: {
          molBlock3D: result.molblock,
          source: result.source,
          energy: result.energy,
          movableCount: result.movableCount,
          atomCount: result.atomCount,
        },
        id,
      });
    } catch (err) {
      try {
        const source = engine.parseMolblock(payload.molBlock);
        const molBlock3D = generate3DMolblock(source, {
          includeHydrogens: payload.includeHydrogens !== false,
          iterations: 40,
          count: 1,
          maxIterations: 80,
          forceField: 'none',
        });
        self.postMessage({
          type: 'GENERATE_3D_SUCCESS',
          payload: { molBlock3D, source: 'native-3d' },
          id,
        });
      } catch (err2) {
        self.postMessage({ type: 'GENERATE_3D_ERROR', error: String(err2 ?? err), id });
      }
    }
  }
};
