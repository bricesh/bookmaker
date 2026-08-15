# Story Board

A browser-based workspace for structuring a book: cast and their attributes on the
left, chapters → scenes → beats across a timeline, red-thread payoff connections,
a story bible, status tracking, an emotional-contour chart, and character arcs.
Everything is saved to your browser's local storage; **Back up** downloads a `.json`.

## Two ways to run

**A. `story-board.html`** — the single self-contained file. Double-click it; it just
works, offline, no setup. Best for actually using the app.

**B. `index.html` + `js/` + `styles.css`** — the modular version (this split).
Because browsers block ES-module imports over `file://`, this one must be served.
From this folder:

```
python3 -m http.server 8000
```

then open http://localhost:8000/ . (Any static server works.)

## Module layout (`js/`)

| file            | responsibility |
|-----------------|----------------|
| `models.js`     | ids, palettes, status constants, `h()` DOM helper, accessors (`M`), cascade deletes, arc chains |
| `store.js`      | state, per-change autosave to localStorage, JSON backup/restore, migration (schema v2) |
| `ui.js`         | modal, confirm dialog, toast, swatch picker, tool rows |
| `router.js`     | hash routes + top nav (rail) |
| `characters.js` | Cast view — protagonists, attributes, attribute types |
| `config.js`     | Structure view — chapters, scenes, chapter cast |
| `workspace.js`  | Board view — grid, beats, bible strip, contour, collapsible cast, arcs |
| `threads.js`    | drawing/linking the red & presence threads, highlight, thread notes |
| `main.js`       | bootstrap (load state, subscribe, first render) |

Data model and design decisions live in `story-structure-app-spec.md` and the v2 addendum.
