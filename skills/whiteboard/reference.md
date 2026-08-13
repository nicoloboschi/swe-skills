# ExcalidrawElementSkeleton cheat sheet

`wb.draw(skeletons)` takes an array of skeletons. Source of truth:
`packages/element/src/transform.ts` in the excalidraw repo.

## Shared style props

Valid on any element:

```js
{
  x, y, width, height, angle,          // angle in radians
  strokeColor, backgroundColor,        // "#1e1e1e", "transparent", ...
  fillStyle: "hachure" | "cross-hatch" | "solid",
  strokeWidth: 1 | 2 | 4,
  strokeStyle: "solid" | "dashed" | "dotted",
  roughness: 0 | 1 | 2,                // 0 = architect, 1 = artist, 2 = cartoonist
  opacity: 0..100,
  roundness: { type: 3 } | null,       // type 3 = rounded corners; null = sharp
  groupIds: ["g1"],                    // shared string => elements move together
  link: "https://...",
  locked: false,
}
```

## Containers: rectangle / ellipse / diamond

```js
{ type: "rectangle", id: "db", x: 100, y: 100, width: 180, height: 90,
  backgroundColor: "#a5d8ff", fillStyle: "solid",
  label: { text: "Postgres", fontSize: 20, strokeColor: "#1e1e1e" } }
```

- `label` binds text to the container and centers it. Omit `width`/`height`
  and the container auto-sizes to fit the label.
- Label supports `fontSize`, `fontFamily`, `textAlign`, `verticalAlign`,
  `strokeColor`.

## Arrows and lines

```js
{ type: "arrow", x: 300, y: 150, width: 140, height: 0,
  start: { id: "db" }, end: { id: "api" },
  label: { text: "reads" },
  strokeColor: "#e03131", strokeStyle: "dashed",
  startArrowhead: null, endArrowhead: "arrow" }
```

- `start` / `end` bind by `{ id }` to an element listed in the **same `draw()`
  call**. Bound arrows re-route when the user moves the shapes.
  Binding to something already on the canvas from an *earlier* call does **not**
  work — excalidraw resolves ids against a store built per conversion. The
  bootstrap throws on this rather than letting it fail silently. Draw a whole
  diagram in one call.
- `start`/`end` can also *create* the endpoint inline:
  `end: { type: "rectangle", width: 120 }` or `end: { type: "text", text: "hi" }`.
- Without bindings the arrow is drawn from `(x, y)` for `width`/`height`.
- Arrowheads: `"arrow" | "triangle" | "dot" | "bar" | null`.
- `type: "line"` is the same minus arrowheads. Supply `points` for polylines:
  `points: [[0,0],[50,60],[120,0]]` (relative to `x`,`y`).

## Standalone text

```js
{ type: "text", x: 100, y: 40, text: "Architecture", fontSize: 28,
  fontFamily: 1, textAlign: "left" }
```

`fontFamily`: `1` hand-drawn (Excalifont), `2` normal (Nunito), `3` code.

## Frames

```js
{ type: "frame", name: "Phase 1", children: ["db", "api"] }
```

`children` are ids of already-listed elements.

## Palette that reads well (Excalidraw's own)

| role | stroke | background |
|---|---|---|
| blue | `#1971c2` | `#a5d8ff` |
| green | `#2f9e44` | `#b2f2bb` |
| yellow | `#f08c00` | `#ffec99` |
| red | `#e03131` | `#ffc9c9` |
| violet | `#6741d9` | `#d0bfff` |
| grey | `#343a40` | `#e9ecef` |

Default text/stroke is `#1e1e1e`.

## Layout tips

- Excalidraw's y-axis grows downward; there is no auto-layout, so compute
  positions yourself.
- Keep ~60–80px gaps between boxes so bound arrows have room.
- A tidy default box is `width: 180, height: 90` with `fontSize: 20`.
- **Centre-align boxes joined by a long arrow.** Excalidraw picks a binding
  "focus" from the arrow's geometry, so a long connector between boxes whose
  centres are offset drifts sideways and lands beside the target instead of on
  it. Matching centres (`x + width/2`) keeps the run straight.
- Lay rows out on a grid (e.g. x = 100, 380, 660) and it looks deliberate.
