// Excalidraw whiteboard bootstrap.
//
// Source of truth for this file is ~/.claude/skills/whiteboard/scripts/bootstrap.js.
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

// draw(skeletons, { append = true, fit = true, regenerateIds = false })
// skeletons use the ExcalidrawElementSkeleton format: labels, arrow bindings and
// text measurement are handled for you.
// regenerateIds:false keeps the ids you authored so wb.remove(id) works later.
// The cost: drawing the same id twice logs "Duplicate id found" and drops the
// element — use append:false to redraw.
const draw = (skeletons, opts = {}) => {
  const { append = true, fit = true, regenerateIds = false } = opts;
  const unresolved = checkBindings(skeletons);
  if (unresolved.length) {
    throw new Error(
      `arrow binding targets missing from this draw() call: ${unresolved.join(", ")}. ` +
        `Bindings only resolve within a single call — include the shapes and their ` +
        `arrows in one draw([...], { append: false }).`,
    );
  }
  const els = convertToExcalidrawElements(skeletons, { regenerateIds });
  commit([...(append ? live() : []), ...els]);
  if (fit) {
    zoomFit();
  }
  return { added: els.length, total: live().length };
};

window.wb = {
  ready: true,
  draw,
  zoomFit,
  persist,
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
