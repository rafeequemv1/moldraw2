import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import type { DocumentTab } from '../projects/types';
import { useI18n } from '../i18n';

export interface DocumentTabBarProps {
  tabs: DocumentTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onRenameTab: (id: string, name: string) => void;
}

type TabMenu = { tabId: string; x: number; y: number };

export function DocumentTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onRenameTab,
}: DocumentTabBarProps) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<TabMenu | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingId) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  if (tabs.length === 0) return null;

  const beginRename = (tab: DocumentTab) => {
    setMenu(null);
    setEditingId(tab.id);
    setDraft(tab.name);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = draft.trim();
    const tab = tabs.find(t => t.id === editingId);
    if (trimmed && tab && trimmed !== tab.name) {
      onRenameTab(editingId, trimmed);
    }
    setEditingId(null);
  };

  const menuTab = menu ? tabs.find(t => t.id === menu.tabId) : undefined;

  return (
    <div className="document-tab-bar">
      <div className="document-tab-bar__scroll">
        <div className="document-tab-bar__tabs" role="tablist" aria-label={t('tabs.openDesignsAria')}>
          {tabs.map(tab => {
            const active = tab.id === activeTabId;
            const editing = tab.id === editingId;
            return (
              <div
                key={tab.id}
                className={`document-tab-bar__tab${active ? ' document-tab-bar__tab--active' : ''}${
                  editing ? ' document-tab-bar__tab--editing' : ''
                }`}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (!editing) onSelectTab(tab.id);
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
                }}
              >
                {editing ? (
                  <input
                    ref={inputRef}
                    className="document-tab-bar__tab-input"
                    value={draft}
                    aria-label={t('tabs.designNameAria')}
                    onChange={e => setDraft(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="document-tab-bar__tab-label"
                    title={t('tabs.renameHint', { name: tab.name })}
                    onClick={() => {
                      if (!editing) onSelectTab(tab.id);
                    }}
                    onDoubleClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      beginRename(tab);
                    }}
                  >
                    {tab.name}
                  </button>
                )}
                <button
                  type="button"
                  className="document-tab-bar__tab-close"
                  title={t('tabs.closeTab', { name: tab.name })}
                  aria-label={t('tabs.closeTab', { name: tab.name })}
                  onClick={e => {
                    e.stopPropagation();
                    if (editingId === tab.id) setEditingId(null);
                    onCloseTab(tab.id);
                  }}
                >
                  <X size={10} strokeWidth={2.2} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="document-tab-bar__new"
        title={t('tabs.newTab')}
        aria-label={t('tabs.newTab')}
        onClick={() => onNewTab()}
      >
        <Plus size={15} strokeWidth={2.4} aria-hidden />
      </button>
      {menu && menuTab
        ? createPortal(
            <div
              className="document-tab-bar__menu"
              style={{ left: menu.x, top: menu.y }}
              role="menu"
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => beginRename(menuTab)}
              >
                {t('tabs.rename')}
              </button>
              <button
                type="button"
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onCloseTab(menuTab.id);
                }}
              >
                {t('tabs.close')}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
