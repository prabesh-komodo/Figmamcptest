import { LightningElement, api } from 'lwc';
import LOCALE from '@salesforce/i18n/locale';

/*
 * Batch Detail: the batch's details card plus the role changes and activity
 * reassignments it made. Each role change shows whether it is still in effect
 * (Active), was undone by a reversal (Reversed) or was left in place by one (Skipped).
 */

type Operation = 'replace' | 'deactivate' | 'addrole' | 'reversal';

interface RoleChange {
    id: string;
    roleType: string;
    requestId: string;
    programName: string;
    previousUser: string;
    newUser: string;
    effectiveDate: string;
    /** Set when the change ended a role; its effective date is then that role's end date. */
    endedRoleId?: string;
    /** Add Role only: the date a reversal ended the role this change created. */
    endedOn?: string;
    status: 'Active' | 'Reversed' | 'Skipped';
}

interface ActivityChange {
    id: string;
    activityName: string;
    requestId: string;
    programName: string;
    previousUser: string;
    newUser: string;
    actionTaken: string;
}

/** Shape of the explorer's batch record that this page reads. */
interface Batch {
    batchId: string;
    operation: Operation;
    reversedBatchId?: string;
    reversalBatchId?: string;
    performedBy: string;
    performedOn: string;
    reason: string;
    note: string;
    roleChanges: RoleChange[];
    activityChanges: ActivityChange[];
}

interface LinkCellClickEvent extends CustomEvent {
    detail: { actionName: string; rowKey: string };
}

const OPERATION_TITLES: Record<Operation, string> = {
    replace: 'Bulk Replace',
    deactivate: 'Bulk Deactivate',
    addrole: 'Bulk Add Role',
    reversal: 'Reversal'
};

const BADGE_BASE = 'slds-badge slds-m-around_none slds-p-vertical_none status-badge';
const STATUS_BADGES: Record<RoleChange['status'], string> = {
    Active: `${BADGE_BASE} status-badge_active`,
    Reversed: `${BADGE_BASE} status-badge_active`,
    Skipped: `${BADGE_BASE} status-badge_warning`
};

const NO_VALUE = '-';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dayFormatter = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'numeric', day: 'numeric' });

function linkColumn(label: string, fieldName: string, actionName: string): object {
    return { label, fieldName, type: 'link', typeAttributes: { actionName, rowKey: { fieldName: 'id' } } };
}

export default class RequestUserRoleBatchDetail extends LightningElement {
    @api batch?: Batch;

    get hasBatch(): boolean {
        return Boolean(this.batch);
    }

    get operationTitle(): string {
        const batch = this.batch;
        if (!batch) {
            return '';
        }
        return batch.operation === 'reversal'
            ? `Reversal of ${batch.reversedBatchId ?? ''}`
            : OPERATION_TITLES[batch.operation];
    }

    get performedOnLabel(): string {
        if (!this.batch) {
            return '';
        }
        const when = new Date(this.batch.performedOn);
        return `${dayFormatter.format(when)} · ${timeFormatter.format(when)}`;
    }

    get reasonLabel(): string {
        return this.batch?.reason || NO_VALUE;
    }

    get noteLabel(): string {
        return this.batch?.note || NO_VALUE;
    }

    get reversalBatchId(): string {
        return this.batch?.reversalBatchId ?? '';
    }

    get roleColumns(): object[] {
        return [
            { label: 'Role Type', fieldName: 'roleType' },
            { label: 'Previous User', fieldName: 'previousUserLabel' },
            { label: 'New User', fieldName: 'newUserLabel' },
            linkColumn('Request', 'requestId', 'view_request'),
            linkColumn('Program', 'programName', 'view_program'),
            { label: 'Effective End Date', fieldName: 'effectiveEndDateLabel' },
            {
                label: 'Status',
                fieldName: 'status',
                type: 'statusBadge',
                typeAttributes: { variant: { fieldName: 'statusClass' } }
            }
        ];
    }

    get roleRows(): Array<Record<string, string>> {
        return (this.batch?.roleChanges ?? []).map((change) => ({
            id: change.id,
            roleType: change.roleType,
            previousUserLabel: change.previousUser || NO_VALUE,
            newUserLabel: change.newUser || NO_VALUE,
            requestId: change.requestId,
            programName: change.programName,
            effectiveEndDateLabel: this.endDateLabel(change),
            status: change.status,
            statusClass: STATUS_BADGES[change.status]
        }));
    }

    /**
     * End date of the role a change ended: the batch's effective date when it
     * ended one (replace, de-activate, most reversals), the reversal date for an
     * added role that was later reversed, otherwise none.
     */
    endDateLabel(change: RoleChange): string {
        const endDate = change.endedRoleId ? change.effectiveDate : change.endedOn;
        return endDate ? dateFormatter.format(new Date(`${endDate}T00:00:00Z`)) : NO_VALUE;
    }

    get activityColumns(): object[] {
        return [
            linkColumn('Request', 'requestId', 'view_request'),
            linkColumn('Program', 'programName', 'view_program'),
            { label: 'Activity', fieldName: 'activityName' },
            { label: 'Previous User', fieldName: 'previousUserLabel' },
            { label: 'New User', fieldName: 'newUserLabel' },
            { label: 'Action taken', fieldName: 'actionTaken' }
        ];
    }

    get activityRows(): Array<Record<string, string>> {
        return (this.batch?.activityChanges ?? []).map((change) => ({
            ...change,
            previousUserLabel: change.previousUser || NO_VALUE,
            newUserLabel: change.newUser || NO_VALUE
        }));
    }

    get hasActivities(): boolean {
        return this.activityRows.length > 0;
    }

    handleLinkCellClick(event: LinkCellClickEvent): void {
        event.stopPropagation();
        const { actionName, rowKey } = event.detail;
        const record = [...(this.batch?.roleChanges ?? []), ...(this.batch?.activityChanges ?? [])].find(
            (item) => item.id === rowKey
        );
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
}
