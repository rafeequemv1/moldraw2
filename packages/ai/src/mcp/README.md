# `@moldraw/ai/mcp`

Stdio MCP transport for Moldraw tools (`moldraw-mcp` bin).

Docs: [documentation/mcp/overview.md](../../../../documentation/mcp/overview.md) · [installation + flags](../../../../documentation/mcp/installation.md) · [generated tools catalogue](../../../../documentation/mcp/tools-catalog.md)

```bash
npm run mcp -- --toolset=minimal            # repo (tsx)
npx -p @moldraw/ai moldraw-mcp --toolset=core   # published
npm run mcp -- --session-url=http://127.0.0.1:8787   # proxy to `npm run api` (live App canvas)
```

```ts
import { startStdioMcpServer, runMcpCli, buildMcpCatalog } from '@moldraw/ai/mcp'
```

| File | Role |
|------|------|
| `cli.ts` | flag parsing (`--toolset --molecule --session-url --bond-length --debug`), bin entry |
| `stdioServer.ts` | `Server` wiring: tools (toolset-filtered, annotations, `outputSchema`), resources, prompts, `instructions`, envelope |
| `envelope.ts` | `{ ok, revision, changed, data \| error }` → `content` + `structuredContent` |
| `resources.ts` | `moldraw://molecule.*`, `canvas-state.json`, `selection.json`, `templates/*` |
| `prompts.ts` | `draw-structure`, `verify-canvas`, `build-reaction`, `edit-structure` |
| `proxySession.ts` | `MoldrawSession` façade over a remote HTTP session (`--session-url`) |
| `catalog.ts` | machine-readable catalogue used by `scripts/generate-mcp-catalog.ts` and `test:agent` |
| `pluginTools.ts` / `pluginHeadless.ts` | `plugin.*` tools (advertised in `advanced` / `full`), `tools/list_changed` |

Tests: `npm run test:agent` (`../__tests__/agentGolden.ts`).
