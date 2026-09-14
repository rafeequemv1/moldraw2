/**
 * Workspace layout: top bar spans the app; body is AI | 2D | 3D under the header.
 * Compact (phone + tablet ≤1024): chat and 3D are full-screen bottom sheets
 * (default closed — only when toggled on).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useWorkspacePaneWidths } from '../hooks/useWorkspacePaneWidths';
import { MobileBottomSheet } from './MobileBottomSheet';

export interface WorkspaceSplitProps {
  showChatPanel: boolean;
  show3DViewer: boolean;
  /** Compact viewport (≤1024): chat + 3D as sheets; same UX for phone and tablet. */
  isCompact?: boolean;
  /** @deprecated Same as isCompact — kept so callers can pass either. */
  isPhone?: boolean;
  onCloseChat?: () => void;
  onClose3D?: () => void;
  /** Top chrome — full width above AI / 2D / 3D. */
  topBar?: ReactNode;
  paneChat: ReactNode;
  pane2D: ReactNode;
  pane3D: ReactNode;
}

function workspaceSplitClass(
  showChatPanel: boolean,
  show3DViewer: boolean,
  isCompact: boolean,
): string {
  const parts = ['workspace-split'];
  if (showChatPanel && !isCompact) parts.push('workspace-split--with-chat');
  if (!show3DViewer || isCompact) parts.push('workspace-split--no-3d');
  if ((!showChatPanel || isCompact) && (!show3DViewer || isCompact)) {
    parts.push('workspace-split--single');
  }
  return parts.join(' ');
}

export function WorkspaceSplit({
  showChatPanel,
  show3DViewer,
  isCompact = false,
  isPhone = false,
  onCloseChat,
  onClose3D,
  topBar,
  paneChat,
  pane2D,
  pane3D,
}: WorkspaceSplitProps) {
  // Phone and tablet share the same compact sheet UX.
  const compact = isCompact || isPhone;
  const chatRef = useRef<HTMLDivElement>(null);
  const viewer3DRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const {
    chatWidth,
    viewer3DWidth,
    onChatResizePointerDown,
    onViewer3DResizePointerDown,
    setBodyRef,
  } = useWorkspacePaneWidths(showChatPanel, show3DViewer);

  useEffect(() => {
    setBodyRef(bodyRef.current);
  }, [setBodyRef]);

  useEffect(() => {
    const root = document.documentElement;
    if (!showChatPanel || compact) {
      root.style.setProperty('--workspace-chat-width', '0px');
      root.classList.remove('app-chat-open');
    } else {
      root.classList.add('app-chat-open');
      root.style.setProperty('--workspace-chat-width', `${Math.round(chatWidth)}px`);
    }
    if (!show3DViewer || compact) {
      root.style.setProperty('--workspace-3d-width', '0px');
    } else {
      root.style.setProperty('--workspace-3d-width', `${Math.round(viewer3DWidth)}px`);
    }
  }, [showChatPanel, show3DViewer, compact, chatWidth, viewer3DWidth]);

  useEffect(() => {
    if (!showChatPanel || compact) return;
    const el = chatRef.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty(
        '--workspace-chat-width',
        `${Math.round(el.clientWidth)}px`,
      );
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showChatPanel, compact, chatWidth]);

  // 3D pane size is observed by Molecule3DPanel. Do not synthesize window
  // resize events — that retriggers 3Dmol resize/render in a flicker loop.

  const chatSheet =
    compact && showChatPanel ? (
      <MobileBottomSheet
        open
        onClose={() => onCloseChat?.()}
        title="AI chat"
        size="full"
        className="mobile-sheet--chat"
      >
        {paneChat}
      </MobileBottomSheet>
    ) : null;

  const viewer3DSheet =
    compact && show3DViewer ? (
      <MobileBottomSheet
        open
        onClose={() => onClose3D?.()}
        title="3D viewer"
        size="full"
        className="mobile-sheet--viewer3d"
      >
        {/* Relative box so absolute .viewer3d-shell cannot cover the sheet header */}
        <div className="workspace-pane-3d__viewer--sheet">{pane3D}</div>
      </MobileBottomSheet>
    ) : null;

  return (
    <>
      <div className={workspaceSplitClass(showChatPanel, show3DViewer, compact)}>
        <div className="workspace-main">
          {topBar ? <div className="workspace-main__top">{topBar}</div> : null}
          <div ref={bodyRef} className="workspace-main__body">
            {showChatPanel && !compact ? (
              <div
                ref={chatRef}
                className="workspace-pane-chat"
                style={{ width: chatWidth, flex: '0 0 auto' }}
              >
                {paneChat}
                <div
                  className="workspace-pane-resize-handle workspace-pane-resize-handle--right"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize AI chat panel"
                  onPointerDown={onChatResizePointerDown}
                />
              </div>
            ) : null}
            <div className="workspace-pane-2d">{pane2D}</div>
            {show3DViewer && !compact ? (
              <div
                ref={viewer3DRef}
                className="workspace-pane-3d"
                style={{ width: viewer3DWidth, flex: '0 0 auto' }}
              >
                <div
                  className="workspace-pane-resize-handle workspace-pane-resize-handle--left"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize 3D viewer panel"
                  onPointerDown={onViewer3DResizePointerDown}
                />
                <div className="workspace-pane-3d__content">
                  <div className="workspace-pane-3d__viewer">{pane3D}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {chatSheet}
      {viewer3DSheet}
    </>
  );
}
