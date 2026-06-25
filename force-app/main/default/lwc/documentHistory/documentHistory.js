import { LightningElement, track } from "lwc";

const MOCK_ACTIVITIES = [
  {
    id: "1",
    title: "Sent for Signature",
    timestamp: "9:05am | 3/11/26",
    actorName: "John Hopkins",
    description: "sent document for signature to requester.",
    detailItems: [{ label: "Requester Name", value: "Esme John" }],
    iconName: "utility:record_update",
    iconVariant: "info"
  },
  {
    id: "2",
    title: "Document Created",
    timestamp: "9:00am | 3/11/26",
    actorName: "John Hopkins",
    description: "created this document.",
    detailItems: [],
    iconName: "utility:edit",
    iconVariant: "success"
  }
];

export default class DocumentHistory extends LightningElement {
  @track expandedIds = ["1"];

  _activityRecords = MOCK_ACTIVITIES;

  get activities() {
    const list = this._activityRecords;
    return list.map((rec, index) => {
      const expanded = this.expandedIds.includes(rec.id);
      const hasDetails = rec.detailItems.length > 0;
      return {
        ...rec,
        expanded,
        chevronIcon: expanded ? "utility:chevrondown" : "utility:chevronright",
        expandedLabel: expanded ? "Collapse" : "Expand",
        showDetails: expanded && hasDetails,
        hasBar: index < list.length - 1,
        itemClass:
          "dh-timeline-item timeline-item_" +
          rec.iconVariant +
          (expanded ? " slds-is-open" : ""),
        iconContainerClass: "timeline-icon timeline-icon_" + rec.iconVariant,
        barClass: "timeline-bar timeline-bar_" + rec.iconVariant
      };
    });
  }

  handleToggle(event) {
    const target = event.currentTarget;
    const id = target?.dataset.id;
    if (!id) return;

    if (this.expandedIds.includes(id)) {
      this.expandedIds = this.expandedIds.filter((x) => x !== id);
    } else {
      this.expandedIds = [...this.expandedIds, id];
    }
  }
}
