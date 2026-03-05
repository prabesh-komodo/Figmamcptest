import { LightningElement, api } from 'lwc';

;                       
                 
                     
 

;                           
               
                                              
                  
              
              
                       
                          
                           
                        
                       
                            
                                
                                
                                    
                           
 

;                       
                  
                  
 

const ICON_COLORS                         = {
    root:       '#1b96ff',
    stage:      '#4bca81',
    transition: '#0d9dda',
};

const NODE_ICONS                         = {
    root:       '\u26A1',
    stage:      '\uD83D\uDCC4',
    transition: '\uD83D\uDD00',
};

const NODE_TYPE_LABELS                         = {
    root:       'Trigger',
    stage:      'Stage',
    transition: 'Transition',
};

export default class WorkflowNode extends LightningElement {
    @api nodeData                          = null;
    @api isSelected          = false;
    @api isConnectTarget          = false;
    @api isExecuting          = false;

    get nodeType()         {
        return this.nodeData ? this.nodeData.nodeType : 'stage';
    }

    get isRoot()                { return this.nodeType === 'root'; }
    get isStage()               { return this.nodeType === 'stage'; }
    get isTransition()          { return this.nodeType === 'transition'; }
    get isDeletable()           { return this.nodeType !== 'root'; }

    get cardClass()         {
        let cls         = 'node-card node-card--' + this.nodeType;
        if (this.isSelected)       cls += ' node-card--selected';
        if (this.isConnectTarget)  cls += ' node-card--connect-target';
        if (this.isExecuting)      cls += ' node-card--executing';
        return cls;
    }

    get inputPortClass()         {
        return 'node-input-port' + (this.isConnectTarget ? ' node-input-port--target' : '');
    }

    get icon()         {
        return this.nodeData ? (NODE_ICONS[this.nodeData.nodeType] || '') : '';
    }

    get iconStyle()         {
        if (!this.nodeData) return '';
        const color         = ICON_COLORS[this.nodeData.nodeType] || ICON_COLORS.stage;
        return `background:${color}`;
    }

    get nodeLabel()         {
        return this.nodeData ? this.nodeData.label : '';
    }

    get typeLabel()         {
        return this.nodeData ? (NODE_TYPE_LABELS[this.nodeData.nodeType] || 'Step') : '';
    }

    /* ===== Simple label/value fields ===== */

    get fields()                 {
        if (!this.nodeData) return [];
        const d                   = this.nodeData;
        const result                 = [];

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

    get entryCriteria()         {
        if (!this.nodeData || !this.nodeData.entryCriteria) return '\u2014';
        return this.nodeData.entryCriteria;
    }

    get autostartLabel()         {
        return this.nodeData && this.nodeData.autostart ? 'Yes' : 'No';
    }

    get autostartBadgeClass()         {
        return 'badge' + (this.nodeData && this.nodeData.autostart ? ' badge--on' : ' badge--off');
    }

    get isActiveLabel()         {
        return this.nodeData && this.nodeData.isActive ? 'Active' : 'Inactive';
    }

    get isActiveBadgeClass()         {
        return 'badge' + (this.nodeData && this.nodeData.isActive ? ' badge--on' : ' badge--off');
    }

    /* ===== Stage-specific ===== */

    get activities()                 {
        return (this.nodeData && this.nodeData.activities) || [];
    }

    get hasActivities()          {
        return this.activities.length > 0;
    }

    get manualTransitionLabel()         {
        return this.nodeData && this.nodeData.allowManualTransition ? 'Allowed' : 'Not allowed';
    }

    get manualTransitionBadgeClass()         {
        return 'badge' + (this.nodeData && this.nodeData.allowManualTransition ? ' badge--on' : ' badge--off');
    }

    get finalStageLabel()         {
        return this.nodeData && this.nodeData.isFinalStage ? 'Yes' : 'No';
    }

    get finalStageBadgeClass()         {
        return 'badge' + (this.nodeData && this.nodeData.isFinalStage ? ' badge--on' : ' badge--off');
    }

    /* ===== Event Handlers ===== */

    handleEdit(event       )       {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('nodeselect', {
            detail: { nodeId: this.nodeData ? this.nodeData.id : null },
            bubbles: true,
            composed: true,
        }));
    }

    handleDelete(event       )       {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('nodedelete', {
            detail: { nodeId: this.nodeData ? this.nodeData.id : null },
            bubbles: true,
            composed: true,
        }));
    }

    handlePortMouseDown(event            )       {
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
