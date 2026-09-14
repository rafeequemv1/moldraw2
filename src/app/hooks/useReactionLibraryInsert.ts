import { useCallback } from 'react';
import type { AiExecutionContext } from '@moldraw/ai';
import { CMD } from '@moldraw/core';
import {
  REACTION_BY_ID,
  pushReactionRecent,
  reactionTemplateToSchemeInput,
} from '@moldraw/reactions';
import { canvasMutedAnnotationInk } from '../theme';

export function useReactionLibraryInsert(opts: {
  aiCtx: AiExecutionContext;
  applyCommand: (commandId: string, input: unknown) => { ok: boolean; error?: { message?: string } };
  onInserted?: (atomIds: string[]) => void;
  onError?: (message: string) => void;
}) {
  const { aiCtx, applyCommand, onInserted, onError } = opts;

  return useCallback(
    async (reactionId: string) => {
      const template = REACTION_BY_ID.get(reactionId);
      if (!template) {
        onError?.('Unknown reaction');
        return;
      }

      const scheme = reactionTemplateToSchemeInput(template);
      const result = await (await import('@moldraw/ai')).executeAiTool(
        'molecule.build_reaction_scheme',
        scheme,
        aiCtx,
      );

      if (!result.ok) {
        onError?.(result.error?.message ?? 'Could not insert reaction scheme');
        return;
      }

      const data = result.data as {
        newAtomIds?: string[];
        bounds?: { minX: number; maxX: number; minY: number; maxY: number };
      };

      if (template.mechanism?.trim() && data.bounds) {
        const mechY = data.bounds.maxY + 56;
        const mechX = (data.bounds.minX + data.bounds.maxX) / 2;
        applyCommand(CMD.AddCanvasText, {
          text: {
            id: `rxn-mech-${Date.now().toString(36)}`,
            x: mechX,
            y: mechY,
            text: template.mechanism.trim(),
            fontSize: 14,
            color: canvasMutedAnnotationInk(),
            boxWidth: Math.min(480, Math.max(240, template.mechanism.length * 5.8)),
            boxHeight: 80,
          },
        });
      }

      pushReactionRecent(reactionId);
      if (data.newAtomIds?.length) onInserted?.(data.newAtomIds);
    },
    [aiCtx, applyCommand, onError, onInserted],
  );
}
