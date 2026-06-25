import { LightningElement, track } from 'lwc';

interface ActivityDetailItem {
    label: string;
    value: string;
}

type IconVariant = 'info' | 'success';

interface ActivityRecord {
    id: string;
    title: string;
    timestamp: string;
    actorName: string;
    description: string;
    detailItems: ActivityDetailItem[];
    iconName: string;
    iconVariant: IconVariant;
}

interface ActivityViewModel extends ActivityRecord {
    expanded: boolean;
    chevronIcon: string;
    expandedLabel: string;
    showDetails: boolean;
    hasBar: boolean;
    itemClass: string;
    iconContainerClass: string;
    barClass: string;
}

const MOCK_ACTIVITIES: ActivityRecord[] = [
    {
        id: '1',
        title: 'Sent for Signature',
        timestamp: '9:05am | 3/11/26',
        actorName: 'John Hopkins',
        description: 'sent document for signature to requester.',
        detailItems: [{ label: 'Requester Name', value: 'Esme John' }],
        iconName: 'utility:record_update',
        iconVariant: 'info'
    },
    {
        id: '2',
        title: 'Document Created',
        timestamp: '9:00am | 3/11/26',
        actorName: 'John Hopkins',
        description: 'created this document.',
        detailItems: [],
        iconName: 'utility:edit',
        iconVariant: 'success'
    }
];

export default class DocumentHistory extends LightningElement {
    @track expandedIds: string[] = ['1'];

    private _activityRecords: ActivityRecord[] = MOCK_ACTIVITIES;

    get activities(): ActivityViewModel[] {
        const list = this._activityRecords;
        return list.map((rec, index) => {
            const expanded = this.expandedIds.includes(rec.id);
            const hasDetails = rec.detailItems.length > 0;
            return {
                ...rec,
                expanded,
                chevronIcon: expanded
                    ? 'utility:chevrondown'
                    : 'utility:chevronright',
                expandedLabel: expanded ? 'Collapse' : 'Expand',
                showDetails: expanded && hasDetails,
                hasBar: index < list.length - 1,
                itemClass:
                    'dh-timeline-item timeline-item_' +
                    rec.iconVariant +
                    (expanded ? ' slds-is-open' : ''),
                iconContainerClass:
                    'timeline-icon timeline-icon_' + rec.iconVariant,
                barClass: 'timeline-bar timeline-bar_' + rec.iconVariant
            };
        });
    }

    handleToggle(event: Event): void {
        const target = event.currentTarget as HTMLElement;
        const id = target?.dataset.id;
        if (!id) return;

        if (this.expandedIds.includes(id)) {
            this.expandedIds = this.expandedIds.filter((x) => x !== id);
        } else {
            this.expandedIds = [...this.expandedIds, id];
        }
    }
}
