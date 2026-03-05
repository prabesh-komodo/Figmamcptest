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

const NODE_H_MAP: Record<string, number> = {
    root:       340,
    stage:      260,
    transition: 100,
};

function getNodeH(n: WorkflowNode): number {
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
}

interface WorkflowLink {
    id: string;
    source: string;
    target: string;
    label?: string;
}

interface LinkPathInfo {
    d: string;
    labelX: number;
    labelY: number;
    isLoopback: boolean;
}

interface LinkPortPositions {
    exitX: number;
    entryX: number;
    midYOffset: number;
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
    positionStyle: string;
}

let _idCounter: number = 100;
function nextId(): string { return 'n' + (++_idCounter); }

export default class MarketingAutomationStudio extends LightningElement {
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
        } catch (_unused) { // eslint-disable-line no-unused-vars
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
                id: 'n6', nodeType: 'stage', label: 'Request Submission Declined',
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
            { id: 'l5', source: 'n4', target: 'n6' },
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
            const children: string[] = childrenMap.get(nodeId) || [];
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

        const positionSubtree = (nodeId: string, centerX: number): void => {
            if (positioned.has(nodeId)) return;
            positioned.add(nodeId);
            const node: WorkflowNode | undefined = nodeMap.get(nodeId);
            if (!node) return;

            const depth: number = nodeDepth.get(nodeId) || 0;
            node.x = centerX - NODE_W / 2;
            node.y = layerY.get(depth) || 200;

            const children: string[] = childrenMap.get(nodeId) || [];
            if (children.length === 0) return;

            const childWidths: number[] = children.map(cId => subtreeWidths.get(cId) || NODE_W);
            const totalChildW: number = childWidths.reduce((sum, w) => sum + w, 0)
                + (children.length - 1) * MIN_SIBLING_GAP_X;

            let childX: number = centerX - totalChildW / 2;
            children.forEach((cId: string, i: number) => {
                const cw: number = childWidths[i];
                const childCenter: number = childX + cw / 2;
                positionSubtree(cId, childCenter);
                childX += cw + MIN_SIBLING_GAP_X;
            });
        };

        const rootWidths: number[] = roots.map(r => subtreeWidths.get(r.id) || NODE_W);
        const totalRootW: number = rootWidths.reduce((sum, w) => sum + w, 0)
            + (roots.length > 1 ? (roots.length - 1) * MIN_SIBLING_GAP_X : 0);
        let rootX: number = CANVAS_W / 2 - totalRootW / 2;

        roots.forEach((r: WorkflowNode, i: number) => {
            const rw: number = rootWidths[i];
            positionSubtree(r.id, rootX + rw / 2);
            rootX += rw + MIN_SIBLING_GAP_X;
        });

        this._nodes.forEach(n => {
            if (!positioned.has(n.id)) {
                positionSubtree(n.id, CANVAS_W / 2);
            }
        });
    }

    _computeLinkPorts(): Map<string, LinkPortPositions> {
        const ports: Map<string, LinkPortPositions> = new Map();
        const outgoing: Map<string, WorkflowLink[]> = new Map();
        const incoming: Map<string, WorkflowLink[]> = new Map();
        const nodeMap: Map<string, WorkflowNode> = new Map(this._nodes.map(n => [n.id, n]));

        this._links.forEach((l: WorkflowLink) => {
            if (!outgoing.has(l.source)) outgoing.set(l.source, []);
            outgoing.get(l.source)!.push(l);
            if (!incoming.has(l.target)) incoming.set(l.target, []);
            incoming.get(l.target)!.push(l);
        });

        const defaultPort = (center: number): LinkPortPositions => ({ exitX: center, entryX: center, midYOffset: 0 });

        const spreadPorts = (
            links: WorkflowLink[],
            node: WorkflowNode,
            sortByKey: (l: WorkflowLink) => number,
            assignField: 'exitX' | 'entryX'
        ): void => {
            const center: number = node.x + NODE_W / 2;
            if (links.length === 1) {
                const p: LinkPortPositions = ports.get(links[0].id) || defaultPort(center);
                p[assignField] = center;
                ports.set(links[0].id, p);
                return;
            }
            const sorted: WorkflowLink[] = [...links].sort((a, b) => sortByKey(a) - sortByKey(b));
            const margin: number = 60;
            const startX: number = node.x + margin;
            const endX: number = node.x + NODE_W - margin;
            const span: number = endX - startX;
            sorted.forEach((link: WorkflowLink, i: number) => {
                const t: number = i / (sorted.length - 1);
                const p: LinkPortPositions = ports.get(link.id) || defaultPort(center);
                p[assignField] = startX + t * span;
                ports.set(link.id, p);
            });
        };

        outgoing.forEach((links: WorkflowLink[], srcId: string) => {
            const src: WorkflowNode | undefined = nodeMap.get(srcId);
            if (!src) return;
            spreadPorts(links, src, (l: WorkflowLink) => {
                const t: WorkflowNode | undefined = nodeMap.get(l.target);
                return t ? t.x : 0;
            }, 'exitX');
        });

        incoming.forEach((links: WorkflowLink[], tgtId: string) => {
            const tgt: WorkflowNode | undefined = nodeMap.get(tgtId);
            if (!tgt) return;
            spreadPorts(links, tgt, (l: WorkflowLink) => {
                const s: WorkflowNode | undefined = nodeMap.get(l.source);
                return s ? s.x : 0;
            }, 'entryX');
        });

        this._staggerOverlappingLanes(ports, nodeMap);

        return ports;
    }

    _staggerOverlappingLanes(
        ports: Map<string, LinkPortPositions>,
        nodeMap: Map<string, WorkflowNode>
    ): void {
        interface BusInfo {
            sourceId: string;
            naturalMidY: number;
            xMin: number;
            xMax: number;
            linkIds: string[];
        }

        const sourceGroups: Map<string, WorkflowLink[]> = new Map();
        this._links.forEach((l: WorkflowLink) => {
            const src: WorkflowNode | undefined = nodeMap.get(l.source);
            const tgt: WorkflowNode | undefined = nodeMap.get(l.target);
            if (!src || !tgt) return;
            if (tgt.y <= src.y + getNodeH(src) + 30) return;
            if (!sourceGroups.has(l.source)) sourceGroups.set(l.source, []);
            sourceGroups.get(l.source)!.push(l);
        });

        const buses: BusInfo[] = [];
        sourceGroups.forEach((links: WorkflowLink[], sourceId: string) => {
            const src: WorkflowNode = nodeMap.get(sourceId)!;
            const y1: number = src.y + getNodeH(src);

            let xMin: number = Infinity;
            let xMax: number = -Infinity;
            let sumY2: number = 0;
            const linkIds: string[] = [];

            links.forEach((l: WorkflowLink) => {
                const tgt: WorkflowNode | undefined = nodeMap.get(l.target);
                const p: LinkPortPositions | undefined = ports.get(l.id);
                if (!tgt || !p) return;
                xMin = Math.min(xMin, p.exitX, p.entryX);
                xMax = Math.max(xMax, p.exitX, p.entryX);
                sumY2 += tgt.y;
                linkIds.push(l.id);
            });

            if (linkIds.length === 0) return;
            const avgY2: number = sumY2 / linkIds.length;
            buses.push({
                sourceId,
                naturalMidY: (y1 + avgY2) / 2,
                xMin,
                xMax,
                linkIds,
            });
        });

        if (buses.length < 2) return;

        buses.sort((a, b) => a.naturalMidY - b.naturalMidY);

        const MID_Y_THRESHOLD: number = 40;
        const BUS_GAP: number = 14;
        const assigned: Set<string> = new Set();

        for (let i: number = 0; i < buses.length; i++) {
            if (assigned.has(buses[i].sourceId)) continue;

            const cluster: BusInfo[] = [buses[i]];
            for (let j: number = i + 1; j < buses.length; j++) {
                if (assigned.has(buses[j].sourceId)) continue;
                if (Math.abs(buses[j].naturalMidY - buses[i].naturalMidY) > MID_Y_THRESHOLD) break;

                const candidate: BusInfo = buses[j];
                const overlaps: boolean = cluster.some(
                    (c: BusInfo) => c.xMax > candidate.xMin && candidate.xMax > c.xMin
                );
                if (overlaps) {
                    cluster.push(candidate);
                }
            }

            if (cluster.length > 1) {
                cluster.sort((a, b) => a.xMin - b.xMin);
                const totalSpread: number = (cluster.length - 1) * BUS_GAP;
                cluster.forEach((bus: BusInfo, idx: number) => {
                    const offset: number = -totalSpread / 2 + idx * BUS_GAP;
                    bus.linkIds.forEach((lid: string) => {
                        const p: LinkPortPositions | undefined = ports.get(lid);
                        if (p) p.midYOffset = offset;
                    });
                    assigned.add(bus.sourceId);
                });
            } else {
                assigned.add(buses[i].sourceId);
            }
        }
    }

    _buildLinkPath(src: WorkflowNode, tgt: WorkflowNode, portPos?: LinkPortPositions): LinkPathInfo {
        const srcH: number = getNodeH(src);
        const tgtH: number = getNodeH(tgt);
        const x1: number = portPos ? portPos.exitX : src.x + NODE_W / 2;
        const y1: number = src.y + srcH;
        const x2: number = portPos ? portPos.entryX : tgt.x + NODE_W / 2;
        const y2: number = tgt.y;

        const isLoopback: boolean = y2 <= y1 + 30;

        if (!isLoopback) {
            const midYOff: number = portPos ? portPos.midYOffset : 0;

            if (Math.abs(x1 - x2) < 2) {
                return {
                    d: `M${x1},${y1} L${x2},${y2}`,
                    labelX: (x1 + x2) / 2,
                    labelY: (y1 + y2) / 2,
                    isLoopback: false,
                };
            }

            const midY: number = (y1 + y2) / 2 + midYOff;
            const maxR: number = Math.min(
                Math.abs(midY - y1),
                Math.abs(y2 - midY),
                Math.abs(x2 - x1) / 2
            );
            const r: number = Math.min(CORNER_RADIUS, maxR);
            const sx: number = x2 > x1 ? 1 : -1;

            return {
                d: [
                    `M${x1},${y1}`,
                    `L${x1},${midY - r}`,
                    `Q${x1},${midY} ${x1 + r * sx},${midY}`,
                    `L${x2 - r * sx},${midY}`,
                    `Q${x2},${midY} ${x2},${midY + r}`,
                    `L${x2},${y2}`,
                ].join(' '),
                labelX: (x1 + x2) / 2,
                labelY: midY,
                isLoopback: false,
            };
        }

        const rightSrc: number = src.x + NODE_W;
        const sy: number = src.y + srcH / 2;
        const rightTgt: number = tgt.x + NODE_W;
        const ty: number = tgt.y + tgtH / 2;

        const loopOff: number = Math.max(60, Math.min(Math.abs(sy - ty) * 0.5 + 40, 160));
        const farX: number = Math.max(rightSrc, rightTgt) + loopOff;
        const vertAvail: number = Math.abs(sy - ty);
        const maxR: number = vertAvail > 0 ? Math.min(CORNER_RADIUS, vertAvail / 2) : CORNER_RADIUS;
        const r: number = Math.min(CORNER_RADIUS, maxR, loopOff);
        const dirY: number = ty > sy ? 1 : -1;

        if (vertAvail < 2) {
            return {
                d: `M${rightSrc},${sy} L${farX},${sy} L${farX},${ty} L${rightTgt},${ty}`,
                labelX: farX - 10,
                labelY: (sy + ty) / 2,
                isLoopback: true,
            };
        }

        return {
            d: [
                `M${rightSrc},${sy}`,
                `L${farX - r},${sy}`,
                `Q${farX},${sy} ${farX},${sy + r * dirY}`,
                `L${farX},${ty - r * dirY}`,
                `Q${farX},${ty} ${farX - r},${ty}`,
                `L${rightTgt},${ty}`,
            ].join(' '),
            labelX: farX - 10,
            labelY: (sy + ty) / 2,
            isLoopback: true,
        };
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

        defs.append('marker')
            .attr('id', 'mas-arrow')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 10).attr('refY', 5)
            .attr('markerWidth', 10).attr('markerHeight', 10)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M1,2.5 L8,5 L1,7.5 Z').attr('fill', LINK_COLOR);

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

    _renderLinks(): void {
        const d3: D3Static = this._d3!;
        if (!this._zoomGroup) return;

        const self = this;
        const nodeMap: Map<string, WorkflowNode> = new Map(this._nodes.map(n => [n.id, n]));
        const linkPorts: Map<string, LinkPortPositions> = this._computeLinkPorts();

        const linksLayer: D3Selection = this._zoomGroup.select('.links-layer');
        linksLayer.selectAll('*').remove();

        const linkGroups: D3Selection = linksLayer.selectAll('.mas-link-group')
            .data(this._links as unknown[], (d: unknown) => (d as WorkflowLink).id)
            .join('g')
            .attr('class', 'mas-link-group');

        linkGroups.each(function(this: SVGElement, d: unknown) {
            const link = d as WorkflowLink;
            const g: D3Selection = d3.select(this);
            const src: WorkflowNode | undefined = nodeMap.get(link.source);
            const tgt: WorkflowNode | undefined = nodeMap.get(link.target);
            if (!src || !tgt) return;

            const pathInfo: LinkPathInfo = self._buildLinkPath(src, tgt, linkPorts.get(link.id));

            g.append('path')
                .attr('class', 'mas-link' + (pathInfo.isLoopback ? ' mas-link--loopback' : ''))
                .attr('d', pathInfo.d)
                .attr('fill', 'none')
                .attr('stroke', pathInfo.isLoopback ? '#d29922' : LINK_COLOR)
                .attr('stroke-width', pathInfo.isLoopback ? 2 : 2.5)
                .attr('stroke-linecap', 'round')
                .attr('stroke-linejoin', 'round');

            if (pathInfo.isLoopback) {
                g.select('.mas-link').attr('stroke-dasharray', '4 3');
            }

            if (link.label) {
                const offsetX: number = link.label === 'Yes' ? -28 : 28;
                const lx: number = pathInfo.labelX + (pathInfo.isLoopback ? 10 : offsetX);
                const ly: number = pathInfo.labelY;

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

    handlePortDragStartEvent(event: CustomEvent): void {
        const { nodeId, clientX, clientY } = event.detail;
        const node: WorkflowNode | undefined = this._nodes.find(n => n.id === nodeId);
        if (!node) return;
        this._beginPortDrag({ clientX, clientY } as MouseEvent, node);
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
            const inLinks: WorkflowLink[] = this._links.filter(l => l.target === nodeId);
            const outLinks: WorkflowLink[] = this._links.filter(l => l.source === nodeId);
            this._links = this._links.filter(l => l.source !== nodeId && l.target !== nodeId);
            if (inLinks.length === 1 && outLinks.length === 1) {
                this._links.push({
                    id: 'l_bridge_' + Date.now(),
                    source: inLinks[0].source,
                    target: outLinks[0].target,
                });
            }
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
                self._addNodeBelow(sourceNode);
                return;
            }

            const canvas = toCanvas(e.clientX, e.clientY);
            const target: WorkflowNode | null = self._hitTestNode(canvas.x, canvas.y, srcId);

            if (target) {
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

    /* ===================== Node Operations ===================== */

    _addNodeBelow(parentNode: WorkflowNode): void {
        this._pushUndo();
        const nextType: 'stage' | 'transition' = parentNode.nodeType === 'stage' ? 'transition' : 'stage';
        const newId: string = nextId();

        const newNode: WorkflowNode = {
            id: newId,
            nodeType: nextType,
            label: nextType === 'stage' ? 'New Stage' : 'New Transition',
            x: parentNode.x,
            y: parentNode.y + getNodeH(parentNode) + BASE_LAYER_GAP,
        };

        if (nextType === 'stage') {
            newNode.lifecycleState = '';
            newNode.customLabelApiName = '';
            newNode.activities = [];
            newNode.allowManualTransition = false;
            newNode.isFinalStage = false;
        }

        this._nodes.push(newNode);
        this._links.push({ id: 'l' + newId, source: parentNode.id, target: newId });
        this._autoLayout();
        this._renderLinks();
        this._selectNode(newNode);
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
            case 'autoLayout':   this._pushUndo(); this._autoLayout(); this._nodes = [...this._nodes]; this._renderLinks(); this._fitToScreen(true); break;
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
        const interval: ReturnType<typeof setInterval> = setInterval(() => {
            if (step >= order.length) {
                clearInterval(interval);
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
