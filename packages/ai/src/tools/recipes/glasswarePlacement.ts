/**
 * Shared world placement for glassware recipes (place_glassware / build_lab_manual).
 * Port-aware chains use `@moldraw/domain` alignPorts — no persistent joint graph.
 */
import {
  alignPorts,
  getGlasswareEntry,
  getGlasswarePort,
  portCompatibilityError,
  resolveGlassware,
  resolveGlasswareSetup,
  type CanvasShapeKind,
  type GlasswareLibraryEntry,
  type GlasswareSetupPiece,
} from '@moldraw/domain';
import type { AiExecutionContext } from '../../types';

export type PlacedGlassware = {
  kind: string;
  shapeId: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
  fromPort?: string;
  toPort?: string;
  attachTo?: number;
};

export type AssemblyPieceInput = {
  name: string;
  attachTo?: number;
  fromPort?: string;
  toPort?: string;
  fillLevel?: number;
  width?: number;
  height?: number;
  fillColor?: string;
};

export function viewportCenterWorld(ctx: AiExecutionContext): { cx: number; cy: number } {
  const viewport = ctx.viewport ?? { x: 0, y: 0, zoom: 1 };
  const windowWidth = ctx.windowWidth ?? 1200;
  const windowHeight = ctx.windowHeight ?? 800;
  const zoom = viewport.zoom || 1;
  return {
    cx: (windowWidth / 2 - viewport.x) / zoom,
    cy: (windowHeight / 2 - viewport.y) / zoom,
  };
}

export function newGlasswareId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function placeGlasswareShape(
  ctx: AiExecutionContext,
  entry: GlasswareLibraryEntry,
  opts: {
    cx: number;
    cy: number;
    width?: number;
    height?: number;
    fillLevel?: number;
    fillColor?: string;
  },
): { ok: true; shapeId: string; width: number; height: number } | { ok: false; error: string } {
  if (!ctx.applyCommand) {
    return { ok: false, error: 'Glassware placement requires ctx.applyCommand.' };
  }
  const w = opts.width ?? entry.defaultWidth;
  const h = opts.height ?? entry.defaultHeight;
  const shapeId = newGlasswareId('gw');
  const shape: Record<string, unknown> = {
    id: shapeId,
    kind: entry.kind,
    x1: opts.cx - w / 2,
    y1: opts.cy - h / 2,
    x2: opts.cx + w / 2,
    y2: opts.cy + h / 2,
    color: '#111111',
    strokeWidth: 2,
  };
  if (entry.supportsLiquid) {
    shape.fillColor = opts.fillColor ?? entry.defaultFillColor;
    shape.fillLevel = opts.fillLevel ?? entry.defaultFillLevel ?? 0.35;
  }
  const r = ctx.applyCommand('molecule.addCanvasShape', { shape });
  if (!r.ok) {
    return { ok: false, error: r.error?.message ?? 'addCanvasShape failed' };
  }
  return { ok: true, shapeId, width: w, height: h };
}

export function placeCanvasCaption(
  ctx: AiExecutionContext,
  opts: { x: number; y: number; text: string; fontSize?: number },
): { ok: true; textId: string } | { ok: false; error: string } {
  if (!ctx.applyCommand) {
    return { ok: false, error: 'Caption placement requires ctx.applyCommand.' };
  }
  const textId = newGlasswareId('gwt');
  const tr = ctx.applyCommand('molecule.addCanvasText', {
    text: {
      id: textId,
      x: opts.x,
      y: opts.y,
      text: opts.text,
      fontSize: opts.fontSize ?? 14,
      color: '#222222',
    },
  });
  if (!tr.ok) {
    return { ok: false, error: tr.error?.message ?? 'addCanvasText failed' };
  }
  return { ok: true, textId };
}

type PlacedBox = {
  kind: string;
  shapeId: string;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

function boxOf(p: PlacedBox) {
  return {
    x1: p.cx - p.width / 2,
    y1: p.cy - p.height / 2,
    x2: p.cx + p.width / 2,
    y2: p.cy + p.height / 2,
  };
}

function resolveAssemblyCenter(
  parent: PlacedBox,
  piece: { kind: string; fromPort?: string; toPort?: string; dx?: number; dy?: number },
  w: number,
  h: number,
  anchorCx: number,
  anchorCy: number,
): { ok: true; cx: number; cy: number } | { ok: false; error: string } {
  if (piece.fromPort && piece.toPort) {
    const from = getGlasswarePort(parent.kind as CanvasShapeKind, piece.fromPort);
    const to = getGlasswarePort(piece.kind as CanvasShapeKind, piece.toPort);
    if (!from) {
      return {
        ok: false,
        error: `Unknown port "${piece.fromPort}" on ${parent.kind}.`,
      };
    }
    if (!to) {
      return {
        ok: false,
        error: `Unknown port "${piece.toPort}" on ${piece.kind}.`,
      };
    }
    const compat = portCompatibilityError(from, to);
    if (compat) return { ok: false, error: compat };
    const { cx, cy } = alignPorts(boxOf(parent), from, w, h, to);
    return { ok: true, cx, cy };
  }
  return {
    ok: true,
    cx: anchorCx + (piece.dx ?? 0),
    cy: anchorCy + (piece.dy ?? 0),
  };
}

/** Place a named setup at (cx, cy) using port chains when specified. */
export function placeSetupAt(
  ctx: AiExecutionContext,
  setupName: string,
  cx: number,
  cy: number,
):
  | { ok: true; placed: PlacedGlassware[]; stackHalfH: number }
  | { ok: false; error: string } {
  const setup = resolveGlasswareSetup(setupName);
  if (!setup) {
    return { ok: false, error: `Unknown setup "${setupName}".` };
  }
  return placeSetupPieces(ctx, setup.pieces, cx, cy);
}

export function placeSetupPieces(
  ctx: AiExecutionContext,
  pieces: readonly GlasswareSetupPiece[],
  cx: number,
  cy: number,
):
  | { ok: true; placed: PlacedGlassware[]; stackHalfH: number }
  | { ok: false; error: string } {
  const placed: PlacedGlassware[] = [];
  const boxes: PlacedBox[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    const entry = getGlasswareEntry(piece.kind);
    if (!entry) {
      return { ok: false, error: `Setup references missing kind "${piece.kind}".` };
    }
    const w = entry.defaultWidth * (piece.widthScale ?? 1);
    const h = entry.defaultHeight * (piece.heightScale ?? 1);

    let pieceCx: number;
    let pieceCy: number;

    if (i === 0) {
      pieceCx = cx + (piece.dx ?? 0);
      pieceCy = cy + (piece.dy ?? 0);
    } else if (piece.attachTo != null && piece.fromPort && piece.toPort) {
      const parent = boxes[piece.attachTo];
      if (!parent) {
        return { ok: false, error: `attachTo ${piece.attachTo} out of range for piece ${i}.` };
      }
      const aligned = resolveAssemblyCenter(
        parent,
        { kind: piece.kind, fromPort: piece.fromPort, toPort: piece.toPort },
        w,
        h,
        cx,
        cy,
      );
      if (!aligned.ok) return aligned;
      pieceCx = aligned.cx;
      pieceCy = aligned.cy;
    } else if (piece.dx != null || piece.dy != null) {
      pieceCx = cx + (piece.dx ?? 0);
      pieceCy = cy + (piece.dy ?? 0);
    } else {
      return {
        ok: false,
        error: `Piece ${i} (${piece.kind}) needs attachTo+fromPort+toPort or dx/dy.`,
      };
    }

    const r = placeGlasswareShape(ctx, entry, {
      cx: pieceCx,
      cy: pieceCy,
      width: w,
      height: h,
      fillLevel: piece.fillLevel,
    });
    if (!r.ok) return r;

    const box: PlacedBox = {
      kind: piece.kind,
      shapeId: r.shapeId,
      cx: pieceCx,
      cy: pieceCy,
      width: w,
      height: h,
    };
    boxes.push(box);
    placed.push({
      ...box,
      fromPort: piece.fromPort,
      toPort: piece.toPort,
      attachTo: piece.attachTo,
    });
    minY = Math.min(minY, pieceCy - h / 2);
    maxY = Math.max(maxY, pieceCy + h / 2);
  }

  const stackHalfH = Number.isFinite(minY) ? Math.max(80, (maxY - minY) / 2) : 80;
  return { ok: true, placed, stackHalfH };
}

/** Place a custom AI assembly (`pieces[]` with port attach). */
export function placeAssemblyAt(
  ctx: AiExecutionContext,
  pieces: AssemblyPieceInput[],
  cx: number,
  cy: number,
):
  | { ok: true; placed: PlacedGlassware[]; stackHalfH: number }
  | { ok: false; error: string } {
  const placed: PlacedGlassware[] = [];
  const boxes: PlacedBox[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < pieces.length; i++) {
    const raw = pieces[i]!;
    const entry = resolveGlassware(raw.name);
    if (!entry) {
      return { ok: false, error: `Unknown glassware "${raw.name}".` };
    }
    const w = raw.width ?? entry.defaultWidth;
    const h = raw.height ?? entry.defaultHeight;

    let pieceCx: number;
    let pieceCy: number;

    if (i === 0) {
      pieceCx = cx;
      pieceCy = cy;
    } else {
      const attachTo = raw.attachTo ?? i - 1;
      const parent = boxes[attachTo];
      if (!parent) {
        return { ok: false, error: `attachTo ${attachTo} out of range for piece ${i}.` };
      }
      if (!raw.fromPort || !raw.toPort) {
        return {
          ok: false,
          error: `Piece ${i} ("${raw.name}") needs fromPort and toPort to attach.`,
        };
      }
      const aligned = resolveAssemblyCenter(
        parent,
        { kind: entry.kind, fromPort: raw.fromPort, toPort: raw.toPort },
        w,
        h,
        cx,
        cy,
      );
      if (!aligned.ok) return aligned;
      pieceCx = aligned.cx;
      pieceCy = aligned.cy;
    }

    const r = placeGlasswareShape(ctx, entry, {
      cx: pieceCx,
      cy: pieceCy,
      width: w,
      height: h,
      fillLevel: raw.fillLevel,
      fillColor: raw.fillColor,
    });
    if (!r.ok) return r;

    const box: PlacedBox = {
      kind: entry.kind,
      shapeId: r.shapeId,
      cx: pieceCx,
      cy: pieceCy,
      width: w,
      height: h,
    };
    boxes.push(box);
    placed.push({
      ...box,
      fromPort: raw.fromPort,
      toPort: raw.toPort,
      attachTo: i === 0 ? undefined : (raw.attachTo ?? i - 1),
    });
    minY = Math.min(minY, pieceCy - h / 2);
    maxY = Math.max(maxY, pieceCy + h / 2);
  }

  const stackHalfH = Number.isFinite(minY) ? Math.max(80, (maxY - minY) / 2) : 80;
  return { ok: true, placed, stackHalfH };
}

/** Place one or more vessels stacked vertically at column center. */
export function placeGlasswareNamesAt(
  ctx: AiExecutionContext,
  names: string[],
  cx: number,
  cy: number,
):
  | { ok: true; placed: PlacedGlassware[]; stackHalfH: number }
  | { ok: false; error: string } {
  const placed: PlacedGlassware[] = [];
  const gap = 12;
  let totalH = 0;
  const entries: { entry: GlasswareLibraryEntry; h: number }[] = [];
  for (const name of names) {
    const entry = resolveGlassware(name);
    if (!entry) {
      return { ok: false, error: `Unknown glassware "${name}".` };
    }
    entries.push({ entry, h: entry.defaultHeight });
    totalH += entry.defaultHeight + gap;
  }
  totalH -= gap;
  let y = cy - totalH / 2;
  for (const { entry, h } of entries) {
    const pieceCy = y + h / 2;
    const r = placeGlasswareShape(ctx, entry, { cx, cy: pieceCy });
    if (!r.ok) return r;
    placed.push({
      kind: entry.kind,
      shapeId: r.shapeId,
      cx,
      cy: pieceCy,
      width: entry.defaultWidth,
      height: h,
    });
    y += h + gap;
  }
  return { ok: true, placed, stackHalfH: totalH / 2 };
}
