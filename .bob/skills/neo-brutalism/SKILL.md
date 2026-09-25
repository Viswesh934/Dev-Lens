---
name: neo-brutalism
description: Use when the user wants to apply, implement, or design a neo-brutalist UI style — covers the design system tokens, CSS patterns, component rules, and conversion checklist for turning an existing UI into neo-brutalism.
---

# Neo-Brutalism UI Skill

Apply a neo-brutalist design system to a web UI. Neo-brutalism is raw, high-contrast, and deliberately unfussy — heavy borders, flat shadows, bold typography, and a warm paper background with saturated accent punches.

---

## Design System Tokens

Always establish these CSS custom properties first. Adapt the accent colours to the project's personality, but keep the structural tokens (border, shadow, radius) exactly as shown.

```css
:root {
  /* Surfaces */
  --bg:      #f5f0e8;   /* warm parchment — the base page colour */
  --surface: #ffffff;   /* card / input / panel background */

  /* Borders & text */
  --border:       #1a1a1a;
  --border-width: 2px;
  --text:         #1a1a1a;
  --muted:        #555555;

  /* Accents — customise freely, keep high saturation */
  --accent:  #ff6b35;   /* primary CTA — orange, red, etc. */
  --accent2: #4361ee;   /* secondary — blue, purple, etc. */
  --yellow:  #ffd60a;   /* highlight / active state */
  --green:   #06d6a0;   /* success */
  --red:     #ef233c;   /* error / danger */

  /* Shape */
  --radius: 0px;        /* no rounding — hard corners everywhere */

  /* Shadows — offset flat drop-shadow, not blurred */
  --shadow:    3px 3px 0px #1a1a1a;
  --shadow-lg: 5px 5px 0px #1a1a1a;

  /* Typography */
  --font: "Space Grotesk", "Segoe UI", system-ui, sans-serif;
  --mono: "Space Mono", "SFMono-Regular", Consolas, monospace;
}
```

---

## Core Rules

Apply every rule in this section. They are not optional.

### 1. Borders
- Every interactive element (buttons, inputs, selects, textareas, cards) gets `border: var(--border-width) solid var(--border)`.
- No `border-radius` — always `border-radius: var(--radius)` which resolves to `0px`.
- Dividers use `border-top: var(--border-width) solid var(--border)`, not lighter colours.

### 2. Flat offset shadows
- Cards, buttons, inputs, result panels, and notices all carry `box-shadow: var(--shadow)`.
- Hover state escalates to `box-shadow: var(--shadow-lg)` paired with `transform: translate(-1px, -1px)`.
- Active/pressed state: `box-shadow: 1px 1px 0px var(--border); transform: translate(2px, 2px)`.
- Never use `blur` in box-shadow. The shadow is always a flat solid offset.

### 3. Typography
- All headings: `font-weight: 900; text-transform: uppercase; letter-spacing: -0.3px`.
- Labels and badges: `font-weight: 800; text-transform: uppercase; letter-spacing: 1px`.
- Button text: `font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px`.
- Body and muted text keeps normal casing and `font-weight: 400–600`.
- Use `--font` for UI; `--mono` for code, file paths, commit SHAs.

### 4. Colour usage
- Background: `--bg` (warm parchment). Never plain white for the page background.
- Active nav items and header: `--yellow` background with dark text.
- Primary CTA buttons: `--accent` background, dark text (not white on orange — check contrast).
- Selected/active states: `--accent2` (blue) with white text.
- Tags and highlights: `--yellow` background.
- Success/error notices: `--green` / `--red` with `--border` border, not softened.

### 5. Inputs and selects
```css
select, textarea, input[type="text"] {
  border: var(--border-width) solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  background: var(--surface);
}
select:focus, textarea:focus, input[type="text"]:focus {
  border-color: var(--accent);
  box-shadow: 3px 3px 0px var(--accent);
  outline: none;
}
```

### 6. Navigation sidebar (left-side)
- White surface, dark border on the right edge only.
- Active item: `--yellow` background, `border-left: 4px solid var(--border)`, `font-weight: 900`.
- Hover: `--bg` background, `border-left-color: var(--border)`.
- Items separated by 1px `--border` bottom border (remove on last item).
- No `border-right` active indicator — use `border-left` since the sidebar is on the left.

### 7. Header
- `background: var(--yellow)`, `border-bottom: var(--border-width) solid var(--border)`.
- Logo: `font-weight: 800; text-transform: uppercase`.
- Repo badge in header: `background: var(--surface); border: var(--border-width) solid var(--border); box-shadow: var(--shadow)`.

### 8. Cards and panels
```css
.card {
  background: var(--surface);
  border: var(--border-width) solid var(--border);
  box-shadow: var(--shadow);
  padding: 16px;
}
```
No `border-radius`. No gradient. No blur.

### 9. Tags / badges
```css
.tag {
  background: var(--yellow);
  border: var(--border-width) solid var(--border);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
}
```

### 10. Status notices
```css
.notice         { background: var(--surface); border: 2px solid var(--border); box-shadow: var(--shadow); }
.notice.warning { background: var(--yellow); }
.notice.success { background: var(--green);  color: var(--text); }
.notice.error   { background: var(--red);    color: #ffffff; }
```
Never soften the border colour on status notices.

---

## Conversion Checklist

When converting an existing UI to neo-brutalism, work through these steps in order:

1. **Tokens** — Replace all CSS variables with the neo-brutalism token set above. Map old `--accent` to `--accent`, old greys to `--muted`, old white backgrounds to `--bg` (page) and `--surface` (panels).
2. **Borders** — Find every element with `border: 1px solid` or no border. Replace with `border: var(--border-width) solid var(--border)`. Remove all `border-radius` values (set to 0 or `var(--radius)`).
3. **Shadows** — Find every `box-shadow` with blur. Replace with flat offset shadows. Add `var(--shadow)` to cards, buttons, inputs, and notices that lack it.
4. **Buttons** — Add `font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px`. Add hover lift and active press transforms (see Rule 2).
5. **Typography** — Make all `<h1>–<h3>` uppercase + `font-weight: 900`. Make all labels uppercase + `font-weight: 800`. Do not uppercase body paragraphs.
6. **Header** — Paint `--yellow`. Add `font-weight: 800` to logo. Badge any metadata (repo name, status) with a border + shadow pill.
7. **Navigation** — Move sidebar to the left if it is on the right. Apply left-border active indicator. Remove right-border indicator. Paint active items `--yellow`.
8. **Inputs** — Add `box-shadow: var(--shadow)`. Set focus to colour-accent shadow.
9. **Tags** — Paint `--yellow` background. Set `font-weight: 700; text-transform: uppercase`.
10. **Status notices** — Replace soft pastel backgrounds with the saturated `--green` / `--red` / `--yellow` colours. Keep `--border` colour borders.
11. **Monospace elements** — Swap `font-family` to `var(--mono)` for all code, file paths, commits, and hashes.

---

## What Not To Do

- No `border-radius` greater than `0px` unless the user explicitly overrides it for a specific component.
- No blurred `box-shadow` (no third or fourth spread/blur values that aren't `0`).
- No gradients on any surface.
- No animations or transitions beyond the `0.08s` button lift.
- No white page background — always use `--bg` (warm parchment).
- No light grey borders — borders are always `--border` (`#1a1a1a`), never a diluted colour.
- Do not use `font-weight < 400` for any text, or `font-weight < 700` for any label, button, or heading.
