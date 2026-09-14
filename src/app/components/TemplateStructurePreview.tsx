import { useEffect, useRef } from 'react';
import { parseMolblock } from '@moldraw/core/io/molblock';
import { resolveCanvasPreferences } from '@moldraw/core/canvasPreferences';
import { fitMoleculeToCanvas } from '../settings/aspirinPreviewMolecule';
import { getMoleculeRevisionCache } from '@moldraw/canvas/geometry';
import { drawBonds } from '@moldraw/canvas/render/drawBonds';
import { drawAtomLabels } from '@moldraw/canvas/render/drawAtomDecorations';
import type { RenderContext } from '@moldraw/canvas/render/types';
import type { Molecule } from '@moldraw/domain';

const THUMB_PREFS = resolveCanvasPreferences({
  general: {
    showImplicitHydrogens: false,
    autoLayoutAfterBondBurst: false,
    fontFamily: 'Inter',
    fontSizePt: 8,
    subFontSizePt: 6.5,
    reactionComponentMarginPt: 8,
    imageResolution: 'high',
  },
  bonds: {
    bondLengthPx: 40,
    bondSpacingPercent: 18,
    bondThicknessPx: 1.6,
    stereoWedgeWidthPx: 10,
    hashSpacingPx: 4,
    bondAngleSnapDeg: 30,
  },
});

/** Extra logical pixels — render large, display small for crisp toolbar thumbnails. */
const SUPERSAMPLE_BY_COMPACT = { compact: 3, standard: 2 } as const;

function buildValencyMap(mol: Molecule): Map<string, number> {
  const valencyMap = new Map<string, number>();
  for (const b of mol.bonds) {
    valencyMap.set(b.fromAtomId, (valencyMap.get(b.fromAtomId) || 0) + b.order);
    valencyMap.set(b.toAtomId, (valencyMap.get(b.toAtomId) || 0) + b.order);
  }
  return valencyMap;
}

export function TemplateStructurePreview({
  molblock,
  width = 128,
  height = 72,
  label,
  compact = false,
}: {
  molblock: string | null;
  width?: number;
  height?: number;
  label?: string;
  /** Smaller labels and thinner bonds (functional-group toolbar grid). */
  compact?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const supersample = compact ? SUPERSAMPLE_BY_COMPACT.compact : SUPERSAMPLE_BY_COMPACT.standard;
    const renderW = width * supersample;
    const renderH = height * supersample;
    const dpr = Math.min(
      3,
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    );

    canvas.width = Math.round(renderW * dpr);
    canvas.height = Math.round(renderH * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, renderW, renderH);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, renderW, renderH);

    if (!molblock?.trim()) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `${Math.round(11 * supersample)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('…', renderW / 2, renderH / 2);
      return;
    }

    try {
      const base = parseMolblock(molblock);
      if (base.atoms.length === 0) return;

      const pad = compact ? 10 : 8;
      const mol = fitMoleculeToCanvas(base, renderW, renderH, pad);
      const valencyMap = buildValencyMap(mol);
      const topology = getMoleculeRevisionCache(mol);
      const R = {
        displayPrefs: THUMB_PREFS,
        renderedMolecule: mol,
        atomById: topology.atomById,
        ringCenterByBondId: topology.ringCenterByBondId,
        ringAtomIdsByBondId: topology.ringAtomIdsByBondId,
        selectedAtomIds: [] as string[],
        selectedBondIds: [] as string[],
        labelCounterRad: 0,
        valencyMap,
        showHydrogens: false,
        condensedGroupLabels: true,
        colorAtomLabels: true,
        applyAtomColorsToBonds: true,
        structureTheme: {
          ink: '#0f172a',
          hydrogen: '#94a3b8',
          gridMinor: 'rgba(15, 23, 42, 0.035)',
          gridMajor: 'rgba(15, 23, 42, 0.07)',
          gridAxis: 'rgba(15, 23, 42, 0.14)',
        },
        omitAtomAliasBodyId: null,
        atomOpacityById: new Map<string, number>(),
        applyLabelUpright: (_atomId: string, draw: () => void) => {
          draw();
        },
      } as RenderContext;

      drawBonds(ctx, R);
      drawAtomLabels(ctx, R);
    } catch (err) {
      console.warn('Template structure preview failed:', err);
    }
  }, [molblock, width, height, compact]);

  return (
    <canvas
      ref={ref}
      className="template-library-card__preview-canvas"
      aria-hidden={!label}
      title={label}
    />
  );
}
