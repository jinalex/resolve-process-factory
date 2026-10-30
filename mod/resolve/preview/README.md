# Pane preview

Screenshots of the pane as a desktop draws it, without opening the app, so a change to the layout can be looked at
(by a person or by Claude) before it is installed.

```
mod/resolve/preview/run.sh [out-dir] [dark|light] [width]
```

1. `scenes.tsx` lists scenes: the files in `.resolve/` (from the recorded run in `hooks/tour-run.ts`) and the buttons
   pressed. `run.sh` copies the mod to a scratch folder, adds `scenes.tsx` there as its only test, and runs
   `claude plugin test` on it, so the mod's own hooks draw each scene on the desktop surface and print the tree.
2. `render.mjs` turns each tree into an HTML page styled like the desktop pane (480px wide by default, or the width given, e.g. 900 for a pane taking two thirds of the window; Box as flex, Text sizes and
   theme colours, native-looking buttons with their hotkey badge, Svg, Code) and screenshots it with Playwright. It
   reports any element that runs past the pane's right edge.

Out: `<scene>.html` and `<scene>.png` in `out-dir` (default `.preview/` at the repo root, gitignored).

This is an approximation of the desktop's renderer, not the renderer itself: spacing, button chrome and fonts are close,
not exact. Check the result in the app before calling a layout done. Playwright comes from `PLAYWRIGHT_PATH` when the
repo doesn't install it.
