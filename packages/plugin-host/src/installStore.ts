import { PLUGIN_DEFAULT_INSTALLED_IDS } from './generated/catalog';

export type PluginRuntimeState =
  | 'not_installed'
  | 'installed'
  | 'loaded'
  | 'failed'
  | 'disabled';

export interface PluginStateRecord {
  id: string;
  state: PluginRuntimeState;
  error?: string;
}

export interface InstallStore {
  getInstalled(): string[];
  getDisabled(): string[];
  setInstalled(ids: string[]): void;
  setDisabled(ids: string[]): void;
}

const INSTALLED_KEY = 'moldraw.plugins.installed';
const DISABLED_KEY = 'moldraw.plugins.disabled';
/** Bump when a former defaultInstalled plugin becomes opt-in. */
const DEFAULTS_REV_KEY = 'moldraw.plugins.defaultsRev';
const DEFAULTS_REV = '3';
/** Dropped from first-visit defaults in rev 2 (was auto-installed with proteins). */
const REV2_OPT_IN_IDS = ['smart-draw'] as const;
/** Added as a default in rev 3 (Simple structure theme). */
const REV3_DEFAULT_ADD_IDS = ['themes'] as const;

/** Merge catalog defaultInstalled plugins into the store (idempotent). */
export function ensureDefaultPluginsInstalled(store: InstallStore): void {
  const installed = store.getInstalled();
  const missing = PLUGIN_DEFAULT_INSTALLED_IDS.filter(id => !installed.includes(id));
  if (missing.length > 0) {
    store.setInstalled([...installed, ...missing]);
  }
}

export function createMemoryInstallStore(
  initialInstalled: string[] = [],
  initialDisabled: string[] = [],
): InstallStore {
  let installed = [...initialInstalled];
  let disabled = [...initialDisabled];
  return {
    getInstalled: () => [...installed],
    getDisabled: () => [...disabled],
    setInstalled: ids => {
      installed = [...ids];
    },
    setDisabled: ids => {
      disabled = [...ids];
    },
  };
}

export function createBrowserInstallStore(): InstallStore {
  const read = (key: string): string[] => {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  const write = (key: string, ids: string[]) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(ids));
  };

  // First visit: seed plugins marked defaultInstalled in catalog metadata.
  if (typeof localStorage !== 'undefined' && localStorage.getItem(INSTALLED_KEY) === null) {
    write(INSTALLED_KEY, [...PLUGIN_DEFAULT_INSTALLED_IDS]);
  }

  // One-shot: uninstall plugins that used to ship enabled (Smart Draw → Settings).
  if (typeof localStorage !== 'undefined' && localStorage.getItem(DEFAULTS_REV_KEY) !== DEFAULTS_REV) {
    const installed = read(INSTALLED_KEY).filter(id => !(REV2_OPT_IN_IDS as readonly string[]).includes(id));
    for (const id of REV3_DEFAULT_ADD_IDS) {
      if (!installed.includes(id)) installed.push(id);
    }
    write(INSTALLED_KEY, installed);
    localStorage.setItem(DEFAULTS_REV_KEY, DEFAULTS_REV);
  }

  return {
    getInstalled: () => read(INSTALLED_KEY),
    getDisabled: () => read(DISABLED_KEY),
    setInstalled: ids => write(INSTALLED_KEY, ids),
    setDisabled: ids => write(DISABLED_KEY, ids),
  };
}

export function createFileInstallStore(
  readFile: (path: string) => string | null,
  writeFile: (path: string, content: string) => void,
  installedPath: string,
  disabledPath: string,
): InstallStore {
  const read = (path: string): string[] => {
    const raw = readFile(path);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  const write = (path: string, ids: string[]) => {
    writeFile(path, JSON.stringify(ids, null, 2));
  };
  return {
    getInstalled: () => read(installedPath),
    getDisabled: () => read(disabledPath),
    setInstalled: ids => write(installedPath, ids),
    setDisabled: ids => write(disabledPath, ids),
  };
}
