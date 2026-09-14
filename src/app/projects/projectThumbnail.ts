import { exportMoleculeBitmap } from '@moldraw/canvas';
import { resolveCanvasPreferences } from '@moldraw/core';
import type { Molecule } from '@moldraw/domain';
import { moleculeHasProjectContent } from './projectStorage';

const THUMB_DISPLAY_PREFS = resolveCanvasPreferences({
  general: {
    showImplicitHydrogens: false,
    autoLayoutAfterBondBurst: true,
    fontFamily: 'Inter',
    fontSizePt: 12,
    subFontSizePt: 8,
    reactionComponentMarginPt: 12,
    imageResolution: 'low',
  },
  bonds: {
    bondLengthPx: 40,
    bondSpacingPercent: 18,
    bondThicknessPx: 1.5,
    stereoWedgeWidthPx: 8,
    hashSpacingPx: 4,
    bondAngleSnapDeg: 15,
  },
});

const MAX_THUMB_WIDTH = 280;

/** JPEG data URL for library cards (empty canvas → undefined). */
export function renderProjectThumbnailDataUrl(mol: Molecule): string | undefined {
  if (!moleculeHasProjectContent(mol)) return undefined;
  try {
    const canvas = exportMoleculeBitmap({
      molecule: mol,
      displayPrefs: THUMB_DISPLAY_PREFS,
      scale: 1.5,
      background: 'white',
      padWorld: 24,
    });
    if (!canvas) return undefined;
    const scale = Math.min(1, MAX_THUMB_WIDTH / canvas.width);
    if (scale >= 1) return canvas.toDataURL('image/jpeg', 0.72);
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width * scale));
    small.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = small.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/jpeg', 0.72);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, small.width, small.height);
    ctx.drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}
