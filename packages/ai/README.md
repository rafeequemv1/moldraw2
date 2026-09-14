# `@moldraw/ai`

Who this is for: people adding tools or running MCP / local HTTP.

Moldraw stays a visual editor. This package is the **session kernel** plus the tool registry. Canvas does not import it.

```text
Zod command registry
        ↓
Session kernel  (MCP / HTTP / headless tools)
        ↓
Store
        ↓
Canvas (session-unaware) · MCP · HTTP
```

## Mental model

| Face | Mutation path |
|------|----------------|
| Canvas / embed | Host store: `createMoleculeStore` → `store.applyCommand` |
| MCP / HTTP / Node tools | `session.applyCommand` only |
| Tools | `executeAiTool(..., session.ctx)` — tools must end in `session.applyCommand` |

`runCommand` from `@moldraw/core` is the store’s internal Zod runner. Do not use it as an MCP or HTTP adapter.

## Layout

```
src/
  tools/
    facade/     # draw.* / edit.* — flat inputs, generated ids, atomic (molecule.transaction)
    read/       # introspection (get_canvas_state, get_structure, find_rings, find_substructure, render, …)
    async/      # engine/worker-backed (cleanup, aromatize, check_structure, cip_stereo, …)
    meta/       # undo / redo / set_selection / batch / list_tools
    recipes/    # agent-friendly compositions (move_fragment, build_reaction_scheme, …)
    index.ts    # assembles HAND_AUTHORED + COMMAND_TOOLS
  registry.ts   # thin public assembler (AI_TOOL_IDS)
  toolsets.ts   # minimal ⊂ core ⊂ advanced ⊂ full (what tools/list advertises)
  session/      # createMoldrawSession — public mutation path (revision, events, expectedRevision)
  http/         # local 127.0.0.1 REST + SSE (+ OpenAPI)
  mcp/          # stdio MCP: cli (bin), stdioServer, envelope, resources, prompts, proxySession, catalog
  chat/         # Gemini provider + runChatTurn
  __tests__/    # sessionKernel (test:session) · agentGolden (test:agent)
```

## Do this

```ts
import { createMoldrawSession, executeAiTool } from '@moldraw/ai'

const session = createMoldrawSession({ initialMolecule })
const result = session.applyCommand('molecule.addAtom', {
  atom: { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 },
})
await executeAiTool('molecule.stats', {}, session.ctx)
```

File-backed MCP/HTTP:

```ts
import { createHeadlessSession } from '@moldraw/ai/mcp'

const session = createHeadlessSession()
```

## Do not

- Invent `Mut.*` or a second mutation API.
- Build `ctx.applyCommand` from `runCommand` + file overwrite.
- Import the session from `@moldraw/canvas`.
- Bind HTTP on a public interface. `npm run api` listens on `127.0.0.1` only.

## Authoring rules

1. **New mutation** → add a command in `packages/core` only (with `.describe()` on every field and `visibility` / `tags` metadata). It appears as `command.molecule.*` automatically.
2. **New read / recipe / async / meta / facade tool** → one file under `tools/{category}/` + schema (`schemas/tools.ts` or inline) + register in `tools/index.ts` `HAND_AUTHORED_TOOLS` + id in `registry.ts` `AI_TOOL_IDS`. Set `title`, `tags`, `visibility`; description ≥ 40 chars.
3. **Never** call `Mut.*` from AI tools — use `ctx.applyCommand` or context hooks. Multi-command tools wrap steps in `CMD.Transaction` so they are one undo entry.
4. Async Indigo ops that need a `molBlock` payload stay off the auto command list (`ASYNC_CONTEXT_COMMAND_IDS`) and get a dedicated async tool instead.
5. Add a task to `__tests__/agentGolden.ts`; `npm run test:agent` also enforces described parameters, toolset sizes and the `minimal` payload budget.
6. `npm run mcp:catalog` regenerates `documentation/mcp/tools-catalog.md|json` + the server card (also runs in `prebuild`).

## Categories

| Category | Examples |
|----------|----------|
| `facade` | `draw.smiles`, `draw.atom`, `draw.bond`, `draw.ring`, `draw.chain`, `draw.text`, `draw.arrow`, `edit.atom`, `edit.bond`, `edit.delete` |
| `read` | `molecule.get_canvas_state`, `molecule.get_structure`, `molecule.find_rings`, `molecule.find_substructure`, `molecule.render`, `molecule.stats`, `moldraw.list_tools` |
| `recipe` | `molecule.move_fragment`, `rotate_fragment`, `align_fragments`, `paint_rings`, `color_rings`, `place_template`, `build_reaction_scheme` |
| `async` | `molecule.aromatize`, `molecule.check_structure`, `molecule.cip_stereo`, `command.molecule.cleanup` |
| `meta` | `molecule.undo`, `molecule.redo`, `molecule.set_selection`, `molecule.batch` |
| `mutate` | `command.molecule.addAtom`, … |

Use `listAiToolsByCategory('read')` for filtered catalogs, `isToolInToolset(tool, 'minimal')` for what MCP advertises by default.

## Result envelope

Every MCP / HTTP tool call returns `{ ok, revision, changed, data | error: { code, message, details } }` (`mcp/envelope.ts`). Codes: `UNKNOWN_TOOL`, `UNKNOWN_COMMAND`, `VALIDATION`, `NOT_FOUND`, `EXECUTION`, `STALE_REVISION`, `NO_DISPATCHER`.

## Run MCP / local HTTP

```bash
npm run mcp -- --toolset=minimal                      # stdio MCP (default toolset)
npm run mcp -- --session-url=http://127.0.0.1:8787     # proxy to a running `npm run api` (live App canvas)
npm run api                                           # local HTTP + SSE on 127.0.0.1:8787
npm run test:session                                  # kernel + HTTP goldens
npm run test:agent                                    # agent contract, stdio subprocess, bridge
```

Published: `npx -p @moldraw/ai moldraw-mcp --toolset=minimal`. HTTP: `POST /v1/commands`, `POST /v1/tools/:id`, `PUT /v1/molecule`, `/v1/undo|redo|focus`, GET reads, SSE `/v1/events`, `expectedRevision` → `409 STALE_REVISION`. See [http-api.md](../../documentation/http-api.md).

## Docs

- [Session kernel](../../documentation/architecture/session-and-api.md)
- [For AI agents](../../documentation/for-agents.md)
- [Local HTTP API](../../documentation/http-api.md)
- [MCP overview](../../documentation/mcp/overview.md) · [installation + flags](../../documentation/mcp/installation.md) · [generated tools catalogue](../../documentation/mcp/tools-catalog.md)
- [AI readiness review & status](../../documentation/mcp/ai-readiness-review.md)
