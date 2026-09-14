import { startHttpServer } from './startHttpServer';

const started = startHttpServer();
process.stderr.write(`Moldraw session API listening on ${started.url} (127.0.0.1 only)\n`);
