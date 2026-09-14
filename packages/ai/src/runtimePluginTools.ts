import type { RegisteredAiTool } from './tools/types';

let runtimePluginTools: RegisteredAiTool[] = [];

/** App/MCP sets plugin-contributed tools after host load. */
export function setRuntimePluginTools(tools: readonly RegisteredAiTool[]): void {
  runtimePluginTools = [...tools];
}

export function getRuntimePluginTools(): readonly RegisteredAiTool[] {
  return runtimePluginTools;
}

export function clearRuntimePluginTools(): void {
  runtimePluginTools = [];
}
