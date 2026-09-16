/**
 * Always-visible local-save warning.
 * Color matches Updates / feature-request helper text: `var(--text-muted)`.
 */
export function DesignLibraryStorageNotice() {
  return (
    <p className="design-library__notice" role="note">
      Be careful: designs are saved locally in this browser. Clearing site data, another
      browser, or a private window can remove them. Always save a copy on your computer so you
      don’t lose work in progress.
    </p>
  );
}
