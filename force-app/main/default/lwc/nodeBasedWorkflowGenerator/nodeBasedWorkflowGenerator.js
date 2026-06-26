import { LightningElement, track } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import d3Resource from "@salesforce/resourceUrl/d3";

const NODE_W = 380;
const CANVAS_W = 6000;
const CANVAS_H = 6000;
const BASE_LAYER_GAP = 80;
const LANE_SPACING = 16;
const MIN_SIBLING_GAP_X = 60;
const GRID_SIZE = 20;

const ACCENT_BLUE = "#066afe";
const LINK_COLOR = "#c0c4cc";
const CORNER_RADIUS = 20;
const HOP_RADIUS = 6;
const NODE_CLEAR = 8;
const CHANNEL_MARGIN = 48;
const MIN_STUB = 28;
const LANE_INSET = 14;
const PORT_EDGE_MARGIN = 40;
const SIDE_VERTICAL_OVERLAP = 24;

const NODE_H_MAP = {
  root: 340,
  stage: 260,
  transition: 100
};

const NODE_H_COLLAPSED = {
  root: 56,
  stage: 56,
  transition: 48
};

function getNodeH(n) {
  if (n.isCollapsed) return NODE_H_COLLAPSED[n.nodeType] || 56;
  return NODE_H_MAP[n.nodeType] || 240;
}

const ICON_COLORS = {
  root: "#1b96ff",
  stage: "#4bca81",
  transition: "#0d9dda"
};

const NODE_ICONS = {
  root: "\u26A1",
  stage: "\uD83D\uDCC4",
  transition: "\uD83D\uDD00"
};

const NODE_TYPE_LABELS = {
  root: "Trigger",
  stage: "Stage",
  transition: "Transition"
};

/* ============================================================================
 * ORTHOGONAL EDGE ROUTING — A* over a sparse "Hanan" grid
 * ----------------------------------------------------------------------------
 * Conceptually the canvas is a uniform cost map, but A*-ing across a per-pixel
 * grid of a 6000×6000 canvas is hopeless (36M cells). The key insight from
 * orthogonal-routing literature is that the ONLY x/y coordinates that can ever
 * matter for a rectilinear route are those aligned with a port or with a
 * (padded) obstacle boundary. We collect every such x and every such y; their
 * lattice of intersections — the "Hanan grid" — is the search graph. That
 * collapses millions of cells to a few hundred nodes while still containing an
 * optimal orthogonal path.
 *
 * COST MODEL (per unit length travelled):
 *   - empty space ....... BASE (1)
 *   - obstacle core ..... Infinity  (strictly unwalkable)
 *   - padding band ...... PADDING_PENALTY  (walkable but discouraged, so wires
 *                         don't hug node edges)
 * plus a fixed BEND_PENALTY on every 90° turn, so the router prefers a couple
 * of long straight runs over a staircase of little jogs.
 *
 * HEURISTIC: Manhattan distance to the goal (× BASE). It never overestimates
 * (bends and padding only add cost), so A* stays admissible.
 *
 * DIRECTIONAL PREFERENCE: every port has an outward normal (a 'right' port
 * faces +x). We push a mandatory stub of length PORT_STUB straight out of each
 * port before the search, and seed A* with the start port's direction so that
 * continuing straight out is free while an immediate turn costs a bend. That
 * guarantees the wire leaves/enters the node cleanly instead of shooting
 * perpendicular across the port face.
 * ==========================================================================*/

const ROUTE_DEFAULTS = {
  padding: 26,
  paddingPenalty: 6,
  bendPenalty: 40,
  portStub: 30,
  margin: 80,
  maxGridCells: 9000
};

const DIR_DELTA = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

/* Sort ascending and drop near-duplicates (grid lines closer than 0.5px). */
function sortedUnique(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    if (out.length === 0 || Math.abs(out[out.length - 1] - v) > 0.5)
      out.push(v);
  }
  return out;
}

/* Cost multiplier of a single point: Infinity inside a node (unwalkable),
   PADDING_PENALTY inside the buffer band, BASE (1) in open space. Sampling a
   single point is exact here because every obstacle boundary IS a grid line —
   no boundary can fall strictly between two adjacent Hanan lines, so the whole
   segment between them lives in one homogeneous region.                       */
function pointCost(x, y, obstacles, padding, paddingPenalty) {
  let cost = 1;
  for (const o of obstacles) {
    const x1 = o.x,
      x2 = o.x + o.width;
    const y1 = o.y,
      y2 = o.y + o.height;
    if (x > x1 && x < x2 && y > y1 && y < y2) return Infinity; // inside the node
    /* Strictly INSIDE the band is costly; the band's outer edge lines
           (obstacle ± padding) stay cheap, so a wire can hug at exactly the
           padding distance without being pushed all the way to the margin.   */
    if (
      x > x1 - padding &&
      x < x2 + padding &&
      y > y1 - padding &&
      y < y2 + padding
    ) {
      cost = Math.max(cost, paddingPenalty); // inside the buffer band
    }
  }
  return cost;
}

/* Drop coincident points and collapse runs of collinear points so the result
   is just the corners of the orthogonal path.                                 */
function simplifyOrthogonal(points) {
  const dedup = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5)
      dedup.push(p);
  }
  if (dedup.length <= 2) return dedup;
  const out = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1],
      b = dedup[i],
      c = dedup[i + 1];
    const collinear =
      (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
      (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
    if (!collinear) out.push(b);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
}

/* Compact binary min-heap — the A* open set, ordered by f-score. */
class MinHeap {
  items = [];
  cmp;
  constructor(cmp) {
    this.cmp = cmp;
  }
  get size() {
    return this.items.length;
  }
  push(v) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) < 0) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop() {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1,
          r = 2 * i + 2;
        let s = i;
        if (l < n && this.cmp(a[l], a[s]) < 0) s = l;
        if (r < n && this.cmp(a[r], a[s]) < 0) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]];
        i = s;
      }
    }
    return top;
  }
}

const DIR_CODE = { up: 0, down: 1, left: 2, right: 3 };

/* Route an orthogonal wire from `start` to `end` avoiding `obstacles`.
   Returns the corner waypoints (including the two real port points), or null
   if no path exists / the grid is too dense (caller should fall back).        */
function routeOrthogonal(start, end, obstacles, options) {
  const opt = { ...ROUTE_DEFAULTS, ...(options || {}) };

  /* 1. Mandatory outward stubs — the wire must leave/enter along the normal. */
  const sStub = {
    x: start.x + DIR_DELTA[start.dir].x * opt.portStub,
    y: start.y + DIR_DELTA[start.dir].y * opt.portStub
  };
  const eStub = {
    x: end.x + DIR_DELTA[end.dir].x * opt.portStub,
    y: end.y + DIR_DELTA[end.dir].y * opt.portStub
  };

  /* 2. Build the sparse Hanan grid lines from ports, stubs and padded edges. */
  const xsRaw = [start.x, end.x, sStub.x, eStub.x];
  const ysRaw = [start.y, end.y, sStub.y, eStub.y];
  for (const o of obstacles) {
    xsRaw.push(o.x - opt.padding, o.x + o.width + opt.padding);
    ysRaw.push(o.y - opt.padding, o.y + o.height + opt.padding);
  }
  /* Outer ring so a route can always escape around the whole obstacle field. */
  xsRaw.push(Math.min(...xsRaw) - opt.margin, Math.max(...xsRaw) + opt.margin);
  ysRaw.push(Math.min(...ysRaw) - opt.margin, Math.max(...ysRaw) + opt.margin);

  const xs = sortedUnique(xsRaw);
  const ys = sortedUnique(ysRaw);
  const W = xs.length,
    H = ys.length;
  if (W * H > opt.maxGridCells) return null;

  const xi = new Map();
  xs.forEach((v, i) => xi.set(v, i));
  const yi = new Map();
  ys.forEach((v, i) => yi.set(v, i));
  const sI = xi.get(sStub.x),
    sJ = yi.get(sStub.y);
  const eI = xi.get(eStub.x),
    eJ = yi.get(eStub.y);

  /* State = (grid node, arrival direction). Direction is part of the state so
       the bend penalty is accounted for correctly (turn-aware A*).             */
  const stateKey = (i, j, d) => (j * W + i) * 4 + d;
  const manhattan = (ax, ay) => Math.abs(ax - eStub.x) + Math.abs(ay - eStub.y);

  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();
  const open = new MinHeap((a, b) => a.f - b.f);

  const startCode = DIR_CODE[start.dir];
  gScore.set(stateKey(sI, sJ, startCode), 0);
  open.push({ i: sI, j: sJ, d: startCode, f: manhattan(xs[sI], ys[sJ]) });

  /* Neighbour moves, tagged with the direction they travel in. */
  const MOVES = [
    { di: 0, dj: -1, d: DIR_CODE.up },
    { di: 0, dj: 1, d: DIR_CODE.down },
    { di: -1, dj: 0, d: DIR_CODE.left },
    { di: 1, dj: 0, d: DIR_CODE.right }
  ];

  let goal = null;

  while (open.size > 0) {
    const cur = open.pop();
    const ck = stateKey(cur.i, cur.j, cur.d);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.i === eI && cur.j === eJ) {
      goal = cur;
      break;
    }

    const cg = gScore.get(ck);
    const ax = xs[cur.i],
      ay = ys[cur.j];

    for (const m of MOVES) {
      const ni = cur.i + m.di,
        nj = cur.j + m.dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const bx = xs[ni],
        by = ys[nj];

      /* Segment cost: blocked if it crosses a node core; otherwise length
               × region multiplier, plus a bend penalty if we change direction. */
      const region = pointCost(
        (ax + bx) / 2,
        (ay + by) / 2,
        obstacles,
        opt.padding,
        opt.paddingPenalty
      );
      if (!isFinite(region)) continue;
      const len = Math.abs(bx - ax) + Math.abs(by - ay);
      let step = len * region;
      if (m.d !== cur.d) step += opt.bendPenalty;

      const nk = stateKey(ni, nj, m.d);
      const ng = cg + step;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        cameFrom.set(nk, { i: cur.i, j: cur.j, d: cur.d });
        open.push({ i: ni, j: nj, d: m.d, f: ng + manhattan(bx, by) });
      }
    }
  }

  if (!goal) return null;

  /* 3. Walk the came-from chain back to the start stub. */
  const path = [];
  let node = goal;
  while (node) {
    path.push({ x: xs[node.i], y: ys[node.j] });
    node = cameFrom.get(stateKey(node.i, node.j, node.d));
  }
  path.reverse();

  /* 4. Bookend with the true port points and reduce to corners. */
  return simplifyOrthogonal([
    { x: start.x, y: start.y },
    ...path,
    { x: end.x, y: end.y }
  ]);
}

let _idCounter = 100;
function nextId() {
  return "n" + ++_idCounter;
}

export default class NodeBasedWorkflowGenerator extends LightningElement {
  _d3 = null;
  _loadStarted = false;
  _svg = null;
  _zoomGroup = null;
  _zoomBehavior = null;
  _currentTransform = null;
  _minimapSvg = null;
  _minimapViewport = null;

  @track _nodes = [];
  @track _links = [];
  @track selectedNode = null;
  @track zoomLevel = 1;
  @track _overlayTransformCss = "";
  @track _connectTargetId = null;
  @track _executingNodeIds = new Set();
  @track _popoverVisible = false;
  @track _popoverMode = "main";
  @track _popoverSourceId = null;
  @track _popoverX = 0;
  @track _popoverY = 0;

  _undoStack = [];
  _redoStack = [];
  _animationRunning = false;
  _draggedPaletteType = null;

  /* ===================== Getters for Template ===================== */

  get paletteItems() {
    return [
      {
        type: "stage",
        icon: NODE_ICONS.stage,
        label: "Stage",
        description: "Add a workflow stage",
        iconStyle: `background:${ICON_COLORS.stage};color:#fff`
      },
      {
        type: "transition",
        icon: NODE_ICONS.transition,
        label: "Transition",
        description: "Connect two stages",
        iconStyle: `background:${ICON_COLORS.transition};color:#fff`
      }
    ];
  }

  get displayNodes() {
    return this._nodes.map((n) => ({
      id: n.id,
      data: n,
      isSelected: !!(this.selectedNode && this.selectedNode.id === n.id),
      isConnectTarget: this._connectTargetId === n.id,
      isExecuting: this._executingNodeIds.has(n.id),
      isCollapsed: !!n.isCollapsed,
      positionStyle: `left:${n.x}px;top:${n.y}px;height:${getNodeH(n)}px`
    }));
  }

  get nodesOverlayTransform() {
    return this._overlayTransformCss;
  }

  get zoomLabel() {
    return Math.round(this.zoomLevel * 100) + "%";
  }

  get propertyPanelClass() {
    return (
      "studio-property-panel" +
      (this.selectedNode ? " studio-property-panel--open" : "")
    );
  }

  get selectedNodeIconStyle() {
    if (!this.selectedNode) return "";
    const c = ICON_COLORS[this.selectedNode.nodeType] || ICON_COLORS.stage;
    return `background:${c};color:#fff`;
  }

  get selectedNodeIcon() {
    return this.selectedNode
      ? NODE_ICONS[this.selectedNode.nodeType] || ""
      : "";
  }

  get selectedNodeTypeLabel() {
    return this.selectedNode
      ? NODE_TYPE_LABELS[this.selectedNode.nodeType] || "Step"
      : "";
  }

  get isSelectedRoot() {
    return !!(this.selectedNode && this.selectedNode.nodeType === "root");
  }
  get isSelectedStage() {
    return !!(this.selectedNode && this.selectedNode.nodeType === "stage");
  }
  get isSelectedTransition() {
    return !!(this.selectedNode && this.selectedNode.nodeType === "transition");
  }
  get isSelectedDeletable() {
    return !!(this.selectedNode && this.selectedNode.nodeType !== "root");
  }

  get isPopoverMain() {
    return this._popoverVisible && this._popoverMode === "main";
  }
  get isPopoverStageList() {
    return this._popoverVisible && this._popoverMode === "stageList";
  }

  get popoverStyle() {
    return `left:${this._popoverX}px;top:${this._popoverY}px`;
  }

  get popoverStageItems() {
    return this._nodes
      .filter((n) => n.nodeType === "stage" && n.id !== this._popoverSourceId)
      .map((n) => ({ id: n.id, label: n.label }));
  }

  get popoverHasNoStages() {
    return this.popoverStageItems.length === 0;
  }

  /* ===================== Lifecycle ===================== */

  renderedCallback() {
    if (this._loadStarted) return;
    this._loadStarted = true;
    this._loadAndRender();
  }

  disconnectedCallback() {
    this._svg = null;
  }

  async _loadAndRender() {
    const container = this.template.querySelector(".canvas-svg-container");
    if (!container) return;

    try {
      if (typeof window.d3 === "undefined") {
        await loadScript(this, d3Resource);
      }
      this._d3 = window.d3;
      if (!this._d3) return;

      this._initSampleWorkflow();
      this._autoLayout();
      this._initCanvas(container);
      this._renderLinks();
      this._initMinimap();
      this._fitToScreen(false);
    } catch {
      /* D3 load/render failure — no user-facing action */
    }
  }

  _initSampleWorkflow() {
    this._nodes = [
      {
        id: "n1",
        nodeType: "root",
        label: "Send for Request Submitted",
        lifecycle: "Research Lifecycle",
        criteriaFact: "Research Path",
        entryCriteria:
          '{\n  "AllTrue": [\n    { "path": "Status", "op": "Equals", "value": "Submitted" },\n    { "path": "Validation", "op": "Equals", "value": "Complete" }\n  ]\n}',
        autostart: true,
        isActive: true,
        x: 0,
        y: 0
      },
      {
        id: "n2",
        nodeType: "stage",
        label: "Request Submitted",
        lifecycleState: "Request Submitted",
        customLabelApiName: "GM_Request_Stage_Request_Name",
        activities: [
          { name: "Review Grant Request", iconName: "standard:work_summary" }
        ],
        allowManualTransition: false,
        isFinalStage: false,
        x: 0,
        y: 0
      },
      {
        id: "n3",
        nodeType: "transition",
        label: "Transition to Approved",
        x: 0,
        y: 0
      },
      {
        id: "n4",
        nodeType: "transition",
        label: "Transition to Declined",
        x: 0,
        y: 0
      },
      {
        id: "n5",
        nodeType: "stage",
        label: "Request Submission Approved",
        lifecycleState: "Request Submitted Review",
        customLabelApiName: "GM_Request_Stage_Approved",
        activities: [
          { name: "Review Grant Request", iconName: "standard:work_summary" }
        ],
        allowManualTransition: false,
        isFinalStage: false,
        x: 0,
        y: 0
      },
      {
        id: "n6",
        nodeType: "transition",
        label: "Transition to Something",
        x: 0,
        y: 0
      },
      {
        id: "n7",
        nodeType: "stage",
        label: "Request Submission Declined",
        lifecycleState: "Request Submitted Review",
        customLabelApiName: "GM_Request_Stage_Declined",
        activities: [
          { name: "Notify Applicant", iconName: "standard:work_summary" }
        ],
        allowManualTransition: false,
        isFinalStage: true,
        x: 0,
        y: 0
      },
      {
        id: "n8",
        nodeType: "stage",
        label: "Request Submission Something",
        lifecycleState: "Request Submitted Review",
        customLabelApiName: "GM_Request_Stage_Declined",
        activities: [
          { name: "Notify Applicant", iconName: "standard:work_summary" }
        ],
        allowManualTransition: false,
        isFinalStage: true,
        x: 0,
        y: 0
      }
    ];
    this._links = [
      { id: "l1", source: "n1", target: "n2" },
      { id: "l2", source: "n2", target: "n3" },
      { id: "l3", source: "n2", target: "n4" },
      { id: "l4", source: "n3", target: "n5" },
      { id: "l5", source: "n4", target: "n7" },
      { id: "l6", source: "n5", target: "n6" },
      { id: "l7", source: "n6", target: "n8" }
    ];
  }

  /* ===================== Auto Layout (Tree, dynamic subtree widths) ===================== */

  _autoLayout() {
    const nodeMap = new Map(this._nodes.map((n) => [n.id, n]));
    const childrenMap = new Map();
    const hasParent = new Set();

    this._links.forEach((l) => {
      if (!childrenMap.has(l.source)) childrenMap.set(l.source, []);
      childrenMap.get(l.source).push(l.target);
      hasParent.add(l.target);
    });

    const roots = this._nodes.filter((n) => !hasParent.has(n.id));
    if (roots.length === 0 && this._nodes.length > 0)
      roots.push(this._nodes[0]);

    const subtreeWidths = new Map();
    const visited = new Set();

    const computeWidth = (nodeId) => {
      if (visited.has(nodeId)) return NODE_W;
      visited.add(nodeId);
      /* Filter out back-edge targets (already visited = cycle) so they
               don't inflate the subtree width of the node holding the back-edge. */
      const children = (childrenMap.get(nodeId) || []).filter(
        (cId) => !visited.has(cId)
      );
      if (children.length === 0) {
        subtreeWidths.set(nodeId, NODE_W);
        return NODE_W;
      }
      const childWidths = children.map((cId) => computeWidth(cId));
      const totalChildW =
        childWidths.reduce((sum, w) => sum + w, 0) +
        (children.length - 1) * MIN_SIBLING_GAP_X;
      const width = Math.max(NODE_W, totalChildW);
      subtreeWidths.set(nodeId, width);
      return width;
    };

    roots.forEach((r) => computeWidth(r.id));
    this._nodes.forEach((n) => {
      if (!visited.has(n.id)) computeWidth(n.id);
    });

    const layerMaxH = new Map();
    const nodeDepth = new Map();
    const visitedDepth = new Set();

    const assignDepth = (nodeId, depth) => {
      if (visitedDepth.has(nodeId)) return;
      visitedDepth.add(nodeId);
      nodeDepth.set(nodeId, depth);
      const node = nodeMap.get(nodeId);
      if (node) {
        const h = getNodeH(node);
        const cur = layerMaxH.get(depth) || 0;
        if (h > cur) layerMaxH.set(depth, h);
      }
      const children = childrenMap.get(nodeId) || [];
      children.forEach((cId) => assignDepth(cId, depth + 1));
    };

    roots.forEach((r) => assignDepth(r.id, 0));
    this._nodes.forEach((n) => {
      if (!visitedDepth.has(n.id)) assignDepth(n.id, layerMaxH.size);
    });

    const crossingCount = new Map();
    this._links.forEach((l) => {
      const srcDepth = nodeDepth.get(l.source);
      const tgtDepth = nodeDepth.get(l.target);
      if (srcDepth === undefined || tgtDepth === undefined) return;
      const minD = Math.min(srcDepth, tgtDepth);
      const maxD = Math.max(srcDepth, tgtDepth);
      for (let d = minD; d < maxD; d++) {
        crossingCount.set(d, (crossingCount.get(d) || 0) + 1);
      }
    });

    const layerY = new Map();
    let currentY = 200;
    const maxDepth = Math.max(...layerMaxH.keys(), 0);
    for (let d = 0; d <= maxDepth; d++) {
      layerY.set(d, currentY);
      const crossings = crossingCount.get(d) || 0;
      const extraLanes = Math.max(0, crossings - 1);
      const dynamicGap = BASE_LAYER_GAP + extraLanes * LANE_SPACING;
      currentY += (layerMaxH.get(d) || 240) + dynamicGap;
    }

    const positioned = new Set();

    /* parentBottom is the y of the lowest edge of the chain above this node.
           Unpinned nodes sit at their layer's y, but never above a pinned
           ancestor that was dragged further down. Pinned nodes keep the exact
           position the user dragged them to, and their children fan out from
           that actual centre — so manual drags are respected while everything
           else still fans out and makes room.                                 */
    const positionSubtree = (nodeId, centerX, parentBottom) => {
      if (positioned.has(nodeId)) return;
      positioned.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) return;

      const depth = nodeDepth.get(nodeId) || 0;
      let nodeCenterX;
      if (node.pinned) {
        nodeCenterX = node.x + NODE_W / 2; // keep dragged x/y verbatim
      } else {
        node.y = Math.max(
          layerY.get(depth) || 200,
          parentBottom + BASE_LAYER_GAP
        );
        node.x = centerX - NODE_W / 2;
        nodeCenterX = centerX;
      }
      const nodeBottom = node.y + getNodeH(node);

      /* Filter out back-edge targets already placed elsewhere so their
               stored subtreeWidth doesn't skew this node's child layout. */
      const children = (childrenMap.get(nodeId) || []).filter(
        (cId) => !positioned.has(cId)
      );
      if (children.length === 0) return;

      const childWidths = children.map(
        (cId) => subtreeWidths.get(cId) || NODE_W
      );
      const totalChildW =
        childWidths.reduce((sum, w) => sum + w, 0) +
        (children.length - 1) * MIN_SIBLING_GAP_X;

      /* Fan the children out symmetrically around this node's centre. */
      let childX = nodeCenterX - totalChildW / 2;
      children.forEach((cId, i) => {
        const cw = childWidths[i];
        const childCenter = childX + cw / 2;
        positionSubtree(cId, childCenter, nodeBottom);
        childX += cw + MIN_SIBLING_GAP_X;
      });
    };

    const rootWidths = roots.map((r) => subtreeWidths.get(r.id) || NODE_W);
    const totalRootW =
      rootWidths.reduce((sum, w) => sum + w, 0) +
      (roots.length > 1 ? (roots.length - 1) * MIN_SIBLING_GAP_X : 0);
    let rootX = CANVAS_W / 2 - totalRootW / 2;

    roots.forEach((r, i) => {
      const rw = rootWidths[i];
      positionSubtree(r.id, rootX + rw / 2, -Infinity);
      rootX += rw + MIN_SIBLING_GAP_X;
    });

    this._nodes.forEach((n) => {
      if (!positioned.has(n.id)) {
        positionSubtree(n.id, CANVAS_W / 2, -Infinity);
      }
    });
  }

  /* Choose which side of the source/target each link attaches to, based on
       the relative position of the two nodes:
        - target clearly below  -> exit bottom, enter top   (standard tree)
        - target clearly above  -> exit nearest side, enter top (back-edge)
        - vertical overlap       -> exit/enter on facing sides (sideways)      */
  _classifyLinkSides(src, tgt) {
    const srcH = getNodeH(src);
    const tgtH = getNodeH(tgt);
    const srcBottom = src.y + srcH;
    const srcTop = src.y;
    const tgtTop = tgt.y;
    const tgtBottom = tgt.y + tgtH;
    const srcCx = src.x + NODE_W / 2;
    const tgtCx = tgt.x + NODE_W / 2;

    if (tgtTop >= srcBottom + MIN_STUB) {
      return { exitSide: "bottom", entrySide: "top" };
    }
    if (tgtBottom <= srcTop + MIN_STUB) {
      /* Back-edge (target above source). Choose each end's side
               independently from the other node's position:
                - exit the source on the side facing the target
                - enter the target on the side facing the source
               Near-aligned columns (within NODE_W/3) can't face each other
               cleanly, so wrap around the left as a same-side loopback.        */
      if (Math.abs(srcCx - tgtCx) <= NODE_W / 3) {
        return { exitSide: "left", entrySide: "left" };
      }
      return tgtCx < srcCx
        ? { exitSide: "left", entrySide: "right" } // target sits to the left
        : { exitSide: "right", entrySide: "left" }; // target sits to the right
    }
    /* Vertical overlap -> attach on the facing sides */
    if (tgtCx >= srcCx) {
      return { exitSide: "right", entrySide: "left" };
    }
    return { exitSide: "left", entrySide: "right" };
  }

  _computeLinkPorts() {
    const ports = new Map();
    const nodeMap = new Map(this._nodes.map((n) => [n.id, n]));

    const classified = [];
    this._links.forEach((link) => {
      const src = nodeMap.get(link.source);
      const tgt = nodeMap.get(link.target);
      if (!src || !tgt) return;
      const sides = this._classifyLinkSides(src, tgt);
      classified.push({
        link,
        src,
        tgt,
        exitSide: sides.exitSide,
        entrySide: sides.entrySide
      });
      ports.set(link.id, {
        exit: { x: 0, y: 0 },
        entry: { x: 0, y: 0 },
        exitSide: sides.exitSide,
        entrySide: sides.entrySide,
        laneIndex: 0,
        laneCount: 1
      });
    });

    /* Group links by (node, side) so multiple connectors on the same edge
           can be spread out with a comfortable gap instead of stacking.       */
    const outGroups = new Map();
    const inGroups = new Map();
    classified.forEach((c) => {
      const ok = c.link.source + "|" + c.exitSide;
      const ik = c.link.target + "|" + c.entrySide;
      if (!outGroups.has(ok)) outGroups.set(ok, []);
      outGroups.get(ok).push(c);
      if (!inGroups.has(ik)) inGroups.set(ik, []);
      inGroups.get(ik).push(c);
    });

    outGroups.forEach((group) =>
      this._spreadEdgePorts(group, "exit", nodeMap, ports)
    );
    inGroups.forEach((group) =>
      this._spreadEdgePorts(group, "entry", nodeMap, ports)
    );

    this._assignLanes(classified, ports);

    return ports;
  }

  /* Distribute a set of connectors evenly along one edge of a node. */
  _spreadEdgePorts(group, which, nodeMap, ports) {
    const first = group[0];
    const node = which === "exit" ? first.src : first.tgt;
    const side = which === "exit" ? first.exitSide : first.entrySide;
    const h = getNodeH(node);
    const horizontalEdge = side === "top" || side === "bottom";

    /* Sort connectors by where the OTHER endpoint sits, so lines don't cross */
    const otherCoord = (c) => {
      const other = which === "exit" ? c.tgt : c.src;
      return horizontalEdge
        ? other.x + NODE_W / 2
        : other.y + getNodeH(other) / 2;
    };
    const sorted = [...group].sort((a, b) => otherCoord(a) - otherCoord(b));
    const n = sorted.length;

    const setPort = (linkId, pt) => {
      const p = ports.get(linkId);
      if (!p) return;
      if (which === "exit") p.exit = pt;
      else p.entry = pt;
    };

    if (horizontalEdge) {
      const y = side === "bottom" ? node.y + h : node.y;
      const lo = node.x + PORT_EDGE_MARGIN;
      const hi = node.x + NODE_W - PORT_EDGE_MARGIN;
      sorted.forEach((c, i) => {
        const x =
          n === 1 ? node.x + NODE_W / 2 : lo + (hi - lo) * (i / (n - 1));
        setPort(c.link.id, { x, y });
      });
    } else {
      const x = side === "right" ? node.x + NODE_W : node.x;
      const lo = node.y + SIDE_VERTICAL_OVERLAP;
      const hi = node.y + h - SIDE_VERTICAL_OVERLAP;
      sorted.forEach((c, i) => {
        const y =
          n === 1 || hi <= lo ? node.y + h / 2 : lo + (hi - lo) * (i / (n - 1));
        setPort(c.link.id, { x, y });
      });
    }
  }

  /* Give every sibling group (connectors sharing the same source bottom
       edge) its own evenly spaced horizontal lane within the inter-layer gap.
       Sort left-to-right by target so lanes are assigned without crossings:
       the leftmost target gets laneIndex 0 (topmost lane) and the rightmost
       gets the bottommost lane.                                               */
  _assignLanes(classified, ports) {
    /* Collect bottom-exit groups keyed by source node id */
    const srcGroups = new Map();
    classified.forEach((c) => {
      if (c.exitSide !== "bottom" || c.entrySide !== "top") return;
      if (!srcGroups.has(c.link.source)) srcGroups.set(c.link.source, []);
      srcGroups
        .get(c.link.source)
        .push({ link: c.link, src: c.src, tgt: c.tgt });
    });

    srcGroups.forEach((group) => {
      if (group.length < 2) return;
      const srcCx = group[0].src.x + NODE_W / 2;

      /* Split into connectors going to the LEFT of source centre and
               those going to the RIGHT.  Each group is sorted so the FURTHEST
               target gets laneIndex 0 (topmost lane = shortest vertical stub),
               exactly mirroring the reference JointJS fan pattern on both sides. */
      const leftGrp = group.filter((c) => c.tgt.x + NODE_W / 2 <= srcCx);
      const rightGrp = group.filter((c) => c.tgt.x + NODE_W / 2 > srcCx);

      /* Left  → ascending (leftmost = furthest = laneIndex 0 = top lane) */
      leftGrp.sort((a, b) => a.tgt.x + NODE_W / 2 - (b.tgt.x + NODE_W / 2));
      /* Right → descending (rightmost = furthest = laneIndex 0 = top lane) */
      rightGrp.sort((a, b) => b.tgt.x + NODE_W / 2 - (a.tgt.x + NODE_W / 2));

      [leftGrp, rightGrp].forEach((grp) => {
        const n = grp.length;
        grp.forEach((item, i) => {
          const p = ports.get(item.link.id);
          if (p) {
            p.laneIndex = i;
            p.laneCount = n;
          }
        });
      });
    });
  }

  /* ===================== Link Geometry & Routing ===================== */

  _buildNodeBoxes() {
    return this._nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      w: NODE_W,
      h: getNodeH(n)
    }));
  }

  _segIntersectsRect(x0, y0, x1, y1, rx, ry, rw, rh) {
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - rx, rx + rw - x0, y0 - ry, ry + rh - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return false;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return false;
          if (t < t1) t1 = t;
        }
      }
    }
    return t0 < t1;
  }

  _polylineClear(points, boxes, excludeIds) {
    for (let s = 0; s < points.length - 1; s++) {
      const a = points[s];
      const b = points[s + 1];
      for (let k = 0; k < boxes.length; k++) {
        const box = boxes[k];
        if (excludeIds.has(box.id)) continue;
        if (
          this._segIntersectsRect(
            a.x,
            a.y,
            b.x,
            b.y,
            box.x - NODE_CLEAR,
            box.y - NODE_CLEAR,
            box.w + NODE_CLEAR * 2,
            box.h + NODE_CLEAR * 2
          )
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /* Find all Y-axis gaps (free horizontal bands) in [yLo, yHi] that are
       not occupied by any obstacle whose x-range overlaps [xLo, xHi].      */
  _findFreeGaps(xLo, xHi, yLo, yHi, boxes, excludeIds) {
    const occupied = [];
    const pad = NODE_CLEAR;
    boxes.forEach((box) => {
      if (excludeIds.has(box.id)) return;
      const bxLo = box.x - pad;
      const bxHi = box.x + box.w + pad;
      if (bxHi <= xLo || bxLo >= xHi) return;
      const byLo = box.y - pad;
      const byHi = box.y + box.h + pad;
      if (byHi <= yLo || byLo >= yHi) return;
      occupied.push([Math.max(byLo, yLo), Math.min(byHi, yHi)]);
    });
    occupied.sort((a, b) => a[0] - b[0]);

    const gaps = [];
    let cursor = yLo;
    occupied.forEach(([lo, hi]) => {
      if (lo > cursor + 1) gaps.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    });
    if (cursor < yHi - 1) gaps.push([cursor, yHi]);
    return gaps;
  }

  /* Same as _findFreeGaps but along the X axis: free vertical bands in
       [xLo, xHi] not blocked by obstacles whose y-range overlaps [yLo, yHi].  */
  _findFreeGapsX(yLo, yHi, xLo, xHi, boxes, excludeIds) {
    const occupied = [];
    const pad = NODE_CLEAR;
    boxes.forEach((box) => {
      if (excludeIds.has(box.id)) return;
      const byLo = box.y - pad;
      const byHi = box.y + box.h + pad;
      if (byHi <= yLo || byLo >= yHi) return;
      const bxLo = box.x - pad;
      const bxHi = box.x + box.w + pad;
      if (bxHi <= xLo || bxLo >= xHi) return;
      occupied.push([Math.max(bxLo, xLo), Math.min(bxHi, xHi)]);
    });
    occupied.sort((a, b) => a[0] - b[0]);

    const gaps = [];
    let cursor = xLo;
    occupied.forEach(([lo, hi]) => {
      if (lo > cursor + 1) gaps.push([cursor, lo]);
      cursor = Math.max(cursor, hi);
    });
    if (cursor < xHi - 1) gaps.push([cursor, xHi]);
    return gaps;
  }

  /* laneIndex / laneCount: if the link is one of N siblings from the same
       source, divide the inter-layer gap into N+1 equal slots and use slot
       laneIndex+1.  This guarantees each sibling gets its own distinct,
       evenly spaced horizontal band — no clamping, no overlaps.              */
  _forwardPolyline(x1, y1, x2, y2, laneIndex, laneCount, boxes, excludeIds) {
    const stubTop = y1 + LANE_INSET;
    const stubBot = y2 - LANE_INSET;

    /* Degenerate: nodes too close vertically */
    if (stubBot <= stubTop) {
      const mid = (y1 + y2) / 2;
      return [
        { x: x1, y: y1 },
        { x: x1, y: mid },
        { x: x2, y: mid },
        { x: x2, y: y2 }
      ];
    }

    /* Nearly-vertical single connector: direct line or minimal bend */
    if (Math.abs(x1 - x2) < 2 && laneCount <= 1) {
      const direct = [
        { x: x1, y: y1 },
        { x: x2, y: y2 }
      ];
      if (this._polylineClear(direct, boxes, excludeIds)) return direct;
    }

    /* Compute the preferred midY for this lane.
           For sibling groups (laneCount > 1) divide the usable band into
           laneCount+1 equal slots — leftmost target → top slot, rightmost
           target → bottom slot — so the horizontal elbows never cross.       */
    let preferred;
    if (laneCount > 1) {
      const t = (laneIndex + 1) / (laneCount + 1);
      preferred = stubTop + (stubBot - stubTop) * t;
    } else {
      preferred = (stubTop + stubBot) / 2;
    }

    /* Find the free horizontal gap closest to the preferred midY          */
    const xLo = Math.min(x1, x2) - NODE_CLEAR;
    const xHi = Math.max(x1, x2) + NODE_CLEAR;
    const gaps = this._findFreeGaps(
      xLo,
      xHi,
      stubTop,
      stubBot,
      boxes,
      excludeIds
    );

    const sortedGaps = [...gaps].sort((a, b) => {
      const ma = (a[0] + a[1]) / 2;
      const mb = (b[0] + b[1]) / 2;
      return Math.abs(ma - preferred) - Math.abs(mb - preferred);
    });

    for (const [gapLo, gapHi] of sortedGaps) {
      const midY = Math.max(gapLo + 1, Math.min(gapHi - 1, preferred));
      const pts = [
        { x: x1, y: y1 },
        { x: x1, y: midY },
        { x: x2, y: midY },
        { x: x2, y: y2 }
      ];
      if (this._polylineClear(pts, boxes, excludeIds)) return pts;
    }

    return this._sideChannelPolyline(x1, y1, x2, y2, boxes, excludeIds);
  }

  _sideChannelPolyline(x1, y1, x2, y2, boxes, excludeIds) {
    const yLo = Math.min(y1, y2);
    const yHi = Math.max(y1, y2);

    /* Compute the total x-extent of all obstacles in the y-band */
    let leftEdge = Math.min(x1, x2);
    let rightEdge = Math.max(x1, x2);
    boxes.forEach((box) => {
      if (excludeIds.has(box.id)) return;
      if (box.y + box.h < yLo || box.y > yHi) return;
      leftEdge = Math.min(leftEdge, box.x);
      rightEdge = Math.max(rightEdge, box.x + box.w);
    });

    const channelL = leftEdge - CHANNEL_MARGIN;
    const channelR = rightEdge + CHANNEL_MARGIN;

    const yDown = y1 + MIN_STUB;
    const yUp = y2 - MIN_STUB;

    /* Prefer the channel closer to x2 for a shorter horizontal run */
    const channels =
      Math.abs(channelR - x2) <= Math.abs(channelL - x2)
        ? [channelR, channelL]
        : [channelL, channelR];

    for (const cx of channels) {
      const pts = [
        { x: x1, y: y1 },
        { x: x1, y: yDown },
        { x: cx, y: yDown },
        { x: cx, y: yUp },
        { x: x2, y: yUp },
        { x: x2, y: y2 }
      ];
      if (this._polylineClear(pts, boxes, excludeIds)) return pts;

      /* Widen the channel incrementally if still blocked */
      for (
        let extra = CHANNEL_MARGIN;
        extra <= CHANNEL_MARGIN * 4;
        extra += CHANNEL_MARGIN
      ) {
        const cxWide = cx > x2 ? channelR + extra : channelL - extra;
        const ptsWide = [
          { x: x1, y: y1 },
          { x: x1, y: yDown },
          { x: cxWide, y: yDown },
          { x: cxWide, y: yUp },
          { x: x2, y: yUp },
          { x: x2, y: y2 }
        ];
        if (this._polylineClear(ptsWide, boxes, excludeIds)) return ptsWide;
      }
    }

    /* Absolute last resort: direct orthogonal with no collision check */
    const mid = (y1 + y2) / 2;
    return [
      { x: x1, y: y1 },
      { x: x1, y: mid },
      { x: x2, y: mid },
      { x: x2, y: y2 }
    ];
  }

  /* Back-edge arc: travels to a clear channel on the requested side,
       then up/down to the target's port. Supports left and right channels.   */
  _loopbackPolyline(exit, entry, _boxes, _excludeIds, side = "right", tgtBox) {
    /* Horizontal crossing band: the inter-row gap just below the target node.
           CHANNEL_MARGIN (48 px) for side stubs keeps the connector clearly
           separated from node card edges — well within the 60 px sibling gap.    */
    const armY = tgtBox
      ? tgtBox.y + tgtBox.h + CHANNEL_MARGIN + MIN_STUB
      : (exit.y + entry.y) / 2;

    if (side === "left") {
      const stubExit = exit.x - CHANNEL_MARGIN;
      const stubEntry = entry.x - CHANNEL_MARGIN;
      return [
        { x: exit.x, y: exit.y },
        { x: stubExit, y: exit.y },
        { x: stubExit, y: armY },
        { x: stubEntry, y: armY },
        { x: stubEntry, y: entry.y },
        { x: entry.x, y: entry.y }
      ];
    }

    const stubExit = exit.x + CHANNEL_MARGIN;
    const stubEntry = entry.x + CHANNEL_MARGIN;
    return [
      { x: exit.x, y: exit.y },
      { x: stubExit, y: exit.y },
      { x: stubExit, y: armY },
      { x: stubEntry, y: armY },
      { x: stubEntry, y: entry.y },
      { x: entry.x, y: entry.y }
    ];
  }

  /* Horizontal route between two facing side ports (target beside source).
       Finds a clear vertical lane (X channel) between the two nodes.          */
  _sidewaysPolyline(
    exit,
    exitSide,
    entry,
    entrySide,
    laneIndex,
    laneCount,
    boxes,
    excludeIds
  ) {
    if (Math.abs(exit.y - entry.y) < 2) {
      const direct = [
        { x: exit.x, y: exit.y },
        { x: entry.x, y: entry.y }
      ];
      if (this._polylineClear(direct, boxes, excludeIds)) return direct;
    }

    const exitStub = exit.x + (exitSide === "right" ? LANE_INSET : -LANE_INSET);
    const entryStub =
      entry.x + (entrySide === "right" ? LANE_INSET : -LANE_INSET);
    const xLo = Math.min(exitStub, entryStub);
    const xHi = Math.max(exitStub, entryStub);
    const yLo = Math.min(exit.y, entry.y) - NODE_CLEAR;
    const yHi = Math.max(exit.y, entry.y) + NODE_CLEAR;

    const gaps = this._findFreeGapsX(yLo, yHi, xLo, xHi, boxes, excludeIds);
    let preferred;
    if (laneCount > 1) {
      const t = (laneIndex + 1) / (laneCount + 1);
      preferred = xLo + (xHi - xLo) * t;
    } else {
      preferred = (xLo + xHi) / 2;
    }
    const sorted = [...gaps].sort((a, b) => {
      const ma = (a[0] + a[1]) / 2;
      const mb = (b[0] + b[1]) / 2;
      return Math.abs(ma - preferred) - Math.abs(mb - preferred);
    });

    for (const [gLo, gHi] of sorted) {
      const midX = Math.max(gLo + 1, Math.min(gHi - 1, preferred));
      const pts = [
        { x: exit.x, y: exit.y },
        { x: midX, y: exit.y },
        { x: midX, y: entry.y },
        { x: entry.x, y: entry.y }
      ];
      if (this._polylineClear(pts, boxes, excludeIds)) return pts;
    }

    const midX = (xLo + xHi) / 2;
    return [
      { x: exit.x, y: exit.y },
      { x: midX, y: exit.y },
      { x: midX, y: entry.y },
      { x: entry.x, y: entry.y }
    ];
  }

  /* Adapter: map this component's port/box types onto the standalone A*
       router. The source exits along its side's outward normal; the target is
       entered along its side's outward normal. Boxes for the two endpoints are
       excluded so the wire is allowed to touch its own nodes.                  */
  _routeAStar(exit, exitSide, entry, entrySide, boxes, excludeIds) {
    const SIDE_DIR = {
      top: "up",
      bottom: "down",
      left: "left",
      right: "right"
    };
    const obstacles = boxes
      .filter((b) => !excludeIds.has(b.id))
      .map((b) => ({ x: b.x, y: b.y, width: b.w, height: b.h }));
    try {
      return routeOrthogonal(
        { x: exit.x, y: exit.y, dir: SIDE_DIR[exitSide] },
        { x: entry.x, y: entry.y, dir: SIDE_DIR[entrySide] },
        obstacles
      );
    } catch {
      return null;
    }
  }

  _computeLinkGeometry(src, tgt, portPos, boxes) {
    const exit = portPos
      ? portPos.exit
      : { x: src.x + NODE_W / 2, y: src.y + getNodeH(src) };
    const entry = portPos ? portPos.entry : { x: tgt.x + NODE_W / 2, y: tgt.y };
    const exitSide = portPos ? portPos.exitSide : "bottom";
    const entrySide = portPos ? portPos.entrySide : "top";
    const laneIndex = portPos ? portPos.laneIndex : 0;
    const laneCount = portPos ? portPos.laneCount : 1;

    const excludeIds = new Set([src.id, tgt.id]);
    const tgtBox = boxes.find((b) => b.id === tgt.id);

    let points;
    /* A cycle (back-edge) is any link whose target sits at/above its source
           — used purely for styling, independent of how it gets routed.        */
    const isLoopback = tgt.y + getNodeH(tgt) <= src.y + MIN_STUB;

    if (exitSide === "bottom" && entrySide === "top") {
      /* Standard downward tree edge: keep the lane-aware forward router so
               sibling connectors stay evenly fanned out.                       */
      points = this._forwardPolyline(
        exit.x,
        exit.y,
        entry.x,
        entry.y,
        laneIndex,
        laneCount,
        boxes,
        excludeIds
      );
    } else {
      /* Everything else (back-edges, side joins, obstacle-laden routes) is
               handled by the A* orthogonal router, which avoids node cores and
               their padding bands. Fall back to the hand-rolled routines if A*
               can't find a path or the grid is too dense.                      */
      const aStar = this._routeAStar(
        exit,
        exitSide,
        entry,
        entrySide,
        boxes,
        excludeIds
      );
      if (aStar && aStar.length >= 2) {
        points = aStar;
      } else if (
        (exitSide === "right" && entrySide === "right") ||
        (exitSide === "left" && entrySide === "left")
      ) {
        const classifiedSide = exitSide;
        const srcCx = src.x + NODE_W / 2;
        const tgtCx = tgt.x + NODE_W / 2;
        if (Math.abs(srcCx - tgtCx) <= NODE_W / 3) {
          const lExit = { x: src.x, y: exit.y };
          const lEntry = { x: tgt.x, y: entry.y };
          points = this._loopbackPolyline(
            lExit,
            lEntry,
            boxes,
            excludeIds,
            "left",
            tgtBox
          );
        } else {
          points = this._loopbackPolyline(
            exit,
            entry,
            boxes,
            excludeIds,
            classifiedSide,
            tgtBox
          );
        }
      } else {
        points = this._sidewaysPolyline(
          exit,
          exitSide,
          entry,
          entrySide,
          laneIndex,
          laneCount,
          boxes,
          excludeIds
        );
      }
    }

    /* Label: prefer the longest horizontal segment; fall back to longest
           vertical segment if the route is mostly vertical.                   */
    let bestH = -1;
    let bestV = -1;
    let labelX = (exit.x + entry.x) / 2;
    let labelY = (exit.y + entry.y) / 2;
    for (let s = 0; s < points.length - 1; s++) {
      const a = points[s];
      const b = points[s + 1];
      if (Math.abs(a.y - b.y) < 0.5) {
        const len = Math.abs(b.x - a.x);
        if (len > bestH) {
          bestH = len;
          labelX = (a.x + b.x) / 2;
          labelY = a.y;
        }
      } else if (bestH < 0) {
        const len = Math.abs(b.y - a.y);
        if (len > bestV) {
          bestV = len;
          labelX = a.x;
          labelY = (a.y + b.y) / 2;
        }
      }
    }

    return {
      points,
      hops: points.slice(0, -1).map(() => []),
      isLoopback,
      labelX,
      labelY
    };
  }

  /* ===================== Line Jumps (later link arches over earlier) ===================== */

  _assignLineJumps(geoms) {
    const EPS = 1.5;
    for (let j = 0; j < geoms.length; j++) {
      const gj = geoms[j].geo;
      for (let sj = 0; sj < gj.points.length - 1; sj++) {
        const aj = gj.points[sj];
        const bj = gj.points[sj + 1];
        const jHoriz = Math.abs(aj.y - bj.y) < 0.5;
        for (let i = 0; i < j; i++) {
          const gi = geoms[i].geo;
          for (let si = 0; si < gi.points.length - 1; si++) {
            const ai = gi.points[si];
            const bi = gi.points[si + 1];
            const iHoriz = Math.abs(ai.y - bi.y) < 0.5;
            if (jHoriz === iHoriz) continue;

            if (jHoriz) {
              const y = aj.y;
              const vx = ai.x;
              const hxMin = Math.min(aj.x, bj.x);
              const hxMax = Math.max(aj.x, bj.x);
              const vyMin = Math.min(ai.y, bi.y);
              const vyMax = Math.max(ai.y, bi.y);
              if (
                vx > hxMin + EPS &&
                vx < hxMax - EPS &&
                y > vyMin + EPS &&
                y < vyMax - EPS
              ) {
                gj.hops[sj].push(vx);
              }
            } else {
              const x = aj.x;
              const hy = ai.y;
              const vyMin = Math.min(aj.y, bj.y);
              const vyMax = Math.max(aj.y, bj.y);
              const hxMin = Math.min(ai.x, bi.x);
              const hxMax = Math.max(ai.x, bi.x);
              if (
                x > hxMin + EPS &&
                x < hxMax - EPS &&
                hy > vyMin + EPS &&
                hy < vyMax - EPS
              ) {
                gj.hops[sj].push(hy);
              }
            }
          }
        }
      }
    }
  }

  _buildOrthPath(points, hops) {
    if (points.length < 2) return "";
    const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    if (points.length === 2) {
      return (
        `M${points[0].x},${points[0].y} ` +
        this._lineWithHops(points[0], points[1], hops[0] || [])
      );
    }

    let d = `M${points[0].x},${points[0].y}`;
    let prev = points[0];

    for (let i = 1; i < points.length; i++) {
      const v = points[i];
      const a = points[i - 1];
      if (i < points.length - 1) {
        const w = points[i + 1];
        const r = Math.min(CORNER_RADIUS, dist(a, v) / 2, dist(v, w) / 2);
        const inDir = { x: Math.sign(v.x - a.x), y: Math.sign(v.y - a.y) };
        const outDir = { x: Math.sign(w.x - v.x), y: Math.sign(w.y - v.y) };
        const lineEnd = { x: v.x - r * inDir.x, y: v.y - r * inDir.y };
        d += " " + this._lineWithHops(prev, lineEnd, hops[i - 1] || []);
        const cpAfter = { x: v.x + r * outDir.x, y: v.y + r * outDir.y };
        d += ` Q${v.x},${v.y} ${cpAfter.x},${cpAfter.y}`;
        prev = cpAfter;
      } else {
        d += " " + this._lineWithHops(prev, v, hops[i - 1] || []);
      }
    }
    return d;
  }

  _lineWithHops(from, to, scalars) {
    if (!scalars || scalars.length === 0) {
      return `L${to.x},${to.y}`;
    }
    const hopR = HOP_RADIUS;
    const horizontal = Math.abs(from.y - to.y) < 0.5;
    const parts = [];

    const fixed = horizontal ? from.y : from.x;
    const start = horizontal ? from.x : from.y;
    const end = horizontal ? to.x : to.y;
    const dir = end >= start ? 1 : -1;
    const lo = Math.min(start, end) + hopR;
    const hi = Math.max(start, end) - hopR;

    const valid = scalars
      .filter((s) => s > lo && s < hi)
      .sort((p, q) => (dir > 0 ? p - q : q - p));
    const merged = [];
    valid.forEach((s) => {
      if (
        !merged.length ||
        Math.abs(s - merged[merged.length - 1]) > hopR * 2 + 2
      )
        merged.push(s);
    });

    const sweep = dir > 0 ? 1 : 0;
    merged.forEach((h) => {
      if (horizontal) {
        parts.push(`L${h - hopR * dir},${fixed}`);
        parts.push(`A${hopR},${hopR} 0 0,${sweep} ${h + hopR * dir},${fixed}`);
      } else {
        parts.push(`L${fixed},${h - hopR * dir}`);
        parts.push(`A${hopR},${hopR} 0 0,${sweep} ${fixed},${h + hopR * dir}`);
      }
    });
    parts.push(`L${to.x},${to.y}`);
    return parts.join(" ");
  }

  /* ===================== Canvas Init ===================== */

  _initCanvas(container) {
    const d3 = this._d3;

    while (container.firstChild) container.removeChild(container.firstChild);

    const svg = d3
      .select(container)
      .append("svg")
      .attr("class", "workflow-canvas")
      .attr("width", "100%")
      .attr("height", "100%");

    const defs = svg.append("defs");

    /* Arrow (target end) and dot (source end) for every connector. Both use
           `context-stroke` so the marker always matches its line's colour.      */
    defs
      .append("marker")
      .attr("id", "mas-arrow")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 9)
      .attr("refY", 5)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 11)
      .attr("markerHeight", 11)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M1,2 L9,5 L1,8 Z")
      .attr("fill", "context-stroke");

    defs
      .append("marker")
      .attr("id", "mas-dot")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 5)
      .attr("refY", 5)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("circle")
      .attr("cx", 5)
      .attr("cy", 5)
      .attr("r", 3.2)
      .attr("fill", "context-stroke");

    defs
      .append("marker")
      .attr("id", "mas-arrow-active")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 10)
      .attr("refY", 5)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,2 L8,5 L0,8 Z")
      .attr("fill", "#4bca81");

    defs
      .append("marker")
      .attr("id", "mas-arrow-drag")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 10)
      .attr("refY", 5)
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,1 L9,5 L0,9 Z")
      .attr("fill", ACCENT_BLUE);

    const gridPattern = defs
      .append("pattern")
      .attr("id", "mas-grid")
      .attr("width", GRID_SIZE)
      .attr("height", GRID_SIZE)
      .attr("patternUnits", "userSpaceOnUse");
    gridPattern
      .append("path")
      .attr("d", `M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`)
      .attr("fill", "none")
      .attr("stroke", "#e8e8e8")
      .attr("stroke-width", 0.5);

    const zoomGroup = svg.append("g").attr("class", "zoom-group");

    zoomGroup
      .append("rect")
      .attr("class", "canvas-bg")
      .attr("width", CANVAS_W)
      .attr("height", CANVAS_H)
      .attr("fill", "url(#mas-grid)");

    zoomGroup.append("g").attr("class", "links-layer");
    zoomGroup.append("g").attr("class", "temp-link-layer");

    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        zoomGroup.attr("transform", event.transform);
        this._currentTransform = event.transform;
        this.zoomLevel = event.transform.k;
        this._syncOverlayTransform(event.transform);
        this._updateMinimap();
      });

    svg.call(zoom);
    svg.on("click", () => {
      this._selectNode(null);
    });

    this._svg = svg;
    this._zoomGroup = zoomGroup;
    this._zoomBehavior = zoom;
    this._currentTransform = d3.zoomIdentity;
    this._syncOverlayTransform(d3.zoomIdentity);
  }

  _syncOverlayTransform(t) {
    this._overlayTransformCss = `transform:translate(${t.x}px,${t.y}px) scale(${t.k});transform-origin:0 0`;
  }

  /* ===================== Link Rendering (SVG only) ===================== */

  /* Identify links that are genuine cycles (back-edges): an edge whose target
       is an ancestor of its source in the workflow graph. Driven by topology,
       NOT geometry, so a forward edge never looks like a cycle just because a
       node was dragged to sit physically above its neighbour.                 */
  _computeBackEdges() {
    const childLinks = new Map();
    const hasParent = new Set();
    this._links.forEach((l) => {
      if (!childLinks.has(l.source)) childLinks.set(l.source, []);
      childLinks.get(l.source).push(l);
      hasParent.add(l.target);
    });
    const roots = this._nodes.filter((n) => !hasParent.has(n.id));
    if (roots.length === 0 && this._nodes.length > 0)
      roots.push(this._nodes[0]);

    const backEdges = new Set();
    const onStack = new Set();
    const done = new Set();

    const dfs = (nodeId) => {
      onStack.add(nodeId);
      for (const link of childLinks.get(nodeId) || []) {
        if (onStack.has(link.target)) {
          backEdges.add(link.id); // points back to an ancestor → cycle
        } else if (!done.has(link.target)) {
          dfs(link.target);
        }
      }
      onStack.delete(nodeId);
      done.add(nodeId);
    };
    roots.forEach((r) => {
      if (!done.has(r.id)) dfs(r.id);
    });
    this._nodes.forEach((n) => {
      if (!done.has(n.id)) dfs(n.id);
    }); // disconnected nodes
    return backEdges;
  }

  _renderLinks() {
    const d3 = this._d3;
    if (!this._zoomGroup) return;

    const self = this;
    const nodeMap = new Map(this._nodes.map((n) => [n.id, n]));
    const linkPorts = this._computeLinkPorts();
    const boxes = this._buildNodeBoxes();
    const backEdges = this._computeBackEdges();

    const geoms = [];
    this._links.forEach((link) => {
      const src = nodeMap.get(link.source);
      const tgt = nodeMap.get(link.target);
      if (!src || !tgt) return;
      geoms.push({
        link,
        geo: this._computeLinkGeometry(src, tgt, linkPorts.get(link.id), boxes)
      });
    });

    this._assignLineJumps(geoms);
    const geoById = new Map(geoms.map((g) => [g.link.id, g.geo]));

    const linksLayer = this._zoomGroup.select(".links-layer");
    linksLayer.selectAll("*").remove();

    const linkGroups = linksLayer
      .selectAll(".mas-link-group")
      .data(this._links, (d) => d.id)
      .join("g")
      .attr("class", "mas-link-group");

    linkGroups.each(function (d) {
      const link = d;
      const g = d3.select(this);
      const geo = geoById.get(link.id);
      if (!geo) return;

      const dStr = self._buildOrthPath(geo.points, geo.hops);

      /* Back-edge (cycle) and "connect to existing stage" links share one
               look (amber, dashed) — both join to an already-placed stage.
               Cycle detection is topological (backEdges), not geometric, so
               dragging a node higher never re-styles a normal edge as a cycle.
               Every connector gets a dot at the source end and an arrow at the
               target end.                                                      */
      const special = backEdges.has(link.id) || !!link.toExistingStage;

      g.append("path")
        .attr("class", "mas-link" + (special ? " mas-link--special" : ""))
        .attr("d", dStr)
        .attr("fill", "none")
        .attr("stroke", special ? "#d29922" : LINK_COLOR)
        .attr("stroke-width", special ? 2 : 2.5)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("marker-start", "url(#mas-dot)")
        .attr("marker-end", "url(#mas-arrow)");

      if (special) {
        g.select(".mas-link").attr("stroke-dasharray", "6 4");
      }

      if (link.label) {
        const offsetX = link.label === "Yes" ? -28 : 28;
        const lx = geo.labelX + (special ? 10 : offsetX);
        const ly = geo.labelY;

        g.append("rect")
          .attr("x", lx - 18)
          .attr("y", ly - 12)
          .attr("width", 36)
          .attr("height", 22)
          .attr("rx", 11)
          .attr("ry", 11)
          .attr("fill", link.label === "Yes" ? "#e6f4ea" : "#fef0ef")
          .attr("stroke", link.label === "Yes" ? "#4bca81" : "#f85149")
          .attr("stroke-width", 1);

        g.append("text")
          .attr("x", lx)
          .attr("y", ly + 1)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-size", 11)
          .attr("font-weight", 500)
          .attr("fill", link.label === "Yes" ? "#137333" : "#c5221f")
          .text(link.label);
      }
    });

    this._updateMinimap();
  }

  /* ===================== Node Selection ===================== */

  _selectNode(node) {
    this.selectedNode = node ? { ...node } : null;
  }

  /* ===================== Node Events from Child Component ===================== */

  handleNodeClick(event) {
    event.stopPropagation();
    const target = event.currentTarget;
    const nodeId = target.dataset.nodeId;
    if (!nodeId) return;
    const node = this._nodes.find((n) => n.id === nodeId);
    if (node) this._selectNode(node);
  }

  handleNodeSelectEvent(event) {
    const nodeId = event.detail.nodeId;
    const node = this._nodes.find((n) => n.id === nodeId);
    if (node) this._selectNode(node);
  }

  handleNodeDeleteEvent(event) {
    const nodeId = event.detail.nodeId;
    if (nodeId) this._deleteNode(nodeId);
  }

  handleNodeCollapseEvent(event) {
    const nodeId = event.detail.nodeId;
    const node = this._nodes.find((n) => n.id === nodeId);
    if (!node) return;
    node.isCollapsed = !node.isCollapsed;
    this._nodes = [...this._nodes];
    this._autoLayout();
    this._renderLinks();
  }

  handlePortDragStartEvent(event) {
    const { nodeId, clientX, clientY } = event.detail;
    const node = this._nodes.find((n) => n.id === nodeId);
    if (!node) return;
    this._beginPortDrag({ clientX, clientY }, node);
  }

  handleNodeDragStartEvent(event) {
    const { nodeId, clientX, clientY } = event.detail;
    if (nodeId) this._beginNodeDrag(nodeId, clientX, clientY);
  }

  /* ===================== Node Dragging (move) ===================== */

  /* Free-move a node by following the pointer. Client deltas are divided by
       the current zoom scale to convert screen pixels to canvas units. The drag
       only "engages" past a small threshold so a plain click still selects, and
       undo state is captured once, when the move actually begins.             */
  _beginNodeDrag(nodeId, clientX, clientY) {
    const self = this;
    const node = this._nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const startNodeX = node.x;
    const startNodeY = node.y;
    const startClientX = clientX;
    const startClientY = clientY;
    let moved = false;
    let rafId = 0;
    let lastClientX = clientX;
    let lastClientY = clientY;

    const updateFrame = () => {
      rafId = 0;
      const k = (self._currentTransform ? self._currentTransform.k : 1) || 1;
      node.x = startNodeX + (lastClientX - startClientX) / k;
      node.y = startNodeY + (lastClientY - startClientY) / k;
      self._nodes = [...self._nodes]; // reactive re-position of the card
      self._renderLinks(); // reroute connectors to the new spot
    };

    const onMouseMove = (e) => {
      e.preventDefault();
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (!moved) {
        if (
          Math.abs(e.clientX - startClientX) +
            Math.abs(e.clientY - startClientY) <
          4
        )
          return;
        moved = true;
        self._pushUndo();
        node.pinned = true; // manual position — auto-layout will respect it
      }
      if (!rafId) {
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- throttle node drag redraws
        rafId = requestAnimationFrame(updateFrame);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      if (rafId) cancelAnimationFrame(rafId);
      if (moved) {
        self._nodes = [...self._nodes];
        self._renderLinks();
      }
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
  }

  /* ===================== Delete Node ===================== */

  _deleteNode(nodeId) {
    const node = this._nodes.find((n) => n.id === nodeId);
    if (!node || node.nodeType === "root") return;

    this._pushUndo();

    if (node.nodeType === "stage") {
      const attachedTransitionIds = [];
      this._links.forEach((l) => {
        const otherId =
          l.source === nodeId ? l.target : l.target === nodeId ? l.source : "";
        if (!otherId) return;
        const other = this._nodes.find((n) => n.id === otherId);
        if (other && other.nodeType === "transition") {
          attachedTransitionIds.push(other.id);
        }
      });
      const removeIds = new Set([nodeId, ...attachedTransitionIds]);
      this._links = this._links.filter(
        (l) => !removeIds.has(l.source) && !removeIds.has(l.target)
      );
      this._nodes = this._nodes.filter((n) => !removeIds.has(n.id));
    } else {
      /* Transition deleted: remove it and all its connections — no bridging. */
      this._links = this._links.filter(
        (l) => l.source !== nodeId && l.target !== nodeId
      );
      this._nodes = this._nodes.filter((n) => n.id !== nodeId);
    }

    if (this.selectedNode && this.selectedNode.id === nodeId) {
      this.selectedNode = null;
    }
    this._autoLayout();
    this._renderLinks();
  }

  /* ===================== Connection Dragging ===================== */

  _beginPortDrag(mousedownEvent, sourceNode) {
    const self = this;
    const srcId = sourceNode.id;
    const srcH = getNodeH(sourceNode);
    const startCanvasX = sourceNode.x + NODE_W / 2;
    const startCanvasY = sourceNode.y + srcH + 20;

    const tempLayer = this._zoomGroup.select(".temp-link-layer");
    tempLayer.selectAll("*").remove();

    const lineNode = tempLayer
      .append("path")
      .attr("class", "mas-temp-link")
      .attr(
        "d",
        `M${startCanvasX},${startCanvasY} L${startCanvasX},${startCanvasY}`
      )
      .attr("fill", "none")
      .attr("stroke", ACCENT_BLUE)
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "6 3")
      .attr("marker-end", "url(#mas-arrow-drag)")
      .attr("pointer-events", "none")
      .node();

    let totalDist = 0;
    let currentTarget = null;
    let rafId = 0;
    let lastClientX = mousedownEvent.clientX;
    let lastClientY = mousedownEvent.clientY;

    const container = self.template.querySelector(".canvas-svg-container");
    const containerRect = container.getBoundingClientRect();

    const toCanvas = (clientX, clientY) => {
      const t = self._currentTransform || self._d3.zoomIdentity;
      return {
        x: (clientX - containerRect.left - t.x) / t.k,
        y: (clientY - containerRect.top - t.y) / t.k
      };
    };

    const updateFrame = () => {
      rafId = 0;
      const canvas = toCanvas(lastClientX, lastClientY);
      const dx = canvas.x - startCanvasX;
      const dy = canvas.y - startCanvasY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cpOff = Math.max(Math.abs(dy) * 0.45, Math.min(dist * 0.3, 60));

      lineNode.setAttribute(
        "d",
        `M${startCanvasX},${startCanvasY} C${startCanvasX},${startCanvasY + cpOff} ${canvas.x},${canvas.y - cpOff} ${canvas.x},${canvas.y}`
      );

      const hit = self._hitTestNode(canvas.x, canvas.y, srcId);
      const hitId = hit ? hit.id : null;

      if (hitId !== (currentTarget ? currentTarget.id : null)) {
        currentTarget = hit;
        self._connectTargetId = hitId;
        lineNode.setAttribute("stroke", hit ? "#4bca81" : ACCENT_BLUE);
        lineNode.setAttribute("stroke-width", hit ? "3" : "2.5");
      }
    };

    const onMouseMove = (e) => {
      e.preventDefault();
      totalDist += Math.abs(e.movementX) + Math.abs(e.movementY);
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (!rafId) {
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- throttle connector drag redraws
        rafId = requestAnimationFrame(updateFrame);
      }
    };

    const onMouseUp = (e) => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      if (rafId) cancelAnimationFrame(rafId);

      tempLayer.selectAll("*").remove();
      self._connectTargetId = null;

      if (totalDist < 6) {
        self._showActionPopover(
          sourceNode,
          mousedownEvent.clientX,
          mousedownEvent.clientY
        );
        return;
      }

      const canvas = toCanvas(e.clientX, e.clientY);
      const target = self._hitTestNode(canvas.x, canvas.y, srcId);

      if (target) {
        const srcNode = self._nodes.find((n) => n.id === srcId);
        if (
          srcNode &&
          srcNode.nodeType === "stage" &&
          target.nodeType === "stage"
        ) {
          /* stage→stage: auto-insert a transition to enforce the rule
                       that every stage-to-stage path has a transition block. */
          self._pushUndo();
          const transId = nextId();
          const transNode = {
            id: transId,
            nodeType: "transition",
            label: "New Transition",
            x: (srcNode.x + target.x) / 2,
            y: (srcNode.y + target.y) / 2
          };
          self._nodes = [...self._nodes, transNode];
          self._links.push(
            { id: "l_t1_" + transId, source: srcId, target: transId },
            { id: "l_t2_" + transId, source: transId, target: target.id }
          );
          self._renderLinks();
        } else {
          const exactDuplicate = self._links.some(
            (l) => l.source === srcId && l.target === target.id
          );
          if (!exactDuplicate && srcId !== target.id) {
            self._pushUndo();
            self._links.push({
              id: "l_conn_" + Date.now(),
              source: srcId,
              target: target.id
            });
            self._renderLinks();
          }
        }
      }
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
  }

  _hitTestNode(canvasX, canvasY, excludeId) {
    const margin = 20;
    for (let i = 0; i < this._nodes.length; i++) {
      const n = this._nodes[i];
      if (n.id === excludeId) continue;
      const h = getNodeH(n);
      if (
        canvasX >= n.x - margin &&
        canvasX <= n.x + NODE_W + margin &&
        canvasY >= n.y - margin &&
        canvasY <= n.y + h + margin
      ) {
        return n;
      }
    }
    return null;
  }

  /* ===================== Popover ===================== */

  _showActionPopover(sourceNode, clientX, clientY) {
    const container = this.template.querySelector(".studio-canvas");
    const rect = container.getBoundingClientRect();
    this._popoverX = clientX - rect.left + 12;
    this._popoverY = clientY - rect.top + 12;
    this._popoverSourceId = sourceNode.id;
    this._popoverMode = "main";
    this._popoverVisible = true;
  }

  handlePopoverDismiss() {
    this._popoverVisible = false;
  }

  handlePopoverContentClick(event) {
    event.stopPropagation();
  }

  handlePopoverAction(event) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;
    if (action === "newStage") {
      this._popoverVisible = false;
      const src = this._nodes.find((n) => n.id === this._popoverSourceId);
      if (src) this._addNodeBelow(src);
    } else if (action === "existingStage") {
      this._popoverMode = "stageList";
    } else if (action === "back") {
      this._popoverMode = "main";
    }
  }

  handlePopoverStageSelect(event) {
    event.stopPropagation();
    const targetId = event.currentTarget.dataset.stageId;
    const sourceId = this._popoverSourceId;
    this._popoverVisible = false;
    if (sourceId && targetId) this._connectToExistingStage(sourceId, targetId);
  }

  /* Find a position for a w×h card near (desiredX, desiredY) that doesn't
       overlap any existing node (with PAD clearance). Existing cards — the
       target especially — are never moved; we search outward from the desired
       spot and drop the new card into the closest free space, preferring a
       sideways slot in the same row before stepping down a row.               */
  _findFreePosition(desiredX, desiredY, w, h) {
    const PAD = 32;
    const overlaps = (x, y) =>
      this._nodes.some((n) => {
        const nw = NODE_W,
          nh = getNodeH(n);
        return (
          x - PAD < n.x + nw &&
          x + w + PAD > n.x &&
          y - PAD < n.y + nh &&
          y + h + PAD > n.y
        );
      });

    if (!overlaps(desiredX, desiredY)) return { x: desiredX, y: desiredY };

    const colStep = NODE_W + MIN_SIBLING_GAP_X; // one column over
    const rowStep = h + BASE_LAYER_GAP; // one row down
    for (let ring = 1; ring <= 12; ring++) {
      const candidates = [];
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = 0; dy <= ring; dy++) {
          // only sideways / downward
          if (Math.max(Math.abs(dx), dy) !== ring) continue; // ring perimeter only
          candidates.push({
            x: desiredX + dx * colStep,
            y: desiredY + dy * rowStep
          });
        }
      }
      /* Closest first; weight vertical moves slightly so a free sideways
               slot wins over an equally-distant slot further down, and break
               left/right ties toward the right.                              */
      const cost = (p) =>
        Math.abs(p.x - desiredX) +
        Math.abs(p.y - desiredY) * 1.2 +
        (p.x < desiredX ? 0.01 : 0);
      candidates.sort((a, b) => cost(a) - cost(b));
      for (const c of candidates) {
        if (!overlaps(c.x, c.y)) return c;
      }
    }
    return { x: desiredX, y: desiredY }; // give up: nowhere clear found
  }

  _connectToExistingStage(sourceId, targetId) {
    const srcNode = this._nodes.find((n) => n.id === sourceId);
    if (!srcNode) return;

    this._pushUndo();

    const transId = nextId();
    const transH = getNodeH({ nodeType: "transition" });
    /* Place the transition in free space below the source — without nudging
           the target or any other existing card.                              */
    const pos = this._findFreePosition(
      srcNode.x,
      srcNode.y + getNodeH(srcNode) + BASE_LAYER_GAP,
      NODE_W,
      transH
    );
    const transNode = {
      id: transId,
      nodeType: "transition",
      label: "New Transition",
      x: pos.x,
      y: pos.y
    };

    this._nodes = [...this._nodes, transNode];
    this._links.push(
      { id: "l_t1_" + transId, source: sourceId, target: transId },
      {
        id: "l_t2_" + transId,
        source: transId,
        target: targetId,
        toExistingStage: true
      }
    );
    this._renderLinks();
  }

  /* ===================== Node Operations ===================== */

  _addNodeBelow(parentNode) {
    if (parentNode.nodeType !== "stage") return;

    this._pushUndo();

    /* New transition + stage start under the parent's centre; the pin-aware
           auto-layout then fans this parent's children out symmetrically and
           shifts neighbours to make room — while any node the user has dragged
           (pinned) keeps its manual position.                                 */
    const transId = nextId();
    const transNode = {
      id: transId,
      nodeType: "transition",
      label: "New Transition",
      x: parentNode.x,
      y: parentNode.y + getNodeH(parentNode) + BASE_LAYER_GAP
    };

    const stageId = nextId();
    const stageNode = {
      id: stageId,
      nodeType: "stage",
      label: "New Stage",
      lifecycleState: "",
      customLabelApiName: "",
      activities: [],
      allowManualTransition: false,
      isFinalStage: false,
      x: parentNode.x,
      y: transNode.y + getNodeH(transNode) + BASE_LAYER_GAP
    };

    this._nodes.push(transNode, stageNode);
    this._links.push(
      { id: "l" + transId, source: parentNode.id, target: transId },
      { id: "l" + stageId, source: transId, target: stageId }
    );
    this._autoLayout();
    this._nodes = [...this._nodes];
    this._renderLinks();
    this._selectNode(stageNode);
  }

  _addNodeFromPalette(type, dropX, dropY) {
    this._pushUndo();
    const newId = nextId();
    const t = this._currentTransform || this._d3.zoomIdentity;
    const canvasX = (dropX - t.x) / t.k;
    const canvasY = (dropY - t.y) / t.k;
    const nodeType = type;

    const newNode = {
      id: newId,
      nodeType: nodeType,
      label: NODE_TYPE_LABELS[type] || "New Step",
      x: canvasX - NODE_W / 2,
      y: canvasY - getNodeH({ nodeType: nodeType }) / 2
    };

    if (nodeType === "stage") {
      newNode.lifecycleState = "";
      newNode.customLabelApiName = "";
      newNode.activities = [];
      newNode.allowManualTransition = false;
      newNode.isFinalStage = false;
    }

    this._nodes.push(newNode);

    const closest = this._findClosestNode(canvasX, canvasY, newId);
    if (closest) {
      this._links.push({ id: "l" + newId, source: closest.id, target: newId });
    }

    this._renderLinks();
    this._selectNode(newNode);
  }

  _findClosestNode(x, y, excludeId) {
    let best = null;
    let bestDist = Infinity;
    this._nodes.forEach((n) => {
      if (n.id === excludeId) return;
      const h = getNodeH(n);
      const dx = n.x + NODE_W / 2 - x;
      const dy = n.y + h - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist && n.y < y) {
        bestDist = dist;
        best = n;
      }
    });
    return bestDist < 500 ? best : null;
  }

  handleDeleteSelectedNode() {
    if (!this.selectedNode) return;
    this._deleteNode(this.selectedNode.id);
  }

  /* ===================== Property Changes ===================== */

  handlePropertyChange(event) {
    if (!this.selectedNode) return;
    const target = event.target;
    const field = target.dataset.field;
    const value =
      target.type === "checkbox" ? String(target.checked) : target.value;
    const node = this._nodes.find((n) => n.id === this.selectedNode.id);
    if (node) {
      if (target.type === "checkbox") {
        node[field] = target.checked;
      } else {
        node[field] = value;
      }
      this.selectedNode = { ...node };
      this._nodes = [...this._nodes];
      this._renderLinks();
    }
  }

  handleClosePropertyPanel() {
    this._selectNode(null);
  }

  /* ===================== Toolbar Actions ===================== */

  handleToolbarAction(event) {
    const btn = event.currentTarget;
    const action = btn.dataset.action;
    switch (action) {
      case "undo":
        this._undo();
        break;
      case "redo":
        this._redo();
        break;
      case "zoomIn":
        this._zoomBy(1.3);
        break;
      case "zoomOut":
        this._zoomBy(0.7);
        break;
      case "fitToScreen":
        this._fitToScreen(true);
        break;
      case "autoLayout":
        this._pushUndo();
        this._nodes.forEach((n) => {
          n.pinned = false;
        });
        this._autoLayout();
        this._nodes = [...this._nodes];
        this._renderLinks();
        this._fitToScreen(true);
        break;
      case "runAnimation":
        this._runExecutionAnimation();
        break;
      default:
        break;
    }
  }

  _zoomBy(factor) {
    if (!this._svg || !this._zoomBehavior) return;
    this._svg
      .transition()
      .duration(300)
      .call(this._zoomBehavior.scaleBy, factor);
  }

  _fitToScreen(animate) {
    if (!this._svg || !this._zoomBehavior || !this._nodes.length) return;
    const d3 = this._d3;

    const container = this.template.querySelector(".canvas-svg-container");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const padX = 120,
      padY = 100;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    this._nodes.forEach((n) => {
      const h = getNodeH(n);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + h);
    });

    const contentW = maxX - minX + padX * 2;
    const contentH = maxY - minY + padY * 2;
    const scale = Math.min(rect.width / contentW, rect.height / contentH, 1.2);
    const tx = rect.width / 2 - (minX + (maxX - minX) / 2) * scale;
    const ty = rect.height / 2 - (minY + (maxY - minY) / 2) * scale;

    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    if (animate) {
      this._svg
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .call(this._zoomBehavior.transform, transform);
    } else {
      this._svg.call(this._zoomBehavior.transform, transform);
    }
  }

  /* ===================== Undo / Redo ===================== */

  _pushUndo() {
    this._undoStack.push({
      nodes: JSON.parse(JSON.stringify(this._nodes)),
      links: JSON.parse(JSON.stringify(this._links))
    });
    this._redoStack = [];
    if (this._undoStack.length > 50) this._undoStack.shift();
  }

  _undo() {
    if (this._undoStack.length === 0) return;
    this._redoStack.push({
      nodes: JSON.parse(JSON.stringify(this._nodes)),
      links: JSON.parse(JSON.stringify(this._links))
    });
    const state = this._undoStack.pop();
    this._nodes = state.nodes;
    this._links = state.links;
    this.selectedNode = null;
    this._renderLinks();
  }

  _redo() {
    if (this._redoStack.length === 0) return;
    this._undoStack.push({
      nodes: JSON.parse(JSON.stringify(this._nodes)),
      links: JSON.parse(JSON.stringify(this._links))
    });
    const state = this._redoStack.pop();
    this._nodes = state.nodes;
    this._links = state.links;
    this.selectedNode = null;
    this._renderLinks();
  }

  /* ===================== Drag & Drop from Palette ===================== */

  handlePaletteDragStart(event) {
    this._draggedPaletteType = event.currentTarget.dataset.type;
    event.dataTransfer.setData("text/plain", this._draggedPaletteType);
    event.dataTransfer.effectAllowed = "copy";
  }

  handleCanvasDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  handleCanvasDrop(event) {
    event.preventDefault();
    const type =
      event.dataTransfer.getData("text/plain") ||
      this._draggedPaletteType ||
      "";
    if (!type) return;

    const canvasEl = this.template.querySelector(".canvas-svg-container");
    const rect = canvasEl.getBoundingClientRect();
    const dropX = event.clientX - rect.left;
    const dropY = event.clientY - rect.top;

    this._addNodeFromPalette(type, dropX, dropY);
    this._draggedPaletteType = null;
  }

  /* ===================== Minimap ===================== */

  _initMinimap() {
    const d3 = this._d3;
    const minimapContainer = this.template.querySelector(".minimap-container");
    if (!minimapContainer) return;

    while (minimapContainer.firstChild)
      minimapContainer.removeChild(minimapContainer.firstChild);

    const mmW = 180,
      mmH = 130;

    const mmSvg = d3
      .select(minimapContainer)
      .append("svg")
      .attr("width", mmW)
      .attr("height", mmH)
      .style("background", "transparent");

    mmSvg.append("g").attr("class", "minimap-links");
    mmSvg.append("g").attr("class", "minimap-nodes");

    const viewport = mmSvg
      .append("rect")
      .attr("class", "minimap-viewport")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", mmW)
      .attr("height", mmH);

    this._minimapSvg = mmSvg;
    this._minimapViewport = viewport;
    this._updateMinimap();
  }

  _updateMinimap() {
    if (!this._minimapSvg || !this._nodes.length) return;
    const mmW = 180,
      mmH = 130;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    this._nodes.forEach((n) => {
      const h = getNodeH(n);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + h);
    });

    const pad = 80;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const scale = Math.min(mmW / contentW, mmH / contentH);

    const nodeMap = new Map(this._nodes.map((n) => [n.id, n]));

    this._minimapSvg
      .select(".minimap-links")
      .selectAll("line")
      .data(this._links, (d) => d.id)
      .join("line")
      .attr("x1", (d) => {
        const s = nodeMap.get(d.source);
        return s ? (s.x + NODE_W / 2 - minX) * scale : 0;
      })
      .attr("y1", (d) => {
        const s = nodeMap.get(d.source);
        return s ? (s.y + getNodeH(s) - minY) * scale : 0;
      })
      .attr("x2", (d) => {
        const t = nodeMap.get(d.target);
        return t ? (t.x + NODE_W / 2 - minX) * scale : 0;
      })
      .attr("y2", (d) => {
        const t = nodeMap.get(d.target);
        return t ? (t.y - minY) * scale : 0;
      })
      .attr("stroke", LINK_COLOR)
      .attr("stroke-width", 0.8);

    this._minimapSvg
      .select(".minimap-nodes")
      .selectAll("rect")
      .data(this._nodes, (d) => d.id)
      .join("rect")
      .attr("class", "minimap-node")
      .attr("x", (d) => (d.x - minX) * scale)
      .attr("y", (d) => (d.y - minY) * scale)
      .attr("width", NODE_W * scale)
      .attr("height", (d) => getNodeH(d) * scale)
      .attr("fill", (d) => ICON_COLORS[d.nodeType] || ICON_COLORS.stage)
      .attr("opacity", 0.8)
      .attr("rx", 2)
      .attr("ry", 2);

    if (this._minimapViewport && this._currentTransform) {
      const container = this.template.querySelector(".canvas-svg-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const t = this._currentTransform;

      const vx = (-t.x / t.k - minX) * scale;
      const vy = (-t.y / t.k - minY) * scale;
      const vw = (rect.width / t.k) * scale;
      const vh = (rect.height / t.k) * scale;

      this._minimapViewport
        .attr("x", Math.max(0, vx))
        .attr("y", Math.max(0, vy))
        .attr("width", Math.min(mmW, vw))
        .attr("height", Math.min(mmH, vh));
    }
  }

  /* ===================== Execution Animation ===================== */

  _runExecutionAnimation() {
    if (this._animationRunning) return;
    this._animationRunning = true;
    const d3 = this._d3;

    const childrenMap = new Map();
    const hasParent = new Set();

    this._links.forEach((l) => {
      if (!childrenMap.has(l.source)) childrenMap.set(l.source, []);
      childrenMap.get(l.source).push(l);
      hasParent.add(l.target);
    });

    let roots = this._nodes.filter((n) => !hasParent.has(n.id));
    if (roots.length === 0 && this._nodes.length > 0) roots = [this._nodes[0]];
    if (roots.length === 0) {
      this._animationRunning = false;
      return;
    }

    const order = [];
    const loopbackLinks = [];
    const visited = new Set();
    const bfs = [...roots.map((r) => ({ nodeId: r.id, fromLink: null }))];

    while (bfs.length > 0) {
      const { nodeId, fromLink } = bfs.shift();
      if (visited.has(nodeId)) {
        if (fromLink) loopbackLinks.push(fromLink);
        continue;
      }
      visited.add(nodeId);
      order.push({ nodeId, linkId: fromLink });
      const children = childrenMap.get(nodeId) || [];
      children.forEach((link) => {
        bfs.push({ nodeId: link.target, fromLink: link.id });
      });
    }

    loopbackLinks.forEach((linkId) => {
      order.push({ nodeId: null, linkId });
    });

    let step = 0;
    // eslint-disable-next-line @lwc/lwc/no-async-operation -- step through workflow execution animation
    const interval = setInterval(() => {
      if (step >= order.length) {
        clearInterval(interval);
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- allow final animation frame to finish
        setTimeout(() => {
          this._zoomGroup.selectAll(".mas-link").classed("is-animating", false);
          this._executingNodeIds = new Set();
          this._animationRunning = false;
        }, 800);
        return;
      }

      const { nodeId, linkId } = order[step];

      if (linkId) {
        this._zoomGroup.selectAll(".mas-link-group").each(function (d) {
          if (d.id === linkId) {
            d3.select(this)
              .select(".mas-link")
              .classed("is-animating", true)
              .attr("stroke", "#4bca81")
              .attr("stroke-dasharray", "8 4");
          }
        });
      }

      if (nodeId) {
        const newSet = new Set(this._executingNodeIds);
        newSet.add(nodeId);
        this._executingNodeIds = newSet;
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- clear node highlight after pulse
        setTimeout(() => {
          const updated = new Set(this._executingNodeIds);
          updated.delete(nodeId);
          this._executingNodeIds = updated;
        }, 800);
      }

      step++;
    }, 700);
  }
}
