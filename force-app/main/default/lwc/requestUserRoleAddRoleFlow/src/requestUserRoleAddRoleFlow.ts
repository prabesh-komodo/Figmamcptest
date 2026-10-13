import { LightningElement, api } from 'lwc';

/*
 * Full-screen Add Role flow. The role type and users are picked in the
 * Add Role popup (step 1), so this page is the Review step, then a processing
 * state and a completion summary.
 *
 * The parent works out which request × user pairs will be created or skipped
 * (`entries`), creates the roles when it receives `initiate`, sets
 * `processing` while it works and `batchId` when it is done, which switches
 * the flow to its completion view.
 */

/** One request × user pair; `skipReason` is set when the role won't be created. */
export interface AddRoleEntry {
    id: string;
    requestId: string;
    programName: string;
    programType: string;
    roleType: string;
    user: string;
    skipReason: string;
}

interface LinkCellClickEvent extends CustomEvent {
    detail: { actionName: string; rowKey: string };
}

const WARNING_NOTE = { noteIcon: 'utility:warning', noteIconVariant: 'warning', noteTextClass: 'note-text_warning' };
const SUCCESS_NOTE = { noteIcon: 'utility:success', noteIconVariant: 'success', noteTextClass: 'note-text_success' };

const NOTE_TYPE_ATTRIBUTES = {
    iconName: { fieldName: 'noteIcon' },
    iconVariant: { fieldName: 'noteIconVariant' },
    textClass: { fieldName: 'noteTextClass' }
};

// Column widths (px) from the Add Role design; the last column takes the remaining width.
const WIDE_COLUMN = 276;
const PROGRAM_TYPE_COLUMN = 115;

function recordCount(count: number): string {
    return `${count} ${count === 1 ? 'record' : 'records'}`;
}

function linkColumn(label: string, fieldName: string, actionName: string): object {
    return {
        label,
        fieldName,
        type: 'link',
        initialWidth: WIDE_COLUMN,
        typeAttributes: { actionName, rowKey: { fieldName: 'id' } }
    };
}

const STEPS = [
    {
        key: 'roleUsers',
        label: 'Role & users',
        marker: '✓',
        markerClass:
            'slds-grid slds-grid_align-center slds-grid_vertical-align-center slds-shrink-none stepper__marker stepper__marker_completed',
        labelClass: 'slds-m-left_xx-small stepper__label stepper__label_completed',
        ariaCurrent: null,
        assistiveText: ' (completed)',
        showConnector: false
    },
    {
        key: 'review',
        label: 'Review',
        marker: '2',
        markerClass:
            'slds-grid slds-grid_align-center slds-grid_vertical-align-center slds-shrink-none stepper__marker stepper__marker_active',
        labelClass: 'slds-m-left_xx-small stepper__label stepper__label_active',
        ariaCurrent: 'step',
        assistiveText: '',
        showConnector: true
    }
];

export default class RequestUserRoleAddRoleFlow extends LightningElement {
    @api roleType = '';
    @api users: string[] = [];

    /** e.g. "7 request(s) · 3 program(s) · 2 program type(s)" */
    @api scopeLabel = '';

    @api entries: AddRoleEntry[] = [];

    /** True while the parent is creating the roles ("Adding Roles"). */
    @api processing = false;

    /** Set by the parent once the roles are created; switches to the completion view. */
    @api batchId = '';

    steps = STEPS;

    get isComplete(): boolean {
        return Boolean(this.batchId);
    }

    get isReviewStep(): boolean {
        return !this.isComplete;
    }

    get usersLabel(): string {
        return this.users.join(', ');
    }

    get createEntries(): AddRoleEntry[] {
        return this.entries.filter((entry) => !entry.skipReason);
    }

    get skipEntries(): AddRoleEntry[] {
        return this.entries.filter((entry) => entry.skipReason);
    }

    get createCount(): number {
        return this.createEntries.length;
    }

    get hasCreates(): boolean {
        return this.createCount > 0;
    }

    get hasSkips(): boolean {
        return this.skipEntries.length > 0;
    }

    get createTitle(): string {
        const records = recordCount(this.createCount);
        return this.isComplete ? `Created · ${records}` : `Will create · ${records}`;
    }

    get skipTitle(): string {
        const records = recordCount(this.skipEntries.length);
        return this.isComplete ? `Skipped · ${records}` : `Will be skipped · ${records}`;
    }

    get initiateLabel(): string {
        return this.createCount === 1 ? 'Add Role' : 'Add Roles';
    }

    get completionMessage(): string {
        return `Roles added · ${this.createCount} created, ${this.skipEntries.length} skipped.`;
    }

    get createColumns(): object[] {
        return this.columns(this.isComplete ? 'Outcome' : 'Status');
    }

    get skipColumns(): object[] {
        return this.columns(this.isComplete ? 'Outcome' : 'Notes');
    }

    columns(lastLabel: string): object[] {
        return [
            linkColumn('Request ID', 'requestId', 'view_request'),
            linkColumn('Program Name', 'programName', 'view_program'),
            { label: 'Program Type', fieldName: 'programType', initialWidth: PROGRAM_TYPE_COLUMN },
            { label: 'Role Type', fieldName: 'roleType', initialWidth: WIDE_COLUMN },
            { label: 'User', fieldName: 'user', initialWidth: WIDE_COLUMN },
            { label: lastLabel, fieldName: 'note', type: 'note', typeAttributes: NOTE_TYPE_ATTRIBUTES }
        ];
    }

    get createRows(): Array<Record<string, unknown>> {
        const note = this.isComplete ? 'Created' : 'Will create';
        return this.createEntries.map((entry) => ({ ...entry, note, ...SUCCESS_NOTE }));
    }

    get skipRows(): Array<Record<string, unknown>> {
        return this.skipEntries.map((entry) => ({ ...entry, note: entry.skipReason, ...WARNING_NOTE }));
    }

    get isInitiateDisabled(): boolean {
        return this.processing || !this.hasCreates;
    }

    // ------------------------------------------------------------- handlers

    handleLinkCellClick(event: LinkCellClickEvent): void {
        event.stopPropagation();
        const { actionName, rowKey } = event.detail;
        const entry = this.entries.find((item) => item.id === rowKey);
        if (!entry) {
            return;
        }
        if (actionName === 'view_request') {
            this.dispatchEvent(new CustomEvent('requestselect', { detail: { recordId: entry.requestId, requestId: entry.requestId } }));
        } else if (actionName === 'view_program') {
            this.dispatchEvent(
                new CustomEvent('programselect', { detail: { recordId: entry.requestId, programName: entry.programName } })
            );
        }
    }

    /** Back returns to the Add Role popup (the parent reopens it with the same picks). */
    handleBack(): void {
        this.dispatchEvent(new CustomEvent('back'));
    }

    handleCancel(): void {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    handleDone(): void {
        this.dispatchEvent(new CustomEvent('done'));
    }

    handleInitiate(): void {
        if (this.isInitiateDisabled) {
            return;
        }
        this.dispatchEvent(new CustomEvent('initiate'));
    }
}
