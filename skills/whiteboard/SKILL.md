---
name: whiteboard
description: Draw diagrams on a local Excalidraw whiteboard in Chrome. Use whenever the user says "show me on the whiteboard", "draw this", "sketch this out", "put it on the whiteboard", or asks to visualize/diagram an architecture, flow, or design — and when they want an existing whiteboard drawing changed, extended, or cleared.
---

# Whiteboard (local Excalidraw)

Draw on a real Excalidraw canvas running locally by pushing elements through the
app's own API — not by dragging the mouse.

The whiteboard lives at a **fixed URL: `http://localhost:3999`**. It runs from a
clone of excalidraw at `~/dev/excalidraw`, as a **dev** build — that is what
exposes the `window.h` debug handle this skill depends on.

Override with `WHITEBOARD_PORT` / `EXCALIDRAW_REPO` if needed.

## Always append

**Every drawing is added to the board. You never replace or erase what is already
on it.** The canvas is a shared board the user is watching and may have drawn on
themselves; wiping it loses work that cannot be recovered.

- `wb.draw()` appends, always. There is no replace mode — `{ append: false }`
  throws.
- New batches are placed **below** the existing content automatically
  (`place: "below"`, the default), so author coordinates from wherever is
  convenient and they land in free space.
- `wb.clear()` and `wb.remove()` are the only ways to take something off the
  board, and you call them **only when the user explicitly asks** ("clear the
  whiteboard", "remove the cache box", "redraw that diagram"). A new drawing
  request is never an instruction to erase the old one.

## Procedure

**1. Ensure the server is up.** Idempotent: ~0.1s when already running, ~5–15s
when it has to start. Run it every time; never assume the server survived.

```bash
bash ~/.claude/skills/whiteboard/scripts/ensure-server.sh
```

(Adjust the path if this skill is installed elsewhere — it is `scripts/ensure-server.sh`
inside the skill directory.)

It prints:

```
url=http://localhost:3999
repo=/Users/you/dev/excalidraw
bootstrap=/@fs/Users/you/dev/excalidraw/.whiteboard-bootstrap.js
```

It also stages the bootstrap module inside the repo, because vite only serves
files under its own root. On failure it explains why on stderr — read it and
relay it rather than guessing.

**2. Get a tab on `url`.** Call `tabs_context_mcp` first; reuse a tab already on
`http://localhost:3999`, otherwise `tabs_create_mcp` + `navigate`. Keep the tab id
and **do not close it** — the user is looking at it. If a later call says the tab
no longer exists, re-run `tabs_context_mcp` and redo steps 2–3; the canvas is
restored from localStorage, so nothing is lost.

**3. Bootstrap the page** with `javascript_tool`, using the `bootstrap=` path:

```js
await import("/@fs/Users/you/dev/excalidraw/.whiteboard-bootstrap.js?t=" + Date.now());
`ready (${wb.list().length} elements)`
```

The cache-busting `?t=` matters — without it an edited bootstrap won't reload.
Page state dies on every reload, so **run this before each drawing** rather than
assuming it stuck. It defines `window.wb`.

**4. Draw** with `wb.draw([...])` — one call for the whole diagram, appended
below whatever is already there:

```js
wb.draw([
  { type: "rectangle", id: "client", x: 100, y: 100, width: 180, height: 90,
    backgroundColor: "#a5d8ff", strokeColor: "#1971c2", fillStyle: "solid",
    roundness: { type: 3 }, label: { text: "Client", fontSize: 18 } },
  { type: "rectangle", id: "api", x: 400, y: 100, width: 180, height: 90,
    backgroundColor: "#b2f2bb", strokeColor: "#2f9e44", fillStyle: "solid",
    roundness: { type: 3 }, label: { text: "API", fontSize: 18 } },
  { type: "arrow", x: 290, y: 145, width: 100, height: 0,
    start: { id: "client" }, end: { id: "api" }, label: { text: "HTTP", fontSize: 14 } },
])
```

It returns `{ added, total, offset }` — `offset` is how far the batch was pushed
to clear the existing content.

Read `reference.md` next to this file for the element format, styling, arrows,
frames and a palette before composing anything beyond labelled boxes.

**5. Screenshot the tab** and show the user. Always — it is how you catch
overlapping shapes or arrows that missed their anchors, and they asked to be
*shown* something.

## API on the page

| call | does |
|---|---|
| `wb.draw(skeletons, { place = "below", fit = true })` | append elements. `place`: `"below"` \| `"right"` \| `null` (literal coordinates). Returns `{added, total, offset}` |
| `wb.list()` | current elements as `{id, type, x, y, w, h, text}` — use before editing |
| `wb.bounds()` | bounding box of the board, or `null` if empty |
| `wb.remove(ids)` | delete by id (also drops bound labels) — **only on an explicit request** |
| `wb.clear()` | empty the canvas — **only on an explicit request** |
| `wb.zoomFit()` | zoom to fit (Shift+1) |
| `wb.persist()` | force-save to localStorage (`draw` already does this) |

**Draw each diagram in a single `draw()` call.** Arrow `start`/`end` ids resolve
only against shapes listed in that same call; pointing at a box already on the
canvas leaves the arrow silently unbound, so `draw()` throws if you try.

`draw()` keeps the ids you author, so `wb.remove("api")` works later. Drawing the
same id twice logs `Duplicate id found` and drops that element — so give each new
diagram fresh ids (`auth-api`, not `api` again).

## Judgement

- **A new request means a new drawing on the board**, placed below the last one.
  Do not clear first, and do not ask whether to clear — just draw.
- **Extending an existing diagram**: `wb.list()` first to see the real ids and
  coordinates, then `draw(..., { place: null })` so your coordinates are taken
  literally and the additions land inside that diagram. Remember the new arrows
  cannot bind to shapes drawn in an earlier call — to rewire a diagram,
  `wb.remove()` its ids and redraw the whole thing in one call.
- **Redrawing after a mistake** (overlaps, wrong layout): `wb.remove()` the ids
  you just added — yours, not the user's — then draw again.
- `wb.clear()` only when the user asks for a blank board, in those words.
- Use `wb.bounds()` if you want to know where your batch will land, or to title a
  diagram above itself with `place: null`.
- Lay out on a grid, ~60–80px between boxes. There is no auto-layout, so sloppy
  coordinates give overlapping arrows.
- Drawings persist in localStorage across restarts, so the canvas may already hold
  the user's own work from a previous session. Appending keeps it safe.

## When it breaks

- `Port 3999 is in use by something that is not an Excalidraw dev server` — the
  script refuses to start a second server somewhere unpredictable. Free the port,
  or re-run with `WHITEBOARD_PORT=4001`.
- `window.h is missing` — the tab is not on the dev server (a real excalidraw.com
  tab, or a stale URL). Re-run step 1 and navigate to the `url` it prints.
- `Failed to fetch dynamically imported module`, or the page errors mid-session —
  the dev server died. Re-run step 1, re-navigate, re-bootstrap.
- Drawing vanishes after reload — `wb.persist()`. The app skips its own
  localStorage save while `document.hidden`, which an automated tab usually is;
  `draw()` compensates, so this only bites if you call `updateScene` directly.
- Elements silently missing — check the console for `Duplicate id found`.

## Editing this skill

`scripts/bootstrap.js` is the source of truth; `ensure-server.sh` copies it to
`<repo>/.whiteboard-bootstrap.js` (git-excluded) on every run. Edit it here, then
re-run step 1.
