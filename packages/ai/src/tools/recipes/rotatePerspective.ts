import { CMD } from '@moldraw/core';
import { rotatePerspectiveInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolOk } from '../types';

export const rotatePerspectiveTool: RegisteredAiTool = {
  id: 'molecule.rotate_perspective',
  category: 'recipe',
  description:
    'Rotate the canvas 3D perspective pose by degrees (X/Y). Discrete step — not continuous scrubbing.',
  inputSchema: rotatePerspectiveInputSchema,
  handler: (input, ctx) => {
    const { degreesX = 0, degreesY = 0 } = (input ?? {}) as {
      degreesX?: number;
      degreesY?: number;
    };
    const dAngleX = (degreesX * Math.PI) / 180;
    const dAngleY = (degreesY * Math.PI) / 180;
    const result = dispatchCommand(ctx, CMD.Rotate3DPose, { dAngleX, dAngleY });
    if (!result.ok) return result;
    return toolOk({ degreesX, degreesY, dAngleX, dAngleY });
  },
};
