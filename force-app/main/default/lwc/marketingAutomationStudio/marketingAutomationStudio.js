import { LightningElement, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import d3Resource from '@salesforce/resourceUrl/d3';

const NODE_W = 380;
const NODE_H = 240;
const CANVAS_W = 6000;
const CANVAS_H = 6000;
const LAYER_GAP_Y = 300;
const SIBLING_GAP_X = 440;
const GRID_SIZE = 20;

/* Figma RGC card design tokens */
const CARD_BG        = '#FFFFFF';
const CARD_BORDER    = '#c9c9c9';
const CARD_RADIUS    = 20;
const TEXT_TITLE      = '#03234d';
const TEXT_BODY       = '#2e2e2e';
const TEXT_LABEL      = '#5c5c5c';
const ACCENT_BLUE     = '#066afe';
const ACCENT_BLUE_BTN = '#0250d9';
const LINK_COLOR      = '#5c5c5c';

const ICON_COLORS = {
    trigger:   '#1b96ff',
    email:     '#ff5d2d',
    sms:       '#7e57c2',
    wait:      '#f9a825',
    condition: '#0d9dda',
    goal:      '#4bca81',
    exit:      '#b0120a',
};

const NODE_ICONS = {
    trigger:   '\u26A1',
    email:     '\u2709\uFE0F',
    sms:       '\uD83D\uDCF1',
    wait:      '\u23F3',
    condition: '\uD83D\uDD00',
    goal:      '\uD83C\uDFAF',
    exit:      '\uD83D\uDEAA',
};

const NODE_TYPE_LABELS = {
    trigger:   'Trigger',
    email:     'Send Email',
    sms:       'Send SMS',
    wait:      'Wait / Delay',
    condition: 'Condition',
    goal:      'Goal',
    exit:      'Exit',
};

function nodeBodyFields(d) {
    const fields = [];
    fields.push({ label: 'Lifecycle State', value: NODE_TYPE_LABELS[d.type] || d.type });

    switch (d.type) {
        case 'email':
            fields.push({ label: 'Subject', value: d.subject || '—' });
            fields.push({ label: 'Template', value: d.template || '—' });
            break;
        case 'sms':
            fields.push({ label: 'Message', value: d.description || '—' });
            break;
        case 'wait':
            fields.push({ label: 'Duration', value: (d.waitValue || 1) + ' ' + (d.waitUnit || 'days') });
            break;
        case 'condition':
            fields.push({ label: 'Criteria', value: d.conditionType || 'emailOpened' });
            break;
        case 'goal':
            fields.push({ label: 'Completion Criteria', value: d.description || 'Not configured' });
            break;
        case 'trigger':
            fields.push({ label: 'Event', value: d.description || 'Not configured' });
            break;
        default:
            break;
    }
    return fields;
}

let _idCounter = 100;
function nextId() { return 'n' + (++_idCounter); }

export default class MarketingAutomationStudio extends LightningElement {
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

    _undoStack = [];
    _redoStack = [];
    _animationRunning = false;
    _draggedPaletteType = null;


    get paletteItems() {
        return [
            { type: 'trigger',   icon: NODE_ICONS.trigger,   label: 'Trigger',      description: 'Start the workflow',     iconStyle: `background:${ICON_COLORS.trigger};color:#fff` },
            { type: 'email',     icon: NODE_ICONS.email,     label: 'Send Email',   description: 'Send an email',          iconStyle: `background:${ICON_COLORS.email};color:#fff` },
            { type: 'sms',       icon: NODE_ICONS.sms,       label: 'Send SMS',     description: 'Send an SMS message',    iconStyle: `background:${ICON_COLORS.sms};color:#fff` },
            { type: 'wait',      icon: NODE_ICONS.wait,      label: 'Wait / Delay', description: 'Pause execution',        iconStyle: `background:${ICON_COLORS.wait};color:#fff` },
            { type: 'condition', icon: NODE_ICONS.condition,  label: 'Condition',    description: 'Branch on criteria',     iconStyle: `background:${ICON_COLORS.condition};color:#fff` },
            { type: 'goal',      icon: NODE_ICONS.goal,      label: 'Goal',         description: 'Conversion target',      iconStyle: `background:${ICON_COLORS.goal};color:#fff` },
            { type: 'exit',      icon: NODE_ICONS.exit,      label: 'Exit',         description: 'End the workflow',       iconStyle: `background:${ICON_COLORS.exit};color:#fff` },
        ];
    }

    get zoomLabel() { return Math.round(this.zoomLevel * 100) + '%'; }

    get propertyPanelClass() {
        return 'studio-property-panel' + (this.selectedNode ? ' studio-property-panel--open' : '');
    }

    get selectedNodeIconStyle() {
        if (!this.selectedNode) return '';
        const c = ICON_COLORS[this.selectedNode.type] || ICON_COLORS.email;
        return `background:${c};color:#fff`;
    }

    get selectedNodeIcon() {
        return this.selectedNode ? (NODE_ICONS[this.selectedNode.type] || '') : '';
    }

    get selectedNodeTypeLabel() {
        return this.selectedNode ? (NODE_TYPE_LABELS[this.selectedNode.type] || 'Step') : '';
    }

    get isSelectedEmail()     { return this.selectedNode && this.selectedNode.type === 'email'; }
    get isSelectedWait()      { return this.selectedNode && this.selectedNode.type === 'wait'; }
    get isSelectedCondition() { return this.selectedNode && this.selectedNode.type === 'condition'; }

    renderedCallback() {
        if (this._loadStarted) return;
        this._loadStarted = true;
        this._loadAndRender();
    }

    disconnectedCallback() {
        this._svg = null;
    }

    async _loadAndRender() {
        const container = this.template.querySelector('.canvas-container');
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
            this._renderGraph();
            this._initMinimap();
            this._fitToScreen(false);
        } catch (e) {
            console.error('MarketingAutomationStudio: D3 load/render failed', e);
        }
    }

    _initSampleWorkflow() {
        this._nodes = [
            { id: 'n1', type: 'trigger',   label: 'Request Submitted',  description: 'Triggered when a lead submits the contact form', x: 0, y: 0 },
            { id: 'n2', type: 'email',     label: 'Welcome Email',      description: 'Send a welcome email to the new lead', subject: 'Welcome aboard!', template: 'welcome', x: 0, y: 0 },
            { id: 'n3', type: 'wait',      label: 'Wait 2 Days',        description: 'Wait before follow-up', waitValue: 2, waitUnit: 'days', x: 0, y: 0 },
            { id: 'n4', type: 'condition', label: 'Email Opened?',      description: 'Check if the welcome email was opened', conditionType: 'emailOpened', x: 0, y: 0 },
            { id: 'n5', type: 'email',     label: 'Follow-up Email',    description: 'Send a follow-up for non-openers', subject: 'Did you see our email?', template: 'followup', x: 0, y: 0 },
            { id: 'n6', type: 'sms',       label: 'Engagement SMS',     description: 'Send SMS to engaged leads', x: 0, y: 0 },
            { id: 'n7', type: 'wait',      label: 'Wait 1 Week',        description: 'Wait one week', waitValue: 1, waitUnit: 'weeks', x: 0, y: 0 },
            { id: 'n8', type: 'goal',      label: 'Converted',          description: 'Lead has converted to a customer', x: 0, y: 0 },
            { id: 'n9', type: 'exit',      label: 'End Workflow',       description: 'Exit the automation', x: 0, y: 0 },
        ];
        this._links = [
            { id: 'l1', source: 'n1', target: 'n2' },
            { id: 'l2', source: 'n2', target: 'n3' },
            { id: 'l3', source: 'n3', target: 'n4' },
            { id: 'l4', source: 'n4', target: 'n5', label: 'No' },
            { id: 'l5', source: 'n4', target: 'n6', label: 'Yes' },
            { id: 'l6', source: 'n5', target: 'n7' },
            { id: 'l7', source: 'n6', target: 'n7' },
            { id: 'l8', source: 'n7', target: 'n8' },
            { id: 'l9', source: 'n8', target: 'n9' },
        ];
    }

    /* ===================== Auto Layout (Tree) ===================== */

    _autoLayout() {
        const nodeMap = new Map(this._nodes.map(n => [n.id, n]));
        const childrenMap = new Map();
        const hasParent = new Set();

        this._links.forEach(l => {
            if (!childrenMap.has(l.source)) childrenMap.set(l.source, []);
            childrenMap.get(l.source).push(l.target);
            hasParent.add(l.target);
        });

        const roots = this._nodes.filter(n => !hasParent.has(n.id));
        if (roots.length === 0 && this._nodes.length > 0) roots.push(this._nodes[0]);

        const layers = new Map();
        const visited = new Set();

        const assignLayer = (nodeId, layer) => {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);
            const existing = layers.get(layer) || [];
            existing.push(nodeId);
            layers.set(layer, existing);
            const children = childrenMap.get(nodeId) || [];
            children.forEach(cId => assignLayer(cId, layer + 1));
        };

        roots.forEach(r => assignLayer(r.id, 0));
        this._nodes.forEach(n => { if (!visited.has(n.id)) assignLayer(n.id, (layers.size || 0)); });

        const centerX = CANVAS_W / 2;
        const startY = 200;
        const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

        sortedLayers.forEach(layerIdx => {
            const ids = layers.get(layerIdx);
            const count = ids.length;
            const totalW = (count - 1) * SIBLING_GAP_X;
            const startX = centerX - totalW / 2;
            ids.forEach((id, i) => {
                const node = nodeMap.get(id);
                if (node) {
                    node.x = startX + i * SIBLING_GAP_X;
                    node.y = startY + layerIdx * LAYER_GAP_Y;
                }
            });
        });
    }

    /* Builds an SVG path for a link. Normal links curve downward;
       loopback links (target at or above source) swing out to the right. */
    _buildLinkPath(src, tgt) {
        const x1 = src.x + NODE_W / 2;
        const y1 = src.y + NODE_H;
        const x2 = tgt.x + NODE_W / 2;
        const y2 = tgt.y;

        const isLoopback = y2 <= y1 + 30;

        if (!isLoopback) {
            const dy = y2 - y1;
            const cpOff = Math.max(dy * 0.4, 40);
            return {
                d: `M${x1},${y1} C${x1},${y1 + cpOff} ${x2},${y2 - cpOff} ${x2},${y2}`,
                labelX: (x1 + x2) / 2,
                labelY: (y1 + y2) / 2,
                isLoopback: false,
            };
        }

        const sx = src.x + NODE_W;
        const sy = src.y + NODE_H / 2;
        const tx = tgt.x + NODE_W;
        const ty = tgt.y + NODE_H / 2;

        const vertDist = Math.abs(sy - ty);
        const horizDist = Math.abs(sx - tx);
        const loopOff = Math.max(80, Math.min(vertDist * 0.5 + horizDist * 0.3, 200));

        const cpx = Math.max(sx, tx) + loopOff;

        return {
            d: `M${sx},${sy} C${cpx},${sy} ${cpx},${ty} ${tx},${ty}`,
            labelX: cpx - 10,
            labelY: (sy + ty) / 2,
            isLoopback: true,
        };
    }

    /* ===================== Canvas Init ===================== */

    _initCanvas(container) {
        const d3 = this._d3;

        while (container.firstChild) container.removeChild(container.firstChild);

        const svg = d3.select(container)
            .append('svg')
            .attr('class', 'workflow-canvas')
            .attr('width', '100%')
            .attr('height', '100%');

        const defs = svg.append('defs');

        /* Figma box-shadow/2 - down: 3 layers */
        const shadow = defs.append('filter').attr('id', 'mas-card-shadow')
            .attr('x', '-15%').attr('y', '-10%').attr('width', '130%').attr('height', '130%');
        shadow.append('feDropShadow').attr('dx', 0).attr('dy', -1).attr('stdDeviation', 1.2).attr('flood-color', '#000').attr('flood-opacity', 0.04);
        shadow.append('feDropShadow').attr('dx', 0).attr('dy', 2.8).attr('stdDeviation', 2.9).attr('flood-color', '#000').attr('flood-opacity', 0.09);
        shadow.append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 2.9).attr('flood-color', '#000').attr('flood-opacity', 0.09);

        /* Selected glow */
        const selShadow = defs.append('filter').attr('id', 'mas-card-shadow-selected')
            .attr('x', '-15%').attr('y', '-15%').attr('width', '130%').attr('height', '135%');
        selShadow.append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 6).attr('flood-color', ACCENT_BLUE).attr('flood-opacity', 0.3);
        selShadow.append('feDropShadow').attr('dx', 0).attr('dy', 2.8).attr('stdDeviation', 2.9).attr('flood-color', '#000').attr('flood-opacity', 0.09);

        /* Execution glow */
        const glow = defs.append('filter').attr('id', 'mas-glow-active')
            .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
        glow.append('feDropShadow').attr('dx', 0).attr('dy', 0).attr('stdDeviation', 10).attr('flood-color', '#4bca81').attr('flood-opacity', 0.5);

        /* Arrow markers */
        defs.append('marker')
            .attr('id', 'mas-arrow')
            .attr('viewBox', '0 0 10 10')
            .attr('refX', 10).attr('refY', 5)
            .attr('markerWidth', 8).attr('markerHeight', 8)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,2 L8,5 L0,8 Z').attr('fill', LINK_COLOR);

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

        /* Grid pattern */
        const gridPattern = defs.append('pattern')
            .attr('id', 'mas-grid')
            .attr('width', GRID_SIZE).attr('height', GRID_SIZE)
            .attr('patternUnits', 'userSpaceOnUse');
        gridPattern.append('path')
            .attr('d', `M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`)
            .attr('fill', 'none')
            .attr('stroke', '#e8e8e8')
            .attr('stroke-width', 0.5);

        const zoomGroup = svg.append('g').attr('class', 'zoom-group');

        zoomGroup.append('rect')
            .attr('class', 'canvas-bg')
            .attr('width', CANVAS_W).attr('height', CANVAS_H)
            .attr('fill', 'url(#mas-grid)');

        zoomGroup.append('g').attr('class', 'links-layer');
        zoomGroup.append('g').attr('class', 'nodes-layer');
        zoomGroup.append('g').attr('class', 'temp-link-layer');

        const zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on('zoom', (event) => {
                zoomGroup.attr('transform', event.transform);
                this._currentTransform = event.transform;
                this.zoomLevel = event.transform.k;
                this._updateMinimap();
            });

        svg.call(zoom);
        this._svg = svg;
        this._zoomGroup = zoomGroup;
        this._zoomBehavior = zoom;
        this._currentTransform = d3.zoomIdentity;
    }

    /* ===================== foreignObject Node HTML ===================== */

    _buildNodeHTML(d, isSelected) {
        const iconColor = ICON_COLORS[d.type] || ICON_COLORS.email;
        const icon = NODE_ICONS[d.type] || '';
        const fields = nodeBodyFields(d);
        const selectedBorder = isSelected ? `border-color:${ACCENT_BLUE};box-shadow:0 0 0 2px ${ACCENT_BLUE}40;` : '';

        let fieldsHTML = '';
        fields.forEach(f => {
            const val = f.value || '—';
            fieldsHTML += `
                <div style="margin-bottom:8px;">
                    <div style="font-size:12px;color:${TEXT_LABEL};line-height:16px;margin-bottom:2px;">${f.label}</div>
                    <div style="font-size:13px;color:${TEXT_BODY};line-height:18px;padding-bottom:4px;border-bottom:1px solid ${CARD_BORDER};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${val}</div>
                </div>`;
        });

        return `
            <div xmlns="http://www.w3.org/1999/xhtml" style="
                width:${NODE_W}px;height:${NODE_H}px;box-sizing:border-box;
                background:${CARD_BG};
                border:1px solid ${CARD_BORDER};
                border-radius:${CARD_RADIUS}px;
                box-shadow:0 -1px 1.2px rgba(0,0,0,0.04),0 2.8px 2.9px rgba(0,0,0,0.09),0 0 2.9px rgba(0,0,0,0.09);
                overflow:hidden;
                font-family:-apple-system,BlinkMacSystemFont,'SF Pro','Segoe UI',Roboto,sans-serif;
                display:flex;flex-direction:column;
                ${selectedBorder}
                cursor:default;
                user-select:none;
                -webkit-user-drag:none;
            ">
                <!-- Card Header -->
                <div style="
                    display:flex;align-items:center;gap:8px;
                    padding:12px 16px;
                    background:${CARD_BG};
                    border-bottom:1px solid #eee;
                    flex-shrink:0;
                ">
                    <div style="
                        width:24px;height:24px;border-radius:100px;
                        background:${iconColor};
                        display:flex;align-items:center;justify-content:center;
                        font-size:12px;color:#fff;flex-shrink:0;overflow:hidden;
                    ">${icon}</div>
                    <div style="
                        flex:1;min-width:0;
                        font-size:18px;font-weight:400;
                        color:${TEXT_TITLE};
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                        line-height:26px;
                    ">${d.label}</div>
                    <div style="
                        height:30px;padding:0 14px;
                        border:1px solid ${TEXT_LABEL};
                        border-radius:9999px;
                        display:flex;align-items:center;justify-content:center;
                        font-size:13px;color:${ACCENT_BLUE_BTN};
                        background:${CARD_BG};
                        cursor:pointer;flex-shrink:0;
                    ">Edit</div>
                    <div style="
                        width:30px;height:30px;
                        border:1px solid ${TEXT_LABEL};
                        border-radius:9999px;
                        display:flex;align-items:center;justify-content:center;
                        font-size:12px;color:${TEXT_LABEL};
                        background:${CARD_BG};
                        cursor:pointer;flex-shrink:0;
                    ">\u25B2</div>
                </div>
                <!-- Card Body -->
                <div style="
                    flex:1;overflow:hidden;
                    padding:8px 16px 12px 16px;
                ">
                    ${fieldsHTML}
                </div>
            </div>`;
    }

    /* ===================== Graph Rendering ===================== */

    _renderGraph() {
        const d3 = this._d3;
        if (!this._zoomGroup) return;

        const self = this;
        const nodeMap = new Map(this._nodes.map(n => [n.id, n]));

        /* --- Links --- */
        const linksLayer = this._zoomGroup.select('.links-layer');
        linksLayer.selectAll('*').remove();

        const linkGroups = linksLayer.selectAll('.mas-link-group')
            .data(this._links, d => d.id)
            .join('g')
            .attr('class', 'mas-link-group');

        linkGroups.each((d, i, nodes) => {
            const g = d3.select(nodes[i]);
            const src = nodeMap.get(d.source);
            const tgt = nodeMap.get(d.target);
            if (!src || !tgt) return;

            const pathInfo = self._buildLinkPath(src, tgt);

            g.append('path')
                .attr('class', 'mas-link' + (pathInfo.isLoopback ? ' mas-link--loopback' : ''))
                .attr('d', pathInfo.d)
                .attr('fill', 'none')
                .attr('stroke', pathInfo.isLoopback ? '#d29922' : LINK_COLOR)
                .attr('stroke-width', pathInfo.isLoopback ? 2 : 1.5)
                .attr('stroke-dasharray', pathInfo.isLoopback ? '4 3' : '6 4')
                .attr('marker-end', 'url(#mas-arrow)');

            if (d.label) {
                const offsetX = d.label === 'Yes' ? -28 : 28;
                const lx = pathInfo.labelX + (pathInfo.isLoopback ? 10 : offsetX);
                const ly = pathInfo.labelY;

                g.append('rect')
                    .attr('x', lx - 18)
                    .attr('y', ly - 12)
                    .attr('width', 36).attr('height', 22)
                    .attr('rx', 11).attr('ry', 11)
                    .attr('fill', d.label === 'Yes' ? '#e6f4ea' : '#fef0ef')
                    .attr('stroke', d.label === 'Yes' ? '#4bca81' : '#f85149')
                    .attr('stroke-width', 1);

                g.append('text')
                    .attr('x', lx)
                    .attr('y', ly + 1)
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'central')
                    .attr('font-size', 11)
                    .attr('font-weight', 500)
                    .attr('fill', d.label === 'Yes' ? '#137333' : '#c5221f')
                    .text(d.label);
            }
        });

        /* --- Nodes (foreignObject) --- */
        const nodesLayer = this._zoomGroup.select('.nodes-layer');
        nodesLayer.selectAll('*').remove();

        const nodeGroups = nodesLayer.selectAll('.mas-node')
            .data(this._nodes, d => d.id)
            .join('g')
            .attr('class', d => 'mas-node' + (self.selectedNode && self.selectedNode.id === d.id ? ' is-selected' : ''))
            .attr('transform', d => `translate(${d.x},${d.y})`)
            .on('click', (event, d) => {
                event.stopPropagation();
                self._selectNode(d);
            });


        nodeGroups.each(function(d) {
            const g = d3.select(this);
            const isSelected = self.selectedNode && self.selectedNode.id === d.id;

            const fo = g.append('foreignObject')
                .attr('width', NODE_W)
                .attr('height', NODE_H)
                .attr('x', 0).attr('y', 0);

            const cardHTML = self._buildNodeHTML(d, isSelected);
            const parser = new DOMParser();
            const doc = parser.parseFromString(cardHTML, 'text/html');
            const cardEl = doc.body.firstElementChild;
            if (cardEl) {
                cardEl.setAttribute('draggable', 'false');
                cardEl.addEventListener('dragstart', ev => ev.preventDefault());
                fo.node().appendChild(cardEl);
            }

            /* Delete button (top-right, shown on hover) */
            const delBtn = g.append('g')
                .attr('class', 'mas-node-del-btn')
                .attr('transform', `translate(${NODE_W - 12}, -12)`)
                .on('click', (event) => {
                    event.stopPropagation();
                    self._deleteNode(d.id);
                });

            delBtn.append('circle')
                .attr('cx', 0).attr('cy', 0).attr('r', 12)
                .attr('fill', '#ffffff')
                .attr('stroke', '#f85149')
                .attr('stroke-width', 1.5);

            delBtn.append('text')
                .attr('x', 0).attr('y', 1)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('font-size', 14)
                .attr('font-weight', '600')
                .attr('fill', '#f85149')
                .attr('pointer-events', 'none')
                .text('\u00D7');

            /* Connector port / "+" button (bottom-center).
               Uses native mousedown instead of D3 drag to avoid
               event conflicts with the parent node drag. */
            const portGroup = g.append('g')
                .attr('class', 'mas-node-port')
                .attr('transform', `translate(${NODE_W / 2}, ${NODE_H + 20})`)
                .style('pointer-events', 'all');

            portGroup.append('circle')
                .attr('cx', 0).attr('cy', 0).attr('r', 14)
                .attr('class', 'mas-port-bg')
                .attr('fill', CARD_BG)
                .attr('stroke', CARD_BORDER)
                .attr('stroke-width', 1.5)
                .style('pointer-events', 'all');

            portGroup.append('text')
                .attr('x', 0).attr('y', 1)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('font-size', 18)
                .attr('font-weight', '500')
                .attr('fill', TEXT_LABEL)
                .attr('pointer-events', 'none')
                .text('+');

            portGroup.on('mousedown', (event) => {
                event.stopPropagation();
                event.preventDefault();
                self._beginPortDrag(event, d);
            });

            /* Top input port indicator */
            g.append('circle')
                .attr('class', 'mas-node-input-port')
                .attr('cx', NODE_W / 2)
                .attr('cy', -4)
                .attr('r', 5)
                .attr('fill', CARD_BG)
                .attr('stroke', CARD_BORDER)
                .attr('stroke-width', 1);
        });

        this._svg.on('click', () => {
            this._selectNode(null);
        });

        this._updateMinimap();
    }


    /* ===================== Node Selection ===================== */

    _selectNode(node) {
        this.selectedNode = node ? { ...node } : null;

        if (this._zoomGroup) {
            this._zoomGroup.selectAll('.mas-node')
                .classed('is-selected', d => node && d.id === node.id);

            /* Update border on the foreignObject cards without full re-render */
            this._zoomGroup.selectAll('.mas-node').each(function(d) {
                const fo = this.querySelector('foreignObject');
                if (!fo) return;
                const card = fo.firstElementChild;
                if (!card) return;
                if (node && d.id === node.id) {
                    card.style.borderColor = ACCENT_BLUE;
                    card.style.boxShadow = `0 0 0 2px ${ACCENT_BLUE}40`;
                } else {
                    card.style.borderColor = CARD_BORDER;
                    card.style.boxShadow = '0 -1px 1.2px rgba(0,0,0,0.04),0 2.8px 2.9px rgba(0,0,0,0.09),0 0 2.9px rgba(0,0,0,0.09)';
                }
            });
        }
    }

    /* ===================== Delete Node ===================== */

    _deleteNode(nodeId) {
        this._pushUndo();
        const inLinks = this._links.filter(l => l.target === nodeId);
        const outLinks = this._links.filter(l => l.source === nodeId);

        this._links = this._links.filter(l => l.source !== nodeId && l.target !== nodeId);

        if (inLinks.length === 1 && outLinks.length === 1) {
            this._links.push({
                id: 'l_bridge_' + Date.now(),
                source: inLinks[0].source,
                target: outLinks[0].target,
            });
        }

        this._nodes = this._nodes.filter(n => n.id !== nodeId);
        if (this.selectedNode && this.selectedNode.id === nodeId) {
            this.selectedNode = null;
        }
        this._autoLayout();
        this._renderGraph();
    }

    /* ===================== Connection Dragging (native mouse events) ===================== */

    _beginPortDrag(mousedownEvent, sourceNode) {
        const self = this;
        const srcId = sourceNode.id;
        const startCanvasX = sourceNode.x + NODE_W / 2;
        const startCanvasY = sourceNode.y + NODE_H + 20;

        const tempLayer = this._zoomGroup.select('.temp-link-layer');
        tempLayer.selectAll('*').remove();

        const lineNode = tempLayer.append('path')
            .attr('class', 'mas-temp-link')
            .attr('d', `M${startCanvasX},${startCanvasY} L${startCanvasX},${startCanvasY}`)
            .attr('fill', 'none')
            .attr('stroke', ACCENT_BLUE)
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', '6 3')
            .attr('marker-end', 'url(#mas-arrow-drag)')
            .attr('pointer-events', 'none')
            .node();

        let totalDist = 0;
        let currentTarget = null;
        let rafId = 0;
        let lastClientX = mousedownEvent.clientX;
        let lastClientY = mousedownEvent.clientY;

        const container = self.template.querySelector('.canvas-container');
        const containerRect = container.getBoundingClientRect();

        const toCanvas = (clientX, clientY) => {
            const t = self._currentTransform || self._d3.zoomIdentity;
            return {
                x: (clientX - containerRect.left - t.x) / t.k,
                y: (clientY - containerRect.top - t.y) / t.k,
            };
        };

        const updateFrame = () => {
            rafId = 0;
            const canvas = toCanvas(lastClientX, lastClientY);

            const dx = canvas.x - startCanvasX;
            const dy = canvas.y - startCanvasY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const cpOff = Math.max(Math.abs(dy) * 0.45, Math.min(dist * 0.3, 60));

            lineNode.setAttribute('d',
                `M${startCanvasX},${startCanvasY} C${startCanvasX},${startCanvasY + cpOff} ${canvas.x},${canvas.y - cpOff} ${canvas.x},${canvas.y}`
            );

            const hit = self._hitTestNode(canvas.x, canvas.y, srcId);
            const hitId = hit ? hit.id : null;

            if (hitId !== (currentTarget ? currentTarget.id : null)) {
                currentTarget = hit;
                self._zoomGroup.selectAll('.mas-node')
                    .classed('is-connect-target', d => hit && d.id === hit.id);

                lineNode.setAttribute('stroke', hit ? '#4bca81' : ACCENT_BLUE);
                lineNode.setAttribute('stroke-width', hit ? '3' : '2.5');
            }
        };

        const onMouseMove = (e) => {
            e.preventDefault();
            totalDist += Math.abs(e.movementX) + Math.abs(e.movementY);
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            if (!rafId) {
                rafId = requestAnimationFrame(updateFrame);
            }
        };

        const onMouseUp = (e) => {
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('mouseup', onMouseUp, true);
            if (rafId) cancelAnimationFrame(rafId);

            tempLayer.selectAll('*').remove();
            self._zoomGroup.selectAll('.mas-node').classed('is-connect-target', false);

            if (totalDist < 6) {
                self._addNodeBelow(sourceNode);
                return;
            }

            const canvas = toCanvas(e.clientX, e.clientY);
            const target = self._hitTestNode(canvas.x, canvas.y, srcId);

            if (target) {
                const exactDuplicate = self._links.some(
                    l => l.source === srcId && l.target === target.id
                );
                if (!exactDuplicate && srcId !== target.id) {
                    self._pushUndo();
                    self._links.push({
                        id: 'l_conn_' + Date.now(),
                        source: srcId,
                        target: target.id,
                    });
                    self._renderGraph();
                }
            }
        };

        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseup', onMouseUp, true);
    }

    _hitTestNode(canvasX, canvasY, excludeId) {
        const margin = 20;
        for (let i = 0; i < this._nodes.length; i++) {
            const n = this._nodes[i];
            if (n.id === excludeId) continue;
            if (canvasX >= n.x - margin && canvasX <= n.x + NODE_W + margin &&
                canvasY >= n.y - margin && canvasY <= n.y + NODE_H + margin) {
                return n;
            }
        }
        return null;
    }

    /* ===================== Node Operations ===================== */

    _addNodeBelow(parentNode) {
        this._pushUndo();
        const newId = nextId();
        const newNode = {
            id: newId,
            type: 'email',
            label: 'New Step',
            description: 'Configure this step',
            subject: '',
            template: 'welcome',
            x: parentNode.x,
            y: parentNode.y + LAYER_GAP_Y,
        };

        this._nodes.push(newNode);
        this._links.push({ id: 'l' + newId, source: parentNode.id, target: newId });
        this._autoLayout();
        this._renderGraph();
    }

    _addNodeFromPalette(type, dropX, dropY) {
        this._pushUndo();
        const newId = nextId();
        const t = this._currentTransform || this._d3.zoomIdentity;
        const canvasX = (dropX - t.x) / t.k;
        const canvasY = (dropY - t.y) / t.k;

        const newNode = {
            id: newId,
            type: type,
            label: NODE_TYPE_LABELS[type] || 'New Step',
            description: 'Configure this step',
            x: canvasX - NODE_W / 2,
            y: canvasY - NODE_H / 2,
        };

        if (type === 'wait')      { newNode.waitValue = 1; newNode.waitUnit = 'days'; }
        if (type === 'email')     { newNode.subject = ''; newNode.template = 'welcome'; }
        if (type === 'condition') { newNode.conditionType = 'emailOpened'; }

        this._nodes.push(newNode);

        const closest = this._findClosestNode(canvasX, canvasY, newId);
        if (closest) {
            this._links.push({ id: 'l' + newId, source: closest.id, target: newId });
        }

        this._renderGraph();
        this._selectNode(newNode);
    }

    _findClosestNode(x, y, excludeId) {
        let best = null;
        let bestDist = Infinity;
        this._nodes.forEach(n => {
            if (n.id === excludeId) return;
            const dx = (n.x + NODE_W / 2) - x;
            const dy = (n.y + NODE_H) - y;
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
        const field = event.target.dataset.field;
        const value = event.target.value;
        const node = this._nodes.find(n => n.id === this.selectedNode.id);
        if (node) {
            node[field] = value;
            this.selectedNode = { ...node };
            this._renderGraph();
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
            case 'undo':         this._undo(); break;
            case 'redo':         this._redo(); break;
            case 'zoomIn':       this._zoomBy(1.3); break;
            case 'zoomOut':      this._zoomBy(0.7); break;
            case 'fitToScreen':  this._fitToScreen(true); break;
            case 'autoLayout':   this._pushUndo(); this._autoLayout(); this._renderGraph(); this._fitToScreen(true); break;
            case 'runAnimation': this._runExecutionAnimation(); break;
            default: break;
        }
    }

    _zoomBy(factor) {
        if (!this._svg || !this._zoomBehavior) return;
        this._svg.transition().duration(300).call(this._zoomBehavior.scaleBy, factor);
    }

    _fitToScreen(animate) {
        if (!this._svg || !this._zoomBehavior || !this._nodes.length) return;
        const d3 = this._d3;

        const container = this.template.querySelector('.canvas-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const padX = 120, padY = 100;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this._nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + NODE_W);
            maxY = Math.max(maxY, n.y + NODE_H);
        });

        const contentW = maxX - minX + padX * 2;
        const contentH = maxY - minY + padY * 2;
        const scale = Math.min(rect.width / contentW, rect.height / contentH, 1.2);
        const tx = rect.width / 2 - (minX + (maxX - minX) / 2) * scale;
        const ty = rect.height / 2 - (minY + (maxY - minY) / 2) * scale;

        const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

        if (animate) {
            this._svg.transition().duration(500).ease(d3.easeCubicOut).call(this._zoomBehavior.transform, transform);
        } else {
            this._svg.call(this._zoomBehavior.transform, transform);
        }
    }

    /* ===================== Undo / Redo ===================== */

    _pushUndo() {
        this._undoStack.push({
            nodes: JSON.parse(JSON.stringify(this._nodes)),
            links: JSON.parse(JSON.stringify(this._links)),
        });
        this._redoStack = [];
        if (this._undoStack.length > 50) this._undoStack.shift();
    }

    _undo() {
        if (this._undoStack.length === 0) return;
        this._redoStack.push({
            nodes: JSON.parse(JSON.stringify(this._nodes)),
            links: JSON.parse(JSON.stringify(this._links)),
        });
        const state = this._undoStack.pop();
        this._nodes = state.nodes;
        this._links = state.links;
        this.selectedNode = null;
        this._renderGraph();
    }

    _redo() {
        if (this._redoStack.length === 0) return;
        this._undoStack.push({
            nodes: JSON.parse(JSON.stringify(this._nodes)),
            links: JSON.parse(JSON.stringify(this._links)),
        });
        const state = this._redoStack.pop();
        this._nodes = state.nodes;
        this._links = state.links;
        this.selectedNode = null;
        this._renderGraph();
    }

    /* ===================== Drag & Drop from Palette ===================== */

    handlePaletteDragStart(event) {
        this._draggedPaletteType = event.currentTarget.dataset.type;
        event.dataTransfer.setData('text/plain', this._draggedPaletteType);
        event.dataTransfer.effectAllowed = 'copy';
    }

    handleCanvasDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }

    handleCanvasDrop(event) {
        event.preventDefault();
        const type = event.dataTransfer.getData('text/plain') || this._draggedPaletteType;
        if (!type) return;

        const canvasEl = this.template.querySelector('.canvas-container');
        const rect = canvasEl.getBoundingClientRect();
        const dropX = event.clientX - rect.left;
        const dropY = event.clientY - rect.top;

        this._addNodeFromPalette(type, dropX, dropY);
        this._draggedPaletteType = null;
    }

    /* ===================== Minimap ===================== */

    _initMinimap() {
        const d3 = this._d3;
        const minimapContainer = this.template.querySelector('.minimap-container');
        if (!minimapContainer) return;

        while (minimapContainer.firstChild) minimapContainer.removeChild(minimapContainer.firstChild);

        const mmW = 180, mmH = 130;

        const mmSvg = d3.select(minimapContainer)
            .append('svg')
            .attr('width', mmW)
            .attr('height', mmH)
            .style('background', 'transparent');

        mmSvg.append('g').attr('class', 'minimap-links');
        mmSvg.append('g').attr('class', 'minimap-nodes');

        const viewport = mmSvg.append('rect')
            .attr('class', 'minimap-viewport')
            .attr('x', 0).attr('y', 0)
            .attr('width', mmW).attr('height', mmH);

        this._minimapSvg = mmSvg;
        this._minimapViewport = viewport;
        this._updateMinimap();
    }

    _updateMinimap() {
        if (!this._minimapSvg || !this._nodes.length) return;
        const mmW = 180, mmH = 130;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this._nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + NODE_W);
            maxY = Math.max(maxY, n.y + NODE_H);
        });

        const pad = 80;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const scale = Math.min(mmW / contentW, mmH / contentH);

        const nodeMap = new Map(this._nodes.map(n => [n.id, n]));

        this._minimapSvg.select('.minimap-links').selectAll('line')
            .data(this._links, d => d.id)
            .join('line')
            .attr('x1', d => { const s = nodeMap.get(d.source); return s ? (s.x + NODE_W / 2 - minX) * scale : 0; })
            .attr('y1', d => { const s = nodeMap.get(d.source); return s ? (s.y + NODE_H - minY) * scale : 0; })
            .attr('x2', d => { const t = nodeMap.get(d.target); return t ? (t.x + NODE_W / 2 - minX) * scale : 0; })
            .attr('y2', d => { const t = nodeMap.get(d.target); return t ? (t.y - minY) * scale : 0; })
            .attr('stroke', LINK_COLOR)
            .attr('stroke-width', 0.8);

        this._minimapSvg.select('.minimap-nodes').selectAll('rect')
            .data(this._nodes, d => d.id)
            .join('rect')
            .attr('class', 'minimap-node')
            .attr('x', d => (d.x - minX) * scale)
            .attr('y', d => (d.y - minY) * scale)
            .attr('width', NODE_W * scale)
            .attr('height', NODE_H * scale)
            .attr('fill', d => ICON_COLORS[d.type] || ICON_COLORS.email)
            .attr('opacity', 0.8)
            .attr('rx', 2).attr('ry', 2);

        if (this._minimapViewport && this._currentTransform) {
            const container = this.template.querySelector('.canvas-container');
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const t = this._currentTransform;

            const vx = (-t.x / t.k - minX) * scale;
            const vy = (-t.y / t.k - minY) * scale;
            const vw = (rect.width / t.k) * scale;
            const vh = (rect.height / t.k) * scale;

            this._minimapViewport
                .attr('x', Math.max(0, vx))
                .attr('y', Math.max(0, vy))
                .attr('width', Math.min(mmW, vw))
                .attr('height', Math.min(mmH, vh));
        }
    }

    /* ===================== Execution Animation ===================== */

    _runExecutionAnimation() {
        if (this._animationRunning) return;
        this._animationRunning = true;
        const d3 = this._d3;

        const childrenMap = new Map();
        const hasParent = new Set();

        this._links.forEach(l => {
            if (!childrenMap.has(l.source)) childrenMap.set(l.source, []);
            childrenMap.get(l.source).push(l);
            hasParent.add(l.target);
        });

        /* In a cyclic graph, every node may have a parent.
           Fall back to the first node if no root exists. */
        let roots = this._nodes.filter(n => !hasParent.has(n.id));
        if (roots.length === 0 && this._nodes.length > 0) roots = [this._nodes[0]];
        if (roots.length === 0) { this._animationRunning = false; return; }

        /* BFS traversal; loopback links that point to already-visited
           nodes are collected separately and animated at the end. */
        const order = [];
        const loopbackLinks = [];
        const visited = new Set();
        const bfs = [...roots.map(r => ({ nodeId: r.id, fromLink: null }))];

        while (bfs.length > 0) {
            const { nodeId, fromLink } = bfs.shift();
            if (visited.has(nodeId)) {
                if (fromLink) loopbackLinks.push(fromLink);
                continue;
            }
            visited.add(nodeId);
            order.push({ nodeId, linkId: fromLink });
            const children = childrenMap.get(nodeId) || [];
            children.forEach(link => {
                bfs.push({ nodeId: link.target, fromLink: link.id });
            });
        }

        loopbackLinks.forEach(linkId => {
            order.push({ nodeId: null, linkId });
        });

        let step = 0;
        const interval = setInterval(() => {
            if (step >= order.length) {
                clearInterval(interval);
                setTimeout(() => {
                    this._zoomGroup.selectAll('.mas-link').classed('is-animating', false);
                    this._zoomGroup.selectAll('.mas-node').classed('is-executing', false);
                    this._animationRunning = false;
                }, 800);
                return;
            }

            const { nodeId, linkId } = order[step];

            if (linkId) {
                this._zoomGroup.selectAll('.mas-link-group').each(function(d) {
                    if (d.id === linkId) {
                        d3.select(this).select('.mas-link')
                            .classed('is-animating', true)
                            .attr('stroke', '#4bca81')
                            .attr('stroke-dasharray', '8 4')
                            .attr('marker-end', 'url(#mas-arrow-active)');
                    }
                });
            }

            if (nodeId) {
                this._zoomGroup.selectAll('.mas-node').each(function(d) {
                    if (d.id === nodeId) {
                        const el = d3.select(this);
                        el.classed('is-executing', true);
                        setTimeout(() => el.classed('is-executing', false), 800);
                    }
                });
            }

            step++;
        }, 700);
    }
}
