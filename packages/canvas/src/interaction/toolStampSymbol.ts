import { pickAtomAt } from './hitTest';
import type { InteractionContext } from './types';

/** Canvas text stamp tools (Δ, ν, ‡, …) — click empty canvas to place. */
export const STAMP_SYMBOL_BY_TOOL: Record<string, string> = {
  stamp_delta: 'Δ',
  stamp_delta_tri: '△',
  stamp_nu: 'ν',
  stamp_ts: '‡',
  stamp_celsius: '°C',
};

export const isStampSymbolTool = (toolId: string): boolean => toolId in STAMP_SYMBOL_BY_TOOL;

export const stampSymbolToolMouseDown = (ctx: InteractionContext): boolean => {
  const { e, worldPos, molecule, activeTool } = ctx;
  if (e.button !== 0) return false;
  const symbol = STAMP_SYMBOL_BY_TOOL[activeTool];
  if (!symbol || !ctx.onAddCanvasText) return true;

  const atom = pickAtomAt(molecule, worldPos, ctx.hit.atomHitRadius);
  if (!atom) {
    const id = Math.random().toString(36).substring(2, 11);
    ctx.onAddCanvasText({
      id,
      x: worldPos.x,
      y: worldPos.y,
      text: symbol,
      fontSize: symbol.length > 2 ? 18 : 22,
      color: '#0f172a',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
    });
  }
  return true;
};
