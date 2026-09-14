import type { PointerDebugInfo } from '../touch/types';

/**
 * Developer HUD (top-left, device px): last pointer's type / pressure / tilt /
 * buttons, contact size, multi-touch state and the active tool. Used to check
 * stylus + touch behaviour on real devices without DevTools. Caller must pass
 * the identity transform (call after the world-space overlay pass).
 */
export const drawPointerDebugHud = (
  ctx: CanvasRenderingContext2D,
  displayScale: number,
  info: PointerDebugInfo | null | undefined,
): void => {
  if (!info) return;
  const s = displayScale;
  const lines = [
    `${info.pointerType} #${info.pointerId}${info.isPrimary ? '' : ' (secondary)'} · ${info.phase}`,
    `pressure ${info.pressure.toFixed(2)}  tilt ${Math.round(info.tiltX)}/${Math.round(info.tiltY)}  buttons ${info.buttons}`,
    `contact ${Math.round(info.width)}×${Math.round(info.height)} px  touches ${info.touchCount}` +
      (info.gesturing ? (info.claimed ? '  gesture: selection' : '  gesture: pan/zoom') : ''),
    `tool ${info.activeTool}` + (info.rejected ? `  rejected: ${info.rejected}` : ''),
  ];
  const fontPx = 11 * s;
  const pad = 6 * s;
  const lineH = fontPx * 1.35;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = 'top';
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  const x = 8 * s;
  const y = 8 * s;
  ctx.fillStyle = info.rejected ? 'rgba(127, 29, 29, 0.85)' : 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(x, y, w + pad * 2, lineH * lines.length + pad * 2);
  ctx.fillStyle = '#f8fafc';
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * lineH));
  ctx.restore();
};
