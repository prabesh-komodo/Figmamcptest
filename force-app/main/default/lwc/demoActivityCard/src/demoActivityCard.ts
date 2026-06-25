import { LightningElement } from 'lwc';

export default class DemoActivityCard extends LightningElement {
    taskTitle: string = 'Due Diligence';
    statusLabel: string = 'Open';
    description: string = 'Follow up on why this request is on the draft state.';
    dueDate: string = '04-24-2025';
    assignedTo: string = 'Dough Feinch';

    handleEdit(): void {
        this.dispatchEvent(new CustomEvent('edit'));
    }

    handleTransfer(): void {
        this.dispatchEvent(new CustomEvent('transfer'));
    }

    handleViewActivity(): void {
        this.dispatchEvent(new CustomEvent('viewactivity'));
    }
}
