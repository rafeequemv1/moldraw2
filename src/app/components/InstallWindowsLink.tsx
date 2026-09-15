/** Install Windows app link — matches legacy MolDraw header promo. */
const INSTALL_URL = 'https://hi.switchy.io/sYek';

export function InstallWindowsLink() {
  return (
    <a
      className="tb-btn tb-btn-windows-app"
      href={INSTALL_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Download MolDraw for Windows"
    >
      <img src="/windows-install-logo.svg" alt="" aria-hidden className="tb-windows-logo" />
      <span className="tb-windows-copy">
        <span className="tb-btn-windows-text">Install Windows</span>
        <span className="tb-platform-note">Mac/Linux soon</span>
      </span>
    </a>
  );
}
