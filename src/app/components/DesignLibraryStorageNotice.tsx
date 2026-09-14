/** Explains how My designs auto-save works and what the limits are. */
export function DesignLibraryStorageNotice() {
  return (
    <div className="design-library__notice" role="note" aria-label="How designs are saved">
      <p className="design-library__notice-lead">
        <strong>Auto-saved on this device.</strong> Every tab saves to your browser library while you edit
        (about every few seconds). Nothing is uploaded to the cloud.
      </p>
      <ul className="design-library__notice-list">
        <li>Designs stay on this browser and profile only — not synced across devices.</li>
        <li>Clearing site data, private browsing, or uninstalling the browser can delete them.</li>
        <li>
          Each card downloads a native <strong>.moldraw</strong> file (entire canvas). Use{' '}
          <strong>Download all</strong> for a ZIP (default) or uncheck ZIP to save files one by one.
        </li>
      </ul>
    </div>
  );
}
