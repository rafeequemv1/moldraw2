/**
 * Tiny toast in the bottom-right corner explaining why a 3D atom pick could
 * not be linked back to a 2D atom (e.g. it's a hydrogen, or a multi-fragment
 * 3D layout was used). Hidden when `message` is empty.
 */

export interface ViewerLinkHintProps {
  message: string;
}

export function ViewerLinkHint({ message }: ViewerLinkHintProps) {
  if (!message) return null;
  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 620,
        border: '1px solid #dbeafe',
        borderRadius: 8,
        background: '#eff6ff',
        color: '#1d4ed8',
        padding: '6px 10px',
        fontSize: 11,
        fontWeight: 600,
        maxWidth: 'min(52vw, 380px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}
