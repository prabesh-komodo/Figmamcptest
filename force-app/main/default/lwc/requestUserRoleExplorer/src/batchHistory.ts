import type { RequestActivity, RequestRecord, RequestUserRole } from './requestUserRoleExplorer';

/*
 * Batch history: every Replace, De-activate, Add Role and Reversal run is
 * recorded as a batch listing exactly which role records and activities it
 * changed. A batch can be reversed only where the records still look the way
 * the batch left them.
 */

export type BatchOperation = 'replace' | 'deactivate' | 'addrole' | 'reversal';

/** State of one change inside a batch: still in effect, undone by a reversal, or left in place by one. */
export type BatchChangeStatus = 'Active' | 'Reversed' | 'Skipped';

export interface BatchRoleChange {
    id: string;
    roleType: string;
    requestId: string;
    programName: string;
    /** '' when nobody held the role before (Add Role). */
    previousUser: string;
    /** '' when nobody holds the role after (De-activate). */
    newUser: string;
    /** ISO date the change took effect. */
    effectiveDate: string;
    /** Role record the batch ended (replace, de-activate) or reactivated (reversal). */
    endedRoleId?: string;
    /** Role record the batch created or reactivated (replace, add role, reversal of a de-activation). */
    activeRoleId?: string;
    /** Add Role only: the date a reversal ended the role this change created. */
    endedOn?: string;
    status: BatchChangeStatus;
}

export interface BatchActivityChange {
    id: string;
    activityId: string;
    activityName: string;
    requestId: string;
    programName: string;
    previousUser: string;
    /** '' when the activity was left with the previous user ("Do Nothing"). */
    newUser: string;
    actionTaken: string;
}

export interface BatchRecord {
    batchId: string;
    operation: BatchOperation;
    /** For a reversal: the batch it reversed. */
    reversedBatchId?: string;
    /** For a reversed batch: the reversal batch. */
    reversalBatchId?: string;
    performedBy: string;
    /** ISO date-time. */
    performedOn: string;
    reason: string;
    note: string;
    roleChanges: BatchRoleChange[];
    activityChanges: BatchActivityChange[];
}

/** One row of the reversal review: what reversing a role change would do, or why it can't. */
export interface ReversalEntry {
    id: string;
    roleType: string;
    requestId: string;
    programName: string;
    currentUser: string;
    revertingTo: string;
    effectiveDate: string;
    skipReason: string;
}

export const SKIP_MANUAL_UPDATE = 'Manual updates have been made since this batch';
export const SKIP_REQUEST_CLOSED = 'Request closed / locked';

/** Requests in these statuses are closed, so no batch can change their roles. */
export const CLOSED_REQUEST_STATUSES = new Set(['Closed', 'Complete', 'Completed', 'Cancelled']);

export const OPERATION_LABELS: Record<Exclude<BatchOperation, 'reversal'>, { list: string; title: string }> = {
    replace: { list: 'Replace', title: 'Bulk Replace' },
    deactivate: { list: 'Deactivate', title: 'Bulk Deactivate' },
    addrole: { list: 'Add Role', title: 'Bulk Add Role' }
};

export function operationLabel(batch: BatchRecord, variant: 'list' | 'title'): string {
    if (batch.operation === 'reversal') {
        return `Reversal of ${batch.reversedBatchId ?? ''}`;
    }
    return OPERATION_LABELS[batch.operation][variant];
}

/** Next free BAT-#### id after every recorded batch. */
export function nextBatchId(batches: BatchRecord[]): string {
    const highest = batches.reduce((max, batch) => Math.max(max, Number(batch.batchId.replace(/\D/g, '')) || 0), 100);
    return `BAT-${String(highest + 1).padStart(4, '0')}`;
}

/** A batch can be reversed once, and reversals themselves can't be reversed. */
export function isReversible(batch: BatchRecord): boolean {
    return batch.operation !== 'reversal' && !batch.reversalBatchId;
}

/**
 * Works out, per role change of `batch`, whether reversing it is still safe:
 * the request must be open and the records must still be as the batch left them.
 */
export function planReversal(
    batch: BatchRecord,
    roles: RequestUserRole[],
    requests: RequestRecord[],
    effectiveDate: string
): ReversalEntry[] {
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    const closedRequests = new Set(
        requests.filter((request) => CLOSED_REQUEST_STATUSES.has(request.requestStatus)).map((r) => r.requestId)
    );
    return batch.roleChanges.map((change) => {
        const ended = change.endedRoleId ? rolesById.get(change.endedRoleId) : undefined;
        const active = change.activeRoleId ? rolesById.get(change.activeRoleId) : undefined;
        let unchanged = true;
        if (change.endedRoleId) {
            unchanged = unchanged && ended?.roleStatus === 'Inactive';
        }
        if (change.activeRoleId) {
            unchanged = unchanged && active?.roleStatus === 'Active' && active.assignedUser === change.newUser;
        }
        let skipReason = '';
        if (closedRequests.has(change.requestId)) {
            skipReason = SKIP_REQUEST_CLOSED;
        } else if (!unchanged) {
            skipReason = SKIP_MANUAL_UPDATE;
        }
        return {
            id: change.id,
            roleType: change.roleType,
            requestId: change.requestId,
            programName: change.programName,
            currentUser: change.newUser,
            revertingTo: change.previousUser,
            effectiveDate,
            skipReason
        };
    });
}

export interface ReversalResult {
    roles: RequestUserRole[];
    activities: RequestActivity[];
    batches: BatchRecord[];
    reversal: BatchRecord;
}

/**
 * Applies the reversible entries: roles the batch made active are ended, roles
 * it ended are made active again, and activities it handed over go back to
 * their previous owner (when nobody has moved them since). Records the
 * reversal as a new batch and marks the original batch's changes.
 */
export function applyReversal(
    batch: BatchRecord,
    entries: ReversalEntry[],
    context: { roles: RequestUserRole[]; activities: RequestActivity[]; batches: BatchRecord[] },
    reversal: { batchId: string; performedBy: string; performedOn: string; reason: string; note: string }
): ReversalResult {
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const toReverse = batch.roleChanges.filter((change) => {
        const entry = entriesById.get(change.id);
        return entry && !entry.skipReason;
    });

    const endDates = new Map<string, string>();
    const reactivate = new Set<string>();
    toReverse.forEach((change) => {
        const date = entriesById.get(change.id)?.effectiveDate ?? '';
        if (change.activeRoleId) {
            endDates.set(change.activeRoleId, date);
        }
        if (change.endedRoleId) {
            reactivate.add(change.endedRoleId);
        }
    });
    const roles = context.roles.map((role) => {
        if (endDates.has(role.id)) {
            return { ...role, roleStatus: 'Inactive', effectiveEndDate: endDates.get(role.id) };
        }
        if (reactivate.has(role.id)) {
            return { ...role, roleStatus: 'Active', effectiveEndDate: null };
        }
        return role;
    });

    // Hand reassigned activities back, but only those on a reversed role that still sit with the new owner.
    const reversedRoleIds = new Set(toReverse.map((change) => change.endedRoleId).filter(Boolean));
    const activityById = new Map(context.activities.map((activity) => [activity.id, activity]));
    const handBack = batch.activityChanges.filter((change) => {
        const activity = activityById.get(change.activityId);
        return change.newUser && activity && reversedRoleIds.has(activity.roleId) && activity.assignedUser === change.newUser;
    });
    const handBackById = new Map(handBack.map((change) => [change.activityId, change.previousUser]));
    const activities = context.activities.map((activity) => {
        const previous = handBackById.get(activity.id);
        return previous ? { ...activity, assignedUser: previous } : activity;
    });

    const reversalRecord: BatchRecord = {
        batchId: reversal.batchId,
        operation: 'reversal',
        reversedBatchId: batch.batchId,
        performedBy: reversal.performedBy,
        performedOn: reversal.performedOn,
        reason: reversal.reason,
        note: reversal.note,
        roleChanges: toReverse.map((change) => ({
            id: `${reversal.batchId}-${change.id}`,
            roleType: change.roleType,
            requestId: change.requestId,
            programName: change.programName,
            previousUser: change.newUser,
            newUser: change.previousUser,
            effectiveDate: entriesById.get(change.id)?.effectiveDate ?? '',
            endedRoleId: change.activeRoleId,
            activeRoleId: change.endedRoleId,
            status: 'Active'
        })),
        activityChanges: handBack.map((change) => ({
            ...change,
            id: `${reversal.batchId}-${change.id}`,
            previousUser: change.newUser,
            newUser: change.previousUser,
            actionTaken: 'Returned to Previous User'
        }))
    };

    const reversedIds = new Set(toReverse.map((change) => change.id));
    const updatedOriginal: BatchRecord = {
        ...batch,
        reversalBatchId: reversal.batchId,
        roleChanges: batch.roleChanges.map((change) => {
            const reversed = reversedIds.has(change.id);
            const endedOn =
                reversed && !change.endedRoleId ? entriesById.get(change.id)?.effectiveDate : change.endedOn;
            return { ...change, endedOn, status: reversed ? 'Reversed' : 'Skipped' };
        })
    };
    const batches = [
        ...context.batches.map((item) => (item.batchId === batch.batchId ? updatedOriginal : item)),
        reversalRecord
    ];
    return { roles, activities, batches, reversal: reversalRecord };
}
