import { LightningElement, api } from 'lwc';

/*
 * Full-screen Add Role flow. The role and users are picked in the Add Role
 * popup (step 1), so this page is the Review step, then a processing state and
 * a completion summary.
 *
 * The parent works out which request × user pairs get a new role and which
 * reactivate a role the user held there before (`entries`), applies them when
 * it receives `initiate`, sets `processing` while it works and `batchId` when
 * it is done, which switches the flow to its completion view.
 */

/** `reactivate` when the user already has a de-activated record of this role on the request. */
export type AddRoleAction = 'create' | 'reactivate';

/** One request × user pair. */
export interface AddRoleEntry {
    id: string;
    requestId: string;
    programName: string;
    programType: string;
    role: string;
    user: string;
    action: AddRoleAction;
}

interface LinkCellClickEvent extends CustomEvent {
    detail: { actionName: string; rowKey: string };
}

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
    @api role = '';
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
        return this.entries.filter((entry) => entry.action === 'create');
    }

    get reactivateEntries(): AddRoleEntry[] {
        return this.entries.filter((entry) => entry.action === 'reactivate');
    }

    get hasCreates(): boolean {
        return this.createEntries.length > 0;
    }

    get hasReactivations(): boolean {
        return this.reactivateEntries.length > 0;
    }

    get hasEntries(): boolean {
        return this.entries.length > 0;
    }

    get hasNoEntries(): boolean {
        return !this.hasEntries;
    }

    get createTitle(): string {
        const records = recordCount(this.createEntries.length);
        return this.isComplete ? `Created · ${records}` : `Will create · ${records}`;
    }

    get reactivateTitle(): string {
        const records = recordCount(this.reactivateEntries.length);
        return this.isComplete ? `Reactivated · ${records}` : `Will be reactivated · ${records}`;
    }

    get initiateLabel(): string {
        return this.entries.length === 1 ? 'Add Role' : 'Add Roles';
    }

    get completionMessage(): string {
        return `Roles added · ${this.createEntries.length} created, ${this.reactivateEntries.length} reactivated.`;
    }

    get tableColumns(): object[] {
        return this.columns(this.isComplete ? 'Outcome' : 'Status');
    }

    columns(lastLabel: string): object[] {
        return [
            linkColumn('Request ID', 'requestId', 'view_request'),
            linkColumn('Program Name', 'programName', 'view_program'),
            { label: 'Program Type', fieldName: 'programType', initialWidth: PROGRAM_TYPE_COLUMN },
            { label: 'Role', fieldName: 'role', initialWidth: WIDE_COLUMN },
            { label: 'User', fieldName: 'user', initialWidth: WIDE_COLUMN },
            { label: lastLabel, fieldName: 'note', type: 'note', typeAttributes: NOTE_TYPE_ATTRIBUTES }
        ];
    }

    get createRows(): Array<Record<string, unknown>> {
        const note = this.isComplete ? 'Created' : 'Will create';
        return this.createEntries.map((entry) => ({ ...entry, note, ...SUCCESS_NOTE }));
    }

    get reactivateRows(): Array<Record<string, unknown>> {
        const note = this.isComplete ? 'Reactivated' : 'Will reactivate';
        return this.reactivateEntries.map((entry) => ({ ...entry, note, ...SUCCESS_NOTE }));
    }

    get isInitiateDisabled(): boolean {
        return this.processing || !this.hasEntries;
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
