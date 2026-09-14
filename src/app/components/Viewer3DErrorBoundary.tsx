import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Isolates 3Dmol / WebGL failures so they cannot blank the whole app tree.
 */
export class Viewer3DErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Molecule3DPanel crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="viewer3d-panel viewer3d-panel--error" role="alert">
          <p>3D viewer crashed. The 2D canvas is unaffected.</p>
          <button
            type="button"
            className="viewer3d-panel__retry"
            onClick={() => this.setState({ error: null })}
          >
            Retry 3D
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
