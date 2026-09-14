import type { PluginStateRecord } from '@moldraw/plugin-host';
import type { PluginCatalogEntry } from '@moldraw/plugin-host';
import { usePluginHostOptional } from '../plugins';

function stateBadge(state: PluginStateRecord['state']): { label: string; tone: string } {
  switch (state) {
    case 'loaded':
      return { label: 'Loaded', tone: '#16a34a' };
    case 'installed':
      return { label: 'Installed', tone: '#64748b' };
    case 'failed':
      return { label: 'Failed', tone: '#dc2626' };
    case 'disabled':
      return { label: 'Disabled', tone: '#94a3b8' };
    default:
      return { label: 'Not installed', tone: '#94a3b8' };
  }
}

function PluginRow({
  entry,
  state,
  onInstall,
  onUninstall,
  onDisable,
  onEnable,
}: {
  entry: PluginCatalogEntry;
  state: PluginStateRecord;
  onInstall: () => void;
  onUninstall: () => void;
  onDisable: () => void;
  onEnable: () => void;
}) {
  const badge = stateBadge(state.state);
  const installed = state.state !== 'not_installed';
  const isDisabled = state.state === 'disabled';
  const needsAi = entry.capabilities.includes('ai');

  return (
    <div
      style={{
        border: '1px solid var(--chrome-border)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{entry.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{entry.description}</div>
          <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: badge.tone, fontWeight: 600 }}>{badge.label}</span>
            {needsAi ? <span style={{ color: 'var(--text-muted)' }}>Requires AI</span> : null}
            <span style={{ color: 'var(--text-muted)' }}>v{entry.version}</span>
          </div>
          {state.error ? (
            <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6, marginBottom: 0 }}>{state.error}</p>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          {!installed ? (
            <button type="button" className="spec-modal__btn" onClick={onInstall} aria-label={`Install ${entry.name}`}>
              Install
            </button>
          ) : (
            <>
              {isDisabled ? (
                <button type="button" className="spec-modal__btn" onClick={onEnable}>
                  Enable
                </button>
              ) : (
                <button type="button" className="spec-modal__btn" onClick={onDisable}>
                  Disable
                </button>
              )}
              <button type="button" className="spec-modal__btn" onClick={onUninstall}>
                Uninstall
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PluginsSettingsPanel() {
  const host = usePluginHostOptional();
  if (!host) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Plugin management is available in the editor.
      </p>
    );
  }

  const stateById = new Map(host.states.map(s => [s.id, s]));

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>
        Install optional features as plugins. Spectroscopy is not installed by default.
      </p>
      {host.catalog.map(entry => (
        <PluginRow
          key={entry.id}
          entry={entry}
          state={stateById.get(entry.id) ?? { id: entry.id, state: 'not_installed' }}
          onInstall={() => host.installPlugin(entry.id)}
          onUninstall={() => host.uninstallPlugin(entry.id)}
          onDisable={() => host.disablePlugin(entry.id)}
          onEnable={() => host.enablePlugin(entry.id)}
        />
      ))}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
        Build your own: see <code>documentation/plugins.md</code> and <code>@moldraw/plugin-sdk</code>.
      </p>
    </div>
  );
}
