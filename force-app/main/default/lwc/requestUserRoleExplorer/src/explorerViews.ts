import LOCALE from '@salesforce/i18n/locale';
import type {
    ExplorerRecord,
    ExplorerView,
    RequestRecord,
    RequestUserRole
} from './requestUserRoleExplorer';

/*
 * Per-view configuration for the explorer. Both views share one template and
 * one set of filter/sort/selection/pagination logic; everything that differs
 * between "Request User Roles" and "Requests" lives here.
 */

export interface FilterDefinition {
    key: string;
    label: string;
}

export interface SearchDefinition {
    /** Record field the free-text search matches against (case-insensitive substring). */
    key: string;
    label: string;
    placeholder: string;
}

export interface SelectionAction {
    /** Name of the CustomEvent dispatched with the selected record IDs. */
    eventName: string;
    label: string;
    variant: 'brand' | 'neutral';
}

export interface Stat {
    key: string;
    label: string;
    value: number;
}

/** Data from outside the active view that some views summarise. */
export interface ViewContext {
    roles: RequestUserRole[];
}

export interface ViewDefinition {
    tableTitle: string;
    regionLabel: string;
    /** Noun used in the pagination summary, e.g. "Showing 1–20 of 70 record(s)". */
    recordNoun: string;
    emptyTitle: string;
    emptyMessage: string;
    columns: object[];
    filters: FilterDefinition[];
    search?: SearchDefinition;
    /** Display columns that sort by a different (raw) field. */
    sortFieldOverrides: Record<string, string>;
    actions: SelectionAction[];
    selectionLabel(selected: number, total: number): string;
    toRow(record: ExplorerRecord): Record<string, unknown>;
    stats(records: ExplorerRecord[], context: ViewContext): Stat[];
}

const EMPTY_VALUE = '-';

const NO_MATCH_TITLE = 'No records match these filters';
const NO_MATCH_MESSAGE =
    'No records are available with the current filters applied. Please consider resetting the filters or trying a different combination.';

// Full class list for the statusBadge cell (datatable custom-type templates cannot concatenate classes).
const STATUS_BADGE_BASE_CLASS = 'slds-badge slds-m-around_none slds-p-vertical_none status-badge';
const STATUS_BADGE_ACTIVE_CLASS = `${STATUS_BADGE_BASE_CLASS} status-badge_active`;
const STATUS_BADGE_INACTIVE_CLASS = `${STATUS_BADGE_BASE_CLASS} status-badge_inactive`;

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC'
});

function formatDate(isoDate?: string | null): string {
    if (!isoDate) {
        return EMPTY_VALUE;
    }
    const date = new Date(`${isoDate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? isoDate : dateFormatter.format(date);
}

function distinctCount<T>(records: T[], field: keyof T): number {
    return new Set(records.map((record) => record[field])).size;
}

function linkColumn(label: string, fieldName: string, actionName: string): object {
    return {
        label,
        fieldName,
        type: 'link',
        sortable: true,
        typeAttributes: { actionName, rowKey: { fieldName: 'id' } }
    };
}

export { NO_MATCH_MESSAGE, NO_MATCH_TITLE };

export const VIEW_DEFINITIONS: Record<ExplorerView, ViewDefinition> = {
    roles: {
        tableTitle: 'Request User Role(s)',
        regionLabel: 'Request user roles',
        recordNoun: 'record(s)',
        emptyTitle: 'No Roles Record Yet.',
        emptyMessage: 'As soon as we begin receiving requests, the role records will become visible.',
        columns: [
            { label: 'Assigned User', fieldName: 'assignedUser', sortable: true },
            { label: 'Role Name', fieldName: 'roleName', sortable: true },
            { label: 'Role Type', fieldName: 'roleType', sortable: true },
            {
                label: 'Role Status',
                fieldName: 'roleStatus',
                type: 'statusBadge',
                sortable: true,
                typeAttributes: { variant: { fieldName: 'roleStatusVariant' } }
            },
            linkColumn('Request ID', 'requestId', 'view_request'),
            { label: 'Request Status', fieldName: 'requestStatus', sortable: true },
            linkColumn('Program Name', 'programName', 'view_program'),
            { label: 'Effective Start Date', fieldName: 'effectiveStartDateLabel', sortable: true },
            { label: 'Effective End Date', fieldName: 'effectiveEndDateLabel', sortable: true }
        ],
        filters: [
            { key: 'assignedUser', label: 'Assigned User' },
            { key: 'roleName', label: 'Role Name' },
            { key: 'roleType', label: 'Role Type' },
            { key: 'roleStatus', label: 'Role Status' },
            { key: 'requestStatus', label: 'Request Status' },
            { key: 'programName', label: 'Program Name' },
            { key: 'products', label: 'Product' },
            { key: 'region', label: 'Region/Country' }
        ],
        sortFieldOverrides: {
            effectiveStartDateLabel: 'effectiveStartDate',
            effectiveEndDateLabel: 'effectiveEndDate'
        },
        actions: [
            { eventName: 'replaceuser', label: 'Replace User', variant: 'brand' },
            { eventName: 'deactivate', label: 'Deactivate', variant: 'neutral' }
        ],
        selectionLabel: (selected) => `${selected} ${selected === 1 ? 'record' : 'records'} selected`,
        toRow: (record) => {
            const role = record as RequestUserRole;
            return {
                ...role,
                roleStatusVariant:
                    role.roleStatus === 'Active' ? STATUS_BADGE_ACTIVE_CLASS : STATUS_BADGE_INACTIVE_CLASS,
                effectiveStartDateLabel: formatDate(role.effectiveStartDate),
                effectiveEndDateLabel: formatDate(role.effectiveEndDate)
            };
        },
        stats: (records) => {
            const roles = records as RequestUserRole[];
            return [
                { key: 'total', label: 'Total Role Record(s)', value: roles.length },
                { key: 'roleTypes', label: 'Distinct Role Type(s)', value: distinctCount(roles, 'roleType') },
                { key: 'requests', label: 'Distinct Request(s)', value: distinctCount(roles, 'requestId') },
                { key: 'users', label: 'Distinct User(s)', value: distinctCount(roles, 'assignedUser') }
            ];
        }
    },

    requests: {
        tableTitle: 'Request(s)',
        regionLabel: 'Requests',
        recordNoun: 'request(s)',
        emptyTitle: 'No Request Record Yet.',
        emptyMessage: 'As soon as we begin receiving requests, the role records will become visible.',
        columns: [
            linkColumn('Request', 'requestId', 'view_request'),
            linkColumn('Program Name', 'programName', 'view_program'),
            { label: 'Program Type', fieldName: 'programType', sortable: true },
            { label: 'Request Status', fieldName: 'requestStatus', sortable: true },
            { label: 'Product', fieldName: 'productLabel', sortable: true },
            { label: 'Region/Country', fieldName: 'region', sortable: true }
        ],
        filters: [
            { key: 'programName', label: 'Program Name' },
            { key: 'requestStatus', label: 'Request Status' },
            { key: 'products', label: 'Product' },
            { key: 'region', label: 'Region/Country' }
        ],
        search: { key: 'requestId', label: 'Request', placeholder: 'Search...' },
        sortFieldOverrides: {},
        actions: [{ eventName: 'addroles', label: 'Add Role', variant: 'brand' }],
        selectionLabel: (selected, total) => `${selected} of ${total} records selected`,
        toRow: (record) => {
            const request = record as RequestRecord;
            return { ...request, productLabel: request.products.join(', ') };
        },
        stats: (records, context) => {
            const requests = records as RequestRecord[];
            const requestIds = new Set(requests.map((request) => request.requestId));
            return [
                { key: 'total', label: 'Total Request(s)', value: requests.length },
                { key: 'programs', label: 'Distinct Program(s)', value: distinctCount(requests, 'programName') },
                { key: 'programTypes', label: 'Program Type(s)', value: distinctCount(requests, 'programType') },
                {
                    key: 'roles',
                    label: 'Role Record(s)',
                    value: context.roles.filter((role) => requestIds.has(role.requestId)).length
                }
            ];
        }
    }
};
