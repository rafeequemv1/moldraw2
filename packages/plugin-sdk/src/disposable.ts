export interface Disposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): Disposable {
  return { dispose: fn };
}

export class DisposableStore {
  private items: Disposable[] = [];

  push(...disposables: Disposable[]): void {
    this.items.push(...disposables);
  }

  dispose(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i]?.dispose();
      } catch {
        /* ignore */
      }
    }
    this.items = [];
  }
}
