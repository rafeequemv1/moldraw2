/**
 * Proxy mode: the stdio MCP server forwards every tool call to a running
 * local Moldraw HTTP session (`MOLDRAW_SESSION_URL`, e.g. the App's
 * "Connect to local session" bridge or `npm run api`). The agent then edits
 * the same document the user sees on the canvas.
 *
 * A local mirror session is kept for resource reads (SVG / SMILES / molblock);
 * it is refreshed from `GET /v1/state` whenever the remote revision moves.
 */
import type { Molecule } from '@moldraw/domain';
import type { MoleculeSelection } from '@moldraw/core';
import { createMoldrawSession } from '../session/createMoldrawSession';
import type { MoldrawSession, MoldrawSessionState } from '../session/types';
import type { McpToolEnvelope } from './envelope';

export interface ProxySession {
  connect(): Promise<MoldrawSession>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolEnvelope>;
  /** Pull remote state into the mirror if the revision changed. */
  refresh(): Promise<void>;
  readonly remoteRevision: number;
}

interface RemoteState {
  revision: number;
  molecule: Molecule;
  selection: MoleculeSelection;
  canUndo: boolean;
  canRedo: boolean;
}

export function createProxySession(baseUrl: string, fetchImpl: typeof fetch = fetch): ProxySession {
  const base = baseUrl.replace(/\/+$/, '');
  const mirror = createMoldrawSession();
  let remoteRevision = -1;
  let remote: RemoteState | null = null;

  const fetchJson = async <T,>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> => {
    const res = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { ok: false, error: { code: 'EXECUTION', message: `Non-JSON response from ${path}` } };
    }
    return { status: res.status, body: body as T };
  };

  const refresh = async (): Promise<void> => {
    const { body } = await fetchJson<RemoteState>('/v1/state');
    if (!body || typeof body.revision !== 'number') {
      throw new Error(`Session at ${base} did not return a valid /v1/state.`);
    }
    if (body.revision !== remoteRevision || !remote) {
      mirror.store.resetMolecule(body.molecule);
      mirror.store.setSelection(body.selection ?? {});
      remoteRevision = body.revision;
    }
    remote = body;
  };

  const callTool = async (name: string, args: Record<string, unknown>): Promise<McpToolEnvelope> => {
    try {
      const { body } = await fetchJson<McpToolEnvelope>(`/v1/tools/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify(args),
      });
      if (typeof body.revision === 'number') remoteRevision = body.revision;
      if (body.changed) remote = null; // force mirror refresh on next resource read
      return {
        ok: !!body.ok,
        revision: typeof body.revision === 'number' ? body.revision : remoteRevision,
        changed: !!body.changed,
        ...(body.ok ? { data: body.data ?? {} } : { error: body.error ?? { code: 'EXECUTION', message: 'Remote call failed' } }),
      };
    } catch (err) {
      return {
        ok: false,
        revision: remoteRevision,
        changed: false,
        error: {
          code: 'EXECUTION',
          message: `Cannot reach Moldraw session at ${base}: ${err instanceof Error ? err.message : String(err)}. Is the App bridge / \`npm run api\` running?`,
        },
      };
    }
  };

  const session: MoldrawSession = {
    applyCommand: (...a) => mirror.applyCommand(...a),
    store: mirror.store,
    ctx: mirror.ctx,
    subscribe: l => mirror.subscribe(l),
    persist: () => mirror.persist(),
    get revision() {
      return remoteRevision;
    },
    getState: (): MoldrawSessionState => ({
      revision: remoteRevision,
      molecule: mirror.store.getMolecule(),
      selection: mirror.store.getSelection(),
      canUndo: remote?.canUndo ?? false,
      canRedo: remote?.canRedo ?? false,
    }),
    undo: o => mirror.undo(o),
    redo: o => mirror.redo(o),
    setSelection: (p, o) => mirror.setSelection(p, o),
    replaceDocument: (m, o) => mirror.replaceDocument(m, o),
    focusAtoms: ids => mirror.focusAtoms(ids),
  };

  return {
    connect: async () => {
      await refresh();
      return session;
    },
    callTool,
    refresh: async () => {
      if (remote && remote.revision === remoteRevision) return;
      await refresh();
    },
    get remoteRevision() {
      return remoteRevision;
    },
  };
}
