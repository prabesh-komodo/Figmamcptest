import { LightningElement, api } from 'lwc';
import LOCALE from '@salesforce/i18n/locale';

/*
 * Full-screen Replace User flow: Assign users → Resolve activities → Review,
 * then a processing state and a completion summary.
 *
 * The flow only collects decisions. The parent performs the replacement when
 * it receives `initiate`, sets `processing` while it works and `batchId` when
 * it is done, which switches the flow to its completion view.
 */

export interface FlowRole {
    id: string;
    roleName: string;
    roleType: string;
    requestId: string;
    programName: string;
    assignedUser: string;
}

export interface FlowActivity {
    id: string;
    activityName: string;
    roleId: string;
    requestId: string;
    programName: string;
    assignedUser: string;
}

export type ActivityAction = 'assign' | 'none';

export interface InitiateDetail {
    reason: string;
    note: string;
    replacements: Array<{ roleId: string; newUser: string }>;
    activityActions: Array<{ activityId: string; action: ActivityAction; newUser: string }>;
}

type StepKey = 'assign' | 'activities' | 'review';

interface StepViewModel {
    key: StepKey;
    label: string;
    marker: string;
    markerClass: string;
    labelClass: string;
    ariaCurrent: string | null;
    assistiveText: string;
    showConnector: boolean;
}

// Incoming events
interface RowSelectionEvent extends CustomEvent {
    detail: { selectedRows: Array<{ id: string }> };
}

// From c-request-user-role-explorer-edit-cell (pencil button inside a datatable cell).
interface CellEditEvent extends CustomEvent {
    detail: { rowKey: string; fieldKey: EditField; top: number; left: number; width: number; height: number };
}

interface ValueChangeEvent extends CustomEvent {
    detail: { value: string };
}

type EditField = 'replaceWith' | 'action';

/** The single-row editor popover currently open over a cell. */
interface CellEditor {
    rowKey: string;
    fieldKey: EditField;
    label: string;
    placeholder: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    top: number;
    left: number;
    width: number;
}

interface LookupChangeEvent extends CustomEvent {
    detail: { value: string };
}

interface LinkCellClickEvent extends CustomEvent {
    detail: { actionName: string; rowKey: string };
}

const STEP_LABELS: Record<StepKey, string> = {
    assign: 'Assign users',
    activities: 'Resolve activities',
    review: 'Review'
};

const ACTION_LABELS: Record<ActivityAction, string> = {
    assign: 'Assign to Replacing User',
    none: 'Do Nothing'
};

const ACTION_OPTIONS = (Object.keys(ACTION_LABELS) as ActivityAction[]).map((value) => ({
    label: ACTION_LABELS[value],
    value
}));

// The editor popover overlaps the cell's padding so it lines up with the cell edges.
const EDITOR_INSET = 8;

const PENDING_ACTIVITIES_NOTE = 'Pending Activities';
const DO_NOTHING_NOTE = 'User may lose access to complete this task. Reassign later if needed.';
const REPLACED_NOTE = 'Replaced';
const RESOLVED_NOTE = 'Resolved';
const EMPTY_VALUE = '-';

const WARNING_NOTE = { noteIcon: 'utility:warning', noteIconVariant: 'warning', noteTextClass: 'note-text_warning' };
const SUCCESS_NOTE = { noteIcon: 'utility:success', noteIconVariant: 'success', noteTextClass: 'note-text_success' };
const PLAIN_NOTE = { noteIcon: '', noteIconVariant: '', noteTextClass: '' };

const NOTE_TYPE_ATTRIBUTES = {
    iconName: { fieldName: 'noteIcon' },
    iconVariant: { fieldName: 'noteIconVariant' },
    textClass: { fieldName: 'noteTextClass' }
};

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC'
});

// Column widths (px) from the Bulk Flow design; Notes takes the remaining width.
const WIDE_COLUMN = 212;
const ACTIVITY_COLUMN = 247;
const REQUEST_COLUMN = 115;
const USER_COLUMN = 160;

function linkColumn(label: string, fieldName: string, actionName: string, initialWidth: number): object {
    return {
        label,
        fieldName,
        type: 'link',
        initialWidth,
        typeAttributes: { actionName, rowKey: { fieldName: 'id' } }
    };
}

function scopeSummary(roles: FlowRole[]): string {
    const requests = new Set(roles.map((role) => role.requestId)).size;
    const roleTypes = new Set(roles.map((role) => role.roleType)).size;
    return `${requests} distinct request(s) · ${roleTypes} role type(s) · ${roles.length} record(s)`;
}

export default class RequestUserRoleReplaceFlow extends LightningElement {
    @api currentUser = '';
    @api reason = '';
    @api note = '';
    @api users: string[] = [];

    /** True while the parent is applying the replacement ("Replacing Records"). */
    @api processing = false;

    /** Set by the parent once the replacement is done; switches to the completion view. */
    @api batchId = '';

    /** ISO date the replacement took effect; shown as the new roles' start date. */
    @api effectiveDate = '';

    @api
    get roles(): FlowRole[] {
        return this.flowRoles;
    }
    set roles(value: FlowRole[]) {
        this.flowRoles = value ?? [];
        // Every role starts selected so one "Assign" covers the common case.
        this.selectedRoleIds = this.flowRoles.map((role) => role.id);
    }

    @api activities: FlowActivity[] = [];

    flowRoles: FlowRole[] = [];
    step: StepKey = 'assign';
    selectedRoleIds: string[] = [];
    selectedActivityIds: string[] = [];
    replaceWith: Record<string, string> = {};
    activityActions: Record<string, ActivityAction> = {};
    bulkUser = '';
    bulkAction: ActivityAction | '' = '';
    editor: CellEditor | null = null;
    activitySelectionInitialized = false;

    // --------------------------------------------------------------- state

    get isComplete(): boolean {
        return Boolean(this.batchId);
    }

    get pendingActivities(): FlowActivity[] {
        const roleIds = new Set(this.flowRoles.map((role) => role.id));
        return this.activities.filter((activity) => roleIds.has(activity.roleId));
    }

    get hasActivities(): boolean {
        return this.pendingActivities.length > 0;
    }

    get stepKeys(): StepKey[] {
        return this.hasActivities ? ['assign', 'activities', 'review'] : ['assign', 'review'];
    }

    get isAssignStep(): boolean {
        return !this.isComplete && this.step === 'assign';
    }

    get isActivitiesStep(): boolean {
        return !this.isComplete && this.step === 'activities';
    }

    get isReviewStep(): boolean {
        return !this.isComplete && this.step === 'review';
    }

    /** Review and completion both show the read-only Roles + Activities summary. */
    get isSummary(): boolean {
        return this.isComplete || this.step === 'review';
    }

    get showStepper(): boolean {
        return !this.isComplete;
    }

    get showBackButton(): boolean {
        return !this.isComplete && this.step !== 'assign';
    }

    get scopeLabel(): string {
        return scopeSummary(this.flowRoles);
    }

    get steps(): StepViewModel[] {
        const currentIndex = this.stepKeys.indexOf(this.step);
        return this.stepKeys.map((key, index) => {
            const state = index < currentIndex ? 'completed' : index === currentIndex ? 'active' : 'upcoming';
            return {
                key,
                label: STEP_LABELS[key],
                marker: state === 'completed' ? '✓' : String(index + 1),
                markerClass: `slds-grid slds-grid_align-center slds-grid_vertical-align-center slds-shrink-none stepper__marker stepper__marker_${state}`,
                labelClass: `slds-m-left_xx-small stepper__label stepper__label_${state}`,
                ariaCurrent: state === 'active' ? 'step' : null,
                assistiveText: state === 'completed' ? ' (completed)' : '',
                showConnector: index > 0
            };
        });
    }

    // -------------------------------------------------------- assign users

    get replacementOptions(): Array<{ label: string; value: string }> {
        return this.replacementUsers.map((user) => ({ label: user, value: user }));
    }

    get replacementUsers(): string[] {
        return this.users.filter((user) => user !== this.currentUser);
    }

    get selectedRoleCount(): number {
        return this.selectedRoleIds.length;
    }

    get hasRoleSelection(): boolean {
        return this.selectedRoleCount > 0;
    }

    /** Blue bar with the bulk controls while rows are selected; plain "Request User Roles" title otherwise. */
    get roleBarClass(): string {
        const base =
            'slds-grid slds-grid_vertical-align-center slds-border_bottom slds-p-horizontal_small selection-bar';
        return this.hasRoleSelection ? `${base} selection-bar_active` : base;
    }

    get selectedRoleLabel(): string {
        return `${this.selectedRoleCount} selected`;
    }

    get isAssignDisabled(): boolean {
        return !this.bulkUser || this.selectedRoleCount === 0;
    }

    get rolesWithActivities(): Set<string> {
        return new Set(this.pendingActivities.map((activity) => activity.roleId));
    }

    get roleColumns(): object[] {
        const columns: object[] = [
            { label: 'Role Name', fieldName: 'roleName', initialWidth: WIDE_COLUMN },
            { label: 'Role Type', fieldName: 'roleType', initialWidth: WIDE_COLUMN },
            linkColumn('Request', 'requestId', 'view_request', REQUEST_COLUMN),
            linkColumn('Program Name', 'programName', 'view_program', WIDE_COLUMN),
            { label: 'Current User', fieldName: 'assignedUser', initialWidth: WIDE_COLUMN },
            {
                label: 'Replace With',
                fieldName: 'replaceWith',
                type: 'editCell',
                initialWidth: WIDE_COLUMN,
                typeAttributes: {
                    placeholder: this.isAssignStep ? 'Select User' : '',
                    label: 'Replace With',
                    fieldKey: 'replaceWith',
                    editable: this.isAssignStep,
                    rowKey: { fieldName: 'id' }
                }
            }
        ];
        if (this.isComplete) {
            columns.push({ label: 'Effective Start Date', fieldName: 'effectiveStartDateLabel', initialWidth: WIDE_COLUMN });
        }
        columns.push({
            label: this.isComplete ? 'Outcome' : 'Notes',
            fieldName: 'note',
            type: 'note',
            typeAttributes: NOTE_TYPE_ATTRIBUTES
        });
        return columns;
    }

    get roleRows(): Array<Record<string, unknown>> {
        const withActivities = this.rolesWithActivities;
        const effectiveStart = this.effectiveDate
            ? dateFormatter.format(new Date(`${this.effectiveDate}T00:00:00Z`))
            : EMPTY_VALUE;
        return this.flowRoles.map((role) => {
            let note: Record<string, string> = { note: '', ...PLAIN_NOTE };
            if (this.isComplete) {
                note = { note: REPLACED_NOTE, ...SUCCESS_NOTE };
            } else if (withActivities.has(role.id)) {
                note = { note: PENDING_ACTIVITIES_NOTE, ...WARNING_NOTE };
            }
            return {
                ...role,
                replaceWith: this.replaceWith[role.id] ?? '',
                effectiveStartDateLabel: effectiveStart,
                ...note
            };
        });
    }

    get isAssignNextDisabled(): boolean {
        return this.flowRoles.some((role) => !this.replaceWith[role.id]);
    }

    get assignNextLabel(): string {
        return this.hasActivities ? 'Next: Resolve Activities' : 'Next: Review';
    }

    // ---------------------------------------------------- resolve activities

    get activityColumns(): object[] {
        const editable = this.isActivitiesStep;
        return [
            { label: 'Activity', fieldName: 'activityName', initialWidth: ACTIVITY_COLUMN },
            linkColumn('Request', 'requestId', 'view_request', REQUEST_COLUMN),
            linkColumn('Program Name', 'programName', 'view_program', ACTIVITY_COLUMN),
            { label: 'Current User', fieldName: 'assignedUser', initialWidth: USER_COLUMN },
            { label: 'Replacing User', fieldName: 'replacingUser', initialWidth: USER_COLUMN },
            {
                label: 'Action',
                fieldName: 'actionLabel',
                type: 'editCell',
                initialWidth: ACTIVITY_COLUMN,
                typeAttributes: {
                    placeholder: editable ? 'Select Action' : '',
                    label: 'Action',
                    fieldKey: 'action',
                    editable,
                    rowKey: { fieldName: 'id' }
                }
            },
            {
                label: this.isComplete ? 'Outcome' : 'Notes',
                fieldName: 'note',
                type: 'note',
                typeAttributes: NOTE_TYPE_ATTRIBUTES
            }
        ];
    }

    get activityRows(): Array<Record<string, unknown>> {
        return this.pendingActivities.map((activity) => {
            const action = this.activityActions[activity.id];
            return {
                ...activity,
                // Only an activity being handed over has a replacing user; "Do Nothing" stays with the current user.
                replacingUser: action === 'assign' ? (this.replaceWith[activity.roleId] ?? '') : '',
                actionLabel: action ? ACTION_LABELS[action] : '',
                ...this.activityNote(activity, action)
            };
        });
    }

    /**
     * "Do Nothing" warns that the user may lose access; once the replacement is
     * done it says who the activity was left with. Reassigned activities are resolved.
     */
    activityNote(activity: FlowActivity, action: ActivityAction | undefined): Record<string, string> {
        if (!action) {
            return { note: '', ...PLAIN_NOTE };
        }
        if (this.isComplete) {
            return action === 'none'
                ? { note: `Left with ${activity.assignedUser}, who may lose access`, ...WARNING_NOTE }
                : { note: RESOLVED_NOTE, ...SUCCESS_NOTE };
        }
        return action === 'none' ? { note: DO_NOTHING_NOTE, ...WARNING_NOTE } : { note: EMPTY_VALUE, ...PLAIN_NOTE };
    }

    get rolesTitle(): string {
        return `Roles · ${this.flowRoles.length} ${this.flowRoles.length === 1 ? 'record' : 'records'}`;
    }

    get activitiesTitle(): string {
        const count = this.pendingActivities.length;
        return `Activities · ${count} ${count === 1 ? 'record' : 'records'}`;
    }

    get actionLabels(): string[] {
        return ACTION_OPTIONS.map((option) => option.label);
    }

    get bulkActionLabel(): string {
        return this.bulkAction ? ACTION_LABELS[this.bulkAction] : '';
    }

    get hasActivitySelection(): boolean {
        return this.selectedActivityIds.length > 0;
    }

    get activityBarClass(): string {
        const base =
            'slds-grid slds-grid_vertical-align-center slds-border_bottom slds-p-horizontal_small selection-bar';
        return this.hasActivitySelection ? `${base} selection-bar_active` : base;
    }

    get selectedActivityLabel(): string {
        return `${this.selectedActivityIds.length} selected`;
    }

    get isApplyDisabled(): boolean {
        return !this.bulkAction || this.selectedActivityIds.length === 0;
    }

    get isActivitiesNextDisabled(): boolean {
        return this.pendingActivities.some((activity) => !this.activityActions[activity.id]);
    }

    // ------------------------------------------------------------- handlers

    handleRoleSelection(event: RowSelectionEvent): void {
        this.selectedRoleIds = event.detail.selectedRows.map((row) => row.id);
    }

    handleActivitySelection(event: RowSelectionEvent): void {
        this.selectedActivityIds = event.detail.selectedRows.map((row) => row.id);
    }

    handleBulkUserChange(event: LookupChangeEvent): void {
        this.bulkUser = event.detail.value;
    }

    handleAssign(): void {
        if (this.isAssignDisabled) {
            return;
        }
        const updates = Object.fromEntries(this.selectedRoleIds.map((id) => [id, this.bulkUser]));
        this.replaceWith = { ...this.replaceWith, ...updates };
    }

    handleClearRoleSelection(): void {
        this.selectedRoleIds = [];
    }

    /** The selection bar's picklist works with labels; map back to the action key. */
    handleBulkActionChange(event: ValueChangeEvent): void {
        const option = ACTION_OPTIONS.find((item) => item.label === event.detail.value);
        this.bulkAction = (option?.value as ActivityAction) ?? '';
    }

    handleApplyAction(): void {
        if (this.isApplyDisabled) {
            return;
        }
        const action = this.bulkAction as ActivityAction;
        const updates = Object.fromEntries(this.selectedActivityIds.map((id) => [id, action]));
        this.activityActions = { ...this.activityActions, ...updates };
    }

    handleClearActivitySelection(): void {
        this.selectedActivityIds = [];
    }

    // -------------------------------------------------- single-row editor

    /** Pencil in a Replace With / Action cell: open the editor popover over that cell. */
    handleCellEdit(event: CellEditEvent): void {
        event.stopPropagation();
        const { rowKey, fieldKey, top, left, width } = event.detail;
        const isUser = fieldKey === 'replaceWith';
        const role = this.flowRoles.find((item) => item.id === rowKey);
        this.editor = {
            rowKey,
            fieldKey,
            label: isUser ? `Replace With for ${role?.roleName ?? 'role'}` : 'Action',
            placeholder: isUser ? 'Select User...' : 'Select Action...',
            value: isUser ? (this.replaceWith[rowKey] ?? '') : (this.activityActions[rowKey] ?? ''),
            options: isUser ? this.replacementOptions : ACTION_OPTIONS,
            top: top - EDITOR_INSET / 2,
            left: left - EDITOR_INSET,
            width: width + EDITOR_INSET * 2
        };
    }

    renderedCallback(): void {
        const popover = this.template.querySelector('.cell-editor') as HTMLElement | null;
        if (!popover || !this.editor || popover.dataset.positioned === this.editor.rowKey + this.editor.fieldKey) {
            return;
        }
        // custom: no SLDS equivalent — the popover is fixed over the edited cell, so its
        // position comes from the cell's viewport rectangle at click time.
        popover.style.setProperty('--c-editor-top', `${this.editor.top}px`);
        popover.style.setProperty('--c-editor-left', `${this.editor.left}px`);
        popover.style.setProperty('--c-editor-width', `${this.editor.width}px`);
        popover.dataset.positioned = this.editor.rowKey + this.editor.fieldKey;
        const combobox = popover.querySelector('lightning-combobox') as HTMLElement | null;
        combobox?.focus();
    }

    handleEditorChange(event: ValueChangeEvent): void {
        const editor = this.editor;
        if (!editor) {
            return;
        }
        const value = event.detail.value;
        if (editor.fieldKey === 'replaceWith') {
            this.replaceWith = { ...this.replaceWith, [editor.rowKey]: value };
        } else {
            this.activityActions = { ...this.activityActions, [editor.rowKey]: value as ActivityAction };
        }
        this.editor = null;
    }

    handleEditorDismiss(): void {
        this.editor = null;
    }

    handleEditorKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.editor = null;
        }
    }

    handleLinkCellClick(event: LinkCellClickEvent): void {
        event.stopPropagation();
        const { actionName, rowKey } = event.detail;
        const record = [...this.flowRoles, ...this.pendingActivities].find((item) => item.id === rowKey);
        if (!record) {
            return;
        }
        if (actionName === 'view_request') {
            this.dispatchEvent(new CustomEvent('requestselect', { detail: { recordId: record.id, requestId: record.requestId } }));
        } else if (actionName === 'view_program') {
            this.dispatchEvent(
                new CustomEvent('programselect', { detail: { recordId: record.id, programName: record.programName } })
            );
        }
    }

    handleNextFromAssign(): void {
        if (this.isAssignNextDisabled) {
            return;
        }
        if (this.hasActivities && !this.activitySelectionInitialized) {
            // Like the roles step, every activity starts selected so one "Apply" covers the common case.
            this.selectedActivityIds = this.pendingActivities.map((activity) => activity.id);
            this.activitySelectionInitialized = true;
        }
        this.step = this.hasActivities ? 'activities' : 'review';
    }

    handleNextFromActivities(): void {
        if (this.isActivitiesNextDisabled) {
            return;
        }
        this.step = 'review';
    }

    handleBack(): void {
        const index = this.stepKeys.indexOf(this.step);
        this.step = this.stepKeys[Math.max(0, index - 1)];
    }

    handleCancel(): void {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    handleDone(): void {
        this.dispatchEvent(new CustomEvent('done'));
    }

    handleInitiate(): void {
        if (this.processing) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent<InitiateDetail>('initiate', {
                detail: {
                    reason: this.reason,
                    note: this.note,
                    replacements: this.flowRoles.map((role) => ({ roleId: role.id, newUser: this.replaceWith[role.id] })),
                    activityActions: this.pendingActivities.map((activity) => ({
                        activityId: activity.id,
                        action: this.activityActions[activity.id],
                        newUser: this.replaceWith[activity.roleId]
                    }))
                }
            })
        );
    }
}
