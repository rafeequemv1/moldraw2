import { CUSTOM_COLOR_PRESETS } from './styleUtils';
import type { ProteinStyleSettings } from './types';

export interface ColorPickerRowProps {
  style: ProteinStyleSettings;
  onChange: (next: ProteinStyleSettings) => void;
  compact?: boolean;
}

export function ColorPickerRow({ style, onChange, compact = false }: ColorPickerRowProps) {
  const patch = (partial: Partial<ProteinStyleSettings>) => onChange({ ...style, ...partial });

  return (
    <details className={`protein-color-custom${compact ? ' protein-color-custom--compact' : ''}`}>
      <summary className="protein-color-custom__summary">Custom color</summary>
      <div className="protein-color-custom__body">
        <div className="protein-color-custom__swatches">
          {CUSTOM_COLOR_PRESETS.map(c => (
            <button
              key={c}
              type="button"
              className={`protein-color-custom__swatch${style.customColor === c ? ' is-active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => patch({ customColor: c })}
            />
          ))}
        </div>
        <label className="protein-color-custom__picker">
          <input
            type="color"
            value={style.customColor ?? '#3b82f6'}
            onChange={e => patch({ customColor: e.target.value })}
          />
          <span>Pick</span>
        </label>
        {style.customColor && (
          <button
            type="button"
            className="protein-color-custom__reset"
            onClick={() => patch({ customColor: undefined })}
          >
            Use scheme
          </button>
        )}
      </div>
    </details>
  );
}
