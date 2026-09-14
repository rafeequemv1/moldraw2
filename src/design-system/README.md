# Moldraw design system

Canonical **Windows-native / Fluent-flat** chrome for the App shell. Use these tokens and button classes for all product UI so look-and-feel stays consistent.

Library packages (`@moldraw/canvas`, etc.) keep their own styles; App chrome should import from here.

## Principles

1. **Native Windows feel** — `Segoe UI` / `system-ui`, opaque surfaces, hairline borders, small controls (~22–26px). No glass blur, no purple gradients, no oversized CTA pills.
2. **One composition** — toolbars read as one chrome band, not a dashboard of cards.
3. **Quiet defaults** — icons and text links over heavy filled buttons. Destructive actions use **light red text**, not large red blocks.
4. **Tokens first** — colors, radii, and type come from CSS variables in `tokens.css`. Prefer `var(--chrome-*)` / `var(--md-*)` over hard-coded hex in new UI.

## Files

| File | Role |
|------|------|
| [`tokens.css`](./tokens.css) | Color, type, spacing, chrome surfaces |
| [`buttons.css`](./buttons.css) | Shared button / link-button variants |
| [`index.css`](./index.css) | Barrel import for the App |

Wire-up: `src/index.css` imports `./design-system/index.css` before layout sections.

## Buttons

| Class | Use |
|-------|-----|
| `.md-btn` | Base reset (transparent, no heavy chrome) |
| `.md-btn--ghost` | Quiet toolbar / menu trigger (File, Docs-like) |
| `.md-btn--link` | Underlined text control (Select) |
| `.md-btn--danger-soft` | Destructive: **Clear** — light red text, no filled pill |
| `.md-btn--icon` | Square icon-only tool (26×26) |
| `.md-btn--primary` | Rare filled action (prefer sparingly) |

### Clear

```html
<button type="button" class="md-btn md-btn--danger-soft">Clear</button>
```

Light red (`--md-danger-soft` ≈ `#ef4444`), no background, no border, no large hit pill.

## Theme checklist (new UI)

- [ ] Uses `--chrome-bg` / `--chrome-border` / `--font-ui`
- [ ] Control height ≤ 26px unless a dialog
- [ ] No new “hero” buttons in the top bar
- [ ] Destructive = `.md-btn--danger-soft` (or `--md-danger-soft` color)
- [ ] Menus portal / escape overflow when needed
