/**
 * Live bridge between the App canvas and a local Moldraw session
 * (`npm run api` → http://127.0.0.1:8787). While connected:
 *
 *  - remote edits (MCP agents in proxy mode, HTTP clients) stream in over SSE
 *    (`/v1/events`) and are applied to the App store as undoable commits;
 *  - local edits are pushed as whole-document replaces (`PUT /v1/molecule`)
 *    with `expectedRevision`; on `409 STALE_REVISION` we re-read and re-push
 *    once (last-writer-wins);
 *  - `session.focus` events pan/zoom the canvas to the agent's new atoms.
 *
 * The App never hosts the server (browsers cannot); it is a client of the
 * Node session so the stdio MCP server (`MOLDRAW_SESSION_URL`) and the canvas
 * share one document and one undo history.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import type { MoleculeEditor } from '@moldraw/core';

export type LocalSessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LocalSessionBridgeState {
  status: LocalSessionStatus;
  url: string;
  revision: number;
  error: string | null;
  /** Number of remote changes applied to the canvas since connecting. */
  remoteChanges: number;
}

export interface UseLocalSessionBridgeOptions {
  store: MoleculeEditor;
  enabled: boolean;
  url: string;
  /** Pan/zoom to atoms after a `session.focus` event. */
  focusAtoms?: (atomIds: string[]) => void;
  /** Toast / status line. */
  onNotice?: (message: string) => void;
}

interface RemoteEvent {
  type: string;
  revision: number;
  clientId?: string;
  focus?: { atomIds: string[] };
}

interface RemoteState {
  revision: number;
  molecule: Molecule;
}

const PUSH_DEBOUNCE_MS = 120;

function documentIsEmpty(mol: Molecule): boolean {
  return (
    mol.atoms.length === 0 &&
    (mol.reactionArrows?.length ?? 0) === 0 &&
    (mol.canvasTexts?.length ?? 0) === 0 &&
    (mol.strokes?.length ?? 0) === 0 &&
    (mol.canvasShapes?.length ?? 0) === 0 &&
    (mol.canvasImages?.length ?? 0) === 0
  );
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8787';
}

function makeClientId(): string {
  return `app-${Math.random().toString(36).slice(2, 10)}`;
}

export function useLocalSessionBridge(opts: UseLocalSessionBridgeOptions): LocalSessionBridgeState {
  const { store, enabled, focusAtoms, onNotice } = opts;
  const url = useMemo(() => normalizeUrl(opts.url), [opts.url]);

  const [clientId] = useState(makeClientId);
  const [state, setState] = useState<LocalSessionBridgeState>({
    status: 'disconnected',
    url,
    revision: -1,
    error: null,
    remoteChanges: 0,
  });

  const remoteRevisionRef = useRef(-1);
  const applyingRemoteRef = useRef(false);
  const lastPushedRef = useRef<Molecule | null>(null);
  const pushTimerRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const focusAtomsRef = useRef(focusAtoms);
  const onNoticeRef = useRef(onNotice);
  useEffect(() => {
    focusAtomsRef.current = focusAtoms;
    onNoticeRef.current = onNotice;
  });

  const setStatus = useCallback((patch: Partial<LocalSessionBridgeState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  const fetchState = useCallback(async (): Promise<RemoteState> => {
    const res = await fetch(`${url}/v1/state`);
    if (!res.ok) throw new Error(`GET /v1/state → ${res.status}`);
    const body = (await res.json()) as RemoteState;
    if (typeof body.revision !== 'number' || !body.molecule) throw new Error('Invalid /v1/state payload');
    return body;
  }, [url]);

  const applyRemote = useCallback(
    (remote: RemoteState) => {
      applyingRemoteRef.current = true;
      try {
        store.updateMolecule(remote.molecule);
        lastPushedRef.current = store.getMolecule();
      } finally {
        applyingRemoteRef.current = false;
      }
      remoteRevisionRef.current = remote.revision;
      setState(prev => ({ ...prev, revision: remote.revision, remoteChanges: prev.remoteChanges + 1 }));
    },
    [store],
  );

  const pushDocument = useCallback((): Promise<void> => {
    const attempt = async (retry: boolean): Promise<void> => {
      const molecule = store.getMolecule();
      lastPushedRef.current = molecule;
      const res = await fetch(`${url}/v1/molecule`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ molecule, clientId, expectedRevision: remoteRevisionRef.current }),
      });
      const body = (await res.json()) as { ok: boolean; revision: number; error?: { code: string; message: string } };
      if (body.ok) {
        remoteRevisionRef.current = body.revision;
        setStatus({ revision: body.revision, error: null });
        return;
      }
      if (body.error?.code === 'STALE_REVISION' && retry) {
        // Somebody else wrote in between: adopt their revision and re-push our document (last writer wins).
        remoteRevisionRef.current = body.revision;
        await attempt(false);
        return;
      }
      throw new Error(body.error?.message ?? `PUT /v1/molecule → ${res.status}`);
    };
    return attempt(true);
  }, [clientId, setStatus, store, url]);

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current !== null) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      pushDocument().catch(err => {
        setStatus({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    }, PUSH_DEBOUNCE_MS);
  }, [pushDocument, setStatus]);

  useEffect(() => {
    if (!enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      remoteRevisionRef.current = -1;
      return;
    }

    let cancelled = false;
    // Defer the first status write so the effect itself does not set state synchronously.
    const kick = window.setTimeout(() => {
      if (!cancelled) setStatus({ status: 'connecting', url, error: null });
    }, 0);

    const connect = async () => {
      // 1. Initial reconciliation: a non-empty remote document wins; otherwise seed it with ours.
      const remote = await fetchState();
      if (cancelled) return;
      const local = store.getMolecule();
      if (!documentIsEmpty(remote.molecule) || documentIsEmpty(local)) {
        applyRemote(remote);
        onNoticeRef.current?.(`Connected to local session (revision ${remote.revision}) — loaded its document.`);
      } else {
        remoteRevisionRef.current = remote.revision;
        await pushDocument();
        onNoticeRef.current?.('Connected to local session — pushed the current canvas.');
      }
      if (cancelled) return;

      // 2. Live events.
      const es = new EventSource(`${url}/v1/events`);
      eventSourceRef.current = es;
      es.onopen = () => setStatus({ status: 'connected', error: null, revision: remoteRevisionRef.current });
      es.onerror = () => {
        if (cancelled) return;
        setStatus({ status: 'error', error: 'Event stream lost — is `npm run api` still running? Reconnecting…' });
      };
      es.onmessage = ev => {
        if (cancelled) return;
        let event: RemoteEvent;
        try {
          event = JSON.parse(ev.data) as RemoteEvent;
        } catch {
          return;
        }
        if (event.type === 'session.focus') {
          if (event.focus?.atomIds?.length) focusAtomsRef.current?.(event.focus.atomIds);
          return;
        }
        if (event.type === 'session.persisted' || event.type === 'session.loaded') return;
        if (event.revision <= remoteRevisionRef.current) return;
        if (event.clientId === clientId) {
          remoteRevisionRef.current = event.revision;
          setStatus({ revision: event.revision });
          return;
        }
        fetchState()
          .then(remoteState => {
            if (cancelled) return;
            if (remoteState.revision <= remoteRevisionRef.current) return;
            applyRemote(remoteState);
          })
          .catch(err => setStatus({ status: 'error', error: err instanceof Error ? err.message : String(err) }));
      };
    };

    connect().catch(err => {
      if (cancelled) return;
      setStatus({
        status: 'error',
        error: `${err instanceof Error ? err.message : String(err)} — start the session with \`npm run api\`.`,
      });
    });

    // 3. Push local edits.
    const unsubscribe = store.subscribe(() => {
      if (applyingRemoteRef.current) return;
      if (remoteRevisionRef.current < 0) return; // not reconciled yet
      const mol = store.getMolecule();
      if (mol === lastPushedRef.current) return;
      schedulePush();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(kick);
      unsubscribe();
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [applyRemote, clientId, enabled, fetchState, pushDocument, schedulePush, setStatus, store, url]);

  // While disabled, report `disconnected` regardless of the last live status (no state write needed).
  return useMemo(
    () => (enabled ? state : { ...state, status: 'disconnected' as const, error: null, revision: -1 }),
    [enabled, state],
  );
}
