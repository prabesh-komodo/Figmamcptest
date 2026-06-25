import { LightningElement, api } from 'lwc';

interface ActivityItem {
    name: string;
    iconName: string;
}

interface WorkflowNodeData {
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

interface FieldDisplay {
    label: string;
    value: string;
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

export default class WorkflowNode extends LightningElement {
    @api nodeData: WorkflowNodeData | null = null;
    @api isSelected: boolean = false;
    @api isConnectTarget: boolean = false;
    @api isExecuting: boolean = false;
    @api isCollapsed: boolean = false;

    get nodeType(): string {
        return this.nodeData ? this.nodeData.nodeType : 'stage';
    }

    get isRoot(): boolean       { return this.nodeType === 'root'; }
    get isStage(): boolean      { return this.nodeType === 'stage'; }
    get isTransition(): boolean { return this.nodeType === 'transition'; }
    get isDeletable(): boolean  { return this.nodeType !== 'root'; }

    get cardClass(): string {
        let cls: string = 'node-card node-card--' + this.nodeType;
        if (this.isSelected)       cls += ' node-card--selected';
        if (this.isConnectTarget)  cls += ' node-card--connect-target';
        if (this.isExecuting)      cls += ' node-card--executing';
        if (this.isCollapsed)      cls += ' node-card--collapsed';
        return cls;
    }

    get chevronClass(): string {
        return 'chevron-icon' + (this.isCollapsed ? ' chevron-icon--collapsed' : '');
    }

    get collapseTitle(): string {
        return this.isCollapsed ? 'Expand' : 'Collapse';
    }

    get inputPortClass(): string {
        return 'node-input-port' + (this.isConnectTarget ? ' node-input-port--target' : '');
    }

    get icon(): string {
        return this.nodeData ? (NODE_ICONS[this.nodeData.nodeType] || '') : '';
    }

    get iconStyle(): string {
        if (!this.nodeData) return '';
        const color: string = ICON_COLORS[this.nodeData.nodeType] || ICON_COLORS.stage;
        return `background:${color}`;
    }

    get nodeLabel(): string {
        return this.nodeData ? this.nodeData.label : '';
    }

    get typeLabel(): string {
        return this.nodeData ? (NODE_TYPE_LABELS[this.nodeData.nodeType] || 'Step') : '';
    }

    /* ===== Simple label/value fields ===== */

    get fields(): FieldDisplay[] {
        if (!this.nodeData) return [];
        const d: WorkflowNodeData = this.nodeData;
        const result: FieldDisplay[] = [];

        switch (d.nodeType) {
            case 'root':
                result.push({ label: 'Lifecycle', value: d.lifecycle || '\u2014' });
                result.push({ label: 'Criteria Fact', value: d.criteriaFact || '\u2014' });
                break;
            case 'stage':
                result.push({ label: 'Lifecycle State', value: d.lifecycleState || '\u2014' });
                result.push({ label: 'Custom Label API', value: d.customLabelApiName || '\u2014' });
                break;
            case 'transition':
                break;
            default:
                break;
        }
        return result;
    }

    /* ===== Root-specific ===== */

    get entryCriteria(): string {
        if (!this.nodeData || !this.nodeData.entryCriteria) return '\u2014';
        return this.nodeData.entryCriteria;
    }

    get autostartLabel(): string {
        return this.nodeData && this.nodeData.autostart ? 'Yes' : 'No';
    }

    get autostartBadgeClass(): string {
        return 'badge' + (this.nodeData && this.nodeData.autostart ? ' badge--on' : ' badge--off');
    }

    get isActiveLabel(): string {
        return this.nodeData && this.nodeData.isActive ? 'Active' : 'Inactive';
    }

    get isActiveBadgeClass(): string {
        return 'badge' + (this.nodeData && this.nodeData.isActive ? ' badge--on' : ' badge--off');
    }

    /* ===== Stage-specific ===== */

    get activities(): ActivityItem[] {
        return (this.nodeData && this.nodeData.activities) || [];
    }

    get hasActivities(): boolean {
        return this.activities.length > 0;
    }

    get manualTransitionLabel(): string {
        return this.nodeData && this.nodeData.allowManualTransition ? 'Allowed' : 'Not allowed';
    }

    get manualTransitionBadgeClass(): string {
        return 'badge' + (this.nodeData && this.nodeData.allowManualTransition ? ' badge--on' : ' badge--off');
    }

    get finalStageLabel(): string {
        return this.nodeData && this.nodeData.isFinalStage ? 'Yes' : 'No';
    }

    get finalStageBadgeClass(): string {
        return 'badge' + (this.nodeData && this.nodeData.isFinalStage ? ' badge--on' : ' badge--off');
    }

    /* ===== Event Handlers ===== */

    handleEdit(event: Event): void {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('nodeselect', {
            detail: { nodeId: this.nodeData ? this.nodeData.id : null },
            bubbles: true,
            composed: true,
        }));
    }

    handleToggleCollapse(event: Event): void {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('nodecollapse', {
            detail: { nodeId: this.nodeData ? this.nodeData.id : null },
            bubbles: true,
            composed: true,
        }));
    }

    handleDelete(event: Event): void {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('nodedelete', {
            detail: { nodeId: this.nodeData ? this.nodeData.id : null },
            bubbles: true,
            composed: true,
        }));
    }

    handlePortMouseDown(event: MouseEvent): void {
        event.stopPropagation();
        event.preventDefault();
        this.dispatchEvent(new CustomEvent('portdragstart', {
            detail: {
                nodeId: this.nodeData ? this.nodeData.id : null,
                clientX: event.clientX,
                clientY: event.clientY,
            },
            bubbles: true,
            composed: true,
        }));
    }
}
