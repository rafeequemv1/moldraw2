import { useEffect } from 'react';
import { X } from 'lucide-react';
import { DesignLibraryView, type DesignLibraryViewProps } from './DesignLibraryView';
import { useChromeOverlay } from '../chromeDismiss';

export type ProjectLibraryModalProps = DesignLibraryViewProps & {
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
};

export function ProjectLibraryModal({
  open,
  onClose,
  onRefresh,
  onOpenProject,
  ...libraryProps
}: ProjectLibraryModalProps) {
  useChromeOverlay(open, onClose, 'modal');
  useEffect(() => {
    if (open) onRefresh?.();
  }, [open, onRefresh]);

  if (!open) return null;

  return (
    <div className="project-library-modal" role="dialog" aria-modal="true" aria-label="My designs">
      <div className="project-library-modal__backdrop" aria-hidden />
      <div className="project-library-modal__panel">
        <header className="project-library-modal__header">
          <h2>My designs</h2>
          <button type="button" className="project-library-modal__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <DesignLibraryView
          {...libraryProps}
          variant="modal"
          onOpenProject={onOpenProject}
          onAfterOpen={onClose}
        />
      </div>
    </div>
  );
}
