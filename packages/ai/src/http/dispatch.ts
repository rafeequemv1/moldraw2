/**
 * Local HTTP dispatcher — thin adapter over session.applyCommand / executeAiTool.
 * Bind only 127.0.0.1. No auth, no multi-tenant (one session, id `default`).
 *
 * Concurrency: every mutating route accepts `expectedRevision` (body field,
 * `x-moldraw-expected-revision` header or query param) and answers
 * `409 STALE_REVISION` when the session moved on. `clientId` (body / header
 * `x-moldraw-client-id`) is echoed on the SSE event so a bridge can ignore
 * its own writes.
 */
import type { Molecule } from '@moldraw/domain';
import { getCommand, listCommands, listCommandIds } from '@moldraw/core';
import { executeAiTool } from '../executor';
import { getRegisteredAiTool, listAiToolsByCategory } from '../registry';
import { zodToOpenApiParameters } from '../zodToOpenApi';
import type { ApplyCommandOptions, MoldrawSession, SessionCommandResult } from '../session/types';

export interface HttpDispatchRequest {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface HttpDispatchResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export const DEFAULT_SESSION_ID = 'default';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(status: number, body: unknown): HttpDispatchResponse {
  return { status, body, headers: JSON_HEADERS };
}

function splitPath(path: string): { path: string; query: URLSearchParams } {
  const q = path.indexOf('?');
  const raw = q >= 0 ? path.slice(0, q) : path;
  const query = new URLSearchParams(q >= 0 ? path.slice(q + 1) : '');
  let normalized = raw.replace(/\/+$/, '') || '/';
  // `/v1/sessions/default/...` is an alias for `/v1/...` (forward-compatible with multi-session).
  const sessionAlias = normalized.match(/^\/v1\/sessions\/([^/]+)(\/.*)?$/);
  if (sessionAlias && sessionAlias[2]) {
    normalized = `/v1${sessionAlias[2]}`;
  }
  return { path: normalized, query };
}

function headerValue(req: HttpDispatchRequest, name: string): string | undefined {
  const v = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function applyOptionsFrom(req: HttpDispatchRequest, query: URLSearchParams, body: Record<string, unknown>): ApplyCommandOptions {
  const rawExpected =
    body.expectedRevision ?? headerValue(req, 'x-moldraw-expected-revision') ?? query.get('expectedRevision') ?? undefined;
  const expectedRevision =
    rawExpected === undefined || rawExpected === null || rawExpected === '' ? undefined : Number(rawExpected);
  const clientId =
    (typeof body.clientId === 'string' ? body.clientId : undefined) ??
    headerValue(req, 'x-moldraw-client-id') ??
    query.get('clientId') ??
    undefined;
  return {
    expectedRevision: Number.isFinite(expectedRevision as number) ? expectedRevision : undefined,
    clientId,
    includeMolecule: body.includeMolecule === true || query.get('includeMolecule') === '1',
  };
}

function statusFor(result: SessionCommandResult): number {
  if (result.ok) return 200;
  switch (result.error.code) {
    case 'VALIDATION':
      return 400;
    case 'UNKNOWN_COMMAND':
    case 'UNKNOWN_TOOL':
      return 404;
    case 'STALE_REVISION':
      return 409;
    default:
      return 422;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const revisionParams = {
    expectedRevision: { type: 'integer', description: 'Fail with 409 STALE_REVISION if the session revision differs.' },
    clientId: { type: 'string', description: 'Echoed on the SSE event (bridge echo suppression).' },
  };
  const paths: Record<string, unknown> = {
    '/v1/sessions': {
      get: { summary: 'List sessions (single local session `default`)', responses: { '200': { description: 'Sessions' } } },
    },
    '/v1/molecule': {
      get: { summary: 'Current molecule', responses: { '200': { description: 'Molecule + revision' } } },
      put: {
        summary: 'Replace the whole document (undoable)',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['molecule'],
                properties: { molecule: { type: 'object' }, ...revisionParams },
              },
            },
          },
        },
      },
    },
    '/v1/selection': {
      get: { summary: 'Current selection', responses: { '200': { description: 'Selection + revision' } } },
      put: { summary: 'Set selection', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } },
    },
    '/v1/state': {
      get: { summary: 'Molecule, selection, revision', responses: { '200': { description: 'Full session state' } } },
    },
    '/v1/events': {
      get: { summary: 'SSE session events (session.changed / undo / redo / document / focus)', responses: { '200': { description: 'text/event-stream' } } },
    },
    '/v1/undo': { post: { summary: 'Undo', responses: { '200': { description: 'Result' } } } },
    '/v1/redo': { post: { summary: 'Redo', responses: { '200': { description: 'Result' } } } },
    '/v1/focus': {
      post: {
        summary: 'Ask connected canvases to scroll to atoms',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { atomIds: { type: 'array', items: { type: 'string' } } } } } } },
      },
    },
    '/v1/commands': {
      post: {
        summary: 'Apply a Zod command',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: 'string' },
                  input: { type: 'object' },
                  includeMolecule: { type: 'boolean' },
                  ...revisionParams,
                },
              },
            },
          },
        },
      },
    },
  };

  for (const cmd of listCommands()) {
    paths[`/v1/commands/${cmd.id}`] = {
      post: {
        summary: cmd.description,
        requestBody: {
          content: { 'application/json': { schema: zodToOpenApiParameters(cmd.inputSchema) } },
        },
      },
    };
  }

  for (const tool of listAiToolsByCategory()) {
    paths[`/v1/tools/${tool.id}`] = {
      post: {
        summary: tool.description,
        requestBody: {
          content: { 'application/json': { schema: zodToOpenApiParameters(tool.inputSchema) } },
        },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: { title: 'Moldraw Session API', version: '0.2.0' },
    servers: [{ url: 'http://127.0.0.1:8787' }],
    paths,
  };
}

export async function dispatchSessionHttp(
  session: MoldrawSession,
  request: HttpDispatchRequest,
): Promise<HttpDispatchResponse> {
  const method = request.method.toUpperCase();
  const { path, query } = splitPath(request.path);
  const body = isRecord(request.body) ? request.body : {};

  if (method === 'GET' && (path === '/' || path === '/v1')) {
    return json(200, {
      name: 'moldraw-session',
      version: '0.2.0',
      bind: '127.0.0.1',
      faces: ['commands', 'tools', 'reads', 'events', 'document'],
      sessionId: DEFAULT_SESSION_ID,
      revision: session.revision,
      commandIds: listCommandIds(),
    });
  }

  if (method === 'GET' && path === '/v1/openapi.json') {
    return json(200, buildOpenApiDocument());
  }

  if (method === 'GET' && path === '/v1/sessions') {
    const state = session.getState();
    return json(200, {
      sessions: [
        {
          id: DEFAULT_SESSION_ID,
          revision: state.revision,
          atomCount: state.molecule.atoms.length,
          bondCount: state.molecule.bonds.length,
          canUndo: state.canUndo,
          canRedo: state.canRedo,
        },
      ],
    });
  }

  if (method === 'GET' && path === `/v1/sessions/${DEFAULT_SESSION_ID}`) {
    const state = session.getState();
    return json(200, { id: DEFAULT_SESSION_ID, ...state });
  }

  if (method === 'GET' && path === '/v1/molecule') {
    const state = session.getState();
    return json(200, { revision: state.revision, molecule: state.molecule });
  }

  if (method === 'PUT' && path === '/v1/molecule') {
    const molecule = body.molecule as Molecule | undefined;
    if (!isRecord(molecule)) {
      return json(400, {
        ok: false,
        revision: session.revision,
        changed: false,
        error: { code: 'VALIDATION', message: 'Body must include { molecule: { atoms, bonds, … } }' },
      });
    }
    const result = session.replaceDocument(molecule, applyOptionsFrom(request, query, body));
    return json(statusFor(result), result);
  }

  if (method === 'GET' && path === '/v1/selection') {
    const state = session.getState();
    return json(200, { revision: state.revision, selection: state.selection });
  }

  if (method === 'PUT' && path === '/v1/selection') {
    const patch = isRecord(body.selection) ? body.selection : body;
    const result = session.setSelection(patch, applyOptionsFrom(request, query, body));
    return json(statusFor(result), result);
  }

  if (method === 'GET' && path === '/v1/state') {
    return json(200, session.getState());
  }

  if (method === 'POST' && path === '/v1/undo') {
    const result = session.undo(applyOptionsFrom(request, query, body));
    return json(statusFor(result), result);
  }

  if (method === 'POST' && path === '/v1/redo') {
    const result = session.redo(applyOptionsFrom(request, query, body));
    return json(statusFor(result), result);
  }

  if (method === 'POST' && path === '/v1/focus') {
    const atomIds = Array.isArray(body.atomIds) ? body.atomIds.filter((x): x is string => typeof x === 'string') : [];
    if (atomIds.length === 0) {
      return json(400, {
        ok: false,
        revision: session.revision,
        changed: false,
        error: { code: 'VALIDATION', message: 'Body must include atomIds: string[]' },
      });
    }
    session.focusAtoms(atomIds);
    return json(200, { ok: true, revision: session.revision, changed: false });
  }

  if (method === 'POST' && path === '/v1/commands') {
    const id = body.id;
    if (!id || typeof id !== 'string') {
      return json(400, {
        ok: false,
        revision: session.revision,
        changed: false,
        error: { code: 'VALIDATION', message: 'Body must include command id' },
      });
    }
    if (id !== 'selection.set' && id !== 'molecule.setSelection' && !getCommand(id)) {
      return json(404, {
        ok: false,
        revision: session.revision,
        changed: false,
        error: { code: 'UNKNOWN_COMMAND', message: `Unknown command: ${id}` },
      });
    }
    const result = session.applyCommand({ id, input: body.input ?? {} }, undefined, applyOptionsFrom(request, query, body));
    return json(statusFor(result), result);
  }

  const commandMatch = path.match(/^\/v1\/commands\/(.+)$/);
  if (method === 'POST' && commandMatch) {
    const id = decodeURIComponent(commandMatch[1]);
    if (id !== 'selection.set' && id !== 'molecule.setSelection' && !getCommand(id)) {
      return json(404, {
        ok: false,
        revision: session.revision,
        changed: false,
        error: { code: 'UNKNOWN_COMMAND', message: `Unknown command: ${id}` },
      });
    }
    // Body is the command input itself; concurrency options come from headers / query.
    const result = session.applyCommand({ id, input: request.body ?? {} }, undefined, applyOptionsFrom(request, query, {}));
    return json(statusFor(result), result);
  }

  const toolMatch = path.match(/^\/v1\/tools\/(.+)$/);
  if (method === 'POST' && toolMatch) {
    const id = decodeURIComponent(toolMatch[1]);
    if (!getRegisteredAiTool(id)) {
      return json(404, {
        ok: false,
        revision: session.revision,
        changed: false,
        error: { code: 'UNKNOWN_TOOL', message: `Unknown tool: ${id}` },
      });
    }
    const opts = applyOptionsFrom(request, query, {});
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== session.revision) {
      return json(409, {
        ok: false,
        revision: session.revision,
        changed: false,
        error: {
          code: 'STALE_REVISION',
          message: `Session revision is ${session.revision}, but expectedRevision was ${opts.expectedRevision}. Re-read the state and retry.`,
          details: { expected: opts.expectedRevision, actual: session.revision },
        },
      });
    }
    const beforeRev = session.revision;
    const result = await executeAiTool(id, request.body ?? {}, session.ctx);
    if (result.ok) {
      return json(200, {
        ok: true,
        revision: session.revision,
        changed: session.revision !== beforeRev,
        data: result.data ?? {},
      });
    }
    return json(result.error.code === 'VALIDATION' ? 400 : result.error.code === 'NOT_FOUND' ? 404 : 422, {
      ok: false,
      revision: session.revision,
      changed: false,
      error: result.error,
    });
  }

  return json(404, { ok: false, error: { code: 'NOT_FOUND', message: `${method} ${path}` } });
}
