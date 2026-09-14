/**
 * Modal: OpenChemLib ConformerGenerator gallery for the 3D viewer.
 * Generates collision-free torsion conformers and lets the user apply one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { generateOclConformers, OCL_CONFORMER_MAX_HEAVY } from './generateOclConformers';
import { countHeavyAtomsInMolblock } from './molfileUtils';
import { ConformerPreview } from './ConformerPreview';
import { OclConformerError, type OclConformerPose } from './types';
import '../../conformer-gallery.css';

export interface ConformerGalleryModalProps {
  open: boolean;
  /** Current structure molblock (2D or 3D) used as topology input. */
  molblock: string;
  /** Optional heavy-atom hint from the app (avoids re-counting). */
  heavyAtomCount?: number;
  onClose: () => void;
  /** Apply selected conformer molblock to the 3D viewer. */
  onApply: (molblock: string) => void;
}

export function ConformerGalleryModal({
  open,
  molblock,
  heavyAtomCount,
  onClose,
  onApply,
}: ConformerGalleryModalProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [poses, setPoses] = useState<OclConformerPose[]>([]);
  const [potentialCount, setPotentialCount] = useState(0);
  const [selected, setSelected] = useState(0);
  const [maxConformers, setMaxConformers] = useState(12);
  const abortRef = useRef<AbortController | null>(null);

  const resolvedHeavy = useMemo(() => {
    if (typeof heavyAtomCount === 'number' && heavyAtomCount > 0) return heavyAtomCount;
    return countHeavyAtomsInMolblock(molblock);
  }, [heavyAtomCount, molblock]);

  const tooLarge = resolvedHeavy > OCL_CONFORMER_MAX_HEAVY;

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const runGenerate = useCallback(async () => {
    cancelRun();
    if (tooLarge) {
      setBusy(false);
      setPoses([]);
      setError(
        `Conformers not supported for larger molecules (${resolvedHeavy} heavy atoms; limit ${OCL_CONFORMER_MAX_HEAVY}). Use Calculate structure for a single 3D pose.`,
      );
      setStatusMsg('');
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setPoses([]);
    setPotentialCount(0);
    setSelected(0);
    setProgress(0);
    setStatusMsg('Starting…');
    try {
      const result = await generateOclConformers(molblock, {
        maxConformers,
        seed: 1,
        strategy: 'adaptive_random',
        signal: ac.signal,
        onProgress: (f, msg) => {
          setProgress(f);
          setStatusMsg(msg);
        },
      });
      setPoses(result.poses);
      setPotentialCount(result.potentialCount);
      setSelected(0);
      setStatusMsg(
        `${result.poses.length} conformer${result.poses.length === 1 ? '' : 's'}` +
          (result.potentialCount > 0 ? ` (potential ~${result.potentialCount})` : ''),
      );
    } catch (err) {
      if (err instanceof OclConformerError && err.code === 'cancelled') {
        setStatusMsg('Cancelled');
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setStatusMsg('');
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [molblock, maxConformers, cancelRun, tooLarge, resolvedHeavy]);

  useEffect(() => {
    if (!open) {
      cancelRun();
      return;
    }
    void runGenerate();
    return () => cancelRun();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- regenerate on open only

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = poses[selected] ?? null;

  // Portal to body so isolation/z-index inside the 3D pane cannot trap the modal.
  return createPortal(
    <div className="conformer-gallery-backdrop" role="presentation" onClick={onClose}>
      <div
        className="conformer-gallery-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conformer-gallery-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="conformer-gallery-modal__header">
          <div>
            <h2 id="conformer-gallery-title">Conformer gallery</h2>
            <p className="conformer-gallery-modal__subtitle">
              OpenChemLib torsion sampler — collision-free poses (E/Z &amp; R/S aware). Supported
              up to {OCL_CONFORMER_MAX_HEAVY} heavy atoms.
            </p>
          </div>
          <button type="button" className="conformer-gallery-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {tooLarge ? (
          <div className="conformer-gallery-modal__unsupported" role="status">
            <strong>Conformers not supported for larger molecules</strong>
            <p>
              This structure has <b>{resolvedHeavy}</b> heavy atoms (limit{' '}
              <b>{OCL_CONFORMER_MAX_HEAVY}</b>). Multi-conformer sampling stays on smaller
              molecules. Use <b>Calculate structure</b> for a single accurate 3D pose (supported
              up to ~400 heavy atoms).
            </p>
          </div>
        ) : (
          <div className="conformer-gallery-modal__toolbar">
            <label className="conformer-gallery-modal__field">
              Max conformers
              <select
                value={maxConformers}
                disabled={busy}
                onChange={e => setMaxConformers(Number(e.target.value))}
              >
                {[6, 12, 18, 24].map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="conformer-gallery-modal__btn"
              disabled={busy || !molblock.trim()}
              onClick={() => void runGenerate()}
            >
              {busy ? 'Generating…' : 'Regenerate'}
            </button>
            {busy ? (
              <button type="button" className="conformer-gallery-modal__btn conformer-gallery-modal__btn--ghost" onClick={cancelRun}>
                Cancel
              </button>
            ) : null}
          </div>
        )}

        {busy ? (
          <div className="conformer-gallery-modal__progress" aria-live="polite">
            <div className="conformer-gallery-modal__progress-bar">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span>{statusMsg || 'Working…'}</span>
          </div>
        ) : null}

        {error && !tooLarge ? <div className="conformer-gallery-modal__error">{error}</div> : null}

        {!busy && !error && poses.length > 0 ? (
          <div className="conformer-gallery-modal__body">
            <div className="conformer-gallery-modal__list" role="listbox" aria-label="Conformers">
              {poses.map((p, i) => (
                <button
                  key={p.index}
                  type="button"
                  role="option"
                  aria-selected={i === selected}
                  className={`conformer-gallery-modal__item${i === selected ? ' is-selected' : ''}`}
                  onClick={() => setSelected(i)}
                >
                  <span className="conformer-gallery-modal__item-idx">#{p.index}</span>
                  <span className="conformer-gallery-modal__item-meta">{p.atomCount} atoms</span>
                </button>
              ))}
            </div>
            <div className="conformer-gallery-modal__preview">
              <ConformerPreview molblock={active?.molblock ?? ''} />
              <p className="conformer-gallery-modal__hint">
                {statusMsg}
                {potentialCount > poses.length
                  ? ` · showing ${poses.length} of ~${potentialCount} possible`
                  : ''}
              </p>
            </div>
          </div>
        ) : null}

        {!tooLarge && !busy && !error && poses.length === 0 ? (
          <p className="conformer-gallery-modal__empty">No conformers yet.</p>
        ) : null}

        <footer className="conformer-gallery-modal__footer">
          <button type="button" className="conformer-gallery-modal__btn conformer-gallery-modal__btn--ghost" onClick={onClose}>
            Close
          </button>
          {!tooLarge ? (
            <button
              type="button"
              className="conformer-gallery-modal__btn conformer-gallery-modal__btn--primary"
              disabled={!active}
              onClick={() => {
                if (!active) return;
                onApply(active.molblock);
                onClose();
              }}
            >
              Apply to 3D viewer
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
