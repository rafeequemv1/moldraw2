import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateStructuredJson } from '../chat/generateStructured';
import type { PluginServices } from '@moldraw/plugin-sdk';

const INSTALL_DIR = path.join(process.cwd(), '.moldraw');
const INSTALLED_PATH = path.join(INSTALL_DIR, 'installed-plugins.json');
const DISABLED_PATH = path.join(INSTALL_DIR, 'disabled-plugins.json');

export function createMcpInstallStore() {
  const ensure = () => {
    if (!existsSync(INSTALL_DIR)) mkdirSync(INSTALL_DIR, { recursive: true });
  };
  return {
    getInstalled: (): string[] => readJsonList(INSTALLED_PATH),
    getDisabled: (): string[] => readJsonList(DISABLED_PATH),
    setInstalled: (ids: string[]) => {
      ensure();
      writeFileSync(INSTALLED_PATH, JSON.stringify(ids, null, 2));
    },
    setDisabled: (ids: string[]) => {
      ensure();
      writeFileSync(DISABLED_PATH, JSON.stringify(ids, null, 2));
    },
  };
}

function readJsonList(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function buildHeadlessPluginServices(getMoleculeJson: () => string): PluginServices {
  const logPrefix = '[mcp-plugin]';
  return {
    document: {
      getMolecule: () => JSON.parse(getMoleculeJson()),
      getSelection: () => ({}),
      exportMolblock: () => getMoleculeJson(),
      exportSmiles: async () => '',
    },
    commands: {
      execute: () => undefined,
    },
    ai: {
      isAvailable: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
      generateStructured: async ({ system, user, schema }) => {
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set for MCP plugin AI tools.');
        return generateStructuredJson({
          apiKey,
          model: process.env.GEMINI_MODEL,
          system,
          user,
          schema,
        });
      },
    },
    canvas: { getTheme: () => 'light' as const },
    storage: {
      get: () => undefined,
      set: () => undefined,
    },
    ui: {
      openModal: () => undefined,
      showToast: () => undefined,
      showPanel: () => undefined,
    },
    logger: {
      info: (m, ...a) => console.error(logPrefix, m, ...a),
      warn: (m, ...a) => console.error(logPrefix, m, ...a),
      error: (m, ...a) => console.error(logPrefix, m, ...a),
    },
    features: { isEnabled: () => false },
    events: {
      on: () => ({ dispose: () => undefined }),
      emit: () => undefined,
    },
  };
}
