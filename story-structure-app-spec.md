# Story Board — Product & Technical Spec

*A calm, offline workspace for structuring a book: the cast and their attributes on the left, chapters → scenes → beats across a timeline, red-thread connections showing which traits pay off in which moments, plus a story bible, status tracking, an emotional-contour chart, and character arcs.*

**Status:** built and shipping. Data model is at **schemaVersion 2**. This document reflects what is actually implemented (single-file `story-board.html` and the modular `index.html` + `js/` build), not just the original plan.

---

## 1. Vision & goal

A single-user, browser-based tool for planning the *structure* of a book before and during drafting. The writer defines characters and their attributes, lays out chapters → scenes → beats along a timeline, and threads character attributes to the beats where they land. It makes the **shape** of a story visible — pacing, which characters carry which scenes, whether established traits actually get used, and (via the emotional contour) whether the reader is put through a monotonous emotional line.

It is a planning aid, **not** a word processor: it holds structure, not prose. Two features (structured beat fields, a lesson/theme tracker) were deliberately rejected to keep it from becoming a substitute for drafting — see §13.

**Boundaries:** one book per browser, fully offline, no accounts, no collaboration. Data lives in local storage, with downloadable JSON backups.

---

## 2. Core concepts & glossary

| Term | Definition |
|---|---|
| **Project / Book** | The top-level container. One per browser. |
| **Story Bible** | A top-level object holding the book's governing "why": logline, thesis, theory of change, tonal rules, open questions. Free text. |
| **Protagonist** | A character. Has a name, a colour, and a list of attributes. |
| **Attribute** | A card belonging to a protagonist: a trait, quote, background, want/fear, etc. Has a user-configurable **type**, a label, freeform content, an optional **origin beat**, and an optional **arc predecessor**. |
| **Attribute type** | A user-defined category (e.g. Personality, Quote, Background), managed at project level, shared across all protagonists. |
| **Chapter** | A grouping of scenes. Ordered. Carries a **cast** (the subset of protagonists appearing in it). |
| **Scene** | A column on the board. Belongs to a chapter. Has a title, a "set the scene" description, a **status**, and an optional **emotional value**. |
| **Beat** | A unit of action inside a scene. Has a title, a single **freeform** description, and a **status**. Stacked top→bottom (time flows down a column). |
| **Connection (Thread)** | Either an `attribute-beat` payoff thread (red) or a `protagonist-scene` presence thread (protagonist's colour). Optionally labelled with *why*. |

**Time flows left→right across scenes, and top→bottom within a scene's beats.**

---

## 3. Data model (schemaVersion 2)

Every entity has a stable unique `id`. Fields added in v2 (`bible`, scene `status`/`emotionalValue`, beat `status`, attribute `supersedes`) are all **optional** — absent means default, and a v1 document upgrades by simply gaining them empty/absent.

```json
{
  "schemaVersion": 2,
  "project": { "id": "prj_...", "title": "Untitled book", "createdAt": "ISO", "updatedAt": "ISO" },
  "bible": {
    "logline": "", "thesis": "", "theoryOfChange": "", "tonalRules": "", "openQuestions": ""
  },
  "attributeTypes": [
    { "id": "atype_...", "label": "Personality", "order": 0, "color": null }
  ],
  "protagonists": [
    {
      "id": "pro_...", "name": "Maya", "color": "#4f7d70", "order": 0,
      "attributes": [
        {
          "id": "att_...", "protagonistId": "pro_...", "typeId": "atype_...",
          "label": "Impostor syndrome", "content": "Freezes when asked to make the final call…",
          "order": 0, "createdInBeatId": null, "supersedes": null
        }
      ]
    }
  ],
  "chapters": [
    { "id": "cha_...", "title": "Act I", "description": "", "order": 0, "castIds": ["pro_..."] }
  ],
  "scenes": [
    {
      "id": "scn_...", "chapterId": "cha_...", "title": "The launch slips",
      "description": "War room, 11pm, two days before ship.", "order": 0,
      "status": "idea", "emotionalValue": -2
    }
  ],
  "beats": [
    {
      "id": "bea_...", "sceneId": "scn_...", "title": "Maya cuts the feature",
      "order": 0, "content": "Freeform — dialogue, location, action, notes together.",
      "status": "drafting"
    }
  ],
  "connections": [
    { "id": "con_...", "type": "attribute-beat", "fromId": "att_...", "toId": "bea_...",
      "label": "Her fear of failure drives the cut", "color": "#963a31" },
    { "id": "con_...", "type": "protagonist-scene", "fromId": "pro_...", "toId": "scn_...",
      "label": "Maya runs the war room", "color": "#4f7d70" }
  ],
  "ui": {
    "chapterView": "all", "activeChapterId": null,
    "threadsVisible": true, "contourVisible": false,
    "biblePinned": false, "bibleCollapsed": false
  }
}
```

**Design notes**

- Scenes reference their chapter by `chapterId`; beats reference their scene by `sceneId`. Order within a parent is an explicit integer `order` (safe for drag-reorder), not array position.
- **Attribute types** are user-configurable, stored once at project level. An attribute references one via nullable `typeId` (may be untyped). Deleting a type in use prompts *reassign-or-untype* — never a silent orphan. Optional per-type `color` tints cards.
- **`createdInBeatId`** — optional provenance: the beat where an attribute was first introduced. Set automatically when the attribute is created from a beat; a **soft reference** — if that beat is deleted the field clears to `null`, the attribute survives.
- **`supersedes`** — optional arc link to an *earlier attribute on the same protagonist* this one evolves from. Constraints, enforced on edit and on import: same protagonist, no cycles, and a **linear one-to-one chain** (each predecessor has at most one successor). See §13.
- **Chapter `castIds`** — the subset of protagonists appearing in a chapter. Not every character is in every chapter. The board's Cast rail shows the union of the cast of the currently-visible chapters.
- **Two connection types**, both optionally labelled, both many-to-many:
  - `attribute-beat` — **red** payoff thread (`#963a31`); `fromId` an attribute, `toId` a beat.
  - `protagonist-scene` — **presence** thread in the protagonist's own colour; `fromId` a protagonist, `toId` a scene.
- **Scene `status` / beat `status`** — enum `idea | drafting | drafted | cut-candidate`; absent = `idea`.
- **Scene `emotionalValue`** — signed integer −5…+5 ("how the reader feels leaving this scene"); **absent = unset** (not 0), and unset scenes are skipped by the contour chart.
- **Presence is explicit** — authored via `protagonist-scene` threads and chapter cast; nothing derived or hidden.

---

## 4. Information architecture (pages)

Single page, hash-routed (`#/bible`, `#/cast`, `#/structure`, `#/board`), so shared state stays in memory. A persistent top rail switches between four views, in this order (build order, left→right):

1. **Bible** — edit the story's governing principles.
2. **Cast** — protagonists, their attributes, and the attribute-type list.
3. **Structure** — chapters, the scenes inside them, and each chapter's cast.
4. **Board** — the workspace grid where beats and threads live. **This is the default landing view.**

The rail also holds the editable book title, a "changes saved" indicator, and **Back up** / **Restore** buttons. On the Board it adds three toggles: **Threads**, **Contour**, **Pin bible**.

---

## 5. Functional requirements

### 5.1 Cast page
- Add / edit / delete / reorder protagonists. Each has a name and a colour drawn from a palette that **reserves red** (red is exclusively payoff threads).
- Add / edit / delete / reorder attributes within a protagonist. An attribute has a type (from the configurable list, or untyped), a label, freeform content, an optional origin beat, and an optional arc predecessor ("evolves from").
- **Attribute types panel:** add / rename / reorder / delete the project-wide type list, each with an optional colour; deleting one in use prompts reassign-or-untype.
- **Arc chains:** attributes linked by `supersedes` render as a connected vertical chain (Stage 1 → 2 → 3…) rather than a flat list, so a character arc reads as a sequence.
- Attributes always live under `protagonist.attributes` regardless of where created (Cast page or Board are two doors to the same store).
- Deleting a protagonist confirms, then cascades (its attributes, any threads touching them, and its membership in every chapter cast).

### 5.2 Structure page
- Add / edit / delete / reorder **chapters** (title + description) and **scenes** within them (title + "set the scene" description). Move a scene between chapters.
- **Manage chapter cast:** a checklist assigning which protagonists appear in the chapter. Coarser than per-scene presence threads, and complementary to them.
- Structure only; beats are populated on the Board.

### 5.3 Board page
- **Two independent scroll panes.** A fixed-width **Cast pane** scrolls vertically on its own; the **grid pane** scrolls both axes independently. Threads live in a board-space SVG overlay and recompute whenever *either* pane scrolls or anything resizes.
- **Cast rail** shows the union of the visible chapters' cast. Each character's attribute list is **collapsed by default, showing only attributes tied to a beat** (threaded to one, or created from one); a toggle reveals the rest. (Collapse state is session-only — a reload returns to the tidy default.)
- **Chapter bands** of scene columns, left→right. **Chapter view toggle:** *All chapters* (one long scroll with bands) or *Single chapter* (a switcher). Preference persisted.
- **Scenes** show an inline **status pill** (idea / drafting / drafted / cut-candidate, visually distinct) and, if set, an emotional-value badge. Emotional value is set in the scene's detail panel.
- **Beats** stack in each scene; add / edit / delete, drag to reorder within a scene. Each shows a subtle **status marker**. A beat's panel can spawn a new attribute stamped with that beat as its origin.
- **Threads:** pull a **payoff** thread from an attribute's dot to a beat (red); pull a **presence** thread from a protagonist to a scene (protagonist's colour). Click a thread to label or delete it. Hovering a card highlights its threads and dims the rest; a global **Threads** toggle hides them all. Threads whose endpoint is scrolled/collapsed out of view are skipped.
- **Emotional Contour** (toggle): a line chart of scene `emotionalValue` in story order, skipping unset scenes — surfaces emotional monotony a card list hides.
- **Pinned Bible strip** (toggle): a read-only strip showing thesis + tonal rules, collapsible, kept in the writer's eye-line while arranging scenes. Edited on the Bible page.
- Cards show a summary; full text opens in a detail panel.

### 5.4 Bible page
- A simple form of labelled textareas — logline, thesis, theory of change, tonal rules, open questions — auto-saving like everything else. These are the story's constitution; the Board's pinned strip surfaces the two most load-bearing (thesis, tonal rules).

---

## 6. Layout paradigm

**Structured grid** (decided). Card positions are derived from grid coordinates (cast pane vs. scene column vs. beat order), never stored per-card. Beats belong to scenes only and are **not** aligned to protagonist rows — the Cast rail is a reference, not an axis. Freeform "move any card anywhere" is deliberately out of scope. Threads are an SVG overlay drawn from live element geometry.

---

## 7. Visual design — muted editorial

Calm greens and greys with a single restrained accent. All type is **system fonts** (a Palatino/Iowan/Georgia serif for headings and body, a Courier/mono for labels and metadata) so the app is fully offline — no web-font fetches.

- **Board surface:** soft sage-grey (`#c6cdc4`) with a faint dot texture; deep green-charcoal nav (`#333c37`).
- **Cards:** soft near-white paper (`#f8f9f5`), pale-sage secondary cards, quiet shadows, minimal tilt. Protagonist colour appears as a top strip / accent.
- **The one accent — the red thread:** a deep brick/oxblood (`#963a31`), reserved exclusively for `attribute-beat` payoff threads, with pin-head endpoints. Presence threads use the protagonist's own (muted) colour.
- **Status coding:** idea = faint/dashed, drafting = normal, drafted = solid green, cut-candidate = struck & greyed. Beats carry a small status dot.
- **Scrollbars are hidden** (functional but invisible) for a calmer surface.
- Empty states everywhere with a clear call to action.

---

## 8. Persistence & migration

Two separated jobs: the app saves itself; the writer keeps their own backups.

- **Auto-save to local storage on every change**, debounced, under the key `storyBoard:v1`. A "changes saved" indicator shows in the rail. There is no manual save-to-storage button.
- **Back up** downloads the whole project as a `.json`. **Restore** reads one back, replacing the working store behind a confirm. This is the real safety net (local storage is one cleared cache from gone).
- **Migration:** on load, `schemaVersion` is stamped to `2` and any missing v2 fields default in; no data is moved or lost. A `sanitize` pass then enforces v2 constraints: `emotionalValue` clamped to −5…5, invalid `status` dropped, and `supersedes` links validated (same-protagonist, acyclic, one-to-one) with any violation nulled.
- **Import is sanitized, not rejected.** The addendum called for rejecting a backup on a constraint violation; the build instead **repairs** it (nulling bad arc links, clamping values) so a writer never loses their own backup over one stray field. Same rules enforced, gentler failure.

---

## 9. Technical architecture (as built)

Vanilla HTML / CSS / JS, native ES modules, **no build step**.

```
story-board.html         single-file version — double-click, runs offline (best for daily use)
index.html               modular entry point (loads js/main.js as a module)
styles.css               all styles (single file)
js/
  main.js                bootstrap: load state, subscribe, first render
  router.js              hash routes + top rail (nav)
  store.js               state, per-change autosave, backup/restore, migration + sanitize
  models.js              ids, palettes, status constants, h() DOM helper, accessors (M),
                         cascade deletes, arc-chain resolution
  ui.js                  modal, confirm dialog, toast, swatch picker, tool rows
  characters.js          Cast view (protagonists, attributes, types, arcs)
  config.js              Structure view (chapters, scenes, chapter cast)
  workspace.js           Board view (grid, beats, bible strip, contour, collapsible cast)
  threads.js             thread linking, drawing, highlight, thread notes
```

**Principles**
- `store.js` is the single source of truth; a tiny pub/sub re-renders the current view on change. Views never touch local storage directly.
- Module dependencies were derived from actual symbol usage; the graph has a few benign cycles (store↔models↔ui, workspace↔threads) that ES modules resolve because nothing calls across modules at load time.
- **Running the modular build requires a static server** (`python3 -m http.server`) — browsers block ES-module imports over `file://`. The single-file `story-board.html` has no such constraint. Both are the same app.
- CSS ships as one `styles.css` (kept unified to preserve the exact cascade); it can be split into `base/cards/threads` later if wanted.

---

## 10. Non-functional requirements

- **Browsers:** current Chrome / Firefox / Safari / Edge. Desktop-first (a wide, horizontally-scrolling workspace).
- **Performance:** smooth at ~5 protagonists × 6 attributes and ~30 scenes × 5 beats with a few hundred threads; thread redraw batched with `requestAnimationFrame`.
- **Accessibility:** keyboard add/edit and focus states; full keyboard thread-drawing is post-MVP.
- **Fully offline.** No network calls, no web fonts.

---

## 11. Roadmap (deliberately later)

- Freeform draggable canvas / zoom / minimap.
- Multiple books/projects.
- Column-aligned contour overlay (currently a dedicated panel in story order, not pixel-fused to columns).
- Dedicated attribute *evolution* view (a single attribute carrying a value over time) beyond today's linear `supersedes` chains.
- Cross-scene beat moves (drag is within-scene today).
- Typed threads (reveals / contradicts / pays-off), filtering, search, POV colour-coding.
- Print / outline export (Markdown or Fountain).
- Splitting CSS into `base/cards/threads`; keyboard thread-drawing.

---

## 12. Decision log

- **Scope:** one book per install.
- **Layout:** structured grid; positions derived, not stored. Beats belong to scenes only.
- **Board:** two independently-scrolling panes (Cast pane + grid pane); threads are a board-space overlay recomputed on either scroll.
- **Cast rail:** filtered to the visible chapters' cast; attribute lists collapsed by default except attributes tied to a beat.
- **Beat content:** one freeform field + title (structured fields rejected — see §13).
- **Connections:** two types (`attribute-beat` red / `protagonist-scene` protagonist-colour), optionally labelled, many-to-many. No further types.
- **Presence:** explicit — chapter cast (coarse) + protagonist-scene threads (precise).
- **Colour:** muted editorial palette; red reserved for payoff threads; protagonist colours exclude red.
- **Attribute types:** user-configurable at project level; nullable `typeId`; delete-in-use prompts reassign-or-untype.
- **Attribute origin:** `createdInBeatId`, a soft reference that clears (doesn't delete the attribute) when the beat is removed.
- **Attribute arcs:** `supersedes` linear one-to-one chains; validated same-protagonist / acyclic on edit and import.
- **Scene/beat status:** `idea | drafting | drafted | cut-candidate`, default idea.
- **Scene emotional value:** −5…+5, absent = unset; drives the contour chart.
- **Cascade delete:** removes children and touching threads, behind a confirm.
- **Reordering:** protagonists, attributes, chapters, scenes, and beats.
- **Chapter view:** both "all chapters" and "single chapter", toggleable, persisted.
- **Nav order:** Bible · Cast · Structure · Board; Board is default.
- **Persistence:** per-change autosave to `storyBoard:v1`; Back up = download `.json`; Restore = import (sanitized, not rejected).
- **Fonts:** system stacks only (offline).

---

## 13. schemaVersion 2 — story-nuance features

Additive, backward-compatible. Each earns its place by capturing something the writer cannot express in a scene/beat description **and act on**.

- **Story Bible** (§3, §5.4) — one top-level object holding logline, thesis, theory of change, tonal rules, open questions. A read-only strip pins thesis + tonal rules on the Board.
- **Scene `status` + `emotionalValue`** (§3, §5.3) — status stops the board misrepresenting a half-planned book as settled; `emotionalValue` powers the **Emotional Contour** chart, the one genuinely new *diagnostic* (it makes emotional monotony visible).
- **Beat `status`** (§3, §5.3) — a subtle per-beat marker; same enum/default as scenes.
- **Attribute `supersedes` arcs** (§3, §5.1) — makes character change a first-class through-line rather than scattered unlinked cards.

### Explicitly rejected (do NOT build)

Recorded so they don't get re-added:

- **Structured beat fields** (separate dialogue / location / action boxes). The one freeform field stands — multiple boxes push the writer to draft badly inside a form.
- **A theme/lesson taxonomy** ("which concept does this scene teach"). A tickable curriculum makes the writer author scenes to satisfy a checklist — how a novel becomes a lecture. The curriculum lives in `bible.thesis` as prose, carried by the story.
- **A character-relationship graph.** Better dramatized in a scene than diagrammed; a second graph atop the thread graph invites planning-as-avoidance.

---

## 14. Change log beyond the original MVP

Shipped since the first cut, so the doc reflects reality:

- Chapter cast membership (`castIds`); Cast rail filtered to visible chapters.
- schemaVersion 2 (bible, scene/beat status, scene emotional value + contour, attribute arcs) with migration + sanitize.
- Two-pane board with independent Cast scroll; threads moved to a board-space overlay.
- Collapsible cast attributes (collapsed by default except those tied to a beat).
- Wider scene columns; hidden scrollbars.
- Nav reordered to Bible · Cast · Structure · Board; the Board's bible toggle labelled **Pin bible** to distinguish it from the Bible nav item.
- Repalette from the original warm corkboard to the muted editorial scheme.
- Split from one file into nine ES modules + `styles.css` (single-file `story-board.html` retained).

---

*End of spec — current as of the schemaVersion 2 build.*
