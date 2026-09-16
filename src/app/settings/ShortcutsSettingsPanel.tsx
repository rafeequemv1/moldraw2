/**
 * Settings → Shortcuts: list + rebind key chords (persisted in AppSettings).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  SHORTCUT_ACTION_DEFS,
  FIXED_SHORTCUT_ROWS,
  chordFromKeyboardEvent,
  findBindingConflict,
  formatChordKeys,
  resolveShortcutBindings,
  type KeyChord,
  type ShortcutActionId,
  type ShortcutBindingsMap,
} from '../keyboard/shortcutBindings';
import { useI18n } from '../i18n';

export interface ShortcutsSettingsPanelProps {
  bindingsOverride: ShortcutBindingsMap | undefined;
  onChangeBindings: (next: ShortcutBindingsMap) => void;
  onResetAll: () => void;
  showDescriptions?: boolean;
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
  alignItems: 'center',
  padding: '7px 0',
  borderBottom: '1px solid var(--chrome-border)',
  fontSize: 12,
  color: 'var(--text-main)',
};

const Kbd = ({ children }: { children: string }) => (
  <kbd className="app-settings-kbd" style={{
    display: 'inline-block',
    minWidth: 18,
    padding: '1px 5px',
    fontFamily: '"SF Mono", Menlo, Consolas, monospace',
    fontSize: 10.5,
    fontWeight: 600,
    color: 'var(--text-main)',
    background: 'var(--chrome-input-bg)',
    border: '1px solid var(--chrome-border-strong)',
    borderBottomWidth: 2,
    borderRadius: 'var(--radius-control)',
  }}>
    {children}
  </kbd>
);

const ChordDisplay = ({ chords }: { chords: KeyChord[] }) => {
  const { t } = useI18n();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  if (!chords.length) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.shortcuts.notSet')}</span>;
  }
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {chords.map((chord, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {i > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('settings.shortcuts.or')}</span>}
          {formatChordKeys(chord, mac).map((k, j) => (
            <span key={j} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {j > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+</span>}
              <Kbd>{k}</Kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
};

export function ShortcutsSettingsPanel({
  bindingsOverride,
  onChangeBindings,
  onResetAll,
  showDescriptions = false,
}: ShortcutsSettingsPanelProps) {
  const { t } = useI18n();
  const bindings = useMemo(
    () => resolveShortcutBindings(bindingsOverride),
    [bindingsOverride],
  );
  const [listeningId, setListeningId] = useState<ShortcutActionId | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!listeningId) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListeningId(null);
        setConflictMsg(null);
        return;
      }
      const chord = chordFromKeyboardEvent(e);
      if (!chord) return;
      const nextChords = [chord];
      const conflict = findBindingConflict(listeningId, nextChords, bindings);
      if (conflict) {
        const other = SHORTCUT_ACTION_DEFS.find(d => d.id === conflict);
        setConflictMsg(
          t('settings.shortcuts.conflict', { action: other?.label ?? conflict }),
        );
        return;
      }
      onChangeBindings({
        ...(bindingsOverride ?? {}),
        [listeningId]: nextChords,
      });
      setListeningId(null);
      setConflictMsg(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listeningId, bindings, bindingsOverride, onChangeBindings, t]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof SHORTCUT_ACTION_DEFS>();
    for (const def of SHORTCUT_ACTION_DEFS) {
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return [...map.entries()];
  }, []);

  const fixedByGroup = useMemo(() => {
    const map = new Map<string, typeof FIXED_SHORTCUT_ROWS>();
    for (const row of FIXED_SHORTCUT_ROWS) {
      const list = map.get(row.group) ?? [];
      list.push(row);
      map.set(row.group, list);
    }
    return map;
  }, []);

  const leftoverFixedGroups = useMemo(() => {
    const editable = new Set(groups.map(([name]) => name));
    return [...fixedByGroup.entries()].filter(([name]) => !editable.has(name));
  }, [groups, fixedByGroup]);

  const resetOne = (id: ShortcutActionId) => {
    const next = { ...(bindingsOverride ?? {}) };
    delete next[id];
    onChangeBindings(next);
    setConflictMsg(null);
  };

  return (
    <div>
      {showDescriptions ? (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('settings.shortcuts.introBefore')}{' '}
          <strong style={{ color: 'var(--text-main)' }}>{t('settings.shortcuts.introEdit')}</strong>
          {t('settings.shortcuts.introAfter')}
        </p>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          type="button"
          className="app-settings-btn-secondary"
          onClick={() => {
            onResetAll();
            setConflictMsg(null);
            setListeningId(null);
          }}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--chrome-accent)',
            background: 'transparent',
            border: '1px solid var(--chrome-border-strong)',
            borderRadius: 'var(--radius-control)',
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          {t('settings.shortcuts.resetAll')}
        </button>
      </div>
      {conflictMsg && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--md-danger-soft)' }}>{conflictMsg}</p>
      )}

      {groups.map(([group, defs]) => (
        <section key={group} style={{ marginBottom: 14 }}>
          <h3
            style={{
              margin: '0 0 4px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {group}
          </h3>
          {defs.map(def => {
            const chords = bindings[def.id];
            const isListening = listeningId === def.id;
            const isCustom = Boolean(bindingsOverride?.[def.id]);
            return (
              <div key={def.id} style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 600 }}>{def.label}</div>
                  {isListening ? (
                    <div style={{ fontSize: 11, color: 'var(--chrome-accent)', marginTop: 2 }}>
                      {t('settings.shortcuts.pressKeyCombination')}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ChordDisplay chords={chords ?? []} />
                  <button
                    type="button"
                    className="app-settings-btn-secondary"
                    onClick={() => {
                      setListeningId(def.id);
                      setConflictMsg(null);
                    }}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-control)',
                      border: '1px solid var(--chrome-border-strong)',
                      background: isListening ? 'var(--chrome-hover)' : 'var(--chrome-input-bg)',
                      cursor: 'pointer',
                      color: 'var(--text-main)',
                    }}
                  >
                    {isListening ? t('settings.shortcuts.listening') : t('settings.shortcuts.edit')}
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      title={t('settings.shortcuts.restoreDefault')}
                      onClick={() => resetOne(def.id)}
                      style={{
                        fontSize: 11,
                        padding: '3px 6px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {t('settings.shortcuts.reset')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {fixedByGroup.get(group)?.map((row, i) => (
            <div key={`${group}-fixed-${i}`} style={rowStyle}>
              <span>{row.label}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {row.keys.map((combo, ci) => (
                  <span key={ci} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {ci > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('settings.shortcuts.or')}</span>
                    )}
                    {combo.map((k, ki) => (
                      <span key={ki} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        {ki > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>
      ))}

      {leftoverFixedGroups.map(([group, rows]) => (
        <section key={group} style={{ marginTop: 8, marginBottom: 14 }}>
          <h3
            style={{
              margin: '0 0 4px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {group}
          </h3>
          {rows.map((row, i) => (
            <div key={`${group}-${i}`} style={rowStyle}>
              <span>{row.label}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {row.keys.map((combo, ci) => (
                  <span key={ci} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {ci > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('settings.shortcuts.or')}</span>
                    )}
                    {combo.map((k, ki) => (
                      <span key={ki} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        {ki > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
