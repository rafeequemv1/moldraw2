/**
 * 3D workspace with Structure tab (small-molecule viewer) and plugin inspector tabs.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePluginHostOptional } from '../plugins/PluginHostProvider';

export interface Viewer3DWorkspaceProps {
  structurePanel: ReactNode;
  backgroundColor?: string;
}

type ActiveTab = 'structure' | string;

export function Viewer3DWorkspace({ structurePanel, backgroundColor }: Viewer3DWorkspaceProps) {
  const pluginHost = usePluginHostOptional();
  const pluginTabs = pluginHost?.contributions.inspectorTabs ?? [];
  // revision ensures re-render after async plugin load
  void pluginHost?.revision;
  const [activeTab, setActiveTab] = useState<ActiveTab>('structure');

  const switchTab = useCallback((tabId: ActiveTab) => {
    setActiveTab(tabId);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent<string>).detail;
      if (tabId) setActiveTab(tabId);
    };
    window.addEventListener('moldraw:viewer3d-tab', handler);
    return () => window.removeEventListener('moldraw:viewer3d-tab', handler);
  }, []);

  // Tree shape must not depend on how many plugin tabs exist: plugins load
  // asynchronously (and the host can refresh), and switching between a bare
  // `structurePanel` and a wrapped one would remount the 3D viewer — a fresh
  // WebGL context, cleared scene and reset camera. Always render the same
  // wrapper and only toggle the tab strip.
  const hasPluginTabs = pluginTabs.length > 0;
  const currentTab: ActiveTab =
    activeTab === 'structure' || pluginTabs.some(tab => tab.id === activeTab)
      ? activeTab
      : 'structure';
  const structureVisible = currentTab === 'structure';

  return (
    <div className="viewer3d-workspace">
      {hasPluginTabs ? (
        <div className="viewer3d-workspace__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={structureVisible}
            className={[
              'viewer3d-workspace__tab',
              structureVisible ? 'viewer3d-workspace__tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => switchTab('structure')}
          >
            Structure
          </button>
          {pluginTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={currentTab === tab.id}
              className={[
                'viewer3d-workspace__tab',
                currentTab === tab.id ? 'viewer3d-workspace__tab--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => switchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={[
          'viewer3d-workspace__panel',
          !structureVisible ? 'viewer3d-workspace__panel--hidden' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role={hasPluginTabs ? 'tabpanel' : undefined}
        hidden={!structureVisible}
      >
        {structurePanel}
      </div>

      {pluginTabs.map(tab => {
        const TabComponent = tab.component;
        return (
          <div
            key={tab.id}
            className={[
              'viewer3d-workspace__panel',
              currentTab !== tab.id ? 'viewer3d-workspace__panel--hidden' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="tabpanel"
            hidden={currentTab !== tab.id}
          >
            {currentTab === tab.id && (
              <TabComponent backgroundColor={backgroundColor} />
            )}
          </div>
        );
      })}
    </div>
  );
}
