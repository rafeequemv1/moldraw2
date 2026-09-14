/** Raster export scale from preset (PNG/JPEG/SVG embedded bitmap). */
export type ImageResolutionPreset = 'low' | 'medium' | 'high';

/** Narrow shape compatible with `AppSettings` — kept in core to avoid `features` importing `app`. */
export interface ResolveCanvasPreferencesInput {
  general: {
    showImplicitHydrogens: boolean;
    autoLayoutAfterBondBurst: boolean;
    fontFamily: string;
    fontSizePt: number;
    subFontSizePt: number;
    reactionComponentMarginPt: number;
    imageResolution: ImageResolutionPreset;
    /** Atom / group labels bold. Default false when omitted. */
    boldAtomLabels?: boolean;
  };
  bonds: {
    bondLengthPx: number;
    bondSpacingPercent: number;
    bondThicknessPx: number;
    stereoWedgeWidthPx: number;
    hashSpacingPx: number;
    bondAngleSnapDeg: number;
  };
}

/** Values derived from app settings for canvas + export (px at zoom 1). */
export interface ResolvedCanvasPreferences {
  bondLengthPx: number;
  bondSpacingFraction: number;
  bondThicknessPx: number;
  stereoWedgeWidthPx: number;
  hashSpacingPx: number;
  /** Radians — bond / ring / chain direction snap increment. */
  bondAngleSnapRad: number;
  labelFontFamily: string;
  elementFontCss: string;
  subFontCss: string;
  chargeFontCss: string;
  implicitHFontCss: string;
  isoFontCss: string;
  reactionComponentMarginPx: number;
  imageExportScale: number;
}

const PT_TO_PX = 96 / 72;

export function imageResolutionToScale(res: ImageResolutionPreset): number {
  // World units ≈ CSS px at zoom 1; these multipliers yield sharp PNG/JPEG/SVG.
  switch (res) {
    case 'low':
      return 2;
    case 'medium':
      return 3;
    case 'high':
      return 4;
    default:
      return 3;
  }
}

export function canvasFontFamilyStack(primary: string): string {
  const t = primary.trim();
  if (!t) return 'sans-serif';
  if (/^system-ui|sans-serif|serif|monospace$/i.test(t)) return t;
  const escaped = t.includes(',') ? t : `"${t.replace(/"/g, '\\"')}"`;
  return `${escaped}, Inter, sans-serif`;
}

export function resolveCanvasPreferences(s: ResolveCanvasPreferencesInput): ResolvedCanvasPreferences {
  const { general: g, bonds: b } = s;
  const fontPx = g.fontSizePt * PT_TO_PX;
  // Subscripts for NH₂ / PH₄ etc. — at least ~80% of element size (ChemDraw-like).
  const subPx = Math.max(g.subFontSizePt * PT_TO_PX, fontPx * 0.8);
  const marginPx = g.reactionComponentMarginPt * PT_TO_PX;
  const family = canvasFontFamilyStack(g.fontFamily);

  const rawBl = b.bondLengthPx;
  const bondLengthPx = Math.max(
    12,
    Math.min(120, Number.isFinite(rawBl) && rawBl > 0 ? rawBl : 40),
  );

  const snapDegRaw = Number.isFinite(b.bondAngleSnapDeg) ? b.bondAngleSnapDeg : 30;
  const snapDeg = Math.max(5, Math.min(45, snapDegRaw));
  const bondAngleSnapRad = (snapDeg * Math.PI) / 180;
  const weight = g.boldAtomLabels ? 'bold ' : '';

  return {
    bondLengthPx,
    bondSpacingFraction: Math.max(0.02, Math.min(0.55, b.bondSpacingPercent / 100)),
    bondThicknessPx: Math.max(0.5, Math.min(14, b.bondThicknessPx)),
    stereoWedgeWidthPx: Math.max(2, Math.min(24, b.stereoWedgeWidthPx)),
    hashSpacingPx: Math.max(0.5, Math.min(14, b.hashSpacingPx)),
    bondAngleSnapRad,
    labelFontFamily: family,
    elementFontCss: `${weight}${fontPx}px ${family}`,
    subFontCss: `${subPx}px ${family}`,
    chargeFontCss: `${Math.max(10, fontPx * 0.65)}px ${family}`,
    implicitHFontCss: `${weight}${Math.max(11, fontPx * 0.72)}px ${family}`,
    isoFontCss: `${Math.max(10, fontPx * 0.65)}px ${family}`,
    reactionComponentMarginPx: marginPx,
    imageExportScale: imageResolutionToScale(g.imageResolution),
  };
}
