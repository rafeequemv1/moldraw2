/**
 * CanvasRenderingContext2D subset that records drawing as vector SVG.
 * Used so the existing canvas render pipeline can emit real paths/text
 * instead of embedding a PNG in an SVG wrapper.
 *
 * Runs without a DOM (Node / MCP): text metrics fall back to
 * `headlessFontMetrics` and image sources are only inspected when the
 * corresponding DOM constructors exist.
 */
import { fontSpecFromCss, headlessTextMetrics } from './headlessFontMetrics';

type Mat = { a: number; b: number; c: number; d: number; e: number; f: number };

const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function apply(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function isIdentity(m: Mat): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Last stop is good enough for SVG (canvas gradients stay on the live editor). */
class SvgSolidGradient {
  color = '#000';
  addColorStop(_offset: number, color: string): void {
    if (color) this.color = color;
  }
}

function cssColor(style: string | CanvasGradient | CanvasPattern): string {
  if (typeof style === 'string' && style) return style;
  if (style && typeof style === 'object' && 'color' in style) {
    const c = (style as { color?: unknown }).color;
    if (typeof c === 'string' && c) return c;
  }
  return '#000';
}

function parseFont(font: string): { size: string; weight: string; style: string; family: string } {
  let rest = font.trim();
  let style = 'normal';
  let weight = 'normal';
  if (/^italic\b/i.test(rest)) {
    style = 'italic';
    rest = rest.replace(/^italic\s+/i, '');
  } else if (/^oblique\b/i.test(rest)) {
    style = 'oblique';
    rest = rest.replace(/^oblique\s+/i, '');
  }
  const weightMatch = rest.match(/^(bold|normal|[1-9]00)\s+/i);
  if (weightMatch) {
    weight = weightMatch[1]!;
    rest = rest.slice(weightMatch[0].length);
  }
  const sizeMatch = rest.match(/^(\d+(?:\.\d+)?)(px|pt|em)\s+/i);
  const size = sizeMatch ? `${sizeMatch[1]}${sizeMatch[2]}` : '16px';
  const family = sizeMatch ? rest.slice(sizeMatch[0].length).trim() || 'sans-serif' : rest || 'sans-serif';
  return { size, weight, style, family };
}

function textAnchor(align: CanvasTextAlign): string {
  if (align === 'center') return 'middle';
  if (align === 'right' || align === 'end') return 'end';
  return 'start';
}

function uniformScale(m: Mat): number {
  return (Math.hypot(m.a, m.b) + Math.hypot(m.c, m.d)) / 2;
}

/** Canvas middle/top/bottom → SVG alphabetic y, using the same font metrics as the editor. */
function alphabeticY(
  y: number,
  baseline: CanvasTextBaseline,
  font: string,
  text: string,
): number {
  const ctx = getMeasureCtx();
  let m: TextMetrics;
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    m = ctx.measureText(text || 'Hg');
  } else {
    m = headlessTextMetrics(text || 'Hg', fontSpecFromCss(font));
  }
  const ascent = m.actualBoundingBoxAscent || parseFloat(parseFont(font).size) * 0.8;
  const descent = m.actualBoundingBoxDescent || parseFloat(parseFont(font).size) * 0.2;
  if (baseline === 'middle') return y + (ascent - descent) / 2;
  if (baseline === 'top' || baseline === 'hanging') return y + ascent;
  if (baseline === 'bottom' || baseline === 'ideographic') return y - descent;
  return y;
}

type PathCmd =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'Q'; cpx: number; cpy: number; x: number; y: number }
  | { t: 'C'; cpx1: number; cpy1: number; cpx2: number; cpy2: number; x: number; y: number }
  | { t: 'A'; rx: number; ry: number; rot: number; large: 0 | 1; sweep: 0 | 1; x: number; y: number }
  | { t: 'Z' };

type StyleState = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  dash: number[];
  lineDashOffset: number;
};

type Saved = StyleState & { mat: Mat; clipDepth: number };

function cloneStyle(s: StyleState): StyleState {
  return { ...s, dash: s.dash.slice() };
}

function pathToD(cmds: PathCmd[]): string {
  const out: string[] = [];
  for (const c of cmds) {
    if (c.t === 'M') out.push(`M${fmt(c.x)} ${fmt(c.y)}`);
    else if (c.t === 'L') out.push(`L${fmt(c.x)} ${fmt(c.y)}`);
    else if (c.t === 'Q') out.push(`Q${fmt(c.cpx)} ${fmt(c.cpy)} ${fmt(c.x)} ${fmt(c.y)}`);
    else if (c.t === 'C') {
      out.push(
        `C${fmt(c.cpx1)} ${fmt(c.cpy1)} ${fmt(c.cpx2)} ${fmt(c.cpy2)} ${fmt(c.x)} ${fmt(c.y)}`,
      );
    } else if (c.t === 'A') {
      out.push(
        `A${fmt(c.rx)} ${fmt(c.ry)} ${fmt(c.rot)} ${c.large} ${c.sweep} ${fmt(c.x)} ${fmt(c.y)}`,
      );
    } else out.push('Z');
  }
  return out.join(' ');
}

function flattenPath(cmds: PathCmd[], mat: Mat): PathCmd[] {
  const out: PathCmd[] = [];
  for (const c of cmds) {
    if (c.t === 'Z') {
      out.push(c);
      continue;
    }
    if (c.t === 'M' || c.t === 'L') {
      const p = apply(mat, c.x, c.y);
      out.push({ t: c.t, x: p.x, y: p.y });
      continue;
    }
    if (c.t === 'Q') {
      const cp = apply(mat, c.cpx, c.cpy);
      const p = apply(mat, c.x, c.y);
      out.push({ t: 'Q', cpx: cp.x, cpy: cp.y, x: p.x, y: p.y });
      continue;
    }
    if (c.t === 'C') {
      const c1 = apply(mat, c.cpx1, c.cpy1);
      const c2 = apply(mat, c.cpx2, c.cpy2);
      const p = apply(mat, c.x, c.y);
      out.push({ t: 'C', cpx1: c1.x, cpy1: c1.y, cpx2: c2.x, cpy2: c2.y, x: p.x, y: p.y });
      continue;
    }
    const sx = Math.hypot(mat.a, mat.b);
    const sy = Math.hypot(mat.c, mat.d);
    const rot = (Math.atan2(mat.b, mat.a) * 180) / Math.PI;
    const p = apply(mat, c.x, c.y);
    out.push({
      t: 'A',
      rx: c.rx * sx,
      ry: c.ry * sy,
      rot: c.rot + rot,
      large: c.large,
      sweep: c.sweep,
      x: p.x,
      y: p.y,
    });
  }
  return out;
}

/** `instanceof` guards that do not throw when the DOM constructors are absent (Node). */
function isHtmlImage(img: unknown): img is HTMLImageElement {
  return typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement;
}

function isHtmlCanvas(img: unknown): img is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement;
}

function imageHref(img: CanvasImageSource): string | null {
  if (isHtmlImage(img)) return img.src || null;
  if (isHtmlCanvas(img)) {
    try {
      return img.toDataURL('image/png');
    } catch {
      return null;
    }
  }
  if (typeof SVGImageElement !== 'undefined' && img instanceof SVGImageElement) {
    return img.href.baseVal || null;
  }
  return null;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  measureCtx = c.getContext('2d');
  return measureCtx;
}

export class SvgExportContext {
  readonly canvas: { width: number; height: number };
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  miterLimit = 10;
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineDashOffset = 0;
  shadowBlur = 0;
  shadowColor = 'rgba(0,0,0,0)';
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  direction: CanvasDirection = 'ltr';
  imageSmoothingEnabled = true;

  private mat: Mat = { ...IDENTITY };
  private dash: number[] = [];
  private path: PathCmd[] = [];
  private current: { x: number; y: number } | null = null;
  private stack: Saved[] = [];
  private clipDepth = 0;
  private defs: string[] = [];
  private body: string[] = [];
  private clipSeq = 0;

  constructor(width: number, height: number) {
    this.canvas = { width, height };
  }

  save(): void {
    this.stack.push({
      ...cloneStyle(this.style()),
      mat: { ...this.mat },
      clipDepth: this.clipDepth,
    });
  }

  restore(): void {
    const prev = this.stack.pop();
    if (!prev) return;
    while (this.clipDepth > prev.clipDepth) {
      this.body.push('</g>');
      this.clipDepth -= 1;
    }
    this.fillStyle = prev.fillStyle;
    this.strokeStyle = prev.strokeStyle;
    this.lineWidth = prev.lineWidth;
    this.lineCap = prev.lineCap;
    this.lineJoin = prev.lineJoin;
    this.miterLimit = prev.miterLimit;
    this.globalAlpha = prev.globalAlpha;
    this.font = prev.font;
    this.textAlign = prev.textAlign;
    this.textBaseline = prev.textBaseline;
    this.dash = prev.dash.slice();
    this.lineDashOffset = prev.lineDashOffset;
    this.mat = prev.mat;
  }

  translate(x: number, y: number): void {
    this.mat = mul(this.mat, { a: 1, b: 0, c: 0, d: 1, e: x, f: y });
  }

  scale(x: number, y: number): void {
    this.mat = mul(this.mat, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
  }

  rotate(rad: number): void {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    this.mat = mul(this.mat, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.mat = mul(this.mat, { a, b, c, d, e, f });
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.mat = { a, b, c, d, e, f };
  }

  resetTransform(): void {
    this.mat = { ...IDENTITY };
  }

  beginPath(): void {
    this.path = [];
    this.current = null;
  }

  closePath(): void {
    if (this.path.length === 0) return;
    this.path.push({ t: 'Z' });
  }

  moveTo(x: number, y: number): void {
    this.path.push({ t: 'M', x, y });
    this.current = { x, y };
  }

  lineTo(x: number, y: number): void {
    if (!this.current) this.path.push({ t: 'M', x, y });
    else this.path.push({ t: 'L', x, y });
    this.current = { x, y };
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    if (!this.current) this.moveTo(cpx, cpy);
    this.path.push({ t: 'Q', cpx, cpy, x, y });
    this.current = { x, y };
  }

  bezierCurveTo(
    cpx1: number,
    cpy1: number,
    cpx2: number,
    cpy2: number,
    x: number,
    y: number,
  ): void {
    if (!this.current) this.moveTo(cpx1, cpy1);
    this.path.push({ t: 'C', cpx1, cpy1, cpx2, cpy2, x, y });
    this.current = { x, y };
  }

  arc(
    x: number,
    y: number,
    r: number,
    start: number,
    end: number,
    counterclockwise = false,
  ): void {
    this.appendEllipse(x, y, r, r, 0, start, end, counterclockwise);
  }

  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    counterclockwise = false,
  ): void {
    this.appendEllipse(x, y, rx, ry, rotation, start, end, counterclockwise);
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  roundRect(x: number, y: number, w: number, h: number, radii: number | number[] = 0): void {
    const rr = Math.max(0, typeof radii === 'number' ? radii : radii[0] ?? 0);
    const r = Math.min(rr, Math.abs(w) / 2, Math.abs(h) / 2);
    if (r <= 0) {
      this.rect(x, y, w, h);
      return;
    }
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
  }

  createLinearGradient(): CanvasGradient {
    return new SvgSolidGradient() as unknown as CanvasGradient;
  }

  createRadialGradient(): CanvasGradient {
    return new SvgSolidGradient() as unknown as CanvasGradient;
  }

  fill(_fillRule?: CanvasFillRule): void {
    this.emitPath({ fill: true, stroke: false });
  }

  stroke(): void {
    this.emitPath({ fill: false, stroke: true });
  }

  clip(): void {
    if (this.path.length === 0) return;
    this.clipSeq += 1;
    const id = `md-clip-${this.clipSeq}`;
    const d = pathToD(flattenPath(this.path, this.mat));
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    this.clipDepth += 1;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.body.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"${this.transformAttr()} ${this.paintAttrs({ fill: true, stroke: false })}/>`,
    );
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this.body.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"${this.transformAttr()} ${this.paintAttrs({ fill: false, stroke: true })}/>`,
    );
  }

  clearRect(): void {
    /* export surfaces start clear */
  }

  fillText(text: string, x: number, y: number): void {
    this.emitText(text, x, y, false);
  }

  strokeText(text: string, x: number, y: number): void {
    this.emitText(text, x, y, true);
  }

  measureText(text: string): TextMetrics {
    const ctx = getMeasureCtx();
    if (ctx) {
      ctx.font = this.font;
      ctx.textAlign = this.textAlign;
      ctx.textBaseline = this.textBaseline;
      return ctx.measureText(text);
    }
    return headlessTextMetrics(text, fontSpecFromCss(this.font));
  }

  setLineDash(segments: number[]): void {
    this.dash = segments.slice();
  }

  getLineDash(): number[] {
    return this.dash.slice();
  }

  drawImage(image: CanvasImageSource, dx: number, dy: number, dw?: number, dh?: number): void {
    const href = imageHref(image);
    if (!href) return;
    const w =
      dw ??
      (isHtmlImage(image)
        ? image.naturalWidth || image.width
        : isHtmlCanvas(image)
          ? image.width
          : 0);
    const h =
      dh ??
      (isHtmlImage(image)
        ? image.naturalHeight || image.height
        : isHtmlCanvas(image)
          ? image.height
          : 0);
    if (w <= 0 || h <= 0) return;
    this.body.push(
      `<image href="${esc(href)}" x="${fmt(dx)}" y="${fmt(dy)}" width="${fmt(w)}" height="${fmt(h)}"${this.transformAttr()} preserveAspectRatio="none" opacity="${fmt(this.globalAlpha)}"/>`,
    );
  }

  /** Emit an XML comment into the document body (headless placeholders, provenance). */
  comment(text: string): void {
    this.body.push(`<!-- ${text.replace(/--/g, '- -')} -->`);
  }

  toSvgDocument(): string {
    const close = '</g>'.repeat(this.clipDepth);
    const defs = this.defs.length ? `<defs>${this.defs.join('')}</defs>\n` : '';
    const w = this.canvas.width;
    const h = this.canvas.height;
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${fmt(w)}" height="${fmt(h)}" viewBox="0 0 ${fmt(w)} ${fmt(h)}">\n` +
      defs +
      this.body.join('\n') +
      close +
      `\n</svg>\n`
    );
  }

  private style(): StyleState {
    return {
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      miterLimit: this.miterLimit,
      globalAlpha: this.globalAlpha,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      dash: this.dash,
      lineDashOffset: this.lineDashOffset,
    };
  }

  private transformAttr(): string {
    if (isIdentity(this.mat)) return '';
    const { a, b, c, d, e, f } = this.mat;
    return ` transform="matrix(${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(d)} ${fmt(e)} ${fmt(f)})"`;
  }

  private paintAttrs(kind: { fill: boolean; stroke: boolean }, strokeScale = 1): string {
    const parts: string[] = [];
    const alpha = this.globalAlpha;
    if (kind.fill) {
      parts.push(`fill="${esc(cssColor(this.fillStyle))}"`);
      if (alpha < 1) parts.push(`fill-opacity="${fmt(alpha)}"`);
    } else {
      parts.push('fill="none"');
    }
    if (kind.stroke) {
      const sw = this.lineWidth * strokeScale;
      parts.push(`stroke="${esc(cssColor(this.strokeStyle))}"`);
      parts.push(`stroke-width="${fmt(sw)}"`);
      parts.push(`stroke-linecap="${this.lineCap}"`);
      parts.push(`stroke-linejoin="${this.lineJoin}"`);
      if (this.lineJoin === 'miter') parts.push(`stroke-miterlimit="${fmt(this.miterLimit)}"`);
      if (this.dash.length) {
        parts.push(`stroke-dasharray="${this.dash.map(n => fmt(n * strokeScale)).join(' ')}"`);
      }
      if (this.lineDashOffset) {
        parts.push(`stroke-dashoffset="${fmt(this.lineDashOffset * strokeScale)}"`);
      }
      if (alpha < 1) parts.push(`stroke-opacity="${fmt(alpha)}"`);
    } else {
      parts.push('stroke="none"');
    }
    return parts.join(' ');
  }

  private emitPath(kind: { fill: boolean; stroke: boolean }): void {
    if (this.path.length === 0) return;
    const s = uniformScale(this.mat);
    this.body.push(
      `<path d="${pathToD(flattenPath(this.path, this.mat))}" ${this.paintAttrs(kind, s)}/>`,
    );
  }

  private emitText(text: string, x: number, y: number, strokeOnly: boolean): void {
    const f = parseFont(this.font);
    const yAlpha = alphabeticY(y, this.textBaseline, this.font, text);
    const paint = strokeOnly
      ? this.paintAttrs({ fill: false, stroke: true })
      : this.paintAttrs({ fill: true, stroke: false });
    this.body.push(
      `<text x="${fmt(x)}" y="${fmt(yAlpha)}" font-family="${esc(f.family)}" font-size="${esc(f.size)}" font-weight="${esc(f.weight)}" font-style="${esc(f.style)}" text-anchor="${textAnchor(this.textAlign)}" dominant-baseline="alphabetic"${this.transformAttr()} ${paint}>${esc(text)}</text>`,
    );
  }

  private appendEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    ccw: boolean,
  ): void {
    const tau = Math.PI * 2;
    const s = start;
    const e = end;
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx < 0 || ry < 0) return;

    const pointAt = (ang: number) => {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const dx = rx * Math.cos(ang);
      const dy = ry * Math.sin(ang);
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    };

    let delta = e - s;
    if (ccw) {
      while (delta > 0) delta -= tau;
      if (Math.abs(delta) < 1e-10) delta = -tau;
    } else {
      while (delta < 0) delta += tau;
      if (Math.abs(delta) < 1e-10) delta = tau;
    }
    if (Math.abs(delta) > tau) delta = ccw ? -tau : tau;

    const startPt = pointAt(s);
    if (this.current) this.lineTo(startPt.x, startPt.y);
    else this.moveTo(startPt.x, startPt.y);

    const rotDeg = (rotation * 180) / Math.PI;
    const sweep: 0 | 1 = ccw ? 0 : 1;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / Math.PI));
    for (let i = 1; i <= steps; i++) {
      const ang = s + (delta * i) / steps;
      const prev = s + (delta * (i - 1)) / steps;
      const stepDelta = ang - prev;
      const large: 0 | 1 = Math.abs(stepDelta) > Math.PI + 1e-10 ? 1 : 0;
      const p = pointAt(ang);
      this.path.push({
        t: 'A',
        rx,
        ry,
        rot: rotDeg,
        large,
        sweep,
        x: p.x,
        y: p.y,
      });
      this.current = p;
    }
  }
}

export function asCanvasContext(svg: SvgExportContext): CanvasRenderingContext2D {
  return svg as unknown as CanvasRenderingContext2D;
}
