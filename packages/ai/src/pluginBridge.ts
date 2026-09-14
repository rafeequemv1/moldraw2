import type { PluginAiToolContribution } from '@moldraw/plugin-sdk';
import type { AiExecutionContext, AiToolResult } from './types';
import type { RegisteredAiTool } from './tools/types';

export function pluginAiToolToRegistered(tool: PluginAiToolContribution): RegisteredAiTool {
  return {
    id: tool.id,
    description: tool.description,
    category: tool.category,
    inputSchema: tool.inputSchema,
    handler: async (input, _ctx: AiExecutionContext): Promise<AiToolResult> => {
      try {
        const data = await tool.handler(input);
        return { ok: true, data };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: { code: 'EXECUTION', message } };
      }
    },
  };
}

export function mergeRuntimeAiTools(
  coreTools: readonly RegisteredAiTool[],
  pluginTools: readonly PluginAiToolContribution[],
): RegisteredAiTool[] {
  const pluginRegistered = pluginTools.map(pluginAiToolToRegistered);
  const coreIds = new Set(coreTools.map(t => t.id));
  const uniquePlugin = pluginRegistered.filter(t => !coreIds.has(t.id));
  return [...coreTools, ...uniquePlugin];
}
