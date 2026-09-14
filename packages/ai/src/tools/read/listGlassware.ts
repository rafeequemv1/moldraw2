import {
  glasswareLibrarySummary,
  listGlasswareLibrary,
  listGlasswarePortSummaries,
  listGlasswareSetups,
} from '@moldraw/domain';
import { listGlasswareInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { toolOk } from '../types';

export const listGlasswareTool: RegisteredAiTool = {
  id: 'molecule.list_glassware',
  category: 'read',
  description:
    'List the lab glassware library (with joint/hose/cap port ids), named apparatus setups, and aliases for molecule.place_glassware. Use ports with pieces[] attachTo/fromPort/toPort to assemble custom pipelines. Auto-updates when vessels are added to the domain catalog.',
  inputSchema: listGlasswareInputSchema,
  handler: () =>
    toolOk({
      glassware: listGlasswareLibrary().map(e => ({
        kind: e.kind,
        category: e.category,
        label: e.label,
        summary: e.summary,
        aliases: e.aliases,
        supportsLiquid: e.supportsLiquid,
        defaultWidth: e.defaultWidth,
        defaultHeight: e.defaultHeight,
        ports: listGlasswarePortSummaries(e.kind),
      })),
      setups: listGlasswareSetups().map(s => ({
        id: s.id,
        label: s.label,
        summary: s.summary,
        pieces: s.pieces.map(p => ({
          kind: p.kind,
          attachTo: p.attachTo,
          fromPort: p.fromPort,
          toPort: p.toPort,
        })),
      })),
      portRules: 'Connect joint↔joint, hose↔hose, or cap↔joint. Piece 0 is the root; later pieces set attachTo + fromPort (on parent) + toPort (on child).',
      summary: glasswareLibrarySummary(),
    }),
};
