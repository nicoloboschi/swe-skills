// Excalidraw whiteboard bootstrap.
//
// Source of truth for this file is scripts/bootstrap.js inside the skill directory.
// ensure-server.sh copies it to <repo>/.whiteboard-bootstrap.js so that vite (which
// only serves files under its root) can hand it to the page. Edit it HERE, not in
// the repo copy.
//
// Loaded from the page with:
//   await import("/@fs<repo>/.whiteboard-bootstrap.js?t=" + Date.now())
// Defines window.wb as a side effect.

import {
  convertToExcalidrawElements,
  CaptureUpdateAction,
} from "./packages/excalidraw/index.tsx";
import { LocalData } from "./excalidraw-app/data/LocalData.ts";

if (!window.h?.app) {
  throw new Error(
    "window.h is missing — this tab is not running the Excalidraw DEV server " +
      "(the debug handle only exists in dev builds). Check the URL/port.",
  );
}

const live = () => window.h.elements.filter((e) => !e.isDeleted);

// The app only writes to localStorage from its onChange handler, and that bails
// out while `document.hidden` — which an automated/background tab usually is.
// Without this, a drawing vanishes on the next reload.
const persist = () => {
  const elements = live();
  try {
    // `_save` is TS-private but a normal static at runtime; it is the app's own
    // save path (appState cleanup + file storage), so prefer it.
    LocalData._save(elements, window.h.state, {}, () => {});
    LocalData.flushSave();
    if (JSON.parse(localStorage.getItem("excalidraw") || "[]").length === elements.length) {
      return "app";
    }
  } catch {
    /* fall through to the direct write */
  }
  localStorage.setItem("excalidraw", JSON.stringify(elements));
  return "direct";
};

const commit = (elements) => {
  window.h.app.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction?.IMMEDIATELY,
  });
  persist();
};

// Excalidraw exposes no scroll-to-fit on the debug handle, so use the Shift+1
// ("zoom to fit") keyboard shortcut.
const zoomFit = () => {
  const c =
    document.querySelector(".excalidraw canvas.interactive") ||
    document.querySelector(".excalidraw");
  c.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "1",
      code: "Digit1",
      shiftKey: true,
      bubbles: true,
    }),
  );
  return window.h.state.zoom.value;
};

// Arrow start/end ids only resolve against the SAME draw() call — excalidraw
// builds a throwaway element store per conversion. Referencing an id that is
// already on the canvas fails silently, leaving an unbound arrow, so catch it.
const checkBindings = (skeletons) => {
  const batch = new Set(skeletons.map((s) => s.id).filter(Boolean));
  const bad = [];
  for (const s of skeletons) {
    if (s.type !== "arrow") {
      continue;
    }
    for (const side of ["start", "end"]) {
      const ref = s[side];
      if (ref?.id && !ref.type && !batch.has(ref.id)) {
        bad.push(`${s.id ?? "(unnamed arrow)"}.${side} -> "${ref.id}"`);
      }
    }
  }
  return bad;
};

// Bounding box of everything on the canvas, or null when it is empty.
const bounds = () => {
  const els = live();
  if (!els.length) {
    return null;
  }
  const box = els.reduce(
    (b, e) => ({
      minX: Math.min(b.minX, e.x),
      minY: Math.min(b.minY, e.y),
      maxX: Math.max(b.maxX, e.x + (e.width || 0)),
      maxY: Math.max(b.maxY, e.y + (e.height || 0)),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  return {
    minX: Math.round(box.minX),
    minY: Math.round(box.minY),
    maxX: Math.round(box.maxX),
    maxY: Math.round(box.maxY),
    width: Math.round(box.maxX - box.minX),
    height: Math.round(box.maxY - box.minY),
  };
};

const GAP = 120;

// Since draw() always appends, a second batch authored at the same coordinates as
// the first would land on top of it. Translate the whole batch past the current
// content instead, so callers can keep writing coordinates from wherever they like.
const offsetFor = (skeletons, place) => {
  const b = place ? bounds() : null;
  if (!b) {
    return { dx: 0, dy: 0 };
  }
  const xs = skeletons.map((s) => s.x).filter((n) => typeof n === "number");
  const ys = skeletons.map((s) => s.y).filter((n) => typeof n === "number");
  if (!xs.length || !ys.length) {
    return { dx: 0, dy: 0 };
  }
  // max(0, ...): never drag a batch backwards into the existing drawing.
  return place === "right"
    ? { dx: Math.max(0, b.maxX + GAP - Math.min(...xs)), dy: 0 }
    : { dx: 0, dy: Math.max(0, b.maxY + GAP - Math.min(...ys)) };
};

const translate = (skeletons, { dx, dy }) =>
  dx || dy
    ? skeletons.map((s) => ({
        ...s,
        x: typeof s.x === "number" ? s.x + dx : s.x,
        y: typeof s.y === "number" ? s.y + dy : s.y,
      }))
    : skeletons;

// draw(skeletons, { place = "below", fit = true, regenerateIds = false })
// skeletons use the ExcalidrawElementSkeleton format: labels, arrow bindings and
// text measurement are handled for you.
//
// draw() ALWAYS appends. The whiteboard is a board the user keeps looking at and
// building on, so nothing here removes their work: `place` decides where the new
// batch goes ("below" | "right" | null to use the literal coordinates), and
// erasing is a separate, explicit call — wb.remove(ids) or wb.clear().
//
// regenerateIds:false keeps the ids you authored so wb.remove(id) works later.
// The cost: drawing the same id twice logs "Duplicate id found" and drops the
// element — pick fresh ids per diagram, or wb.remove() the old one first.
const draw = (skeletons, opts = {}) => {
  const { place = "below", fit = true, regenerateIds = false } = opts;
  if (opts.append === false) {
    throw new Error(
      "draw() always appends — { append: false } is gone. It used to wipe the " +
        "canvas, which is unrecoverable if the user had their own work on it. " +
        "To redraw something, wb.remove([ids]) it first (or wb.clear() if the " +
        "user asked for a blank board), then draw.",
    );
  }
  if (place !== null && place !== "below" && place !== "right") {
    throw new Error(`draw(): place must be "below", "right" or null — got ${JSON.stringify(place)}`);
  }
  const unresolved = checkBindings(skeletons);
  if (unresolved.length) {
    throw new Error(
      `arrow binding targets missing from this draw() call: ${unresolved.join(", ")}. ` +
        `Bindings only resolve within a single call — include the shapes and their ` +
        `arrows in one draw([...]).`,
    );
  }
  const offset = offsetFor(skeletons, place);
  const els = convertToExcalidrawElements(translate(skeletons, offset), {
    regenerateIds,
  });
  commit([...live(), ...els]);
  if (fit) {
    zoomFit();
  }
  return { added: els.length, total: live().length, offset };
};

window.wb = {
  ready: true,
  draw,
  bounds,
  zoomFit,
  persist,
  // Destructive, and never implied by a draw request — only on an explicit ask.
  clear: () => {
    commit([]);
    return "cleared";
  },
  // Summary of what is on the canvas — cheap way to re-orient before editing.
  list: () =>
    live().map((e) => ({
      id: e.id,
      type: e.type,
      x: Math.round(e.x),
      y: Math.round(e.y),
      w: Math.round(e.width),
      h: Math.round(e.height),
      text: e.text ?? undefined,
      containerId: e.containerId ?? undefined,
    })),
  remove: (ids) => {
    const drop = new Set([].concat(ids));
    commit(live().filter((e) => !drop.has(e.id) && !drop.has(e.containerId)));
    return live().length;
  },
};

window.draw = draw;
