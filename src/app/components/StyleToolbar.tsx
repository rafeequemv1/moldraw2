/**
 * Compact PowerPoint-style style ribbon (mirrors Settings → Style).
 * Option lists portal to document.body so they are not clipped by the header.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import type { CanvasStructureTheme } from '@moldraw/canvas';
import type { BondsSettings, GeneralSettings } from '../settings/types';
import { CANVAS_FONT_FAMILIES } from '../constants/fonts';
import { useInstalledStructureThemes } from '../hooks/useStructureTheme';

export interface StyleToolbarProps {
  general: GeneralSettings;
  bonds: BondsSettings;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  updateBonds: (patch: Partial<BondsSettings>) => void;
  onResetToDefaults?: () => void;
  /** Persist the 2D look on the molecule (MCP / undo) as well as Settings. */
  onStructureThemeChange?: (themeId: string, drawMode: 'skeletal' | 'ball-stick') => void;
}

const FONT_SIZE_OPTS = [10, 12, 14, 16, 18, 20, 22, 24, 28, 32] as const;
const SUB_SIZE_OPTS = [8, 10, 12, 14, 16, 18, 20] as const;
const BOND_LEN_OPTS = [28, 32, 36, 40, 45, 50, 55, 60, 70] as const;
const BOND_GAP_OPTS = [12, 15, 18, 22, 28, 35, 40] as const;
const BOND_THICK_OPTS = [1, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 14] as const;
const WEDGE_OPTS = [4, 6, 8, 10, 12, 16, 20] as const;
const HASH_OPTS = [2, 3, 3.5, 4, 5, 6, 8, 10] as const;

function clampNum(raw: string, min: number, max: number): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function StyleCombo({
  id,
  label,
  value,
  options,
  onCommit,
  icon,
}: {
  id: string;
  label: string;
  value: string | number;
  options: readonly (string | number)[];
  onCommit: (raw: string) => void;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const menuId = useId();
  const wide = id === 'font' || id === 'theme';

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const input = el.getBoundingClientRect();
      const bar = el.closest('.app-top-bar__tools-row')?.getBoundingClientRect() ?? input;
      const width = Math.max(wide ? 120 : 40, Math.round(input.width));
      const menuH = options.length * 22 + 6;
      const below = bar.bottom + 4;
      const top = below + menuH > window.innerHeight - 8 ? Math.max(8, bar.top - menuH - 4) : below;
      setPos({ top, left: input.left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, options.length, wide]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const menu =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="style-toolbar__menu"
            role="listbox"
            aria-label={label}
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map(o => {
              const s = String(o);
              const selected = s === String(value);
              return (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`style-toolbar__menu-item${selected ? ' is-selected' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    onCommit(s);
                    setOpen(false);
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <label className="style-toolbar__field">
      <span
        ref={wrapRef}
        className={`style-toolbar__combo${wide ? ' style-toolbar__combo--font' : ''}${id === 'theme' ? ' style-toolbar__combo--theme' : ''}`}
      >
        {icon ? (
          <span className="style-toolbar__combo-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <input
          value={value}
          inputMode={typeof value === 'number' ? 'decimal' : 'text'}
          autoComplete="off"
          spellCheck={false}
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          title={label}
          readOnly={id === 'theme'}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={e => {
            if (id !== 'theme') onCommit(e.target.value);
          }}
        />
      </span>
      <span className="style-toolbar__field-label">{label}</span>
      {menu}
    </label>
  );
}

function Ico({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d={d}
        fill={fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ICONS = {
  theme: <Ico d="M6 1.5a4.5 4.5 0 1 0 4.4 5.4L8 6.5V6a2 2 0 0 0-2-2H5.5" />,
  font: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 10 6 2.5 9.5 10M4 7.5h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  size: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M1.5 10 4 4l2.5 6M2.4 8h3.2M7.2 10l1.8-4.2L10.8 10M8 8.2h1.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  sub: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M1.5 8.5 4 2.5 6.5 8.5M2.5 6.5h3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 9h2.5v1.2H8z" fill="currentColor" stroke="none" />
    </svg>
  ),
  length: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 6h8M2 4v4M10 4v4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  gap: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M4 2.5v7M8 2.5v7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  thick: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 6h8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  ),
  wedge: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 10 L10 6 L2 2 Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  hash: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 10 L10 6 M2 8.2 L8.5 5.2 M2 6.4 L7 4.2 M2 4.6 L5.5 3.2" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  ),
};

export function StyleToolbar({
  general,
  bonds,
  updateGeneral,
  updateBonds,
  onResetToDefaults,
  onStructureThemeChange,
}: StyleToolbarProps) {
  const themes = useInstalledStructureThemes();
  const themeId = general.structureThemeId ?? 'skeletal';
  const themeLabel = themes.find(t => t.id === themeId)?.label ?? themes[0]?.label ?? 'Default';

  return (
    <div className="style-toolbar" role="toolbar" aria-label="Drawing style">
      <div className="style-toolbar__group" role="group" aria-label="Theme">
        <span className="style-toolbar__group-label">Theme</span>
        <div className="style-toolbar__group-body">
          <StyleCombo
            id="theme"
            label="Theme"
            value={themeLabel}
            options={themes.map((t: CanvasStructureTheme) => t.label)}
            icon={ICONS.theme}
            onCommit={raw => {
              const next = themes.find(t => t.label === raw || t.id === raw);
              if (next) {
                updateGeneral({
                  structureThemeId: next.id,
                  structureDrawMode: next.drawMode,
                });
                onStructureThemeChange?.(next.id, next.drawMode);
              }
            }}
          />
        </div>
      </div>
      <div className="style-toolbar__group" role="group" aria-label="Atoms">
        <span className="style-toolbar__group-label">Atoms</span>
        <div className="style-toolbar__group-body">
          <StyleCombo
            id="font"
            label="Font"
            value={general.fontFamily}
            options={CANVAS_FONT_FAMILIES}
            icon={ICONS.font}
            onCommit={raw => {
              const next = raw.trim();
              if (next) updateGeneral({ fontFamily: next });
            }}
          />
          <StyleCombo
            id="size"
            label="Size"
            value={general.fontSizePt}
            options={FONT_SIZE_OPTS}
            icon={ICONS.size}
            onCommit={raw => {
              const n = clampNum(raw, 6, 36);
              if (n != null) updateGeneral({ fontSizePt: n });
            }}
          />
          <StyleCombo
            id="sub"
            label="Sub"
            value={general.subFontSizePt}
            options={SUB_SIZE_OPTS}
            icon={ICONS.sub}
            onCommit={raw => {
              const n = clampNum(raw, 6, 36);
              if (n != null) updateGeneral({ subFontSizePt: n });
            }}
          />
          <div className="style-toolbar__field">
            <button
              type="button"
              className={`style-toolbar__bold${general.boldAtomLabels ? ' is-on' : ''}`}
              aria-pressed={general.boldAtomLabels}
              title="Bold labels"
              aria-label="Bold labels"
              onClick={() => updateGeneral({ boldAtomLabels: !general.boldAtomLabels })}
            >
              <span className="style-toolbar__bold-mark">B</span>
            </button>
            <span className="style-toolbar__field-label">B</span>
          </div>
        </div>
      </div>
      <div className="style-toolbar__group" role="group" aria-label="Bonds">
        <span className="style-toolbar__group-label">Bonds</span>
        <div className="style-toolbar__group-body">
          <StyleCombo
            id="length"
            label="Length"
            value={bonds.bondLengthPx}
            options={BOND_LEN_OPTS}
            icon={ICONS.length}
            onCommit={raw => {
              const n = clampNum(raw, 24, 80);
              if (n != null) updateBonds({ bondLengthPx: n });
            }}
          />
          <StyleCombo
            id="gap"
            label="Gap"
            value={bonds.bondSpacingPercent}
            options={BOND_GAP_OPTS}
            icon={ICONS.gap}
            onCommit={raw => {
              const n = clampNum(raw, 4, 45);
              if (n != null) updateBonds({ bondSpacingPercent: n });
            }}
          />
          <StyleCombo
            id="thick"
            label="Thick"
            value={bonds.bondThicknessPx}
            options={BOND_THICK_OPTS}
            icon={ICONS.thick}
            onCommit={raw => {
              const n = clampNum(raw, 1, 14);
              if (n != null) updateBonds({ bondThicknessPx: n });
            }}
          />
          <StyleCombo
            id="wedge"
            label="Wedge"
            value={bonds.stereoWedgeWidthPx}
            options={WEDGE_OPTS}
            icon={ICONS.wedge}
            onCommit={raw => {
              const n = clampNum(raw, 2, 24);
              if (n != null) updateBonds({ stereoWedgeWidthPx: n });
            }}
          />
          <StyleCombo
            id="hash"
            label="Hash"
            value={bonds.hashSpacingPx}
            options={HASH_OPTS}
            icon={ICONS.hash}
            onCommit={raw => {
              const n = clampNum(raw, 0.5, 14);
              if (n != null) updateBonds({ hashSpacingPx: n });
            }}
          />
        </div>
      </div>
      {onResetToDefaults ? (
        <div className="style-toolbar__group" role="group" aria-label="Reset">
          <span className="style-toolbar__group-label">Reset</span>
          <div className="style-toolbar__group-body">
            <button
              type="button"
              className="style-toolbar__reset"
              title="Reset style to Times New Roman and default bond sizes"
              aria-label="Reset style to defaults"
              onClick={onResetToDefaults}
            >
              <RotateCcw size={12} strokeWidth={2} aria-hidden />
              Default
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
