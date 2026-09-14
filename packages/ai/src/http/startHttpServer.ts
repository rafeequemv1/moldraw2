/**
 * Local HTTP + SSE adapter. Binds 127.0.0.1 only — not public.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { MoldrawSession } from '../session/types';
import { createHeadlessSession } from '../session/createHeadlessSession';
import { dispatchSessionHttp } from './dispatch';

export interface StartHttpServerOptions {
  session?: MoldrawSession;
  host?: string;
  port?: number;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function writeCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Moldraw-Expected-Revision, X-Moldraw-Client-Id');
}

function handleSse(session: MoldrawSession, res: ServerResponse): void {
  writeCors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(
    `data: ${JSON.stringify({ type: 'session.loaded', revision: session.revision })}\n\n`,
  );
  const unsub = session.subscribe(event => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  res.on('close', () => {
    unsub();
  });
}

export function startHttpServer(opts: StartHttpServerOptions = {}): {
  session: MoldrawSession;
  close: () => Promise<void>;
  url: string;
} {
  const host = opts.host ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('Moldraw HTTP API must bind 127.0.0.1 (not public).');
  }
  const port = opts.port ?? (Number(process.env.MOLDRAW_API_PORT) || 8787);
  const session = opts.session ?? createHeadlessSession();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    writeCors(res);
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const path = url.split('?')[0] ?? '/';
    if (method === 'GET' && (path === '/v1/events' || path === '/v1/events/')) {
      handleSse(session, res);
      return;
    }
    let body: unknown = {};
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        body = await readJsonBody(req);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'VALIDATION', message: 'Invalid JSON body' },
          }),
        );
        return;
      }
    }
    const result = await dispatchSessionHttp(session, {
      method,
      path: url,
      body,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    res.writeHead(result.status, result.headers);
    res.end(JSON.stringify(result.body));
  });

  server.listen(port, host);
  const url = `http://${host}:${port}`;
  return {
    session,
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}
