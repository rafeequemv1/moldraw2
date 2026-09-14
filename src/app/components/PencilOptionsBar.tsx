/**
 * Pencil stroke thickness — top bar when pen is active (no floating island).
 */

const THICKNESSES = [2, 4, 8];

export interface PencilOptionsBarProps {
  activeThickness: number;
  onSelectThickness: (thickness: number) => void;
  variant?: 'topbar' | 'floating';
}

export function PencilOptionsBar({
  activeThickness,
  onSelectThickness,
  variant = 'topbar',
}: PencilOptionsBarProps) {
  const sizes = (
    <div className="pencil-topbar__sizes" role="group" aria-label="Stroke thickness">
      {THICKNESSES.map(thick => (
        <button
          key={thick}
          type="button"
          className={
            activeThickness === thick
              ? 'pencil-topbar__size pencil-topbar__size--active'
              : 'pencil-topbar__size'
          }
          title={`${thick}px stroke`}
          aria-label={`${thick} pixel stroke`}
          aria-pressed={activeThickness === thick}
          onClick={() => onSelectThickness(thick)}
        >
          <span className="pencil-topbar__swatch" style={{ height: thick }} aria-hidden />
        </button>
      ))}
    </div>
  );

  if (variant === 'floating') {
    return (
      <div className="pencil-options-floating">
        <span className="pencil-topbar__label">Stroke</span>
        {sizes}
      </div>
    );
  }

  return (
    <div className="pencil-topbar" role="toolbar" aria-label="Pencil stroke">
      <span className="pencil-topbar__label">Stroke</span>
      {sizes}
    </div>
  );
}
