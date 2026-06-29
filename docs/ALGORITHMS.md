# Node-Based Workflow Generator — Algorithm Guide

A plain-English reference for the algorithms in this component, written for the
next developer who has to fix or extend it.

> **Source of truth:** [`src/nodeBasedWorkflowGenerator.ts`](src/nodeBasedWorkflowGenerator.ts).
> The sibling `.js` file is the compiled output — edit the `.ts`, not the `.js`.

---

## 1. What this component is

A visual, drag-and-drop workflow editor (like a mini Figma / JointJS canvas)
rendered with **D3**. It shows a workflow as a graph of **cards** (nodes)
connected by right-angle **wires** (links).

- **Node types:** `root` (the trigger), `stage`, `transition`.
- **Cards are HTML**, positioned with CSS. **Wires, grid, arrows, and the
  minimap are SVG** drawn by D3.
- The two layers are kept perfectly aligned by sharing one zoom/pan transform
  (`_syncOverlayTransform`).

Almost every user action follows the same loop:

```
change _nodes / _links  →  _autoLayout()  →  _renderLinks()
```

The hard engineering is in two places: **where cards go** (layout) and **how
wires are drawn around them** (routing). Everything else is plumbing.

---

## 2. The big picture (how a frame is drawn)

![Render pipeline](docs/pipeline.svg)

```
1. _autoLayout()        decide x/y of every card
2. _buildNodeBoxes()    snapshot card rectangles (obstacles)
3. _computeLinkPorts()  decide which edge each wire attaches to, and spread them
4. _computeBackEdges()  find true cycles (for styling)
5. for each link: _computeLinkGeometry()   ← routes the wire (A* or fallback)
6. _assignLineJumps()   add little arcs where wires cross
7. _buildOrthPath()     turn corner points into an SVG path string
8. D3 draws everything; _updateMinimap() mirrors it small
```

---

## 3. Auto-layout — "tidy tree" (`_autoLayout`)

**Goal:** place cards top-to-bottom in layers, with children fanned out neatly
under their parent and no overlaps.

**Simple version:** it's a family-tree layout. Work out how wide each branch
needs to be, then center each parent over its children.

**Steps:**

1. **Build parent → children map** from the links. Cards with no parent are
   "roots".
2. **Measure subtree widths (bottom-up):** a leaf card is 1 card wide. A parent
   is as wide as all its children added together (plus gaps). A `visited` set
   stops cycles from looping forever.
3. **Assign a depth (layer number)** to each card, and remember the tallest card
   in each layer.
4. **Compute each layer's Y position:** layers with lots of wires passing
   through them get a bigger gap, so wires have room.
5. **Place cards (top-down):** put the parent, then spread its children
   symmetrically around its center using the widths from step 2.

**The one feature to remember — pinning:**
Once a user _drags_ a card, it gets `pinned = true`. Auto-layout then leaves that
card exactly where the user put it, but still fans its children out from that
spot. The toolbar's "Auto Layout" button clears all pins to fully re-tidy.

---

## 4. Edge routing — the centerpiece

This is the most complex part. A wire must:

- be **right-angled** (only horizontal/vertical segments),
- **never pass through a card**,
- **leave and enter cards perpendicular** to the edge,
- look clean (few bends, not hugging walls).

There is a **primary router (A\*)** and **hand-written fallbacks** for when A\*
can't find a path or the graph is too big.

### 4a. The primary router: A\* on a "Hanan grid" (`routeOrthogonal`)

**The problem:** the canvas is 6000×6000. Searching pixel by pixel = 36 million
cells = far too slow.

**The key trick (Hanan grid):** for a right-angle path, a wire only ever needs
to turn at lines that line up with _something important_ — a port, or the edge
of a card. So we collect only those x-lines and y-lines and use their grid of
intersections as the search space. That turns 36 million cells into a few
hundred — while still guaranteeing the best path is reachable.

![Hanan grid idea](docs/hanan-grid.svg)

**How it works, in order:**

1. **Stubs:** push a short fixed segment straight out of each port (along the
   direction the port faces). The search runs between these stubs, which forces
   the wire to leave/enter cards cleanly. The real port points are added back at
   the end.
2. **Grid lines:** collect x/y values from the ports, the stubs, and each card's
   padded edges, plus an outer "escape ring" so a wire can always go _around_
   everything. Sort them and drop near-duplicates.
3. **Cost map:** each grid step costs `length × region`:
   - open space → ×1
   - inside the padding band around a card → ×6 (allowed but discouraged, so
     wires don't hug edges)
   - inside a card → infinite (forbidden)

   Plus a flat **bend penalty (60)** every time the wire turns 90°, so it
   prefers a couple of long straight runs over a staircase of little jogs.

4. **A\* search:** standard A\* with a Manhattan-distance heuristic. Two
   important details:
   - **The state includes the direction you arrived from**, not just the cell.
     That's the only way to charge the bend penalty correctly (turning vs.
     going straight depends on how you got there).
   - The search starts already "pointing" in the start port's direction, so
     continuing straight out is free and turning immediately costs a bend.
5. **Rebuild the path** by walking the came-from chain backwards, add the true
   port points, and simplify to just the corners.

**Why the cheap cost check is actually exact:** A\* only samples the cost at the
_midpoint_ of each step. That's normally unreliable, but here every card edge is
itself a grid line, so no card boundary can ever fall between two adjacent grid
lines. Each step is therefore entirely in one region, and one sample is enough.

**Safety valve:** if the grid would exceed `maxGridCells` (300k), A\* returns
`null` and the caller uses a fallback router instead.

### 4b. The fallback routers (when A\* returns null)

These are simpler, hand-written shapes used as a backstop:

- **`_forwardPolyline`** — normal downward edge (parent above, child below).
  Picks a clear horizontal "lane" in the gap between layers. Also used as the
  _preferred_ router for normal tree edges (not just a fallback) because it
  keeps sibling fans tidy.
- **`_sidewaysPolyline`** — two cards side by side: find a clear vertical lane
  between them.
- **`_loopbackPolyline`** — a cycle that has to wrap around: route out past the
  outermost card on one side, run vertically through open space, then back in.
- **`_sideChannelPolyline`** — last-resort channel around the side, widening
  until it's clear.

`_computeLinkGeometry` is the dispatcher that decides which router to use per
link.

### 4c. Helper: does a wire hit a card? (`_segIntersectsRect`)

This is the **Liang–Barsky** line-clipping algorithm. Given a line segment and a
rectangle, it answers "do they overlap?" quickly. Used by `_polylineClear` to
check whether a candidate route is collision-free.

---

## 5. Where wires attach + lane spreading

Before routing, we decide which **edge** of each card a wire connects to, and
spread multiple wires so they don't pile onto the same point.

### 5a. Choosing the side (`_classifyLinkSides`)

- Target clearly **below** source → exit bottom, enter top (normal tree edge).
- Target **above** source → it's a back-edge; try all four side combinations,
  actually route each with A\*, and keep the cheapest.
- Cards **side by side** → connect on the facing sides.

### 5b. Spreading ports on one edge (`_spreadEdgePorts`)

Every wire touching the same card edge — incoming _and_ outgoing — is spread
evenly along that edge. They're **sorted by where their other end sits**, which
guarantees the wires don't cross right at the card.

### 5c. Sibling "fan" lanes (`_assignLanes`)

When one parent has several children, each wire needs its own horizontal lane so
the bends don't stack on top of each other.

- Split children into those **left** of the parent and those **right**.
- On each side, the **furthest child gets the top lane**, nearer children tuck
  underneath. This produces the clean symmetric fan and avoids crossings.

The lane number becomes a Y position by splitting the gap into `laneCount + 1`
equal slots and putting lane `i` at slot `i + 1` (the `+1` keeps wires off the
card edges).

### 5d. Nested cycle lanes (`_assignBackEdgeLanes`)

Cycles wrapping the same side are sorted by how far they span; the **widest
cycle wraps furthest out**, so nested loops form clean concentric arcs instead
of crossing.

---

## 6. Cycle detection (`_computeBackEdges`)

**Goal:** find links that loop back to an ancestor (real cycles), so they can be
styled differently (amber, dashed).

**How:** a depth-first search that tracks which nodes are currently on the
recursion stack. If a link points to a node already on the stack, it's a
back-edge.

**Important:** this is based on the **graph structure, not screen position**. So
dragging a card physically above its neighbor will _not_ make a normal edge look
like a cycle.

---

## 7. Line jumps (`_assignLineJumps`)

Where a later wire crosses an earlier one, draw a small **arc "hop"** over the
crossing so it reads clearly. The function checks every horizontal segment
against every vertical segment of earlier wires and records where they cross;
`_lineWithHops` then inserts the little arcs into the SVG path.

---

## 8. Other algorithms (smaller, but worth knowing)

| Feature                              | Function                           | Plain-English idea                                                                                                                                |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drop a new card without overlaps** | `_findFreePosition`                | Spiral outward from the desired spot, ring by ring, and drop into the nearest free slot. Existing cards never move.                               |
| **Connect drag → nearest card**      | `_hitTestNode`, `_findClosestNode` | Simple distance / bounding-box checks.                                                                                                            |
| **Undo / redo**                      | `_pushUndo`, `_undo`, `_redo`      | Deep-clone the whole `{nodes, links}` state onto two stacks (capped at 50).                                                                       |
| **Fit to screen**                    | `_fitToScreen`                     | Measure the bounding box of all cards, compute the scale + offset that centers it.                                                                |
| **Minimap**                          | `_updateMinimap`                   | Same graph drawn small, with a rectangle showing the current viewport.                                                                            |
| **Execution animation**              | `_runExecutionAnimation`           | Breadth-first traversal from the roots produces a visit order; a timer then lights up each node and wire in sequence (cycle links replayed last). |

---

## 9. Key constants (top of the file)

| Constant                          | Meaning                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_W`                          | Card width (all cards share one width).                                                              |
| `NODE_H_MAP` / `NODE_H_COLLAPSED` | Card heights by type, expanded vs collapsed.                                                         |
| `BASE_LAYER_GAP`, `LANE_SPACING`  | Vertical spacing between layers / extra per crossing.                                                |
| `MIN_SIBLING_GAP_X`               | Minimum horizontal gap between sibling subtrees.                                                     |
| `ROUTE_DEFAULTS`                  | A\* router tuning: `padding`, `paddingPenalty`, `bendPenalty`, `portStub`, `margin`, `maxGridCells`. |
| `CORNER_RADIUS`, `HOP_RADIUS`     | Visual rounding of corners / line-jump arcs.                                                         |

**Tuning tips for future devs:**

- Wires hugging cards too closely → raise `padding` or `paddingPenalty`.
- Too many zig-zags → raise `bendPenalty`.
- A\* silently falling back on big graphs → raise `maxGridCells` (watch perf).
- Sibling wires overlapping → that's the lane logic in §5c, not the router.

---

## 10. Mental model to keep

The whole component is a small graph-drawing engine, and every hard problem is
solved by **turning something continuous into something small and discrete**:

- Routing → A\* over a few hundred grid points (not millions of pixels).
- Wire spreading → divide a band into `N + 1` equal slots.
- Collision-free placement → spiral ring search.

Pipeline to remember: **layout positions the cards → port assignment picks where
wires attach → A\* routes the wires → D3 renders them.**
