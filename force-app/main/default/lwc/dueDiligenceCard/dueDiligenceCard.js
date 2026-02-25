import { LightningElement, api } from 'lwc';

/**
 * Due Diligence Card – displays a task card with title, description, due date, assignee, and actions.
 * Emits open, transfer, viewactivity, and assignedtoclick for parent handling.
 */
export default class DueDiligenceCard extends LightningElement {
    /** Card/task title (e.g. "Due Diligence") */
    @api title;

    /** Description body text */
    @api description;

    /** Formatted due date (e.g. "04-24-2025") */
    @api dueDate;

    /** Assignee record Id for navigation/event payload */
    @api assignedToId;

    /** Assignee display name */
    @api assignedToName;

    /**
     * Fired when the Open button is clicked.
     * Parent can navigate or open the task.
     */
    handleOpen() {
        this.dispatchEvent(
            new CustomEvent('open', {
                bubbles: true,
                composed: true
            })
        );
    }

    /**
     * Fired when the assignee name/link is clicked.
     * Payload: { assignedToId }
     */
    handleAssignedToClick() {
        this.dispatchEvent(
            new CustomEvent('assignedtoclick', {
                bubbles: true,
                composed: true,
                detail: { assignedToId: this.assignedToId }
            })
        );
    }

    /**
     * Fired when Transfer is clicked.
     * Parent can handle transfer flow.
     */
    handleTransfer() {
        this.dispatchEvent(
            new CustomEvent('transfer', {
                bubbles: true,
                composed: true
            })
        );
    }

    /**
     * Fired when View Activity is clicked.
     * Parent can open activity view.
     */
    handleViewActivity() {
        this.dispatchEvent(
            new CustomEvent('viewactivity', {
                bubbles: true,
                composed: true
            })
        );
    }
}
