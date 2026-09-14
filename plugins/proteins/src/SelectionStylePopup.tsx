import { useEffect, useRef } from 'react';
import type { ProteinStyleSettings } from './types';
import { REPRESENTATION_OPTIONS, SURFACE_KIND_OPTIONS } from './proteinStyles';
import { ColorPickerRow } from './ColorPickerRow';

export interface SelectionStylePopupProps {
  open: boolean;
  count: number;
  style: ProteinStyleSettings;
  regionCount: number;
  onStyleChange: (next: ProteinStyleSettings) => void;
  onClose: () => void;
  onClear: () => void;
  onRemoveRegion: () => void;
}

export function SelectionStylePopup({
  open,
  count,
  style,
  regionCount,
  onStyleChange,
  onClose,
  onClear,
  onRemoveRegion,
}: SelectionStylePopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  if (!open || count === 0) return null;

  const patch = (partial: Partial<ProteinStyleSettings>) =>
    onStyleChange({ ...style, ...partial });
  const patchSurface = (partial: Partial<ProteinStyleSettings['surface']>) =>
    onStyleChange({ ...style, surface: { ...style.surface, ...partial } });

  return (
    <div className="protein-sel-popup" ref={ref} role="dialog" aria-label="Selection style">
      <div className="protein-sel-popup__head">
        <span>{count} res · {regionCount} styled</span>
        <button type="button" className="protein-sel-popup__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <label className="protein-sel-popup__row">
        Style
        <select
          value={style.representation}
          onChange={e =>
            patch({ representation: e.target.value as ProteinStyleSettings['representation'] })
          }
        >
          {REPRESENTATION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <ColorPickerRow style={style} onChange={onStyleChange} compact />
      <label className="protein-sel-popup__row protein-sel-popup__row--slider">
        Opacity
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={style.opacity}
          onChange={e => patch({ opacity: parseFloat(e.target.value) })}
        />
        <span>{Math.round(style.opacity * 100)}%</span>
      </label>
      <label className="protein-sel-popup__row protein-sel-popup__row--check">
        <input
          type="checkbox"
          checked={style.surface.enabled}
          onChange={e => patchSurface({ enabled: e.target.checked })}
        />
        Surface
      </label>
      {style.surface.enabled && (
        <>
          <label className="protein-sel-popup__row">
            Type
            <select
              value={style.surface.kind}
              onChange={e =>
                patchSurface({ kind: e.target.value as ProteinStyleSettings['surface']['kind'] })
              }
            >
              {SURFACE_KIND_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="protein-sel-popup__row protein-sel-popup__row--slider">
            Surface opacity
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={style.surface.opacity}
              onChange={e => patchSurface({ opacity: parseFloat(e.target.value) })}
            />
            <span>{Math.round(style.surface.opacity * 100)}%</span>
          </label>
        </>
      )}
      <div className="protein-sel-popup__actions">
        <button type="button" className="protein-sel-popup__clear" onClick={onRemoveRegion}>
          Remove style
        </button>
        <button type="button" className="protein-sel-popup__clear" onClick={onClear}>
          Clear selection
        </button>
      </div>
    </div>
  );
}
