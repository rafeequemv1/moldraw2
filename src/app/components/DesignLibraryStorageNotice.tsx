/**
 * Always-visible local-save warning.
 * Color matches Updates / feature-request helper text: `var(--text-muted)`.
 * Storage is origin-scoped (moldraw.com ≠ localhost ≠ 127.0.0.1).
 */
import { localSaveOriginWarning } from '../projects/libraryListing';

export function DesignLibraryStorageNotice() {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return (
    <p className="design-library__notice" role="note">
      {localSaveOriginWarning(origin)}
    </p>
  );
}
