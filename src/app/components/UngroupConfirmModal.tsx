/**
 * Confirm dialog before ungrouping Pattern / Objects collections.
 */
import { createPortal } from 'react-dom';

export interface UngroupConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UngroupConfirmModal({ open, onCancel, onConfirm }: UngroupConfirmModalProps) {
  if (!open) return null;
  return createPortal(
    <div
      className="ungroup-confirm-overlay"
      role="presentation"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="ungroup-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ungroup-confirm-title"
        aria-describedby="ungroup-confirm-desc"
        onMouseDown={e => e.stopPropagation()}
      >
        <h2 id="ungroup-confirm-title">Ungroup molecules?</h2>
        <p id="ungroup-confirm-desc">
          This separates array, grid, and grouped copies into individual molecules. Pattern linkage
          cannot be restored afterward.
        </p>
        <div className="ungroup-confirm-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ungroup-confirm-actions__primary" onClick={onConfirm}>
            Ungroup
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
