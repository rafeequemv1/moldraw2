/** Raster export scale from preset (white PNG / JPEG / PDF). Transparent PNG and SVG stay 1×. */
export type ImageResolutionPreset = 'document' | 'low' | 'medium' | 'high';

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
    /**
     * When true, dragging molecules / reaction arrows snaps the selection
     * center to the background grid (teaching layout aid).
     */
    snapToGrid?: boolean;
    /** Draw the background grid. Default true when omitted. */
    showGrid?: boolean;
    /** Grid appearance: dots (default) or lines. */
    gridPattern?: 'lines' | 'dots';
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
  /** Snap selection / arrow moves to the background grid. */
  snapToGrid: boolean;
  /** Draw the background grid. */
  showGrid: boolean;
  /** Background grid style. */
  gridPattern: 'lines' | 'dots';
  /** Background / snap grid spacing in world units. */
  gridSizePx: number;
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
  // World units = CSS px at zoom 1. 1× keeps Font size (e.g. 14px Arial) in the file.
  switch (res) {
    case 'document':
      return 1;
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

/** Per-atom label font CSS strings (document defaults when `labelFontSizePt` omitted). */
export function resolveAtomLabelFonts(
  prefs: Pick<
    ResolvedCanvasPreferences,
    | 'labelFontFamily'
    | 'elementFontCss'
    | 'subFontCss'
    | 'chargeFontCss'
    | 'implicitHFontCss'
    | 'isoFontCss'
  >,
  labelFontSizePt: number | undefined,
  opts?: { bold?: boolean; subFontSizePt?: number },
): Pick<
  ResolvedCanvasPreferences,
  'elementFontCss' | 'subFontCss' | 'chargeFontCss' | 'implicitHFontCss' | 'isoFontCss'
> {
  if (labelFontSizePt == null || !Number.isFinite(labelFontSizePt)) {
    return {
      elementFontCss: prefs.elementFontCss,
      subFontCss: prefs.subFontCss,
      chargeFontCss: prefs.chargeFontCss,
      implicitHFontCss: prefs.implicitHFontCss,
      isoFontCss: prefs.isoFontCss,
    };
  }
  const fontPx = Math.max(6, Math.min(48, labelFontSizePt));
  const subBase = opts?.subFontSizePt != null ? opts.subFontSizePt : fontPx * 0.8;
  const subPx = Math.max(subBase, fontPx * 0.8);
  const family = prefs.labelFontFamily;
  const weight = opts?.bold ? 'bold ' : prefs.elementFontCss.startsWith('bold ') ? 'bold ' : '';
  return {
    elementFontCss: `${weight}${fontPx}px ${family}`,
    subFontCss: `${subPx}px ${family}`,
    chargeFontCss: `${Math.max(10, fontPx * 0.65)}px ${family}`,
    implicitHFontCss: `${weight}${Math.max(11, fontPx * 0.72)}px ${family}`,
    isoFontCss: `${Math.max(10, fontPx * 0.65)}px ${family}`,
  };
}

export function resolveCanvasPreferences(s: ResolveCanvasPreferencesInput): ResolvedCanvasPreferences {
  const { general: g, bonds: b } = s;
  // Font size setting is CSS pixels at zoom 1 (14 = 14px Arial on canvas and 1× PNG).
  const fontPx = g.fontSizePt;
  // Subscripts for NH₂ / PH₄ etc. — at least ~80% of element size (ChemDraw-like).
  const subPx = Math.max(g.subFontSizePt, fontPx * 0.8);
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
    snapToGrid: g.snapToGrid === true,
    showGrid: g.showGrid !== false,
    gridPattern: g.gridPattern === 'lines' ? 'lines' : 'dots',
    gridSizePx: 50,
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
