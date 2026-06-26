import { LightningElement, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import d3Resource from '@salesforce/resourceUrl/d3';

const NODE_W: number = 380;
const CANVAS_W: number = 6000;
const CANVAS_H: number = 6000;
const BASE_LAYER_GAP: number = 80;
const LANE_SPACING: number = 16;
const MIN_SIBLING_GAP_X: number = 60;
const GRID_SIZE: number = 20;

const ACCENT_BLUE: string = '#066afe';
const LINK_COLOR: string  = '#c0c4cc';
const CORNER_RADIUS: number = 20;
const HOP_RADIUS: number = 6;
const NODE_CLEAR: number = 8;
const CHANNEL_MARGIN: number = 48;
const MIN_STUB: number = 28;
const LANE_INSET: number = 14;
const PORT_EDGE_MARGIN: number = 40;
const SIDE_VERTICAL_OVERLAP: number = 24;

const NODE_H_MAP: Record<string, number> = {
    root:       340,
    stage:      260,
    transition: 100,
};

const NODE_H_COLLAPSED: Record<string, number> = {
    root:       56,
    stage:      56,
    transition: 48,
};

function getNodeH(n: WorkflowNode): number {
    if (n.isCollapsed) return NODE_H_COLLAPSED[n.nodeType] || 56;
    return NODE_H_MAP[n.nodeType] || 240;
}

const ICON_COLORS: Record<string, string> = {
    root:       '#1b96ff',
    stage:      '#4bca81',
    transition: '#0d9dda',
};

const NODE_ICONS: Record<string, string> = {
    root:       '\u26A1',
    stage:      '\uD83D\uDCC4',
    transition: '\uD83D\uDD00',
};

const NODE_TYPE_LABELS: Record<string, string> = {
    root:       'Trigger',
    stage:      'Stage',
    transition: 'Transition',
};

interface ActivityItem {
    name: string;
    iconName: string;
}

interface WorkflowNode {
    id: string;
    nodeType: 'root' | 'stage' | 'transition';
    label: string;
    x: number;
    y: number;
    lifecycle?: string;
    criteriaFact?: string;
    entryCriteria?: string;
    autostart?: boolean;
    isActive?: boolean;
    lifecycleState?: string;
    customLabelApiName?: string;
    activities?: ActivityItem[];
    allowManualTransition?: boolean;
    isFinalStage?: boolean;
    isCollapsed?: boolean;
    /* Set once the user drags the node — auto-layout then keeps this node at
       its manual position instead of recomputing it.                         */
    pinned?: boolean;
}

interface WorkflowLink {
    id: string;
    source: string;
    target: string;
    label?: string;
    /* True when this connector lands on a pre-existing stage (created via the
       "connect to existing stage" action) — rendered with a distinct style.   */
    toExistingStage?: boolean;
}

interface Pt {
    x: number;
    y: number;
}

interface NodeBox {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

interface LinkGeometry {
    points: Pt[];
    hops: number[][];
    isLoopback: boolean;
    labelX: number;
    labelY: number;
}

type PortSide = 'top' | 'bottom' | 'left' | 'right';

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

type RouteDir = 'up' | 'down' | 'left' | 'right';

interface RoutePort {
    x: number;
    y: number;
    dir: RouteDir;   // outward normal: the direction the wire leaves the node
}

interface RouteObstacle {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface RouteOpts {
    padding: number;         // thickness of the discouraged buffer band
    paddingPenalty: number;  // cost multiplier inside that band
    bendPenalty: number;     // flat extra cost per 90° corner
    portStub: number;        // mandatory straight run out of each port
    margin: number;          // how far the routable area extends past the bbox
    maxGridCells: number;    // bail out (→ caller fallback) past this many nodes
}

const ROUTE_DEFAULTS: RouteOpts = {
    padding: 32,
    paddingPenalty: 6,
    bendPenalty: 40,
    portStub: 30,
    margin: 80,
    /* High enough that A* still runs on realistic graphs (~75 nodes). Past this
       the router returns null and the caller falls back to the hand-rolled
       routes — which is why this is generous: the fallback is a last resort. */
    maxGridCells: 30000,
};

const DIR_DELTA: Record<RouteDir, Pt> = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1  },
    left:  { x: -1, y: 0  },
    right: { x: 1,  y: 0  },
};

/* Sort ascending and drop near-duplicates (grid lines closer than 0.5px). */
function sortedUnique(values: number[]): number[] {
    const sorted: number[] = [...values].sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
        if (out.length === 0 || Math.abs(out[out.length - 1] - v) > 0.5) out.push(v);
    }
    return out;
}

/* Cost multiplier of a single point: Infinity inside a node (unwalkable),
   PADDING_PENALTY inside the buffer band, BASE (1) in open space. Sampling a
   single point is exact here because every obstacle boundary IS a grid line —
   no boundary can fall strictly between two adjacent Hanan lines, so the whole
   segment between them lives in one homogeneous region.                       */
function pointCost(
    x: number, y: number, obstacles: RouteObstacle[], padding: number, paddingPenalty: number
): number {
    let cost: number = 1;
    for (const o of obstacles) {
        const x1: number = o.x, x2: number = o.x + o.width;
        const y1: number = o.y, y2: number = o.y + o.height;
        if (x > x1 && x < x2 && y > y1 && y < y2) return Infinity;       // inside the node
        /* Strictly INSIDE the band is costly; the band's outer edge lines
           (obstacle ± padding) stay cheap, so a wire can hug at exactly the
           padding distance without being pushed all the way to the margin.   */
        if (x > x1 - padding && x < x2 + padding &&
            y > y1 - padding && y < y2 + padding) {
            cost = Math.max(cost, paddingPenalty);                       // inside the buffer band
        }
    }
    return cost;
}

/* Drop coincident points and collapse runs of collinear points so the result
   is just the corners of the orthogonal path.                                 */
function simplifyOrthogonal(points: Pt[]): Pt[] {
    const dedup: Pt[] = [];
    for (const p of points) {
        const last: Pt | undefined = dedup[dedup.length - 1];
        if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) dedup.push(p);
    }
    if (dedup.length <= 2) return dedup;
    const out: Pt[] = [dedup[0]];
    for (let i: number = 1; i < dedup.length - 1; i++) {
        const a: Pt = out[out.length - 1], b: Pt = dedup[i], c: Pt = dedup[i + 1];
        const collinear: boolean =
            (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
            (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
        if (!collinear) out.push(b);
    }
    out.push(dedup[dedup.length - 1]);
    return out;
}

/* Compact binary min-heap — the A* open set, ordered by f-score. */
class MinHeap<T> {
    private items: T[] = [];
    private cmp: (a: T, b: T) => number;
    constructor(cmp: (a: T, b: T) => number) {
        this.cmp = cmp;
    }
    get size(): number { return this.items.length; }
    push(v: T): void {
        const a: T[] = this.items;
        a.push(v);
        let i: number = a.length - 1;
        while (i > 0) {
            const p: number = (i - 1) >> 1;
            if (this.cmp(a[i], a[p]) < 0) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break;
        }
    }
    pop(): T | undefined {
        const a: T[] = this.items;
        if (a.length === 0) return undefined;
        const top: T = a[0];
        const last: T = a.pop() as T;
        if (a.length > 0) {
            a[0] = last;
            let i: number = 0;
            const n: number = a.length;
            for (;;) {
                const l: number = 2 * i + 1, r: number = 2 * i + 2;
                let s: number = i;
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

const DIR_CODE: Record<RouteDir, number> = { up: 0, down: 1, left: 2, right: 3 };

/* Route an orthogonal wire from `start` to `end` avoiding `obstacles`.
   Returns the corner waypoints (including the two real port points), or null
   if no path exists / the grid is too dense (caller should fall back).        */
function routeOrthogonal(
    start: RoutePort, end: RoutePort, obstacles: RouteObstacle[], options?: Partial<RouteOpts>
): Pt[] | null {
    const opt: RouteOpts = { ...ROUTE_DEFAULTS, ...(options || {}) };

    /* 1. Mandatory outward stubs — the wire must leave/enter along the normal. */
    const sStub: Pt = {
        x: start.x + DIR_DELTA[start.dir].x * opt.portStub,
        y: start.y + DIR_DELTA[start.dir].y * opt.portStub,
    };
    const eStub: Pt = {
        x: end.x + DIR_DELTA[end.dir].x * opt.portStub,
        y: end.y + DIR_DELTA[end.dir].y * opt.portStub,
    };

    /* 2. Build the sparse Hanan grid lines from ports, stubs and padded edges. */
    const xsRaw: number[] = [start.x, end.x, sStub.x, eStub.x];
    const ysRaw: number[] = [start.y, end.y, sStub.y, eStub.y];
    for (const o of obstacles) {
        xsRaw.push(o.x - opt.padding, o.x + o.width + opt.padding);
        ysRaw.push(o.y - opt.padding, o.y + o.height + opt.padding);
    }
    /* Outer ring so a route can always escape around the whole obstacle field. */
    xsRaw.push(Math.min(...xsRaw) - opt.margin, Math.max(...xsRaw) + opt.margin);
    ysRaw.push(Math.min(...ysRaw) - opt.margin, Math.max(...ysRaw) + opt.margin);

    const xs: number[] = sortedUnique(xsRaw);
    const ys: number[] = sortedUnique(ysRaw);
    const W: number = xs.length, H: number = ys.length;
    if (W * H > opt.maxGridCells) return null;

    const xi: Map<number, number> = new Map(); xs.forEach((v, i) => xi.set(v, i));
    const yi: Map<number, number> = new Map(); ys.forEach((v, i) => yi.set(v, i));
    const sI: number = xi.get(sStub.x) as number, sJ: number = yi.get(sStub.y) as number;
    const eI: number = xi.get(eStub.x) as number, eJ: number = yi.get(eStub.y) as number;

    /* State = (grid node, arrival direction). Direction is part of the state so
       the bend penalty is accounted for correctly (turn-aware A*).             */
    const stateKey = (i: number, j: number, d: number): number => (j * W + i) * 4 + d;
    const manhattan = (ax: number, ay: number): number => Math.abs(ax - eStub.x) + Math.abs(ay - eStub.y);

    const gScore: Map<number, number> = new Map();
    const cameFrom: Map<number, { i: number; j: number; d: number }> = new Map();
    const closed: Set<number> = new Set();
    const open = new MinHeap<{ i: number; j: number; d: number; f: number }>((a, b) => a.f - b.f);

    const startCode: number = DIR_CODE[start.dir];
    gScore.set(stateKey(sI, sJ, startCode), 0);
    open.push({ i: sI, j: sJ, d: startCode, f: manhattan(xs[sI], ys[sJ]) });

    /* Neighbour moves, tagged with the direction they travel in. */
    const MOVES: Array<{ di: number; dj: number; d: number }> = [
        { di: 0, dj: -1, d: DIR_CODE.up },
        { di: 0, dj: 1,  d: DIR_CODE.down },
        { di: -1, dj: 0, d: DIR_CODE.left },
        { di: 1, dj: 0,  d: DIR_CODE.right },
    ];

    let goal: { i: number; j: number; d: number } | null = null;

    while (open.size > 0) {
        const cur = open.pop() as { i: number; j: number; d: number; f: number };
        const ck: number = stateKey(cur.i, cur.j, cur.d);
        if (closed.has(ck)) continue;
        closed.add(ck);

        if (cur.i === eI && cur.j === eJ) { goal = cur; break; }

        const cg: number = gScore.get(ck) as number;
        const ax: number = xs[cur.i], ay: number = ys[cur.j];

        for (const m of MOVES) {
            const ni: number = cur.i + m.di, nj: number = cur.j + m.dj;
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
            const bx: number = xs[ni], by: number = ys[nj];

            /* Segment cost: blocked if it crosses a node core; otherwise length
               × region multiplier, plus a bend penalty if we change direction. */
            const region: number = pointCost((ax + bx) / 2, (ay + by) / 2, obstacles, opt.padding, opt.paddingPenalty);
            if (!isFinite(region)) continue;
            const len: number = Math.abs(bx - ax) + Math.abs(by - ay);
            let step: number = len * region;
            if (m.d !== cur.d) step += opt.bendPenalty;

            const nk: number = stateKey(ni, nj, m.d);
            const ng: number = cg + step;
            if (ng < (gScore.get(nk) ?? Infinity)) {
                gScore.set(nk, ng);
                cameFrom.set(nk, { i: cur.i, j: cur.j, d: cur.d });
                open.push({ i: ni, j: nj, d: m.d, f: ng + manhattan(bx, by) });
            }
        }
    }

    if (!goal) return null;

    /* 3. Walk the came-from chain back to the start stub. */
    const path: Pt[] = [];
    let node: { i: number; j: number; d: number } | undefined = goal;
    while (node) {
        path.push({ x: xs[node.i], y: ys[node.j] });
        node = cameFrom.get(stateKey(node.i, node.j, node.d));
    }
    path.reverse();

    /* 4. Bookend with the true port points and reduce to corners. */
    return simplifyOrthogonal([{ x: start.x, y: start.y }, ...path, { x: end.x, y: end.y }]);
}

interface LinkPortPositions {
    exit: Pt;
    entry: Pt;
    exitSide: PortSide;
    entrySide: PortSide;
    laneIndex: number;  /* 0-based position within siblings from same source */
    laneCount: number;  /* total siblings sharing this exit edge */
}

interface UndoState {
    nodes: WorkflowNode[];
    links: WorkflowLink[];
}

interface PaletteItem {
    type: string;
    icon: string;
    label: string;
    description: string;
    iconStyle: string;
}

interface DisplayNode {
    id: string;
    data: WorkflowNode;
    isSelected: boolean;
    isConnectTarget: boolean;
    isExecuting: boolean;
    isCollapsed: boolean;
    positionStyle: string;
}

let _idCounter: number = 100;
function nextId(): string { return 'n' + (++_idCounter); }

export default class NodeBasedWorkflowGenerator extends LightningElement {
    _d3: D3Static | null = null;
    _loadStarted: boolean = false;
    _svg: D3Selection | null = null;
    _zoomGroup: D3Selection | null = null;
    _zoomBehavior: D3ZoomBehavior | null = null;
    _currentTransform: D3ZoomIdentity | null = null;
    _minimapSvg: D3Selection | null = null;
    _minimapViewport: D3Selection | null = null;

    @track _nodes: WorkflowNode[] = [];
    @track _links: WorkflowLink[] = [];
    @track selectedNode: WorkflowNode | null = null;
    @track zoomLevel: number = 1;
    @track _overlayTransformCss: string = '';
    @track _connectTargetId: string | null = null;
    @track _executingNodeIds: Set<string> = new Set();
    @track _popoverVisible: boolean = false;
    @track _popoverMode: string = 'main';
    @track _popoverSourceId: string | null = null;
    @track _popoverX: number = 0;
    @track _popoverY: number = 0;

    _undoStack: UndoState[] = [];
    _redoStack: UndoState[] = [];
    _animationRunning: boolean = false;
    _draggedPaletteType: string | null = null;

    /* ===================== Getters for Template ===================== */

    get paletteItems(): PaletteItem[] {
        return [
            { type: 'stage',      icon: NODE_ICONS.stage,      label: 'Stage',      description: 'Add a workflow stage',  iconStyle: `background:${ICON_COLORS.stage};color:#fff` },
            { type: 'transition', icon: NODE_ICONS.transition,  label: 'Transition', description: 'Connect two stages',   iconStyle: `background:${ICON_COLORS.transition};color:#fff` },
        ];
    }

    get displayNodes(): DisplayNode[] {
        return this._nodes.map((n: WorkflowNode) => ({
            id: n.id,
            data: n,
            isSelected: !!(this.selectedNode && this.selectedNode.id === n.id),
            isConnectTarget: this._connectTargetId === n.id,
            isExecuting: this._executingNodeIds.has(n.id),
            isCollapsed: !!n.isCollapsed,
            positionStyle: `left:${n.x}px;top:${n.y}px;height:${getNodeH(n)}px`,
        }));
    }

    get nodesOverlayTransform(): string {
        return this._overlayTransformCss;
    }

    get zoomLabel(): string { return Math.round(this.zoomLevel * 100) + '%'; }

    get propertyPanelClass(): string {
        return 'studio-property-panel' + (this.selectedNode ? ' studio-property-panel--open' : '');
    }

    get selectedNodeIconStyle(): string {
        if (!this.selectedNode) return '';
        const c: string = ICON_COLORS[this.selectedNode.nodeType] || ICON_COLORS.stage;
        return `background:${c};color:#fff`;
    }

    get selectedNodeIcon(): string {
        return this.selectedNode ? (NODE_ICONS[this.selectedNode.nodeType] || '') : '';
    }

    get selectedNodeTypeLabel(): string {
        return this.selectedNode ? (NODE_TYPE_LABELS[this.selectedNode.nodeType] || 'Step') : '';
    }

    get isSelectedRoot(): boolean       { return !!(this.selectedNode && this.selectedNode.nodeType === 'root'); }
    get isSelectedStage(): boolean      { return !!(this.selectedNode && this.selectedNode.nodeType === 'stage'); }
    get isSelectedTransition(): boolean { return !!(this.selectedNode && this.selectedNode.nodeType === 'transition'); }
    get isSelectedDeletable(): boolean  { return !!(this.selectedNode && this.selectedNode.nodeType !== 'root'); }

    get isPopoverMain(): boolean { return this._popoverVisible && this._popoverMode === 'main'; }
    get isPopoverStageList(): boolean { return this._popoverVisible && this._popoverMode === 'stageList'; }

    get popoverStyle(): string {
        return `left:${this._popoverX}px;top:${this._popoverY}px`;
    }

    get popoverStageItems(): Array<{ id: string; label: string }> {
        return this._nodes
            .filter(n => n.nodeType === 'stage' && n.id !== this._popoverSourceId)
            .map(n => ({ id: n.id, label: n.label }));
    }

    get popoverHasNoStages(): boolean {
        return this.popoverStageItems.length === 0;
    }

    /* ===================== Lifecycle ===================== */

    renderedCallback(): void {
        if (this._loadStarted) return;
        this._loadStarted = true;
        this._loadAndRender();
    }

    disconnectedCallback(): void {
        this._svg = null;
    }

    async _loadAndRender(): Promise<void> {
        const container: Element | null = this.template.querySelector('.canvas-svg-container');
        if (!container) return;

        try {
            if (typeof window.d3 === 'undefined') {
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

    _initSampleWorkflow(): void {
        this._nodes = [
            {
                id: 'n1', nodeType: 'root', label: 'Send for Request Submitted',
                lifecycle: 'Research Lifecycle', criteriaFact: 'Research Path',
                entryCriteria: '{\n  "AllTrue": [\n    { "path": "Status", "op": "Equals", "value": "Submitted" },\n    { "path": "Validation", "op": "Equals", "value": "Complete" }\n  ]\n}',
                autostart: true, isActive: true,
                x: 0, y: 0,
            },
            {
                id: 'n2', nodeType: 'stage', label: 'Request Submitted',
                lifecycleState: 'Request Submitted', customLabelApiName: 'GM_Request_Stage_Request_Name',
                activities: [{ name: 'Review Grant Request', iconName: 'standard:work_summary' }],
                allowManualTransition: false, isFinalStage: false,
                x: 0, y: 0,
            },
            {
                id: 'n3', nodeType: 'transition', label: 'Transition to Approved',
                x: 0, y: 0,
            },
            {
                id: 'n4', nodeType: 'transition', label: 'Transition to Declined',
                x: 0, y: 0,
            },
            {
                id: 'n5', nodeType: 'stage', label: 'Request Submission Approved',
                lifecycleState: 'Request Submitted Review', customLabelApiName: 'GM_Request_Stage_Approved',
                activities: [{ name: 'Review Grant Request', iconName: 'standard:work_summary' }],
                allowManualTransition: false, isFinalStage: false,
                x: 0, y: 0,
            },
            {
                id: 'n6', nodeType: 'transition', label: 'Transition to Something',
                x: 0, y: 0,
            },
            {
                id: 'n7', nodeType: 'stage', label: 'Request Submission Declined',
                lifecycleState: 'Request Submitted Review', customLabelApiName: 'GM_Request_Stage_Declined',
                activities: [{ name: 'Notify Applicant', iconName: 'standard:work_summary' }],
                allowManualTransition: false, isFinalStage: true,
                x: 0, y: 0,
            },
            {
                id: 'n8', nodeType: 'stage', label: 'Request Submission Something',
                lifecycleState: 'Request Submitted Review', customLabelApiName: 'GM_Request_Stage_Declined',
                activities: [{ name: 'Notify Applicant', iconName: 'standard:work_summary' }],
                allowManualTransition: false, isFinalStage: true,
                x: 0, y: 0,
            },
        ];
        this._links = [
            { id: 'l1', source: 'n1', target: 'n2' },
            { id: 'l2', source: 'n2', target: 'n3' },
            { id: 'l3', source: 'n2', target: 'n4' },
            { id: 'l4', source: 'n3', target: 'n5' },
            { id: 'l5', source: 'n4', target: 'n7' },
            { id: 'l6', source: 'n5', target: 'n6' },
            { id: 'l7', source: 'n6', target: 'n8' },
        ];
    }

    /* ===================== Auto Layout (Tree, dynamic subtree widths) ===================== */

    _autoLayout(): void {
        const nodeMap: Map<string, WorkflowNode> = new Map(this._nodes.map(n => [n.id, n]));
        const childrenMap: Map<string, string[]> = new Map();
        const hasParent: Set<string> = new Set();

        this._links.forEach((l: WorkflowLink) => {
            if (!childrenMap.has(l.source)) childrenMap.set(l.source, []);
            childrenMap.get(l.source)!.push(l.target);
            hasParent.add(l.target);
        });

        const roots: WorkflowNode[] = this._nodes.filter(n => !hasParent.has(n.id));
        if (roots.length === 0 && this._nodes.length > 0) roots.push(this._nodes[0]);

        const subtreeWidths: Map<string, number> = new Map();
        const visited: Set<string> = new Set();

        const computeWidth = (nodeId: string): number => {
            if (visited.has(nodeId)) return NODE_W;
            visited.add(nodeId);
            /* Filter out back-edge targets (already visited = cycle) so they
               don't inflate the subtree width of the node holding the back-edge. */
            const children: string[] = (childrenMap.get(nodeId) || []).filter(cId => !visited.has(cId));
            if (children.length === 0) {
                subtreeWidths.set(nodeId, NODE_W);
                return NODE_W;
            }
            const childWidths: number[] = children.map(cId => computeWidth(cId));
            const totalChildW: number = childWidths.reduce((sum, w) => sum + w, 0)
                + (children.length - 1) * MIN_SIBLING_GAP_X;
            const width: number = Math.max(NODE_W, totalChildW);
            subtreeWidths.set(nodeId, width);
            return width;
        };

        roots.forEach(r => computeWidth(r.id));
        this._nodes.forEach(n => { if (!visited.has(n.id)) computeWidth(n.id); });

        const layerMaxH: Map<number, number> = new Map();
        const nodeDepth: Map<string, number> = new Map();
        const visitedDepth: Set<string> = new Set();

        const assignDepth = (nodeId: string, depth: number): void => {
            if (visitedDepth.has(nodeId)) return;
            visitedDepth.add(nodeId);
            nodeDepth.set(nodeId, depth);
            const node: WorkflowNode | undefined = nodeMap.get(nodeId);
            if (node) {
                const h: number = getNodeH(node);
                const cur: number = layerMaxH.get(depth) || 0;
                if (h > cur) layerMaxH.set(depth, h);
            }
            const children: string[] = childrenMap.get(nodeId) || [];
            children.forEach(cId => assignDepth(cId, depth + 1));
        };

        roots.forEach(r => assignDepth(r.id, 0));
        this._nodes.forEach(n => { if (!visitedDepth.has(n.id)) assignDepth(n.id, layerMaxH.size); });

        const crossingCount: Map<number, number> = new Map();
        this._links.forEach((l: WorkflowLink) => {
            const srcDepth: number | undefined = nodeDepth.get(l.source);
            const tgtDepth: number | undefined = nodeDepth.get(l.target);
            if (srcDepth === undefined || tgtDepth === undefined) return;
            const minD: number = Math.min(srcDepth, tgtDepth);
            const maxD: number = Math.max(srcDepth, tgtDepth);
            for (let d: number = minD; d < maxD; d++) {
                crossingCount.set(d, (crossingCount.get(d) || 0) + 1);
            }
        });

        const layerY: Map<number, number> = new Map();
        let currentY: number = 200;
        const maxDepth: number = Math.max(...layerMaxH.keys(), 0);
        for (let d: number = 0; d <= maxDepth; d++) {
            layerY.set(d, currentY);
            const crossings: number = crossingCount.get(d) || 0;
            const extraLanes: number = Math.max(0, crossings - 1);
            const dynamicGap: number = BASE_LAYER_GAP + extraLanes * LANE_SPACING;
            currentY += (layerMaxH.get(d) || 240) + dynamicGap;
        }

        const positioned: Set<string> = new Set();

        /* parentBottom is the y of the lowest edge of the chain above this node.
           Unpinned nodes sit at their layer's y, but never above a pinned
           ancestor that was dragged further down. Pinned nodes keep the exact
           position the user dragged them to, and their children fan out from
           that actual centre — so manual drags are respected while everything
           else still fans out and makes room.                                 */
        const positionSubtree = (nodeId: string, centerX: number, parentBottom: number): void => {
            if (positioned.has(nodeId)) return;
            positioned.add(nodeId);
            const node: WorkflowNode | undefined = nodeMap.get(nodeId);
            if (!node) return;

            const depth: number = nodeDepth.get(nodeId) || 0;
            let nodeCenterX: number;
            if (node.pinned) {
                nodeCenterX = node.x + NODE_W / 2;        // keep dragged x/y verbatim
            } else {
                node.y = Math.max(layerY.get(depth) || 200, parentBottom + BASE_LAYER_GAP);
                node.x = centerX - NODE_W / 2;
                nodeCenterX = centerX;
            }
            const nodeBottom: number = node.y + getNodeH(node);

            /* Filter out back-edge targets already placed elsewhere so their
               stored subtreeWidth doesn't skew this node's child layout. */
            const children: string[] = (childrenMap.get(nodeId) || []).filter(cId => !positioned.has(cId));
            if (children.length === 0) return;

            const childWidths: number[] = children.map(cId => subtreeWidths.get(cId) || NODE_W);
            const totalChildW: number = childWidths.reduce((sum, w) => sum + w, 0)
                + (children.length - 1) * MIN_SIBLING_GAP_X;

            /* Fan the children out symmetrically around this node's centre. */
            let childX: number = nodeCenterX - totalChildW / 2;
            children.forEach((cId: string, i: number) => {
                const cw: number = childWidths[i];
                const childCenter: number = childX + cw / 2;
                positionSubtree(cId, childCenter, nodeBottom);
                childX += cw + MIN_SIBLING_GAP_X;
            });
        };

        const rootWidths: number[] = roots.map(r => subtreeWidths.get(r.id) || NODE_W);
        const totalRootW: number = rootWidths.reduce((sum, w) => sum + w, 0)
            + (roots.length > 1 ? (roots.length - 1) * MIN_SIBLING_GAP_X : 0);
        let rootX: number = CANVAS_W / 2 - totalRootW / 2;

        roots.forEach((r: WorkflowNode, i: number) => {
            const rw: number = rootWidths[i];
            positionSubtree(r.id, rootX + rw / 2, -Infinity);
            rootX += rw + MIN_SIBLING_GAP_X;
        });

        this._nodes.forEach(n => {
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
    _classifyLinkSides(src: WorkflowNode, tgt: WorkflowNode): { exitSide: PortSide; entrySide: PortSide } {
        const srcH: number = getNodeH(src);
        const tgtH: number = getNodeH(tgt);
        const srcBottom: number = src.y + srcH;
        const srcTop: number = src.y;
        const tgtTop: number = tgt.y;
        const tgtBottom: number = tgt.y + tgtH;
        const srcCx: number = src.x + NODE_W / 2;
        const tgtCx: number = tgt.x + NODE_W / 2;

        if (tgtTop >= srcBottom + MIN_STUB) {
            return { exitSide: 'bottom', entrySide: 'top' };
        }
        if (tgtBottom <= srcTop + MIN_STUB) {
            /* Back-edge (target above source). Choose each end's side
               independently from the other node's position:
                - exit the source on the side facing the target
                - enter the target on the side facing the source
               Near-aligned columns (within NODE_W/3) can't face each other
               cleanly, so wrap around the left as a same-side loopback.        */
            if (Math.abs(srcCx - tgtCx) <= NODE_W / 3) {
                return { exitSide: 'left', entrySide: 'left' };
            }
            return tgtCx < srcCx
                ? { exitSide: 'left',  entrySide: 'right' }   // target sits to the left
                : { exitSide: 'right', entrySide: 'left'  };  // target sits to the right
        }
        /* Vertical overlap -> attach on the facing sides */
        if (tgtCx >= srcCx) {
            return { exitSide: 'right', entrySide: 'left' };
        }
        return { exitSide: 'left', entrySide: 'right' };
    }

    _computeLinkPorts(): Map<string, LinkPortPositions> {
        const ports: Map<string, LinkPortPositions> = new Map();
        const nodeMap: Map<string, WorkflowNode> = new Map(this._nodes.map(n => [n.id, n]));

        interface Classified {
            link: WorkflowLink;
            src: WorkflowNode;
            tgt: WorkflowNode;
            exitSide: PortSide;
            entrySide: PortSide;
        }

        const classified: Classified[] = [];
        this._links.forEach((link: WorkflowLink) => {
            const src: WorkflowNode | undefined = nodeMap.get(link.source);
            const tgt: WorkflowNode | undefined = nodeMap.get(link.target);
            if (!src || !tgt) return;
            const sides = this._classifyLinkSides(src, tgt);
            classified.push({ link, src, tgt, exitSide: sides.exitSide, entrySide: sides.entrySide });
            ports.set(link.id, {
                exit: { x: 0, y: 0 },
                entry: { x: 0, y: 0 },
                exitSide: sides.exitSide,
                entrySide: sides.entrySide,
                laneIndex: 0,
                laneCount: 1,
            });
        });

        /* Group links by (node, side) so multiple connectors on the same edge
           can be spread out with a comfortable gap instead of stacking.       */
        const outGroups: Map<string, Classified[]> = new Map();
        const inGroups: Map<string, Classified[]> = new Map();
        classified.forEach((c: Classified) => {
            const ok: string = c.link.source + '|' + c.exitSide;
            const ik: string = c.link.target + '|' + c.entrySide;
            if (!outGroups.has(ok)) outGroups.set(ok, []);
            outGroups.get(ok)!.push(c);
            if (!inGroups.has(ik)) inGroups.set(ik, []);
            inGroups.get(ik)!.push(c);
        });

        outGroups.forEach((group: Classified[]) => this._spreadEdgePorts(group, 'exit', nodeMap, ports));
        inGroups.forEach((group: Classified[]) => this._spreadEdgePorts(group, 'entry', nodeMap, ports));

        this._assignLanes(classified, ports);

        return ports;
    }

    /* Distribute a set of connectors evenly along one edge of a node. */
    _spreadEdgePorts(
        group: Array<{ link: WorkflowLink; src: WorkflowNode; tgt: WorkflowNode; exitSide: PortSide; entrySide: PortSide }>,
        which: 'exit' | 'entry',
        nodeMap: Map<string, WorkflowNode>,
        ports: Map<string, LinkPortPositions>
    ): void {
        const first = group[0];
        const node: WorkflowNode = which === 'exit' ? first.src : first.tgt;
        const side: PortSide = which === 'exit' ? first.exitSide : first.entrySide;
        const h: number = getNodeH(node);
        const horizontalEdge: boolean = side === 'top' || side === 'bottom';

        /* Sort connectors by where the OTHER endpoint sits, so lines don't cross */
        const otherCoord = (c: { src: WorkflowNode; tgt: WorkflowNode }): number => {
            const other: WorkflowNode = which === 'exit' ? c.tgt : c.src;
            return horizontalEdge ? (other.x + NODE_W / 2) : (other.y + getNodeH(other) / 2);
        };
        const sorted = [...group].sort((a, b) => otherCoord(a) - otherCoord(b));
        const n: number = sorted.length;

        const setPort = (linkId: string, pt: Pt): void => {
            const p: LinkPortPositions | undefined = ports.get(linkId);
            if (!p) return;
            if (which === 'exit') p.exit = pt; else p.entry = pt;
        };

        if (horizontalEdge) {
            const y: number = side === 'bottom' ? node.y + h : node.y;
            const lo: number = node.x + PORT_EDGE_MARGIN;
            const hi: number = node.x + NODE_W - PORT_EDGE_MARGIN;
            sorted.forEach((c, i) => {
                const x: number = n === 1 ? node.x + NODE_W / 2 : lo + (hi - lo) * (i / (n - 1));
                setPort(c.link.id, { x, y });
            });
        } else {
            const x: number = side === 'right' ? node.x + NODE_W : node.x;
            const lo: number = node.y + SIDE_VERTICAL_OVERLAP;
            const hi: number = node.y + h - SIDE_VERTICAL_OVERLAP;
            sorted.forEach((c, i) => {
                const y: number = (n === 1 || hi <= lo) ? node.y + h / 2 : lo + (hi - lo) * (i / (n - 1));
                setPort(c.link.id, { x, y });
            });
        }
    }

    /* Give every sibling group (connectors sharing the same source bottom
       edge) its own evenly spaced horizontal lane within the inter-layer gap.
       Sort left-to-right by target so lanes are assigned without crossings:
       the leftmost target gets laneIndex 0 (topmost lane) and the rightmost
       gets the bottommost lane.                                               */
    _assignLanes(
        classified: Array<{ link: WorkflowLink; src: WorkflowNode; tgt: WorkflowNode; exitSide: PortSide; entrySide: PortSide }>,
        ports: Map<string, LinkPortPositions>
    ): void {
        /* Collect bottom-exit groups keyed by source node id */
        const srcGroups: Map<string, Array<{ link: WorkflowLink; src: WorkflowNode; tgt: WorkflowNode }>> = new Map();
        classified.forEach((c) => {
            if (c.exitSide !== 'bottom' || c.entrySide !== 'top') return;
            if (!srcGroups.has(c.link.source)) srcGroups.set(c.link.source, []);
            srcGroups.get(c.link.source)!.push({ link: c.link, src: c.src, tgt: c.tgt });
        });

        srcGroups.forEach((group) => {
            if (group.length < 2) return;
            const srcCx: number = group[0].src.x + NODE_W / 2;

            /* Split into connectors going to the LEFT of source centre and
               those going to the RIGHT.  Each group is sorted so the FURTHEST
               target gets laneIndex 0 (topmost lane = shortest vertical stub),
               exactly mirroring the reference JointJS fan pattern on both sides. */
            const leftGrp = group.filter(c => c.tgt.x + NODE_W / 2 <= srcCx);
            const rightGrp = group.filter(c => c.tgt.x + NODE_W / 2 > srcCx);

            /* Left  → ascending (leftmost = furthest = laneIndex 0 = top lane) */
            leftGrp.sort((a, b) => (a.tgt.x + NODE_W / 2) - (b.tgt.x + NODE_W / 2));
            /* Right → descending (rightmost = furthest = laneIndex 0 = top lane) */
            rightGrp.sort((a, b) => (b.tgt.x + NODE_W / 2) - (a.tgt.x + NODE_W / 2));

            [leftGrp, rightGrp].forEach((grp) => {
                const n: number = grp.length;
                grp.forEach((item, i: number) => {
                    const p: LinkPortPositions | undefined = ports.get(item.link.id);
                    if (p) { p.laneIndex = i; p.laneCount = n; }
                });
            });
        });
    }

    /* ===================== Link Geometry & Routing ===================== */

    _buildNodeBoxes(): NodeBox[] {
        return this._nodes.map((n: WorkflowNode) => ({
            id: n.id, x: n.x, y: n.y, w: NODE_W, h: getNodeH(n),
        }));
    }

    _segIntersectsRect(
        x0: number, y0: number, x1: number, y1: number,
        rx: number, ry: number, rw: number, rh: number
    ): boolean {
        let t0: number = 0;
        let t1: number = 1;
        const dx: number = x1 - x0;
        const dy: number = y1 - y0;
        const p: number[] = [-dx, dx, -dy, dy];
        const q: number[] = [x0 - rx, (rx + rw) - x0, y0 - ry, (ry + rh) - y0];
        for (let i: number = 0; i < 4; i++) {
            if (p[i] === 0) {
                if (q[i] < 0) return false;
            } else {
                const t: number = q[i] / p[i];
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

    _polylineClear(points: Pt[], boxes: NodeBox[], excludeIds: Set<string>): boolean {
        for (let s: number = 0; s < points.length - 1; s++) {
            const a: Pt = points[s];
            const b: Pt = points[s + 1];
            for (let k: number = 0; k < boxes.length; k++) {
                const box: NodeBox = boxes[k];
                if (excludeIds.has(box.id)) continue;
                if (this._segIntersectsRect(
                    a.x, a.y, b.x, b.y,
                    box.x - NODE_CLEAR, box.y - NODE_CLEAR,
                    box.w + NODE_CLEAR * 2, box.h + NODE_CLEAR * 2
                )) {
                    return false;
                }
            }
        }
        return true;
    }

    /* Find all Y-axis gaps (free horizontal bands) in [yLo, yHi] that are
       not occupied by any obstacle whose x-range overlaps [xLo, xHi].      */
    _findFreeGaps(
        xLo: number, xHi: number,
        yLo: number, yHi: number,
        boxes: NodeBox[], excludeIds: Set<string>
    ): Array<[number, number]> {
        const occupied: Array<[number, number]> = [];
        const pad: number = NODE_CLEAR;
        boxes.forEach((box: NodeBox) => {
            if (excludeIds.has(box.id)) return;
            const bxLo: number = box.x - pad;
            const bxHi: number = box.x + box.w + pad;
            if (bxHi <= xLo || bxLo >= xHi) return;
            const byLo: number = box.y - pad;
            const byHi: number = box.y + box.h + pad;
            if (byHi <= yLo || byLo >= yHi) return;
            occupied.push([Math.max(byLo, yLo), Math.min(byHi, yHi)]);
        });
        occupied.sort((a, b) => a[0] - b[0]);

        const gaps: Array<[number, number]> = [];
        let cursor: number = yLo;
        occupied.forEach(([lo, hi]) => {
            if (lo > cursor + 1) gaps.push([cursor, lo]);
            cursor = Math.max(cursor, hi);
        });
        if (cursor < yHi - 1) gaps.push([cursor, yHi]);
        return gaps;
    }

    /* Same as _findFreeGaps but along the X axis: free vertical bands in
       [xLo, xHi] not blocked by obstacles whose y-range overlaps [yLo, yHi].  */
    _findFreeGapsX(
        yLo: number, yHi: number,
        xLo: number, xHi: number,
        boxes: NodeBox[], excludeIds: Set<string>
    ): Array<[number, number]> {
        const occupied: Array<[number, number]> = [];
        const pad: number = NODE_CLEAR;
        boxes.forEach((box: NodeBox) => {
            if (excludeIds.has(box.id)) return;
            const byLo: number = box.y - pad;
            const byHi: number = box.y + box.h + pad;
            if (byHi <= yLo || byLo >= yHi) return;
            const bxLo: number = box.x - pad;
            const bxHi: number = box.x + box.w + pad;
            if (bxHi <= xLo || bxLo >= xHi) return;
            occupied.push([Math.max(bxLo, xLo), Math.min(bxHi, xHi)]);
        });
        occupied.sort((a, b) => a[0] - b[0]);

        const gaps: Array<[number, number]> = [];
        let cursor: number = xLo;
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
    _forwardPolyline(
        x1: number, y1: number, x2: number, y2: number,
        laneIndex: number, laneCount: number,
        boxes: NodeBox[], excludeIds: Set<string>
    ): Pt[] {
        const stubTop: number = y1 + LANE_INSET;
        const stubBot: number = y2 - LANE_INSET;

        /* Degenerate: nodes too close vertically */
        if (stubBot <= stubTop) {
            const mid: number = (y1 + y2) / 2;
            return [{ x: x1, y: y1 }, { x: x1, y: mid }, { x: x2, y: mid }, { x: x2, y: y2 }];
        }

        /* Nearly-vertical single connector: direct line or minimal bend */
        if (Math.abs(x1 - x2) < 2 && laneCount <= 1) {
            const direct: Pt[] = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
            if (this._polylineClear(direct, boxes, excludeIds)) return direct;
        }

        /* Compute the preferred midY for this lane.
           For sibling groups (laneCount > 1) divide the usable band into
           laneCount+1 equal slots — leftmost target → top slot, rightmost
           target → bottom slot — so the horizontal elbows never cross.       */
        let preferred: number;
        if (laneCount > 1) {
            const t: number = (laneIndex + 1) / (laneCount + 1);
            preferred = stubTop + (stubBot - stubTop) * t;
        } else {
            preferred = (stubTop + stubBot) / 2;
        }

        /* Find the free horizontal gap closest to the preferred midY          */
        const xLo: number = Math.min(x1, x2) - NODE_CLEAR;
        const xHi: number = Math.max(x1, x2) + NODE_CLEAR;
        const gaps: Array<[number, number]> = this._findFreeGaps(xLo, xHi, stubTop, stubBot, boxes, excludeIds);

        const sortedGaps: Array<[number, number]> = [...gaps].sort((a, b) => {
            const ma: number = (a[0] + a[1]) / 2;
            const mb: number = (b[0] + b[1]) / 2;
            return Math.abs(ma - preferred) - Math.abs(mb - preferred);
        });

        for (const [gapLo, gapHi] of sortedGaps) {
            const midY: number = Math.max(gapLo + 1, Math.min(gapHi - 1, preferred));
            const pts: Pt[] = [
                { x: x1, y: y1 }, { x: x1, y: midY }, { x: x2, y: midY }, { x: x2, y: y2 },
            ];
            if (this._polylineClear(pts, boxes, excludeIds)) return pts;
        }

        return this._sideChannelPolyline(x1, y1, x2, y2, boxes, excludeIds);
    }

    _sideChannelPolyline(
        x1: number, y1: number, x2: number, y2: number,
        boxes: NodeBox[], excludeIds: Set<string>
    ): Pt[] {
        const yLo: number = Math.min(y1, y2);
        const yHi: number = Math.max(y1, y2);

        /* Compute the total x-extent of all obstacles in the y-band */
        let leftEdge: number = Math.min(x1, x2);
        let rightEdge: number = Math.max(x1, x2);
        boxes.forEach((box: NodeBox) => {
            if (excludeIds.has(box.id)) return;
            if (box.y + box.h < yLo || box.y > yHi) return;
            leftEdge = Math.min(leftEdge, box.x);
            rightEdge = Math.max(rightEdge, box.x + box.w);
        });

        const channelL: number = leftEdge - CHANNEL_MARGIN;
        const channelR: number = rightEdge + CHANNEL_MARGIN;

        const yDown: number = y1 + MIN_STUB;
        const yUp: number = y2 - MIN_STUB;

        /* Prefer the channel closer to x2 for a shorter horizontal run */
        const channels: number[] = Math.abs(channelR - x2) <= Math.abs(channelL - x2)
            ? [channelR, channelL]
            : [channelL, channelR];

        for (const cx of channels) {
            const pts: Pt[] = [
                { x: x1, y: y1 },
                { x: x1, y: yDown },
                { x: cx, y: yDown },
                { x: cx, y: yUp },
                { x: x2, y: yUp },
                { x: x2, y: y2 },
            ];
            if (this._polylineClear(pts, boxes, excludeIds)) return pts;

            /* Widen the channel incrementally if still blocked */
            for (let extra: number = CHANNEL_MARGIN; extra <= CHANNEL_MARGIN * 4; extra += CHANNEL_MARGIN) {
                const cxWide: number = cx > x2 ? channelR + extra : channelL - extra;
                const ptsWide: Pt[] = [
                    { x: x1, y: y1 },
                    { x: x1, y: yDown },
                    { x: cxWide, y: yDown },
                    { x: cxWide, y: yUp },
                    { x: x2, y: yUp },
                    { x: x2, y: y2 },
                ];
                if (this._polylineClear(ptsWide, boxes, excludeIds)) return ptsWide;
            }
        }

        /* Absolute last resort: direct orthogonal with no collision check */
        const mid: number = (y1 + y2) / 2;
        return [{ x: x1, y: y1 }, { x: x1, y: mid }, { x: x2, y: mid }, { x: x2, y: y2 }];
    }

    /* Back-edge arc (fallback when A* can't run): wrap around the OUTSIDE of the
       whole obstacle field on the requested side rather than hugging a fixed
       channel next to the source. We scan every node overlapping the vertical
       span the loop must travel and push the channel past the extreme edge, so
       the connector routes through open space instead of cutting between cards. */
    _loopbackPolyline(
        exit: Pt, entry: Pt, boxes: NodeBox[], excludeIds: Set<string>,
        side: 'left' | 'right' = 'right'
    ): Pt[] {
        const yLo: number = Math.min(exit.y, entry.y);
        const yHi: number = Math.max(exit.y, entry.y);

        /* Find the furthest obstacle edge on this side within the y-span. */
        let extreme: number = side === 'left'
            ? Math.min(exit.x, entry.x)
            : Math.max(exit.x, entry.x);
        boxes.forEach((b: NodeBox) => {
            if (excludeIds.has(b.id)) return;
            if (b.y + b.h < yLo || b.y > yHi) return;           // outside the travelled span
            extreme = side === 'left'
                ? Math.min(extreme, b.x)
                : Math.max(extreme, b.x + b.w);
        });

        const channel: number = side === 'left'
            ? extreme - CHANNEL_MARGIN
            : extreme + CHANNEL_MARGIN;

        /* exit → out to the channel → vertical run clear of the field → into entry. */
        return [
            { x: exit.x,  y: exit.y  },
            { x: channel, y: exit.y  },
            { x: channel, y: entry.y },
            { x: entry.x, y: entry.y },
        ];
    }

    /* Horizontal route between two facing side ports (target beside source).
       Finds a clear vertical lane (X channel) between the two nodes.          */
    _sidewaysPolyline(
        exit: Pt, exitSide: PortSide, entry: Pt, entrySide: PortSide,
        laneIndex: number, laneCount: number, boxes: NodeBox[], excludeIds: Set<string>
    ): Pt[] {
        if (Math.abs(exit.y - entry.y) < 2) {
            const direct: Pt[] = [{ x: exit.x, y: exit.y }, { x: entry.x, y: entry.y }];
            if (this._polylineClear(direct, boxes, excludeIds)) return direct;
        }

        const exitStub: number = exit.x + (exitSide === 'right' ? LANE_INSET : -LANE_INSET);
        const entryStub: number = entry.x + (entrySide === 'right' ? LANE_INSET : -LANE_INSET);
        const xLo: number = Math.min(exitStub, entryStub);
        const xHi: number = Math.max(exitStub, entryStub);
        const yLo: number = Math.min(exit.y, entry.y) - NODE_CLEAR;
        const yHi: number = Math.max(exit.y, entry.y) + NODE_CLEAR;

        const gaps: Array<[number, number]> = this._findFreeGapsX(yLo, yHi, xLo, xHi, boxes, excludeIds);
        let preferred: number;
        if (laneCount > 1) {
            const t: number = (laneIndex + 1) / (laneCount + 1);
            preferred = xLo + (xHi - xLo) * t;
        } else {
            preferred = (xLo + xHi) / 2;
        }
        const sorted: Array<[number, number]> = [...gaps].sort((a, b) => {
            const ma: number = (a[0] + a[1]) / 2;
            const mb: number = (b[0] + b[1]) / 2;
            return Math.abs(ma - preferred) - Math.abs(mb - preferred);
        });

        for (const [gLo, gHi] of sorted) {
            const midX: number = Math.max(gLo + 1, Math.min(gHi - 1, preferred));
            const pts: Pt[] = [
                { x: exit.x, y: exit.y },
                { x: midX,   y: exit.y },
                { x: midX,   y: entry.y },
                { x: entry.x, y: entry.y },
            ];
            if (this._polylineClear(pts, boxes, excludeIds)) return pts;
        }

        const midX: number = (xLo + xHi) / 2;
        return [
            { x: exit.x, y: exit.y },
            { x: midX,   y: exit.y },
            { x: midX,   y: entry.y },
            { x: entry.x, y: entry.y },
        ];
    }

    /* Adapter: map this component's port/box types onto the standalone A*
       router. The source exits along its side's outward normal; the target is
       entered along its side's outward normal. Boxes for the two endpoints are
       excluded so the wire is allowed to touch its own nodes.                  */
    _routeAStar(
        exit: Pt, exitSide: PortSide, entry: Pt, entrySide: PortSide,
        boxes: NodeBox[], excludeIds: Set<string>
    ): Pt[] | null {
        const SIDE_DIR: Record<PortSide, RouteDir> = {
            top: 'up', bottom: 'down', left: 'left', right: 'right',
        };
        const obstacles: RouteObstacle[] = boxes
            .filter((b: NodeBox) => !excludeIds.has(b.id))
            .map((b: NodeBox) => ({ x: b.x, y: b.y, width: b.w, height: b.h }));
        try {
            return routeOrthogonal(
                { x: exit.x,  y: exit.y,  dir: SIDE_DIR[exitSide] },
                { x: entry.x, y: entry.y, dir: SIDE_DIR[entrySide] },
                obstacles
            );
        } catch {
            return null;
        }
    }

    _computeLinkGeometry(
        src: WorkflowNode, tgt: WorkflowNode, portPos: LinkPortPositions | undefined, boxes: NodeBox[]
    ): LinkGeometry {
        const exit: Pt = portPos ? portPos.exit : { x: src.x + NODE_W / 2, y: src.y + getNodeH(src) };
        const entry: Pt = portPos ? portPos.entry : { x: tgt.x + NODE_W / 2, y: tgt.y };
        const exitSide: PortSide = portPos ? portPos.exitSide : 'bottom';
        const entrySide: PortSide = portPos ? portPos.entrySide : 'top';
        const laneIndex: number = portPos ? portPos.laneIndex : 0;
        const laneCount: number = portPos ? portPos.laneCount : 1;

        const excludeIds: Set<string> = new Set([src.id, tgt.id]);

        let points: Pt[];
        /* A cycle (back-edge) is any link whose target sits at/above its source
           — used purely for styling, independent of how it gets routed.        */
        const isLoopback: boolean = tgt.y + getNodeH(tgt) <= src.y + MIN_STUB;

        if (exitSide === 'bottom' && entrySide === 'top') {
            /* Standard downward tree edge: keep the lane-aware forward router so
               sibling connectors stay evenly fanned out.                       */
            points = this._forwardPolyline(exit.x, exit.y, entry.x, entry.y, laneIndex, laneCount, boxes, excludeIds);
        } else {
            /* Everything else (back-edges, side joins, obstacle-laden routes) is
               handled by the A* orthogonal router, which avoids node cores and
               their padding bands. Fall back to the hand-rolled routines if A*
               can't find a path or the grid is too dense.                      */
            const aStar: Pt[] | null = this._routeAStar(exit, exitSide, entry, entrySide, boxes, excludeIds);
            if (aStar && aStar.length >= 2) {
                points = aStar;
            } else if ((exitSide === 'right' && entrySide === 'right') || (exitSide === 'left' && entrySide === 'left')) {
                const classifiedSide: 'left' | 'right' = exitSide as 'left' | 'right';
                const srcCx: number = src.x + NODE_W / 2;
                const tgtCx: number = tgt.x + NODE_W / 2;
                if (Math.abs(srcCx - tgtCx) <= NODE_W / 3) {
                    const lExit: Pt  = { x: src.x, y: exit.y };
                    const lEntry: Pt = { x: tgt.x, y: entry.y };
                    points = this._loopbackPolyline(lExit, lEntry, boxes, excludeIds, 'left');
                } else {
                    points = this._loopbackPolyline(exit, entry, boxes, excludeIds, classifiedSide);
                }
            } else {
                points = this._sidewaysPolyline(exit, exitSide, entry, entrySide, laneIndex, laneCount, boxes, excludeIds);
            }
        }

        /* Label: prefer the longest horizontal segment; fall back to longest
           vertical segment if the route is mostly vertical.                   */
        let bestH: number = -1;
        let bestV: number = -1;
        let labelX: number = (exit.x + entry.x) / 2;
        let labelY: number = (exit.y + entry.y) / 2;
        for (let s: number = 0; s < points.length - 1; s++) {
            const a: Pt = points[s];
            const b: Pt = points[s + 1];
            if (Math.abs(a.y - b.y) < 0.5) {
                const len: number = Math.abs(b.x - a.x);
                if (len > bestH) { bestH = len; labelX = (a.x + b.x) / 2; labelY = a.y; }
            } else if (bestH < 0) {
                const len: number = Math.abs(b.y - a.y);
                if (len > bestV) { bestV = len; labelX = a.x; labelY = (a.y + b.y) / 2; }
            }
        }

        return {
            points,
            hops: points.slice(0, -1).map(() => [] as number[]),
            isLoopback,
            labelX,
            labelY,
        };
    }

    /* ===================== Line Jumps (later link arches over earlier) ===================== */

    _assignLineJumps(geoms: Array<{ link: WorkflowLink; geo: LinkGeometry }>): void {
        const EPS: number = 1.5;
        for (let j: number = 0; j < geoms.length; j++) {
            const gj: LinkGeometry = geoms[j].geo;
            for (let sj: number = 0; sj < gj.points.length - 1; sj++) {
                const aj: Pt = gj.points[sj];
                const bj: Pt = gj.points[sj + 1];
                const jHoriz: boolean = Math.abs(aj.y - bj.y) < 0.5;
                for (let i: number = 0; i < j; i++) {
                    const gi: LinkGeometry = geoms[i].geo;
                    for (let si: number = 0; si < gi.points.length - 1; si++) {
                        const ai: Pt = gi.points[si];
                        const bi: Pt = gi.points[si + 1];
                        const iHoriz: boolean = Math.abs(ai.y - bi.y) < 0.5;
                        if (jHoriz === iHoriz) continue;

                        if (jHoriz) {
                            const y: number = aj.y;
                            const vx: number = ai.x;
                            const hxMin: number = Math.min(aj.x, bj.x);
                            const hxMax: number = Math.max(aj.x, bj.x);
                            const vyMin: number = Math.min(ai.y, bi.y);
                            const vyMax: number = Math.max(ai.y, bi.y);
                            if (vx > hxMin + EPS && vx < hxMax - EPS && y > vyMin + EPS && y < vyMax - EPS) {
                                gj.hops[sj].push(vx);
                            }
                        } else {
                            const x: number = aj.x;
                            const hy: number = ai.y;
                            const vyMin: number = Math.min(aj.y, bj.y);
                            const vyMax: number = Math.max(aj.y, bj.y);
                            const hxMin: number = Math.min(ai.x, bi.x);
                            const hxMax: number = Math.max(ai.x, bi.x);
                            if (x > hxMin + EPS && x < hxMax - EPS && hy > vyMin + EPS && hy < vyMax - EPS) {
                                gj.hops[sj].push(hy);
                            }
                        }
                    }
                }
            }
        }
    }

    _buildOrthPath(points: Pt[], hops: number[][]): string {
        if (points.length < 2) return '';
        const dist = (a: Pt, b: Pt): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

        if (points.length === 2) {
            return `M${points[0].x},${points[0].y} ` + this._lineWithHops(points[0], points[1], hops[0] || []);
        }

        let d: string = `M${points[0].x},${points[0].y}`;
        let prev: Pt = points[0];

        for (let i: number = 1; i < points.length; i++) {
            const v: Pt = points[i];
            const a: Pt = points[i - 1];
            if (i < points.length - 1) {
                const w: Pt = points[i + 1];
                const r: number = Math.min(CORNER_RADIUS, dist(a, v) / 2, dist(v, w) / 2);
                const inDir: Pt = { x: Math.sign(v.x - a.x), y: Math.sign(v.y - a.y) };
                const outDir: Pt = { x: Math.sign(w.x - v.x), y: Math.sign(w.y - v.y) };
                const lineEnd: Pt = { x: v.x - r * inDir.x, y: v.y - r * inDir.y };
                d += ' ' + this._lineWithHops(prev, lineEnd, hops[i - 1] || []);
                const cpAfter: Pt = { x: v.x + r * outDir.x, y: v.y + r * outDir.y };
                d += ` Q${v.x},${v.y} ${cpAfter.x},${cpAfter.y}`;
                prev = cpAfter;
            } else {
                d += ' ' + this._lineWithHops(prev, v, hops[i - 1] || []);
            }
        }
        return d;
    }

    _lineWithHops(from: Pt, to: Pt, scalars: number[]): string {
        if (!scalars || scalars.length === 0) {
            return `L${to.x},${to.y}`;
        }
        const hopR: number = HOP_RADIUS;
        const horizontal: boolean = Math.abs(from.y - to.y) < 0.5;
        const parts: string[] = [];

        const fixed: number = horizontal ? from.y : from.x;
        const start: number = horizontal ? from.x : from.y;
        const end: number = horizontal ? to.x : to.y;
        const dir: number = end >= start ? 1 : -1;
        const lo: number = Math.min(start, end) + hopR;
        const hi: number = Math.max(start, end) - hopR;

        const valid: number[] = scalars
            .filter((s: number) => s > lo && s < hi)
            .sort((p: number, q: number) => (dir > 0 ? p - q : q - p));
        const merged: number[] = [];
        valid.forEach((s: number) => {
            if (!merged.length || Math.abs(s - merged[merged.length - 1]) > hopR * 2 + 2) merged.push(s);
        });

        const sweep: number = dir > 0 ? 1 : 0;
        merged.forEach((h: number) => {
            if (horizontal) {
                parts.push(`L${h - hopR * dir},${fixed}`);
                parts.push(`A${hopR},${hopR} 0 0,${sweep} ${h + hopR * dir},${fixed}`);
            } else {
                parts.push(`L${fixed},${h - hopR * dir}`);
                parts.push(`A${hopR},${hopR} 0 0,${sweep} ${fixed},${h + hopR * dir}`);
            }
        });
        parts.push(`L${to.x},${to.y}`);
        return parts.join(' ');
    }

    /* ===================== Canvas Init ===================== */

    _initCanvas(container: Element): void {
        const d3: D3Static = this._d3!;

        while (container.firstChild) container.removeChild(container.firstChild);

        const svg: D3Selection = d3.select(container as unknown as Element)
            .append('svg')
            .attr('class', 'workflow-canvas')
            .attr('width', '100%')
            .attr('height', '100%');

        const defs: D3Selection = svg.append('defs');

        /* Arrow (target end) and dot (source end) for every connector. Both use
           `context-stroke` so the marker always matches its line's colour.      */
        defs.append('marker')
            .attr('id', 'mas-arrow')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 9).attr('refY', 5)
            .attr('markerUnits', 'userSpaceOnUse')
            .attr('markerWidth', 11).attr('markerHeight', 11)
            .attr('orient', 'auto-start-reverse')
            .append('path').attr('d', 'M1,2 L9,5 L1,8 Z').attr('fill', 'context-stroke');

        defs.append('marker')
            .attr('id', 'mas-dot')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 5).attr('refY', 5)
            .attr('markerUnits', 'userSpaceOnUse')
            .attr('markerWidth', 8).attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('circle').attr('cx', 5).attr('cy', 5).attr('r', 3.2).attr('fill', 'context-stroke');

        defs.append('marker')
            .attr('id', 'mas-arrow-active')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 10).attr('refY', 5)
            .attr('markerWidth', 8).attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,2 L8,5 L0,8 Z').attr('fill', '#4bca81');

        defs.append('marker')
            .attr('id', 'mas-arrow-drag')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 10).attr('refY', 5)
            .attr('markerWidth', 10).attr('markerHeight', 10)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,1 L9,5 L0,9 Z').attr('fill', ACCENT_BLUE);

        const gridPattern: D3Selection = defs.append('pattern')
            .attr('id', 'mas-grid')
            .attr('width', GRID_SIZE).attr('height', GRID_SIZE)
            .attr('patternUnits', 'userSpaceOnUse');
        gridPattern.append('path')
            .attr('d', `M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`)
            .attr('fill', 'none')
            .attr('stroke', '#e8e8e8')
            .attr('stroke-width', 0.5);

        const zoomGroup: D3Selection = svg.append('g').attr('class', 'zoom-group');

        zoomGroup.append('rect')
            .attr('class', 'canvas-bg')
            .attr('width', CANVAS_W).attr('height', CANVAS_H)
            .attr('fill', 'url(#mas-grid)');

        zoomGroup.append('g').attr('class', 'links-layer');
        zoomGroup.append('g').attr('class', 'temp-link-layer');

        const zoom: D3ZoomBehavior = d3.zoom()
            .scaleExtent([0.1, 3])
            .on('zoom', (event: D3ZoomEvent) => {
                zoomGroup.attr('transform', event.transform as unknown as string);
                this._currentTransform = event.transform;
                this.zoomLevel = event.transform.k;
                this._syncOverlayTransform(event.transform);
                this._updateMinimap();
            });

        svg.call(zoom);
        svg.on('click', () => {
            this._selectNode(null);
        });

        this._svg = svg;
        this._zoomGroup = zoomGroup;
        this._zoomBehavior = zoom;
        this._currentTransform = d3.zoomIdentity;
        this._syncOverlayTransform(d3.zoomIdentity);
    }

    _syncOverlayTransform(t: D3ZoomIdentity): void {
        this._overlayTransformCss = `transform:translate(${t.x}px,${t.y}px) scale(${t.k});transform-origin:0 0`;
    }

    /* ===================== Link Rendering (SVG only) ===================== */

    /* Identify links that are genuine cycles (back-edges): an edge whose target
       is an ancestor of its source in the workflow graph. Driven by topology,
       NOT geometry, so a forward edge never looks like a cycle just because a
       node was dragged to sit physically above its neighbour.                 */
    _computeBackEdges(): Set<string> {
        const childLinks: Map<string, WorkflowLink[]> = new Map();
        const hasParent: Set<string> = new Set();
        this._links.forEach((l: WorkflowLink) => {
            if (!childLinks.has(l.source)) childLinks.set(l.source, []);
            childLinks.get(l.source)!.push(l);
            hasParent.add(l.target);
        });
        const roots: WorkflowNode[] = this._nodes.filter(n => !hasParent.has(n.id));
        if (roots.length === 0 && this._nodes.length > 0) roots.push(this._nodes[0]);

        const backEdges: Set<string> = new Set();
        const onStack: Set<string> = new Set();
        const done: Set<string> = new Set();

        const dfs = (nodeId: string): void => {
            onStack.add(nodeId);
            for (const link of (childLinks.get(nodeId) || [])) {
                if (onStack.has(link.target)) {
                    backEdges.add(link.id);          // points back to an ancestor → cycle
                } else if (!done.has(link.target)) {
                    dfs(link.target);
                }
            }
            onStack.delete(nodeId);
            done.add(nodeId);
        };
        roots.forEach(r => { if (!done.has(r.id)) dfs(r.id); });
        this._nodes.forEach(n => { if (!done.has(n.id)) dfs(n.id); });  // disconnected nodes
        return backEdges;
    }

    _renderLinks(): void {
        const d3: D3Static = this._d3!;
        if (!this._zoomGroup) return;

        const self = this;
        const nodeMap: Map<string, WorkflowNode> = new Map(this._nodes.map(n => [n.id, n]));
        const linkPorts: Map<string, LinkPortPositions> = this._computeLinkPorts();
        const boxes: NodeBox[] = this._buildNodeBoxes();
        const backEdges: Set<string> = this._computeBackEdges();

        const geoms: Array<{ link: WorkflowLink; geo: LinkGeometry }> = [];
        this._links.forEach((link: WorkflowLink) => {
            const src: WorkflowNode | undefined = nodeMap.get(link.source);
            const tgt: WorkflowNode | undefined = nodeMap.get(link.target);
            if (!src || !tgt) return;
            geoms.push({ link, geo: this._computeLinkGeometry(src, tgt, linkPorts.get(link.id), boxes) });
        });

        this._assignLineJumps(geoms);
        const geoById: Map<string, LinkGeometry> = new Map(geoms.map(g => [g.link.id, g.geo]));

        const linksLayer: D3Selection = this._zoomGroup.select('.links-layer');
        linksLayer.selectAll('*').remove();

        const linkGroups: D3Selection = linksLayer.selectAll('.mas-link-group')
            .data(this._links as unknown[], (d: unknown) => (d as WorkflowLink).id)
            .join('g')
            .attr('class', 'mas-link-group');

        linkGroups.each(function(this: SVGElement, d: unknown) {
            const link = d as WorkflowLink;
            const g: D3Selection = d3.select(this);
            const geo: LinkGeometry | undefined = geoById.get(link.id);
            if (!geo) return;

            const dStr: string = self._buildOrthPath(geo.points, geo.hops);

            /* Back-edge (cycle) and "connect to existing stage" links share one
               look (amber, dashed) — both join to an already-placed stage.
               Cycle detection is topological (backEdges), not geometric, so
               dragging a node higher never re-styles a normal edge as a cycle.
               Every connector gets a dot at the source end and an arrow at the
               target end.                                                      */
            const special: boolean = backEdges.has(link.id) || !!link.toExistingStage;

            g.append('path')
                .attr('class', 'mas-link' + (special ? ' mas-link--special' : ''))
                .attr('d', dStr)
                .attr('fill', 'none')
                .attr('stroke', special ? '#d29922' : LINK_COLOR)
                .attr('stroke-width', special ? 2 : 2.5)
                .attr('stroke-linecap', 'round')
                .attr('stroke-linejoin', 'round')
                .attr('marker-start', 'url(#mas-dot)')
                .attr('marker-end', 'url(#mas-arrow)');

            if (special) {
                g.select('.mas-link').attr('stroke-dasharray', '6 4');
            }

            if (link.label) {
                const offsetX: number = link.label === 'Yes' ? -28 : 28;
                const lx: number = geo.labelX + (special ? 10 : offsetX);
                const ly: number = geo.labelY;

                g.append('rect')
                    .attr('x', lx - 18)
                    .attr('y', ly - 12)
                    .attr('width', 36).attr('height', 22)
                    .attr('rx', 11).attr('ry', 11)
                    .attr('fill', link.label === 'Yes' ? '#e6f4ea' : '#fef0ef')
                    .attr('stroke', link.label === 'Yes' ? '#4bca81' : '#f85149')
                    .attr('stroke-width', 1);

                g.append('text')
                    .attr('x', lx)
                    .attr('y', ly + 1)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'central')
                    .attr('font-size', 11)
                    .attr('font-weight', 500)
                    .attr('fill', link.label === 'Yes' ? '#137333' : '#c5221f')
                    .text(link.label);
            }
        });

        this._updateMinimap();
    }

    /* ===================== Node Selection ===================== */

    _selectNode(node: WorkflowNode | null): void {
        this.selectedNode = node ? { ...node } : null;
    }

    /* ===================== Node Events from Child Component ===================== */

    handleNodeClick(event: Event): void {
        event.stopPropagation();
        const target = event.currentTarget as HTMLElement;
        const nodeId: string | undefined = target.dataset.nodeId;
        if (!nodeId) return;
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === nodeId);
        if (node) this._selectNode(node);
    }

    handleNodeSelectEvent(event: CustomEvent): void {
        const nodeId: string = event.detail.nodeId;
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === nodeId);
        if (node) this._selectNode(node);
    }

    handleNodeDeleteEvent(event: CustomEvent): void {
        const nodeId: string = event.detail.nodeId;
        if (nodeId) this._deleteNode(nodeId);
    }

    handleNodeCollapseEvent(event: CustomEvent): void {
        const nodeId: string = event.detail.nodeId;
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === nodeId);
        if (!node) return;
        node.isCollapsed = !node.isCollapsed;
        this._nodes = [...this._nodes];
        this._autoLayout();
        this._renderLinks();
    }

    handlePortDragStartEvent(event: CustomEvent): void {
        const { nodeId, clientX, clientY } = event.detail;
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === nodeId);
        if (!node) return;
        this._beginPortDrag({ clientX, clientY } as MouseEvent, node);
    }

    handleNodeDragStartEvent(event: CustomEvent): void {
        const { nodeId, clientX, clientY } = event.detail;
        if (nodeId) this._beginNodeDrag(nodeId, clientX, clientY);
    }

    /* ===================== Node Dragging (move) ===================== */

    /* Free-move a node by following the pointer. Client deltas are divided by
       the current zoom scale to convert screen pixels to canvas units. The drag
       only "engages" past a small threshold so a plain click still selects, and
       undo state is captured once, when the move actually begins.             */
    _beginNodeDrag(nodeId: string, clientX: number, clientY: number): void {
        const self = this;
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === nodeId);
        if (!node) return;

        const startNodeX: number = node.x;
        const startNodeY: number = node.y;
        const startClientX: number = clientX;
        const startClientY: number = clientY;
        let moved: boolean = false;
        let rafId: number = 0;
        let lastClientX: number = clientX;
        let lastClientY: number = clientY;

        const updateFrame = (): void => {
            rafId = 0;
            const k: number = (self._currentTransform ? self._currentTransform.k : 1) || 1;
            node.x = startNodeX + (lastClientX - startClientX) / k;
            node.y = startNodeY + (lastClientY - startClientY) / k;
            self._nodes = [...self._nodes];   // reactive re-position of the card
            self._renderLinks();              // reroute connectors to the new spot
        };

        const onMouseMove = (e: MouseEvent): void => {
            e.preventDefault();
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            if (!moved) {
                if (Math.abs(e.clientX - startClientX) + Math.abs(e.clientY - startClientY) < 4) return;
                moved = true;
                self._pushUndo();
                node.pinned = true;   // manual position — auto-layout will respect it
            }
            if (!rafId) {
                // eslint-disable-next-line @lwc/lwc/no-async-operation -- throttle node drag redraws
                rafId = requestAnimationFrame(updateFrame);
            }
        };

        const onMouseUp = (): void => {
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('mouseup', onMouseUp, true);
            if (rafId) cancelAnimationFrame(rafId);
            if (moved) {
                self._nodes = [...self._nodes];
                self._renderLinks();
            }
        };

        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseup', onMouseUp, true);
    }

    /* ===================== Delete Node ===================== */

    _deleteNode(nodeId: string): void {
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === nodeId);
        if (!node || node.nodeType === 'root') return;

        this._pushUndo();

        if (node.nodeType === 'stage') {
            const attachedTransitionIds: string[] = [];
            this._links.forEach(l => {
                const otherId: string = l.source === nodeId ? l.target : (l.target === nodeId ? l.source : '');
                if (!otherId) return;
                const other: WorkflowNode | undefined = this._nodes.find(n => n.id === otherId);
                if (other && other.nodeType === 'transition') {
                    attachedTransitionIds.push(other.id);
                }
            });
            const removeIds: Set<string> = new Set([nodeId, ...attachedTransitionIds]);
            this._links = this._links.filter(l => !removeIds.has(l.source) && !removeIds.has(l.target));
            this._nodes = this._nodes.filter(n => !removeIds.has(n.id));
        } else {
            /* Transition deleted: remove it and all its connections — no bridging. */
            this._links = this._links.filter(l => l.source !== nodeId && l.target !== nodeId);
            this._nodes = this._nodes.filter(n => n.id !== nodeId);
        }

        if (this.selectedNode && this.selectedNode.id === nodeId) {
            this.selectedNode = null;
        }
        this._autoLayout();
        this._renderLinks();
    }

    /* ===================== Connection Dragging ===================== */

    _beginPortDrag(mousedownEvent: MouseEvent, sourceNode: WorkflowNode): void {
        const self = this;
        const srcId: string = sourceNode.id;
        const srcH: number = getNodeH(sourceNode);
        const startCanvasX: number = sourceNode.x + NODE_W / 2;
        const startCanvasY: number = sourceNode.y + srcH + 20;

        const tempLayer: D3Selection = this._zoomGroup!.select('.temp-link-layer');
        tempLayer.selectAll('*').remove();

        const lineNode: SVGElement = tempLayer.append('path')
            .attr('class', 'mas-temp-link')
            .attr('d', `M${startCanvasX},${startCanvasY} L${startCanvasX},${startCanvasY}`)
            .attr('fill', 'none')
            .attr('stroke', ACCENT_BLUE)
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', '6 3')
            .attr('marker-end', 'url(#mas-arrow-drag)')
            .attr('pointer-events', 'none')
            .node();

        let totalDist: number = 0;
        let currentTarget: WorkflowNode | null = null;
        let rafId: number = 0;
        let lastClientX: number = mousedownEvent.clientX;
        let lastClientY: number = mousedownEvent.clientY;

        const container = self.template.querySelector('.canvas-svg-container') as HTMLElement;
        const containerRect: DOMRect = container.getBoundingClientRect();

        const toCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
            const t: D3ZoomIdentity = self._currentTransform || self._d3!.zoomIdentity;
            return {
                x: (clientX - containerRect.left - t.x) / t.k,
                y: (clientY - containerRect.top - t.y) / t.k,
            };
        };

        const updateFrame = (): void => {
            rafId = 0;
            const canvas = toCanvas(lastClientX, lastClientY);
            const dx: number = canvas.x - startCanvasX;
            const dy: number = canvas.y - startCanvasY;
            const dist: number = Math.sqrt(dx * dx + dy * dy);
            const cpOff: number = Math.max(Math.abs(dy) * 0.45, Math.min(dist * 0.3, 60));

            lineNode.setAttribute('d',
                `M${startCanvasX},${startCanvasY} C${startCanvasX},${startCanvasY + cpOff} ${canvas.x},${canvas.y - cpOff} ${canvas.x},${canvas.y}`
            );

            const hit: WorkflowNode | null = self._hitTestNode(canvas.x, canvas.y, srcId);
            const hitId: string | null = hit ? hit.id : null;

            if (hitId !== (currentTarget ? currentTarget.id : null)) {
                currentTarget = hit;
                self._connectTargetId = hitId;
                lineNode.setAttribute('stroke', hit ? '#4bca81' : ACCENT_BLUE);
                lineNode.setAttribute('stroke-width', hit ? '3' : '2.5');
            }
        };

        const onMouseMove = (e: MouseEvent): void => {
            e.preventDefault();
            totalDist += Math.abs(e.movementX) + Math.abs(e.movementY);
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            if (!rafId) {
                // eslint-disable-next-line @lwc/lwc/no-async-operation -- throttle connector drag redraws
                rafId = requestAnimationFrame(updateFrame);
            }
        };

        const onMouseUp = (e: MouseEvent): void => {
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('mouseup', onMouseUp, true);
            if (rafId) cancelAnimationFrame(rafId);

            tempLayer.selectAll('*').remove();
            self._connectTargetId = null;

            if (totalDist < 6) {
                self._showActionPopover(sourceNode, mousedownEvent.clientX, mousedownEvent.clientY);
                return;
            }

            const canvas = toCanvas(e.clientX, e.clientY);
            const target: WorkflowNode | null = self._hitTestNode(canvas.x, canvas.y, srcId);

            if (target) {
                const srcNode: WorkflowNode | undefined = self._nodes.find(n => n.id === srcId);
                if (srcNode && srcNode.nodeType === 'stage' && target.nodeType === 'stage') {
                    /* stage→stage: auto-insert a transition to enforce the rule
                       that every stage-to-stage path has a transition block. */
                    self._pushUndo();
                    const transId: string = nextId();
                    const transNode: WorkflowNode = {
                        id: transId,
                        nodeType: 'transition',
                        label: 'New Transition',
                        x: (srcNode.x + target.x) / 2,
                        y: (srcNode.y + target.y) / 2,
                    };
                    self._nodes = [...self._nodes, transNode];
                    self._links.push(
                        { id: 'l_t1_' + transId, source: srcId, target: transId },
                        { id: 'l_t2_' + transId, source: transId, target: target.id },
                    );
                    self._renderLinks();
                } else {
                    const exactDuplicate: boolean = self._links.some(
                        l => l.source === srcId && l.target === target.id
                    );
                    if (!exactDuplicate && srcId !== target.id) {
                        self._pushUndo();
                        self._links.push({
                            id: 'l_conn_' + Date.now(),
                            source: srcId,
                            target: target.id,
                        });
                        self._renderLinks();
                    }
                }
            }
        };

        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseup', onMouseUp, true);
    }

    _hitTestNode(canvasX: number, canvasY: number, excludeId: string): WorkflowNode | null {
        const margin: number = 20;
        for (let i: number = 0; i < this._nodes.length; i++) {
            const n: WorkflowNode = this._nodes[i];
            if (n.id === excludeId) continue;
            const h: number = getNodeH(n);
            if (canvasX >= n.x - margin && canvasX <= n.x + NODE_W + margin &&
                canvasY >= n.y - margin && canvasY <= n.y + h + margin) {
                return n;
            }
        }
        return null;
    }

    /* ===================== Popover ===================== */

    _showActionPopover(sourceNode: WorkflowNode, clientX: number, clientY: number): void {
        const container = this.template.querySelector('.studio-canvas') as HTMLElement;
        const rect: DOMRect = container.getBoundingClientRect();
        this._popoverX = clientX - rect.left + 12;
        this._popoverY = clientY - rect.top + 12;
        this._popoverSourceId = sourceNode.id;
        this._popoverMode = 'main';
        this._popoverVisible = true;
    }

    handlePopoverDismiss(): void {
        this._popoverVisible = false;
    }

    handlePopoverContentClick(event: Event): void {
        event.stopPropagation();
    }

    handlePopoverAction(event: Event): void {
        event.stopPropagation();
        const action: string | undefined = (event.currentTarget as HTMLElement).dataset.action;
        if (action === 'newStage') {
            this._popoverVisible = false;
            const src: WorkflowNode | undefined = this._nodes.find(n => n.id === this._popoverSourceId);
            if (src) this._addNodeBelow(src);
        } else if (action === 'existingStage') {
            this._popoverMode = 'stageList';
        } else if (action === 'back') {
            this._popoverMode = 'main';
        }
    }

    handlePopoverStageSelect(event: Event): void {
        event.stopPropagation();
        const targetId: string | undefined = (event.currentTarget as HTMLElement).dataset.stageId;
        const sourceId: string | null = this._popoverSourceId;
        this._popoverVisible = false;
        if (sourceId && targetId) this._connectToExistingStage(sourceId, targetId);
    }

    /* Find a position for a w×h card near (desiredX, desiredY) that doesn't
       overlap any existing node (with PAD clearance). Existing cards — the
       target especially — are never moved; we search outward from the desired
       spot and drop the new card into the closest free space, preferring a
       sideways slot in the same row before stepping down a row.               */
    _findFreePosition(desiredX: number, desiredY: number, w: number, h: number): Pt {
        const PAD: number = 32;
        const overlaps = (x: number, y: number): boolean =>
            this._nodes.some((n: WorkflowNode) => {
                const nw: number = NODE_W, nh: number = getNodeH(n);
                return x - PAD < n.x + nw && x + w + PAD > n.x &&
                       y - PAD < n.y + nh && y + h + PAD > n.y;
            });

        if (!overlaps(desiredX, desiredY)) return { x: desiredX, y: desiredY };

        const colStep: number = NODE_W + MIN_SIBLING_GAP_X;   // one column over
        const rowStep: number = h + BASE_LAYER_GAP;           // one row down
        for (let ring: number = 1; ring <= 12; ring++) {
            const candidates: Pt[] = [];
            for (let dx: number = -ring; dx <= ring; dx++) {
                for (let dy: number = 0; dy <= ring; dy++) {        // only sideways / downward
                    if (Math.max(Math.abs(dx), dy) !== ring) continue; // ring perimeter only
                    candidates.push({ x: desiredX + dx * colStep, y: desiredY + dy * rowStep });
                }
            }
            /* Closest first; weight vertical moves slightly so a free sideways
               slot wins over an equally-distant slot further down, and break
               left/right ties toward the right.                              */
            const cost = (p: Pt): number =>
                Math.abs(p.x - desiredX) + Math.abs(p.y - desiredY) * 1.2 +
                (p.x < desiredX ? 0.01 : 0);
            candidates.sort((a, b) => cost(a) - cost(b));
            for (const c of candidates) {
                if (!overlaps(c.x, c.y)) return c;
            }
        }
        return { x: desiredX, y: desiredY };   // give up: nowhere clear found
    }

    _connectToExistingStage(sourceId: string, targetId: string): void {
        const srcNode: WorkflowNode | undefined = this._nodes.find(n => n.id === sourceId);
        if (!srcNode) return;

        this._pushUndo();

        const transId: string = nextId();
        const transH: number = getNodeH({ nodeType: 'transition' } as WorkflowNode);
        /* Place the transition in free space below the source — without nudging
           the target or any other existing card.                              */
        const pos: Pt = this._findFreePosition(
            srcNode.x, srcNode.y + getNodeH(srcNode) + BASE_LAYER_GAP, NODE_W, transH
        );
        const transNode: WorkflowNode = {
            id: transId,
            nodeType: 'transition',
            label: 'New Transition',
            x: pos.x,
            y: pos.y,
        };

        this._nodes = [...this._nodes, transNode];
        this._links.push(
            { id: 'l_t1_' + transId, source: sourceId, target: transId },
            { id: 'l_t2_' + transId, source: transId, target: targetId, toExistingStage: true },
        );
        this._renderLinks();
    }

    /* ===================== Node Operations ===================== */

    _addNodeBelow(parentNode: WorkflowNode): void {
        if (parentNode.nodeType !== 'stage') return;

        this._pushUndo();

        /* New transition + stage start under the parent's centre; the pin-aware
           auto-layout then fans this parent's children out symmetrically and
           shifts neighbours to make room — while any node the user has dragged
           (pinned) keeps its manual position.                                 */
        const transId: string = nextId();
        const transNode: WorkflowNode = {
            id: transId,
            nodeType: 'transition',
            label: 'New Transition',
            x: parentNode.x,
            y: parentNode.y + getNodeH(parentNode) + BASE_LAYER_GAP,
        };

        const stageId: string = nextId();
        const stageNode: WorkflowNode = {
            id: stageId,
            nodeType: 'stage',
            label: 'New Stage',
            lifecycleState: '',
            customLabelApiName: '',
            activities: [],
            allowManualTransition: false,
            isFinalStage: false,
            x: parentNode.x,
            y: transNode.y + getNodeH(transNode) + BASE_LAYER_GAP,
        };

        this._nodes.push(transNode, stageNode);
        this._links.push(
            { id: 'l' + transId, source: parentNode.id, target: transId },
            { id: 'l' + stageId, source: transId, target: stageId },
        );
        this._autoLayout();
        this._nodes = [...this._nodes];
        this._renderLinks();
        this._selectNode(stageNode);
    }

    _addNodeFromPalette(type: string, dropX: number, dropY: number): void {
        this._pushUndo();
        const newId: string = nextId();
        const t: D3ZoomIdentity = this._currentTransform || this._d3!.zoomIdentity;
        const canvasX: number = (dropX - t.x) / t.k;
        const canvasY: number = (dropY - t.y) / t.k;
        const nodeType: 'root' | 'stage' | 'transition' = type as 'root' | 'stage' | 'transition';

        const newNode: WorkflowNode = {
            id: newId,
            nodeType: nodeType,
            label: NODE_TYPE_LABELS[type] || 'New Step',
            x: canvasX - NODE_W / 2,
            y: canvasY - getNodeH({ nodeType: nodeType } as WorkflowNode) / 2,
        };

        if (nodeType === 'stage') {
            newNode.lifecycleState = '';
            newNode.customLabelApiName = '';
            newNode.activities = [];
            newNode.allowManualTransition = false;
            newNode.isFinalStage = false;
        }

        this._nodes.push(newNode);

        const closest: WorkflowNode | null = this._findClosestNode(canvasX, canvasY, newId);
        if (closest) {
            this._links.push({ id: 'l' + newId, source: closest.id, target: newId });
        }

        this._renderLinks();
        this._selectNode(newNode);
    }

    _findClosestNode(x: number, y: number, excludeId: string): WorkflowNode | null {
        let best: WorkflowNode | null = null;
        let bestDist: number = Infinity;
        this._nodes.forEach((n: WorkflowNode) => {
            if (n.id === excludeId) return;
            const h: number = getNodeH(n);
            const dx: number = (n.x + NODE_W / 2) - x;
            const dy: number = (n.y + h) - y;
            const dist: number = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist && n.y < y) {
                bestDist = dist;
                best = n;
            }
        });
        return bestDist < 500 ? best : null;
    }

    handleDeleteSelectedNode(): void {
        if (!this.selectedNode) return;
        this._deleteNode(this.selectedNode.id);
    }

    /* ===================== Property Changes ===================== */

    handlePropertyChange(event: Event): void {
        if (!this.selectedNode) return;
        const target = event.target as HTMLInputElement;
        const field: string = target.dataset.field!;
        const value: string = target.type === 'checkbox' ? String(target.checked) : target.value;
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === this.selectedNode!.id);
        if (node) {
            if (target.type === 'checkbox') {
                (node as unknown as Record<string, unknown>)[field] = target.checked;
            } else {
                (node as unknown as Record<string, unknown>)[field] = value;
            }
            this.selectedNode = { ...node };
            this._nodes = [...this._nodes];
            this._renderLinks();
        }
    }

    handleClosePropertyPanel(): void {
        this._selectNode(null);
    }

    /* ===================== Toolbar Actions ===================== */

    handleToolbarAction(event: Event): void {
        const btn = event.currentTarget as HTMLElement;
        const action: string | undefined = btn.dataset.action;
        switch (action) {
            case 'undo':         this._undo(); break;
            case 'redo':         this._redo(); break;
            case 'zoomIn':       this._zoomBy(1.3); break;
            case 'zoomOut':      this._zoomBy(0.7); break;
            case 'fitToScreen':  this._fitToScreen(true); break;
            case 'autoLayout':   this._pushUndo(); this._nodes.forEach(n => { n.pinned = false; }); this._autoLayout(); this._nodes = [...this._nodes]; this._renderLinks(); this._fitToScreen(true); break;
            case 'runAnimation': this._runExecutionAnimation(); break;
            default: break;
        }
    }

    _zoomBy(factor: number): void {
        if (!this._svg || !this._zoomBehavior) return;
        this._svg.transition().duration(300).call(this._zoomBehavior.scaleBy as unknown as (...args: unknown[]) => void, factor);
    }

    _fitToScreen(animate: boolean): void {
        if (!this._svg || !this._zoomBehavior || !this._nodes.length) return;
        const d3: D3Static = this._d3!;

        const container = this.template.querySelector('.canvas-svg-container') as HTMLElement;
        if (!container) return;
        const rect: DOMRect = container.getBoundingClientRect();
        const padX: number = 120, padY: number = 100;

        let minX: number = Infinity, minY: number = Infinity, maxX: number = -Infinity, maxY: number = -Infinity;
        this._nodes.forEach((n: WorkflowNode) => {
            const h: number = getNodeH(n);
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + NODE_W);
            maxY = Math.max(maxY, n.y + h);
        });

        const contentW: number = maxX - minX + padX * 2;
        const contentH: number = maxY - minY + padY * 2;
        const scale: number = Math.min(rect.width / contentW, rect.height / contentH, 1.2);
        const tx: number = rect.width / 2 - (minX + (maxX - minX) / 2) * scale;
        const ty: number = rect.height / 2 - (minY + (maxY - minY) / 2) * scale;

        const transform: D3ZoomIdentity = d3.zoomIdentity.translate(tx, ty).scale(scale);

        if (animate) {
            this._svg.transition().duration(500).ease(d3.easeCubicOut).call(this._zoomBehavior.transform as unknown as (...args: unknown[]) => void, transform);
        } else {
            this._svg.call(this._zoomBehavior.transform as unknown as (...args: unknown[]) => void, transform);
        }
    }

    /* ===================== Undo / Redo ===================== */

    _pushUndo(): void {
        this._undoStack.push({
            nodes: JSON.parse(JSON.stringify(this._nodes)) as WorkflowNode[],
            links: JSON.parse(JSON.stringify(this._links)) as WorkflowLink[],
        });
        this._redoStack = [];
        if (this._undoStack.length > 50) this._undoStack.shift();
    }

    _undo(): void {
        if (this._undoStack.length === 0) return;
        this._redoStack.push({
            nodes: JSON.parse(JSON.stringify(this._nodes)) as WorkflowNode[],
            links: JSON.parse(JSON.stringify(this._links)) as WorkflowLink[],
        });
        const state: UndoState = this._undoStack.pop()!;
        this._nodes = state.nodes;
        this._links = state.links;
        this.selectedNode = null;
        this._renderLinks();
    }

    _redo(): void {
        if (this._redoStack.length === 0) return;
        this._undoStack.push({
            nodes: JSON.parse(JSON.stringify(this._nodes)) as WorkflowNode[],
            links: JSON.parse(JSON.stringify(this._links)) as WorkflowLink[],
        });
        const state: UndoState = this._redoStack.pop()!;
        this._nodes = state.nodes;
        this._links = state.links;
        this.selectedNode = null;
        this._renderLinks();
    }

    /* ===================== Drag & Drop from Palette ===================== */

    handlePaletteDragStart(event: DragEvent): void {
        this._draggedPaletteType = (event.currentTarget as HTMLElement).dataset.type!;
        event.dataTransfer!.setData('text/plain', this._draggedPaletteType);
        event.dataTransfer!.effectAllowed = 'copy';
    }

    handleCanvasDragOver(event: DragEvent): void {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'copy';
    }

    handleCanvasDrop(event: DragEvent): void {
        event.preventDefault();
        const type: string = event.dataTransfer!.getData('text/plain') || this._draggedPaletteType || '';
        if (!type) return;

        const canvasEl = this.template.querySelector('.canvas-svg-container') as HTMLElement;
        const rect: DOMRect = canvasEl.getBoundingClientRect();
        const dropX: number = event.clientX - rect.left;
        const dropY: number = event.clientY - rect.top;

        this._addNodeFromPalette(type, dropX, dropY);
        this._draggedPaletteType = null;
    }

    /* ===================== Minimap ===================== */

    _initMinimap(): void {
        const d3: D3Static = this._d3!;
        const minimapContainer: Element | null = this.template.querySelector('.minimap-container');
        if (!minimapContainer) return;

        while (minimapContainer.firstChild) minimapContainer.removeChild(minimapContainer.firstChild);

        const mmW: number = 180, mmH: number = 130;

        const mmSvg: D3Selection = d3.select(minimapContainer as unknown as Element)
            .append('svg')
            .attr('width', mmW)
            .attr('height', mmH)
            .style('background', 'transparent');

        mmSvg.append('g').attr('class', 'minimap-links');
        mmSvg.append('g').attr('class', 'minimap-nodes');

        const viewport: D3Selection = mmSvg.append('rect')
            .attr('class', 'minimap-viewport')
            .attr('x', 0).attr('y', 0)
            .attr('width', mmW).attr('height', mmH);

        this._minimapSvg = mmSvg;
        this._minimapViewport = viewport;
        this._updateMinimap();
    }

    _updateMinimap(): void {
        if (!this._minimapSvg || !this._nodes.length) return;
        const mmW: number = 180, mmH: number = 130;

        let minX: number = Infinity, minY: number = Infinity, maxX: number = -Infinity, maxY: number = -Infinity;
        this._nodes.forEach((n: WorkflowNode) => {
            const h: number = getNodeH(n);
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + NODE_W);
            maxY = Math.max(maxY, n.y + h);
        });

        const pad: number = 80;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const contentW: number = maxX - minX;
        const contentH: number = maxY - minY;
        const scale: number = Math.min(mmW / contentW, mmH / contentH);

        const nodeMap: Map<string, WorkflowNode> = new Map(this._nodes.map(n => [n.id, n]));

        this._minimapSvg.select('.minimap-links').selectAll('line')
            .data(this._links as unknown[], (d: unknown) => (d as WorkflowLink).id)
            .join('line')
            .attr('x1', (d: unknown) => { const s = nodeMap.get((d as WorkflowLink).source); return s ? (s.x + NODE_W / 2 - minX) * scale : 0; })
            .attr('y1', (d: unknown) => { const s = nodeMap.get((d as WorkflowLink).source); return s ? (s.y + getNodeH(s) - minY) * scale : 0; })
            .attr('x2', (d: unknown) => { const t = nodeMap.get((d as WorkflowLink).target); return t ? (t.x + NODE_W / 2 - minX) * scale : 0; })
            .attr('y2', (d: unknown) => { const t = nodeMap.get((d as WorkflowLink).target); return t ? (t.y - minY) * scale : 0; })
            .attr('stroke', LINK_COLOR)
            .attr('stroke-width', 0.8);

        this._minimapSvg.select('.minimap-nodes').selectAll('rect')
            .data(this._nodes as unknown[], (d: unknown) => (d as WorkflowNode).id)
            .join('rect')
            .attr('class', 'minimap-node')
            .attr('x', (d: unknown) => ((d as WorkflowNode).x - minX) * scale)
            .attr('y', (d: unknown) => ((d as WorkflowNode).y - minY) * scale)
            .attr('width', NODE_W * scale)
            .attr('height', (d: unknown) => getNodeH(d as WorkflowNode) * scale)
            .attr('fill', (d: unknown) => ICON_COLORS[(d as WorkflowNode).nodeType] || ICON_COLORS.stage)
            .attr('opacity', 0.8)
            .attr('rx', 2).attr('ry', 2);

        if (this._minimapViewport && this._currentTransform) {
            const container = this.template.querySelector('.canvas-svg-container') as HTMLElement;
            if (!container) return;
            const rect: DOMRect = container.getBoundingClientRect();
            const t: D3ZoomIdentity = this._currentTransform;

            const vx: number = (-t.x / t.k - minX) * scale;
            const vy: number = (-t.y / t.k - minY) * scale;
            const vw: number = (rect.width / t.k) * scale;
            const vh: number = (rect.height / t.k) * scale;

            this._minimapViewport
                .attr('x', Math.max(0, vx))
                .attr('y', Math.max(0, vy))
                .attr('width', Math.min(mmW, vw))
                .attr('height', Math.min(mmH, vh));
        }
    }

    /* ===================== Execution Animation ===================== */

    _runExecutionAnimation(): void {
        if (this._animationRunning) return;
        this._animationRunning = true;
        const d3: D3Static = this._d3!;

        const childrenMap: Map<string, WorkflowLink[]> = new Map();
        const hasParent: Set<string> = new Set();

        this._links.forEach((l: WorkflowLink) => {
            if (!childrenMap.has(l.source)) childrenMap.set(l.source, []);
            childrenMap.get(l.source)!.push(l);
            hasParent.add(l.target);
        });

        let roots: WorkflowNode[] = this._nodes.filter(n => !hasParent.has(n.id));
        if (roots.length === 0 && this._nodes.length > 0) roots = [this._nodes[0]];
        if (roots.length === 0) { this._animationRunning = false; return; }

        const order: Array<{ nodeId: string | null; linkId: string | null }> = [];
        const loopbackLinks: string[] = [];
        const visited: Set<string> = new Set();
        const bfs: Array<{ nodeId: string; fromLink: string | null }> = [...roots.map(r => ({ nodeId: r.id, fromLink: null as string | null }))];

        while (bfs.length > 0) {
            const { nodeId, fromLink } = bfs.shift()!;
            if (visited.has(nodeId)) {
                if (fromLink) loopbackLinks.push(fromLink);
                continue;
            }
            visited.add(nodeId);
            order.push({ nodeId, linkId: fromLink });
            const children: WorkflowLink[] = childrenMap.get(nodeId) || [];
            children.forEach((link: WorkflowLink) => {
                bfs.push({ nodeId: link.target, fromLink: link.id });
            });
        }

        loopbackLinks.forEach((linkId: string) => {
            order.push({ nodeId: null, linkId });
        });

        let step: number = 0;
        // eslint-disable-next-line @lwc/lwc/no-async-operation -- step through workflow execution animation
        const interval: ReturnType<typeof setInterval> = setInterval(() => {
            if (step >= order.length) {
                clearInterval(interval);
                // eslint-disable-next-line @lwc/lwc/no-async-operation -- allow final animation frame to finish
                setTimeout(() => {
                    this._zoomGroup!.selectAll('.mas-link').classed('is-animating', false);
                    this._executingNodeIds = new Set();
                    this._animationRunning = false;
                }, 800);
                return;
            }

            const { nodeId, linkId } = order[step];

            if (linkId) {
                this._zoomGroup!.selectAll('.mas-link-group').each(function(this: SVGElement, d: unknown) {
                    if ((d as WorkflowLink).id === linkId) {
                        d3.select(this).select('.mas-link')
                            .classed('is-animating', true)
                            .attr('stroke', '#4bca81')
                            .attr('stroke-dasharray', '8 4');
                    }
                });
            }

            if (nodeId) {
                const newSet: Set<string> = new Set(this._executingNodeIds);
                newSet.add(nodeId);
                this._executingNodeIds = newSet;
                // eslint-disable-next-line @lwc/lwc/no-async-operation -- clear node highlight after pulse
                setTimeout(() => {
                    const updated: Set<string> = new Set(this._executingNodeIds);
                    updated.delete(nodeId);
                    this._executingNodeIds = updated;
                }, 800);
            }

            step++;
        }, 700);
    }
}
