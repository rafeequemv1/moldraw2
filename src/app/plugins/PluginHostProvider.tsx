import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createPluginHost,
  createBrowserInstallStore,
  type PluginHost,
} from '@moldraw/plugin-host';
import type { PluginStateRecord } from '@moldraw/plugin-host';
import type { MenuContribution, PluginContributions } from '@moldraw/plugin-sdk';
import { buildPluginServices } from './buildPluginServices';
import type { Molecule } from '@moldraw/domain';
import type { MoleculeSelection } from '@moldraw/core';

export interface PluginModalState {
  id: string;
  props: Record<string, unknown>;
}

export interface PluginHostContextValue {
  host: PluginHost;
  contributions: PluginContributions;
  catalog: ReturnType<PluginHost['listCatalog']>;
  states: PluginStateRecord[];
  modal: PluginModalState | null;
  /** Bumps when installed plugins finish loading or install state changes. */
  revision: number;
  installPlugin: (id: string) => void;
  uninstallPlugin: (id: string) => void;
  disablePlugin: (id: string) => void;
  enablePlugin: (id: string) => void;
  closeModal: () => void;
  chemistryMenus: MenuContribution[];
  refresh: () => void;
}

const PluginHostReactContext = createContext<PluginHostContextValue | null>(null);

async function syncPluginAiTools(host: PluginHost, clear = false): Promise<void> {
  const { setRuntimePluginTools, pluginAiToolToRegistered } = await import('@moldraw/ai');
  setRuntimePluginTools(clear ? [] : host.getLoadedPluginAiTools().map(pluginAiToolToRegistered));
}

export interface PluginHostProviderProps {
  children: ReactNode;
  getMolecule: () => Molecule;
  getSelection: () => MoleculeSelection;
  applyCommand: (commandId: string, input: unknown) => { ok: boolean };
  exportSmiles: () => Promise<string>;
  showToast: (message: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;
  getTheme: () => 'light' | 'dark';
  /** Bump when AI secrets change so host can reload ai-dependent plugins. */
  aiSecretsVersion?: number;
}

export function PluginHostProvider({
  children,
  getMolecule,
  getSelection,
  applyCommand,
  exportSmiles,
  showToast,
  getTheme,
  aiSecretsVersion = 0,
}: PluginHostProviderProps) {
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<PluginModalState | null>(null);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const openModal = useCallback((id: string, props: Record<string, unknown>) => {
    setModal({ id, props });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  // The host must be created exactly once per provider mount. Callers (App)
  // pass inline closures for these callbacks, so a new host per identity
  // change meant a new host on every App render: every plugin reloaded, its
  // contributions vanished and reappeared, and consumers such as the 3D
  // workspace remounted (rebuilding the WebGL viewer) on every click.
  // Services therefore call through a stable box that is refreshed with the
  // latest props after each commit (the closures only run outside render).
  const [latest] = useState(() => ({
    getMolecule,
    getSelection,
    applyCommand,
    exportSmiles,
    showToast,
    getTheme,
  }));
  useEffect(() => {
    Object.assign(latest, { getMolecule, getSelection, applyCommand, exportSmiles, showToast, getTheme });
  });

  const baseServices = useMemo(
    () =>
      buildPluginServices({
        getMolecule: () => latest.getMolecule(),
        getSelection: () => latest.getSelection(),
        applyCommand: (commandId, input) => latest.applyCommand(commandId, input),
        exportSmiles: () => latest.exportSmiles(),
        openModal,
        closeModal,
        showToast: (message, variant) => latest.showToast(message, variant),
        getTheme: () => latest.getTheme(),
        pluginId: 'host',
        pluginStoragePrefix: 'moldraw.plugin',
      }),
    [latest, openModal, closeModal],
  );

  const host = useMemo(
    () =>
      createPluginHost({
        store: createBrowserInstallStore(),
        services: baseServices,
        onStateChange: refresh,
      }),
    [baseServices, refresh],
  );

  useEffect(() => {
    void host.loadInstalledPlugins().then(async () => {
      await syncPluginAiTools(host);
      refresh();
    });
    return () => {
      void syncPluginAiTools(host, true);
    };
  }, [host, aiSecretsVersion, refresh]);

  const contributions = host.getMergedContributions();
  const chemistryMenus = contributions.menus.filter(m => m.slot === 'chemistry');

  const value: PluginHostContextValue = {
    host,
    contributions,
    catalog: host.listCatalog(),
    states: host.listInstalled(),
    revision: tick,
    modal,
    installPlugin: id => {
      const r = host.installPlugin(id);
      if (!r.ok) {
        showToast(r.error, 'error');
        return;
      }
      void host.loadInstalledPlugins().then(async () => {
        await syncPluginAiTools(host);
        refresh();
      });
    },
    uninstallPlugin: id => {
      host.uninstallPlugin(id);
      void syncPluginAiTools(host).then(() => refresh());
    },
    disablePlugin: id => {
      host.disablePlugin(id);
      void syncPluginAiTools(host).then(() => refresh());
    },
    enablePlugin: id => {
      host.enablePlugin(id);
      void host.loadInstalledPlugins().then(async () => {
        await syncPluginAiTools(host);
        refresh();
      });
    },
    closeModal,
    chemistryMenus,
    refresh,
  };

  // tick forces re-render when host notifies
  void tick;

  return (
    <PluginHostReactContext.Provider value={value}>{children}</PluginHostReactContext.Provider>
  );
}

export function usePluginHost(): PluginHostContextValue {
  const ctx = useContext(PluginHostReactContext);
  if (!ctx) {
    throw new Error('usePluginHost must be used within PluginHostProvider');
  }
  return ctx;
}

/** Optional hook when provider may be absent (e.g. tests). */
export function usePluginHostOptional(): PluginHostContextValue | null {
  return useContext(PluginHostReactContext);
}
