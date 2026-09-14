import type { ZodType } from 'zod';
import type { Disposable } from './disposable';

export interface PluginSelection {
  atomIds?: string[];
  bondIds?: string[];
  reactionArrowIds?: string[];
}

/** Read-only document access. */
export interface PluginDocumentService {
  getMolecule(): unknown;
  getSelection(): PluginSelection;
  exportMolblock(): string;
  exportSmiles(): Promise<string>;
}

/** Write path for molecule mutations. */
export interface PluginCommandsService {
  execute(commandId: string, input: unknown): void;
}

export interface PluginAiService {
  isAvailable(): boolean;
  generateStructured<T>(opts: {
    system: string;
    user: string;
    schema: ZodType<T>;
  }): Promise<T>;
}

export interface PluginStorageService {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export type PluginToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface PluginUiService {
  openModal(id: string, props: Record<string, unknown>): void;
  showToast(message: string, variant?: PluginToastVariant): void;
  showPanel(id: string, props: Record<string, unknown>): void;
}

export interface PluginLoggerService {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface PluginFeaturesService {
  isEnabled(flag: string): boolean;
}

export interface PluginEventsService {
  on(event: string, handler: (...args: unknown[]) => void): Disposable;
  emit(event: string, ...args: unknown[]): void;
}

export interface PluginCanvasService {
  getTheme(): 'light' | 'dark';
}

export interface PluginServices {
  document: PluginDocumentService;
  commands: PluginCommandsService;
  ai: PluginAiService;
  canvas: PluginCanvasService;
  storage: PluginStorageService;
  ui: PluginUiService;
  logger: PluginLoggerService;
  features: PluginFeaturesService;
  events: PluginEventsService;
}
