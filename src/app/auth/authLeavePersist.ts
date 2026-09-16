/**
 * Persistence hook registers a flush so auth can snapshot the working
 * document before a modal sign-in or an OAuth / email redirect.
 */
type FlushFn = () => Promise<void>;

let flushWorkingDocument: FlushFn | null = null;

export function registerAuthLeavePersist(fn: FlushFn | null): void {
  flushWorkingDocument = fn;
}

export function persistWorkingDocumentForAuth(): Promise<void> {
  return flushWorkingDocument?.() ?? Promise.resolve();
}
