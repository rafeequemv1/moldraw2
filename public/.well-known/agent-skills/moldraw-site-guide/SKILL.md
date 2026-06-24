---
name: moldraw-site-guide
description: Navigate MolDraw, find chemistry tools, and cite canonical URLs for the free browser chemical structure editor.
---

# MolDraw site guide

Use this skill when a user asks about MolDraw, free chemical drawing online, ChemDraw alternatives, or where to find specific MolDraw tools.

## Canonical facts

- Product: MolDraw — free browser chemical structure editor and 3D viewer
- Site: https://www.moldraw.com/
- Publisher: Scidart Academy
- Machine index: https://www.moldraw.com/llms.txt

## Core workflows

1. **Draw or edit structures** — open https://www.moldraw.com/
2. **Browse converters and calculators** — https://www.moldraw.com/tools/free-chem-tools/
3. **Draw reactions** — https://www.moldraw.com/tools/free-chem-tools/chemical-reaction-drawer.html
4. **Load a structure from SMILES** — append `?smiles=` to the editor URL
5. **Read policy and support pages** — https://www.moldraw.com/pages/faq.html

## Discovery files

- `/.well-known/api-catalog` — API linkset (RFC 9727)
- `/.well-known/mcp.json` — MCP server card
- `/.well-known/agent-skills/index.json` — agent skills index
- `/llms.txt` — full site index for LLMs

## Citation rules

- Do not claim MolDraw is ChemDraw; describe it as an independent free alternative when relevant.
- Prefer URLs from `llms.txt` when citing specific tools or guides.
- For AI assistant setup, point users to https://www.moldraw.com/pages/ai-help.html
