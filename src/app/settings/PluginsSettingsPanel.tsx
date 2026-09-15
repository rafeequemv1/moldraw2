import type { PluginStateRecord } from '@moldraw/plugin-host';
import type { PluginCatalogEntry } from '@moldraw/plugin-host';
import { usePluginHostOptional } from '../plugins';
import { useI18n } from '../i18n';

function stateBadgeKey(state: PluginStateRecord['state']): string {
  switch (state) {
    case 'loaded':
      return 'settings.plugins.stateLoaded';
    case 'installed':
      return 'settings.plugins.stateInstalled';
    case 'failed':
      return 'settings.plugins.stateFailed';
    case 'disabled':
      return 'settings.plugins.stateDisabled';
    default:
      return 'settings.plugins.stateNotInstalled';
  }
}

function stateBadgeTone(state: PluginStateRecord['state']): string {
  switch (state) {
    case 'loaded':
      return 'var(--primary)';
    case 'failed':
      return 'var(--md-danger-soft)';
    default:
      return 'var(--text-main)';
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
  const { t } = useI18n();
  const badgeTone = stateBadgeTone(state.state);
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
          <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {entry.name}
            {entry.id === 'smart-draw' ? (
              <span className="app-top-bar__beta" title={t('settings.beta')}>
                {t('settings.beta')}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{entry.description}</div>
          <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: badgeTone, fontWeight: 600 }}>{t(stateBadgeKey(state.state))}</span>
            {needsAi ? <span style={{ color: 'var(--text-muted)' }}>{t('settings.plugins.requiresAi')}</span> : null}
            <span style={{ color: 'var(--text-muted)' }}>v{entry.version}</span>
          </div>
          {state.error ? (
            <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6, marginBottom: 0 }}>{state.error}</p>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          {!installed ? (
            <button
              type="button"
              className="spec-modal__btn"
              onClick={onInstall}
              aria-label={t('settings.plugins.installAria', { name: entry.name })}
            >
              {t('settings.plugins.install')}
            </button>
          ) : (
            <>
              {isDisabled ? (
                <button type="button" className="spec-modal__btn" onClick={onEnable}>
                  {t('settings.plugins.enable')}
                </button>
              ) : (
                <button type="button" className="spec-modal__btn" onClick={onDisable}>
                  {t('settings.plugins.disable')}
                </button>
              )}
              <button type="button" className="spec-modal__btn" onClick={onUninstall}>
                {t('settings.plugins.uninstall')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PluginsSettingsPanel() {
  const { t } = useI18n();
  const host = usePluginHostOptional();
  if (!host) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {t('settings.plugins.unavailable')}
      </p>
    );
  }

  const stateById = new Map(host.states.map(s => [s.id, s]));

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>
        {t('settings.plugins.intro')}
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
        {t('settings.plugins.buildYourOwn')}
      </p>
    </div>
  );
}
