import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import d3Resource from '@salesforce/resourceUrl/d3';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 96;
const WORKFLOW_WIDTH = window.innerWidth;
const WORKFLOW_HEIGHT = window.innerHeight;
const LAYER_HEIGHT = 120;
const H_GAP = 200;
/* Figma RGC Workflow UI design tokens */
const CARD_BG = '#FFFFFF';
const CARD_BORDER = '#c9c9c9';
const LINK_STROKE = '#5c5c5c';
const ACCENT_BLUE = '#066afe';
const TEXT_PRIMARY = '#2e2e2e';
const TEXT_SECONDARY = '#5c5c5c';

export default class HelloWorld extends LightningElement {
    _d3 = null;
    _loadStarted = false;
    showMessage = true;
    statusMessage = 'Loading graph…';
    _workflowNodes = [];
    _workflowLinks = [];
    _graphContainer = null;
    _panWrapper = null;
    _pan = { x: 0, y: 0 };
    _panStart = null;
    _boundPanMouseDown = null;
    _boundPanMouseMove = null;
    _boundPanMouseUp = null;

    _getWorkflowData() {
        const nodes = [
            { id: 'trigger', type: 'trigger', label: 'Form Submitted', layer: 0 },
            { id: 'email1', type: 'email', label: 'Welcome Email', layer: 1 },
            { id: 'wait', type: 'wait', label: 'Wait 2 days', layer: 2 },
            { id: 'condition', type: 'condition', label: 'Email opened?', layer: 3 },
            { id: 'email2', type: 'email', label: 'Follow-up Email', layer: 4 },
            { id: 'goal', type: 'goal', label: 'Converted', layer: 4 },
        ];
        const links = [
            { source: 'trigger', target: 'email1' },
            { source: 'email1', target: 'wait' },
            { source: 'wait', target: 'condition' },
            { source: 'condition', target: 'email2' },
            { source: 'condition', target: 'goal' },
            { source: 'email2', target: 'goal' },
        ];
        return { nodes, links };
    }

    _nodeIconColor(type) {
        const colors = { trigger: '#066afe', email: '#066afe', wait: '#066afe', condition: '#066afe', goal: '#22c55e' };
        return colors[type] || ACCENT_BLUE;
    }

    _computeFixedLayout(nodes, links, width) {
        const byLayer = new Map();
        nodes.forEach((n) => {
            if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
            byLayer.get(n.layer).push(n);
        });
        byLayer.forEach((arr) => arr.sort((a, b) => (a.id < b.id ? -1 : 1)));
        const layers = [...byLayer.keys()].sort((a, b) => a - b);
        layers.forEach((layer) => {
            const row = byLayer.get(layer);
            const n = row.length;
            const startX = width / 2 - ((n - 1) * H_GAP) / 2;
            row.forEach((node, i) => {
                node.x = startX + i * H_GAP;
                node.y = (layer + 1) * LAYER_HEIGHT;
            });
        });
    }

    _onAddNode(sourceNode) {
        const newId = 'node_' + Date.now();
        const newNode = {
            id: newId,
            type: 'email',
            label: 'New Step',
            layer: sourceNode.layer + 1,
        };
        this._workflowNodes.push(newNode);
        this._workflowLinks.push({ source: sourceNode.id, target: newId });
        this._computeFixedLayout(this._workflowNodes, this._workflowLinks, WORKFLOW_WIDTH);
        if (this._graphContainer) this._renderGraph(this._graphContainer);
    }

    _onDeleteNode(nodeId) {
        this._workflowNodes = this._workflowNodes.filter((n) => n.id !== nodeId);
        this._workflowLinks = this._workflowLinks.filter(
            (l) => l.source !== nodeId && l.target !== nodeId
        );
        this._computeFixedLayout(this._workflowNodes, this._workflowLinks, WORKFLOW_WIDTH);
        if (this._graphContainer) this._renderGraph(this._graphContainer);
    }

    _clampNodePosition(d) {
        d.x = Math.max(NODE_WIDTH / 2, Math.min(WORKFLOW_WIDTH - NODE_WIDTH / 2, d.x));
        d.y = Math.max(NODE_HEIGHT / 2, Math.min(WORKFLOW_HEIGHT - NODE_HEIGHT / 2, d.y));
    }

    renderedCallback() {
        if (this._loadStarted) return;
        this._loadStarted = true;
        this._loadAndRender();
    }

    _handleGraphClick(event) {
        const deleteBtn = event.target.closest && event.target.closest('.workflow-node__delete');
        if (deleteBtn) {
            event.preventDefault();
            event.stopPropagation();
            const g = event.target.closest && event.target.closest('.workflow-node');
            if (g) {
                const id = g.getAttribute('data-id');
                if (id) this._onDeleteNode(id);
            }
            return;
        }
        const addWrap = event.target.closest && event.target.closest('.workflow-node__add-wrap');
        if (!addWrap) return;
        event.preventDefault();
        event.stopPropagation();
        const g = event.target.closest && event.target.closest('.workflow-node');
        if (!g) return;
        const id = g.getAttribute('data-id');
        const node = this._workflowNodes.find((n) => n.id === id);
        if (node) this._onAddNode(node);
    }

    _handleGraphMouseDown(event) {
        const addWrap = event.target.closest && event.target.closest('.workflow-node__add-wrap');
        const deleteBtn = event.target.closest && event.target.closest('.workflow-node__delete');
        if (addWrap || deleteBtn) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    disconnectedCallback() {
        if (this._graphContainer) {
            if (this._boundGraphClick) this._graphContainer.removeEventListener('click', this._boundGraphClick);
            if (this._boundGraphMouseDown) this._graphContainer.removeEventListener('mousedown', this._boundGraphMouseDown, true);
        }
        if (this._panWrapper) {
            if (this._boundPanMouseMove) document.removeEventListener('mousemove', this._boundPanMouseMove);
            if (this._boundPanMouseUp) document.removeEventListener('mouseup', this._boundPanMouseUp);
        }
    }

    async _loadAndRender() {
        const container = this.template.querySelector('.graph-container');
        if (!container) {
            this.statusMessage = 'Graph container not ready.';
            return;
        }

        try {
            if (typeof window.d3 === 'undefined') {
                await loadScript(this, d3Resource);
            }
            this._d3 = window.d3;
            if (!this._d3) {
                this._renderStaticFallback(container);
                this.statusMessage = 'D3 not available (Locker?). Showing static graph.';
                return;
            }
            this.showMessage = false;
            const { nodes, links } = this._getWorkflowData();
            this._workflowNodes = nodes.map((n) => ({ ...n }));
            this._workflowLinks = links.map((l) => ({ ...l }));
            this._graphContainer = container;
            this._computeFixedLayout(this._workflowNodes, this._workflowLinks, WORKFLOW_WIDTH);
            try {
                this._renderGraph(container);
                this._boundGraphClick = this._handleGraphClick.bind(this);
                this._boundGraphMouseDown = this._handleGraphMouseDown.bind(this);
                container.addEventListener('click', this._boundGraphClick);
                container.addEventListener('mousedown', this._boundGraphMouseDown, true);
            } catch (err) {
                this._renderStaticFallback(container);
                console.error('helloWorld: D3 render failed', err);
            }
        } catch (e) {
            this._renderStaticFallback(container);
            this.showMessage = false;
            console.error('helloWorld: D3 load failed', e);
        }
    }

    _renderStaticFallback(container) {
        this.showMessage = false;
        const { nodes, links } = this._getWorkflowData();
        const width = WORKFLOW_WIDTH;
        const height = WORKFLOW_HEIGHT;
        const positions = {
            trigger: [400, 60],
            email1: [400, 180],
            wait: [400, 300],
            condition: [400, 420],
            email2: [260, 500],
            goal: [540, 500],
        };

        this._clearContainer(container);

        const svgNs = 'http://www.w3.org/2000/svg';
        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('class', 'workflow-svg');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', '100%');
        svg.setAttribute('style', 'max-width:100%');

        const linkG = document.createElementNS(svgNs, 'g');
        linkG.setAttribute('class', 'workflow-links');
        links.forEach((l) => {
            const [x1, y1] = positions[l.source] || [0, 0];
            const [x2, y2] = positions[l.target] || [0, 0];
            const line = document.createElementNS(svgNs, 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1 + NODE_HEIGHT / 2);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2 - NODE_HEIGHT / 2);
            line.setAttribute('stroke', LINK_STROKE);
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('stroke-dasharray', '6 4');
            linkG.appendChild(line);
        });
        svg.appendChild(linkG);

        const nodeG = document.createElementNS(svgNs, 'g');
        nodeG.setAttribute('class', 'workflow-nodes');
        nodes.forEach((n) => {
            const [x, y] = positions[n.id] || [0, 0];
            const g = document.createElementNS(svgNs, 'g');
            g.setAttribute('class', 'workflow-node workflow-node--' + n.type);
            g.setAttribute('transform', 'translate(' + (x - NODE_WIDTH / 2) + ',' + (y - NODE_HEIGHT / 2) + ')');

            const rect = document.createElementNS(svgNs, 'rect');
            rect.setAttribute('width', NODE_WIDTH);
            rect.setAttribute('height', NODE_HEIGHT);
            rect.setAttribute('rx', '8');
            rect.setAttribute('ry', '8');
            rect.setAttribute('fill', CARD_BG);
            rect.setAttribute('stroke', CARD_BORDER);
            rect.setAttribute('stroke-width', '1');
            g.appendChild(rect);

            const fo = document.createElementNS(svgNs, 'foreignObject');
            fo.setAttribute('width', NODE_WIDTH);
            fo.setAttribute('height', NODE_HEIGHT);
            fo.setAttribute('x', '0');
            fo.setAttribute('y', '0');
            const card = document.createElementNS(xhtmlNs, 'div');
            card.setAttribute('class', 'workflow-node__card');
            card.setAttribute('style', 'margin:0;padding:12px 14px;box-sizing:border-box;font-size:13px;font-weight:600;color:' + TEXT_PRIMARY + ';');
            card.textContent = n.label;
            fo.appendChild(card);
            g.appendChild(fo);

            nodeG.appendChild(g);
        });
        svg.appendChild(nodeG);
        container.appendChild(svg);
    }

    _clearContainer(container) {
        while (container.firstChild) container.removeChild(container.firstChild);
    }

    _renderGraph(container) {
        const d3 = this._d3;
        this._clearContainer(container);

        const width = WORKFLOW_WIDTH;
        const height = WORKFLOW_HEIGHT;
        const nodeData = this._workflowNodes;
        const nodeMap = new Map(nodeData.map((n) => [n.id, n]));
        const linkData = this._workflowLinks
            .map((l) => ({ source: nodeMap.get(l.source), target: nodeMap.get(l.target) }))
            .filter((l) => l.source && l.target);

        const panWrapper = document.createElement('div');
        panWrapper.className = 'graph-pan-wrapper';
        panWrapper.style.transform = 'translate(' + this._pan.x + 'px,' + this._pan.y + 'px)';
        container.appendChild(panWrapper);

        const svg = d3.select(panWrapper).append('svg')
            .attr('class', 'workflow-svg')
            .attr('viewBox', [0, 0, width, height])
            .attr('width', '100%')
            .style('max-width', '100%');

        svg.append('rect')
            .attr('class', 'canvas-background')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'transparent')
            .attr('cursor', 'grab')
            .attr('title', 'Ctrl+drag (or \u2318+drag on Mac) to pan');

        const defs = svg.append('defs');
        const filter = defs.append('filter').attr('id', 'workflow-card-shadow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
        filter.append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 1.2).attr('flood-color', '#000').attr('flood-opacity', 0.08);
        filter.append('feDropShadow').attr('dx', 0).attr('dy', 2.8).attr('stdDeviation', 1.5).attr('flood-color', '#000').attr('flood-opacity', 0.09);

        const link = svg.append('g')
            .attr('class', 'workflow-links')
            .selectAll('line')
            .data(linkData)
            .join('line')
            .attr('stroke', LINK_STROKE)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '6 4')
            .attr('x1', (d) => d.source.x)
            .attr('y1', (d) => d.source.y + NODE_HEIGHT / 2)
            .attr('x2', (d) => d.target.x)
            .attr('y2', (d) => d.target.y - NODE_HEIGHT / 2);

        const node = svg.append('g')
            .attr('class', 'workflow-nodes')
            .selectAll('g')
            .data(nodeData)
            .join('g')
            .attr('class', (d) => 'workflow-node workflow-node--' + d.type)
            .attr('data-id', (d) => d.id)
            .attr('transform', (d) => 'translate(' + (d.x - NODE_WIDTH / 2) + ',' + (d.y - NODE_HEIGHT / 2) + ')')
            .attr('cursor', 'grab');
        node.call(this._dragSvgFixed(d3, link, node));

        node.append('rect')
            .attr('class', 'workflow-node__bg')
            .attr('width', NODE_WIDTH)
            .attr('height', NODE_HEIGHT)
            .attr('rx', 8)
            .attr('ry', 8)
            .attr('fill', CARD_BG)
            .attr('stroke', CARD_BORDER)
            .attr('stroke-width', 1)
            .attr('filter', 'url(#workflow-card-shadow)');

        const self = this;
        node.each(function (d) {
            const g = d3.select(this);
            const fo = g.append('foreignObject')
                .attr('width', NODE_WIDTH - 48)
                .attr('height', NODE_HEIGHT)
                .attr('x', 0)
                .attr('y', 0);
            const card = fo.append('xhtml:div')
                .attr('class', 'workflow-node__card');
            const header = card.append('xhtml:div').attr('class', 'workflow-node__header');
            header.append('xhtml:div').attr('class', 'workflow-node__icon').attr('style', 'width:24px;height:24px;border-radius:50%;background:' + self._nodeIconColor(d.type) + ';flex-shrink:0;');
            header.append('xhtml:span').attr('class', 'workflow-node__title').attr('style', 'flex:1;font-size:13px;font-weight:600;color:' + TEXT_PRIMARY + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;').text(d.label);
            header.append('xhtml:button').attr('class', 'workflow-node__edit').attr('type', 'button').attr('style', 'font-size:12px;color:' + ACCENT_BLUE + ';background:none;border:none;cursor:pointer;flex-shrink:0;').text('Edit');
            header.append('xhtml:button').attr('class', 'workflow-node__delete').attr('type', 'button').attr('title', 'Delete node').attr('style', 'width:20px;height:20px;padding:0;font-size:14px;line-height:1;color:#5c5c5c;background:#f3f3f3;border:1px solid #c9c9c9;border-radius:4px;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;').text('\u00D7');
            header.append('xhtml:span').attr('class', 'workflow-node__chevron').attr('style', 'width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:' + TEXT_SECONDARY + ';').text('\u25B2');
            card.append('xhtml:div').attr('class', 'workflow-node__body').attr('style', 'font-size:12px;color:' + TEXT_SECONDARY + ';padding:4px 0 0 0;').text(d.type === 'condition' ? 'Criteria / Activities' : 'Lifecycle state');
            g.append('rect')
                .attr('class', 'workflow-node__drag-area')
                .attr('width', NODE_WIDTH - 48)
                .attr('height', NODE_HEIGHT)
                .attr('x', 0)
                .attr('y', 0)
                .attr('fill', 'transparent')
                .attr('cursor', 'grab');
            const addWrap = g.append('g')
                .attr('class', 'workflow-node__add-wrap')
                .attr('cursor', 'pointer');
            addWrap.append('rect')
                .attr('x', NODE_WIDTH - 44)
                .attr('y', 12)
                .attr('width', 36)
                .attr('height', 72)
                .attr('rx', 6)
                .attr('ry', 6)
                .attr('fill', '#f3f3f3')
                .attr('stroke', CARD_BORDER)
                .attr('stroke-width', 1);
            addWrap.append('text')
                .attr('x', NODE_WIDTH - 26)
                .attr('y', 52)
                .attr('text-anchor', 'middle')
                .attr('fill', TEXT_SECONDARY)
                .attr('font-size', 20)
                .attr('font-weight', 'bold')
                .attr('pointer-events', 'none')
                .text('+');
        });
        this._setupCanvasPan(container);
    }

    _dragSvgFixed(d3, linkSel, nodeSel) {
        const self = this;
        return d3.drag()
            .on('drag', (event, d) => {
                d.x = event.x;
                d.y = event.y;
                self._clampNodePosition(d);
                nodeSel.attr('transform', (n) => 'translate(' + (n.x - NODE_WIDTH / 2) + ',' + (n.y - NODE_HEIGHT / 2) + ')');
                linkSel
                    .attr('x1', (l) => l.source.x)
                    .attr('y1', (l) => l.source.y + NODE_HEIGHT / 2)
                    .attr('x2', (l) => l.target.x)
                    .attr('y2', (l) => l.target.y - NODE_HEIGHT / 2);
            });
    }

    _setupCanvasPan(container) {
        const wrapper = container.querySelector('.graph-pan-wrapper');
        if (!wrapper) return;
        this._panWrapper = wrapper;
        const onPanMouseDown = (e) => {
            if (e.target.closest('.workflow-node') || e.target.closest('.workflow-node__add-wrap')) return;
            const modifier = e.ctrlKey || e.metaKey;
            if (e.target.classList.contains('canvas-background') && modifier) {
                this._panStart = { x: e.clientX - this._pan.x, y: e.clientY - this._pan.y };
                wrapper.classList.add('is-panning');
                this._boundPanMouseMove = this._onPanMouseMove.bind(this);
                this._boundPanMouseUp = this._onPanMouseUp.bind(this);
                document.addEventListener('mousemove', this._boundPanMouseMove);
                document.addEventListener('mouseup', this._boundPanMouseUp);
            }
        };
        wrapper.addEventListener('mousedown', onPanMouseDown);
    }

    _onPanMouseMove(e) {
        if (!this._panStart) return;
        this._pan.x = e.clientX - this._panStart.x;
        this._pan.y = e.clientY - this._panStart.y;
        if (this._panWrapper) {
            this._panWrapper.style.transform = 'translate(' + this._pan.x + 'px,' + this._pan.y + 'px)';
        }
    }

    _onPanMouseUp() {
        this._panStart = null;
        if (this._panWrapper) this._panWrapper.classList.remove('is-panning');
        if (this._boundPanMouseMove) document.removeEventListener('mousemove', this._boundPanMouseMove);
        if (this._boundPanMouseUp) document.removeEventListener('mouseup', this._boundPanMouseUp);
        this._boundPanMouseMove = null;
        this._boundPanMouseUp = null;
    }
}
