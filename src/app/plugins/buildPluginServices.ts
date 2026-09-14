import type { Molecule } from '@moldraw/domain';
import type { MoleculeSelection } from '@moldraw/core';
import { generateStructuredJson } from '@moldraw/ai/chat';
import { toDisposable, type PluginServices } from '@moldraw/plugin-sdk';
import { moleculeToMolblock } from '@moldraw/core';
import { hasGeminiApiKey, loadAiSecrets } from '../../ai/chat/secretsStorage';

export interface BuildPluginServicesOptions {
  getMolecule: () => Molecule;
  getSelection: () => MoleculeSelection;
  applyCommand: (commandId: string, input: unknown) => { ok: boolean };
  exportSmiles: () => Promise<string>;
  openModal: (id: string, props: Record<string, unknown>) => void;
  closeModal: (id: string) => void;
  showToast: (message: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
  getTheme: () => 'light' | 'dark';
  pluginId: string;
  pluginStoragePrefix: string;
  featureFlags?: Record<string, boolean>;
}

export function buildPluginServices(opts: BuildPluginServicesOptions): PluginServices {
  const logPrefix = `[${opts.pluginId}]`;
  const storageKey = (key: string) => `${opts.pluginStoragePrefix}:${key}`;

  return {
    document: {
      getMolecule: () => opts.getMolecule(),
      getSelection: () => {
        const sel = opts.getSelection();
        return {
          atomIds: sel.atomIds,
          bondIds: sel.bondIds,
          reactionArrowIds: sel.reactionArrowId ? [sel.reactionArrowId] : [],
        };
      },
      exportMolblock: () => moleculeToMolblock(opts.getMolecule()),
      exportSmiles: () => opts.exportSmiles(),
    },
    commands: {
      execute: (commandId, input) => {
        opts.applyCommand(commandId, input);
      },
    },
    ai: {
      isAvailable: () => hasGeminiApiKey(),
      generateStructured: async ({ system, user, schema }) => {
        const secrets = loadAiSecrets();
        const apiKey = secrets.geminiApiKey;
        if (!apiKey?.trim()) {
          throw new Error('AI is not configured. Add a Gemini API key in Settings → AI.');
        }
        return generateStructuredJson({
          apiKey,
          model: secrets.geminiModel,
          system,
          user,
          schema,
        });
      },
    },
    canvas: {
      getTheme: () => opts.getTheme(),
    },
    storage: {
      get: key => {
        try {
          return localStorage.getItem(storageKey(key)) ?? undefined;
        } catch {
          return undefined;
        }
      },
      set: (key, value) => {
        try {
          localStorage.setItem(storageKey(key), value);
        } catch {
          /* ignore */
        }
      },
    },
    ui: {
      openModal: opts.openModal,
      showToast: opts.showToast,
      showPanel: opts.openModal,
    },
    logger: {
      info: (message, ...args) => console.info(logPrefix, message, ...args),
      warn: (message, ...args) => console.warn(logPrefix, message, ...args),
      error: (message, ...args) => console.error(logPrefix, message, ...args),
    },
    features: {
      isEnabled: flag => opts.featureFlags?.[flag] ?? false,
    },
    events: {
      on: () => toDisposable(() => undefined),
      emit: () => undefined,
    },
  };
}
