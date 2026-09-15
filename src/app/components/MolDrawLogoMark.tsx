/** Teal rounded-square MolDraw mark: Kekulé benzene (hexagon + double bonds). */
export function MolDrawLogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="app-top-bar__logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      shapeRendering="geometricPrecision"
    >
      <rect width="32" height="32" rx="7" ry="7" fill="#2C7A7B" />
      <g fill="none" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M16 4.6 L25.5 10.1 L25.5 21.9 L16 27.4 L6.5 21.9 L6.5 10.1 Z"
          strokeWidth="2.2"
        />
        <path d="M22.6 11.85 L22.6 20.15" strokeWidth="1.45" />
        <path d="M15.4 8.35 L10.6 10.85" strokeWidth="1.45" />
        <path d="M9.35 20.85 L15.75 24.95" strokeWidth="1.45" />
      </g>
    </svg>
  );
}
